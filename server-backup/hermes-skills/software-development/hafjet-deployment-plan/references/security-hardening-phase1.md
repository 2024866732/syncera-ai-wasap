# Security Hardening — Phase 1 (Pre-Production)

**Date:** 2026-06-27
**Status:** Code written, deployed, pending B1 verification

## What Phase 1 Covers

1. Webhook signature verification — fail closed
2. Write-route API key protection — X-API-Key header
3. Targeted log masking — SecureFormatter

## Change 1: Webhook Signature Fail-Closed

**File:** `webhook_listener.py`, in `receive_message()` (POST /webhook)

```python
# BEFORE (broken — silently skips if APP_SECRET empty):
if APP_SECRET and not _verify_signature(body, signature):
    raise HTTPException(status_code=403, detail="Invalid signature")

# AFTER (fail closed):
if not APP_SECRET:
    log.error("❌ APP_SECRET not configured — rejecting webhook")
    raise HTTPException(status_code=500, detail="Server misconfigured")
if not signature:
    client = request.client.host if request.client else "unknown"
    log.warning(f"❌ Missing X-Hub-Signature-256 from {client}")
    raise HTTPException(status_code=403, detail="Missing signature")
if not _verify_signature(body, signature):
    client = request.client.host if request.client else "unknown"
    log.warning(f"❌ Invalid webhook signature from {client}")
    raise HTTPException(status_code=403, detail="Invalid signature")
```

## Change 2: Webhook Log Summary (No Payload)

```python
# BEFORE (leaks phone numbers, message content):
log.info(f"📩 Webhook received: {json.dumps(data, indent=2)[:500]}")

# AFTER (summary only):
_entry_count = len(data.get("entry", []))
_msg_count = sum(
    len(c.get("value", {}).get("messages", []))
    for e in data.get("entry", [])
    for c in e.get("changes", [])
)
log.info(f"📩 Webhook: {_entry_count} entry, {_msg_count} msg")
```

## Change 3: SecureFormatter (Targeted Masking)

```python
import re as _re

class SecureFormatter(logging.Formatter):
    """Targeted masking: only known sensitive patterns."""
    _PATTERNS = [
        (_re.compile(r'EAAdm4[A-Za-z0-9_-]{20,}'), 'EAAdm4***'),
        (_re.compile(r'(?:token|key|secret|password|api_key)=([^\s&]{8,})', _re.I), r'\1=***'),
        (_re.compile(r'(?<!["\w])(\+?60\d{8,11})(?!["\w])'), '***'),
    ]
    def format(self, record):
        msg = super().format(record)
        for pattern, replacement in self._PATTERNS:
            msg = pattern.sub(replacement, msg)
        return msg
```

Apply to stdout handler only (file handler gets full logs for debugging).

## Change 4: Write-Route API Key Middleware

```python
DASHBOARD_API_KEY=*** "")

_PROTECTED_PREFIXES = ["/api/settings", "/api/customers/"]

@app.middleware("http")
async def protect_sensitive_routes(request: Request, call_next):
    if not DASHBOARD_API_KEY:
        return JSONResponse(status_code=500, content={"error": "Server misconfigured: DASHBOARD_API_KEY not set"})
    path = request.url.path
    method = request.method
    _is_protected = False
    for prefix in _PROTECTED_PREFIXES:
        if path.startswith(prefix):
            if prefix == "/api/settings":
                _is_protected = True
                break
            if method in ("POST", "PUT", "PATCH", "DELETE"):
                _is_protected = True
                break
    if _is_protected:
        provided = request.headers.get("X-API-Key", "")
        if provided != DASHBOARD_API_KEY:
            client = request.client.host if request.client else "unknown"
            log.warning(f"🔒 Auth failed: {method} {path} from {client}")
            return JSONResponse(status_code=401, content={"error": "Invalid or missing X-API-Key"})
    return await call_next(request)
```

**Route classification:**
- `/api/settings` — ALL methods protected
- `/api/customers/*` — only POST/PUT/PATCH/DELETE protected
- `/api/stats`, `/api/customers` (GET), `/api/messages*` — open

## Change 5: Frontend Header Update

**File:** `dashboard/src/api/api.js` — add to ALL POST/PUT functions:
```javascript
headers: { 'Content-Type': 'application/json', 'X-API-Key': import.meta.env.VITE_API_KEY || '' }
```

**File:** `dashboard/src/components/Settings.jsx` — add to inline fetches:
```javascript
headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || '' }
```

## Change 6: Vite Build-Time Env Injection

**File:** `deploy.sh` — add before ZIP creation:
```python
vite_api_key = os.environ.get("VITE_API_KEY", "")
if vite_api_key:
    env = os.environ.copy()
    env["VITE_API_KEY"] = vite_api_key
    subprocess.run(["npm", "run", "build"], cwd=os.path.join(BASE, "dashboard"), env=env, ...)
```

**Why:** `import.meta.env.VITE_API_KEY` is baked into JS at build time. Must be present during `npm run build`.

## CRITICAL BUG: JSONResponse vs HTTPException

```python
# WRONG — crashes with TypeError:
return JSONResponse(status_code=401, detail={"error": "..."})

# CORRECT:
return JSONResponse(status_code=401, content={"error": "..."})
```

`JSONResponse.__init__()` takes `content`, not `detail`. `detail` is for `HTTPException`. This bug causes ALL requests to return 500 because the middleware itself crashes.

## Verification Checklist

After deploy, test ALL of:
- `GET /health` → 200
- `GET /dashboard` → 200 HTML
- `GET /api/stats` → 200 (no key needed)
- `GET /api/customers` → 200 (no key needed)
- `PUT /api/settings` (no key) → 401
- `PUT /api/settings` (wrong key) → 401
- `PUT /api/settings` (correct key) → 200
- `POST /webhook` (valid sig) → 200
- `POST /webhook` (invalid sig) → 403
- `POST /webhook` (missing sig) → 403
