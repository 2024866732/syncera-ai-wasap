# Azure Linux App Service: Python Cache + Startup Probe Pitfalls

Collected from multiple deployment cycles (Jul 2026) on `hafjet-whatsapp-bot` (B1 Free tier, Python 3.11).

## Critical: startup.txt Overrides start.sh

**Symptom:** App fails to start with exit code 127 after deploying via zip. `appCommandLine` is `bash start.sh` but container still exits immediately.

**Root cause:** Oryx (the Azure build system) checks for `startup.txt` in `/home/site/wwwroot/`. If it exists, Oryx **uses that as the startup command instead of `appCommandLine`**. The `startup.txt` in the HAFJET repo contains a local development path (`~/.hermes/whatsapp-bot`) which does not exist on Azure — command fails with exit code 127.

**Fix:** NEVER include `startup.txt` in deployment zips to Azure. If it exists on the server from a previous deploy, overwrite with empty content or delete via Kudu VFS.

## Python `.pyc` Cache Survives Full File Replacement

**Symptom:** After deploying a completely new `webhook_listener.py`, `/openapi.json` still shows old routes. New endpoints return 404. The deploy reports success but the app behaves as if old code is running.

**Root cause:** `__pycache__/*.pyc` files survive zip extraction. If the `.pyc` is newer than the `.py` source, Python loads bytecode without recompiling. This can happen when timestamps differ between extraction and gunicorn import.

**Fix — clear cache in `start.sh` BEFORE gunicorn:**
```bash
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete 2>/dev/null
```

**Also set:** `PYTHONDONTWRITEBYTECODE=1` as App Setting (prevents new `.pyc` but does NOT clear existing).

## `az webapp deploy --type zip` Does NOT Trigger Oryx Build

Even with `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `az webapp deploy --type zip` only extracts files — Oryx never runs. Build reports "0 seconds".

**Oryx build triggers:**
- `az webapp deployment source config-zip` (deprecated but works) — triggers full Kudu zipdeploy + Oryx
- Git deployment
- `az webapp up`

**Workaround:** Use `start.sh` that installs dependencies on startup:
```bash
pip3 install --no-cache-dir -r requirements.txt 2>&1
gunicorn ...
```
This adds 60-120s to cold starts (pip install time).

## Startup Probe Kills Container at ~42s

**Symptom:** Fresh deploy never comes up. Azure warmup probe kills container before pip install finishes.

**Docker log evidence:**
```
Site startup probe failed after 42.7751943 seconds.
Container has finished running with exit code: 1.
```

**Fix — extend probe timeout:**
```bash
az webapp config appsettings set --name <app> -g <rg> \
  --settings WEBSITES_CONTAINER_START_TIME_LIMIT=300
```

## `az webapp deploy --type startup` Changes `appCommandLine`

Uploads the script and sets `appCommandLine` to reference it — can break the app if the script has path issues. Safer: include `start.sh` in a zip deploy instead.

## Repairing a Blocked App

Multiple consecutive failures → Azure blocks the site:
```
Site is blocked due to multiple, consecutive cold start failures.
```

**Fix:**
1. `az webapp stop -n <app> -g <rg>`
2. Wait 20s
3. Fix the root cause (start.sh, startup.txt, appCommandLine)
4. `az webapp start -n <app> -g <rg>`

Do NOT repeatedly restart — each failure increases the block counter.

## `az` Credential Redaction

The Hermes terminal security system REDACTS publishing credentials from `az` CLI output. `publishingUserName` and `publishingPassword` appear as `REDACTED` (8 chars). This breaks all Kudu VFS calls from Python.

**Workaround:** Use `az webapp deploy` (handles auth internally, doesn't expose credentials in output) or Azure Portal Kudu Console for manual operations.
