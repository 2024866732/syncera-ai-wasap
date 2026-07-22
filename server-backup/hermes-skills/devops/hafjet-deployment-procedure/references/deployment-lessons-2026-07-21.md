# Deployment Lessons Learned - 2026-07-21 Session

## Key Incidents and Fixes

### 1. az webapp deploy --type zip Pitfall
- **Issue**: `az webapp deploy --resource-group hafjet-bot-rg --name hafjet-whatsapp-bot --src-path /tmp/hafjet-prod.zip --type zip` reported success but the app failed to start (HTTP 503/000 timeouts).
- **Root Cause**: The Linux App Service runtime does not reliably handle the `--type zip` flag for direct source deployment, often resulting in a successful deployment status but a non-starting application.
- **Fix**: Use `az webapp deployment source config-zip` instead, which internally uses Kudu's zip deployment mechanism and provides more reliable status reporting.

### 2. Artifact Hygiene
- **Issue**: Early ZIP builds included local development artifacts like `venv`, `.env`, `__pycache__`, which caused runtime issues or security risks.
- **Fix**: Explicitly exclude:
  - `bot_data.db` (preserve production database)
  - `.git`, `.gitignore` (VCS metadata)
  - `__pycache__`, `*.pyc` (Python bytecode)
  - `node_modules` (if present)
  - `venv`, `antenv`, `*/venv` (virtual environments)
  - `*.env`, `.env.*` (environment files with secrets)
  - `*.zip`, `*.tar.gz` (prevent nesting)
  - `bootstrap/`, `cache/`, `logs/` (runtime directories)
- **Verification**: Use `zip -l` or Python's `zipfile` module to inspect contents before deployment.

### 3. Startup Command Mismatch
- **Issue**: The `start.sh` script referenced a local developer path (`/home/hafizi145/.hermes/whatsapp-bot`) that does not exist in Azure.
- **Symptom**: App fails to start immediately after deployment, logs show "No such file or directory".
- **Fix**: Ensure `start.sh` uses Azure-relative paths:
  ```bash
  #!/bin/bash
  cd /home/site/wwwroot
  /home/site/wwwroot/antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
    webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
  ```
  Or better, bypass `start.sh` entirely and set `appCommandLine` directly to the gunicorn command.

### 4. Configuration Drift
- **Issue**: Repeated use of `az webapp config set` to modify `appCommandLine` caused settings to drift from the known-good baseline.
- **Fix**: Treat app settings as immutable during deployment. Instead of changing settings:
  - Fix the root cause (e.g., correct `start.sh` or ZIP artifact).
  - Redeploy with the corrected artifact.
  - Only update settings if absolutely necessary, and document the change as part of the deployment procedure.

### 5. Smoke Test Necessity
- **Issue**: Relying solely on `az webapp show` state (`"state": "Running"`) is insufficient; the app can be "Running" but not serving requests.
- **Fix**: Always run a sequence of smoke tests after deployment:
  1. `GET /health` → 200 OK
  2. `GET /api/customers` → 200 + JSON array
  3. `GET /api/handoff/metrics` → 200 + metrics JSON
  4. Optional: end-to-end keyword rule test
- **Automation**: Script these checks to run automatically post-deployment.

### 6. Rollback Discipline
- **Issue**: In the heat of an incident, engineers attempted to "fix" by redeploying the same broken artifact or tweaking settings.
- **Fix**: Treat any post-deployment failure as requiring immediate rollback to the last known good artifact. Do not iterate on the broken deployment.
- **Procedure**: 
  1. If smoke tests fail, STOP.
  2. Do not make further changes to app settings or code.
  3. Re-deploy the previous known-good ZIP.
  4. Re-run smoke tests.
  5. Only after success, investigate the failure in a separate branch.

## Recommendations for Future Deployments
1. **Immutable Artifacts**: Build the ZIP once, promote it through environments (if applicable), never rebuild.
2. **Immutable Infrastructure**: Consider treating the Azure App Service as immutable; replace via deployment rather than in-place patches.
3. **Canary Validation**: For higher-risk changes, deploy to a staging slot first, warm it up, run smoke tests, then swap.
4. **Observability**: Ensure application logs are streaming to Log Analytics or similar for post-deployment analysis.
5. **Feature Flags**: Consider wrapping major functionality (like the new handoff/metrics endpoints) in feature flags for safer rollout.

## Related Commands
- List recent deployments: `az webapp deployment list --resource-group <rg> --name <app> --top 5`
- Show deployment details: `az webapp deployment show --resource-group <rg> --name <app> --id <deploymentId>`
- Reset deployment credentials: `az webapp deployment list-publishing-credentials` (use with caution)