# Server Config Backup & Restore

## Architecture

All Hermes configuration is backed up to GitHub (`syncera-ai-wasap` repo, branch `feat/hafjet-azure-whatsapp-bot`) under `server-backup/`.

```
server-backup/
├── README.md              # Restore instructions
├── hermes-config/         # config.yaml, SOUL.md, history
├── hermes-skills/         # All custom skills (~43 dirs)
├── hermes-memories/       # Persistent memory
├── hermes-cron/           # Scheduled jobs + output
├── hermes-scripts/        # Custom scripts
└── configs/               # ngrok.yml (no secrets)
```

## Backup Script

Located at `scripts/backup-server.sh` in the repo. Runs daily via cron at 14:00 UTC.

Key behaviors:
- Pulls latest from remote before copying
- Excludes secrets (`.env`, `auth.json`, `*.key`, `*.pem`, `hosts.yml`)
- Removes any secrets that slipped through before committing
- Updates timestamp in README
- Only commits if there are actual changes

## Git Safety Rules

| Rule | Why |
|------|-----|
| Never commit `gh/hosts.yml` | Contains OAuth tokens → push protection blocks |
| Never commit `.env` | Contains API keys |
| Use `key_env` for custom providers | Keeps secrets out of config.yaml |
| Use `git filter-repo` to remove secrets from history | Push protection scans all commits |

## Removing Secrets from Git History

If a secret accidentally gets committed:

```bash
# Remove from all history
git filter-repo --invert-paths --path path/to/secret/file --force

# Re-add remote (filter-repo removes origin)
git remote add origin https://github.com/USER/REPO.git

# Force push
git push origin BRANCH --force-with-lease
```

## Restore Checklist

After restoring from backup on a fresh server:

- [ ] `config.yaml` → `~/.hermes/`
- [ ] `SOUL.md` → `~/.hermes/`
- [ ] Skills → `~/.hermes/skills/`
- [ ] Memories → `~/.hermes/memories/`
- [ ] Cron jobs → `~/.hermes/cron/`
- [ ] Scripts → `~/.hermes/scripts/`
- [ ] ngrok config → `~/.config/ngrok/`
- [ ] **Manually recreate secrets** (cannot be backed up):
  - `OPENROUTER_API_KEY`
  - `CEREBRAS_API_KEY`
  - WhatsApp tokens
  - GitHub auth (`gh auth login`)
  - Azure credentials (`az login`)
