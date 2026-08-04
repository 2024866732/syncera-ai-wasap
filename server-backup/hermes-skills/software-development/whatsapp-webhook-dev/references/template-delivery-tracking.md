# WhatsApp Template Messages + Delivery Tracking

## Error 131047 — Root Cause & Diagnosis

**Symptom:** Outbound count tinggi (bot reports "sent"), tapi customer zero terima.

**Root cause:** Meta error 131047 = "Re-engagement message". Session message (`type: text`)
dihantar di luar 24-hour customer service window. WhatsApp Cloud API:
- **Accept** request (HTTP 200) → outbound count naik
- **Reject delivery** → callback status `failed`, code `131047`

**Diagnosis query:**
```sql
SELECT status, COUNT(*) FROM message_delivery_status GROUP BY status;
```
Jika semua `failed` dengan code 131047 → confirmed: semua outbound adalah session message
di luar 24h window.

## 24-Hour Window Check

```python
async def _check_24h_window(phone: str) -> bool:
    """Return True if customer.last_contact is within 24 hours."""
    cust = await loop.run_in_executor(None, get_customer_detail, phone)
    if not cust:
        return False
    last_str = cust.get("last_contact", "")
    if not last_str:
        return False
    last_dt = datetime.fromisoformat(last_str.replace(" ", "T"))
    if not last_dt:
        return False
    delta = datetime.utcnow() - last_dt.replace(tzinfo=None)
    return delta.total_seconds() < 86400
```

## Template Message Sending (type: template)

```python
async def send_whatsapp_template(to_number: str, template_name: str,
                                  body_params: list = None) -> bool:
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {"name": template_name, "language": {"code": "ms"}},
    }
    if body_params:
        payload["template"]["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": p[:300]} for p in body_params],
        }]
    # POST to /v21.0/{phone_id}/messages
```

## Smart Send — Auto-Route

```python
async def send_whatsapp_smart(to_number, session_text, template_name=None,
                               template_params=None):
    if await _check_24h_window(to_number):
        return await send_whatsapp_message(to_number, session_text)
    elif template_name:
        return await send_whatsapp_template(to_number, template_name, template_params)
    else:
        return False  # Skip — outside 24h + no template
```

## Delivery Status Webhook

```python
# In POST /webhook:
for status in value.get("statuses", []):
    await _process_status_callback(status)

async def _process_status_callback(status: dict):
    wamid = status.get("id", "")
    msg_status = status.get("status", "")
    error_code = error_title = None
    if msg_status == "failed":
        errs = status.get("errors", [])
        if errs:
            error_code = errs[0].get("code")
            error_title = errs[0].get("title")
    save_delivery_status(wamid, status.get("recipient_id"), msg_status,
                         error_code, error_title, None, status.get("timestamp"))
```

## Database: message_delivery_status

```sql
CREATE TABLE message_delivery_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wamid VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20),
    status VARCHAR(20) NOT NULL,  -- sent, delivered, read, failed
    error_code VARCHAR(50), error_title TEXT, error_message TEXT,
    timestamp TIMESTAMP DEFAULT (datetime('now')), meta_timestamp BIGINT
);
```

## Cronjob Dashboard Toggle

```python
"spx_reminders_enabled": {"type": "bool", "default": "true"},  # in VALID_SETTINGS

async def _check_spx_reminders():
    if not get_runtime_bool("spx_reminders_enabled", True):
        return  # paused
```

## Key Lessons
1. Outbound count ≠ delivery — Meta accepts API call then rejects in callback
2. Callback is THE source of truth for delivery status
3. Session messages outside 24h ALWAYS fail (error 131047)
4. Template messages work anytime but must be Meta-approved
5. Pause toggle saves API calls for cron/automation
