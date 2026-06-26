# Azure App Service Zip Deployment Patterns

Deployment patterns and pitfalls for `az webapp deploy` with Python/FastAPI apps.

## Basic Deploy Command

```bash
az webapp deploy \
  --resource-group <rg> \
  --name <app> \
  --src-path deploy.zip
```

## Zip Creation — Exclude Patterns

### The Problem
`zip` command includes everything by default. Common issues:
- `node_modules/` (100MB+) bloats zip
- `.git/` (can be large) unnecessary
- `__pycache__/` stale bytecode causes 404s
- `.env` secrets should NOT be in zip (use Azure App Settings)
- Old `deploy.zip` files create recursive inclusion

### Solution: Python Script with Excludes

```python
import zipfile, os

EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', '.pytest_cache'}
EXCLUDE_EXT = {'.pyc', '.pyo'}
EXCLUDE_FILES = {'.env'}

with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.', topdown=True):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if any(f.endswith(ext) for ext in EXCLUDE_EXT):
                continue
            if f in EXCLUDE_FILES:
                continue
            if f.endswith('.zip'):  # Don't include old zips
                continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, '.')
            zf.write(full, arc)
```

### Critical: Avoid Duplicate Names

If you walk a directory AND explicitly add a subdirectory, you get duplicate names:

```python
# WRONG — causes "Duplicate name" warning
for root, dirs, files in os.walk('.', topdown=True):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
    # ... adds dashboard/dist via main walk too ...

# Then separately:
for root, dirs, files in os.walk('dashboard/dist'):
    # DUPLICATE! dashboard/dist/ added twice
```

**Fix:** Add `dashboard` to `EXCLUDE_DIRS`, then walk `dashboard/dist` separately:

```python
EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', 'dashboard'}

# Main walk excludes 'dashboard' entirely
for root, dirs, files in os.walk('.', topdown=True):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
    ...

# Add dashboard/dist separately (no duplicates)
dd = os.path.join('dashboard', 'dist')
if os.path.exists(dd):
    for root, dirs, files in os.walk(dd):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, '.')
            zf.write(full, arc)
```

## Azure Startup Command

For Python apps, Azure needs a startup command. In `startup.txt` or Configuration → General settings:

```bash
find /home/site/wwwroot -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null; gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000
```

Or use a `start.sh`:
```bash
#!/bin/bash
cd /home/site/wwwroot
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000
```

## Environment Variables (App Settings)

Set via CLI (not in code or .env):
```bash
az webapp config appsettings set \
  --name <app> \
  --resource-group <rg> \
  --settings \
    KEY1="value1" \
    KEY2="value2"
```

Verify:
```bash
az webapp config appsettings list --name <app> --resource-group <rg>
```

## Verification After Deploy

```bash
# Wait for warmup
sleep 5

# Health check
curl -s https://<app>.azurewebsites.net/health

# Key endpoints
curl -s https://<app>.azurewebsites.net/api/stats
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://<app>.azurewebsites.net/dashboard
```

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502 Bad Gateway | Gunicorn not starting | Check startup command, port binding |
| 404 on new routes | Stale `__pycache__` | Clear cache, restart |
| Env vars not loading | `load_dotenv(override=True)` | Use `override=False` |
| Zip too large | `node_modules` included | Exclude in zip creation |
| Deploy succeeds but app broken | Old zip included | Delete old zips before creating new |
| Port binding fail | Hardcoded port | Use `PORT` env var or `--bind 0.0.0.0:8000` |
