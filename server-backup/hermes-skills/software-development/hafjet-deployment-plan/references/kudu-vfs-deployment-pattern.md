# Kudu VFS Deployment Pattern — HAFJET WhatsApp Bot

## Why Not `az webapp deploy`

**`az webapp deploy --type zip` is unreliable on Linux App Service.** It reports `RuntimeSuccessful` but frequently does NOT update the actual files in `/home/site/wwwroot/`. The platform returns success even when files on disk are unchanged. Verified across multiple deployments (Jul 2026).

**NOT recommended for production updates.** Use Kudu VFS API PUT instead.

## Kudu VFS Authentication

### Method 1: AAD Bearer Token (preferred — works for both read and write)

```bash
# Get token
az account get-access-token --resource https://management.azure.com --query accessToken -o tsv > /tmp/token.txt

# GET (read file)
curl -s "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/webhook_listener.py" \
  -H "Authorization: Bearer *** /tmp/token.txt)"

# PUT (write/update file) — requires If-Match: *
curl -s -X PUT "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/webhook_listener.py" \
  -H "Authorization: Bearer *** /tmp/token.txt)" \
  -H "Content-Type: application/octet-stream" \
  -H "If-Match: *" \
  --data-binary @/home/hafizi145/.hermes/whatsapp-bot/webhook_listener.py
```

### Method 2: `az rest` (most reliable)

```bash
# Upload file
az rest --method put \
  --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/<path>" \
  --body @"<local-path>" \
  --headers "Content-Type=application/octet-stream" \
  --headers "If-Match=*" \
  --resource https://management.azure.com

# Delete file
az rest --method delete \
  --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/<path>" \
  --headers "If-Match=*" \
  --resource https://management.azure.com

# List directory
az rest --method get \
  --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/<dir>/" \
  --resource https://management.azure.com --output json
```

**HTTP status codes:**
- `204` — PUT success (updated existing file or created new)
- `403` — PUT failed (permission denied). Try `az rest` instead of curl.
- `404` — File/directory does not exist
- `412` / `Precondition Failed` — ETag mismatch (use `If-Match: *` to bypass)

### Method 3: Publishing Profile Basic Auth (if AAD token lacks write permission)

```bash
# Get credentials
az webapp deployment list-publishing-credentials \
  -n hafjet-whatsapp-bot -g hafjet-bot-rg \
  --query "{uname:publishingUserName, pwd:publishingPassword}" -o tsv

# Use with curl
curl -u "username:password" -X PUT ...
```

**Caveat:** Credentials may be redacted in output. Use `az rest` as a fallback.

## Files to Upload on Every Deploy

| File | Remote Path | When to Update |
|------|-------------|----------------|
| `webhook_listener.py` | `site/wwwroot/webhook_listener.py` | Any backend change |
| `db_logger.py` | `site/wwwroot/db_logger.py` | Any DB/logger change |
| `dashboard/dist/index.html` | `site/wwwroot/dashboard/dist/index.html` | Frontend rebuild |
| `dashboard/dist/assets/index-*.js` | `site/wwwroot/dashboard/dist/assets/index-<hash>.js` | Frontend rebuild |
| `dashboard/dist/assets/index-*.css` | `site/wwwroot/dashboard/dist/assets/index-<hash>.css` | Frontend rebuild (if changed) |

## After Upload — Restart (not restart)

```bash
az webapp stop -n hafjet-whatsapp-bot -g hafjet-bot-rg
sleep 15   # Allow container to fully stop
az webapp start -n hafjet-whatsapp-bot -g hafjet-bot-rg
```

**Do NOT use `az webapp restart`** — it may not clear in-memory bytecode cache. Always stop + start.

## ⚠️ Old JS Hash Cleanup

Vite generates unique hashes per build (e.g., `index-C2adAMRn.js`, `index-CaF-MTI0.js`, `index-BP7iRMYu.js`, `index-C1NVCYYa.js`). Each build adds ~650KB to the server. **Old hashes accumulate and must be manually deleted from VFS.**

```bash
# List current assets
az rest --method get \
  --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/" \
  --resource https://management.azure.com --output json

# Delete old JS files (keep only current hash)
for old_js in "index-C2adAMRn.js" "index-CaF-MTI0.js" "index-BP7iRMYu.js" "index-DYZfI9UE.js"; do
  az rest --method delete \
    --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/$old_js" \
    --headers "If-Match=*" \
    --resource https://management.azure.com
done
```

## Browser Cache-Busting

After deploying a new JS hash, users must **hard refresh (Ctrl+F5 / Cmd+Shift+R)**. Standard reload serves the old HTML from cache, which references the old JS hash.

The `index.html` references the new hash, but browsers cache HTML too. Use a version marker endpoint to confirm deployment:
```bash
curl -s "https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/session-status" \
  -H "Authorization: Bearer *** | grep deploy_version
```

Expected: `"deploy_version": "spx-incremental-sync-v1-2026-07-08"`

## Verification Script Pattern

Save as `verify_deploy.py` for repeatable checks:

```python
import json, urllib.request
# 1. Login
req = urllib.request.Request("https://hafjet-whatsapp-bot.azurewebsites.net/api/auth/login",
    data=json.dumps({"email":"hafizi@hafjet.com","password":"admin123"}).encode(),
    headers={"Content-Type":"application/json"})
jwt = json.loads(urllib.request.urlopen(req, timeout=10).read())["access_token"]

# 2. Check version marker
req2 = urllib.request.Request("https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/session-status",
    headers={"Authorization": f"Bearer {jwt}"})
data = json.loads(urllib.request.urlopen(req2, timeout=15).read())
assert "spx-incremental-sync" in data.get("deploy_version", ""), "Wrong version"

# 3. Check dashboard JS hash
req3 = urllib.request.Request("https://hafjet-whatsapp-bot.azurewebsites.net/dashboard/",
    headers={"Authorization": f"Bearer {jwt}"})
html = urllib.request.urlopen(req3, timeout=10).read().decode()
assert "<expected-hash>.js" in html, "Dashboard serving wrong JS hash"

print("✅ All checks passed")
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| PUT returns 403 | Token has no write permission | Use `az rest` instead of curl |
| PUT returns 412 | ETag mismatch | Add `If-Match: *` header |
| Files uploaded but old version served | Browser cache | Hard refresh (Ctrl+F5) |
| Files uploaded but old version served (API) | App needs restart | `az webapp stop && sleep 15 && az webapp start` |
| `az webapp deploy` reports success but files unchanged | Known Azure bug | Use Kudu VFS instead |
