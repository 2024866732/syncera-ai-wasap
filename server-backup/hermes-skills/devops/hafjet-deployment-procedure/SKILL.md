---
name: hafjet-deployment-procedure
description: "Procedure for deploying HAFJET WhatsApp Bot to Azure with rollback and smoke tests. Ensures zero-downtime, configuration preservation, and quick recovery."
version: 1.0.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [deployment, azure, whatsapp-bot, rollback, smoke-test]
    related_skills: [hafjet-biz-ops, hafjet-infra-setup]

---

# HAFJET WhatsApp Bot - Deployment Procedure

## Overview
This skill outlines the safe deployment process for the HAFJET WhatsApp Bot to Azure App Service, based on lessons learned from production incidents. It emphasizes using version-controlled artifacts, preserving app settings, and verifying health via smoke tests before considering a deployment successful.
## Workflow Order (as per latest guidance)
When multiple streams of work are ready, follow this sequence to maintain stability and deliver value quickly:
1. **Deploy Sprint D (Backend Dashboard API)** – after a clean pre‑commit review and resolution of any config issues (e.g., DASHBOARD_API_KEY), build a version‑controlled ZIP and run the full smoke‑test suite.
2. **Deploy Sprint E (Frontend UI wrapper)** – once the Sprint D backend is verified live, deploy the updated frontend bundle (no backend changes) and run UI‑specific smoke tests.
3. **Experiment with sprint2‑multiagent** – create or update the `sprint2-multiagent` branch from the latest `release/v2.2.0` to explore multi‑agent orchestration; this work stays in a separate branch and does not affect the production release.
4. **Evaluate syncera-ai-wasap linking** – after the multi‑experiment stabilizes, decide whether to link or merge the `syncera-ai-wasap` repository as a shared utility or keep it as an upstream experimental.

## Prerequisites
- Access to Azure CLI with sufficient permissions (Contributor on the Web App).
- The source code committed and pushed to the approved branch (e.g., `release/v2.2.0`).
- A clean, version-controlled ZIP artifact ready (see `build_zip.py` or `git archive`).
- The last known good ZIP artifact (for rollback) retained (e.g., `/tmp/hafjet-prod-v220-final.zip`).

## Deployment Steps

### 1. Prepare the Artifact
- **Do not build on the fly** during deployment. Use a pre-built ZIP from the exact commit to be deployed.
- Example: `git archive -o /tmp/hafjet-prod.zip HEAD`
- Ensure the ZIP excludes: `bot_data.db`, `.git`, `__pycache__`, `node_modules`, `venv`, `*.db`, `*.zip`, `.env`, and any local secrets.
- Verify the ZIP contains the correct `start.sh` (or direct `appCommandLine`) and dependencies.

### 2. Backup Current Configuration (Optional but Recommended)
- Export current app settings:  
  `az webapp config appsettings list --resource-group <rg> --name <app> --query "[].{name:name, value:value}" -o json > /tmp/pre-deploy-settings.json`
- Note current `appCommandLine` and `linuxFxVersion`:  
  `az webapp config show --resource-group <rg> --name <app> --query "{startup:appCommandLine, runtime:linuxFxVersion}" -o json`

### 3. Deploy the ZIP Artifact
- Use the deprecated but reliable `az webapp deployment source config-zip` method (avoids `az webapp deploy --type zip` pitfalls on Linux):
  ```bash
  az webapp deployment source config-zip \
    --resource-group <rg> \
    --name <app> \
    --src /tmp/hafjet-prod.zip
  ```
- Wait for the operation to complete (look for `"status": "RuntimeSuccessful"` in the output).
- **Do not** use `az webapp up` or `az webapp deploy --src-path ... --type zip` as they may overwrite app settings or restart unexpectedly.

### 4. Wait for Stabilization
- After deployment succeeds, wait **60-120 seconds** for the site to warm up and initialize.

### 5. Run Smoke Tests
Execute the following checks in order. If any fail, proceed to rollback immediately.

#### 5.1 Health Endpoint
```bash
curl -fsS --max-time 15 "https://<app>.azurewebsites.net/health" -o /tmp/health.json
python3 -c "import json; d=json.load(open('/tmp/health.json')); assert d.get('status') == 'ok', f'Health check failed: {d}'"
```
Expected: `{"status":"ok", ...}`

#### 5.2 Customers Endpoint
```bash
TOKEN=$(curl -fsS -X POST "https://<app>.azurewebsites.net/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"hafizi@hafjet.com","password":"admin123"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))")
curl -fsS "https://<app>.azurewebsites.net/api/customers?limit=3" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/customers.json
python3 -c "import json; d=json.load(open('/tmp/customers.json')); assert isinstance(d, list) and len(d) > 0, 'Customers endpoint failed'"
```

#### 5.3 Conversation State Endpoint
```bash
curl -fsS "https://<app>.azurewebsites.net/api/handoff/state/60198021500" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/state.json
python3 -c "import json; d=json.load(open('/tmp/state.json')); assert 'mode' in d, 'State endpoint failed'"
```

#### 5.4 Handoff Events Endpoint
```bash
curl -fsS "https://<app>.azurewebsites.net/api/handoff/events/60198021500" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/events.json
python3 -c "import json; d=json.load(open('/tmp/events.json')); assert 'events' in d, 'Events endpoint failed'"
```

#### 5.5 Metrics Endpoint
```bash
curl -fsS "https://<app>.azurewebsites.net/api/handoff/metrics" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/metrics.json
python3 -c "import json; d=json.load(open('/tmp/metrics.json')); assert 'handoff_count' in d, 'Metrics endpoint failed'"
```

#### 5.6 Keyword v2 Flow Test (Optional but Recommended)
```bash
# Create a test rule
RULE_ID=$(curl -fsS -X POST "https://<app>.azurewebsites.net/api/keywords/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test","hello"],"match_type":"contains","sequence":[{"msg":"Hi!"}],"next_actions":{"label":"test"}}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
# Test match
curl -fsS -X POST "https://<app>.azurewebsites.net/api/keywords/v2/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}' -o /tmp/kw_test.json
python3 -c "import json; d=json.load(open('/tmp/kw_test.json')); assert d.get('matched') == True, 'Keyword match failed'"
# Cleanup
if [ -n "$RULE_ID" ]; then
  curl -fsS -X DELETE "https://<app>.azurewebsites.net/api/keywords/v2/$RULE_ID" \
    -H "Authorization: Bearer $TOKEN"
fi
```

### 6. Verify Success
If all smoke tests pass, the deployment is considered successful. Retain the deployed ZIP as the new "last known good" for future rollbacks.

### 7. Rollback Procedure (if any smoke test fails)
- **Do not** attempt to fix the deployment by redeploying the same artifact or changing `appCommandLine`.
- Immediately revert to the last known good ZIP:
  ```bash
  az webapp deployment source config-zip \
    --resource-group <rg> \
    --name <app> \
    --src /tmp/hafjet-prod-v220-final.zip  # <-- replace with your known good ZIP
  ```
- Wait for deployment to complete, then rerun smoke tests.
- If the rollback fails, escalate immediately (may indicate platform issue).

## Key Rules & Pitfalls
- ✅ **Do** use a version-controlled ZIP artifact (from `git archive` or CI build).
- ✅ **Do** preserve app settings; never use `az webapp up` or `--clean` flags that overwrite configuration.
- ✅ **Do** verify the startup command points to Azure paths (e.g., `/home/site/wwwroot/start.sh` or direct `gunicorn` call), not local developer paths.
- ✅ **Do** keep a recent known-good ZIP artifact handy for fast rollback.
- ✅ **Do** use Kudu VFS PUT for single-file deployments: `curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: *" --data-binary @file.txt "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/file.py"` — HTTP 412 for existing files is fixed by reading current ETag first: `curl -sI ... | grep -i etag`, then `-H 'If-Match: "<etag>"'`.
- ✅ **Do** use VFS file-by-file for ALL deploys including dashboard dist — upload assets first (JS/CSS), then atomic `index.html` swap. Tuan Hafizi explicitly prohibits Kudu ZIP API for production deploys: "JANGAN guna Kudu ZIP API, Guna file-by-file VFS ke /site/wwwroot/dashboard/dist/".
- ✅ **Do** read ETag first for existing files: `curl -sI -H "Authorization: Bearer $TOKEN" "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/file.py" | grep -i etag`, then PUT with `-H 'If-Match: "<etag>"'`. HTTP 412 is expected without matching ETag.
- ✅ **Do** delete old hashed assets after new `index.html` references new hashes (optional cleanup, harmless otherwise).
- ❌ **Do not** use Kudu ZIP API for production deploys — it can overwrite unrelated files or fail with 412 ETag conflicts. Use VFS PUT with ETag.
- ✅ **Do** restart via `az webapp stop` → `sleep` → `az webapp start` (not `az webapp restart`) for a clean restart.
- ✅ **Do** deploy ALL companion files together: when `webhook_listener.py` imports new functions from `db_logger.py` or `spx_followup.py`, deploy BOTH files in the same cycle. Deploying only the listener causes startup crash (exit code 3 — container terminates before scheduler starts).
- ✅ **Do** use **lazy import** (try/except ImportError inside the function body) for new Python modules on Azure. Top-level `from spx_followup import X` can cause container startup failure even when the module exists; wrapping it in a function-scoped import allows the scheduler to start and logs a clear error instead of crashing.
- ❌ **Do not** use `az webapp deploy --type zip` on Linux App Service; it often reports success but fails to start the app.
- ❌ **Do not** use Kudu ZIP API `PUT /api/zip/site/wwwroot/<subdir>/` for subdirectory deploys — **it overwrites the entire `/site/wwwroot/` root**, deleting all backend files (`webhook_listener.py`, `db_logger.py`, `start.sh`, `requirements.txt`, etc.) and causing immediate 503/Application Error. This happened on 2026-07-28 when deploying `dashboard/dist/` — the ZIP contained only dashboard assets but the API wiped the whole wwwroot. Recovery required manual VFS PUT of 7+ backend files + `start.sh` recreation + app restart.
- ❌ **Do not** modify code or configuration during the deployment window.
- ❌ **Do not** skip smoke tests; a `RuntimeSuccessful` status does not guarantee the app is responding correctly.
- ❌ **Do not** pipe `curl` to `python3` for Azure log inspection — use `az webapp log tail` or download log files to disk first.
- ✅ **Do** use the Azure Management token resource (`https://management.azure.com`) for Kudu auth, not the app-specific resource. Token length typically ~1400 chars for Management vs ~200 for app-specific.
- ✅ **Do** use the **deploy copilot format** (STEP / ACTION / RESULT, max 3 lines) when Tuan asks you to self-execute a runbook. Tuan expects you to run commands yourself, verify output, and report only the verdict — he does NOT want to paste output back.
- ✅ **Do** use `X-API-Key` (not JWT) for autopilot/browser endpoints. When a `POST /api/spx/*` endpoint is called from Tampermonkey (which only has the API key, not a JWT), the endpoint signature should be `request: Request` (not `staff: dict = Depends(get_current_staff)`). The middleware at line 176 already validates `X-API-Key` against `DASHBOARD_API_KEY` for POST/PUT/DELETE to `/api/spx/*`. Adding `Depends(get_current_staff)` creates a double-auth requirement that the browser cannot satisfy → 401 "Missing or invalid Authorization header".
- ✅ **Do** confirm WHICH bot is live before deploying/adding endpoints. HAFJET runs TWO webhook implementations: the **VPS Flask bot** `whatsapp_webhook_v2.py` (gunicorn on `0.0.0.0:8080`, `.hermes/skills/`) and the **Azure FastAPI bot** `webhook_listener.py` (App Service `hafjet-whatsapp-bot`, `hafjet-bot-rg`). They are NOT interchangeable — check `pgrep -af "whatsapp_webhook|webhook_listener|gunicorn"` on the VPS and `curl -s https://hafjet-whatsapp-bot.azurewebsites.net/health` for the Azure one before assuming which receives Meta webhooks or owns the WhatsApp token. Adding an endpoint (e.g. `/cctv-alert`) to the wrong bot silently does nothing.
- ✅ **Do** use `X-API-Key` (not JWT) for autopilot/browser endpoints. When a `POST /api/spx/*` endpoint is called from Tampermonkey (which only has the API key, not a JWT), the endpoint signature should be `request: Request` (not `staff: dict = Depends(get_current_staff)`). The middleware at line 176 already validates `X-API-Key` against `DASHBOARD_API_KEY` for POST/PUT/DELETE to `/api/spx/*`. Adding `Depends(get_current_staff)` creates a double-auth requirement that the browser cannot satisfy → 401 "Missing or invalid Authorization header".
- ✅ **Do** pull the LIVE file from Azure before single-file VFS patches — the local repo copy is NOT the production source of truth. The live `webhook_listener.py` on Azure was **3628 lines** (dashboard, WebSocket, JWT auth, db_logger, blast, keywords v2, etc.) while the syncera repo copy was **414 lines** (old v2.0). Patching the local copy and VFS-PUTting it would have REPLACED the whole production bot with a stripped-down version (immediate loss of dashboard/WS/DB features, likely startup crash from missing `db_logger` imports). Always: `curl -H "Authorization: Bearer $MGMT_TOKEN" "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/webhook_listener.py" -o /tmp/azure_live.py`, patch THAT file, `python3 -m py_compile` it, then VFS PUT (204 = success). Keep a pre-patch backup for rollback.
- ✅ **Do** VERIFY each new appsetting actually landed after a bulk `az webapp config appsettings set`. A single call applying 20 existing + 3 new settings silently dropped 2 of the 3 new keys (CCTV_ALERT_TOKEN and CCTV_ALERT_TARGET missing; only CCTV_ALERT_ENABLED survived) while reporting success. Re-query: `az webapp config appsettings list -g <rg> -n <app> --query "[?contains(name,'CCTV')].{name:name,value:value}" -o table` and re-apply missing keys individually. Do not trust the set command's output — it can be truncated/partial.
- ✅ **Do** use `az webapp stop` → `sleep 5` → `az webapp start` and then allow 60-90 s warmup; first curl after restart may time out (HTTP 000) while the container boots — retry after 40-60 s, don't assume the deploy failed.
- ✅ **Do** investigate 502/503 startup failures by checking the **StartupLogs failure log**: container exit code 3 = Python import/syntax error, exit code 137 = OOM kill. Download the remote file and `python3 -m py_compile` it locally to rule out syntax errors. If compile passes locally but startup fails on Azure, the likely cause is a missing companion module import (e.g. deployed `webhook_listener.py` imports new functions from `db_logger.py`, but `db_logger.py` on Azure is the old version without those functions).

## Post-Deployment
- Monitor logs for anomalies: `az webapp log tail --resource-group <rg> --name <app>`.
- Reset any temporary configuration changes made during testing.
- Document any deviations for future improvement.

## References
- See `references/deployment-notes.md` for detailed Azure App Service quirks.
- See `references/deployment-lessons-2026-07-21.md` for deployment incidents and recovery patterns.
- See `references/spx-command-pack-conventions.md` for SPX command pack workflow.
- See `references/deploy-copilot-format.md` for the STEP/ACTION/RESULT report format.
- See `references/kudu-zip-api-disaster-2026-07-28.md` for the Kudu ZIP root-wipe incident and recovery.
- See `references/whatsapp-delivery-24h-window.md` for WhatsApp 24h window / template messages / error 131047. (Added 2026-08-08)
- See `templates/deploy-checklist.txt` for a printable step-by-step checklist.