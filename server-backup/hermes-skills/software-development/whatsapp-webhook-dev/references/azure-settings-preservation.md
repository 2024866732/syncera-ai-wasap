# Azure App Settings Preservation — Critical Pitfall

## The Bug: `az webapp config appsettings set` Nullifies Other Settings

**Symptom:** You set one app setting (e.g., `SCM_DO_BUILD_DURING_DEPLOYMENT=true`) and discover that OTHER settings (e.g., `WHATSAPP_ACCESS_TOKEN`, `OPENROUTER_API_KEY`) become `null`. The app breaks with "not configured" errors.

**Root cause:** `az webapp config appsettings set --settings KEY=VALUE` **REPLACES the entire settings collection** with only what you pass. Any existing keys NOT included in the `--settings` args are **deleted/set to null**.

This behavior is NOT documented in Azure CLI help text. The CLI output shows `"value": null` for redaction but it actually means the value is GONE.

### When This Happens

```bash
# DANGEROUS — this DELETES all other settings:
az webapp config appsettings set -g RG -n APP --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true

# After this, WHATSAPP_ACCESS_TOKEN, APP_SECRET, etc. are ALL NULL
```

### Safe Pattern: Backup → Modify → Apply ALL at Once

```python
import subprocess, json

# 1. Backup ALL current settings
result = subprocess.run(
    ['az', 'webapp', 'config', 'appsettings', 'list',
     '--resource-group', 'RG', '--name', 'APP', '--output', 'json'],
    capture_output=True, text=True
)
settings = json.loads(result.stdout)

# Save backup to file (in case something goes wrong)
with open('/tmp/settings_backup.json', 'w') as f:
    json.dump(settings, f, indent=2)

# 2. Build a complete key=value map
settings_map = {}
for s in settings:
    settings_map[s['name']] = s.get('value', '')

# 3. Modify ONLY the key(s) you need to change
settings_map['SCM_DO_BUILD_DURING_DEPLOYMENT'] = 'true'

# 4. Apply ALL settings at once
args = ['az', 'webapp', 'config', 'appsettings', 'set',
        '--resource-group', 'RG', '--name', 'APP', '--settings']
for name, val in settings_map.items():
    args.append(f'{name}={val}')

subprocess.run(args, capture_output=True, text=True)

# 5. Verify — ensure no keys became null
verify = subprocess.run(
    ['az', 'webapp', 'config', 'appsettings', 'list',
     '--resource-group', 'RG', '--name', 'APP', '--output', 'json'],
    capture_output=True, text=True
)
post = json.loads(verify.stdout)
for s in post:
    if not s.get('value'):
        print(f"WARNING: {s['name']} has null value!")
```

## Secondary Pitfall: `az webapp deploy` Resets `appCommandLine`

**Symptom:** After `az webapp deploy --type zip`, the app shows "Application Error" even though `startup.txt` or `start.sh` is correct.

**Root cause:** The Kudu deployment process can RESET `appCommandLine` to `null` during zip deployment. It also may reset `linuxFxVersion`.

**Fix:** After every `az webapp deploy`, re-verify and re-set the startup command:
```bash
# Check current state
az webapp config show -g RG -n APP --query "appCommandLine"

# If null, re-set it
az webapp config set -g RG -n APP --startup-file "start.sh"
```

## Tertiary Pitfall: Health Check Not Configured

**Problem:** Azure restarts the app thinking it's unhealthy after cold start delays (Python containers can take 30-60s on Free tier).

**Fix** (one-time, survives all deploys):
```bash
az webapp config set -g RG -n APP --generic-configurations '{"healthCheckPath": "/health"}'
```

## Tertiary Pitfall: Kudu Credentials Always Redacted

**Problem:** All Azure CLI output (`az webapp deployment list-publishing-credentials`, `list-publishing-profiles`) shows `REDACTED` for user names and passwords.

**Impact:** You cannot programmatically obtain Kudu credentials for VFS API upload from the CLI alone.

**Workarounds:**
1. Use `az webapp deploy --type zip` instead of Kudu VFS API (recommended)
2. Access Kudu via the Azure Portal's "Advanced Tools" → "Go" (browser-based)
3. Do NOT spend time trying to extract Kudu passwords from `az` CLI — it's by design.

## Summary: Safe Azure Update Workflow

```
1. az webapp config appsettings list → backup to file
2. Modify only the key(s) you need in the backup
3. az webapp config appsettings set --settings KEY1=VAL1 KEY2=VAL2 ... (ALL keys)
4. az webapp config appsettings list → verify no nulls
5. az webapp deploy --type zip (if deploying code)
6. az webapp config show --query appCommandLine → if null, re-set
7. az webapp restart
8. curl /health for verification
```
