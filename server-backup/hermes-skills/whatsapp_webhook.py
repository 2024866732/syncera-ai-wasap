#!/usr/bin/env python3
"""
whatsapp_webhook.py — HAFJET WhatsApp Webhook Handler

Handles incoming WhatsApp messages via Meta Graph API webhook.
Processes receipt images/PDFs and replies with confirmation.

Deploy as a Flask/FastAPI endpoint or Cloud Function.

Endpoints:
- GET /webhook - Meta verification
- POST /webhook - Incoming messages
"""

import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from flask import Flask, request, jsonify
import requests
from dotenv import load_dotenv

# Import our OCR processor
import sys
sys.path.append(str(Path(__file__).parent))
from receipt_ocr_processor import (
    process_receipt_file, 
    format_whatsapp_reply,
    load_token,
    get_supabase
)

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
META_GRAPH_VERSION = "v18.0"

# Media download directory
MEDIA_DIR = Path("/tmp/hafjet_receipts")
MEDIA_DIR.mkdir(exist_ok=True)

# Authorized sender (optional - restrict to Tuan Hafizi)
AUTHORIZED_SENDER = os.getenv("AUTHORIZED_WHATSAPP_ID")  # e.g., "60198021500"

# ── Flask App ───────────────────────────────────────────────────────
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

def verify_webhook(mode: str, token: str, challenge: str) -> tuple:
    """Verify webhook subscription with Meta."""
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        logger.info("Webhook verified successfully")
        return challenge, 200
    logger.warning("Webhook verification failed")
    return "Forbidden", 403

def download_media(media_id: str, mime_type: str) -> Optional[Path]:
    """Download media from Meta Graph API."""
    url = f"https://graph.facebook.com/{META_GRAPH_VERSION}/{media_id}"
    headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
    
    # Get media URL
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code != 200:
        logger.error(f"Failed to get media URL: {resp.text}")
        return None
    
    media_url = resp.json().get("url")
    if not media_url:
        logger.error("No media URL in response")
        return None
    
    # Download media content
    resp = requests.get(media_url, headers=headers, timeout=60)
    if resp.status_code != 200:
        logger.error(f"Failed to download media: {resp.status_code}")
        return None
    
    # Determine extension
    ext_map = {
        "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
        "application/pdf": ".pdf", "image/heic": ".heic"
    }
    ext = ext_map.get(mime_type, ".bin")
    
    # Save to temp file
    filename = f"receipt_{media_id}{ext}"
    filepath = MEDIA_DIR / filename
    filepath.write_bytes(resp.content)
    
    logger.info(f"Downloaded media to {filepath} ({len(resp.content)} bytes)")
    return filepath

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
    
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code == 200:
        logger.info(f"WhatsApp message sent to {to}")
        return True
    else:
        logger.error(f"Failed to send WhatsApp: {resp.status_code} - {resp.text}")
        return False

def parse_webhook_payload(payload: dict) -> list[IncomingMessage]:
    """Parse Meta webhook payload into IncomingMessage objects."""
    messages = []
    
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []):
                    sender = msg.get("from", "")
                    msg_id = msg.get("id", "")
                    timestamp = datetime.fromtimestamp(int(msg.get("timestamp", 0)))
                    msg_type = msg.get("type", "text")
                    
                    # Get sender name from contacts
                    sender_name = "Unknown"
                    for contact in value.get("contacts", []):
                        if contact.get("wa_id") == sender:
                            sender_name = contact.get("profile", {}).get("name", "Unknown")
                            break
                    
                    incoming = IncomingMessage(
                        message_id=msg_id,
                        sender_id=sender,
                        sender_name=sender_name,
                        timestamp=timestamp
                    )
                    
                    if msg_type == "text":
                        incoming.text = msg.get("text", {}).get("body", "")
                    elif msg_type in ["image", "document"]:
                        media = msg.get(msg_type, {})
                        incoming.media_id = media.get("id")
                        incoming.media_mime_type = media.get("mime_type")
                        incoming.media_filename = media.get("filename")
                    
                    messages.append(incoming)
    except Exception as e:
        logger.error(f"Error parsing webhook payload: {e}")
    
    return messages

def handle_receipt_message(msg: IncomingMessage) -> str:
    """Process receipt image/document and return reply text."""
    if not msg.media_id or not msg.media_mime_type:
        return "❌ Sila hantar gambar resit (jpg/png) atau PDF."
    
    # Check file type
    allowed_types = [
        "image/jpeg", "image/png", "image/webp", "image/heic",
        "application/pdf"
    ]
    if msg.media_mime_type not in allowed_types:
        return f"❌ Format fail tidak disokong: {msg.media_mime_type}. Sila hantar JPG, PNG, WebP, HEIC, atau PDF."
    
    # Download media
    filepath = download_media(msg.media_id, msg.media_mime_type)
    if not filepath:
        return "❌ Gagal muat turun fail. Sila cuba lagi."
    
    try:
        # Process receipt
        result = process_receipt_file(
            str(filepath),
            whatsapp_msg_id=msg.message_id,
            sender_id=msg.sender_id,
            sender_name=msg.sender_name,
            image_url=None  # Could upload to Google Drive here
        )
        
        # Format reply
        reply = format_whatsapp_reply(result)
        return reply
        
    finally:
        # Cleanup temp file
        try:
            filepath.unlink()
        except:
            pass

def handle_text_message(msg: IncomingMessage) -> str:
    """Handle text commands."""
    text = msg.text.strip().lower()
    
    if text in ["/start", "hi", "hello", "hallo", "selamat"]:
        return ("👋 *HAFJET Expense Bot*\n\n"
                "Hantar gambar resit (JPG/PNG/PDF) untuk auto-rekod belanja.\n\n"
                "Perintah:\n"
                "• `/lap` - Lihat laporan bulan ini\n"
                "• `/baki` - Cek baki hidup\n"
                "• `/bantuan` - Tunjuk menu ini")
    
    elif text in ["/lap", "/laporan", "laporan"]:
        return "📊 Laporan P&L akan dihantar pada 1hb setiap bulan. Gunakan `/baki` untuk cek status terkini."
    
    elif text in ["/baki", "/status", "status"]:
        # Quick status - could fetch from tracker
        return ("💰 *Status HAFJET (Kini)*\n\n"
                "Guna dashboard web untuk lihat penuh:\n"
                "🔗 `~/.hermes/reports/pnl_dashboard.html`\n\n"
                "Atau tunggu laporan auto 1hb bulan depan.")
    
    elif text in ["/bantuan", "/help", "help", "menu"]:
        return ("📋 *Menu Bantuan*\n\n"
                "📷 Hantar resit gambar/PDF → Auto rekod belanja\n"
                "📊 `/lap` - Laporan P&L bulan ini\n"
                "💵 `/baki` - Cek baki hidup & hire status\n"
                "❓ `/bantuan` - Tunjuk menu ini")
    
    else:
        return ("🤔 Faham tak. Hantar gambar resit atau taip `/bantuan` untuk menu.")

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
    payload = request.get_json()
    logger.info(f"Received webhook: {json.dumps(payload)[:500]}")
    
    # Acknowledge immediately (Meta requires <20s)
    messages = parse_webhook_payload(payload)
    
    for msg in messages:
        # Optional: authorize sender
        if AUTHORIZED_SENDER and msg.sender_id != AUTHORIZED_SENDER:
            logger.warning(f"Unauthorized sender: {msg.sender_id}")
            continue
        
        # Process based on message type
        if msg.media_id:
            reply_text = handle_receipt_message(msg)
        elif msg.text:
            reply_text = handle_text_message(msg)
        else:
            continue
        
        # Send reply asynchronously (don't block webhook)
        send_whatsapp_message(msg.sender_id, reply_text)
    
    return "OK", 200

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "service": "hafjet-whatsapp-webhook"})

# ── Main ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # For local testing
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)