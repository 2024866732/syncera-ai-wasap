# AI/LLM API Logging and Fallback Pattern

When integrating external LLM APIs (e.g., OpenRouter, Hermes CLI) in a service, always implement:

## 1. Request Logging
- Log timestamp at start of request.
- Log payload (model, base_url, timeout) – mask sensitive keys (show only last 6 chars).
- Log HTTP status code and raw response body (truncate to first 500 chars) before JSON parsing.
- Log request duration.

## 2. Configuration Verification
- Verify API key exists and is non‑empty (log last 6 chars only).
- Confirm model name and base URL (ensure `/v1` present).
- Set explicit timeout (e.g., 30s) to avoid hanging.

## 3. Response Handling
- Wrap API call in try/except; log full traceback on exception.
- If response status is not 2xx, treat as failure. **Log specific status codes:**
  - `401` = API key invalid or revoked
  - `402` = account needs top-up
  - `404` = model name doesn't exist (most common for free tiers)
  - `429` = rate limited (common for `:free` models) — return fallback, don't retry
- If JSON parsing fails, log error and treat as failure.
- If `choices` array missing or empty, treat as empty response.
- If parsed content is empty/None, treat as failure.

## 3a. Async/Sync Await Detection

When debugging LLM API integration in async webhook handlers (FastAPI):

**Bug:** `await sync_function(...)` where `sync_function` is a regular `def` (not `async def`).

**Symptom:** `TypeError: 'str' object is not awaitable` at runtime. The exception propagates to FastAPI's catch-all handler which returns HTTP 200 `{"status":"ok"}` — but **no WhatsApp reply is sent**. Classic silent message drop.

**Detection:**
```bash
# List functions that might be called with await
grep -n "^def " hermes_ai.py webhook_listener.py
grep -n "^async def " hermes_ai.py webhook_listener.py
grep -n "await " webhook_listener.py
```
Any `await` on a function listed only under `^def ` (not `^async def`) is a bug.

**Fix:** Use `loop.run_in_executor()` to call sync functions from async context:
```python
loop = asyncio.get_event_loop()
try:
    result = await loop.run_in_executor(None, sync_function, arg1, arg2)
except Exception as e:
    log.error(f"Exception: {e}", exc_info=True)
    result = None
```

## 4. Fallback Mechanism
- On any failure (exception, bad status, empty/None), return a predefined fallback message:
  ```
  Maaf, sistem sibuk sekejap. Untuk bantuan segera WhatsApp admin:
  +60 16-980 8736 (https://hafjetraub.wasap.my/)
  ```
- Log the reason for falling back (empty, exception, bad status).

## 5. Testing
- Send a sample free‑text message (e.g., "berapa harga repair screen?").
- Verify logs show the full request/response cycle.
- Confirm fallback is used when API is mis‑configured.
- After fixing config, ensure AI responses are grounded in `system_prompt.txt` + `business_info.txt`.

## 6. Knowledge Base Update (post‑test)
If the test passes with real API key, update:
- `business_info.txt` (location, hours, phone, Google Maps link)
- Ensure no placeholder brackets remain in static menu handlers.
- Validate that `SOUL_CONTEXT` in `hermes_ai.py` is built from the two files.