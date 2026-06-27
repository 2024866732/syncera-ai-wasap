# Azure App Service Deployment Recovery — WhatsApp Bot

When deployment fails and the site is unreachable (503, timeout, Application Error), follow this recovery sequence. Do NOT delete or recreate the app unless all safer options are exhausted.

## User Workflow Preferences (HAFJET)

- **Do NOT delete or recreate** the web app unless explicitly authorized
- **Report each step before executing** — show what will happen, then do it
- **Stop and report exact error on failure** — don't apply new fixes without review
- **Do not change strategy mid-flow** — stick to the agreed plan
- **Confirm before destructive operations** — deleting plans, resource groups, or apps requires explicit approval
- **Don't redeploy repeatedly** — each redeploy triggers Oryx build + restart. Fix the root cause (startup script) instead.

## Recovery Sequence (safest first)

### Phase 1: Diagnose (no changes)
1. Check site state: `az webapp show -g <rg> -n <app> --query "state"`
2. Check HTTP response: `curl -sS -o /dev/null -w "%{http_code} %{time_total}s" https://<app>.azurewebsites.net/health`
3. Read startup logs: `az webapp log tail -g <rg> -n <app>` — look for `ContainerTimeout`, `Application Error`, `Build successful`, `Starting the site...`
4. Check deployment status: `az webapp deployment list -g <rg> -n <app>`

### Phase 2: Config-only fixes (no redeploy)
1. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` (Oryx installs deps at deploy time)
2. Set `WEBSITES_CONTAINER_START_TIME_LIMIT=600` (may not work — see below)
3. Set `WEBSITES_HEALTH_CHECK_TIMEOUT=300`
4. Ensure `start.sh` has NO `pip install` — only launches the server
5. Restart: `az webapp restart -g <rg> -n <app>`

### Phase 3: Redeploy with clean build
1. Rebuild ZIP with updated `start.sh`
2. Deploy with `az webapp up --runtime PYTHON:3.11 --plan <plan> --sku B1 --logs`
3. Wait for Oryx build to complete (poll `az webapp deployment list`)
4. Test `/health` after build + 30s warmup

### Phase 4: Plan-level recovery (if app won't start at all)
1. Create new App Service Plan in same RG, same region, same OS, SKU B1
2. Move app to new plan (if allowed) or create new web app in new plan
3. Copy app settings from old app
4. Deploy same ZIP to new app
5. Test new app before touching old one

### Phase 5: Last resort
- Delete and recreate web app (NOT the plan or RG)
- Restore all 12 app settings from backup
- Deploy fresh ZIP
- Full verification

## Common Error Patterns

### ContainerTimeout (230s or 600s)
**Cause:** `pip install` in startup script takes too long
**Fix:** Remove `pip install` from `start.sh`, use `SCM_DO_BUILD_DURING_DEPLOYMENT=true`

### 503 Service Unavailable + "Application Error" page
**Cause:** App process starts but crashes on import, or never binds to port
**Diagnosis:** Even a simple `python3 -c "from http.server import HTTPServer..."` failing means container networking issue, not app issue
**Fix:** Try new App Service Plan in same region

### HTTP 000 (timeout, 0 bytes)
**Cause:** Azure frontend accepts connection but no backend process responds
**Diagnosis:** TLS handshake succeeds (proves network OK), but no HTTP response
**Fix:** Same as 503 — startup script issue or container networking

### Build successful but site never starts
**Cause:** Oryx build completes (95s) but "Starting the site..." loops until timeout
**Evidence:** `Status: Build successful. Time: 95(s)` followed by `Status: Starting the site...` every 15s
**Fix:** Startup script must be fast — no pip install, no long setup

## Key Learnings

1. **`WEBSITES_CONTAINER_START_TIME_LIMIT` does NOT work via app settings** — setting it via `az webapp config appsettings set` does NOT change `siteConfig.containerStartTimeLimit` (remains `None`). This is a known Azure limitation.

2. **`az webapp up` is preferred over `az webapp deploy --type zip`** — it handles Oryx build + deploy in one command, ensuring dependencies are installed before the container starts.

3. **`gunicorn` must be in requirements.txt** — Oryx only installs what's listed. If `start.sh` uses `python3 -m gunicorn` but gunicorn isn't in requirements.txt, the app crashes on startup.

4. **App starting once proves the code is fine** — if you find ANY success log (`Site startup probe succeeded`), the app code works. The problem is startup timing, not code bugs.

5. **Don't redeploy repeatedly** — each redeploy triggers Oryx build + restart cycle. Fix the root cause (startup script) instead.

## Required App Settings for Azure WhatsApp Bot

| Setting | Value | Purpose |
|---------|-------|---------|
| `STARTUP_COMMAND` | `start.sh` | Azure runs this on container start |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Oryx runs pip install at deploy time |
| `WEBSITES_PORT` | `8000` | Port gunicorn binds to |
| `WHATSAPP_ACCESS_TOKEN` | (redacted) | Meta API token |
| `WHATSAPP_PHONE_ID` | (redacted) | Phone number ID |
| `APP_SECRET` | (redacted) | HMAC signature verification |
| `VERIFY_TOKEN` | (redacted) | Webhook verification |
| `OPENROUTER_API_KEY` | (redacted) | AI provider key |
| `OPENROUTER_MODEL` | `openrouter/owl-alpha` | AI model |
| `DASHBOARD_API_KEY` | (redacted) | Dashboard write protection |
