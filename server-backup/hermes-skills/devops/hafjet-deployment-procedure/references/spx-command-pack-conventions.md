# SPX Deploy Command Pack Conventions (2026-07-25)

## Danger Markers
| Mark | Maksud |
|------|--------|
| 🟢 | Selamat — boleh run anytime |
| 🔴 | CONFIRM — tunggu Tuan approve sebelum run |
| ⚠️ | DANGER — boleh corrupt DB/file, backup dulu |
| 💀 | IRREVERSIBLE — deploy/restart, no rollback mudah |

## Kudu VFS Upload (single file)
```bash
TOKEN=$(az account get-access-token --resource "https://management.azure.com" --query "accessToken" -o tsv | tr -d '\n')
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -X PUT "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/FILE.py" \
  -H "Authorization: Bearer $TOKEN" \
  -H "If-Match: *" \
  --data-binary @FILE.py
```
- HTTP 201 = new file created (e.g. spx_followup.py)
- HTTP 204 = existing file updated (e.g. webhook_listener.py)
- HTTP 412 = ETag mismatch — add `-H "If-Match: *"` to fix

## Clean Restart
```bash
az webapp stop --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
sleep 5
az webapp start --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```
Wait 90-120s for container startup, then health check.

## Lazy Import Pattern (avoid Azure startup crash)
```python
# WRONG — top-level import can crash container startup
from new_module import function

# RIGHT — lazy import inside function body
async def scheduled_job():
    try:
        from new_module import function
    except ImportError:
        log.error("new_module not available — skipping cycle")
        return
```

## Deploy Companion Files Together
When `webhook_listener.py` imports from `db_logger.py` or `spx_followup.py`, deploy ALL files in the same cycle. Deploying only the listener causes container startup failure (exit code 3 — container terminates before scheduler starts).
