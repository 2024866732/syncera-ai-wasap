# SPX Server-Side Operations — Phone Fetch & Reminder Workflow

## SPX Phone Fetch (`POST /api/spx/fetch-phones`)

Endpoint: `POST https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/fetch-phones`

- **Auth:** JWT Bearer token (`Depends(get_current_staff)`)
- **Requires valid SPX cookies** in `spx_session` table — if expired, returns `SPX_SESSION_EXPIRED`
- **Often returns 504 Gateway Timeout** — Azure gateway kills the HTTP connection after ~230s, but processing continues server-side
- **DO NOT re-trigger immediately** after 504 — wait and check DB first

### Refresh SPX cookies (Tuan must do)

1. Login to SPX Self-Collection Dashboard in browser
2. F12 → Application → Cookies → copy all cookies
3. HAFJET Dashboard → SPX Config → paste cookies → Save
4. Hermes triggers `POST /api/spx/fetch-phones`

### Verify results — Kudu Escaping Pitfall

SQLite queries through Kudu `POST /api/command` with `LIKE '%*%'` or `GLOB '*[*]*'` fail due to shell escaping. Use Python scripts uploaded via VFS instead:

```python
# Upload via: curl -X PUT KUDU_VFS/check.py
import sqlite3
conn = sqlite3.connect('/home/data/bot_data.db')
masked = conn.execute("SELECT COUNT(*) FROM spx_self_collection_orders WHERE INSTR(recipient_phone, '*') > 0").fetchone()[0]
valid  = conn.execute("SELECT COUNT(*) FROM spx_self_collection_orders WHERE recipient_phone IS NOT NULL AND recipient_phone != '' AND INSTR(recipient_phone, '*') = 0").fetchone()[0]
print(f"masked={masked} valid={valid}")
```

**Success:** `masked=0` — asterisks gone, phones full.

## SPX Reminder Toggle

Enable/disable via dashboard settings API (no restart needed):

```bash
# Enable
curl -X PUT "https://hafjet-whatsapp-bot.azurewebsites.net/api/settings" \
  -H "X-API-Key: <KEY>" -H "Content-Type: application/json" \
  -d '{"spx_reminders_enabled": "true"}'

# Disable
curl -X PUT "..." -d '{"spx_reminders_enabled": "false"}'
```

**Safety:** `get_runtime_bool("spx_reminders_enabled", False)` — Python default MUST be `False`. If `True`, DB `"false"` is ignored because the function only returns `True` for DB values `"true"/"1"/"yes"`.

## WhatsApp Template (spx_ready_pickup)

Category: Utility → Shipping update, Language: ms (Bahasa Melayu)
Variables: `{{1}}` (name), `{{2}}` (tracking)

Test direct:
```bash
curl -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/messages" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"60198021500","type":"template","template":{"name":"spx_ready_pickup","language":{"code":"ms"},"components":[{"type":"body","parameters":[{"type":"text","text":"Tuan Hafizi"},{"type":"text","text":"SPX-TEST-001"}]}]}}'
```

## 24h Window & Smart Send

- `send_whatsapp_smart(phone, text, template_name, template_params)` — auto session vs template
- `_check_24h_window(phone)` → `customers.last_contact` < 24h → True
- Error 131047 = "Re-engagement message" — session text outside 24h, use template
- Delivery status: `accepted` → `sent` → `delivered` → `read` (table: `message_delivery_status`)

## SPX Reminder Debugging — Common Bugs (2026-08-08)

### Bug 1: Wrong column name for followup stage

**Symptom:** All followup stages reset to "none" every cycle. Anti-duplicate broken.

**Root cause:** `_check_spx_reminders()` in `webhook_listener.py` used:
```python
"followup_stage": order.get("reminder_status", "none")
```

But the actual DB column is `hafjet_reminder_state`, not `reminder_status`. Fix:
```python
"followup_stage": order.get("hafjet_reminder_state", "none")
```

### Bug 2: Missing template keys in `_SPX_TEMPLATES`

**Symptom:** Template fallback to non-existent `"spx_ready_collection"` for stages like `collection_failed`, `remind1`-`remind4`.

**Root cause:** `_SPX_TEMPLATES` in `webhook_listener.py` only had 3 keys (`ready_collection`, `final_reminder`, `first_reminder`). Stages returned by `determine_followup()` (e.g. `collection_failed`, `remind1`) had no mapping → fallback to `"spx_ready_collection"` which does NOT exist at Meta.

**Fix:** Map ALL stages to active templates:
```python
_SPX_TEMPLATES = {
    "ready_collection": "spx_ready_pickup",
    "final_reminder": "spx_ready_collection3",
    "first_reminder": "spx_ready_pickup",
    "collection_failed": "spx_ready_pickup",   # ← was missing
    "remind1": "spx_ready_pickup",               # ← was missing
    "remind2": "spx_ready_pickup",               # ← was missing
    "remind3": "spx_ready_pickup",               # ← was missing
    "remind4": "spx_ready_pickup",               # ← was missing
}
```

### Bug 3: collection_failed → wrong active template

**Symptom:** Even after adding `collection_failed` key, mapped to `spx_ready_collection3` which is NOT active at Meta. Only `spx_ready_pickup` is approved.

**Fix:** `"collection_failed": "spx_ready_pickup"` (not `spx_ready_collection3`).

### Bug 4: Kudu display masks digits in phone output

**Symptom:** DB values look like `+601****6789` in Kudu output, but `INSTR(recipient_phone, '*') = 0` returns 0. Contradictory.

**Root cause:** Kudu/curl output pipeline substitutes middle digits with `****` for privacy. The actual DB values are full numbers.

**Verification:** Use `hex(recipient_phone)` to confirm:
```python
row = conn.execute("SELECT recipient_phone, hex(recipient_phone) FROM ...").fetchone()
# hex 2B3630313233343536373839 = "+60123456789" — NO asterisks
```

### Bug 5: template_params=[text] — full message sent as 1 param

**Symptom:** `send_whatsapp_smart()` returns False for stage=remind1. Log: `[SPX-REMINDER] SPXMY...: WhatsApp FAILED stage=remind1`. Zero delivery entries.

**Root cause:** In `_check_spx_reminders()`:
```python
ok = await send_whatsapp_smart(phone, text, template_name=template_name, template_params=[text])
```
`template_params=[text]` passes the FULL reminder message (e.g. "Salam Teh Pau Choo, parcel anda...") as ONE parameter. Meta template `spx_ready_pickup` expects **2 structured parameters**: `{{1}}` = name, `{{2}}` = tracking. 1 param where 2 expected → Meta rejects → no delivery.

**Fix:**
```python
template_params = [
    str(order.get("recipient_name", "Customer")),
    str(order.get("spx_tracking_number", "?"))
]
ok = await send_whatsapp_smart(phone, text, template_name=template_name, template_params=template_params)
```

**Verified:** Direct curl with 2 params → HTTP 200 → sent → delivered → read.

### determine_followup() flow for Return_Outbound

For `spx_status = "Return_Outbound"` with `hafjet_reminder_state = "Pending"`:

1. `_is_terminal("return_outbound")` → False (not in `{collected, returned, cancelled}`)
2. `_DIRECT_STATUS_MAP` match → none (no keyword matches)
3. Fallback by `collect_by_date` → days_left < 0 → `fallback_stage = "collection_failed"`
4. Anti-duplicate: `_stage_index("pending") < _stage_index("collection_failed")` → passes
5. Returns `("collection_failed", "template_collection_failed")`

After fix: `_SPX_TEMPLATES["collection_failed"]` → `"spx_ready_pickup"` → sent to WhatsApp.

