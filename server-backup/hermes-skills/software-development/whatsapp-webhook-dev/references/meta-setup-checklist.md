# Meta WhatsApp Cloud API — Setup Checklist

## Prerequisites
- Facebook/Meta personal account
- Phone number for WhatsApp Business
- Server with public IP/domain + SSL (or ngrok tunnel)

## Steps

### 1. Business Account
business.facebook.com → Create Account

### 2. Developer Account
developers.facebook.com → log in → verify

### 3. Create App
My Apps → Create App → Business → Add WhatsApp → Set Up

### 4. Register Phone
WhatsApp → API Setup → Add phone → +60 → verify SMS/call

### 5. Generate Token
API Setup → Generate token → PERMANENT → copy
Store: `WHATSAPP_ACCESS_TOKEN=*** in .env

### 6. Credentials (IMPORTANT: All from the SAME app/WABA)

| Credential | Env Variable | Location | Purpose |
|---|---|---|---|
| Access Token | `WHATSAPP_ACCESS_TOKEN` | API Setup → Generate | Auth for all API calls |
| Phone Number ID | `WHATSAPP_PHONE_ID` | API Setup (under phone number) | Send messages: `POST /v21.0/{phone_id}/messages` |
| App Secret | `WHATSAPP_APP_SECRET` | Settings → Basic | Webhook signature verification |
| WABA ID | `WHATSAPP_BUSINESS_ACCOUNT_ID` | API Setup → WABA info | Account-level operations |

**⚠️ CRITICAL:** Phone Number ID and Access Token must be from the **same Meta app and WABA**. After adding a payment method or regenerating tokens, Meta may create a new WABA. Always verify the Phone Number ID matches the token's WABA.

**⚠️ WABA ID ≠ Phone Number ID:** These are different identifiers. WABA ID identifies the business account; Phone Number ID identifies the specific phone number.

### 7. Webhook
Configuration → Edit → Callback URL → Verify Token → Save
Subscribe to: messages

**⚠️ Use ngrok for the Callback URL** — Cloudflare Tunnel (`trycloudflare.com`) will always fail Meta verification due to interstitial pages.

### 8. Test
Message business number → check logs → verify reply

## Key Notes
- API version: v21.0+
- 24h reply window
- Phone can't use regular WhatsApp
- Local testing: `ngrok http 8443 --config ~/.config/ngrok/ngrok.yml`
- **Token regeneration may change WABA association** — always re-check Phone Number ID after regenerating tokens
