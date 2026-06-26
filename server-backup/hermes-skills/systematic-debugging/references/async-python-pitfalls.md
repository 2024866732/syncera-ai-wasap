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

## Quick Scan Command

```bash
# Find all potential async blocking issues
grep -n "subprocess\.run\|\.read()\|\.write()\|json\.load\|json\.dump" webhook_listener.py hermes_ai.py

# Find signature bypass patterns
grep -n "or not.*KEY\|or not.*SECRET\|or not.*TOKEN" *.py

# Find overly broad keyword triggers
grep -n 'msg_lower in \[' webhook_listener.py
```
