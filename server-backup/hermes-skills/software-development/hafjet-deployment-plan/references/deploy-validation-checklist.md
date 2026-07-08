# Deploy Validation Checklist (Jul 2026)

## Pre-deploy: ZIP Contents

Before deploying, confirm ALL these files exist in the ZIP:

| # | File | Required | Notes |
|---|------|----------|-------|
| 1 | `webhook_listener.py` | ✅ | Main app with WhatsApp + SPX sync + CSRF fix |
| 2 | `db_logger.py` | ✅ | Database layer |
| 3 | `hermes_ai.py` | ✅ | AI integration |
| 4 | `repair_db.py` | ✅ | Repair job tracking |
| 5 | `requirements.txt` | ✅ | No duplicate lines, no `requests==2.31.0` x2 |
| 6 | `start.sh` | ✅ | No `antenv` — uses `pip3 install` directly + `__pycache__` clear |
| 7 | `dashboard/dist/index.html` | ✅ | Points to correct JS hash |
| 8 | `dashboard/dist/favicon.svg` | ✅ | Favicon |
| 9 | `dashboard/dist/assets/index-<hash>.js` | ✅ | Hash matches index.html reference |
| 10 | `dashboard/dist/assets/index-DrejfP5x.css` | ✅ | CSS bundle |

**Excluded (do not include):**
- `.env` — must be set via Azure App Settings
- `__pycache__` / `*.pyc` — stale bytecode
- `node_modules/`, `.git/`, `.venv/`, `*.db`

**Verification command:**
```bash
python3 -c "
import zipfile
zf = zipfile.ZipFile('/tmp/deploy.zip')
for n in zf.namelist():
    print(f'  {n:50s} {zf.getinfo(n).file_size:>8,} bytes')
print(f'Total: {len(zf.namelist())} files, {sum(zf.getinfo(n).file_size for n in zf.namelist())/1024:.1f} KB')
"
```

## Pre-deploy: Azure Settings Check

```bash
# MUST be false or the Oryx build will overwrite your custom start.sh
az webapp config appsettings list -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --query "[?name=='SCM_DO_BUILD_DURING_DEPLOYMENT' || name=='ENABLE_ORYX_BUILD'].{n:name,v:value}" -o table

# Expected: both false
# If true → set to false first:
az webapp config appsettings set -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false
```

## Post-deploy Verification

1. **Health check:**
   ```bash
   curl -s -o /dev/null -w "HTTP %{http_code}\n" https://hafjet-whatsapp-bot.azurewebsites.net/health
   # Expect: HTTP 200
   ```

2. **deploy_version marker** (requires JWT token):
   ```js
   // From browser console on dashboard
   var tk = localStorage.getItem('staff_token');
   fetch('/api/spx/session-status', {headers:{'Authorization':'Bearer '+tk}})
     .then(r=>r.json()).then(d => console.log(d.deploy_version));
   // Expect: new version string (not the old one)
   ```

3. **Dashboard loads:**
   ```bash
   curl -s -o /dev/null -w "HTTP %{http_code}\n" https://hafjet-whatsapp-bot.azurewebsites.net/dashboard/
   # Expect: HTTP 200 AND content includes index.html with current JS hash
   ```

4. **Static assets serve:**
   ```bash
   curl -s -o /dev/null -w "HTTP %{http_code}\n" https://hafjet-whatsapp-bot.azurewebsites.net/dashboard/assets/index-<hash>.js
   curl -s -o /dev/null -w "HTTP %{http_code}\n" https://hafjet-whatsapp-bot.azurewebsites.net/dashboard/assets/index-DrejfP5x.css
   ```

5. **SPX endpoints respond** (not 405):
   ```bash
   curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/fetch-phones
   # Expect: 401 (not 405) — 401 means endpoint exists but needs auth
   ```

6. **Data intact:**
   ```bash
   # Login → check total orders
   curl -s -X POST .../api/auth/login ... | get token
   curl -s .../api/spx/orders?limit=1 -H "Bearer <token>" → expect total=2346
   ```
