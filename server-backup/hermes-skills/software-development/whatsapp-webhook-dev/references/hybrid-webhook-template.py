"""
Hybrid WhatsApp Webhook Template
================================
Full working FastAPI webhook with:
- Hybrid AI + Static Menu + Database routing
- HMAC signature verification
- Job ID detection and status lookup
- Ngrok-ready (port 8443)

Usage:
1. Copy to your project directory
2. Set environment variables in ~/.hermes/.env
3. Start ngrok: ngrok http 8443 --config ~/.config/ngrok/ngrok.yml
4. Run: python3 webhook_listener.py
"""

import os
import sys
import json
import hashlib
import hmac
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

# ── Load Config ─────────────────────────────────────────────────────
load_dotenv(os.path.expanduser("~/.hermes/.env"))

WHATSAPP_TOKEN=os.get...N", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
APP_SECRET=os.get...T", "")
WEBHOOK_VERIFY_TOKEN=os.get...N", "your_verify_token_here")

# ── Logging ─────────────────────────────────────────────────────────
os.makedirs(os.path.expanduser("~/.hermes/logs"), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.expanduser("~/.hermes/logs/webhook.log")),
    ],
)
log = logging.getLogger("whatsapp-bot")

# ── FastAPI App ─────────────────────────────────────────────────────
app = FastAPI(title="WhatsApp Bot", version="2.0.0")
MYT = timezone(timedelta(hours=8))


# ═══════════════════════════════════════════════════════════════════
#  WEBHOOK ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@app.get("/webhook")
async def verify_webhook(request: Request):
    """Meta verification — return hub.challenge if token matches."""
    params = dict(request.query_params)
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == WEBHOOK_VERIFY_TOKEN:
        log.info("✅ Webhook verified")
        return JSONResponse(content=int(challenge) if challenge.isdigit() else challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@app.post("/webhook")
async def receive_message(request: Request):
    """Receive incoming WhatsApp messages."""
    signature = request.headers.get("X-Hub-Signature-256", "")
    body = await request.body()

    if APP_SECRET and not _verify_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    data = json.loads(body)
    try:
        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []):
                    await _process_message(msg, value)
    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)

    return JSONResponse(content={"status": "ok"})


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "configured": bool(WHATSAPP_TOKEN and WHATSAPP_PHONE_ID),
        "timestamp": datetime.now(MYT).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
#  MESSAGE PROCESSING
# ═══════════════════════════════════════════════════════════════════

def _verify_signature(payload: bytes, signature: str) -> bool:
    if not signature or not APP_SECRET:
        return True
    expected = hmac.new(APP_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


async def _process_message(msg: dict, value: dict):
    msg_type = msg.get("type", "")
    from_number = msg.get("from", "")
    contacts = value.get("contacts", [])
    sender_name = contacts[0].get("profile", {}).get("name", from_number) if contacts else from_number

    user_message = _extract_message(msg, msg_type)
    if not user_message:
        return

    reply = await generate_reply(user_message, sender_name, from_number)
    if reply:
        await send_whatsapp_message(from_number, reply)


def _extract_message(msg: dict, msg_type: str) -> str:
    if msg_type == "text":
        return msg.get("text", {}).get("body", "")
    elif msg_type == "interactive":
        interactive = msg.get("interactive", {})
        if interactive.get("type") == "button_reply":
            return interactive.get("button_reply", {}).get("id", "")
        elif interactive.get("type") == "list_reply":
            return interactive.get("list_reply", {}).get("id", "")
    elif msg_type == "button":
        return msg.get("button", {}).get("text", "")
    return ""


# ═══════════════════════════════════════════════════════════════════
#  HYBRID REPLY GENERATOR
# ═══════════════════════════════════════════════════════════════════

async def generate_reply(message: str, sender_name: str, sender_number: str) -> str:
    """
    Three-tier routing:
    1. Job ID → database lookup
    2. Static menu → instant reply
    3. Everything else → AI (with fallback)
    """
    msg_lower = message.lower().strip()

    # Tier 1: Job ID check
    if _is_job_id(message):
        job_id = message.strip().upper().replace(" ", "")
        job = _mock_job_lookup(job_id)
        if job:
            return _format_job_status(job)
        return f"❌ Job tidak dijumpai: {job_id}\n\nSila semak semula No. Job anda."

    # Tier 2: Static menu
    reply = _static_menu_handler(msg_lower, sender_name)
    if reply:
        return reply

    # Tier 3: AI (replace with your AI integration)
    # ai_reply = await ask_hermes(message, sender_name)
    # if ai_reply:
    #     return ai_reply

    # Fallback
    return (
        f"Terima kasih {sender_name}! 😊\n\n"
        f"Sila pilih dari menu:\n"
        f"1️⃣ Semak harga\n"
        f"2️⃣ Semak status job\n"
        f"3️⃣ Hubungi staff\n\n"
        f"Tulis *menu* untuk paparan menu."
    )


def _is_job_id(message: str) -> bool:
    cleaned = message.strip().upper().replace(" ", "")
    if cleaned.startswith("JOB-") and len(cleaned) >= 8:
        return True
    if cleaned.startswith("RECEIPT-") and len(cleaned) >= 12:
        return True
    if cleaned.isdigit() and 3 <= len(cleaned) <= 5:
        return True
    return False


def _static_menu_handler(msg_lower: str, sender_name: str) -> Optional[str]:
    """Handle static menu items. Returns None if not a static item."""
    greetings = ["hi", "hello", "hey", "halo", "selamat pagi", "selamat petang"]
    if msg_lower in greetings:
        return (
            f"👋 Selamat datang!\n\n"
            f"Apa yang boleh saya bantu?\n\n"
            f"1️⃣ Semak harga\n"
            f"2️⃣ Semak status job\n"
            f"3️⃣ Hubungi staff\n\n"
            f"Tulis *1*, *2* atau *3* untuk pilih."
        )

    if msg_lower in ["1", "1️⃣", "harga"]:
        return "🔧 *Harga*\n\n• Item A — RM100\n• Item B — RM200\n\nTulis *menu* untuk kembali."

    if msg_lower in ["2", "2️⃣", "status", "job"]:
        return "📋 *Semak Status Job*\n\nSila masukkan No. Job anda.\nContoh: *JOB-2026-001*"

    if msg_lower in ["3", "3️⃣", "staff", "hubungi"]:
        return "📞 *Hubungi Kami*\n\n📞 Telefon: [NOMBOR]\n📍 Alamat: [ALAMAT]"

    if msg_lower in ["menu", "main", "balik"]:
        return (
            "📋 *Menu Utama*\n\n"
            "1️⃣ Semak harga\n"
            "2️⃣ Semak status job\n"
            "3️⃣ Hubungi staff\n\n"
            "Tulis *1*, *2* atau *3* untuk pilih."
        )

    if msg_lower in ["/help", "help", "bantu"]:
        return "ℹ️ *Bantuan*\n\nTulis *menu* untuk paparan menu."

    return None


# ═══════════════════════════════════════════════════════════════════
#  MOCK DATABASE (Replace with real DB)
# ═══════════════════════════════════════════════════════════════════

MOCK_JOBS = {
    "JOB-2026-001": {
        "job_id": "JOB-2026-001",
        "device": "iPhone 14 Pro",
        "issue": "Skrin retak",
        "status_text": "✅ Siap — boleh diambil",
        "cost": 280.00,
        "estimated_completion": "2026-06-20",
    },
    "JOB-2026-002": {
        "job_id": "JOB-2026-002",
        "device": "Samsung Galaxy S24",
        "issue": "Battery cepat habis",
        "status_text": "🔧 Dalam proses repair",
        "cost": 150.00,
        "estimated_completion": "2026-06-23",
    },
}


def _mock_job_lookup(job_id: str) -> Optional[dict]:
    """Replace with actual database lookup."""
    return MOCK_JOBS.get(job_id)


def _format_job_status(job: dict) -> str:
    lines = [
        f"📋 *Status Job: {job['job_id']}*",
        f"📱 Peranti: {job['device']}",
        f"🔧 Isu: {job['issue']}",
        f"📊 Status: {job['status_text']}",
    ]
    if job.get("cost"):
        lines.append(f"💰 Kos: RM {job['cost']:.2f}")
    if job.get("estimated_completion"):
        lines.append(f"📅 Anggaran siap: {job['estimated_completion']}")
    lines.append("")
    lines.append("Tulis *menu* untuk kembali ke menu utama.")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════
#  WHATSAPP API — SEND MESSAGE
# ═══════════════════════════════════════════════════════════════════

async def send_whatsapp_message(to_number: str, message: str):
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        log.error("WhatsApp credentials not configured!")
        return False

    url = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": message, "preview_url": False},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                log.info(f"✅ Reply sent to {to_number}")
                return True
            log.error(f"❌ Send failed: {resp.status_code} — {resp.text}")
            return False
    except Exception as e:
        log.error(f"❌ Send error: {e}", exc_info=True)
        return False


# ═══════════════════════════════════════════════════════════════════
#  RUN
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("WEBHOOK_PORT", 8443))
    log.info(f"🚀 Starting WhatsApp Bot on port {port}")
    uvicorn.run("webhook_listener:app", host="0.0.0.0", port=port, log_level="info")
