# Server Backup to GitHub Repo

Pattern for backing up a server's config/state files into a GitHub repository for disaster recovery.

## Structure

```
server-backup/
├── hermes-config/      # config.yaml, SOUL.md
├── hermes-skills/      # custom skills
├── hermes-memories/    # persistent memory files
├── hermes-cron/        # scheduled cron jobs
├── hermes-scripts/     # custom scripts
└── configs/            # ngrok.yml, etc.
```

## Files to EXCLUDE (secrets / large / volatile)

| File / Pattern | Reason |
|-----------------|--------|
| `.env`, `.env.save` | API keys, tokens |
| `auth.json` | WhatsApp/browser auth |
| `*.key`, `*.pem` | Private keys, certs |
| `~/.config/gh/hosts.yml` | **Contains `gho_*` OAuth tokens** — will trigger GitHub Push Protection |
| `state.db*` | Large session DB (~13MB) |
| `models_dev_cache.json` | Large cache (~2.4MB) |
| `node_modules/`, `venv/`, `__pycache__/` | Build artifacts |

## Critical Pitfall: `gh/hosts.yml` and GitHub Push Protection

The `gh` CLI stores OAuth tokens in `~/.config/gh/hosts.yml`:
```yaml
github.com:
    users:
        "12345":
            oauth_token: [REDACTED_GITHUB]
    oauth_token: [REDACTED_GITHUB]
```

GitHub's **Push Protection** (secret scanning) will **block the push** if this file is in any commit in the branch history. Error:
```
remote: error: GH013: Repository rule violations found
remote: - GITHUB PUSH PROTECTION
remote:   — Push cannot contain secrets
remote:       —— GitHub OAuth Access Token —
```

### Fix: Remove from history with `git-filter-repo`

**When the secret is only in the current commit:** `git rm --cached` + amend may suffice.

**When the secret is in PRIOR commits (common with backup scripts that accidentally included `hosts.yml` on first run):** Must scrub entire history.

```bash
# Step 1: Remove the file locally
rm -f server-backup/configs/gh/hosts.yml
git rm --cached server-backup/configs/gh/hosts.yml 2>/dev/null

# Step 2: Install git-filter-repo
pip install git-filter-repo  # or: pip3 install git-filter-repo

# Step 3: Scrub from ALL history
git filter-repo --invert-paths --path server-backup/configs/gh/hosts.yml --force
# WARNING: filter-repo removes the 'origin' remote!

# Step 4: Re-add remote
git remote add origin https://github.com/OWNER/REPO.git

# Step 5: Verify secret is gone from ALL commits
git log --all --oneline -- server-backup/configs/gh/hosts.yml  # should return empty
git grep -l "gho_" $(git rev-list --all) 2>/dev/null | head -5  # should return empty

# Step 6: Force push (history was rewritten)
git push origin BRANCH --force
```

**Key notes:**
- `git-filter-repo` strips the file from ALL commits in history, not just HEAD
- It **removes the `origin` remote** as a safety measure — you must re-add it
- Force push is required since history is rewritten
- After rewrite, verify with both:
  - `git log --all --oneline -- path/to/file` → empty
  - `git grep -l "gho_" $(git rev-list --all)` → empty
- If `git grep` still shows hits, the secret may be in a different path — run filter-repo again for that path

### Prevention

Add to `.gitignore`:
```gitignore
server-backup/**/hosts.yml
server-backup/**/.env
server-backup/**/auth.json
server-backup/**/*.key
server-backup/**/*.pem
```

### Diagnostic: Confirm no secrets in history

Before pushing, scan all commits for potential secrets:
```bash
# Check if token pattern exists in any commit
git grep -l "gho_\|sk-\|csk-" $(git rev-list --all) 2>/dev/null

# Check specific file in history
git log --all --oneline -- path/to/suspicious/file
```

Run this after every backup copy to catch secrets before they reach GitHub.

## Backup Script Pattern

```bash
#!/bin/bash
set -e
REPO_DIR="$HOME/syncera-ai-wasap"  # target repo
BACKUP_DIR="$REPO_DIR/server-backup"

cd "$REPO_DIR"
git pull origin BRANCH 2>/dev/null || true

# Copy config files (NO .env, NO auth.json, NO hosts.yml)
cp ~/.hermes/config.yaml "$BACKUP_DIR/hermes-config/"
cp ~/.hermes/SOUL.md "$BACKUP_DIR/hermes-config/"
cp -r ~/.hermes/skills/* "$BACKUP_DIR/hermes-skills/"
cp -r ~/.hermes/memories/* "$BACKUP_DIR/hermes-memories/"
cp -r ~/.hermes/cron/* "$BACKUP_DIR/hermes-cron/"

# Scrub any secrets that slipped through
find "$BACKUP_DIR" -name ".env" -delete
find "$BACKUP_DIR" -name "auth.json" -delete
find "$BACKUP_DIR" -name "hosts.yml" -delete  # gh CLI OAuth tokens

# Commit & push
git add -A server-backup/
git diff --cached --quiet && echo "No changes" && exit 0
git commit -m "backup: auto-update server backup ($(date '+%Y-%m-%d %H:%M'))"
git push origin BRANCH
```

## Restore

```bash
# On fresh server, clone repo then:
cp server-backup/hermes-config/* ~/.hermes/
cp -r server-backup/hermes-skills/* ~/.hermes/skills/
cp -r server-backup/hermes-memories/* ~/.hermes/memories/
cp -r server-backup/hermes-cron/* ~/.hermes/cron/
cp -r server-backup/hermes-scripts/* ~/.hermes/scripts/
```

Secrets (`.env`, API keys) must be restored separately — never stored in git.
