---
name: hafjet-deployment-plan
description: "Use when discussing, planning, or executing deployment for the HAFJET WhatsApp Bot. Locked strategy with three environments, exact CLI steps, and decision matrices for upgrades and failovers."
version: 1.3.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [deployment, azure, aws, heroku, whatsapp-bot]
    related_skills: [whatsapp-webhook-dev]

---

# HAFJET WhatsApp Bot - Deployment Strategy (LOCKED)

## Overview

This skill documents the locked deployment strategy for HAFJET WhatsApp Bot v2.1.
It covers three environments: Azure (primary production), AWS (staging), and Heroku (fallback).
**Do not execute migrations without explicit user confirmation.** This is a reference playbook only.

## Support Files

| File | Purpose |
|------|---------|
| `references/config-var-audit.md` | Exact env var name mapping (internal var → Azure setting → Heroku config) |
| `references/dashboard-portability.md` | Dashboard static serving compatibility across platforms |
| `references/heroku-cli-setup.md` | Heroku CLI installation + API key auth (no browser login) |
| `references/security-hardening-phase1.md` | Phase 1 security hardening (signature fail-closed, API key auth, log masking) — EXACT code changes |
| `references/vite-env-injection.md` | Build-time env var injection for Vite + Azure ZIP deploy |
| `references/azure-debug-503.md` | Debugging 503 errors after deploy (QuotaExceeded, import errors, logging, **resource-not-found/app-deleted**) |
| `scripts/verify_endpoints.py` | Full endpoint verification script (health, dashboard, API, webhook GET/POST, WebSocket) |
| `references/b1-upgrade-troubleshooting.md` | F1→B1 upgrade steps + app unreachable after upgrade |
| `references/azure-webapp-up-deploy.md` | `az webapp up` full deploy pattern (Oryx build, startup time budget, common failures) |

## Workflow Rules

1. **Always show exact diff before implementing** — Tuan Hafizi reviews code changes before any deployment. Never apply changes silently.
2. **Audit before protecting** — When adding auth/middleware, audit frontend consumers first to avoid breaking existing functionality.
3. **Fail closed, not open** — Security checks should reject by default when config is missing, not silently skip.
4. **Minimal first pass** — Protect only what's necessary (write routes first, read routes later) to reduce blast radius.
5. **Coordinated frontend-backend deploys** — When backend adds auth, frontend must send headers in the SAME deploy. Never deploy backend-only auth without updating frontend first. See `references/vite-env-injection.md` for the Vite build-time env var pattern.
6. **Verify before declaring success** — After deploy, always run health checks + test protected routes with valid AND invalid credentials. Don't assume deployment = working.
7. **Stop operations on throttle, do not retry** — If Azure returns 429 on plan create/delete, STOP all create/delete operations immediately. Do not retry until 15+ minutes have passed. Reuse existing resources only. See pitfall #23.
8. **Prefer web app recreate over plan recreate** — Never delete the App Service Plan unless absolutely necessary. Deleting the last web app on a plan auto-deletes the plan regardless of `--keep-empty-plan`. If you must delete a web app, expect the plan to be deleted too and plan for the throttle window.

## Current State (2026-06-27)

| Item | Value |
|------|-------|
| **Primary platform** | Azure App Service B1 (Basic) |
| **App name** | `hafjet-whatsapp-bot` |
| **Resource group** | `hafjet-bot-rg` |
| **App Service Plan** | `hafjet-bot-plan` (B1, Southeast Asia) — **DELETED** (auto-deleted when last web app removed) |
| **Entry point** | `webhook_listener:app` |
| **Startup command** | `bash /home/site/wwwroot/start.sh` → `python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto` |
| **DB** | SQLite (`bot_data.db`) |
| **Dashboard** | React SPA served via FastAPI at `/dashboard` |
| **WebSocket** | `/ws` with wsproto backend |
| **Meta webhook** | `https://hafjet-whatsapp-bot.azurewebsites.net/webhook` |
| **Security** | v2.1.0: fail-closed signature, X-API-Key on write routes, SecureFormatter masking |
| **Hardening status** | Code deployed locally, awaiting clean redeploy |
| **Subscription throttle** | Active — plan create/delete throttled until ~15 min after last violation |

## Credit Landscape

| Platform | Credit | Expiry | Monthly Cost |
|----------|--------|--------|--------------|
| **Azure for Students** | $100/month (recurring) | Renewable annually | $0 (F1), B1 ~$12.40 |
| **AWS Activate** | $200 | 6 months | t3.micro free 12mo, then ~$10.50 |
| **Heroku (GitHub Student Pack)** | $13/month | 24 months | Eco $5, Basic $7 |
| **DigitalOcean (GitHub Student Pack)** | $200 | 12 months | Basic 1GB: $6 |
| **Oracle Cloud Always Free** | Never expires | Unlimited | A1.Flex: 2 OCPU/12 GB, $0 |

---

## Playbook 1: Azure F1 to B1 Upgrade (Production)

### When to Trigger
- `QuotaExceeded` error on F1 (daily CPU limit hit)
- WebSocket disconnects during high traffic
- Need custom domain + free managed SSL cert
- Need guaranteed uptime (no quota interruptions)

### Prerequisites
```bash
az login
```

### Steps

#### Step 1: Upgrade App Service Plan
```bash
az appservice plan update \
  --name hafjet-bot-plan \
  --resource-group hafjet-bot-rg \
  --sku B1
```
**Time:** ~3 minutes
**Impact:** Brief restart (~10 seconds), zero data loss

#### Step 2: Enable Always On
```bash
az webapp config set \
  --name hafjet-whatsapp-bot \
  --resource-group hafjet-bot-rg \
  --always-on true
```

#### Step 3: Restart Web App
```bash
az webapp restart \
  --name hafjet-whatsapp-bot \
  --resource-group hafjet-bot-rg
```

#### Step 4: Verify
```bash
az appservice plan show \
  --name hafjet-bot-plan \
  --resource-group hafjet-bot-rg \
  --query "{sku:sku.name, tier:sku.tier}"

az webapp config show \
  --name hafjet-whatsapp-bot \
  --resource-group hafjet-bot-rg \
  --query "siteConfig.alwaysOn"

curl -s https://hafjet-whatsapp-bot.azurewebsites.net/health
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/dashboard
```

### Post-Upgrade State
| Item | Value |
|------|-------|
| **SKU** | B1 (1 vCPU, 1.75 GB RAM) |
| **Always On** | true |
| **Monthly cost** | ~$12.40 (~RM57) covered by $100 Azure credit |
| **Real cash** | $0 |
| **Startup command** | No change needed |

---

## Playbook 2: AWS Staging/Backup (t3.micro)

### When to Trigger
- Testing new features before production deploy
- Azure goes down (failover)
- Need backup environment for disaster recovery

### Steps

#### Step 1: Launch EC2 Staging Instance
```bash
aws ec2 run-instances \
  --image-id ami-xxxxxxxxx \
  --instance-type t3.micro \
  --key-name hafjet-key \
  --security-group-ids sg-xxxxxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=hafjet-staging}]' \
  --user-data file://aws-userdata.sh
```

Where `aws-userdata.sh`:
```bash
#!/bin/bash
apt update && apt install -y python3.11 python3.11-venv git
cd /home/ubuntu
git clone https://github.com/2024866732/hafjet-whatsapp-bot.git
cd hafjet-whatsapp-bot
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --ws wsproto --timeout 120 &
```

#### Step 2: Setup S3 Backup Bucket
```bash
aws s3 mb s3:hafjet-backups --region ap-southeast-1
# Cron: daily backup
aws s3 sync /home/hafjet-whatsapp-bot/bot_data.db s3:hafjet-backups/db/bot_data-$(date +%Y%m%d).db
```

#### Step 3: Configure Security Group
```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --port 443 \
  --cidr 0.0.0.0/0
```

### AWS Cost Analysis
| Item | Monthly Cost | Notes |
|------|-------------|-------|
| t3.micro (750h free) | $0 | 12-month free tier |
| S3 (5GB free) | $0 | Free tier |
| Bandwidth | ~$1-5 | Minimal for testing |
| **After 12mo** | **~$10.50** | t3.micro on-demand |

---

## Playbook 3: Heroku Eco Fallback (Full Production if Azure Fails)

### Prerequisites
- Heroku CLI installed (see `references/heroku-cli-setup.md`)
- `HEROKU_API_KEY` env var set (never use `heroku login` on headless servers)

### When to Trigger
- Azure for Students credit exhausted
- Azure subscription cancelled or expired
- Need zero-cost production alternative

### Files to Create/Update

#### `~/.hermes/whatsapp-bot/Procfile`
```
web: gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:$PORT --ws wsproto --timeout 120
```

#### `~/.hermes/whatsapp-bot/runtime.txt`
```
python-3.11.15
```

#### `~/.hermes/whatsapp-bot/requirements.txt`
No changes needed — `whitenoise` is NOT required (FastAPI StaticFiles is native).

### Pre-Deploy Checklist
```bash
# Verify dashboard/dist/ is in git (Heroku git push needs it)
git ls-files dashboard/dist/index.html

# Verify wsproto in requirements
grep wsproto ~/.hermes/whatsapp-bot/requirements.txt

# Verify .gitignore does NOT exclude dist/
grep -n "dist" ~/.hermes/whatsapp-bot/.gitignore
```

### Steps

#### Step 1: Create Procfile + runtime.txt
```bash
cat > ~/.hermes/whatsapp-bot/Procfile << 'EOF'
web: gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:$PORT --ws wsproto --timeout 120
EOF

echo "python-3.11.15" > ~/.hermes/whatsapp-bot/runtime.txt
```

#### Step 2: Commit + Deploy
```bash
cd ~/.hermes/whatsapp-bot
git add Procfile runtime.txt
git commit -m "Add Heroku Procfile and runtime.txt"
heroku create hafjet-whatsapp-bot --region us
git push heroku main
heroku ps:scale web=1
```

#### Step 3: Set Config Vars (EXACT names — see references/config-var-audit.md)
```bash
heroku config:set \
  WHATSAPP_ACCESS_TOKEN=*** \
  WHATSAPP_PHONE_ID="1089032617637482" \
  APP_SECRET=*** \
  VERIFY_TOKEN="HAFJET_RAUB_RAK" \
  OPENROUTER_API_KEY=*** \
  OPENROUTER_MODEL="openrouter/owl-alpha" \
  OPENROUTER_BASE_URL="https://openrouter.ai/api/v1" \
  AI_TIMEOUT="30" \
  APP_REFERER="https://hafjet.com"
```

**CRITICAL env var mapping** (internal var → env var name):
- `WHATSAPP_TOKEN` → reads `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_ID` → reads `WHATSAPP_PHONE_ID`
- `WEBHOOK_VERIFY_TOKEN` → reads `VERIFY_TOKEN`
- `APP_SECRET` → reads `APP_SECRET`
- No `WABA_ID` in code — do NOT set it
```bash
heroku ps:scale web=1
```

#### Step 4: Database Setup

**Option A - SQLite (ephemeral, lost on deploy):**
```python
# In db_logger.py, detect Heroku
import os
if os.getenv('DYNO'):
    DB_PATH = '/tmp/bot_data.db'
```

**Option B - MongoDB Atlas (persistent, recommended):**
1. Sign up at mongodb.com/atlas ($50 credit via GitHub Student Pack)
2. Create M0 free cluster (512MB)
3. Whitelist `0.0.0.0/0` (Heroku dynamic IPs)
4. Get connection string
5. `heroku config:set MONGODB_URI="mongodb+srv://..."`

#### Step 5: Update Meta Webhook
1. Go to Meta Developer Portal then WhatsApp then Configuration
2. Edit Webhook URL to: `https://hafjet-whatsapp-bot.herokuapp.com/webhook`
3. Click Verify and Save

#### Step 6: Verify
```bash
curl https://hafjet-whatsapp-bot.herokuapp.com/health
curl https://hafjet-whatsapp-bot.herokuapp.com/dashboard
```

### Heroku Cost Analysis

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Eco Dyno (1000h) | $5 | Covered by $13/mo credit |
| Heroku Postgres Mini | $0-5 | Optional, covered by credit |
| **Total monthly** | **$5** | **$0 cash** |
| **Validity** | 24 months | GitHub Student Developer Pack |
| **Total 24mo** | **$120 credit** | **$0 cash** |

---

## Environment Comparison Matrix

| Factor | Azure (current) | AWS (staging) | Heroku (fallback) |
|--------|-----------------|---------------|-------------------|
| **Monthly cost** | $0 (F1) | $0 (free tier) | $5 (Eco) |
| **24mo cash cost** | $0 | $0-120 | $0 |
| **Stability** | High | High | Medium |
| **WebSocket** | Working | Supported | Supported |
| **Custom domain** | B1+ | Yes | Yes ($7/mo for SSL) |
| **Migration effort** | None | Medium | High |
| **Credit exhaustion** | Low (recurring) | High (6mo one-time) | Low (24mo recurring) |
| **DB persistence** | Local | RDS free 12mo | Ephemeral or Atlas $50 credit |

---

## Decision Matrix

| Scenario | Action | Trigger |
|----------|--------|---------|
| F1 quota exceeded | Upgrade to B1 | `QuotaExceeded` error |
| Need custom domain or SSL | Upgrade to B1 | Product requirement |
| Azure credit exhausted | Deploy Heroku and swap webhook | Monthly cost exceeds $50 |
| Azure subscription ends | Migrate to Heroku with AWS S3 | Account disabled |
| Test new features | Deploy to AWS staging | Before production push |
| Long-term (24mo+) | Return to Azure F1 or DigitalOcean | Credit landscape changes |

---

## One-Shot Recipes

### Recipe: Quick B1 Upgrade
```
az appservice plan update --name hafjet-bot-plan --resource-group hafjet-bot-rg --sku B1
az webapp config set --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --always-on true
az webapp restart --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/health
```

Expected: `{"status":"healthy"}`

### Recipe: Heroku Emergency Deploy
```
cd ~/.hermes/whatsapp-bot && git add . && git commit -m "emergency deploy"
git push heroku main
heroku ps:scale web=1
heroku config:set OPENROUTER_API_KEY=*** [+ other vars]
```
Then update Meta webhook URL to `https://hafjet-whatsapp-bot.herokuapp.com/webhook`

Expected: `{"status":"healthy"}`

### Recipe: AWS Staging Clone
```
aws ec2 run-instances --instance-type t3.micro --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=hafjet-staging}]' --user-data file://aws-userdata.sh
```
Configure SG for port 443, deploy code via git clone or SSM, test inbound webhook manually.

---

## Approval Status (2026-06-27)

| Playbook | Status | Approved By |
|----------|--------|-------------|
| Playbook 1: Azure F1 → B1 | ✅ PRODUCTION-APPROVED | Tuan Hafizi |
| Playbook 2: Heroku Eco Fallback | ✅ FALLBACK-APPROVED | Tuan Hafizi |
| Playbook 3: AWS Staging | 📋 Reference only (not executed) | — |

## Heroku Eco Caution Notes

| Caution | Detail | Impact |
|---------|--------|--------|
| **Eco dyno sleeps after 30min inactivity** | First request after sleep has 3-5s cold start latency. WhatsApp webhook retries usually handle this. | Acceptable for low-traffic bot. If high traffic, upgrade to Basic dyno ($7/mo). |
| **Custom domain / SSL** | Eco dynos support custom domains but SSL requires paid dyno ($7/mo Basic) or manual cert. Verify capability at execution time. | Default `*.herokuapp.com` includes shared SSL. Custom domain needs manual verification. |
| **No persistent disk** | All filesystem changes lost on deploy/restart. SQLite not viable for production. | Use MongoDB Atlas or accept ephemeral data. |

## Validation Techniques

### Config Var Audit
When migrating between platforms, always extract env vars from code and compare against platform settings. See `references/config-var-audit.md`.

### Frontend-Before-Backend Auth Check
When adding auth middleware, always audit frontend consumers first:
```bash
grep -rn "fetch\|axios" dashboard/src/ --include="*.jsx" | grep "/api/"
grep -rn "X-API-Key\|Authorization" dashboard/src/ --include="*.jsx"
```
If frontend doesn't send auth headers, blanket `/api/*` protection **breaks the dashboard**. See `references/security-hardening-phase1.md` for the minimal-first-pass approach.

## Common Pitfalls

1. **Security hardening must precede production deploy** — Before running Playbook 1 or Playbook 2, complete Phase 1 from `references/security-hardening-phase1.md`: fix webhook signature fail-closed, set DASHBOARD_API_KEY, add targeted log masking. These are ~40 lines of code, zero cost, and block the most common attack vectors.
2. **Env var name ≠ internal variable name** — `WHATSAPP_TOKEN` is the Python variable but reads from `WHATSAPP_ACCESS_TOKEN`. Always audit `os.getenv()` calls, never guess. See `references/config-var-audit.md`.
3. **Heroku SQLite is ephemeral** — dynos restart daily, files wiped. Use `/tmp/` path and accept data loss, or use MongoDB Atlas for persistence.
3. **Heroku ports are dynamic** — Always use `$PORT` env var, never hardcode. The gunicorn `--bind` must use `$PORT`.
4. **Meta webhook change takes 1-2 min** — After updating webhook URL, wait before sending test messages.
5. **AWS t3.micro has CPU credits** — Burst usage depletes credits; instance throttles. Not suitable for sustained high traffic.
6. **Azure B1 Always On** — Disabled by default on B1 to save cost. Must explicitly enable.
7. **STARTUP_COMMAND consistency** — If using gunicorn, always include `--ws wsproto` for WebSocket support across all platforms.
8. **ZIP deploy vs git push** — Azure ZIP deploy uses `/home/site/wwwroot/` (persistent), Heroku git push does not persist uploaded files.
9. **AWS credits expire in 6 months** — Set calendar reminder. After expiry, t3.micro costs ~$10.50/month from day 7.
10. **`whitenoise` NOT needed** — FastAPI `StaticFiles` serves React builds natively. Don't add whitenoise to requirements.
11. **`dashboard/dist/` must be in git for Heroku** — Heroku deploys from git. If dist/ is gitignored, dashboard won't work. Verify with `git ls-files dashboard/dist/index.html`.
13. **Shell quoting breaks API key storage** — Heroku API keys contain special chars (`_`, `-`). When writing to `~/.bashrc`, use heredoc (`<< 'EOF'`) or set directly in shell first to verify before persisting. See `references/heroku-cli-setup.md`.
14. **Never use `heroku login` on headless servers** — It opens a browser. Always use `HEROKU_API_KEY` env var. See `references/heroku-cli-setup.md`.
15. **Azure deploy ≠ app running** — `az webapp deploy` returns success when ZIP is uploaded, but the app may fail to start (syntax error, missing import, QuotaExceeded). Always verify with `curl /health` after deploy. If 503, check `az webapp log config` (may be Off by default) then read Kudu logs.
16. **Free F1 quota blocks deploys** — `QuotaExceeded` state prevents app from starting even with valid code. Check `az webapp show --query state` before debugging. Resets at midnight UTC. Upgrade to B1 to eliminate.
17. **`JSONResponse` uses `content` not `detail`** — `JSONResponse(status_code=401, detail={"error": "..."})` crashes with `TypeError`. Use `content={"error": "..."}`. The `detail` kwarg is for `HTTPException` only. This bug causes ALL requests to return 500 because the middleware itself crashes.
18. **STARTUP_COMMAND app setting overrides start.sh** — Azure uses the `STARTUP_COMMAND` app setting, NOT `start.sh`. Updating `start.sh` locally has no effect unless you also update the app setting via `az webapp config appsettings set`. Better yet, set `appCommandLine` via REST API before first deploy.
19. **B1 upgrade may leave app unreachable** — After upgrading F1→B1, the app may not start due to container state. See `references/b1-upgrade-troubleshooting.md` for debug steps.
25. **`az webapp start` returns success even when the resource doesn't exist** — The CLI exits 0 with empty output for non-existent web apps. After running `start`, ALWAYS verify with `az webapp list -g <rg>` or `curl` to confirm the app actually exists and is reachable. If all endpoints return 503 but `az webapp list` returns empty, the app was deleted — see `references/azure-debug-503.md` § "Resource Not Found".
21. **Oryx auto-detects `application:app`** — Fresh deploys via `az webapp up` use `application:app` as default entry point. If your app uses a different module (e.g., `webhook_listener:app`), set `appCommandLine` via REST API BEFORE first deploy. CLI `az webapp config set` does NOT apply to existing apps.
22. **Restart triggers Oryx rebuild** — `az webapp restart` can trigger a full Oryx rebuild (~142s). During this time the app is unreachable. Wait 200s after restart before testing.
23. **Subscription throttle on rapid plan create/delete** — Too many App Service Plan operations in short time triggers throttle. Wait 15+ min for reset. Reuse existing plans when possible. See `references/azure-webapp-up-deploy.md`.
24. **gunicorn MUST be in requirements.txt** — `python3 -m gunicorn` fails if gunicorn is not listed in requirements.txt. Oryx installs ONLY what's in requirements.txt during build.
25. **Deceptive Retry-After on throttle** — Azure returns `Retry-After: 5` seconds in 429 responses, but the actual throttle window for repeated violations is 15+ minutes. Do NOT retry after 5s and expect success. Stop all plan create/delete operations and wait.
26. **`--keep-empty-plan` does NOT prevent plan deletion** — When deleting the last web app on a plan, Azure auto-deletes the plan even with `--keep-empty-plan`. If you need the plan, create a dummy web app on it first, THEN delete the real one.
27. **Three startup mechanisms, one precedence** — Azure web apps have three separate startup configuration sources with this priority (highest first):
   - `STARTUP_COMMAND` app setting (e.g., `az webapp config appsettings set --settings STARTUP_COMMAND="..."`)
   - `appCommandLine` in `siteConfig` (set via REST API)
   - `start.sh` file in the deploy root (used by Oryx if neither of the above is set)
   
   **The `STARTUP_COMMAND` app setting is the most commonly overlooked** — it persists across deploys and overrides `start.sh`. If you update `start.sh` locally but forget to update the `STARTUP_COMMAND` app setting, your changes won't take effect. Always check all three:
   ```bash
   az webapp config appsettings list -g <rg> -n <app> --query "[?name=='STARTUP_COMMAND']"
   az rest --method GET --uri "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/config/web?api-version=2022-03-01" --query "properties.appCommandLine"
   ```
   **Safe approach:** Set `STARTUP_COMMAND` explicitly AND include a correct `start.sh`. Deploy once. If Oryx still auto-detects `application:app`, set `ENABLE_ORYX_BUILD=false` to force Oryx to respect your startup command.

---

## Verification Checklist

**Quick verify:**
```bash
python3 scripts/verify_endpoints.py
```

**After Azure B1 upgrade:**
- [ ] `az appservice plan show` returns `sku: B1`
- [ ] `az webapp config show` returns `siteConfig.alwaysOn: true`
- [ ] `curl /health` returns 200
- [ ] `curl /dashboard` returns HTML
- [ ] WebSocket `/ws` connects without 403

**After Heroku deploy:**
- [ ] `heroku ps` shows web running
- [ ] `curl /health` returns 200
- [ ] Procfile uses `$PORT` not hardcoded port
- [ ] Config vars all set (`heroku config` shows all required keys)
- [ ] Meta webhook updated

**After AWS staging:**
- [ ] EC2 instance running t3.micro
- [ ] Security group allows inbound on required port
- [ ] Webhook accessible from internet
- [ ] S3 backup bucket created and tested
