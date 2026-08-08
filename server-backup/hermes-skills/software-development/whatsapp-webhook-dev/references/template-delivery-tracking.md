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

## SPX Template Mapping

Template names in code MUST match exact Meta-approved names:

```python
_SPX_TEMPLATES = {
    "ready_collection": "spx_ready_pickup",      # Active Meta template
    "final_reminder": "spx_ready_collection3",    # Fallback template
    "first_reminder": "spx_ready_pickup",         # Same as ready_collection
}
```

Update `_check_spx_reminders()` to use smart send:
```python
template_name = _SPX_TEMPLATES.get(next_stage, "spx_ready_pickup")
ok = await send_whatsapp_smart(phone, text,
                               template_name=template_name,
                               template_params=[text])
```

## Cronjob Dashboard Toggle (with Pitfall Fix)

```python
"spx_reminders_enabled": {"type": "bool", "default": "false"},  # SAFETY: default paused

async def _check_spx_reminders():
    if not get_runtime_bool("spx_reminders_enabled", False):
        log.info("[SPX-REMINDER] ⏸ Paused by dashboard toggle")
        return  # paused
```

**⚠ CRITICAL PITFALL:** `get_runtime_bool(key, default=True)` IGNORES DB value "false".
The function only returns `True` when DB value is `"true"/"1"/"yes"` — everything else
(including `"false"` or missing key) returns the Python `default` parameter.
If `default=True` and toggle is set to `"false"` in DB, reminders WILL STILL RUN.

**Fix:** Always pass `default=False` when the desired safe default is OFF:
```python
get_runtime_bool("spx_reminders_enabled", False)  # Safe: default = paused
```

**Toggle via dashboard API:**
```bash
# Pause
curl -X PUT /api/settings -H "X-API-Key: ..." -d '{"spx_reminders_enabled":"false"}'
# Resume (only after verifying template is Meta-approved)
curl -X PUT /api/settings -H "X-API-Key: ..." -d '{"spx_reminders_enabled":"true"}'
```

## Template Test Pattern

Test directly via Meta Graph API (curl) BEFORE relying on cron scheduler:
```bash
curl -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/messages" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"60198021500","type":"template",
       "template":{"name":"spx_ready_pickup","language":{"code":"ms"},
       "components":[{"type":"body","parameters":[
         {"type":"text","text":"NAME"},{"type":"text","text":"TRACKING"}
       ]}]}}'
```

Verify delivery:
```sql
SELECT status, error_code, timestamp FROM message_delivery_status
WHERE customer_phone='60198021500' ORDER BY timestamp DESC LIMIT 5;
```

Expected: `sent` → `delivered` (no error 131047).

## Key Lessons
1. Outbound count ≠ delivery — Meta accepts API call then rejects in callback
2. Callback is THE source of truth for delivery status
3. Session messages outside 24h ALWAYS fail (error 131047)
4. Template messages work anytime but must be Meta-approved
5. Pause toggle saves API calls for cron/automation

## 📊 Data Quality Prerequisite — Phone Numbers Must Be Complete

SPX reminders will silently skip ALL orders if `recipient_phone` contains `***` (masked).

```python
# Line 577 in _check_spx_reminders():
if not phone or "***" in phone:
    skipped_count += 1
    continue  # ← silently skips
```

**Diagnosis query:**
```sql
SELECT COUNT(*), SUM(CASE WHEN recipient_phone LIKE '%*%' THEN 1 ELSE 0 END) as masked
FROM spx_self_collection_orders
WHERE recipient_phone IS NOT NULL AND recipient_phone != '' AND recipient_phone != '-';
```

**Fix:** Phone numbers must be fetched from SPX Self-Collection API (or manual CSV) BEFORE enabling reminders. The `bulk_map_phones()` / `fetch_spx_phone()` workflow must complete.

**Production incident (2026-08-08):** 42 orders had masked phones (`+601****6789`). After enabling reminders, zero messages sent — all skipped silently.

## 🔇 Log Visibility Pitfall — Silent Skip

When ALL orders in a cycle are skipped (no valid phones, `sent_count=0`, `error_count=0`), the cron produces NO log output at all:

```python
# Only fires when sent or errors exist:
if sent_count > 0 or error_count > 0:
    log.info(f"[SPX-REMINDER] Cycle done: sent={sent_count} ...")
```

**Fix (recommended):** Always log cycle summary to confirm the cron is running:
```python
log.info(f"[SPX-REMINDER] Cycle done: sent={sent_count} skipped={skipped_count} ...")
```
