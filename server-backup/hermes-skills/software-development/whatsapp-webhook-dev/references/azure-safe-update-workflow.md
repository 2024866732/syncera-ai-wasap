# Azure Safe Update Workflow — Session 2026-06-27

This document captures the exact workflow used to audit, backup, verify, and safely update Azure App Service settings without nulling any values.

## Problem Context

The HAFJET WhatsApp Bot (`hafjet-whatsapp-bot`) was deployed to Azure App Service but had a history of configuration issues:
- `appCommandLine` being nulled by zip deployments
- Startup command pointing to wrong path (local dev path instead of `/home/site/wwwroot`)
- Settings getting overwritten when individual keys were updated
- Inability to use `az webapp up` (destructive/replaces slot configuration)

## Safe Workflow Applied

### Step 1: Export settings to JSON
```bash
az webapp config appsettings list -g hafjet-bot-rg -n hafjet-whatsapp-bot --output json > /tmp/hafjet-settings.json
```

### Step 2: Backup to persistent storage
```bash
cp /tmp/hafjet-settings.json /home/hafizi145/.hermes/whatsapp-bot/azure-settings-backup-$(date +%Y-%m-%d).json
```

### Step 3: Diff against expected expected config
```python
# Check for missing/null keys
import json
with open('/path/to/backup.json') as f:
    settings = {s['name']: s['value'] for s in json.load(f)}
expected = ['WHATSAPP_ACCESS_TOKEN', 'APP_SECRET', 'VERIFY_TOKEN', 'WHATSAPP_PHONE_ID',
            'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_BASE_URL',
            'SCM_DO_BUILD_DURING_DEPLOYMENT', 'WEBSITES_PORT', 'STARTUP_COMMAND',
            'ENABLE_ORYX_BUILD', 'AI_TIMEOUT']
missing = [k for k in expected if k not in settings]
nulls = [k for k in expected if not settings.get(k)]
```

### Step 4: If updating settings, apply ALL at once
```python
import subprocess
# Build --settings KEY=VAL KEY=VAL ... for ALL keys
args = ['az', 'webapp', 'config', 'appsettings', 'set',
        '--resource-group', 'RG', '--name', 'APP', '--settings']
for k, v in settings_map.items():
    args.append(f'{k}={v}')
subprocess.run(args)
```

### Step 5: Verify no nulls after update
```bash
az webapp config appsettings list -g RG -n APP --output json | python3 -c "
import sys,json
data = json.loads(sys.stdin.read())
for s in data:
    if not s.get('value'):
        print(f'NULL: {s[\"name\"]}')
"
```

### Step 6: Verify startup command
```bash
az webapp config show -g RG -n APP --query "{appCommandLine, linuxFxVersion}"
# Ensure appCommandLine is "start.sh" (not null, not bash /home/site/wwwroot/start.sh)
```

### Step 7: HTTP endpoint verification
Run `scripts/azure-deploy-verify.sh hafjet-whatsapp-bot hafjet-whatsapp-bot.azurewebsites.net`

## Key Findings (2026-06-27)

| Setting | Value | Notes |
|---------|-------|-------|
| `appCommandLine` | `start.sh` | Works — relative path resolves in `/home/site/wwwroot` |
| `linuxFxVersion` | `PYTHON\|3.11` | Correct |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Required for Oryx to install pip packages |
| `WEBSITES_PORT` | `8000` | Gunicorn binds to this |
| `WEBSITE_SITE_NAME` | (runtime-injected) | Use for Azure detection in code |
| `STARTUP_COMMAND` | `gunicorn -w 2 -k uvicorn...` | Backup startup mechanism |
| `ENABLE_ORYX_BUILD` | `true` | Ensures Python runtime provisioning |

## Root Cause of Historical Failures

1. **`start.sh` had wrong path**: `cd /home/hafizi145/.hermes/whatsapp-bot` instead of `cd /home/site/wwwroot`. Azure container has no `/home/hafizi145` — gunicorn never found `webhook_listener.py`.
2. **Settings nulled by individual updates**: `az webapp config appsettings set --settings X=Y` without other keys → other keys become null.
3. **Build disabled + dependencies not pre-installed**: `SCM_DO_BUILD_DURING_DEPLOYMENT=false` means no pip install, but venv was empty.

## Prevention Checklist

- [ ] `start.sh` uses `cd /home/site/wwwroot` (never local dev paths)
- [ ] `start.sh` uses `${WEBSITES_PORT:-8000}` for port binding
- [ ] `start.sh` runs `pip install -r requirements.txt` at startup (for `SCM_DO_BUILD_DURING_DEPLOYMENT=false`)
- [ ] `SCM_DO_BUILD_DURING_DEPLOYMENT=true` for most reliable dependency install
- [ ] `appCommandLine=start.sh` — Linux zip deploy PRESERVES it; only re-set if confirmed null
- [ ] `healthCheckPath=/health` configured (one-time)
- [ ] Settings updated in bulk (all keys at once)
- [ ] Backup kept before any settings change
- [ ] `scripts/azure-deploy-verify.sh` run post-deploy
- [ ] SQLite persistence risk assessed (ephemeral disk warning)
