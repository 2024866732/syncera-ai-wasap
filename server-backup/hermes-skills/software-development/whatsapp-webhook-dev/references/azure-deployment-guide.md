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

Expected output: `gunicorn -w 2 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000`

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

```bash
cd ~/.hermes/whatsapp-bot

# Option A: Using zip command (if available)
zip -r hafjet-bot.zip . \
  --exclude "*.pyc" \
  --exclude "__pycache__/*" \
  --exclude "venv/*" \
  --exclude ".env"

# Option B: Using Python zipfile (if zip command not available)
python3 << 'PYEOF'
import zipfile, os

exclude = {'__pycache__', 'venv', '.env', 'README.md', 'start.sh', 'startup.txt', '.env.example'}

with zipfile.ZipFile('/tmp/hafjet-bot.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in exclude and not d.startswith('.')]
        for f in files:
            if f.endswith('.pyc') or f in exclude:
                continue
            fp = os.path.join(root, f)
            zf.write(fp, os.path.relpath(fp, '.'))

print(f'ZIP created: {os.path.getsize("/tmp/hafjet-bot.zip")} bytes')
PYEOF

# Deploy
az webapp deployment source config-zip \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --src hafjet-bot.zip
```

Expected output: `"status": "RuntimeSuccessful"`

## Step 8: Verify Deployment

```bash
# Check app state
az webapp show \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --query "state"

# Expected: "Running"

# Test webhook verification
curl -s "https://hafjet-whatsapp-bot.azurewebsites.net/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=TEST123"

# Expected: TEST123

# Test health endpoint (check configured: true)
curl -s "https://hafjet-whatsapp-bot.azurewebsites.net/health"
# Expected: {"configured": true, ...}
# If configured: FALSE → env vars not loaded (see pitfall 15a in SKILL.md)
```

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
