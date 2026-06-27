# Security Hardening Audit — HAFJET WhatsApp Bot

**Date:** 2026-06-27
**Scope:** webhook_listener.py v2.1 — rate limiting, auth, logging, alerting
**Method:** Static code audit against OWASP API Security Top 10 + Meta webhook security guidelines

---

## 1. Rate Limiting — ABSENT (CRITICAL)

**Finding:** No rate limiting on any endpoint. All routes accept unlimited requests.

**Risk:** AI API cost blowout, SQLite lock contention, CPU exhaustion on F1.

**Recommended approach:** In-memory sliding window middleware (no external dependency, works on single-instance F1/B1).

```python
import time as _time
from collections import defaultdict

_RATE_LIMIT = defaultdict(list)  # key = ip:route, value = [timestamps]

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    route = request.url.path
    key = f"{client_ip}:{route}"
    now = _time.time()
    
    # Route-specific limits (max_requests, window_seconds)
    limits = {
        "/webhook": (30, 60),
        "/ws": (5, 60),
    }
    # Default for /api/* and /dashboard*
    if route.startswith("/api/"):
        max_req, window = (30, 60) if request.method in ("POST", "PUT") else (60, 60)
    elif route.startswith("/dashboard"):
        max_req, window = (60, 60)
    elif route == "/health":
        max_req, window = (120, 60)
    else:
        max_req, window = (60, 60)
    
    # Purge old entries
    _RATE_LIMIT[key] = [t for t in _RATE_LIMIT[key] if now - t < window]
    
    if len(_RATE_LIMIT[key]) >= max_req:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded"},
            headers={"Retry-After": str(window)}
        )
    _RATE_LIMIT[key].append(now)
    
    response = await call_next(request)
    return response
```

| Route | Max | Window | Rationale |
|-------|-----|--------|-----------|
| `/webhook` POST | 30 | 60s | Meta sends ~10-20/s per number |
| `/api/*` GET | 60 | 60s | Dashboard polling |
| `/api/*` POST/PUT | 30 | 60s | Operator actions |
| `/dashboard*` | 60 | 60s | Static asset fetches |
| `/ws` | 5 | 60s | WebSocket connections |
| `/health` | 120 | 60s | Health check polling |

**Note:** In-memory store resets on deploy. For multi-instance (B2+), use Redis or DB-backed rate limiting.

---

## 2. Dashboard API Authentication — ABSENT (CRITICAL)

**Finding:** All `/api/*` routes (settings, customer data, manual reply) are completely unauthenticated.

**Risk:** Anyone with the URL can read all customer messages, send messages as the bot, modify settings.

**Recommended approach:** Static API key via middleware.

```python
DASHBOARD_API_KEY = os.getenv("DASHBOARD_API_KEY", "")

@app.middleware("http")
async def require_api_key(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        provided = request.headers.get("X-API-Key", "")
        if not DASHBOARD_API_KEY or provided != DASHBOARD_API_KEY:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or missing X-API-Key"}
            )
    response = await call_next(request)
    return response
```

**Set the key:**
```bash
# Azure
az webapp config appsettings set -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --settings DASHBOARD_API_KEY="$(openssl rand -hex 32)"

# Heroku
heroku config:set DASHBOARD_API_KEY="$(openssl rand -hex 32)"
```

**Dashboard frontend must include the key in all API calls:**
```js
fetch('/api/customers', { headers: { 'X-API-Key': DASHBOARD_API_KEY } })
```

---

## 3. Webhook Signature — Conditional Bypass (HIGH)

**Current code (line 184):**
```python
if APP_SECRET and not _verify_signature(body, signature):
```

**Problem:** When `APP_SECRET` is empty, the entire check is skipped. The `_verify_signature` function already returns `False` when secret is empty, but the outer `if APP_SECRET` prevents it from even being called.

**Fix:** Always verify; fail closed:
```python
if not APP_SECRET:
    log.error("APP_SECRET not set — rejecting webhook")
    raise HTTPException(status_code=500, detail="Server misconfigured")

if not signature:
    log.warning("Missing X-Hub-Signature-256 header")
    raise HTTPException(status_code=403, detail="Missing signature")

if not _verify_signature(body, signature):
    log.warning(f"Invalid webhook signature from {request.client.host}")
    raise HTTPException(status_code=403, detail="Invalid signature")
```

**Also:** The `_verify_signature` function uses `hmac.new` — should be `hmac.new` → `hmac.new` is correct Python, but note it's `hmac.new()` not `hmac.HMAC()`. Both work; the current code is fine.

---

## 4. Structured Logging with Secret Masking (MEDIUM)

**Current format:**
```
2026-06-27 12:00:00 [INFO] 📩 Webhook received: {"from": "601110903799", ...}
```

**Problems:**
- Phone numbers in plaintext (PDPA concern)
- Full message body logged
- No request correlation ID
- No status code or latency tracking
- Not machine-parseable

**Recommended: Custom JSON formatter**

```python
import uuid

class SecureJsonFormatter(logging.Formatter):
    SENSITIVE_PATTERNS = [
        (r'\b6\d{11,12}\b', lambda m: '***' + m.group()[-4:]),  # MY numbers
        (r'sha256=[a-f0-9]+', 'sha256=***'),  # signatures
    ]
    
    def format(self, record):
        msg = record.getMessage()
        for pattern, replacement in self.SENSITIVE_PATTERNS:
            msg = re.sub(pattern, replacement, msg)
        
        return json.dumps({
            "time": self.formatTime(record),
            "level": record.levelname,
            "request_id": getattr(record, "request_id", "no-id"),
            "client_ip": getattr(record, "client_ip", "unknown"),
            "message": msg,
        })
```

**Apply:**
```python
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(SecureJsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
```

**Request ID middleware:**
```python
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    with logging.contextvars(request_id=request_id):
        response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

---

## 5. Security Event Alerting (MEDIUM)

**Finding:** No alerts for attack indicators.

**Recommended: In-memory spike detection + Azure Monitor alerts**

```python
_SECURITY_EVENTS = defaultdict(int)

def check_security_spike(event_type: str, threshold: int, window_s: int = 60):
    """Log alert when security events exceed threshold."""
    _SECURITY_EVENTS[event_type] += 1
    if _SECURITY_EVENTS[event_type] % threshold == 0:
        log.warning(f"🚨 SECURITY SPIKE: {event_type}={_SECURITY_EVENTS[event_type]}")
```

**Usage in handlers:**
```python
# In signature verification failure:
check_security_spike("invalid_signature", 5)

# In rate limit middleware:
check_security_spike("rate_limited", 20)

# In API auth failure:
check_security_spike("auth_failure", 10)
```

**Azure Alert setup (free tier):**
1. Azure Monitor → Alert Rules → Custom log search
2. Query: `traces | where message contains "🚨 SECURITY SPIKE"`
3. Threshold: 1 occurrence → Email/Telegram notification
4. Cost: First 5 alerts free on Azure

---

## 6. Prioritized Hardening Checklist

### Priority 1 — CRITICAL (deploy immediately)

| # | Action | Effort | File |
|---|--------|--------|------|
| 1.1 | Fix webhook signature: fail closed when APP_SECRET empty | 10 min | webhook_listener.py:184 |
| 1.2 | Add missing signature check when header absent | 10 min | webhook_listener.py:184 |
| 1.3 | Generate + set DASHBOARD_API_KEY env var | 5 min | Azure App Settings |

### Priority 2 — HIGH (deploy this week)

| # | Action | Effort | File |
|---|--------|--------|------|
| 2.1 | Add rate limiting middleware | 30 min | webhook_listener.py (new middleware) |
| 2.2 | Add API key auth middleware for /api/* | 20 min | webhook_listener.py (new middleware) |
| 2.3 | Mask phone numbers + tokens in logs | 20 min | webhook_listener.py:56-64 |

### Priority 3 — MEDIUM (deploy this month)

| # | Action | Effort | File |
|---|--------|--------|------|
| 3.1 | Add request_id to all log lines | 15 min | webhook_listener.py (middleware) |
| 3.2 | Add client_ip to log context | 10 min | webhook_listener.py (middleware) |
| 3.3 | Add security event spike logging | 15 min | webhook_listener.py (counters) |
| 3.4 | Set up Azure Alert for signature failures | 20 min | Azure Portal |

### Priority 4 — LOW (nice to have)

| # | Action | Effort | File |
|---|--------|--------|------|
| 4.1 | Structured JSON logging format | 30 min | webhook_listener.py (formatter) |
| 4.2 | Request latency tracking per route | 15 min | webhook_listener.py (middleware) |
| 4.3 | Dashboard CSRF protection | 20 min | dashboard/src/api/api.js |

---

## 7. What Can Be Done on Azure F1/B1 for Free

| Requirement | F1/B1 Compatible? | Method |
|-------------|-------------------|--------|
| Rate limiting | ✅ | In-memory middleware (single instance) |
| API auth | ✅ | Header-based API key |
| Signature verification | ✅ | Already implemented (needs hardening) |
| Log masking | ✅ | Custom formatter |
| Alerting | ✅ | Azure Monitor free tier (5 alerts) |
| SSL/TLS | ✅ | Built into App Service |
| WAF | ❌ | Requires Azure Front Door (paid) |

**Total code changes: ~80 lines new, ~10 lines modified.**
**Total cash cost: $0.**

---

## 8. Related References

- `references/async-webhook-debugging.md` — Security section (signature bypass patterns)
- `references/post-deploy-hardening.md` — Post-deploy audit checklist
- `references/azure-settings-preservation.md` — Safe env var update workflow
