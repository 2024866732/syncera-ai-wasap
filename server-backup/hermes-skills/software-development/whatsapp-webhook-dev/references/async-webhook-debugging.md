# Async Webhook Debugging — Security, Performance & Logic Audit

Systematic approach to auditing async Python webhook listeners (FastAPI + httpx) for production deployment.

## Audit Categories

### 1. Security

| Check | Pattern | Risk |
|-------|---------|------|
| Signature verification bypass | `if not APP_SECRET: return True` | Anyone can POST fake webhooks |
| Empty secret fallback | `if not signature or not secret: return True` | Silent security disable |
| Hardcoded credentials | Token in source code | Leak via git history |
| Missing HTTPS enforcement | No TLS check | MITM attacks |

**Correct pattern:**
```python
def _verify_signature(payload: bytes, signature: str) -> bool:
    if not APP_SECRET:
        log.error("APP_SECRET not configured!")
        return False  # ← Never return True when secret is missing
    if not signature:
        return False
    expected = hmac.new(APP_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

### 2. Performance (Event Loop Blocking)

| Check | Anti-pattern | Fix |
|-------|-------------|-----|
| Sync file I/O in async handler | `json.load(open(...))` directly in async func | `await loop.run_in_executor(None, sync_func, ...)` |
| `subprocess.run()` in async func | `subprocess.run([...], timeout=30)` | `await asyncio.create_subprocess_exec(...)` |
| Sync DB queries in async handler | Direct SQLite/JSON read in request path | `run_in_executor` or async DB driver |

**Correct pattern:**
```python
# In async handler:
loop = asyncio.get_event_loop()
job = await loop.run_in_executor(None, check_repair_status, job_id)
```

```python
# Instead of subprocess.run():
proc = await asyncio.create_subprocess_exec(
    CMD, arg1, arg2,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
```

### 3. Logic (Routing & State)

| Check | Anti-pattern | Fix |
|-------|-------------|-----|
| Overly broad keyword triggers | `"repair"` matches "battery repair shop" | Use exact phrases only: `"semak harga"`, `"harga repair"` |
| Dead code imports | `from x import y, z` where z is unused | Remove unused import |
| Missing `cd` in startup command | `gunicorn ... module:app` without `cd /path` | `cd /path/to/bot && gunicorn ...` |
| Static triggers not synced | Greeting in static handler but not in `should_use_ai()` | Duplicate detection in both layers |

**Keyword trigger principle:** Only use standalone words that are unambiguous menu commands. Avoid single common words like `"repair"`, `"job"`, `"status"`, `"contact"` — use multi-word phrases instead.

## Telegram DM Topic Debugging

When one Telegram DM topic is stuck (messages pending/no reply) while another works:

### Session ID Format
```
agent:main:telegram:dm:{chat_id}:{thread_id}
```

### Diagnostic Steps

1. **List all topics and their status:**
   ```bash
   grep "Renamed DM topic" gateway.log
   ```

2. **Check message delivery for stuck topic:**
   ```bash
   grep "{thread_id}" gateway.log | grep "Flushing\|error\|fail"
   ```

3. **Check for flood control (Telegram rate limit):**
   ```bash
   grep "Flood control\|RetryAfter" gateway.log
   ```

4. **Check cron job delivery errors:**
   ```bash
   grep "DM topic delivery requires a reply anchor" errors.log
   ```

5. **Check session cache eviction (idle timeout):**
   ```bash
   grep "Agent cache idle-TTL evict" gateway.log | grep {thread_id}
   ```

### Common Causes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Clock icon on message (Telegram mobile) | Message stuck in client-side "sending" state — never reached Telegram servers | Pull-to-refresh chat, resend. Not a Hermes/server issue. |
| "DM topic delivery requires a reply anchor" | Cron job deliver target is a DM topic, not main chat | Set cron deliver to `origin` (main chat) or specify correct thread_id |
| "Flood control exceeded" | Too many messages to one topic in short time | Reduce message frequency, increase batching |
| "Agent cache idle-TTL evict" | Topic idle for >60min, session evicted from memory | Normal — next message creates new session |
| Messages stuck in "pending" | Subagent process still running | Check `Process proc_XXX finished` in logs |
| One topic works, another doesn't | Different session state or thread_id routing issue | Compare session logs side-by-side |

### Cron Job Topic Delivery

Cron jobs with `deliver: "origin"` send to the chat's main thread. If `origin` has a `thread_id` set, delivery may fail with "requires a reply anchor". 

**Fix:** Either:
- Remove `thread_id` from cron job origin (deliver to main chat)
- Or set `deliver` to target the correct platform:chat_id:thread_id explicitly
