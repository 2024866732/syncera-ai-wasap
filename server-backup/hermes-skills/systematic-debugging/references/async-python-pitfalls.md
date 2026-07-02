# Async Python Pitfalls in Webhook Handlers

Quick reference for blocking-operation bugs in FastAPI/async Python contexts.
Use when debugging webhook listeners, API servers, or async message handlers.

## Pattern 1: Sync File I/O in Async Context

### Symptom
Event loop stalls under concurrent load; requests queue waiting for DB file read.

### Detection
```python
# Find sync file calls inside async functions
grep -n "open(" *.py | grep -v "async"
grep -n "json.load\|json.dump" *.py
```

### Fix
```python
import asyncio

# Before (blocks event loop):
job = check_repair_status(job_id)

# After (runs sync function in thread pool):
loop = asyncio.get_event_loop()
job = await loop.run_in_executor(None, check_repair_status, job_id)
```

### Applies to
- `json.load` / `json.dump`
- `open` with `f.read()` / `f.write()`
- SQLAlchemy sync queries in async FastAPI routes
- Any ORM with sync driver

## Pattern 2: subprocess.run in Async Function

### Symptom
All webhook requests block while waiting for CLI command to complete.

### Fix
```python
import asyncio

# Before:
result = subprocess.run([CLI, "ask", prompt], capture_output=True, text=True, timeout=30)

# After:
proc = await asyncio.create_subprocess_exec(
    CLI, "ask", "--no-stream", prompt,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
stdout, stderr = await asyncio.wait_for(
    proc.communicate(), timeout=30
)
```

Note: Use `asyncio.wait_for` — `timeout=` kwarg on `communicate()` doesn't exist in stdlib.

## Pattern 3: Signature Verification Bypass

### Symptom
Security check silently passes when env var is missing.

### Detection
```python
# Find "or not" patterns in verification functions:
grep -n "or not.*SECRET\|or not.*KEY" *.py
```

### Fix
```python
# Before (bypasses when secret missing):
if not signature or not APP_SECRET:
    return True  # ❌ DANGEROUS

# After (always require secret):
if not APP_SECRET:
    log.error("APP_SECRET not configured!")
    return False
if not signature:
    return False
```

### Why it matters
In cloud deployments (Azure, GCP), env vars might not be set if configuration is incomplete. Always fail-closed.

## Pattern 4: Overly Broad Keyword Triggers

### Symptom
User messages routed to wrong handler because substring match is too greedy.

### Detection
```python
# Static menu triggers with standalone words:
static_triggers = ["repair", "job", "status", "contact"]
```

### Test cases that break
- "battery repair shop near me" → matches "repair" (wrong route)
- "do you have job vacancies" → matches "job" (wrong route)
- "contact person for delivery" → matches "contact" (wrong route)

### Fix
Use phrase-level triggers or exact-match keywords:
```python
# Specific phrases only:
static_triggers = ["semak status", "status job", "semak harga", "hubungi"]
```

Or use `startswith` with full prefix:
```python
if msg_lower.startswith("job-"):
    return False  # Only Job ID format
```

## Pattern 5: `await` on Sync Function (Non-Coroutine)

### Symptom
Silent message drop in webhook handlers. Bot works for keyword-triggered menu items but **never replies** to free-text messages. No reply is sent, only a logger warning about an unexpected exception.

### Root Cause
Calling `await sync_func(...)` where `sync_func()` is a **regular `def`** (not `async def`). Python evaluates the call, then tries to `await` the returned value (string, None, dict, etc.) — raising `TypeError: 'str' object is not awaitable` (or similar).

### Detection

**Step 1:** Find every `await` call and verify the target is actually `async def`:

```bash
# List all async defs
grep -n "^async def " webhook_listener.py hermes_ai.py db_logger.py

# List all sync defs
grep -n "^def " webhook_listener.py hermes_ai.py db_logger.py | grep -v "^def __\|# "

# Find every await call
grep -n "await " webhook_listener.py
```

**Step 2:** Cross-reference each `await X(...)` call against the function definitions:
- `await async_func(...)` — ✅ correct (async defines exist)
- `await sync_func(...)` — ❌ BUG (will crash at runtime)

### Fix

```python
import asyncio

# BEFORE (broken — TypeError at runtime):
ai_reply = await ask_hermes(message, sender_name)

# AFTER (correct — runs sync function in executor):
loop = asyncio.get_event_loop()
try:
    ai_reply = await loop.run_in_executor(None, ask_hermes, message, sender_name)
except Exception as e:
    log.error(f"Ai exception: {e}", exc_info=True)
    ai_reply = None
```

### Why it happens
A developer makes `generate_reply()` async (because it awaits async helpers like `send_whatsapp_message`), then naively adds `await ask_hermes(...)` assuming it's also async. Import-time inspection of `async def` vs `def` would reveal the mismatch immediately.

### Real-world impact
This was the root cause of the HAFJET WhatsApp bot's "silent 500 / no response" for free-text messages. Menu items (1/2/3/4) returned before STEP 5 and worked fine, but every free-text question triggered the TypeError and silently dropped the reply.

## Quick Scan Command

```bash
# Find all potential async blocking issues
grep -n "subprocess\\.run\\|\\.read()\\|\\.write()\\|json\\.load\\|json\\.dump" webhook_listener.py hermes_ai.py

# Find signature bypass patterns
grep -n "or not.*KEY\\|or not.*SECRET\\|or not.*TOKEN" *.py

# Find overly broad keyword triggers
grep -n 'msg_lower in \\[' webhook_listener.py

# Find 'await on sync function' bugs (cross-reference with ^def, not ^async def)
grep -n "await " webhook_listener.py | grep -v "run_in_executor\|asyncio\." | grep -v "get_stats\|log_inbound\|log_outbound\|get_recent\|get_customer\|send_whatsapp\|websocket\|call_next\|request\.body\|client\.post"
```
