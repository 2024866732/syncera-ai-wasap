# Azure App Service Startup Issues — WhatsApp Bot Deployment

Common issues when deploying FastAPI WhatsApp bots to Azure App Service Linux containers.

## 1. SQLite DB Path Detection

**Problem:** `os.path.expanduser("~")` resolves to `/root` in Azure App Service, but the app runs from `/home/site/wwwroot`. Hardcoded paths fail.

**Root cause:** Azure sets `HOME=/root` but app files live in `/home/site/wwwroot`.

**Fix — Definitive Azure detection:**
```python
import os

_is_azure = bool(os.environ.get("WEBSITE_SITE_NAME"))
if _is_azure:
    DB_PATH = "/home/site/wwwroot/bot_data.db"
else:
    DB_PATH = os.path.expanduser("~/.hermes/whatsapp-bot/bot_data.db")
```

**Why `WEBSITE_SITE_NAME`:** This env var is always set in Azure App Service and is the most reliable indicator. `HOME` can be `/root` or `/home/site/wwwroot` depending on the worker.

**Anti-pattern (does NOT work):**
```python
# ❌ HOME is /root in Azure, not /home/site/wwwroot
_azure_root = os.environ.get("HOME", "")
if _azure_root == "/home/site/wwwroot":  # Never matches!
    DB_PATH = ...
```

## 1.5. Blank Dashboard Page — Vite `base` Path Mismatch

**Symptom:** `/dashboard` loads `index.html` but page is completely blank. No visible errors. Browser Network tab shows 404 for `/assets/*.js` and `/assets/*.css`.

**Root cause:** Vite `base` is `/` (default) but app is served under `/dashboard`. Generated HTML references `/assets/index-xxx.js` — browser requests `https://app.azurewebsites.net/assets/...` (root) which doesn't exist. FastAPI only serves at `/dashboard/assets/...`.

**Fix:**
```js
// vite.config.js
export default defineConfig({
  base: '/dashboard/',  // MUST match serve subpath
  // ...
});
```

Also update `index.html`: change `href="/favicon.svg"` to `href="./favicon.svg"`.

**Verify fix:** After rebuild + redeploy, `/dashboard/assets/index-xxx.js` should return 200.

## 2. Static Files Mount for React SPA (FastAPI)

**Problem:** Serving a React/Vite dashboard build from FastAPI alongside existing API routes and WebSocket endpoints.

**Solution — Correct mount order is critical:**

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Mount static assets FIRST (order matters in FastAPI)
DASHBOARD_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "dashboard", "dist"
)
if os.path.exists(DASHBOARD_PATH):
    app.mount(
        "/dashboard/assets",
        StaticFiles(directory=os.path.join(DASHBOARD_PATH, "assets")),
        name="dashboard-assets",
    )

# Catch-all routes MUST be defined BEFORE `if __name__` block (gunicorn loads them)
@app.get("/dashboard/{full_path:path}")
async def serve_dashboard(full_path: str):
    index_file = os.path.join(DASHBOARD_PATH, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"error": "Dashboard not built"})

@app.get("/dashboard", include_in_schema=False)
async def serve_dashboard_root():
    index_file = os.path.join(DASHBOARD_PATH, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"error": "Dashboard not built"})
```

**Key rules:**
1. `app.mount("/dashboard/assets", ...)` must be registered BEFORE the catch-all route
2. Catch-all decorator `@app.get("/dashboard/{full_path:path}")` must be the LAST registered route
3. Routes MUST be at module level (before `if __name__ == "__main__"`) — gunicorn only imports the module once; routes inside `if __name__` are never loaded
4. Always guard with `if os.path.exists(DASHBOARD_PATH)` — return error JSON, never crash
5. Use `include_in_schema=False` on `/dashboard` root to keep API docs clean

**Vite config for SPA served from `/dashboard`:**
```js
// vite.config.js
export default {
  base: "/dashboard/",  // Match the mount path
  build: {
    outDir: "dist",
    assetsDir: "assets",
  }
}
```

**Alternative:** Host dashboard separately (Azure Static Web Apps, GitHub Pages) to avoid any route conflicts.

## 3. `init_db()` Not Running in Gunicorn

**Problem:** `if __name__ == "__main__": init_db()` never executes when running under gunicorn in Azure.

**Fix:** Use FastAPI lifespan event:
```python
@app.on_event("startup")
async def startup_event():
    init_db()  # Runs on every worker startup
```

## 4. Startup Probe Timeout (ContainerTimeout)

**Problem:** Azure startup probe times out (230s default) if DB init + dependency install takes too long. Error: `Container did not start within expected time limit of 230s`.

**Root cause (MOST COMMON):** `pip install -r requirements.txt` in `start.sh`. On every container restart, Azure runs `start.sh` which reinstalls all packages — this takes 30-60s+ and the startup probe kills the container before gunicorn can bind to the port.

**Evidence pattern in logs:**
```
Status: Building the app... Time: 79(s)
Status: Build successful. Time: 95(s)
Status: Starting the site... Time: 110(s)
... (keeps "Starting the site..." until timeout)
Container did not start within expected time limit of 230s (or 600s if overridden)
Site startup probe failed after 38.0 seconds
```

**THE FIX — 3 rules:**

1. **NEVER run `pip install` in `start.sh`.** The startup script must ONLY launch the web server.
2. **Use `SCM_DO_BUILD_DURING_DEPLOYMENT=true`** — Oryx runs `pip install -r requirements.txt` at deploy time (not startup). The build runs BEFORE the container starts, so the health check only triggers after dependencies are ready.
3. **Keep `init_db()` fast** — simple `CREATE TABLE IF NOT EXISTS` only.

**Correct `start.sh` (minimal, no pip install):**
```bash
#!/bin/bash
set -e
cd /home/site/wwwroot
python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:${WEBSITES_PORT:-8000} --timeout 120 --ws wsproto
```

**Deploy with `az webapp up` (handles build + deploy in one command):**
```bash
az webapp up \
  --runtime PYTHON:3.11 \
  --resource-group <rg> \
  --name <app> \
  --plan <existing-plan> \
  --sku B1 \
  --logs
```

**Why `az webapp up` over `az webapp deploy --type zip`:** `az webapp up` runs the Oryx build (pip install) as part of deployment, then starts the container. `az webapp deploy --type zip` does NOT run build automation by default — you must set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` separately, and even then the timing can cause issues.

**App settings for this pattern:**
```
SCM_DO_BUILD_DURING_DEPLOYMENT = true
WEBSITES_CONTAINER_START_TIME_LIMIT = 600  (NOTE: this setting may not actually work via CLI — see below)
WEBSITES_HEALTH_CHECK_TIMEOUT = 300
```

**⚠ `WEBSITES_CONTAINER_START_TIME_LIMIT` does NOT work via `az webapp config appsettings set`:** This setting appears in app settings but does NOT change the actual container start time limit. The `siteConfig.containerStartTimeLimit` field remains `None` even after setting the app setting. This is a known Azure limitation — the only reliable fix is to make the startup script fast (no pip install).

**Diagnostic proof that app works:** If the app EVER started successfully (check old success logs), the code is fine. The problem is purely startup timing. Don't redeploy repeatedly — fix the startup script instead.

## 5. Log Streaming Delay

**Problem:** `az webapp log tail` shows stale output from previous deployment.

**Fix:** Download logs directly:
```bash
az webapp log download --resource-group <rg> --name <app> --log-file /tmp/logs.txt
cd /tmp && python3 -c "
import zipfile
with zipfile.ZipFile('logs.txt') as z:
    names = [n for n in z.namelist() if 'containerStream' in n]
    latest = sorted(names)[-1]
    content = z.read(latest).decode('utf-8', errors='replace')
    for line in content.split('\n')[-30:]:
        if line.strip(): print(line)
"
```

## 6. WebSocket in Azure App Service

**Problem:** WebSocket connections return HTTP 403 with empty body.

**Root cause (NOT Azure tier limitation):** The 403 is caused by a **missing `WebSocket` type annotation** on the FastAPI handler parameter. Without `websocket: WebSocket`, FastAPI treats the name as a query parameter, Pydantic validation fails, and FastAPI sends `websocket.close` (code 1008) — which uvicorn logs as 403. This happens on ALL tiers including Basic.

**Fix:**
```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):  # ← type annotation required
    await websocket.accept()
```

**Optional:** Enable Web Sockets in Azure Portal → Configuration → General Settings → "Web sockets: On" (harmless, may help with proxy-level WebSocket passthrough).

**Also optional:** Add `--ws wsproto` to gunicorn startup + `wsproto==1.3.2` in requirements.txt for a lighter WebSocket implementation. This is NOT required for the fix.

**Key lesson:** WebSocket works perfectly on Free F1 tier when the code is correct. Never blame the tier — always reproduce locally first.

## 7. Deployment Zip Best Practice

**Always exclude:** `.env`, `__pycache__/`, `*.pyc`, `deploy.zip`, `bot_data.db`, `node_modules/`, `.git/`

**⚠ CRITICAL: `__pycache__` causes stale routes in production**

**Problem:** After updating `webhook_listener.py` with new routes (e.g., dashboard catch-all), the server still returns 404 for new routes. `/health` works (old route) but `/dashboard` returns 404. `openapi.json` only shows old paths.

**Root cause:** Python's `__pycache__/webhook_listener.cpython-311.pyc` contains the old bytecode. When the new source file is older than the `.pyc` file (e.g., due to file restoration or zip extraction timing), Python uses the cached bytecode — routes are never registered from the new source.

**Symptoms observed:**
- Routes exist in source code but not in `/openapi.json`
- `/health` (old route) returns 200, `/dashboard` (new route) returns 404
- `app.routes` inspection shows new routes registered, but live server doesn't serve them
- `curl /docs` works but new endpoints are missing from docs

**Fix — ALWAYS clear cache before starting:**
```bash
# Before starting server (local or Azure)
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
python3 -m uvicorn webhook_listener:app --reload
```

**For Azure deployment:** The zip file should NOT contain `__pycache__` directories (they're excluded). But if a previous deployment left cached files, Kudu may reuse them. Add to startup command:
```bash
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null; gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000
```

**Python zipfile (universal):**
```python
import zipfile, os
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ['__pycache__', '.git', 'node_modules']]
        for f in files:
            if f.endswith('.pyc') or f == '.env' or f == 'deploy.zip' or f == 'bot_data.db':
                continue
            filepath = os.path.join(root, f)
            zf.write(filepath, filepath.replace('./', ''))
```

**⚠ Zip size explosion from `node_modules`:**

**Problem:** `dashboard/node_modules/` is ~123MB. Including it in the deployment zip causes:
- Zip creation timeout (>2 minutes on 1GB RAM server)
- Deployment timeout on Azure
- Wasted bandwidth

**Fix — Exclude `dashboard/` entirely, then add `dashboard/dist/` separately:**
```python
EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', 'dashboard'}

files = []
for root, dirs, filenames in os.walk('.', topdown=True):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
    for f in filenames:
        if f.endswith(('.pyc', '.pyo')) or f in ('.env', 'deploy.zip', 'bot_data.db'):
            continue
        full = os.path.join(root, f)
        files.append((full, os.path.relpath(full, '.')))

# Add dashboard/dist separately (not through 'dashboard' walk)
dd = os.path.join('dashboard', 'dist')
if os.path.exists(dd):
    for root, dirs, filenames in os.walk(dd):
        for f in filenames:
            full = os.path.join(root, f)
            files.append((full, os.path.relpath(full, '.')))
```

**⚠️ Duplicate zip names when walking `.` and `dashboard/dist/`:**

**Problem:** When using `os.walk('.')` to build the zip, it enters `dashboard/` and finds `dashboard/dist/` naturally. If you then also explicitly walk `dashboard/dist/` and add those files again, you get `UserWarning: Duplicate name: 'dashboard/dist/index.html'`. The zip still works but is wasteful.

**Fix — Exclude `dashboard` from main walk, add `dashboard/dist` separately:**
```python
EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', 'dashboard'}

with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    # Core files (exclude dashboard entirely)
    for root, dirs, files in os.walk('.', topdown=True):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f.endswith(('.pyc', '.pyo')) or f in ('.env', 'deploy.zip', 'bot_data.db'):
                continue
            full = os.path.join(root, f)
            zf.write(full, os.path.relpath(full, '.'))
    
    # Add dashboard/dist separately (not through 'dashboard' walk)
    dd = os.path.join('dashboard', 'dist')
    if os.path.exists(dd):
        for root, dirs, files in os.walk(dd):
            for f in files:
                full = os.path.join(root, f)
                zf.write(full, os.path.relpath(full, '.'))
```

**Result:** 121KB instead of 123MB. Deployment completes in seconds.