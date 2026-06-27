# Azure `az webapp up` Deployment Pattern (HAFJET)

**Date:** 2026-06-27
**Context:** Deploying FastAPI app to Azure Linux Web App with Oryx build automation

## Overview

`az webapp up` is the recommended single-command deploy for Azure Linux web apps. It:
1. Zips the source folder
2. Uploads to Kudu
3. Runs Oryx build (pip install if `SCM_DO_BUILD_DURING_DEPLOYMENT=true`)
4. Starts the app

## Prerequisites

```bash
# App settings that MUST be set before first deploy:
az webapp config appsettings set -g <rg> -n <app> --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  WEBSITES_PORT=8000
```

## requirements.txt Must Include ALL Dependencies

Oryx runs `pip install -r requirements.txt` during build. If a package is missing, the app crashes on startup.

**For HAFJET (gunicorn + FastAPI + WebSocket):**
```
fastapi==0.115.0
uvicorn==0.30.6
gunicorn==23.0.0
httpx==0.27.2
python-dotenv==1.0.1
wsproto==1.3.2
```

**CRITICAL:** `gunicorn` MUST be in requirements.txt. If missing, `python3 -m gunicorn` fails with `ModuleNotFoundError`.

## start.sh Pattern (NO pip install!)

```bash
#!/bin/bash
set -e
cd /home/site/wwwroot
python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:${WEBSITES_PORT:-8000} --timeout 120 --ws wsproto
```

**Rules:**
- NO `pip install` — Oryx handles dependencies at deploy time
- NO `apt-get` — not allowed in startup script
- NO long-running setup — only launch the web server
- Use `python3 -m gunicorn` (not bare `gunicorn`) — PATH may not include gunicorn binary

## Deploy Command

```bash
cd /path/to/app/source
az webapp up \
  --runtime PYTHON:3.11 \
  --resource-group <rg> \
  --name <app> \
  --plan <existing-plan> \
  --sku B1 \
  --logs
```

## Post-Deploy: Set Entry Point via REST API

Oryx auto-detects `application:app` as default. If your entry point differs, set it via REST API:

```bash
az rest --method PATCH \
  --uri "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/config/web?api-version=2022-03-01" \
  --body '{"properties":{"appCommandLine":"python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto"}}'
```

**NOTE:** `az webapp config set --generic-configurations` does NOT work for existing apps. REST API is required.

## Nuclear Option: Disable Oryx Auto-Detect

If Oryx still ignores your `appCommandLine` and auto-detects `application:app`, disable Oryx entirely:

```bash
az webapp config appsettings set -g <rg> -n <app> --settings ENABLE_ORYX_BUILD=false
```

With `ENABLE_ORYX_BUILD=false`, Oryx does NOT run. You must provide a complete `start.sh` that handles everything (but still no `pip install` — use `az webapp deploy` with `--skip-first-deployment` or pre-install via `az webapp config appsettings set --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true` on a previous deploy).

**Trade-off:** You lose automatic Python dependency installation. You must either:
1. Deploy with `SCM_DO_BUILD_DURING_DEPLOYMENT=true` once (Oryx installs), then set `ENABLE_ORYX_BUILD=false` for subsequent deploys
2. Use a custom Docker image instead

**When to use:** Only if `appCommandLine` via REST API + `STARTUP_COMMAND` app setting both fail to produce the correct entry point.

## Startup Time Budget

| Phase | Duration | Notes |
|-------|----------|-------|
| Oryx build (pip install) | ~142s | First deploy or when build triggered |
| gunicorn import + DB init | ~5-10s | webhook_listener import + SQLite init |
| Health check probe | ~53s | Azure internal warmup |
| **Total to first response** | **~200s** | Do NOT test before this |

## Common Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 on all routes | Oryx used `application:app` | Set `appCommandLine` via REST API |
| 503 timeout | `pip install` in start.sh | Remove from start.sh, use Oryx |
| 503 after restart | Oryx rebuild triggered | Wait 200s before testing |
| `ModuleNotFoundError: gunicorn` | Not in requirements.txt | Add `gunicorn==23.0.0` |
| Subscription throttle | Too many plan create/delete | **STOP immediately.** `Retry-After: 5` header is deceptive — actual window is 15+ min. Reuse plans; never delete last web app on a plan. |
| `JSONResponse` TypeError | Used `detail=` instead of `content=` | Fix code, redeploy |

## Region Availability

Not all regions are available for all subscriptions. Test with:
```bash
az appservice list-locations --sku B1
```

If `Malaysia West` is blocked, use `Southeast Asia` (Singapore) — closest to MY.
