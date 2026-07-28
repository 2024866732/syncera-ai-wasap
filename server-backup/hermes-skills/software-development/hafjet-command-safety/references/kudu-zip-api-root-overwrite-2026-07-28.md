# Kudu ZIP API Root Overwrite — Command Safety Incident

## Date
2026-07-28

## Severity
Critical — Production outage (503 Application Error), full backend wipe

## What Happened
Attempted to deploy dashboard assets via Kudu ZIP API:
```bash
curl -X PUT "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/zip/site/wwwroot/dashboard/dist/" \
  --data-binary @dashboard.zip
```

The API **deleted entire `/site/wwwroot/`** before extracting. All backend files lost:
- `webhook_listener.py` (152KB)
- `db_logger.py` (146KB)  
- `hermes_ai.py`, `repair_db.py`, `spx_followup.py`
- `requirements.txt`
- `start.sh` (recreated from memory)

App crashed to 503. Recovery took ~10 min manual VFS PUT restore + restart.

## Root Cause
Kudu `/api/zip/site/wwwroot/<subpath>/` treats the path as **extraction root**, not target subdirectory. It runs `rm -rf /site/wwwroot/*` then unzips. Dashboard ZIP had no backend files → empty wwwroot.

## Safety Rule (ADDED TO SOP)
**BANNED:** `curl -X PUT /api/zip/site/wwwroot/<subdir>/` for any subdirectory deploy.

**ALLOWED:** 
- `az webapp deployment source config-zip` (full site)
- Kudu ZIP at **root only**: `/api/zip/site/wwwroot/` (full site replace)
- File-by-file VFS PUT: `/api/vfs/site/wwwroot/path/to/file` with `If-Match: *`

## Dashboard Deploy Pattern
```bash
# Build
npm run build

# Deploy file-by-file (index.html last for atomic)
TOKEN=$(az account get-access-token --resource "https://management.azure.com" --query "accessToken" -o tsv)
for f in dist/index.html dist/assets/*; do
  rel=${f#dist/}
  curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: *" \
    --data-binary @"$f" \
    "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/$rel"
done
```

## Related
- `hafjet-deployment-procedure/references/kudu-zip-api-disaster-2026-07-28.md` (detailed incident report)