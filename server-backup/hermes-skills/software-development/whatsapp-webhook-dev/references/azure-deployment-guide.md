# Azure App Service Deployment for WhatsApp Bot

Deploy FastAPI WhatsApp webhook to Azure App Service (Free F1 tier) for a stable HTTPS endpoint — replaces ngrok free tier for production Meta webhook delivery.

## Why Azure Over Ngrok Free Tier

- Ngrok free tier (`*.ngrok-free.dev`) has **unreliable webhook delivery** from Meta (connection drops, rate limits, Meta may flag the domain)
- Azure Free F1 gives a **permanent HTTPS domain**: `https://[name].azurewebsites.net`
- No tunnel restart, no URL changes, no auth token needed
- Auto SSL certificate included
- Meta webhook verification works reliably with `azurewebsites.net` domains

## Prerequisites

- Azure CLI installed (`az --version`)
- Azure account (free tier is sufficient)
- **Device/browser for login**: `az login --use-device-code` requires entering a code on a separate device (phone/laptop). You cannot complete login headlessly.

## Step 1: Login

```bash
az login --use-device-code
```

A device code will be displayed. Open https://login.microsoft.com/device on any browser/device and enter the code. The CLI will poll and complete authentication.

## Step 2: Create Requirements File

If `requirements.txt` doesn't exist, create one:

```
fastapi==0.115.0
uvicorn==0.30.6
httpx==0.27.2
python-dotenv==1.0.1
gunicorn==22.0.0
```

**Important:** `gunicorn` is required for Azure — it uses gunicorn as the production server, not uvicorn directly.

## Step 3: Create Startup File

Create `startup.txt` in the bot directory:

```
gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000
```

Azure reads this file to know how to start the app. Port must be `8000` (Azure's default).

## Step 4: Create Azure Resources

```bash
# Resource group
az group create --name hafjet-bot-rg --location southeastasia

# App Service plan (Free F1)
az appservice plan create \
  --name hafjet-bot-plan \
  --resource-group hafjet-bot-rg \
  --sku F1 \
  --is-linux

# Web App (Python 3.11)
az webapp create \
  --resource-group hafjet-bot-rg \
  --plan hafjet-bot-plan \
  --name hafjet-whatsapp-bot \
  --runtime "PYTHON:3.11"
```

**Note:** The `--startup-file` flag in `az webapp create` may not work on all CLI versions. Set it separately in Step 5.

## Step 5: Set Startup Command

**Recommended: Use `start.sh` script** (handles `cd` to Azure path + pip install at startup):

```bash
az webapp config set \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --startup-file "start.sh"
```

The `start.sh` file (see `templates/start.sh`) should:
- `cd /home/site/wwwroot` (Azure Linux container working directory)
- Run `pip install -r requirements.txt` (idempotent)
- Start gunicorn with `${WEBSITES_PORT:-8000}` binding
- Log to stdout/stderr (Azure captures these)

**Alternative (direct gunicorn command):**
```bash
az webapp config set \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --startup-file "gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000"
```

Verify it was set:
```bash
az webapp config show \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --query "appCommandLine"
```

Expected output: `start.sh` or the gunicorn command.

## Step 6: Set Environment Variables (App Settings)

**Critical:** Env var names must match exactly what `webhook_listener.py` uses in `os.getenv()`:
- `APP_SECRET` (NOT `WHATSAPP_APP_SECRET`)
- `VERIFY_TOKEN` (NOT `WEBHOOK_VERIFY_TOKEN`)
- `WHATSAPP_PHONE_ID` (NOT `PHONE_ID`)

```bash
az webapp config appsettings set \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --settings \
    WHATSAPP_ACCESS_TOKEN="YOUR_TOKEN" \
    WHATSAPP_PHONE_ID="YOUR_PHONE_ID" \
    APP_SECRET="YOUR_APP_SECRET" \
    VERIFY_TOKEN="YOUR_VERIFY_TOKEN" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

**Note:** Azure masks values in output (`"value": null`) — this is normal, not an error.

## Step 7: Deploy Code

**Recommended method: `az webapp deploy --type zip`** (modern, replaces `az webapp deployment source config-zip`):

```bash
cd ~/.hermes/whatsapp-bot

# Create ZIP using Python zipfile (universal — works on any server)
python3 << 'PYEOF'
import zipfile, os

EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', 'venv', 'dashboard'}
EXCLUDE_FILES = {'.env', 'startup.txt', '.DS_Store', 'deploy.zip', 'bot_data.db'}

with zipfile.ZipFile('/tmp/hafjet-prod.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    # Core files (exclude dashboard source entirely)
    for root, dirs, files in os.walk('.', topdown=True):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f in EXCLUDE_FILES or f.endswith(('.pyc', '.pyo')):
                continue
            full = os.path.join(root, f)
            zf.write(full, os.path.relpath(full, '.'))
    
    # Add dashboard/dist separately (pre-built React SPA)
    dd = os.path.join('dashboard', 'dist')
    if os.path.exists(dd):
        for root, dirs, files in os.walk(dd):
            for f in files:
                full = os.path.join(root, f)
                zf.write(full, os.path.relpath(full, '.'))

print(f'ZIP: {os.path.getsize("/tmp/hafjet-prod.zip")} bytes, {len(zf.infolist())} files')
PYEOF

# Deploy to Azure
az webapp deploy \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --src-path /tmp/hafjet-prod.zip \
  --type zip
```

Expected output: `"status": "4"` (Succeeded) or `"status": "RuntimeSuccessful"`

**After deploy — ALWAYS verify startup command:**
```bash
az webapp config show -g hafjet-bot-rg -n hafjet-whatsapp-bot --query "appCommandLine"
# If null, re-set:
az webapp config set -g hafjet-bot-rg -n hafjet-whatsapp-bot --startup-file "start.sh"
```

**Alternative (legacy method):**
```bash
az webapp deployment source config-zip \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --src hafjet-bot.zip
```

## Step 8: Configure Health Check & Verify Deployment

**Configure Health Check** (one-time, survives deploys):
```bash
az webapp config set \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --generic-configurations '{"healthCheckPath": "/health"}'
```

Without this, Azure may mark the app as unhealthy during cold starts and restart it unnecessarily.

**Verify Deployment:**
```bash
# Check app state
az webapp show \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --query "state"

# Test health endpoint
curl -s "https://hafjet-whatsapp-bot.azurewebsites.net/health"

# Test webhook verification
curl -s "https://hafjet-whatsapp-bot.azurewebsites.net/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=TEST123"
# Expected: TEST123
```

**Full verification script:**
```bash
bash scripts/azure-deploy-verify.sh hafjet-whatsapp-bot hafjet-whatsapp-bot.azurewebsites.net
```

## Critical: SQLite Persistence Warning

`bot_data.db` at `/home/site/wwwroot/bot_data.db` is stored on the **ephemeral container disk**. It WILL be wiped when:
- Azure moves your app to a different container (auto-healing, scaling)
- You redeploy with `az webapp deploy` (sometimes — Kudu may preserve wwwroot but not guaranteed)
- The app Service Plan is scaled up/down

**For production data:** Mount Azure Files or use Azure SQL Database. For dev/testing, accept data loss.

## Critical: Azure Env Var Loading Pattern

**The #1 deployment failure in Azure is `load_dotenv()` destroying Azure-injected env vars.**

In Azure, `.env` file does NOT exist (excluded from zip). If your code does:
```python
# WRONG for Azure — destroys injected env vars
os.environ.pop("WHATSAPP_ACCESS_TOKEN", None)
load_dotenv(..., override=True)
```

**Correct pattern for Azure production:**
```python
_env_path = os.path.expanduser("~/.hermes/whatsapp-bot/.env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=False)
```

Symptom of this bug: `/health` returns `configured: false` and logs show "WhatsApp token or phone ID not configured!" — even though Azure App Settings are correctly set.

## Step 9: Update Meta Webhook URL

In Meta Developer Portal → WhatsApp → Configuration → Webhook:
- **Callback URL:** `https://hafjet-whatsapp-bot.azurewebsites.net/webhook`
- **Verify Token:** same as `VERIFY_TOKEN` in Azure app settings
- Subscribe to: `messages`

## Troubleshooting

```bash
# View live logs
az webapp log tail --resource-group hafjet-bot-rg --name hafjet-whatsapp-bot

# Restart app
az webapp restart --resource-group hafjet-bot-rg --name hafjet-whatsapp-bot

# Check app settings
az webapp config appsettings list --resource-group hafjet-bot-rg --name hafjet-whatsapp-bot
```

## Free Tier Limits

| Resource | F1 Free |
|----------|---------|
| RAM | 1 GB |
| CPU | 60 min/day |
| Storage | 1 GB |
| Bandwidth | 165 MB/day |
| Custom domains | No |
| SSL | Yes (auto) |

For a WhatsApp bot with moderate traffic (~100 msgs/day), F1 is sufficient.

## Student Cloud Hosting Optimization

When choosing between Azure, DigitalOcean, Heroku, or AWS for production:

- `references/student-cloud-hosting-comparison.md` — **Platform comparison**: pricing tables (Azure B1 ~$12.40/mo, DO $6/mo, Heroku $5/mo, AWS $10.50/mo), credit validity (Azure $100/mo recurring > DO $200 one-time > AWS $200 6mo), decision matrix, and the rule: **use recurring credits for production, one-time credits for staging/tests**.
