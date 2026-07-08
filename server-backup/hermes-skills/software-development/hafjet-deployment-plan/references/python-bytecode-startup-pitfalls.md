# Python Bytecode Caching & Startup Probe Pitfalls (Jul 2026)

## 1. .pyc Bytecode Cache Prevents New Code From Loading

**Symptom:** After deploying a new `webhook_listener.py`, the app still runs old code:
- `deploy_version` field shows the old string
- New endpoints return 404
- Old buggy behaviour persists

**Root cause:** Azure App Service on Linux mounts a persistent `/home` volume across container restarts. Old `__pycache__/*.pyc` files from a previous Oryx build or container layer persist on disk. Python's import system checks `.pyc` timestamps against `.py` — if the `.pyc` is newer (because the `.py` was replaced by a later deploy but the `.pyc` was generated even later by a warmup probe), Python imports the **old bytecode**.

**Detection:**
```bash
# Compare timestamps via Kudu Console (Debug console → Bash):
ls -la /home/site/wwwroot/webhook_listener.py
ls -la /home/site/wwwroot/__pycache__/webhook_listener.cpython-311.pyc
# If .pyc is newer than .py, old code is running
```

**Fix — clear cache before starting gunicorn:**
```bash
# In start.sh:
find /home/site/wwwroot -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
find /home/site/wwwroot -name "*.pyc" -delete 2>/dev/null
```

**Alternative — touch .py files:**
```bash
find /home/site/wwwroot -name "*.py" -exec touch {} \;
```
This makes Python see the `.py` as newer than any cached `.pyc`.

**Alternative — disable .pyc writing entirely:**
```bash
az webapp config appsettings set -n <app> -g <rg> \
  --settings PYTHONDONTWRITEBYTECODE=1
```
⚠️ Caution: May cause import performance issues. Prefer the start.sh fix.

**Verification:**
```python
# Check deploy_version via API:
GET /api/spx/sync-progress → deploy_version field
# If version string hasn't changed since the deploy, new code isn't running.
```

## 2. Startup Probe Timeout Kills Container Before pip Install Completes

**Symptom:** App enters crash loop after first deploy. Container logs show:
```
Container has finished running with exit code: 1
Site startup probe failed after 42.7751943 seconds.
```
Repeated failures trigger:
```
State: Blocked, LastError: ContainerTimeout
Site is blocked due to multiple, consecutive cold start failures.
```
Site auto-unblocks ~60s later but immediately re-enters the crash loop.

**Root cause:** Azure sends a warmup probe (HTTP GET to port 8000) ~15s after container start. If no 200 response within ~42 seconds total, Azure kills the container. `python3 -m venv antenv && pip install -r requirements.txt` takes 60-120 seconds — always exceeds the probe timeout.

**Exit code diagnosis for container failures:**

| Exit Code | Meaning | Likely Cause |
|-----------|---------|-------------|
| 1 | Generic crash | Python runtime error (binding, port, import after gunicorn starts) |
| 3 | Gunicorn import fail | Python module error (NameError, ImportError, SyntaxError) |
| 127 | Command not found | `antenv/bin/gunicorn` doesn't exist, or `appCommandLine` uses `bash start.sh` but `start.sh` has a broken path |

**Fix — resilient start.sh with fallback chain:**
```bash
#!/bin/bash
cd /home/site/wwwroot
echo "[STARTUP] Starting..."

# 1 — Try antenv gunicorn (normal path)
if [ -f "antenv/bin/gunicorn" ]; then
    exec /home/site/wwwroot/antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
      webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
fi

# 2 — Try system gunicorn (from default Python image)
if command -v gunicorn &> /dev/null; then
    exec gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
      webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
fi

# 3 — Create venv, install, start (slow — first deploy only)
echo "[STARTUP] Creating virtual env + pip install..."
python3 -m venv antenv
source antenv/bin/activate
pip install --no-cache-dir -r requirements.txt
exec antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
  webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
```

Once `antenv` exists (after one successful pip install), this script runs instantly — no timeout issue on subsequent restarts.

**Pre-creation strategy:** Before deploying code, force-create `antenv` by:
1. Uploading a small `start.sh` that just does `pip install` and runs a dummy web server
2. Let it crash once (probe timeout) — `antenv` will exist for the next restart
3. Then deploy the real code + start.sh

## 3. `az webapp deploy --type startup` Changes appCommandLine

**Problem:** `az webapp deploy --type startup` uploads a startup file AND changes `appCommandLine` to reference it. The original `start.sh` is no longer used. If the new script fails, the app crashes.

**Restoring doesn't always work:** `az webapp config set --startup-file "bash start.sh"` may not revert `appCommandLine` correctly for Linux apps. The Azure portal may show the correct value but the container still runs the old startup file.

**Safe approach:** Use `--type zip` (with `--restart true`) for all file updates. `start.sh` lives inside the zip alongside the code. Avoid `--type startup` entirely. The Kudu VFS PUT method (see `kudu-vfs-deployment-pattern.md`) is also safe.

## 4. Azure CLI Credential Redaction

**Problem:** When using `az` CLI in a terminal, the publishing credentials (username and password) returned by `az webapp deployment list-publishing-credentials` are **REDACTED** by the terminal security system. The output shows `"REDACTED"` regardless of the actual value. This makes direct Kudu VFS API calls from terminal (`curl -u user:pass ...`) impossible.

**Workaround:** Use the Azure SDK for Python (`azure-identity`, `azure-mgmt-web`) instead:
```python
from azure.identity import DefaultAzureCredential
from azure.mgmt.web import WebSiteManagementClient

credential = DefaultAzureCredential()
client = WebSiteManagementClient(credential, subscription_id)
pub_creds = client.web_apps.begin_list_publishing_credentials(
    resource_group_name="my-rg", name="my-app"
).result()
user = pub_creds.publishing_user_name
password = pub_creds.publishing_password
# Now use user + password for Kudu Basic auth
```

Install: `pip install azure-identity azure-mgmt-web`

## 5. Quick Recovery After Crash Loop

If the app is stuck in a startup crash loop:

1. **Check site state:** `az webapp show -n <app> -g <rg> --query state`
2. **Stop the app:** `az webapp stop -n <app> -g <rg>` (breaks the loop)
3. **Download logs:** `az webapp log download -n <app> -g <rg> --log-file /tmp/logs.zip`
4. **Check docker.log for exit code:** Exit 127 = missing gunicorn; Exit 1 = Python crash
5. **Deploy fix:** Redeploy with correct `start.sh` + clear cache
6. **Wait for full stop:** Sleep 15s
7. **Start:** `az webapp start -n <app> -g <rg>`
8. **Monitor:** Check health endpoint every 15s for up to 3 minutes
