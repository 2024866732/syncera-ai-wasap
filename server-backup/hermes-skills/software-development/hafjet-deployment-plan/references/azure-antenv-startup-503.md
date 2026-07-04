# Azure `antenv` Startup & 503 Troubleshoot (2026-07-04)

## Context
Sprint v2.1.1 deploy for HAFJET WhatsApp Bot. Deployed via `az webapp deploy --type zip`, app went to 503/timeout for 10+ minutes. Root cause: Oryx had built dependencies into `antenv`, but `appCommandLine` was set to `bash start.sh` (old pattern), then switched to system `gunicorn` (missing deps).

## Timeline

| Time | Event |
|------|-------|
| 11:16 | `az webapp deploy --type zip` — timed out at 180s (still "Starting the site...") |
| 11:19 | Health returns 000 (timeout), then 503 |
| 11:20-11:24 | Multiple 503/timeout cycles |
| 11:22 | Found `appCommandLine` = `bash start.sh` → changed to direct `gunicorn ...` |
| 11:26 | Still 000/timeout — container restarting |
| 11:29 | `az webapp deployment source config-zip` → Oryx build: **165s, 28 packages installed in `antenv`** |
| 11:34 | Build complete, "Starting the site..." timed out at 300s |
| 11:36 | Health returns 503 (progress! from 000 timeout) |
| 11:38 | Changed `appCommandLine` to `cd /home/site/wwwroot && antenv/bin/gunicorn ...` |
| 11:43 | Still 503 |
| 11:49 | Last attempt with `bash -c '...'` blocked by timeout |

## Root Cause Chain

1. **ZIP deploy did NOT trigger full Oryx build** — `az webapp deploy --type zip` skipped pip install even with `SCM_DO_BUILD_DURING_DEPLOYMENT=true`. Build time showed `0(s)` or minimal.
2. **`config-zip` DID trigger full build** — Forced Oryx to create `antenv` with all 28 packages.
3. **`appCommandLine` pointed to system gunicorn** — After `config-zip` build, the startup command was still using system `gunicorn` which has no project dependencies. Packages only exist in `antenv`.
4. **`antenv` is Oryx's hardcoded virtualenv name** — Always `antenv`, never `venv`.

## Key Commands Used

### Force Oryx rebuild
```bash
az webapp deployment source config-zip -g hafjet-bot-rg -n hafjet-whatsapp-bot --src /tmp/hafjet-prod.zip --timeout 300
```

### Set startup to use antenv gunicorn
```bash
az webapp config set -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --startup-file "antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120"
```

### Check current appCommandLine
```bash
az webapp config show -g hafjet-bot-rg -n hafjet-whatsapp-bot --query "appCommandLine" -o tsv
```

### Download deployment logs
```bash
az webapp log download -g hafjet-bot-rg -n hafjet-whatsapp-bot --log-file /tmp/logs.zip
python3 -c "import zipfile; z=zipfile.ZipFile('/tmp/logs.zip'); print(z.namelist())"
```

### Read Oryx build log (from deployment log, NOT container log)
The deployment log is at `deployments/<active-id>/log.log` in the log zip. It shows:
- `Python Virtual Environment: antenv`
- `Creating virtual environment...`
- Package install list with versions

## Detection: Is the Build Running?

When `az webapp deploy` shows:
```
Status: Build successful. Time: 0(s)
```
→ Build was **SKIPPED** (cache hit). Oryx did NOT install packages.

When `config-zip` shows:
```
Status: Building the app... Time: 2(s)
Status: Building the app... Time: 21(s)
...
Status: Building the app... Time: 165(s)
Status: Build successful. Time: 165(s)
```
→ Build RAN. Packages installed. `antenv` exists.

## Verification: Does antenv exist?

```bash
# Via Kudu VFS API (if SCM site is accessible)
curl -u "$USER:$PASS" "https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/antenv/bin/"

# Via deployment log (offline)
# grep for 'Python Virtual Environment:' in the deployment log.log
```

## Pitfalls

- **`az webapp deploy --type zip` may skip build silently** — Even when `SCM_DO_BUILD_DURING_DEPLOYMENT=true`. The 0s build time is the telltale sign.
- **`appCommandLine` with shell chaining** — `cd dir && cmd` may not parse correctly. Use absolute path directly.
- **Restart after `config-zip`** — Build may complete but app stays at 503. Run `az webapp restart` separately.
- **`az webapp log tail` may hang** — Use `az webapp log download` with Python zipfile extraction instead (no `unzip` CLI on the VM).
- **Deployment log vs Container log** — Oryx build status is in the **deployment log** (under `deployments/<id>/log.log`). Container startup errors are in **docker.log** and **containerStream.log**.
