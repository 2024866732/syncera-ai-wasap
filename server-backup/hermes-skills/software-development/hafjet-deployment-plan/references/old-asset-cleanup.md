# Old Asset Cleanup After Frontend Rebuild

**Context:** When deploying rebuilt dashboard (new JS/CSS hash), old build files persist on VFS indefinitely. They cause confusion when:
- Inspecting VFS `/dashboard/dist/assets/` and seeing multiple versions
- Browser cache or stale `index.html` references old hashes
- Troubleshooting which bundle is actually live

## Cleanup commands

After uploading new files via Kudu VFS PUT, delete old hashes:

```bash
# List current assets to identify old files
az rest --method get \
  --url "https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/" \
  --resource https://management.azure.com \
  --output json

# Delete each old hash file
for f in "index-OldHash1.js" "index-OldHash2.js" "index-OldHash3.js"; do
  az rest --method delete \
    --url "https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/$f" \
    --headers "If-Match=*" \
    --resource https://management.azure.com
done
```

`If-Match=*` is required for VFS DELETE on Azure Linux App Service.

## Verification

After cleanup, confirm only the current hash files exist:

```bash
az rest --method get \
  --url "https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/" \
  --resource https://management.azure.com \
  --output json | python3 -c "import sys,json; [print(f.get('name','?')) for f in json.load(sys.stdin)]"
```

Also verify the dashboard loads the correct JS:

```bash
curl -s "https://<app>.azurewebsites.net/dashboard/" | grep -o 'index-[^.]*\.js'
```
