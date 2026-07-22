---
name: hafjet-deployment-plan
description: "Use when discussing, planning, or executing deployment for the HAFJET WhatsApp Bot. Locked strategy with four environments (Azure, AWS, Heroku, Oracle), exact CLI steps, and decision matrices for upgrades, throttling recovery, and failovers. ALSO covers post-deploy verification protocol + dashboard auth 401 debugging + build_zip.py artifact hygiene."
version: 1.12.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [deployment, azure, aws, heroku, oracle, whatsapp-bot]
    related_skills: [whatsapp-webhook-dev, hafjet-deployment-procedure]

---

# HAFJET WhatsApp Bot - Deployment Strategy (LOCKED)

## Overview

Deployment strategy for HAFJET WhatsApp Bot v2.1+. Pre-commit rule: see `references/pre-commit-review-rule.md`.

## ⚠️ Deployment Method Pitfall (Updated Jul 2026)

**`az webapp deploy --type zip` is unreliable on Linux App Service.** It returns `{"status": "RuntimeSuccessful"}` but frequently **does not update the actual files** in `/home/site/wwwroot/`. The platform reports success even when files on disk are unchanged, leading to silent deployment failures.

**Preferred method (July 2026+):** Use the deprecated but reliable `az webapp deployment source config-zip` command, which consistently updates files and reports accurate status.

```bash
az webapp deployment source config-zip \
  --resource-group <rg> \
  --name <app> \
  --src /tmp/hafjet-prod.zip
```

Wait for the operation to complete and verify `"status": "RuntimeSuccessful"` in the output.

## Updated Deployment Procedure (Post-Sprint C)

### 1. Prepare the Artifact (Critical)
- **Never build on the fly** during deployment. Use a pre-built ZIP from the exact commit to be deployed.
- **Always use `git archive`** from the approved branch (e.g., `release/v2.2.0`):
  ```bash
  git archive -o /tmp/hafjet-prod.zip HEAD
  ```
- **Verify exclusions:** The ZIP must NOT contain:
  - `bot_data.db` (preserves production database)
  - `.git`, `__pycache__`, `node_modules`, `venv` (build artifacts)
  - `*.db`, `*.zip`, `.env`, `*.env.*` (secrets and databases)
  - Local development files not needed in production
- **Confirm contents** before deployment:
  ```bash
  unzip -l /tmp/hafjet-prod.zip | head -20
  ```

### 2. Backup Current Configuration (Recommended)
- Export current app settings for potential rollback reference:
  ```bash
  az webapp config appsettings list \
    --resource-group <rg> \
    --name <app> \
    --query "[].{name:name, value:value}" -o json > /tmp/pre-deploy-settings.json
  ```
- Record current runtime configuration:
  ```bash
  az webapp config show \
    --resource-group <rg> \
    --name <app> \
    --query "{startup:appCommandLine, runtime:linuxFxVersion}" -o json
  ```

### 3. Deploy the ZIP Artifact
- Execute the deployment:
  ```bash
  az webapp deployment source config-zip \
    --resource-group <rg> \
    --name <app> \
    --src /tmp/hafjet-prod.zip
  ```
- **Monitor output** for `"status": "RuntimeSuccessful"` (this indicates the deployment agent completed successfully).
- **Do not use**:
  - `az webapp up` (overwrites configuration)
  - `az webapp deploy --src-path ... --type zip` (unreliable on Linux)
  - Manual file copying or FTP (bypasses deployment tracking)

### 4. Stabilization Wait Period (Mandatory)
- After deployment success, **wait 60-120 seconds** before running smoke tests.
- This allows:
  - Oryx build process to complete (if applicable)
  - Application pool to recycle and warm up
  - Dependency initialization (Python virtualenv, package loading)
  - Signal propagation across all instances (if scaled out)

### 5. Comprehensive Smoke Tests (ALL MUST PASS)
Execute in order. **If ANY fail, initiate immediate rollback.**

#### 5.1 Basic Health Endpoint
```bash
curl -fsS --max-time 15 "https://<app>.azurewebsites.net/health" -o /tmp/health.json
python3 -c "import json; d=json.load(open('/tmp/health.json')); assert d.get('status') == 'ok', f'Health check failed: {d}'"
```
**Expected:** `{"status":"ok", "service":"HAFJET WhatsApp Bot v2.0", ...}`

#### 5.2 Core API Endpoints (Auth + Customers)
```bash
# Get auth token
TOKEN=$(curl -fsS -X POST "https://<app>.azurewebsites.net/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"hafizi@hafjet.com","password":"admin123"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))")

# Test customers endpoint (critical for data access)
curl -fsS "https://<app>.azurewebsites.net/api/customers?limit=3" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/customers.json
python3 -c "import json; d=json.load(open('/tmp/customers.json')); assert isinstance(d, list) and len(d) > 0, 'Customers endpoint failed or empty'"
```

#### 5.3 Sprint C Observability Endpoints (New in v2.2.0)
```bash
# Conversation state (verify new tables migrated)
curl -fsS "https://<app>.azurewebsites.net/api/handoff/state/60198021500" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/state.json
python3 -c "import json; d=json.load(open('/tmp/state.json')); assert 'mode' in d, 'Handoff state endpoint failed'"

# Handoff events timeline
curl -fsS "https://<app>.azurewebsites.net/api/handoff/events/60198021500" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/events.json
python3 -c "import json; d=json.load(open('/tmp/events.json')); assert 'events' in d, 'Handoff events endpoint failed'"

# Metrics endpoint (validates new DB functions)
curl -fsS "https://<app>.azurewebsites.net/api/handoff/metrics" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/metrics.json
python3 -c "import json; d=json.load(open('/tmp/metrics.json')); assert 'handoff_count' in d, 'Metrics endpoint failed'"
```

#### 5.4 Optional: Full End-to-End Flow Test
```bash
# Test keyword v2 rule creation and matching
RULE_ID=$(curl -fsS -X POST "https://<app>.azurewebsites.net/api/keywords/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test","hello"],"match_type":"contains","sequence":[{"msg":"Hi!"}],"next_actions":{"label":"test"}}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")

if [ -n "$RULE_ID" ]; then
  # Test match
  curl -fsS -X POST "https://<app>.azurewebsites.net/api/keywords/v2/test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"hello"}' -o /tmp/kw_test.json
  python3 -c "import json; d=json.load(open('/tmp/kw_test.json')); assert d.get('matched') == True, 'Keyword v2 match failed'"

  # Cleanup test rule
  curl -fsS -X DELETE "https://<app>.azurewebsites.net/api/keywords/v2/$RULE_ID" \
    -H "Authorization: Bearer $TOKEN"
fi
```

### 6. Verification of Success
If all smoke tests pass:
- Deployment is **SUCCESSFUL**
- Consider the deployed ZIP as the new "last known good" artifact for future rollbacks
- Monitor logs for 5-10 minutes: `az webapp log tail --resource-group <rg> --name <app> --lines 50`

### 7. Immediate Rollback Procedure (On ANY Smoke Test Failure)
**DO NOT** attempt to:
- Redeploy the same artifact
- Modify `appCommandLine` or other settings
- "Fix" the deployment incrementally

**IMMEDIATELY execute:**
```bash
# Replace with your verified last-known-good ZIP path
az webapp deployment source config-zip \
  --resource-group <rg> \
  --name <app> \
  --src /tmp/hafjet-prod-v220-final.zip  # <-- KNOWN GOOD ARTIFACT
```

**After rollback completes, rerun ALL smoke tests** to confirm recovery to known-good state.

## Key Rules & Lessons Learned (Sprint C Deployment)

| Rule | Enforcement |
|------|-------------|
| ✅ **Use version-controlled ZIP from `git archive`** | Never build during deployment; avoids environment drift |
| ✅ **Verify ZIP exclusions** | Prevents leaking secrets or overwriting production DB |
| ✅ **Wait 60-120s post-deployment** | Allows platform and app to fully initialize |
| ✅ **Test Sprint C endpoints** | Validates new `conversation_state` and `handoff_*` tables/functions |
| ✅ **Keep verified last-good ZIP** | Enables reliable sub-minute rollback |
| ❌ **Never use `az webapp deploy --type zip` on Linux** | High risk of silent failure (reports success, doesn't update files) |
| ❌ **Never skip smoke tests** | `RuntimeSuccessful` ≠ application is responding correctly |
| ❌ **Never modify code/config during deploy window** | Creates indeterminate state; hinders rollback |

## Post-Deployment Checklist
[ ] Confirm app status: `az webapp show --resource-group <rg> --name <app> --query "{state:state}"` returns `"Running"`
[ ] Monitor logs for anomalies: `az webapp log tail --resource-group <rg> --name <app> --timespan 10m`
[ ] Validate no error spikes in Application Insights or Log Analytics (if configured)
[ ] Document any deviations for next deployment retro

## References
- See `references/deployment-lessons-2026-07-21.md` for detailed Azure App Service quirks observed during Sprint C deployment
- See `templates/deploy-checklist.txt` for printable step-by-step verification checklist
- See `references/azure-oryx-linux-pitfalls.md` for broader Linux App Service deployment considerations
- See skill `hafjet-deployment-procedure` for detailed step-by-step procedure with explanations