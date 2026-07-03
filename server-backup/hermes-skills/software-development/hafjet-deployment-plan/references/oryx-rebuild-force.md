# Oryx Build Cache — Force Rebuild When Stale

## Symptom

`az webapp deploy --type zip` shows `Build successful. Time: 0(s)`.
After restart, the app uses OLD code (missing new files, old imports failing).
Container startup log shows `ModuleNotFoundError` for files included in the ZIP.
The site returns 503 "Application Error" despite clean deploy.

## Root Cause

Oryx caches the build output in `output.tar.zst` at `/home/site/wwwroot/`.
On subsequent deploys with an identical file set (same filenames, same `requirements.txt`),
Oryx reuses the cached tarball without rebuilding. The cached tarball was created
when certain files were missing (e.g., `repair_db.py`), so the new container starts
with incomplete code.

## Detection

| Signal | Meaning |
|--------|---------|
| `Build successful. Time: 0(s)` | Build step completed instantly from cache |
| `/home/site/wwwroot` has only `output.tar.zst` + `oryx-manifest.toml` | Oryx is managing via cache |
| Container log shows `ModuleNotFoundError` for files in your ZIP | Old tarball predates those files |
| `az webapp log download` shows repeated identical Tracebacks | Same stale build keeps recycling |

## Fix Options (Try In Order)

### Option 1: Set `ORYX_BUILD_TIMESTAMP` (Recommended)

Invalidates Oryx's cache fingerprint, forcing a full rebuild.

```bash
# 1. Inject a unique timestamp to bust the cache
az webapp config appsettings set -g <rg> -n <app> \
  --settings "ORYX_BUILD_TIMESTAMP=$(date +%s)"

# 2. Deploy while app is RUNNING (not stopped)
az webapp deploy -g <rg> -n <app> \
  --src-path deploy-hafjet-bot.zip --type zip

# 3. Wait for deploy to complete (may timeout CLI — check SCM URL)
# 4. Verify build took real time (> 0s)
# 5. Check health
curl -s http://<app>.azurewebsites.net/health
```

**Why this works:** Oryx computes a cache key from the app's file set AND app settings.
Changing any app setting changes the key, forcing a fresh build from the ZIP files.

**Note:** The `ORYX_BUILD_TIMESTAMP` name is arbitrary — any unique app setting change works.
Using `$(date +%s)` ensures a different value each time.

### Option 2: Use `az webapp deployment source config-zip` (Deprecated)

The older deployment method forces a full Oryx build even when the modern `az webapp deploy`
would use cache. Works better when the app is STOPPED.

```bash
az webapp deployment source config-zip -g <rg> -n <app> \
  --src deploy-hafjet-bot.zip --timeout 300
```

**Caveat:** This command is deprecated (`az webapp deploy` is the replacement).
It may be removed in future Azure CLI versions.

**Behavior:** Shows "Building the app..." in status (not 0s). Returns quickly but
the actual build+deploy continues in the background. Check deployment status via
the SCM portal or `az webapp log download`.

### Option 3: Delete Cache + Redeploy (Last Resort)

If options 1-2 fail AND the app is stuck in a crash loop:

```bash
# 1. Stop the app
az webapp stop -g <rg> -n <app>

# 2. Delete stale cache via Kudu API (requires publishing credentials)
#    Azure CLI redacts these — use az rest with SCM resource
curl -X DELETE "https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/oryx-manifest.toml" \
  -u "<publishing_user>:<publishing_password>"
curl -X DELETE "https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/output.tar.zst" \
  -u "<publishing_user>:<publishing_password>"

# 3. Start the app (will fail without files — expected)
az webapp start -g <rg> -n <app>

# 4. Deploy freshly built ZIP
#    (app must be RUNNING for successful Kudu warmup)
az webapp deploy -g <rg> -n <app> --src-path deploy-hafjet-bot.zip --type zip

# 5. Verify
sleep 30 && curl -s http://<app>.azurewebsites.net/health
```

**Caveat:** Publishing credentials are always redacted by Azure CLI output.
To get them, use:
```bash
az webapp deployment list-publishing-credentials -g <rg> -n <app> --query publishingPassword -o tsv
```
But the terminal tool may mask the value. If redacted, use a config-zip deploy (option 2) instead.

## Prevention

1. **Always include ALL .py files in the ZIP** — do not use a hardcoded file list.
   Use `os.listdir('.')` filtering by `.py` extension.
2. **Never deploy with stale local DB** — exclude `bot_data.db` from ZIP.
3. **Verify ZIP contents before deploy**:
   ```bash
   python3 -c "import zipfile; z=zipfile.ZipFile('deploy-hafjet-bot.zip'); print('\n'.join(z.namelist()))"
   ```
4. **If you change the file set** (add/remove/rename files), set `ORYX_BUILD_TIMESTAMP`
   proactively so the build cache picks up the new files.

## Session Context (2026-07-03)

This reference was created from a session where:
- Deploying Fix A+B patches to HAFJET WhatsApp Bot
- Initial ZIP was missing `repair_db.py` → `ModuleNotFoundError` at startup
- `az webapp deploy` returned `Build successful. Time: 0(s)` — cache was stale
- `SCM_DO_BUILD_DURING_DEPLOYMENT` was toggled on/off (cascading failure)
- Fixed via `az webapp deployment source config-zip` (Option 2)
- Then redeployed with `az webapp deploy` after cache was rebuilt
