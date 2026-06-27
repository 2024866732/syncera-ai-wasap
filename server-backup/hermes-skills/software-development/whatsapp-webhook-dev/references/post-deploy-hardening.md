# Post-Deployment Hardening Checklist

After every successful deployment to Azure, run this audit to catch operational risks before they cause incidents.

## 1. Health Check Configuration

```bash
# Verify health check is configured
az webapp config show -g <rg> -n <app> --query healthCheckPath
# Expected: "/health"
```

If `null`, set it:
```bash
az webapp config set -g <rg> -n <app> --generic-configurations '{"healthCheckPath": "/health"}'
```

**Why:** Without healthCheckPath, Azure considers the app unhealthy if the first request takes too long (cold starts on Free tier), and may restart it prematurely.

## 2. Startup Command Audit

```bash
# Check effective startup
az webapp config show -g <rg> -n <app> --query appCommandLine
# Check redundant app setting
az webapp config appsettings list -g <rg> -n <app> --query "[?name=='STARTUP_COMMAND']"
```

**Known issue:** Azure has TWO startup mechanisms:
- `appCommandLine` in site config (set via portal or `--startup-file`) ← **This one wins**
- `STARTUP_COMMAND` app setting env var ← Redundant

**Recommendation:** Keep `start.sh` as `appCommandLine` (it has full logging config). Remove `STARTUP_COMMAND` app setting to avoid confusion:
```bash
az webapp config appsettings delete -g <rg> -n <app> --setting-names STARTUP_COMMAND
```

**Verify start.sh contents:**
```bash
cat start.sh
# Expected: cd /home/site/wwwroot, gunicorn with -w 1, --timeout 120,
#           --access-logfile /dev/stdout, --error-logfile /dev/stderr
```

## 3. Stale Artifacts Cleanup

Check for files that clutter the repo and may accidentally get included in the deploy zip:

```bash
# List potential stale files
ls -lh deploy_*.zip .backup/ bot_data.db startup.txt known-good-baseline.md post-deploy-actions.md 2>/dev/null
```

**Safe to remove:**
- `deploy_*.zip` — historical deploy archives (60-125KB each, redundant)
- `.backup/` — old settings backups
- `startup.txt` — dev-only note (misleading in production)
- `known-good-baseline.md`, `post-deploy-actions.md` — one-time docs

**Must add to `.gitignore`:**
```bash
echo "bot_data.db" >> .gitignore
echo "deploy_*.zip" >> .gitignore
echo ".backup/" >> .gitignore
```

**Critical:** `bot_data.db` must NOT be in the deploy zip. If it's untracked by git but present in the directory, `os.walk('.')` will include it, and the zip will carry stale local data overwriting the production DB.

## 4. Persistence Risk Assessment

**Current state on Free F1 tier:**
- `/home/site/wwwroot/` is NOT persistent across container restarts
- `WEITESITES_STORAGE_ENABLED` is not set (no Azure Files mount)
- `alwaysOn: false` (Azure recycles idle instances)

**Risk matrix:**

| Scenario | Data Loss? | Explanation |
|----------|-----------|-------------|
| ZIP deploy | ✅ **HIGH** | ZIP overwrites `/home/site/wwwroot` entirely |
| App restart (manual) | ❌ Low | Files survive restart within same container |
| Container recycle (idle) | ❌ Low | Files preserved within same instance |
| Scale up/down | ✅ **HIGH** | New instance = fresh filesystem |
| Region failover | ✅ **HIGH** | No geo-replication |

**Mitigation priority:**

1. **Immediate:** Add `bot_data.db` to `.gitignore` → stops stale data from deploys
2. **Short term:** Mount Azure Files share for `/home/site/wwwroot/data/`
3. **Long term:** Migrate to Azure SQL / Supabase for production-grade persistence

**Quick check current state:**
```bash
az webapp config show -g <rg> -n <app> 2>&1 | grep -i "alwaysOn\|storage"
```

## 5. Known-Good Baseline

After every successful deploy, capture this baseline for rollback reference:

```bash
# App settings
az webapp config appsettings list -g <rg> -n <app> --output table

# Startup command
az webapp config show -g <rg> -n <app> --query appCommandLine

# Endpoint probes
for ep in /health /dashboard /api/stats /api/customers /api/settings /webhook; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://<app>.azurewebsites.net$ep")
  echo "$ep → $code"
done
```

**Baseline format:**

| Item | Value |
|------|-------|
| Health check | `/health` → 200 |
| Dashboard | `/dashboard` → 200 (HTML) |
| API stats | `/api/stats` → 200 (JSON) |
| Settings | `/api/settings` → 200 (JSON) |
| Webhook verify | `GET /webhook` → 200 |
| Webhook receive | `POST /webhook` → 200 |
| Startup command | `start.sh` (effective) |
| App settings count | 12 keys |

## 6. Deploy Command (Reference)

```bash
# Clean stale bytecode
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

# Build zip (Python zipfile — universal)
python3 -c "
import zipfile, os
base = '.'
exclude_dirs = {'__pycache__', 'node_modules', '.git'}
exclude_files = {'.env', 'bot_data.db'}
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for f in files:
            if f in exclude_files or f.endswith('.pyc'): continue
            full = os.path.join(root, f)
            zf.write(full, os.path.relpath(full, base))
"

# Deploy
az webapp deploy -g <rg> -n <app> --src-path deploy.zip
```

## 7. Pre-Flight ZIP Verification

Before deploying, always run a pre-flight check to confirm the ZIP is correct:

```bash
# Build the ZIP first
python3 deploy.sh

# Verify contents
python3 -c "
import zipfile, os
zf = zipfile.ZipFile('deploy.zip', 'r')
entries = sorted(zf.namelist())

# Required files
required = ['webhook_listener.py', 'hermes_ai.py', 'db_logger.py', 
            'requirements.txt', 'start.sh']
for r in required:
    assert r in entries, f'MISSING: {r}'
    print(f'  ✅ {r}')

# Dashboard dist
dist = [e for e in entries if e.startswith('dashboard/dist/')]
assert dist, 'MISSING: dashboard/dist/*'
print(f'  ✅ dashboard/dist/* ({len(dist)} files)')

# Excluded files
forbidden = ['bot_data.db', '.env', '.gitignore']
for f in forbidden:
    hits = [e for e in entries if f in e and f'.env.example' not in e]
    assert not hits, f'PRESENT (should be excluded): {hits}'
    print(f'  ✅ excluded: {f}')

# .env.example is OK (template, no real secrets)
assert '.env.example' in entries, 'MISSING: .env.example (template is safe to include)'
print(f'  ✅ .env.example (template, safe)')

print(f'\n✅ ZIP OK: {os.path.getsize(\"deploy.zip\")/1024:.1f} KB, {len(entries)} entries')
"
```

**Pre-flight checklist:**

| Check | Required | Action if FAIL |
|-------|----------|----------------|
| `webhook_listener.py` included | Yes | Fix exclude list |
| `hermes_ai.py` included | Yes | Fix exclude list |
| `db_logger.py` included | Yes | Fix exclude list |
| `requirements.txt` included | Yes | Fix exclude list |
| `start.sh` included | Yes | Fix exclude list |
| `dashboard/dist/*` included (4+ files) | Yes | Run `npm run build` in dashboard/ |
| `bot_data.db` excluded | Yes | Add to exclude list |
| `.env` excluded | Yes | Add to exclude list |
| `.env.example` included | Optional | Safe template, keep for reference |
| `deploy.zip` self-excluded | Yes | Add `'deploy.zip'` to EXCLUDE_FILES |
| No `node_modules/` | Yes | Add to EXCLUDE_DIRS |
| No `__pycache__/` | Yes | Clean before build |
| No stale `deploy_*.zip` | Yes | Add pattern to exclude |
| No `.backup/` | Yes | Add to EXCLUDE_DIRS |

## 7. Full Post-Deploy Verification Command

```bash
# One-shot verification after every deploy
APP="your-app" && RG="your-rg" && \
echo "=== Endpoint Verification ===" && \
for ep in /health /dashboard /api/stats; do \
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://$APP.azurewebsites.net$ep"); \
  echo "  GET $ep → $code"; \
done && \
echo "" && \
echo "Webhook verify (GET):" && \
curl -s "$APP.azurewebsites.net/webhook?hub.verify_token=YOUR_TOKEN&hub.challenge=test&hub.mode=subscribe" && \
echo "" && \
echo "Webhook POST (no sig → expect 403):" && \
curl -s -o /dev/null -w "  POST /webhook → %{http_code}\n" -X POST "$APP.azurewebsites.net/webhook" \
  -H "Content-Type: application/json" -d '{}' && \
echo "" && \
echo "  Expected: 200 / 200 / 200 / challenge_string / 403"

1. **`bot_data.db` in zip overwrites production DB** — even though gitignored, the file sits in the directory and gets included in the zip. Always explicitly exclude it.
2. **Stale `deploy_*.zip` files accumulate** — each deploy creates a new zip in the repo directory. They get included in the next deploy's zip (zip-inception). Always exclude `*.zip` and self-exclude `deploy.zip`.
3. **Removing `STARTUP_COMMAND` is safe** — `start.sh` (via `appCommandLine`) is the effective runner. The env var is a leftover that causes confusion about which one runs.
4. **Free tier has no SLA on persistence** — assume data loss on every deploy. Design your app to reconstruct state (DB schema auto-migrated on startup, settings cached in memory).
5. **`alwaysOn: false` + health check = cold start risk** — first request after idle period may take 5-10s. Health check keeps the app warm but doesn't guarantee zero cold starts.
6. **`zip` command unavailable on minimal Linux** — Azure App Service SSH, Docker containers, and minimal servers often lack the `zip` binary. Always use Python's `zipfile` module as the universal deploy ZIP builder.
7. **`.env.example` vs `.env`** — `.env` (real secrets) must be excluded. `.env.example` (template with placeholders like `your_token_here`) is safe to include and useful as reference for other developers.
8. **deploy.zip self-inclusion** — when building ZIP with `os.walk('.')`, the `deploy.zip` being created can be included in itself if the walk reaches it before the file handle closes. Always add `'deploy.zip'` to EXCLUDE_FILES in the build script.

9. **⚠ WebSocket 403 is a uvicorn internals bug, NOT an Azure tier limitation** — The original assumption that "Free F1 tier blocks WebSocket" is WRONG. The 403 comes from `uvicorn/protocols/websockets/websockets_impl.py` line ~170 where `websockets.legacy.handshake.check_request()` fails because `request_headers.raw_items()` returns string tuples but `parse_connection()` expects a different format. Uvicorn catches the `InvalidUpgrade` exception and returns HTTP 403 with empty body — before the ASGI handler runs. **Symptom:** `curl -H "Upgrade: websocket" http://localhost:PORT/ws` returns `HTTP 403 Forbidden` with `Content-Length: 0`. **Fix:** Patch the uvicorn source to convert headers properly (see pitfall 17ag). **Debugging methodology:** (1) test locally with `uvicorn.run()` + raw socket/curl to confirm it's not platform, (2) add print statements in the WS handler to confirm it never executes, (3) enable uvicorn debug logging to see the `opening handshake failed` + `InvalidUpgrade` traceback, (4) check `websockets.__version__` — affects how `check_request` parses headers. **Never assume tier limitation without local reproduction.**

10. **⚠ Pitfall 17ab correction — `appCommandLine` does NOT get nulled by zip deploy on Linux** — The original pitfall 17ab claims `az webapp deploy --type zip` resets `appCommandLine` to null. In practice on Azure Linux App Service (Free F1, Python 3.11), zip deployment PRESERVES `appCommandLine: start.sh`. Do NOT proactively re-set `appCommandLine` after every deploy — you risk conflicting with the working config. Only check & fix if `appCommandLine` is actually null.

11. **⚠ `STARTUP_COMMAND` app setting is truly redundant when `start.sh` exists as `appCommandLine`** — In deployment, verified `appCommandLine: start.sh` is the effective runner. The `STARTUP_COMMAND` app setting coexists harmlessly but causes confusion. Safe to remove when doing maintenance cleanup, but NOT urgent.

12. **Full end-to-end webhook signature test pattern** — After deploy, verify POST /webhook with a valid HMAC signature:
```python
import hmac, hashlib, json, urllib.request
APP_SECRET="your_app_secret"  # From Azure App Settings
payload = json.dumps({"object":"whatsapp_business_account","entry":[{"id":"WABA_ID","changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"PHONE_ID"},"messages":[{"from":"PHONE","id":"test_001","timestamp":"1719460000","type":"text","text":{"body":"halo"}}]}}}]}]})
sig = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
req = urllib.request.Request('https://app.azurewebsites.net/webhook',
    data=payload.encode(),
    headers={'Content-Type':'application/json','X-Hub-Signature-256':f'sha256={sig}'},
    method='POST')
resp = urllib.request.urlopen(req, timeout=10)
assert resp.status == 200
```
Without the signature header, POST returns 403 (expected). Without `X-Hub-Signature-256`, POST also returns 403 (expected).
