# ZIP Build Pattern for Azure Deployment

When deploying to Azure App Service from a server where `zip` is unavailable (Azure SSH, minimal containers), use Python's `zipfile` module as a universal fallback.

## Problem

The zip command is not available on all Linux servers:
```
$ zip -r deploy.zip .
bash: zip: command not found
```

## Solution: `deploy.sh` → `deploy.py`

Convert from a shell script to a Python script that uses `zipfile`. See `templates/deploy.py` for the full working template.

## Exclusion Rules

```
EXCLUDE_DIRS      = __pycache__, node_modules, .git, .backup
EXCLUDE_EXTENSIONS = .pyc, .pyo, .md
EXCLUDE_FILES     = .env, deploy.sh, deploy.py, deploy.zip, .gitignore
EXCLUDE_PATTERNS  = bot_data.db, startup.txt, known-good-baseline.md
```

Plus dynamic patterns: `deploy_*.zip` (stale archives).

## Self-Exclusion Pitfall

The `deploy.zip` being created can be included in itself if `os.walk('.')` reaches it during iteration. Always add `'deploy.zip'` to `EXCLUDE_FILES`.

## .env.example vs .env

- `.env` → EXCLUDE (real secrets)
- `.env.example` → INCLUDE (placeholder template, useful reference)

Verify with: `head -3 .env.example` — should show `your_token_here` style placeholders.

## Pre-Flight Verification

After building, always verify:
1. Required files included (`webhook_listener.py`, `start.sh`, etc.)
2. Dashboard dist included (4+ files)
3. `bot_data.db` excluded
4. `.env` excluded
5. No `node_modules/` entries
6. No `deploy.zip` self-inclusion
7. Report total size and entry count

## Integration with pip install on Azure

Azure App Service Linux runs `start.sh` (or `appCommandLine`) which does:
```bash
pip install -r --quiet requirements.txt || true
gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:${WEBSITES_PORT:-8000}
```

The `|| true` prevents deploy failure when packages are already installed.

## Azure Persistence Risk

⚠️ `/home/site/wwwroot/` is NOT persistent across container restarts on Free tier.
`bot_data.db` WILL be lost on:
- ZIP deploy (overwrite)
- Scale up/down (new instance)
- Region failover

Mitigation:
1. Exclude `bot_data.db` from zip (prevent stale data overwrite)
2. Mount Azure Files for `/home/site/wwwroot/data/` (medium-term)
3. Migrate to Azure SQL / Supabase (long-term)
