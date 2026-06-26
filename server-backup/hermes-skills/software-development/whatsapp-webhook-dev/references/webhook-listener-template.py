"""
WhatsApp Cloud API — FastAPI Webhook Listener Template
Copy this file and customize generate_reply() for your bot logic.
"""

import os, sys, json, hashlib, hmac, logging
from datetime import datetime, timezone, timedelta
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

load_dotenv(os.path.expanduser("~/.hermes/.env"))

WHATSAPP_TOKEN=*** ""
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
APP_SECRET=*** "")
WEBHOOK_VERIFY_TOKEN=*** "changeme")

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
app = FastAPI(title="WhatsApp Bot", version="1.0.0")
MYT = timezone(timedelta(hours=8))


@app.get("/webhook")
async def verify_webhook(request: Request):
    params = dict(request.query_params)
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == WEBHOOK_VERIFY_TOKEN:
        return JSONResponse(content=int(params["hub.challenge"]) if params["hub.challenge"].isdigit() else params["hub.challenge"])
    raise HTTPException(403)


@app.post("/webhook")
async def receive_message(request: Request):
    signature = request.headers.get("X-Hub-Signature-256", "")
    body = await request.body()
    if APP_SECRET and not verify_signature(body, signature):
        raise HTTPException(403)
    data = json.loads(body)
    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                await process_message(msg, change["value"])
    return JSONResponse(content={"status": "ok"})


def verify_signature(payload: bytes, signature: str) -> bool:
    if not signature or not APP_SECRET:
        return True
    expected = hmac.new(APP_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


async def process_message(msg: dict, value: dict):
    from_number = msg.get("from", "")
    contacts = value.get("contacts", [])
    sender_name = contacts[0].get("profile", {}).get("name", from_number) if contacts else from_number
    msg_type = msg.get("type", "")
    user_message = ""
    if msg_type == "text":
        user_message = msg.get("text", {}).get("body", "")
    elif msg_type == "interactive":
        i = msg.get("interactive", {})
        user_message = i.get("button_reply", i.get("list_reply", {})).get("id", "")
    elif msg_type == "button":
        user_message = msg.get("button", {}).get("text", "")
    else:
        user_message = "/help"
    reply = await generate_reply(user_message, sender_name, from_number)
    if reply:
        await send_message(from_number, reply)


async def generate_reply(message: str, sender_name: str, sender_number: str) -> str:
    """Replace this with your bot logic (rule-based, AI agent, DB lookup)."""
    msg = message.lower().strip()
    if msg in ["hi", "hello", "halo"]:
        return f"Hi {sender_name}! How can I help?\n\n1️⃣ Option A\n2️⃣ Option B"
    if msg == "1":
        return "Option A selected. Details here..."
    if msg in ["menu", "main"]:
        return "Main Menu:\n1️⃣ Option A\n2️⃣ Option B"
    return f"Sorry, I didn't understand '{message}'. Type *menu* for options."


async def send_message(to_number: str, message: str) -> bool:
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        return False
    url = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_ID}/messages"
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}", "Content-Type": "application/json"}
    payload = {"messaging_product": "whatsapp", "to": to_number, "type": "text", "text": {"body": message}}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            return resp.status_code == 200
    except Exception as e:
        log.error(f"Send error: {e}")
        return False


@app.get("/health")
async def health():
    return {"status": "ok", "configured": bool(WHATSAPP_TOKEN and WHATSAPP_PHONE_ID)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("WEBHOOK_PORT", 8443))
    uvicorn.run("webhook_listener:app", host="0.0.0.0", port=port, reload=False)
