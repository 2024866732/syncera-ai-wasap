# Python Cache Pitfalls on Azure App Service

## Stale `.pyc` Persists Across Deployments

**Symptom:** You deploy a completely new `webhook_listener.py` (with new routes, different function bodies), but the server still responds with old behavior. `/openapi.json` shows old routes. New endpoints return 404. Deploy reports success but the app acts like nothing changed.

**Root cause:** Python's bytecode cache (`__pycache__/module.cpython-3XX.pyc`) survives the zip extraction on Azure. When gunicorn imports the module, it checks the `.pyc` timestamp — if the `.pyc` is **newer** than the `.py` source, Python loads the bytecode **without recompiling the source**. This happens when:

- The `.pyc` was created on a previous cold start
- The `.py` file was replaced moments later (zip extraction)
- The `.pyc`'s modification timestamp is later than the new `.py`'s timestamp
- Python's bytecode verification trusts the timestamp, not a content hash (in most Python versions)

Key insight: the `__pycache__` directory is never cleaned by `az webapp deploy` or `zipdeploy`. It persists across deployments indefinitely.

## Fix — Clear Cache in `start.sh`

```bash
#!/bin/bash
cd /home/site/wwwroot
echo "[STARTUP] Clearing Python cache..."
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete 2>/dev/null
echo "[STARTUP] Starting gunicorn..."
gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
```

The `find` commands must run BEFORE gunicorn starts. They should be in the startup script, not in a post-deploy hook.

## Additional Protection — `PYTHONDONTWRITEBYTECODE`

Set this as an Azure App Setting (not in `start.sh`):
```bash
az webapp config appsettings set -n <app> -g <rg> \
  --settings PYTHONDONTWRITEBYTECODE=1
```

This prevents Python from writing NEW `.pyc` files, but does **NOT** clear existing ones. You still need the `find ... -delete` for the first deploy.

## Testing If Cache Is the Issue

Before clearing cache, confirm that stale bytecode is the problem:

1. Check the deploy version: if your code has a version marker in `_sync_progress["deploy_version"]` but the API returns an older version string, the cache is stale.
2. Check `/openapi.json` paths — if they don't match the source code, cache is the culprit.
3. Compare `__pycache__/` timestamps with `.py` timestamps by checking the HTTP `Last-Modified` header or the deployment timestamp.

## How to Avoid Altogether

The cleanest fix is to change the **module identity** — rename the file or use a different import path. But for a FastAPI app deployed as `webhook_listener:app`, this isn't practical.

**Alternative:** Use a unique comment at the top of the main file that changes with every deploy:
```python
# deploy: 2026-07-08-fix-3
```
This alters the source hash, and Python 3.7+ embeds the source hash in the `.pyc` header. If the hash doesn't match, Python recompiles even if the `.pyc` is newer.

## See Also

- `hafjet-deployment-plan` → `references/azure-cache-startup-pitfalls.md` — Azure-specific deployment pipeline pitfalls (startup.txt override, Oryx build triggers, startup probe timeout)
