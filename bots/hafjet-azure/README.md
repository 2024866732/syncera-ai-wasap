# HAFJET Azure WhatsApp Bot

Cloud-based WhatsApp Business API bot deployed on Azure App Service.

## Architecture

- **Webhook Listener** (`webhook_listener.py`) — Flask server for Meta WhatsApp Cloud API callbacks
- **AI Integration** (`hermes_ai.py`) — OpenRouter AI backend (Gemini 2.0 Flash)
- **Database Repair** (`repair_db.py`) — Utility for fixing broken conversation DBs

## Deployment

- **Platform:** Azure App Service (Linux)
- **Tunnel:** ngrok (Cloudflare Tunnel incompatible with Meta webhook verification)
- **AI Backend:** OpenRouter API (model: google/gemini-2.0-flash-001)

## Setup

1. Copy `.env.example` to `.env` and fill in secrets:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run locally:
   ```bash
   bash start.sh
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `APP_SECRET` | Meta App Secret |
| `VERIFY_TOKEN` | WhatsApp webhook verify token |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENROUTER_MODEL` | AI model to use |
| `PHONE_NUMBER_ID` | WhatsApp Business phone number ID |

## Related

- Main project: [SYNCERA](https://github.com/2024866732/syncera-ai-wasap)
- Company: [HAFJET (M) SDN BHD](https://hafjet.com)
