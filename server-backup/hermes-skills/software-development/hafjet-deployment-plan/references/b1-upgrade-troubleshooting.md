# Azure F1 → B1 Upgrade — Troubleshooting

**Date:** 2026-06-27
**Context:** Upgraded hafjet-whatsapp-bot from Free F1 to Basic B1

## Upgrade Command (Confirmed Working)

```bash
az appservice plan update --name hafjet-bot-plan --resource-group hafjet-bot-rg --sku B1
az webapp config set --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --always-on true
az webapp restart --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```

**Result:** `provisioningState: Succeeded`, `sku: B1`, `tier: Basic`

## Critical: Startup Command Issues (2026-06-27 Session)

### Problem 1: Oryx Auto-Detects Wrong Entry Point

When using `az webapp up`, Oryx auto-detects `application:app` as the default entry point. If your app uses a different module (e.g., `webhook_listener:app`), the app starts but returns 404 on all routes.

**Fix:** Set `appCommandLine` via REST API BEFORE first deploy:
```bash
az rest --method PATCH \
  --uri "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/config/web?api-version=2022-03-01" \
  --body '{"properties":{"appCommandLine":"python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto"}}'
```

**IMPORTANT:** `az webapp config set --generic-configurations` does NOT apply to existing web apps. Must use REST API.

### Problem 2: Restart Triggers Oryx Rebuild

Even with `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `az webapp restart` can trigger an Oryx rebuild that takes ~142s. During this time, the app is unreachable.

**Fix:** After restart, wait at least 200s (142s build + 53s startup) before testing:
```bash
az webapp restart --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
sleep 200  # Wait for build + startup
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/health
```

### Problem 3: Subscription Throttle on Plan Creation

Rapid create/delete of App Service Plans triggers subscription throttle:
```
ERROR: App Service Plan Create operation is throttled for subscription ...
```

**Critical:** `Retry-After: 5` header is **deceptive** — the actual throttle window for repeated violations is 15+ minutes. Do NOT retry after 5 seconds. STOP all plan create/delete operations immediately and wait.

**Fix:** Wait 15+ minutes for throttle reset. Avoid rapid create/delete cycles. Reuse existing plans when possible.

**⚠️ `--keep-empty-plan` does NOT prevent plan deletion when deleting the last web app.** Azure auto-deletes the plan even with this flag. If you need to keep the plan, create a placeholder web app on it first, THEN delete the real one.

### Problem 4: Health Check Path Not Set via CLI

`az webapp config appsettings set` does NOT update `siteConfig.healthCheckPath`. Must use REST API:
```bash
az rest --method PATCH \
  --uri "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/config/web?api-version=2022-03-01" \
  --body '{"properties":{"siteConfig":{"healthCheckPath":"/health"}}}'
```

### Problem 5: WEBSITES_CONTAINER_START_TIME_LIMIT Not Applied

Setting `WEBSITES_CONTAINER_START_TIME_LIMIT` via app settings does NOT update `siteConfig.containerStartTimeLimit`. This setting may not be configurable via API for Linux apps. Default is 230s.

**Workaround:** Ensure `start.sh` does NOT run `pip install`. Dependencies should be installed at deploy time via Oryx (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`). The startup script should ONLY launch the web server.

## Known Issue: App Unreachable After B1 Upgrade

**Symptom:** Upgrade succeeds, site shows "Running", but all requests timeout (HTTP 000) or return 503.

**Possible causes:**
1. **STARTUP_COMMAND app setting overrides start.sh** — The `STARTUP_COMMAND` app setting takes precedence over the `start.sh` file. If you update `start.sh` locally but the app setting still has the old command, your changes won't take effect.
   ```bash
   # Check current startup command:
   az webapp config appsettings list --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query "[?name=='STARTUP_COMMAND']"
   
   # Update it:
   az webapp config appsettings set --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --settings STARTUP_COMMAND="..."
   ```

2. **gunicorn not in PATH** — Azure Linux web apps may not have gunicorn in PATH after pip install. Use `python3 -m gunicorn` instead.

3. **uvicorn --ws flag** — If using uvicorn directly, `--ws wsproto` requires the `wsproto` package. Verify with `grep wsproto requirements.txt`.

4. **Container stuck after failed deploy** — If a previous deploy had a code error (e.g., `JSONResponse(detail=...)` instead of `content=`), the container may be in a broken state. Fix:
   ```bash
   az webapp stop --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
   az webapp start --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
   ```

5. **B1 instance on bad VM node** — Rare, but possible. If all else fails, create a new web app in a new plan (same region). The original plan `hafjet-bot-plan` in Southeast Asia may have a bad VM node — creating a NEW plan in the SAME region often resolves this.

## Debugging Steps When App Won't Start

1. Check site state: `az webapp show --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query state`
2. Enable logging: `az webapp log config --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --application-logging filesystem --level information`
3. Download logs: `az webapp log download --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --log-file=logs.zip`
4. Read startup logs in `LogFiles/StartupLogs/` — look for `failure.log` files
5. Read deployment logs in `deployments/*/log.log` — look for "Deployment successful"

## Startup Time Budget (Southeast Asia, B1)

| Phase | Duration | Notes |
|-------|----------|-------|
| Oryx build (pip install) | ~142s | Only on first deploy or when `SCM_DO_BUILD_DURING_DEPLOYMENT=true` |
| gunicorn startup | ~5-10s | Import + DB init |
| Health check probe | ~53s | Azure internal |
| **Total to first response** | **~200s** | Wait this long before testing |

## Cost

| SKU | Monthly Cost (SEA) | Covered by $100 Credit |
|-----|-------------------|------------------------|
| F1 | $0 | Yes |
| B1 | ~$12.40 (~RM57) | Yes |
| B2 | ~$24.80 (~RM114) | Yes |
