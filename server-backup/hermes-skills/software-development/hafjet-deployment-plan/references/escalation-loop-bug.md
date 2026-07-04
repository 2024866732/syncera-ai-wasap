# Bug: `loop2` Undefined in Escalation Path (Silent Failure)

## Context
Sprint v2.1.1, HAFJET WhatsApp Bot. After fixing the `get_current_staff` forward-reference bug, webhook POST `/webhook` with escalation keyword "tolong" returned `{"status":"ok"}` but the conversation status remained `bot_active` (no escalation happened). No traceback appeared in container logs.

## Root Cause
In `webhook_listener.py` → `_process_message()` (line ~535), the escalation block used an undefined variable `loop2`:

```python
# Line 535 — WRONG
await loop2.run_in_executor(None, update_conversation_status, from_number, "escalated")
```

The correct event-loop variable was defined earlier in the same function at line 503 as `loop_db`:

```python
# Line 503 — CORRECT
loop_db = asyncio.get_event_loop()
cust = await loop_db.run_in_executor(None, get_customer_detail, from_number)
```

The `NameError: name 'loop2' is not defined` was raised inside the webhook's broad `try/except` block (lines 350-358), which catches all exceptions, logs the error (with `exc_info=True`), and returns a generic 200 response:

```python
try:
    await _process_message(msg, value)
except Exception as e:
    log.error(f"❌ Error processing webhook: {e}", exc_info=True)
    # Returns 200 anyway — caller sees success!
```

This produced a **silent failure**: the webhook appeared successful to WhatsApp, but no DB update occurred and no escalation reply was sent.

## Detection Pattern

1. **Webhook returns 200 but DB state unchanged** — Send a test webhook with an escalation keyword, then check `/api/customers/{phone}`. If `status` is still `bot_active`, escalation failed silently.
2. **Container logs show NO traceback** — Because the exception is caught and logged, not propagated. The only signal is the log line `❌ Error processing webhook:` with the traceback hidden in the container stream (which may be 0 bytes for crash-looping containers).
3. **Local reproduction:** `python3 -c "from webhook_listener import app"` only catches import-time errors. Runtime bugs like `loop2` only manifest when the function is actually called. To catch them, add an explicit smoke test:

```python
# test_smoke.py
import asyncio
from webhook_listener import _process_message
asyncio.run(_process_message({"type":"text","id":"test1","from":"60198021500","text":{"body":"tolong"}}, {"contacts":[{"profile":{"name":"Test"}}]}))
```

## Fix

```python
# Line 535 — BEFORE
await loop2.run_in_executor(None, update_conversation_status, from_number, "escalated")

# AFTER
await loop_db.run_in_executor(None, update_conversation_status, from_number, "escalated")
```

Also verify all other places in `_process_message()` that use `loop_db` are consistent. After the fix, the webhook should:
1. Update customer status to `escalated`
2. Set `bot_paused=1`
3. Trigger `_notify_staff()` task
4. Send escalation reply to customer
5. Return from function early (before AI routing)

## Prevention

- **Audit event-loop variable names** — `_process_message()` is ~150 lines long. Use a consistent name (`loop_db`) throughout. Never introduce aliases like `loop2`, `l`, or `_loop` without renaming the original.
- **Add smoke tests for escalation path** — Unit tests calling `_process_message()` with a known escalation keyword should catch undefined variables before deploy.
- **Do not swallow exceptions silently in webhook entrypoint** — Consider logging a metric or incrementing a counter when `_process_message` raises, so silent failures are detectable via `/api/stats`.
