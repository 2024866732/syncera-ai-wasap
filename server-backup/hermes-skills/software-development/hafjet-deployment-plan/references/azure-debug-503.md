# Azure App Service — Log Debugging When App Won't Start

**Date:** 2026-06-27
**Symptom:** Deploy succeeds but site returns 503 Application Error or timeout

## Diagnostic Steps

### 1. Check Site State
```bash
az webapp show --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query state
```
**Possible states:**
- `Running` — app started, check logs for runtime errors
- `Stopped` — manually stopped or failed to start
- `QuotaExceeded` — Free F1 daily CPU limit hit, resets at midnight UTC

### 2. Enable App Logging (Off by Default!)
```bash
az webapp log config \
  --name hafjet-whatsapp-bot \
  --resource-group hafjet-bot-rg \
  --application-logging filesystem \
  --level information
```

### 3. Read Deployment Logs
```bash
az webapp log deployment show --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```
Look for: `Deployment successful` or build errors.

### 4. Read Application Logs via Kudu
```bash
# Get credentials
USER=$(az webapp deployment list-publishing-credentials --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query publishingUserName -o tsv)
PASS=$(az webapp deployment list-publishing-credentials --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query publishingPassword -o tsv)

# List log files
curl -s -u "${USER}:${PASS}" "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/logs/application/files"

# Read specific log
curl -s -u "${USER}:${PASS}" "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/logs/application/files/2026-06-27/application.log"
```

### 5. Read Startup Logs via Log Tail
```bash
timeout 10 az webapp log tail --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg 2>&1 | grep -E "(probe|failed|success|Error|Started|Listening|gunicorn)"
```

**Key log patterns:**
- `Site startup probe succeeded after X seconds` — app started successfully
- `Container did not start within expected time limit of Xs` — startup timeout hit
- `Site container terminated during site startup` — process crashed immediately
- `Application startup complete` — gunicorn/uvicorn started

### 6. Common 503 Causes

| Cause | Fix |
|-------|-----|
| `QuotaExceeded` | Wait for midnight UTC reset, or upgrade to B1 |
| Import error in code | Check Kudu logs for traceback |
| Missing env var | Verify all required vars in app settings |
| Wrong entry point | Oryx auto-detects `application:app` — set `appCommandLine` via REST API if different |
| Stale `STARTUP_COMMAND` app setting | `STARTUP_COMMAND` app setting overrides `start.sh`. Check: `az webapp config appsettings list --query "[?name=='STARTUP_COMMAND']"`. If it has an old value (e.g., bare `uvicorn` without gunicorn/wsproto), update it or delete it so `start.sh` takes effect. |
| Port mismatch | Ensure `--bind 0.0.0.0:8000` matches `WEBSITES_PORT` |
| `pip install` in start.sh | Remove it — use `SCM_DO_BUILD_DURING_DEPLOYMENT=true` instead |
| `JSONResponse(detail=...)` | Use `content=` not `detail=` — causes 500 on all requests |
| Startup timeout | Wait 200s after deploy/restart before testing (142s build + 53s startup) |

### 7. Restart After Fix
```bash
az webapp restart --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
sleep 200  # Wait for Oryx build (142s) + startup (53s)
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/health
```

## Critical: appCommandLine Must Be Set via REST API

`az webapp config set --generic-configurations` does NOT apply to existing web apps. Use REST API:

```bash
az rest --method PATCH \
  --uri "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/config/web?api-version=2022-03-01" \
  --body '{"properties":{"appCommandLine":"python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto"}}'
```

## Resource Not Found (App Deleted) — The Silent 503

**Symptom:** All endpoints return 503 or timeout, but `az webapp start` reports success. DNS may not resolve.

**This means the web app resource was deleted.** Azure's CLI `start` command returns exit 0 even on non-existent resources (no-op). The 503 comes from a stale CDN/proxy cache, not from the app itself.

### Diagnostic Steps

```bash
# 1. Check if resource group has ANY web apps
az webapp list --resource-group hafjet-bot-rg -o table
# Empty output = app was deleted

# 2. Check DNS resolution
dig hafjet-whatsapp-bot.azurewebsites.net +short
# No output = DNS doesn't resolve

# 3. Check across all subscriptions
az webapp list --query "[?contains(name,'hafjet')]" -o table
# Empty = app truly gone from this subscription
```

### How This Happens
- Free tier quota reset doesn't delete apps, but subscription changes, credit expiry, or accidental `az webapp delete` does.
- The 503 responses seen initially were from a transient proxy cache — subsequent requests fail with DNS resolution error (curl exit 6).

### Recovery
If the app was deleted:
1. Re-deploy using `hafjet-deployment-plan` Playbook 1 (Azure B1 upgrade path)
2. Update Meta webhook URL if hostname changes
3. Verify with the full endpoint checklist (see Verification Checklist in SKILL.md)

### Pitfall: `az webapp start` Lies
`az webapp start --resource-group hafjet-bot-rg --name hafjet-whatsapp-bot` returns exit 0 and empty output even when the resource doesn't exist. **Never trust `start` success as proof the app exists.** Always verify with `az webapp list` or `curl`.

---

## Subscription Throttle Recovery

If you see `App Service Plan Create operation is throttled`:
1. **STOP immediately** — do not retry. `Retry-After: 5` header is deceptive; actual window is 15+ minutes for repeated violations.
2. Reuse existing plans instead of creating new ones
3. Avoid rapid create/delete cycles
4. Never delete the last web app on a plan unless you're willing to lose the plan too

---

## Endpoint Verification Script (Full)

When verifying all endpoints after deploy or quota reset, use this comprehensive check. **Write to a file** (not inline) to avoid shell escaping issues with JSON payloads.

```python
#!/usr/bin/env python3
"""Full endpoint verification for hafjet-whatsapp-bot"""
import urllib.request
import json
import sys

BASE = "https://hafjet-whatsapp-bot.azurewebsites.net"

tests = [
    ("GET /health", f"{BASE}/health", "GET", None, 200),
    ("GET /dashboard", f"{BASE}/dashboard", "GET", None, 200),
    ("GET /api/stats", f"{BASE}/api/stats", "GET", None, 200),
    ("GET /api/customers", f"{BASE}/api/customers", "GET", None, 200),
    ("GET /api/settings", f"{BASE}/api/settings", "GET", None, 200),
    ("GET /webhook (with token)", f"{BASE}/webhook?hub.verify_token=HAFJET_RAUB_RAK&hub.challenge=test", "GET", None, 200),
    ("GET /webhook (no token)", f"{BASE}/webhook", "GET", None, 403),
]

payload = json.dumps({
    "object": "page",
    "entry": [{"id": "123", "changes": [{"field": "messages", "value": {"from": {"id": "1"}, "message": {"text": "test"}}}]}]
}).encode()
tests.append(("POST /webhook (with signature)", f"{BASE}/webhook", "POST", payload, 200))

failures = 0
for label, url, method, body, expected in tests:
    try:
        req = urllib.request.Request(url, data=body, method=method)
        if body:
            req.add_header("Content-Type", "application/json")
            req.add_header("X-Hub-Signature-256", "sha256=test")
        resp = urllib.request.urlopen(req, timeout=10)
        actual = resp.status
    except urllib.error.HTTPError as e:
        actual = e.code
    except Exception as e:
        actual = f"ERR:{type(e).__name__}"
    
    status = "PASS" if actual == expected else "FAIL"
    if status == "FAIL":
        failures += 1
    print(f"  [{status}] {label}: expected={expected}, actual={actual}")

# WebSocket check
try:
    import websockets
    async def ws_test():
        async with websockets.connect(f"wss://hafjet-whatsapp-bot.azurewebsites.net/ws") as ws:
            await ws.send(json.dumps({"type": "ping"}))
            resp = await asyncio.wait_for(ws.recv(), timeout=5)
            return "CONNECTED"
    import asyncio
    ws_result = asyncio.run(ws_test())
except ImportError:
    ws_result = "SKIP (websockets not installed)"
except Exception as e:
    ws_result = f"FAIL ({type(e).__name__}: {e})"

print(f"\nWebSocket: {ws_result}")
print(f"\nResult: {len(tests) - failures}/{len(tests)} passed")
sys.exit(1 if failures else 0)
```

**Usage:**
```bash
curl -O https://raw.githubusercontent.com/2024866732/hafjet-whatsapp-bot/main/scripts/verify_endpoints.py
python3 scripts/verify_endpoints.py
```

Or write inline to a temp file:
```bash
cat > /tmp/verify.py << 'PYEOF'
... (script above) ...
PYEOF
python3 /tmp/verify.py
```
