# Outbound Alert Endpoints (CCTV / machine-triggered WhatsApp)

Pattern from HAFJET Fasa A CCTV alert (2026-08-05): a NON-Meta webhook endpoint that
forwards machine events (Frigate person detection, cron jobs, sensors) to a WhatsApp
owner. This is a distinct class from the Meta customer webhook.

## Architecture

```
Office PC poller (every 2 min, cron)
  → queries Frigate DB read-only for new person events (score≥0.55)
  → POST JSON to bot  /cctv-alert  with X-CCTV-Token header
Bot (Azure FastAPI):
  /cctv-alert → verify token → build message → send_whatsapp_smart()
  → Meta Cloud API → owner's WhatsApp
```

## Critical: 131047 — alert sends are ALWAYS outside the 24h window

Meta 131047 ("Re-engagement message") fires for ANY `type: text` session message sent
more than 24h after the recipient's LAST inbound message. An automated alert to the
OWNER (e.g. Tuan, who rarely messages the bot) is by definition outside the window —
even though the send API returns HTTP 200 (`sent=True`), Meta drops delivery in the
delivery-status callback.

**Diagnosis (proof, not hearsay):**
```sql
-- bot_data.db (download via Kudu VFS)
SELECT wamid, status, error_code, error_title, timestamp
FROM message_delivery_status WHERE customer_phone='60198021500'
ORDER BY rowid DESC LIMIT 5;
-- If 100% 'failed' / 131047 → confirmed. ALL outbound (not just CCTV) is broken
-- because nobody's inbound refreshed the window.
```

**The `sent=True` trap:** poller/script logs "sent OK" because the API accepted the
request. Delivery callbacks (`statuses` in the Meta webhook) are the ONLY source of
truth — never claim delivery success from the send return value.

## Fix — template messages + smart send

Templates work ANYTIME (no 24h restriction). Create in Meta WhatsApp Manager →
Message Templates (category **Utility**, language `ms` — Utility auto-approves fast).
Body with placeholders: `🛎️ Customer masuk kedai — Kamera: {{1}} pada {{2}}`

```python
async def send_whatsapp_template(to_number, template_name, body_params=None, lang="ms"):
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {"name": template_name, "language": {"code": lang}},
    }
    if body_params:
        payload["template"]["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)[:300]} for p in body_params],
        }]
    # POST https://graph.facebook.com/v21.0/{phone_id}/messages

async def send_whatsapp_smart(to_number, session_text, template_name=None, template_params=None):
    # 1. try 24h window (db_logger get_customer_detail last_contact < 86400s) → session text
    # 2. else if template_name → send_whatsapp_template
    # 3. else skip + log (never claim sent)
```

Wire the alert endpoint to `send_whatsapp_smart` so it auto-routes: session text when
the owner recently messaged, template otherwise.

## Other gotchas hit

- **WABA ID ≠ Phone Number ID:** `GET /{phone_id}/message_templates` fails
  (`(#100) Tried accessing nonexisting field`). Templates live under the WABA:
  `GET /v22.0/{waba_id}/message_templates`. Find WABA via Meta Business Manager
  (Dashboard → WhatsApp → API Setup); it is NOT reliably discoverable through the
  Graph API with a messaging token (granular_scopes targets come back empty).
- **Endpooint auth:** `X-CCTV-Token` header vs env `CCTV_ALERT_TOKEN`; 403 if mismatch.
  Skip send if `CCTV_ALERT_ENABLED != true` (kill-switch without redeploy).
- **Cooldown** in the poller (e.g. 300s) so a burst of Frigate events = 1 WhatsApp
  alert, not spam.
- **Owner target:** reuse `AUTHORIZED_WHATSAPP_ID` from the bot env (60198021500).
- **Quick test while template pending:** have the owner send ANY message to the bot —
  opens a fresh 24h window so the next session-text alert lands. Temporary only.
