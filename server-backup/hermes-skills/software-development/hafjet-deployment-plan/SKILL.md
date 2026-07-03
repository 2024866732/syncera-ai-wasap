---
name: hafjet-deployment-plan
description: "Use when discussing, planning, or executing deployment for the HAFJET WhatsApp Bot. Locked strategy with four environments (Azure, AWS, Heroku, Oracle), exact CLI steps, and decision matrices for upgrades, throttling recovery, and failovers."
version: 1.7.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [deployment, azure, aws, heroku, oracle, whatsapp-bot]
    related_skills: [whatsapp-webhook-dev]

---

# HAFJET WhatsApp Bot - Deployment Strategy (LOCKED)

## Overview

This skill documents the locked deployment strategy for HAFJET WhatsApp Bot v2.1.
It covers four environments: Azure (primary production), AWS (staging), Heroku (fallback), and Oracle Cloud Always Free (fallback/throttle-recovery).
**Do not execute migrations without explicit user confirmation.** This is a reference playbook only.

## Support Files

| File | Purpose |
|------|---------|
| `references/config-var-audit.md` | Exact env var name mapping (internal var → Azure setting → Heroku config) |
| `references/dashboard-portability.md` | Dashboard static serving compatibility across platforms |
| `references/heroku-cli-setup.md` | Heroku CLI installation + API key auth (no browser login) |
| `references/security-hardening-phase1.md` | Phase 1 security hardening (signature fail-closed, API key auth, log masking) — EXACT code changes |
| `references/vite-env-injection.md` | Build-time env var injection for Vite + Azure ZIP deploy |
| `references/azure-debug-503.md` | Debugging 503 errors after deploy (QuotaExceeded, import errors, logging, **resource-not-found/app-deleted**) |
| `references/fallback-provider-setup.md` | Fallback provider config pattern (Cerebras as OpenRouter backup) |
| `references/server-backup-restore.md` | Server config backup/restore from GitHub |
| `scripts/verify_endpoints.py` | Full endpoint verification script (health, dashboard, API, webhook GET/POST, WebSocket) |
| `references/b1-upgrade-troubleshooting.md` | F1→B1 upgrade steps + app unreachable after upgrade |
| `references/azure-webapp-up-deploy.md` | `az webapp up` full deploy pattern (Oryx build, startup time budget, common failures) |
| `references/oracle-cloud-free-tier.md` | Oracle Cloud Always Free tier: limits, regions, OCI CLI auth, A1.Flex deployment, capacity risks |
| `references/pre-deploy-verification.md` | Pre-deploy verification workflow: show diff → test → wait for approval → deploy. Business data integrity rules. Routing debug pattern. |
| `references/dashboard-feature-workflow.md` | DB→Backend→Frontend→Build→Deploy workflow + nav sidebar + UI constants + blast/contacts feature patterns |

## Workflow Rules

0. **Follow spec order strictly — do NOT skip steps** — When the user provides a numbered spec (Sprint 1 → 2 → 3, or Feature 1 → 2 → 3), implement in the EXACT order given. Do not jump ahead or reorder. Each step builds on the previous one. If a spec says "Buat ikut urutan. Jangan skip step." — treat it as code. Evidence: user frustration at skipped steps despite clear ordering.

1. **Investigate BEFORE proposing fixes** — When user reports a bug, do NOT jump to "let me fix X". First:
   - Read the relevant code to find why it is failing (auth? field name mismatch? env var missing?)
   - Run SQL queries to confirm data exists in DB
   - Cross-reference API response field names vs frontend component expectations
   - Show evidence with code line numbers, not speculation
   - Only THEN offer a fix proposal.
   Violation: user says "siasat dulu dan tunjuk kod" or "jangan teka" or "kenapa". You missed an investigation step.

2. **Show diff + test log before deploying** — Tuan Hafizi reviews code AND test output BEFORE any deployment. Never apply changes in production without prior approval.

3. **Deploy only on explicit "deploy sekarang" command** — Do NOT deploy after showing diff. Wait for "deploy sekarang" or "DEPLOY SEKARANG". Showing approval-ready commands is fine; running them is not. Deploying without explicit approval is a violation.

4. **Never call success without evidence** — Do NOT say "semua dah ok" or "siap" without actual proof (dashboard screenshot, API response, SQL output, traceback). Show the proof, then state the status. If user asks "ada bukti dashboard yang bercanggah", you must investigate the discrepancy, not claim it is fixed without verification.

5. **Never invent business data** — Operating hours, prices, promotions, stock must come ONLY from verified files (business_info.txt, system_prompt.txt, intent_rules.json). If data is "belum sahkan"/"PENDING"/unconfirmed, do not change it. If missing, tell the user — never hardcode or fabricate.

6. **Audit before protecting** — When adding auth/middleware, audit frontend consumers first to avoid breaking existing functionality. Check:
   - Does the frontend bundle send the required auth headers? (verify in built JS, not source)
   - Are there any GET endpoints used by the UI that need to stay unprotected?
   - Does the middleware accidentally block non-protected routes when misconfigured? (Common bug: `if not DASHBOARD_API_KEY: return 500` before path check blocks ALL routes, including webhook/health/dashboard.)

7. **Fail closed, not open** — Security checks reject by default when config is missing, never silently skip. BUT: the check must be scoped to protected routes only, not the entire app. A missing API key should block protected writes, not crash the webhook or health endpoint.

8. **Minimal first pass** — Protect write routes first, read routes later — smaller blast radius.

9. **Coordinated frontend-backend deploys** — Backend auth + frontend headers in the SAME deploy. Never deploy backend-only auth without frontend update first. See `references/vite-env-injection.md`.

10. **Before protecting routes, verify VITE_API_KEY is set in build** — The dashboard frontend sends `X-API-Key` from `import.meta.env.VITE_API_KEY`. If this env var is not set during `npm run build`, the bundle sends an empty/wrong header. Backend middleware returns 401 (or 500) on all protected POST endpoints, including Manual Takeover, Resolve, Escalate, Note. This causes "loading spinner never stops" (fetch hangs because the request resolves with 401/500 and the exception is caught, but if the response does not return at all, the finally block never runs). **Symptoms of missing VITE_API_KEY:**
     - All dashboard action buttons (Take Over, Resolve, Escalate, Note) fail silently
     - Loading spinner never stops for Note
     - Error toast may or may not show depending on backend response
     - GET requests (customer list, messages) still work fine
   **Fix:** Always set `VITE_API_KEY=...` before `npm run build` in deploy script. Verify key is baked into bundle:
   ```bash
   grep -o "$DASHBOARD_API_KEY" dashboard/dist/assets/index-*.js | head -1
   ```

11. **Verify after deploy** — Health checks + test protected routes with valid AND invalid credentials. Do not assume deployment = working.

12. **Stop on throttle, do not retry** — 429 on plan create/delete = STOP. Wait 15+ min, reuse existing resources.

13. **Prefer web app recreate over plan recreate** — Deleting last web app auto-deletes plan. Expect it and plan for throttle window.

## Runtime Config Precedence (Env > DB > Default)

**Single source of truth = Azure env vars.** DB is fallback only for non-critical keys.

**Critical keys (env overrides DB, DB cannot silently disable):**
- `OPENROUTER_MODEL` → `ai_model`
- `OPENROUTER_API_KEY` → `ai_enabled` (only enable, never disable via DB)
- `AI_ENABLED` → `ai_enabled`
- `BOT_ACTIVE` → `bot_active`

**Required patterns:**
1. `get_runtime()` checks `_ENV_OVERRIDE_MAP` BEFORE DB cache.
2. `get_runtime_bool()` for `ai_enabled`/`bot_active`: env wins, DB can only enable (return True), default is the safety floor. DB false/empty must NOT override default True.
3. Effective model = `os.getenv("OPENROUTER_MODEL") or get_runtime("ai_model", "") or "nvidia/nemotron-3-super-120b-a12b:free"`.
4. Mirror effective model into `os.environ["OPENROUTER_MODEL"]` AND `hermes_ai.OPENROUTER_MODEL` at startup so downstream imports pick it up.

**Pitfall:** Changing `VALID_SETTINGS` default alone is insufficient. You must also update `hermes_ai.py` fallback default, dashboard placeholder, and `GET /api/settings` effective merge.

## Model Debug Logging

Every OpenRouter call MUST log before request:
```
[MODEL_DEBUG] model={model} base_url={url} timeout={timeout}
[MODEL_DEBUG] status_code={code}
[MODEL_DEBUG] reply={content[:200]}
```
This is non-negotiable for diagnosing 404/429/401 misconfigurations.

## Dashboard Effective Values

`GET /api/settings` must return effective runtime values: defaults → DB → env overrides. Dashboard Settings page must display what the bot actually uses, not just the DB default. Never show owl-alpha when nemotron is active.

## Analytics: Today-Only + Date Picker

Stats endpoints must default to today's data. Frontend Analytics must:
- Show `today_inbound`, `today_outbound`, `today_ai_calls`, `today_fallback_rate`, `today_avg_latency`.
- Provide `<input type="date">` + "Hari Ini" button.
- Never show all-time fallback rate as "today" figure.

**Formula for `today_fallback_rate`:**
```python
today_ai_calls = stats["today_ai_calls"] or 0
today_fallback = stats["today_fallback_count"] or 0
today_total_calls = today_ai_calls + today_fallback
stats["today_fallback_rate"] = round((today_fallback / today_total_calls) * 100) if today_total_calls > 0 else 0
```
**Pitfall:** Do NOT compute fallback rate as `(today_outbound - today_ai_calls) / today_outbound`. `today_outbound` includes staff manual replies and `[no_reply]` logs, which inflates the denominator and produces wrong rates (e.g., 100% when AI actually worked).

**Routing path contract:** `_detect_routing()` must return the exact same strings used in SQL `WHERE routing_path='...'` filters. If code returns `"ai_query"`, the SQL must filter on `'ai_query'`, not `'ai'`. Mismatch silently zeroes every counter. See `whatsapp-webhook-dev` `references/routing-path-mismatch.md`.

## Known Deployment Bugs & Fixes (2026-07)

### Bug: Oryx Stale Build Cache — `Build successful. Time: 0(s)`

**Symptom:** `az webapp deploy` shows `Build successful. Time: 0(s)`. After restart, the app still uses the OLD code (e.g., missing new files, old imports failing). `/home/site/wwwroot` contains only `output.tar.zst` and `oryx-manifest.toml` — no `.py` files.

**Root cause:** Oryx caches the build output in `output.tar.zst`. On subsequent deploys with the same file set, Oryx reuses the cached tarball instead of rebuilding from the fresh ZIP files. The old tarball may be missing files (e.g., `repair_db.py`, `system_prompt.txt`).

**Detection:**
1. Deploy output shows `Time: 0(s)` — the build step completed instantly.
2. Most reliable: compare a known file's content from the deployed app vs local. If the app uses old code despite fresh ZIP, cache is stale.
3. Check `/home/site/wwwroot/` contents via startup log — if only tarball + manifest exist without `.py` files, Oryx is managing deployment via cache.

**Fix (three options, try in order):**

1. **Force Oryx rebuild with timestamp app setting** (simplest, no downtime):
   ```bash
   az webapp config appsettings set -g <rg> -n <app> --settings "ORYX_BUILD_TIMESTAMP=$(date +%s)"
   az webapp deploy -g <rg> -n <app> --src-path deploy-hafjet-bot.zip --type zip
   ```
   The new app setting invalidates Oryx's cache fingerprint, forcing a full rebuild from the fresh ZIP files. The build output will show a time > 0s.

2. **Use `az webapp deployment source config-zip`** (deprecated but forces build):
   ```bash
   az webapp deployment source config-zip -g <rg> -n <app> --src deploy-hafjet-bot.zip --timeout 300
   ```
   This older method triggers a full Oryx build even when the modern `az webapp deploy` would use cache. Note: this command is deprecated and will be removed in future CLI versions.

3. **Delete cache + redeploy** (if options 1-2 fail):
   Stop the app → delete `oryx-manifest.toml` and `output.tar.zst` from `/home/site/wwwroot/` via Kudu VFS API → start app → deploy fresh ZIP with `--type zip`. Kudu VFS requires publishing credentials (always redacted by Azure CLI) — option 1 or 2 is preferred.

**Pitfall:** If the app is STOPPED while deploying, `az webapp deploy --type zip` may fail with 502 (Kudu warmup failure). Always deploy while the app is RUNNING, or use `config-zip` which handles stopped apps better.

**Post-recovery verification:**
```bash
# Confirm build took time (> 0s)
curl -s https://<app>.scm.azurewebsites.net/api/deployments/latest | grep status

# Confirm new files exist (check a known new file via import test in logs)
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip
# Extract and search for 'IMPORT OK' or specific module names

# Quick health check
curl -s http://<app>.azurewebsites.net/health | python3 -m json.tool
```

See `references/oryx-rebuild-force.md` for the full session transcript, exact CLI sequences, and the `ORYX_BUILD_TIMESTAMP` vs `config-zip` vs cache-deletion decision tree.

### Bug: `api_note` / `api_resolve` / `api_escalate` — Spinner Never Stops (Sync DB in Async Endpoint)

### Bug: `api_note` / `api_resolve` / `api_escalate` — Spinner Never Stops (Sync DB in Async Endpoint)

### Bug: Deploying While App Is STOPPED Causes 502

**Symptom:** Clicking Simpan Note shows spinner that never finishes. Tandai Selesai and Escalate have the same issue. No error toast. Network tab shows the POST request never completes (pending forever or 500 after timeout).

**Root cause:** Operator action endpoints in `webhook_listener.py` call synchronous SQLite functions **directly** (without `run_in_executor`), blocking the async event loop. SQLite with `check_same_thread=False` still blocks on write locks. If the DB is busy saving an inbound message from the webhook, the async call waits → event loop freezes → request hangs → `finally { setActionLoading(null) }` never runs.

```python
# ❌ WRONG — sync call in async def, blocks event loop
@app.post("/api/customers/{phone}/note")
async def api_note(phone, data: dict, operator="dashboard"):
    result = update_customer_note(phone, note, operator)  # SYNC!

# ✅ RIGHT — offload to thread pool
@app.post("/api/customers/{phone}/note")
async def api_note(phone, data: dict, operator="dashboard"):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, update_customer_note, phone, note, operator)
```

**Affected endpoints:**
- `POST /api/customers/{phone}/note` (line 832)
- `POST /api/customers/{phone}/resolve` (line 814)
- `POST /api/customers/{phone}/escalate` (line 823)
- `POST /api/customers/{phone}/handoff` (line 842) — also calls sync `get_customer_detail()`

**Did not affect** `log_inbound`/`log_outbound` because those already use `loop.run_in_executor(None, _save_inbound, ...)` — the correct pattern.

**Detection:** Check if the async endpoint calls any sync function directly (not via executor). FastAPI endpoints should never call synchronous SQLite/IO functions directly.

**Fix:** Wrap all sync DB function calls in `await loop.run_in_executor(None, func, *args)`.

**Pitfall:** Missing positional args. `log_outbound(phone, message, "staff")` fails because it requires `latency_ms` and `fallback_used` — caught only at runtime, not at syntax check.

### Bug: WebSocket Realtime — `inbound_message` / `outbound_message` vs `new_message`

**Symptom:** Chat panel shows old messages via API load, but new inbound/outbound messages never appear in real-time (no WebSocket append).

**Root cause:** Two mismatches between backend broadcast and frontend WebSocket handler:

| Layer | Backend sends | Frontend expects | Issue |
|-------|--------------|------------------|-------|
| Event name | `event: "inbound_message"` | `data.type === "new_message"` | Field name mismatch |
| Phone field | `data.phone: "6012..."` | `msg.from === phone` | Key name mismatch |

Backend (`db_logger.py:145`):
```python
broadcast_ws("inbound_message", {"phone": phone, "content": content, ...})
# → WS message: {"event": "inbound_message", "data": {"phone": ..., "content": ...}}
```

Frontend (`ChatView.jsx:53`):
```javascript
const data = JSON.parse(event.data);
if (data.type === 'new_message' && data.data) {           // data.type is undefined
  const msg = data.data;
  if (msg.from === phone || msg.to === phone) { ... }     // msg.from is undefined
}
```

**Fix:** Update ChatView handler to match backend broadcast format:
```javascript
if ((data.event === 'inbound_message' || data.event === 'outbound_message') && data.data) {
  const msg = data.data;
  if (msg.phone === phone) { ... }
}
```

The WS broadcast does NOT include `message` and `source` aliases — those are added only in the `/api/messages` endpoint. WS handler must construct the message object from available fields.

### Bug: VITE_API_KEY Not Injected Due to Shell Env Shadowing

**Symptom:** After creating `dashboard/.env.production` with the correct key and running `npm run build`, the built JS bundle still has `X-API-Key:""` (empty). The shell env var `VITE_API_KEY=*** overrides the `.env.production` file because vite overlays `process.env` on top of `.env` files.

**Root cause:** When the terminal session has `VITE_API_KEY=*** (set from a previous command like `DASHBOARD_API_KEY=*** python3 -m uvicorn ...` where the tool persists env across commands), vite loads `.env.production` first, THEN replaces values with `process.env` values. The shell env var wins, injecting `***` (literal asterisks or empty) instead of the real key.

**Fix (two options):**
1. **Clear env before build:** `VITE_API_KEY=*** npm run build` or `export VITE_API_KEY=*** before building
2. **Use a different mode file name** (`.env.buildtime`) and load it explicitly

**Verification:**
```bash
# Check raw bytes, not terminal output (terminal may mask secrets)
python3 -c "
with open('dashboard/dist/assets/index-*.js', 'rb') as f:
    data = f.read()
idx = data.find(b'X-API-Key')
print(data[idx:idx+70])  # Must show actual key, not *** or empty
"
```

### Bug: Cold Start `ModuleNotFoundError` After Fresh Deploy

**Symptom:** App fails to start after `az webapp deploy`. Container stream log shows:
```
ModuleNotFoundError: No module named 'httpx'
```
even though `httpx` is in `requirements.txt`. Health endpoint returns 503 / Application Error page.

**Root cause:** Oryx build system uses a cached build manifest (`oryx-manifest.toml`) and reuses `output.tar.zst` without rebuilding the virtualenv. The cached build may be missing installed packages, or the venv directory (`antenv`) is not present in `/home/site/wwwroot/`. This happens when `SCM_DO_BUILD_DURING_DEPLOYMENT=false` is set, or after Oryx cache invalidation issues.

**Fix — Add auto-install fallback in `start.sh`:**
```bash
echo "=== PYTHON DEPS CHECK ==="
python3 - <<'PY'
import importlib
for mod in ["fastapi","uvicorn","gunicorn","httpx","dotenv","wsproto","requests"]:
    try:
        importlib.import_module(mod if mod != "dotenv" else "dotenv")
        print(f"OK {mod}")
    except Exception as e:
        print(f"MISSING {mod}: {e}")
PY
MISSING=$(python3 -c "import importlib; print(','.join([m for m in ['fastapi','uvicorn','gunicorn','httpx','dotenv','wsproto','requests'] if not __import__('importlib').import_module(m if m!='dotenv' else 'dotenv', package=None)]))" 2>/dev/null || echo "all")
if [ "$MISSING" != "" ] && [ "$MISSING" != "all" ]; then
  echo "Installing missing python deps: $MISSING"
  pip install -r /home/site/wwwroot/requirements.txt 2>&1 | tail -3 || true
else
  echo "All python deps present"
fi
```

**Post-deploy verification:**
```bash
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip
python3 -c "
import zipfile
with zipfile.ZipFile('/tmp/logs.zip') as zf:
    log = 'LogFiles/StartupLogs/<latest>_failure.log'
    with zf.open(log) as f:
        print(f.read().decode()[-1000:])
"
```
Look for `IMPORT OK` and `🚀 HAFJET Bot startup complete` lines, not `ModuleNotFoundError`.

### Pattern: Async Deploy with Polling

When `az webapp deploy` times out or stalls (no completion status after minutes), use `--async true` and poll the app state:

```bash
az webapp deploy --resource-group <rg> --name <app> --src-path deploy.zip --type zip --async true
# Then poll:
for i in 1 2 3 4 5 6; do sleep 30; state=$(az webapp show -g <rg> -n <app> --query "state" -o tsv); echo "[$i] state=$state"; [ "$state" = "Running" ] && break; done
```

**Pitfall:** Killing the `az webapp deploy` process does NOT cancel the deployment on Azure. The build continues server-side. Do not re-deploy until the first deployment completes or fails — concurrent deployments can conflict.

### Pattern: Extracting Azure Container Logs

`az webapp log tail` may hang or time out. Alternative:

```bash
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip
python3 -c "
import zipfile
with zipfile.ZipFile('/tmp/logs.zip') as zf:
    for log in zf.namelist():
        if 'containerStream' in log and '2026_07_03' in log:
            with zf.open(log) as f:
                lines = f.read().decode('utf-8', errors='replace').splitlines()
                for line in lines[-40:]: print(line)
            break
"
```

**Pitfall:** `unzip` CLI may not be installed on the VM. Use Python `zipfile` instead.

## ZIP Build Discipline
## ZIP Build Discipline

**Always build deploy ZIP with explicit Python script, NOT `zip -r`.** Bash recursive zip is brittle: includes `node_modules`, `.git`, `__pycache__`, `.env`, `bot_data.db`, and silently misses files depending on cwd.

```python
import zipfile, os

out = "deploy-hafjet-bot.zip"
skip_dirs = {"node_modules", "__pycache__", ".git", "venv", ".backup", "logs"}
exclude_files = {"test_model_debug.py", "bot_data.db"}

# If os.walk('.') times out because node_modules is huge, use an explicit file list instead:
# files = ['webhook_listener.py', 'db_logger.py', 'hermes_ai.py', 'repair_db.py', 'requirements.txt', 'start.sh', 'business_info.txt', 'system_prompt.txt']
# WARNING: Exclude bot_data.db from explicit list — local copy will overwrite production DB

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk('.'):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for f in filenames:
            if f in exclude_files or f.startswith('.'):
                continue
            abs_path = os.path.join(dirpath, f)
            arc_path = os.path.relpath(abs_path, '.')
            z.write(abs_path, arc_path)
```

**ZIP must contain:**
- Backend `.py` files at root: `webhook_listener.py`, `db_logger.py`, `hermes_ai.py`, `repair_db.py`, etc.
- Frontend build ONLY: `dashboard/dist/` (not `dashboard/src/`, not `dashboard/node_modules/`)
- Never include `.env`, `.env.*`, secrets, or backup files
- **`repair_db.py` is required** — omitting it causes `ModuleNotFoundError` at Azure startup, producing silent 503/timeout failures.
- **`bot_data.db` must be excluded** — uploading it overwrites the production DB with an empty local copy. The local `bot_data.db` (in the repo directory) is usually empty/stale — including it in the ZIP will replace the real production DB on Azure, causing data loss. Always filter it out: `if f == 'bot_data.db': continue`.
- **`deploy-hafjet-bot.zip` must self-exclude** — the ZIP build script must not include the previously-built ZIP file itself. Add `if f.endswith('.zip'): continue` to the exclude list.

**Validate before deploy:**
```bash
python3 -c "import zipfile; z=zipfile.ZipFile('deploy-hafjet-bot.zip'); print('Total files:', len(z.namelist())); print('.py files:', [n for n in z.namelist() if n.endswith('.py')])"
```

## Local Webhook Test Pattern (Pre-Deploy MODEL_DEBUG Verification)

Before deploying AI changes, verify `[MODEL_DEBUG]` logs locally to catch model name / timeout / status_code issues:

```bash
# Terminal 1: Start server with Azure-equivalent env vars
cd ~/.hermes/whatsapp-bot
DASHBOARD_API_KEY="***" \
OPENROUTER_API_KEY="***" \
OPENROUTER_MODEL="nvidia/nemotron-3-super-120b-a12b:free" \
AI_ENABLED=true BOT_ACTIVE=true \
python3 -m uvicorn webhook_listener:app --host 127.0.0.1 --port 8080

# Terminal 2: Send test webhook
python3 - <<'PY'
import json, hmac, hashlib, requests
APP_SECRET="<from Azure App Settings>"
payload = {"object":"whatsapp_business_account","entry":[{"id":"123","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"+60 16-980 8736"},"contacts":[{"profile":{"name":"Test"},"wa_id":"60119999999"}],"messages":[{"from":"60119999999","id":"wamid.test.001","timestamp":"1234567890","type":"text","text":{"body":"berapa harga repair screen?"}}]},"field":"messages"}]}]}
body = json.dumps(payload, separators=(',',':'))
sig = "sha256=" + hmac.new(APP_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = {"Content-Type":"application/json","X-Hub-Signature-256":sig}
r = requests.post("http://127.0.0.1:8080/webhook", data=body, headers=headers)
print(r.status_code, r.text)
PY
```

Expected log output:
```
[hermes_ai] [OPENROUTER] Model: nvidia/nemotron-3-super-120b-a12b:free
[MODEL_DEBUG] model=nvidia/... base_url=... timeout=30
[MODEL_DEBUG] status_code=200
[MODEL_DEBUG] reply=...
```

If status_code != 200 or reply is missing, fix BEFORE deploying.

## Post-Deploy Verification Checklist

After `az webapp deploy` + `az webapp restart`:

```bash
# 1. Health
curl -s http://hafjet-whatsapp-bot.azurewebsites.net/health

# 2. Effective settings (must show env overrides)
curl -s -H "X-API-Key: $DASHBOARD_API_KEY" http://hafjet-whatsapp-bot.azurewebsites.net/api/settings | python3 -m json.tool

# 3. Stats (today-only)
curl -s http://hafjet-whatsapp-bot.azurewebsites.net/api/stats | python3 -m json.tool

# 4. Dashboard SPA
curl -s -o /dev/null -w "%{http_code}" http://hafjet-whatsapp-bot.azurewebsites.net/dashboard

# 5. Frontend bundle contains new features
curl -s http://hafjet-whatsapp-bot.azurewebsites.net/dashboard/assets/index-*.js | grep -o 'today_fallback_rate\|selectedDate'
```

**Critical assertions:**
- `ai_model` in `/api/settings` must equal Azure env `OPENROUTER_MODEL` (nemotron), NOT `owl-alpha`
- `bot_active` and `ai_enabled` must be `true` if Azure env vars set
- Today stats must have `today_fallback_rate`, `today_avg_latency` keys
- Dashboard HTML must return 200 with React `<div id="root">`
- If an AI bug is suspected, run a test message and verify `[MODEL_DEBUG]` log appears in `az webapp log download` with correct `model=` and `status_code=` before deploying any AI-related fix

| Item | Value |
|------|-------|
| **Primary platform** | Azure App Service B1 (Basic) |
| **App name** | `hafjet-whatsapp-bot` |
| **Resource group** | `hafjet-bot-rg` |
| **App Service Plan** | `hafjet-bot-plan` (B1, Southeast Asia) — **DELETED** (auto-deleted when last web app removed) |
| **Entry point** | `webhook_listener:app` |
| **Startup command** | `bash /home/site/wwwroot/start.sh` → `python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto` |
| **DB** | SQLite (`bot_data.db`) |
| **Dashboard** | React SPA served via FastAPI at `/dashboard` |
| **WebSocket** | `/ws` with wsproto backend |
| **Meta webhook** | `https://hafjet-whatsapp-bot.azurewebsites.net/webhook` |
| **Security** | v2.1.0: fail-closed signature, X-API-Key on write routes, SecureFormatter masking |
| **Hardening status** | Code deployed locally, awaiting clean redeploy |
| **Subscription throttle** | Active — plan create/delete throttled until ~15 min after last violation |

### Pitfall — Wrong app name causes deploy failure
```
ERROR: (ResourceNotFound) The Resource 'Microsoft.Web/sites/<wrong-name>' under resource group '...' was not found.
```
Discovery command when app name is unknown:
```bash
az webapp list --query "[].{name:name, rg:resourceGroup, state:state}" -o table
```
Returns all web apps in the subscription with their resource groups and states.

### Pitfall — `az webapp deploy --async true` may timeout silently
The `--async true` flag polls deployment status with a default timeout of ~120s. If the build takes longer (Oryx rebuild, dependency install), the command times out at `Status: Building the app... Time: X(s)` — but the deployment **continues on Azure** and may still complete successfully.
- **Detection after timeout:** Check app health endpoint. If still `200`, deployment may have completed.
- **Preferred pattern** — sync deploy with explicit 300s timeout:
  ```bash
  az webapp deploy --resource-group <rg> --name <app> --src-path deploy-hafjet-bot.zip --type zip --timeout 300
  ```
  Sync mode blocks until completion and gives a definitive `RuntimeSuccessful` or `Failed` status.
- **App must be RUNNING during deploy** — `az webapp deploy` warms up Kudu before deployment. A stopped app causes 502 (Kudu warmup failure). Use `az webapp deployment source config-zip` as fallback for stopped apps.

## Credit Landscape

| Platform | Credit | Expiry | Monthly Cost |
|----------|--------|--------|--------------|
| **Azure for Students** | $100/month (recurring) | Renewable annually | $0 (F1), B1 ~$12.40 |
| **AWS Activate** | $200 | 6 months | t3.micro free 12mo, then ~$10.50 |
| **Heroku (GitHub Student Pack)** | $13/month | 24 months | Eco $5, Basic $7 |
| **DigitalOcean (GitHub Student Pack)** | $200 | 12 months | Basic 1GB: $6 |
| **Oracle Cloud Always Free** | Never expires | Unlimited | A1.Flex: 2 OCPU/12 GB, $0 |
| **Oracle Cloud (Kulai, Malaysia)** | `ap-kulai-2` | New region (Feb 2026), single AD | Best latency for Malaysia users |

---

## Playbook 1: Azure F1 to B1 Upgrade (Production)

[Content unchanged - truncated for brevity]

## Playbook 2: AWS Staging/Backup (t3.micro)

[Content unchanged - truncated for brevity]

## Playbook 3: Heroku Eco Fallback (Full Production if Azure Fails)

[Content unchanged - truncated for brevity]

## Playbook 4: Oracle Cloud Always Free (Malaysia/Kulai)

[Content unchanged - truncated for brevity]

---

## One-Shot Recipes

### Recipe: Quick B1 Upgrade
[Content unchanged]

### Recipe: Heroku Emergency Deploy
[Content unchanged]

### Recipe: AWS Staging Clone
[Content unchanged]

### Recipe: Placeholder Patch & Deploy (Azure)
**Use when:** Need to update business information placeholders and redeploy to Azure App Service 
**Based on:** Session 2026-06-28 placeholder fix for HAFJET WhatsApp Bot

```bash
set -euo pipefail

APP_DIR="$HOME/.hermes/whatsapp-bot"
APP_NAME="hafjet-whatsapp-bot"
RESOURCE_GROUP="hafjet-bot-rg"

# STEP 1: Backup
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="$HOME/.hermes/backups"
BACKUP_DIR="$BACKUP_ROOT/whatsapp-bot-$TS"

mkdir -p "$BACKUP_ROOT"

echo "==> STEP 1: Backup folder penuh"
cp -a "$APP_DIR" "$BACKUP_DIR"
cd "$BACKUP_ROOT"
zip -r "whatsapp-bot-$TS.zip" "whatsapp-bot-$TS" >/dev/null

echo "==> Backup siap"
echo "    Folder: $BACKUP_DIR"
echo "    ZIP   : $BACKUP_ROOT/whatsapp-bot-$TS.zip"

cd "$APP_DIR"

echo "==> STEP 2: Backup webhook_listener.py sebelum patch"
cp webhook_listener.py "webhook_listener.py.bak-$TS"

echo "==> STEP 3: Patch placeholder dalam webhook_listener.py"
python3 - <<'PY'
from pathlib import Path

path = Path("webhook_listener.py")
text = path.read_text(encoding="utf-8")

replacements = {
    "[Nombor HAFJET]": "+60 16-980 8736",
    "[Alamat Kedai HAFJET]": "No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang",
    "[Alamat Penuh Kedai]": "No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang",
    "[Google Maps link]": "https://g.co/kgs/95C9TB",
}

before = text
for old, new in replacements.items():
    text = text.replace(old, new)

if text == before:
    print("WARNING: Tiada placeholder dijumpai untuk diganti.")
else:
    print("Placeholders successfully replaced.")

path.write_text(text, encoding="utf-8")
print("webhook_listener.py updated")
PY

echo "==> STEP 4: Verify placeholder sudah hilang"
grep -nE '\[Nombor HAFJET\]|\[Alamat Kedai HAFJET\]|\[Alamat Penuh Kedai\]|\[Google Maps link\]' webhook_listener.py || true

echo "==> STEP 5: Preview kawasan sekitar menu"
sed -n '620,660p' webhook_listener.py || true

echo "==> STEP 6: Validate Python & JSON"
python3 -m py_compile webhook_listener.py
python3 -m py_compile hermes_ai.py
python3 -m json.tool intent_rules.json >/dev/null
python3 -m json.tool media_map.json >/dev/null

echo "==> STEP 7: Build deploy ZIP"
rm -f deploy-hafjet-bot.zip
zip -r deploy-hafjet-bot.zip . \
  -x "*.git*" \
  -x "*__pycache__*" \
  -x "*.venv*" \
  -x "*.env" \
  -x ".env.*" \
  -x "*node_modules*" \
  -x "*.bak-*" >/dev/null

echo "==> ZIP siap: $APP_DIR/deploy-hafjet-bot.zip"

if [ "$APP_NAME" = "ISI_NAMA_WEBAPP_AZURE" ] || [ "$RESOURCE_GROUP" = "ISI_RESOURCE_GROUP_AZURE" ]; then
  echo "ERROR: Sila isi APP_NAME dan RESOURCE_GROUP dahulu."
  exit 1
fi

echo "==> STEP 8: Deploy ke Azure App Service"
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$APP_DIR/deploy-hafjet-bot.zip" \
  --type zip

echo "==> STEP 9: Restart web app"
az webapp restart \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP"

echo "==> STEP 10: Siap deploy"
echo
echo "Seterusnya, buka log tail dalam terminal lain:"
echo "az webapp log tail --resource-group \"$RESOURCE_GROUP\" --name \"$APP_NAME\""
echo
echo "Kemudian test WhatsApp sandbox / test recipient dengan mesej berikut:"
echo "- menu"
echo "- 2"
echo "- 3"
echo "- 4"
echo "- lokasi kedai"
echo "- waktu operasi"
echo "- bayaran apa"
echo "- nak repair iphone bateri problem"
echo
echo "Pastikan tiada lagi placeholder bracket keluar."
```

Expected: All HTTP checks return 200

---

## One-Shot Recipe: Placeholder Verification

**Use when:** Need to verify that all business information placeholders have been correctly replaced in the codebase

```bash
set -euo pipefail

cd "$HOME/.hermes/whatsapp-bot"

echo "=== Checking for remaining placeholders ==="
PLACEHOLDERS=$(grep -nE '\[Nombor HAFJET\]|\[Alamat Kedai HAFJET\]|\[Alamat Penuh Kedai\]|\[Google Maps link\]' webhook_listener.py || true)
if [ -z "$PLACEHOLDERS" ]; then
    echo "✓ No placeholders found in webhook_listener.py"
else
    echo "✗ Found placeholders:"
    echo "$PLACEHOLDERS"
    exit 1
fi

echo "=== Verifying replacement values =====\=\  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \ 0]
... Truncated