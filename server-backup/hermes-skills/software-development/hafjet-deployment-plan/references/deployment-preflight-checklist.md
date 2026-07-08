# Deployment Pre-Flight Checklist (Mandatory)

**Read before every ZIP deployment.** This checklist prevents the two most common deployment failures: partial file manifests and stale bytecode.

## 1. ZIP Manifest Verification

Before asking for deploy approval, show the user a **complete manifest** of every file in the ZIP with sizes.

### Required template

```text
| # | File | Size | Status |
|---|------|------|--------|
| 1 | webhook_listener.py | XXX KB | Notes |
| 2 | db_logger.py | XXX KB | |
| ... | ... | ... | |
```

### Expected manifest (HAFJET WhatsApp Bot)

| # | File | Typical Size | Source |
|---|------|-------------|--------|
| 1 | `webhook_listener.py` | ~124 KB | Main app (WhatsApp + SPX sync + CSRF fix) |
| 2 | `db_logger.py` | ~69 KB | DB layer |
| 3 | `hermes_ai.py` | ~9 KB | AI integration |
| 4 | `repair_db.py` | ~8 KB | Repair job DB |
| 5 | `requirements.txt` | ~150 B | Dependencies (no duplicate lines) |
| 6 | `start.sh` | ~525 B | Startup script — NO antenv (see §3) |
| 7 | `dashboard/dist/index.html` | ~500 B | Dashboard entry |
| 8 | `dashboard/dist/favicon.svg` | ~234 B | Dashboard icon |
| 9 | `dashboard/dist/assets/index-<hash>.js` | ~636 KB | JS bundle (hash varies per build) |
| 10 | `dashboard/dist/assets/index-DrejfP5x.css` | ~24 KB | CSS bundle (stable hash) |

**Expected total: 10 files, ~235 KB compressed**

### Verification command

```bash
python3 -c "
import zipfile, os
z = zipfile.ZipFile('/tmp/deploy.zip')
for f in sorted(z.namelist()):
    info = z.getinfo(f)
    print(f'{f:50s} {info.file_size:>8,} bytes')
print()
print(f'Total: {len(z.namelist())} files, {sum(z.getinfo(f).file_size for f in z.namelist()):,} bytes')
"
```

## 2. Prohibited / Required Checks

| Check | Must | Must NOT |
|-------|------|----------|
| `__pycache__/` | — | ❌ Any `.pyc` or `__pycache__` dir |
| `.env` | — | ❌ Never include secrets in ZIP |
| `startup.txt` | — | ❌ Oryx uses this over `start.sh` |
| Dashboard JS hash | ✅ Hash in `index.html` matches filename | ❌ Mismatch = broken dashboard |
| `requirements.txt` | ✅ No duplicate lines | ❌ Duplicate `requests==2.31.0` seen before |
| `spx_sync.py` | — | ❌ SPX code is EMBEDDED in `webhook_listener.py`, not separate module |

## 3. start.sh — No-antenv Recipe

**Never depend on `antenv`.** Azure Linux App Service does not preserve virtual environments across deployments.

**Correct start.sh:**

```bash
#!/bin/bash
cd /home/site/wwwroot

# Clear any stale Python bytecode cache
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete 2>/dev/null

# Install dependencies directly
pip3 install --no-cache-dir -r requirements.txt 2>&1 || \
  python3 -m pip install --no-cache-dir -r requirements.txt 2>&1

exec gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app \
  --bind 0.0.0.0:8000 --timeout 600
```

**Key points:**
- `__pycache__` clearing BEFORE gunicorn start — prevents stale `.pyc` from old deploys
- `pip3 install` every boot (idempotent, pip caches downloads)
- No `antenv` fallback — system Python is the only path
- `exec` replaces shell so SIGTERM reaches gunicorn
- `--timeout 600` (10 min) for long requests, but see Azure 230s LB limit
- App may show "Application Error" for 60-120s during `pip3 install` before gunicorn starts — this is expected

## 4. Oryx `startup.txt` Trap

Oryx precedence: **`startup.txt`** > `start.sh` > runtime stack default.

If a stale `startup.txt` from a previous deployment exists anywhere, Oryx runs it instead of your `start.sh`.

**Check on server:**
```bash
ls -la /home/site/startup.txt /home/site/wwwroot/startup.txt 2>/dev/null
```

**Fix:**
```bash
rm -f /home/site/startup.txt /home/site/wwwroot/startup.txt
```

**Prevention:** Never include `startup.txt` in deployment ZIP (see prohibited checks above).

## 5. Stale Bytecode — Verification After Deploy

After app restarts, confirm fresh code is running:

1. Check deploy version in API response:
   ```bash
   curl -s https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/session-status \
     -H "Authorization: Bearer $(get_token)" | python3 -m json.tool
   ```
   → Look for `deploy_version` field; should match expected version string.

2. Check new endpoint exists:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/fetch-phones
   ```
   → Should return `405` (POST required) not `404` (endpoint missing).

3. If old code still runs → bytecode cache survived. Fix with STOP+START (not restart):
   ```bash
   az webapp stop -n hafjet-whatsapp-bot -g hafjet-bot-rg
   sleep 30
   az webapp start -n hafjet-whatsapp-bot -g hafjet-bot-rg
   ```

## 6. Python Bytecode Cache — Root Cause & Prevention

**Root cause:** Python writes compiled bytecode to `__pycache__/*.pyc` files for faster loading. ZIP deploy replaces only `.py` files — old `.pyc` files survive and Python loads them preferentially when their modification time is newer than the `.py` file.

**Symptoms of stale bytecode:**
- `deploy_version` shows old value
- New endpoints return 404 (not registered in cached module)
- Error messages reference old code paths

**Three-layer prevention:**

| Layer | Action | Where |
|-------|--------|-------|
| 1 | `find . -type d -name __pycache__ -exec rm -rf {} +` | `start.sh` (before gunicorn) |
| 2 | `PYTHONDONTWRITEBYTECODE=1` | Azure App Settings |
| 3 | STOP → 30s → START (not restart) | After deploy |

## 7. Dashboard JS Hash Sync

Vite generates unique hashes per build. The `index.html` references `index-<hash>.js`. If the hash in the deployed HTML doesn't match the actual JS file, the dashboard loads a broken white screen.

**Before deploy — verify hash consistency:**
```bash
cd dashboard/dist
JS_HASH=$(grep -oP 'index-\K[A-Za-z0-9]+(?=\.js)' index.html)
echo "HTML references: index-${JS_HASH}.js"
ls -la "assets/index-${JS_HASH}.js" || echo "❌ JS FILE MISSING!"
```

**After deploy — verify on server:**
```bash
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/dashboard/ | \
  grep -oP 'index-\K[A-Za-z0-9]+(?=\.js)'
```
→ Must match the hash from `dashboard/dist/`.

**Note:** Old hashes accumulate on the server (~650 KB each). Delete old JS files from Kudu VFS periodically:
```bash
az rest --method get --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/" \
  --resource https://management.azure.com --output json 2>/dev/null
# Delete every JS except the current hash:
for old_js in <each-old-hash-except-current>.js; do
  az rest --method delete \
    --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/$old_js" \
    --headers "If-Match=*" --resource https://management.azure.com
done
```
