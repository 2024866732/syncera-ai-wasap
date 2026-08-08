# WhatsApp Cloud API — 24-Hour Window & Template Messages

**Discovered:** 2026-08-04 during SPX reminder delivery diagnosis  
**Agent:** Hermes-HAFJET (DeepSeek v4 Pro)

---

## Root Cause: Error 131047

All outbound session messages fail when sent to customers whose last inbound is > 24 hours. Meta Graph API **accepts** (HTTP 200) but the delivery callback returns `status: failed, code: 131047, title: "Re-engagement message"`.

**Symptoms:**
- Analytics: outbound count high, delivered count = 0
- Logs: `❌ Delivery FAILED: code=131047, title=Re-engagement message`
- DB: `message_delivery_status` table: 100% failed, all with error 131047

---

## Solution Architecture

### 1. Check 24h Window (`_check_24h_window()`)

```python
async def _check_24h_window(phone: str) -> bool:
    cust = await get_customer_detail(phone)
    if not cust or not cust.get("last_contact"):
        return False
    delta = datetime.utcnow() - parse_dt(cust["last_contact"])
    return delta.total_seconds() < 86400  # 24 hours
```

### 2. Template Message (`send_whatsapp_template()`)

```python
async def send_whatsapp_template(to_number, template_name, body_params=None):
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "ms"},
        },
    }
    if body_params:
        payload["template"]["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": p[:300]} for p in body_params],
        }]
    # POST to graph.facebook.com/v21.0/{PHONE_ID}/messages
```

### 3. Smart Router (`send_whatsapp_smart()`)

```python
async def send_whatsapp_smart(to_number, session_text, template_name=None, template_params=None):
    within = await _check_24h_window(to_number)
    if within:
        return await send_whatsapp_message(to_number, session_text)  # type: text
    elif template_name:
        return await send_whatsapp_template(to_number, template_name, template_params)  # type: template
    else:
        return False  # skip — no fallback available
```

---

## SPX Reminder Integration

**Template names registered in Meta Business Manager (active):**

| Stage | Template Name | Content |
|---|---|---|
| `ready_collection` | `spx_ready_pickup` | Parcel sudah sedia untuk diambil |
| `final_reminder` | `spx_ready_collection3` | Amaran akhir, parcel akan dipulangkan |
| `first_reminder` | `spx_ready_pickup` | Parcel dalam perjalanan |

**Toggle:** `spx_reminders_enabled` (bool, default `false`) in `bot_settings` → `PUT /api/settings`

**Pause method:**
```bash
curl -X PUT "https://APP.azurewebsites.net/api/settings" \
  -H "X-API-Key: $DASHBOARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"spx_reminders_enabled": "false"}'
```

---

## Delivery Status Checking

The `message_delivery_status` table stores every WhatsApp Cloud API status callback:

```sql
SELECT status, COUNT(*) FROM message_delivery_status GROUP BY status;
```

**Healthy state:** `delivered` + `read` should dominate. If `failed` = 100%, check for 131047.

---

## Key Rules

- ✅ Session messages (`type: text`) — **only within 24h** of last customer inbound
- ✅ Template messages (`type: template`) — any time, must be Meta-approved, max 4 per 24h
- ✅ Always call `_check_24h_window()` before session sends
- ❌ Never send session messages to cold/old customers without checking
- ❌ SPX reminders should use `send_whatsapp_smart()` not `send_whatsapp_message()` directly
