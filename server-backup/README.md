# HAFJET-Hermes-Server Backup

Auto-backup dari server `HAFJET-Hermes-Server`. 

## Struktur Folder

```
server-backup/
├── hermes-config/      # config.yaml, SOUL.md, history
├── hermes-skills/      # Semua custom skills
├── hermes-memories/    # Persistent memory files
├── hermes-cron/        # Scheduled cron jobs
├── hermes-scripts/     # Custom scripts
└── configs/            # ngrok, gh CLI configs
```

## ⚠️ TIDAK TERMASUK (secrets & large files)

- `.env` / `.env.save` — API keys & tokens
- `auth.json` — WhatsApp auth
- `state.db` / `state.db-wal` / `state.db-shm` — session database (13MB+)
- `models_dev_cache.json` — model cache (2.4MB)
- `node_modules/`, `venv/`, `__pycache__/`
- `.azure/` — Azure credentials

## Restore Process

```bash
# 1. Copy config
cp server-backup/hermes-config/config.yaml ~/.hermes/
cp server-backup/hermes-config/SOUL.md ~/.hermes/

# 2. Copy skills
cp -r server-backup/hermes-skills/* ~/.hermes/skills/

# 3. Copy memories
cp -r server-backup/hermes-memories/* ~/.hermes/memories/

# 4. Copy cron jobs
cp -r server-backup/hermes-cron/* ~/.hermes/cron/

# 5. Copy scripts
cp -r server-backup/hermes-scripts/* ~/.hermes/scripts/

# 6. Copy other configs
cp server-backup/configs/ngrok.yml ~/.config/ngrok/ 2>/dev/null
cp -r server-backup/configs/gh ~/.config/gh 2>/dev/null
```

## Last Updated

- Date: 2026-06-26
- Server: HAFJET-Hermes-Server
- By: Hermes-HAFJET (automated)
