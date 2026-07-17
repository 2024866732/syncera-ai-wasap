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
- `.tar.gz` / `*backup*` — DB dumps & settings backups (e.g. `db-backup-*.tar.gz`, `azure-settings-backup-*.json`)
- `*_test.py` / `check_*.py` / `upload_*.py` / `debug_*.py` / `verify_*.py` / `monitor_*.py` / `fix_*.py` — temp/debug scripts
- `AGENTS.md`, `DEPLOYMENT*.md`, `oracle-*.md`, `*.user.js`, `business_info.txt` (loose untracked copy), `intent_rules.json`, `media_map.json`, `start_local.sh`

## ⚠️ CRITICAL: build_zip.py walks DISK, not git

`build_zip.py` uses `os.walk(src)` over the working dir. **Untracked files on disk enter the artifact even if never committed.** A clean `git status` / commit does NOT mean a clean ZIP.

**MANDATORY pre-build gate (every deploy):**
1. Review untracked junk: `git status --short` — any `??` file NOT in `exclude_patterns` will ship.
2. Confirm `build_zip.py` `exclude_patterns` covers: `.tar.gz`, `backup`, `AGENTS.md`, `DEPLOYMENT`, `oracle-`, `.user.js`, `business_info.txt`, `check_`, `upload_`, `debug_`, `verify_`, `monitor_`, `fix_`, `intent_rules.json`, `media_map.json`, `start_local.sh`, `apply_all_patches.py`, `run_fetch_phones.py`, `s2f5_test.py`, `azure-settings-backup`.
3. Build: `python3 build_zip.py` (prints full manifest + size).
4. Re-scan the printed manifest for any of the Excluded patterns above. If found → STOP, fix `exclude_patterns`, rebuild.
5. Only then deploy.

**Quick pollution probe (run before build):**
```bash
cd ~/.hermes/whatsapp-bot && python3 - <<'PY'
import os
src=os.path.expanduser("~/.hermes/whatsapp-bot")
excl=[".git","__pycache__",".venv",".env",".zip","logs",".db",".tar.gz","backup",
"AGENTS.md","DEPLOYMENT","oracle-",".user.js","business_info.txt",
"check_","upload_","debug_","verify_","monitor_","fix_","intent_rules.json",
"media_map.json","start_local.sh","apply_all_patches.py","run_fetch_phones.py",
"s2f5_test.py","azure-settings-backup"]
import subprocess
for r,d,f in os.walk(src):
    d[:]=[x for x in d if not any(p in x for p in excl)]
    for fn in f:
        if any(p in fn for p in excl): continue
        rel=os.path.relpath(os.path.join(r,fn),src)
        if subprocess.run(["git","-C",src,"ls-files","--error-unmatch",rel],
                          capture_output=True).returncode!=0:
            print("UNTRACKED->ZIP:",rel)
PY
```
Any line printed = file ships to prod uncommitted. Investigate before building.

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
