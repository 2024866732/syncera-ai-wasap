# SPX Reminder Backend Pitfalls

Discovered during 2026-08-08 debugging session. These are backend-side issues in `webhook_listener.py` and `spx_followup.py`.

## Bug 1: Wrong Column Name — `reminder_status` vs `hafjet_reminder_state`

**Location:** `_check_spx_reminders()` in `webhook_listener.py` (~line 572)

**Before (broken):**
```python
"followup_stage": order.get("reminder_status", "none"),
```

**After (fixed):**
```python
"followup_stage": order.get("hafjet_reminder_state", "none"),
```

**Impact:** `reminder_status` column does not exist in `spx_self_collection_orders`. The actual column is `hafjet_reminder_state`. Using the wrong column name means ALL orders default to `followup_stage = "none"`, making `determine_followup()` always start from stage 0 — anti-duplicate logic is completely bypassed.

## Bug 2: Missing `_SPX_TEMPLATES` Keys

**Location:** `_SPX_TEMPLATES` dict in `webhook_listener.py`

**Before (broken — only 3 keys):**
```python
_SPX_TEMPLATES = {
    "ready_collection": "spx_ready_pickup",
    "final_reminder": "spx_ready_collection3",
    "first_reminder": "spx_ready_pickup",
}
```

**After (fixed — 8 keys):**
```python
_SPX_TEMPLATES = {
    "ready_collection": "spx_ready_pickup",
    "final_reminder": "spx_ready_collection3",
    "first_reminder": "spx_ready_pickup",
    "collection_failed": "spx_ready_pickup",
    "remind1": "spx_ready_pickup",
    "remind2": "spx_ready_pickup",
    "remind3": "spx_ready_pickup",
    "remind4": "spx_ready_pickup",
}
```

**Impact:** When `determine_followup()` returns `"collection_failed"`, `_SPX_TEMPLATES.get("collection_failed", "spx_ready_collection")` falls back to `"spx_ready_collection"` which is NOT a registered Meta template. All reminders silently fail with unknown template errors from Meta (no delivery_status entry created).

## Bug 3: Wrong Template for `collection_failed` → `spx_ready_collection3` Not Active

**Location:** Temporary state during fix iteration

**Impact:** `spx_ready_collection3` was mapped for `collection_failed` but this template was NOT active at Meta. Only `spx_ready_pickup` is active. Fixed by mapping ALL stages to `spx_ready_pickup`.

## Bug 4: `is_paused=1` Blocks Orders Silently

**Location:** `get_spx_due_orders()` in `db_logger.py` (~line 1594)

```sql
WHERE hafjet_reminder_state NOT IN ('Completed', 'CollectionFailed')
  AND is_paused = 0
  AND recipient_phone IS NOT NULL
  AND recipient_phone != ''
```

**Impact:** Orders with `is_paused = 1` are silently excluded from `get_spx_due_orders()`. No log message, no error — just zero reminders. Check `is_paused` column if orders mysteriously skip processing.

## Bug 5: `CollectionFailed` vs `collection_failed` — Case Sensitivity

**Location:** `get_spx_due_orders()` filter

The filter `NOT IN ('Completed', 'CollectionFailed')` uses PascalCase. But `hafjet_reminder_state` values from `determine_followup()` are `snake_case` (`"collection_failed"`). Due to case mismatch, `"collection_failed"` does NOT match `'CollectionFailed'` — so orders with `collection_failed` state are NOT excluded from due orders. This is fortuitous (orders get another chance to be re-evaluated), but fragile.

## Bug 6: Cron Logs Nothing When Zero Orders Sent

**Location:** `_check_spx_reminders()` log summary

```python
# Only log summary if we actually did something
if sent_count > 0 or error_count > 0:
    log.info(...)
```

**Impact:** When all orders are skipped (no phone, paused, terminal status), there is ZERO log output. The cron appears to not have fired. Debugging requires checking container logs for "Running job" entries rather than "SPX-REMINDER" entries.

## Bug 7: 504 Gateway Timeout on Phone Fetch

**Location:** `POST /api/spx/fetch-phones`

**Impact:** Fetching 42 phone numbers takes >230 seconds. Azure gateway kills the HTTP connection with 504. BUT the server-side processing continues in the background. The DB updates complete despite the 504. Always check DB state after a 504 — the operation may have succeeded.

## Bug 8: `template_params=[text]` — Full Text Instead of Individual Params

**Location:** `_check_spx_reminders()` in `webhook_listener.py` (~line 590)

**Before (broken):**
```python
text = _build_reminder_text(order, next_stage)
ok = await send_whatsapp_smart(phone, text, template_name=template_name, template_params=[text])
```

**After (fixed):**
```python
text = _build_reminder_text(order, next_stage)  # for logging only
template_params = [
    str(order.get("recipient_name", "Customer")),
    str(order.get("spx_tracking_number", "?"))
]
ok = await send_whatsapp_smart(phone, text, template_name=template_name, template_params=template_params)
```

**Impact:** `send_whatsapp_template()` sends `template_params` as individual body parameters. The Meta template `spx_ready_pickup` expects 2 parameters (name + tracking number). Passing the full reminder text as a single parameter causes Meta to reject the template — the template body has `{{1}}` and `{{2}}` slots, not `{{1}}` only. Result: "WhatsApp FAILED" log, 0 reminders delivered, error_count=5, but NO delivery_status entries because Meta never accepted the message.

**Diagnosis:** Manual test with `curl` using 2 params succeeds (HTTP 200, accepted). Cron with `[text]` (1 param) fails silently. Check Meta template body parameter count before wiring up `template_params`.

## Debugging Checklist

When SPX reminders produce zero messages:

1. `spx_reminders_enabled` = `"true"` in `bot_settings` ✓
2. `get_spx_due_orders()` returns orders — check `is_paused=0`, `hafjet_reminder_state NOT IN (...)` ✓
3. Phones are REAL — `INSTR(recipient_phone, '*') = 0` ✓
4. `_SPX_TEMPLATES` has keys for ALL stages returned by `determine_followup()` ✓
5. Template name in `_SPX_TEMPLATES` value IS active at Meta ✓
6. `hafjet_reminder_state` column used, NOT `reminder_status` ✓
7. Container log shows "Running job" for `_check_spx_reminders` ✓
8. Delivery status entries in `message_delivery_status` table ✓
