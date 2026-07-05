# Oryx Build Cache — Force Rebuild When Stale

## Symptom

`az webapp deploy --type zip` shows `Build successful. Time: 0(s)`.
After restart, the app uses OLD code (missing new files, old imports failing).
Container startup log shows `ModuleNotFoundError` for files included in the ZIP.
The site returns 503 "Application Error" despite clean deploy.

## Root Cause — Two Distinct Mechanisms

### Mechanism 1: Oryx Build Cache (Build Step)

Oryx caches the build output in `output.tar.zst` at `/home/site/wwwroot/`.
On subsequent deploys with an identical file set (same filenames, same `requirements.txt`),
Oryx reuses the cached tarball without rebuilding. The cached tarball was created
when certain files were missing (e.g., `repair_db.py`), so the new container starts
with incomplete code.

### Mechanism 2: Container Entrypoint Prioritization (Runtime Step) ⚠️ NEW

Even when `ENABLE_ORYX_BUILD=false` and `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, the
**container entrypoint script** (`/opt/startup/generateStartupCommand.sh`) independently
checks for `oryx-manifest.toml` in `/home/site/wwwroot/`. If the file exists:

1. The entrypoint extracts `output.tar.zst` to a temp directory (e.g., `/tmp/8deda82446895d0/`)
2. Sets `PYTHONPATH` to point to the extracted artifact's `antenv/site-packages`
3. Sets the app path to the temp directory
4. Then runs the user's startup command (`bash start.sh`)

The user's `start.sh` may execute, but **Python imports resolve against the stale artifact**
because `PYTHONPATH` points there, not to `/home/site/wwwroot/`.

This means:
- **Deleting `oryx-manifest.toml` and `output.tar.zst` from wwwroot is the only way to force the container to run from the deployed files.**
- `ENABLE_ORYX_BUILD=false` disables Oryx FROM BUILDING, but does NOT prevent the container from *using* an existing artifact.
- Setting `SCM_DO_BUILD_DURING_DEPLOYMENT=false` prevents build during deploy but doesn't clean existing artifacts.

## Detection

| Signal | Meaning |
|--------|---------|
| `Build successful. Time: 0(s)` | Build step completed instantly from cache — Oryx skipped rebuild |
| Container startup log shows `Found build manifest file at '/home/site/wwwroot/oryx-manifest.toml'` + `Extracting '/home/site/wwwroot/output.tar.zst' to directory '/tmp/...'` | Container entrypoint using stale artifact regardless of Oryx build settings |
| OpenAPI schema missing routes that exist in local source + ZIP | Definitive proof of stale artifact (see Option 4 below) |
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

# 3. Wait for deploy to complete
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

### Option 3: Deploy with `--clean true` While RUNNING

Removes all files from `/home/site/wwwroot/` (including stale `oryx-manifest.toml` and `output.tar.zst`),
then extracts the fresh ZIP. After this, the container entrypoint finds no manifest and runs
directly from the deployed files.

```bash
# 🚨 CRITICAL: App MUST be RUNNING before --clean deploy
# See "Auto-Revert Pitfall" below.
az webapp show -g <rg> -n <app> --query state

# Deploy with clean
az webapp deploy -g <rg> -n <app> \
  --src-path deploy-hafjet-bot.zip --type zip --clean true --timeout 300

# Verify
curl -s https://<app>.azurewebsites.net/api/spx/session-status
```

#### ⚠️ Auto-Revert Pitfall — Deploying `--clean` While App is STOPPED

If the app is STOPPED and you run `az webapp deploy --clean true --type zip`:

```text
1. --clean removes ALL files from /home/site/wwwroot
2. ZIP is extracted to the empty wwwroot
3. Kudu warmup fails (app is stopped → 502)
4. Deploy command retries "Starting the site..." for ~180s
5. Because site never starts, Azure marks deployment as FAILED
6. Azure AUTO-REVERTS to the previous deployment — all new files replaced with old ones!
7. When you manually `az webapp start`, the app runs the OLD code
8. New routes are GONE despite "deploy succeeded" messaging
```

**Signs of auto-revert:**
- `az webapp deploy` shows "Starting the site..." repeatedly, then times out
- After manual `az webapp start`, health returns 200
- OpenAPI schema shows NO new routes — same as before deploy
- Deployment log shows "Build successful" but no actual Oryx extraction lines

**Fix if you accidentally cleaned while stopped:** Simply redeploy the same ZIP (no `--clean`,
just `--type zip`) while the app is RUNNING — the deploy will overlay fresh files on top
of the auto-reverted old ones. This works because the deploy command does a Kudu warmup
against the running app and extracts the ZIP correctly.

### Option 3b: Deploy Fresh ZIP Over Auto-Reverted Files

If you already triggered auto-revert (cleaned while stopped, started again), the wwwroot
has old code from the reverted deployment. No need to clean again — just redeploy the same
ZIP while the app is RUNNING:

```bash
# App must be RUNNING
az webapp deploy -g <rg> -n <app> \
  --src-path hafjet-prod.zip --type zip

# After successful deploy, restart to ensure fresh container
az webapp restart -g <rg> -n <app>

# Verify
curl -s https://<app>.azurewebsites.net/openapi.json
```

### Option 4: OpenAPI-Based Diagnostic + Verification (Session 2026-07-05)

The most definitive way to verify the deployed code matches the ZIP is to compare
the production **OpenAPI schema** against your local routes:

```bash
# 1. Fetch production schema (lists all registered routes)
curl -s https://<app>.azurewebsites.net/openapi.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
paths = d.get('paths', {}).keys()
[print(p) for p in sorted(paths)]
"

# 2. Compare against local routes (search for route decorators)
grep -E '@app\.(get|post|patch)\("/api/' webhook_listener.py

# 3. If routes exist locally but NOT in OpenAPI → stale artifact
```

**Why OpenAPI is better than `/health`:** The health endpoint checks if gunicorn is
running, but it tells you nothing about WHICH version of the code is running. OpenAPI
shows every registered endpoint. Missing routes = stale artifact, definitively.

## Post-Recovery Verification

```bash
# 1. Confirm build took time (> 0s) in deployment log
az webapp log download -g <rg> -n <app> --log-file /tmp/logs.zip

# 2. Confirm new routes via OpenAPI
curl -s https://<app>.azurewebsites.net/openapi.json | python3 -c "
import json,sys; d=json.load(sys.stdin); paths=[p for p in d.get('paths',{}) if 'spx' in p];
print(f'SPX routes: {len(paths)}'); [print(f'  {p}') for p in paths]
"

# 3. Quick health check
curl -s -o /dev/null -w '%{http_code}' https://<app>.azurewebsites.net/health
```

## Dependency-Loss Loop — `--clean` Removes `antenv`, App Crashes (2026-07-05)

**Symptom sequence:** `--clean true` deploy succeeds, but app returns **Application Error (502/503)**.
Health endpoint times out. All endpoints timeout. App state shows `Running` at infrastructure level
but container is not serving traffic.

**Root cause:** `az webapp deploy --clean true --type zip` removes ALL files from `/home/site/wwwroot/`,
including the `antenv/` virtualenv that was created by a previous Oryx build. The new ZIP contains
updated code and `requirements.txt` but does NOT include a pre-built virtualenv. If
`ENABLE_ORYX_BUILD=false` and `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, Oryx never runs to
recreate the virtualenv and install dependencies. The startup command (`python -m gunicorn`)
fails because `gunicorn` is not installed in the base Python image → container crashes.

See `../../SKILL.md#bug-cold-start-modulenotfounderror-after-fresh-deploy` and
`Bug: Cold Start antenv/bin/gunicorn: No such file or directory After ZIP Deploy`.

### 401 vs 404 — Fast Route-Liveness Diagnostic

After deploying new routes, use the HTTP status code to distinguish between two failure modes:

| Status | Meaning | Action |
|--------|---------|--------|
| **401** | Route IS registered, auth required | ✅ Route exists — verify auth header |
| **404** | Route NOT registered | ❌ Stale artifact / incomplete deploy |
| **200** | Route registered, public | ✅ Verifiable |
| **503/timeout** | App not ready | Wait or investigate startup |

After a successful deploy of SPX routes, `GET /api/spx/session-status` should return
**401** (not 404) — the route is live but requires staff authentication. If it returns 404,
the route code was not deployed, meaning the Oryx artifact is stale or the ZIP wasn't extracted.

### Recovery Sequence (Loop Engineering — Session 2026-07-05)

When you detach dependency loss after `--clean` deploy (app 503, routes not serving):

```
Loop 1: Build + Redeploy
├── Set SCM_DO_BUILD_DURING_DEPLOYMENT=true   # Enable Oryx pip install
├── Verify requirements.txt has gunicorn+uvicorn in ZIP
├── Verify start.sh uses python -m gunicorn (not antenv/bin/gunicorn)
├── Deploy same ZIP with --clean true (APP MUST BE RUNNING)
│   └── Oryx builds: pip install, creates antenv
└── Verify:
    ├── GET /health → 200               # App alive
    ├── GET /openapi.json → SPX routes   # Routes registered
    ├── GET /api/spx/session-status → 401  # Route live (not 404)
    └── GET /dashboard → 200              # Frontend serving
```

**Key principles:**
- Change ONE variable at a time (not build + start + code all at once)
- Measure after each change (health → OpenAPI → specific endpoint)
- If build succeeds but app still fails, check startup logs for import errors
- If Oryx build recreates old manifest artifacts, don't panic — only care whether the
  deployed code and dependencies are correct
- Do NOT escalate to a different deployment strategy unless two loops fail

### Full Command Sequence (Recovery that Worked)

```bash
# 1. Set build automation
az webapp config appsettings set -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true

# 2. Verify app is RUNNING (critical — do NOT clean while stopped)
az webapp show -g hafjet-bot-rg -n hafjet-whatsapp-bot --query state

# 3. Deploy with clean + build
az webapp deploy -g hafjet-bot-rg -n hafjet-whatsapp-bot \
  --src-path hafjet-prod.zip --type zip --clean true --timeout 300

# 4. Wait for deploy complete + container restart (~60s)

# 5. Verify recovery
curl -s -o /dev/null -w "%{http_code}" https://hafjet-whatsapp-bot.azurewebsites.net/health
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/openapi.json | python3 -c \
  "import json,sys; d=json.load(sys.stdin); \
   spx=[p for p in d.get('paths',{}) if 'spx' in p]; \
   print(f'SPX routes: {len(spx)}'); [print(f'  {p}') for p in spx]"
curl -s -o /dev/null -w "%{http_code}" \
  https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/session-status
```

Expected final state:
- `/health` → 200
- `/api/spx/session-status` → 401 (route LIVE)
- OpenAPI → 8 SPX routes registered
- `/dashboard` → 200

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
