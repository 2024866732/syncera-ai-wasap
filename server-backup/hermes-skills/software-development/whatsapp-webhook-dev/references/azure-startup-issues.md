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

## 4. Startup Probe Timeout

**Problem:** Azure startup probe times out (230s default) if DB init + dependency install takes too long.

**Mitigation:**
- Keep `init_db()` fast (simple CREATE TABLE IF NOT EXISTS)
- Use `SCM_DO_BUILD_DURING_DEPLOYMENT=true` in App Settings
- Pre-build dependencies into the zip (include `antenv/` if possible)

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

**Problem:** WebSocket connections may not work in Free F1 tier.

**Fix:** Enable Web Sockets in Azure Portal → Configuration → General Settings → "Web sockets: On".

Or upgrade to Basic tier for production WebSocket support.

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

**Result:** 121KB instead of 123MB. Deployment completes in seconds.