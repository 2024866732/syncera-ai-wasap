# Azure Deploy: Oryx, Start Script & Worker Pitfalls (Jul 2026)

## Oryx Override Pitfall

**If `SCM_DO_BUILD_DURING_DEPLOYMENT=true` or `ENABLE_ORYX_BUILD=true`, Oryx silently OVERWRITES your custom `start.sh` with its own generated version.** Oryx generates a `start.sh` that uses `antenv/bin/gunicorn` — which fails if `antenv` doesn't exist.

Even on `--type zip` deploy, Oryx treats the extracted files as "source" and runs its Python build pipeline:
1. Creates/activates `antenv` virtual environment
2. Runs `pip install -r requirements.txt`
3. **Overwrites `start.sh`** with Oryx's version
4. Regenerates startup script

### Fix before every deploy

```bash
az webapp config appsettings set -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false

# Verify:
az webapp config appsettings list -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --query "[?name=='SCM_DO_BUILD_DURING_DEPLOYMENT' || name=='ENABLE_ORYX_BUILD'].{n:name,v:value}" -o table
# Expected: both "false"
```

**Note:** Changing these settings triggers an app restart. Wait for the app to finish restarting before deploying.

## start.sh — No antenv Fix

Azure Linux containers do NOT reliably support `antenv` virtualenv across restarts. Use system Python directly:

```bash
#!/bin/bash
cd /home/site/wwwroot
# Clear any stale Python bytecode cache — prevents old code from running
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete 2>/dev/null
# Install dependencies (no antenv)
pip3 install --no-cache-dir -r requirements.txt 2>&1 || python3 -m pip install --no-cache-dir -r requirements.txt 2>&1
# Start gunicorn
exec gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 600

**Current (Jul 2026):** `-w 1` with DB-backed sync progress (`spx_sync_state` table).
```

**Caveat:** `pip install` runs at every startup, adding 60-120s to restart time. Azure's health probe has ~42s timeout, so the app may show "Application Error" during installation. It recovers once `pip` finishes.

## Gunicorn Worker Count & In-Memory State

**`-w 2` with in-memory global state (`_sync_progress`, etc.) causes split-brain:** Worker A handles the sync trigger (sets `running=True`), but Worker B handles the progress poll (reads `running=False`). The frontend never sees progress updates.

**Impact on SPX sync:** `POST /api/spx/sync` returns 202 Accepted on Worker A, but `GET /api/spx/sync-progress` hits Worker B which still shows `phase=idle`.

### Fixes (pick one)

1. **Quick fix:** Change to `-w 1` in start.sh (loses parallel request handling)
2. **✅ Proper fix (current):** Store sync progress in SQLite `spx_sync_state` table with `save_sync_progress()` at every phase change — no split-brain, survives restarts
3. **Compromise:** Use `-w 1` during active sync windows, `-w 2` otherwise

## Multi-worker Side Effects on SPX

- **Phone fetch 504 timeout:** `POST /api/spx/fetch-phones` processes 25 phones with 0.5s delay each → ~37s per batch, but Azure's 230s limit and workers splitting traffic creates timeouts. **Fix:** reduce `_SYNC_PHONE_BATCH` from 25 to 10.
- **Sync status stuck:** Always verify on the CORRECT worker by checking `/_sync_progress` immediately after triggering. If it stays `idle`, the sync request hit a different worker.

## deploy_version Marker

Always update the version string when deploying new code. Search for `spx-incremental-sync-v1-2026-07-08` (or current version) and replace all occurrences:

```bash
grep -n 'spx-incremental-sync-v1-2026-07-08' webhook_listener.py
# Returns 3 lines — patch all 3
```

Version marker is visible at `/api/spx/session-status` (requires JWT auth).
