# Python `__pycache__` Pitfalls in Deployment

Stale bytecode cache causes routes to be registered but return 404. One of the most confusing deployment bugs in Python/FastAPI.

## Symptom

- Code changes confirmed present in source file (`grep` shows the new routes)
- Server starts without errors
- `/openapi.json` shows OLD routes only (missing new endpoints)
- New endpoints return `{"detail":"Not Found"}` with HTTP 404
- Existing endpoints work fine
- `python -c "import module; print(dir(module))"` shows correct routes

## Root Cause

Python compiles `.py` files to `.pyc` bytecode in `__pycache__/` for faster imports. When you deploy new source files:

1. Python checks if `.pyc` exists and is newer than `.py` source
2. If `.pyc` is newer → Python loads the STALE bytecode, ignoring your source changes
3. Result: server runs old code, new routes don't exist

This commonly happens when:
- You zip files from local dev (includes old `__pycache__`)
- You `scp`/`rsync` files without `-delete` flag
- Your deployment script doesn't clean cache

## Detection

```bash
# Check if .pyc is newer than .py source
ls -la __pycache__/webhook_listener.cpython-311.pyc
ls -la webhook_listener.py

# If .pyc timestamp is AFTER your edit → stale cache being loaded
```

Or verify routes are actually registered:
```bash
python3 -c "
import sys; sys.path.insert(0, '.')
import webhook_listener
for r in webhook_listener.app.routes:
    if hasattr(r, 'path'):
        print(r.path)
"
```

If the Python import shows routes but the running server doesn't → cache issue.

## Fix

### Immediate (running server)
```bash
# Kill server, clear cache, restart
pkill -f "uvicorn webhook_listener"
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
python3 -m uvicorn webhook_listener:app --host 0.0.0.0 --port 8443
```

### Prevention (deployment script)
```bash
# Always exclude __pycache__ from deployment zip
zip -r deploy.zip . -x "*.pyc" -x "__pycache__/*" -x ".env"

# Or clean before building
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete
```

### Prevention (server startup)
Add to startup script or gunicorn config:
```bash
# In startup.txt or .sh
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000
```

## Azure-Specific Pattern

For Azure App Service with gunicorn:

```bash
# startup.txt
find /home/site/wwwroot -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000
```

## Quick Diagnostic Checklist

1. ✅ Source file has the new code (`grep -n "def new_route" app.py`)
2. ✅ `__pycache__` cleared (`rm -rf __pycache__`)
3. ✅ Server restarted after cache clear
4. ✅ `/openapi.json` now shows new routes
5. ✅ New endpoint returns expected response

## Why This Is Confusing

The server starts without errors. Logs show "Dashboard mounted" or other startup messages from the NEW code. But routes return 404 because the actual route handlers loaded from `.pyc` are the OLD ones. The startup code runs from the new file (it's at module level), but route registration happens from the cached bytecode.
