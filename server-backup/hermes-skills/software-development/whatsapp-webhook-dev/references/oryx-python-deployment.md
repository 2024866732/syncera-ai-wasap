# Oryx Python Deployment on Azure App Service Linux

## The Oryx Build Pipeline

When you deploy a ZIP to Azure App Service Linux with `SCM_DO_BUILD_DURING_DEPLOYMENT=true`:

1. **ZIP upload** → Kudu extracts to `/home/site/wwwroot/`
2. **Oryx detects** `requirements.txt` → runs `pip install` into a virtualenv
3. **Oryx packs** everything (source + venv) into `output.tar.zst`
4. **Oryx DELETES** all `.py` source files from `/home/site/wwwroot/`
5. **At cold start**, Oryx extracts `output.tar.zst` → `/tmp/<RANDOM_ID>/`
6. **Oryx sets** `PYTHONPATH=/opt/startup/app_logs:/tmp/<RANDOM_ID>/antenv/lib/python3.11/site-packages`
7. **Your `start.sh`** runs with `PWD=/tmp/<RANDOM_ID>/`

## What `/home/site/wwwroot/` Contains After Oryx Build

```
output.tar.zst          ← everything packed here
oryx-manifest.toml      ← Oryx build manifest
requirements.txt        ← copied from ZIP
hostingstart.html       ← Azure default page
startup_debug.log       ← previous debug output (if any)
```

**NO `.py` files. NO `start.sh`. NO source code.**

## Why Static Paths Fail

```bash
# ❌ WRONG — files don't exist here after Oryx
cd /home/site/wwwroot
python3 -m gunicorn webhook_listener:app ...

# ❌ WRONG — PYTHONPATH doesn't help if you're in the wrong dir
export PYTHONPATH=/home/site/wwwroot:$PYTHONPATH
```

## The Dynamic Find Pattern

```bash
#!/bin/bash
set -e

# Find the actual app location (random /tmp path changes each cold start)
APP_FILE=$(find /tmp /home -name "webhook_listener.py" 2>/dev/null | head -1)
if [ -z "$APP_FILE" ]; then
  echo "ERROR: webhook_listener.py not found"
  exit 1
fi

APP_DIR=$(dirname "$APP_FILE")
export PYTHONPATH="$APP_DIR:$PYTHONPATH"
cd "$APP_DIR"

exec python3 -m gunicorn \
  -w 1 \
  -k uvicorn.workers.UvicornWorker \
  webhook_listener:app \
  --chdir "$APP_DIR" \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
```

## Debugging Oryx Deployments

Use `az webapp log startup show` — it captures ALL container stdout, including your `echo` statements. The log persists across crashes.

**Diagnostic pattern in start.sh:**
```bash
echo "=== STARTUP DEBUG ==="
echo "PWD: $(pwd)"
ls -la /home/site/wwwroot/ 2>&1 || true
find /tmp /home -name "*.py" 2>/dev/null | head -20
```

**In logs, look for:**
- `ContainerStream:` lines — your echo output
- `App path is set to '/tmp/...'` — confirms Oryx extraction path
- `Updated PYTHONPATH to '...'` — shows what Oryx set
- `ModuleNotFoundError` — missing file in ZIP or wrong path

## Common Mistakes

1. **Missing files in ZIP** — only hardcoded filenames included. Fix: `for f in os.listdir('.'): if f.endswith('.py'): zf.write(f, f)`
2. **Static cd to /home/site/wwwroot** — files aren't there at runtime
3. **Assuming WEBSITES_PORT** — for built-in Python, use hardcoded `0.0.0.0:8000` (WEBSITES_PORT is for custom containers)
4. **Gunicorn not in requirements.txt** — Oryx installs from requirements.txt, gunicorn must be listed
5. **Health check on wrong path** — set `healthCheckPath=/health` in site config
6. **Excluding `dashboard/dist/` from ZIP** — a global `dist/` exclude pattern in the deploy script also excludes `dashboard/dist/` (the React SPA build). Result: `/health` works but `/dashboard` returns 404 or JSON error. **Fix:** only exclude root-level `dist/`, not subdirectories. In the ZIP builder:
   ```python
   # Exclude root-level dist/build but NOT dashboard/dist
   ROOT_DIRS_EXCLUDE = {'dist', 'build'}
   def should_exclude_dir(dirpath, dirname):
       full = os.path.join(dirpath, dirname)
       if full in ('./dist', './build'):
           return True
       # ... rest of excludes
   ```
   Then deploy with `dashboard/dist/` included. Verify with: `unzip -l hafjet-prod.zip | grep dashboard/dist` — should show `index.html` and `assets/`.

## Session Evidence (2026-06-28)

This pattern was confirmed through 8+ deployment attempts:
- Attempt 1-2: `No module named 'webhook_listener'` — static path to /home/site/wwwroot
- Attempt 3-4: Same error — PYTHONPATH set but Oryx overrides it
- Attempt 5: `find` works → `webhook_listener.py` found at `/tmp/8ded4fc60f7e46e/`
- Attempt 6: `No module named 'hermes_ai'` — file missing from ZIP (only 4 files were hardcoded)
- Attempt 7: All `.py` included → `IMPORT OK` → gunicorn starts → **HTTP 200 on /health** ✅

**Key insight:** Oryx deletes `.py` from `/home/site/wwwroot` AND packs everything into `output.tar.zst`. The zip must include ALL `.py` files (not a hardcoded list of 4-5), and `start.sh` must dynamically `find` the app on each cold start.
