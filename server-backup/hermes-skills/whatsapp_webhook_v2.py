#!/usr/bin/env python3
"""
whatsapp_webhook_v2.py — HAFJET WhatsApp Webhook (Production Hardened)

Key improvements:
- Idempotent processing via whatsapp_message_id UNIQUE constraint
- Retry logic for media download (exponential backoff)
- Structured error handling with fallback messages
- Monitoring counters for failures
- Meta verification and health endpoints
- Rate limiting per sender

Deploy: gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 -w 2 --timeout 120
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field
from collections import defaultdict

from flask import Flask, request, jsonify
import requests
from dotenv import load_dotenv

import sys
sys.path.append(str(Path(__file__).parent))
from receipt_ocr_processor_v2 import (
    process_receipt_file,
    format_whatsapp_reply
)

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
AUTHORIZED_WHATSAPP_ID = os.getenv("AUTHORIZED_WHATSAPP_ID")
META_GRAPH_VERSION = "v22.0"  # latest stable

MEDIA_DIR = Path("/tmp/hafjet_receipts")
MEDIA_DIR.mkdir(exist_ok=True)

MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds (exponential: 2, 4, 8)
MEDIA_DOWNLOAD_TIMEOUT = 45
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 10     # messages per window per sender

# ── Logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# ── Monitoring Counters ─────────────────────────────────────────────
class Monitor:
    """Thread-safe-ish in-memory counters (reset on restart)."""
    def __init__(self):
        self.counts = defaultdict(int)
        self.errors = defaultdict(list)
        self.last_health = {}
    
    def inc(self, key):
        self.counts[key] += 1
    
    def err(self, key, msg):
        self.errors[key].append({"time": time.time(), "msg": str(msg)[:200]})
        if len(self.errors[key]) > 50:
            self.errors[key] = self.errors[key][-50:]
    
    def snapshot(self):
        return {
            "counts": dict(self.counts),
            "recent_errors": {k: v[-5:] for k, v in self.errors.items()},
            "uptime_since": getattr(self, 'start_time', time.time())
        }

monitor = Monitor()
monitor.start_time = time.time()

# ── Rate Limiter ────────────────────────────────────────────────────
class RateLimiter:
    def __init__(self):
        self.windows = defaultdict(list)
    
    def check(self, sender_id: str) -> bool:
        now = time.time()
        window = self.windows[sender_id]
        # Remove old entries
        window[:] = [t for t in window if now - t < RATE_LIMIT_WINDOW]
        if len(window) >= RATE_LIMIT_MAX:
            return False
        window.append(now)
        return True
    
    def remaining(self, sender_id: str) -> int:
        return RATE_LIMIT_MAX - len(self.windows[sender_id])

rate_limiter = RateLimiter()

# ── Flask App ───────────────────────────────────────────────────────
app = Flask(__name__)

@dataclass
class IncomingMessage:
    message_id: str
    sender_id: str
    sender_name: str
    timestamp: datetime
    text: Optional[str] = None
    media_id: Optional[str] = None
    media_mime_type: Optional[str] = None
    media_filename: Optional[str] = None

# ── Webhook Verification ────────────────────────────────────────────
def verify_webhook(mode: str, token: str, challenge: str) -> tuple:
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        logger.info("✅ Webhook verified")
        return challenge, 200
    logger.warning(f"❌ Webhook verification failed: mode={mode}")
    return "Forbidden", 403

# ── Media Download with Retry ───────────────────────────────────────
def download_media(media_id: str, mime_type: str) -> Optional[Path]:
    """Download media with exponential backoff retry."""
    # Step 1: Get media URL
    url = f"https://graph.facebook.com/{META_GRAPH_VERSION}/{media_id}"
    headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=headers, timeout=20)
            if resp.status_code == 200:
                media_url = resp.json().get("url")
                if media_url:
                    break
            elif resp.status_code == 401:
                logger.error("WhatsApp token expired!")
                monitor.err("auth_expired", "WhatsApp token 401")
                return None
            elif resp.status_code == 429:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(f"Rate limited, retrying in {delay}s...")
                time.sleep(delay)
        except Exception as e:
            logger.warning(f"Attempt {attempt+1} failed: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
    
    if 'media_url' not in locals():
        monitor.err("media_url_fetch_failed", f"media_id={media_id}")
        return None
    
    # Step 2: Download media content
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(media_url, headers=headers, timeout=MEDIA_DOWNLOAD_TIMEOUT)
            if resp.status_code == 200:
                break
        except Exception as e:
            logger.warning(f"Download attempt {attempt+1} failed: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY * (2 ** attempt))
    else:
        monitor.err("media_download_failed", f"media_id={media_id}")
        return None
    
    # Determine extension
    ext_map = {
        "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
        "application/pdf": ".pdf", "image/heic": ".heic"
    }
    ext = ext_map.get(mime_type, ".bin")
    
    filepath = MEDIA_DIR / f"receipt_{media_id}{ext}"
    filepath.write_bytes(resp.content)
    logger.info(f"Downloaded {len(resp.content)} bytes → {filepath.name}")
    return filepath

# ── WhatsApp Message Sending ────────────────────────────────────────
def send_whatsapp_message(to: str, text: str) -> bool:
    """Send text message via WhatsApp Cloud API."""
    url = f"https://graph.facebook.com/{META_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text}
    }
    
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        if resp.status_code == 200:
            monitor.inc("messages_sent")
            return True
        else:
            logger.error(f"Send failed {resp.status_code}: {resp.text[:200]}")
            monitor.err("message_send_failed", resp.text[:200])
            return False
    except Exception as e:
        logger.error(f"Send error: {e}")
        monitor.err("message_send_error", str(e))
        return False

# ── Webhook Payload Parsing ─────────────────────────────────────────
def parse_webhook_payload(payload: dict) -> list:
    messages = []
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []):
                    sender = msg.get("from", "")
                    msg_id = msg.get("id", "")
                    ts = datetime.fromtimestamp(int(msg.get("timestamp", 0)))
                    msg_type = msg.get("type", "text")
                    
                    sender_name = "Unknown"
                    for contact in value.get("contacts", []):
                        if contact.get("wa_id") == sender:
                            sender_name = contact.get("profile", {}).get("name", "Unknown")
                            break
                    
                    incoming = IncomingMessage(
                        message_id=msg_id,
                        sender_id=sender,
                        sender_name=sender_name,
                        timestamp=ts
                    )
                    
                    if msg_type == "text":
                        incoming.text = msg.get("text", {}).get("body", "")
                    elif msg_type in ("image", "document"):
                        media = msg.get(msg_type, {})
                        incoming.media_id = media.get("id")
                        incoming.media_mime_type = media.get("mime_type")
                        incoming.media_filename = media.get("filename")
                    
                    messages.append(incoming)
    except Exception as e:
        logger.error(f"Parse error: {e}")
    
    return messages

# ── Message Handlers ────────────────────────────────────────────────
def handle_receipt_message(msg: IncomingMessage) -> str:
    """Process receipt with idempotency via message_id."""
    monitor.inc("receipts_received")
    
    if not msg.media_id or not msg.media_mime_type:
        return "❌ Sila hantar gambar resit (JPG/PNG) atau PDF, bukan mesej teks."
    
    allowed = ("image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf")
    if msg.media_mime_type not in allowed:
        return f"❌ Format {msg.media_mime_type} tak disokong. Sila guna JPG, PNG, atau PDF."
    
    # Download media with retry
    filepath = download_media(msg.media_id, msg.media_mime_type)
    if not filepath:
        return "❌ Gagal muat turun fail. Server mungkin sibuk — cuba lagi dalam 1 minit."
    
    try:
        result = process_receipt_file(
            str(filepath),
            whatsapp_msg_id=msg.message_id,
            sender_id=msg.sender_id,
            sender_name=msg.sender_name
        )
        
        if result.success:
            monitor.inc("receipts_processed")
        else:
            monitor.inc("receipts_failed")
            monitor.err("ocr_failed", result.error or "unknown")
        
        return format_whatsapp_reply(result)
    
    except Exception as e:
        logger.error(f"Receipt handling error: {e}", exc_info=True)
        monitor.err("receipt_exception", str(e))
        monitor.inc("receipts_failed")
        return "❌ Ralat teknikal semasa proses resit. Admin akan semak."
    
    finally:
        try:
            filepath.unlink()
        except:
            pass

def handle_text_message(msg: IncomingMessage) -> str:
    """Handle text commands."""
    text = msg.text.strip().lower() if msg.text else ""
    
    if text in ("/start", "hi", "hello", "hallo", "selamat", "assalam", "salam"):
        return ("👋 *HAFJET Expense Bot*\n\n"
                "Hantar gambar resit (JPG, PNG, PDF) terus ke sini.\n"
                "Sistem akan auto-ekstrak dan rekod.\n\n"
                "📋 *Perintah:*\n"
                "• `/baki` — Cek status kewangan\n"
                "• `/bantuan` — Tunjuk menu ni")
    
    elif text in ("/baki", "/status"):
        return ("💰 *Status HAFJET*\n\n"
                "Laporan penuh akan dihantar auto pada 1hb setiap bulan.\n"
                "Untuk dashboard live, buka fail:\n"
                "🔗 `~/.hermes/reports/pnl_dashboard_v2.html`")
    
    elif text in ("/bantuan", "/help", "menu"):
        return ("📋 *Menu*\n\n"
                "📷 Hantar resit → Auto rekod\n"
                "💵 `/baki` → Status terkini\n"
                "❓ `/bantuan` → Menu ni")
    
    else:
        return "🤔 Maaf, tak faham. Hantar gambar resit atau taip `/bantuan`."

# ── Routes ──────────────────────────────────────────────────────────
@app.route("/webhook", methods=["GET"])
def webhook_verify():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")
    response, status = verify_webhook(mode, token, challenge)
    return response, status

@app.route("/webhook", methods=["POST"])
def webhook_receive():
    try:
        payload = request.get_json(force=True)
    except:
        return "Invalid JSON", 400
    
    messages = parse_webhook_payload(payload)
    
    for msg in messages:
        # Authorization check
        if AUTHORIZED_WHATSAPP_ID and msg.sender_id != AUTHORIZED_WHATSAPP_ID:
            logger.warning(f"Unauthorized sender: {msg.sender_id}")
            monitor.inc("unauthorized_messages")
            continue
        
        # Rate limit
        if not rate_limiter.check(msg.sender_id):
            logger.warning(f"Rate limited: {msg.sender_id}")
            monitor.inc("rate_limited")
            continue
        
        # Route to handler
        if msg.media_id:
            reply = handle_receipt_message(msg)
        elif msg.text:
            reply = handle_text_message(msg)
        else:
            continue
        
        send_whatsapp_message(msg.sender_id, reply)
    
    return "OK", 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "hafjet-whatsapp-webhook-v2",
        "monitor": monitor.snapshot()
    })

@app.route("/monitor", methods=["GET"])
def monitor_endpoint():
    """Return monitoring data (protect with token in production)."""
    return jsonify(monitor.snapshot())

# ── Main ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    
    # Verify prerequisites
    logger.info(f"Media dir: {MEDIA_DIR}")
    for key in ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]:
        if not os.getenv(key):
            logger.warning(f"⚠ {key} not set!")
    
    logger.info(f"Starting webhook on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
