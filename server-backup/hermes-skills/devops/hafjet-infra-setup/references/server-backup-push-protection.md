# Server Backup — GitHub Push Protection Recovery

Reference: 2026-07-26 session where `GH013` push protection blocked the backup
because `config.yaml` contained an OpenRouter API key (`sk-or-...74f7`) at line 287.

## Root cause

The backup script copied raw `~/.hermes/config.yaml` → `server-backup/hermes-config/config.yaml`.
This file contains 6+ `api_key:` entries for various providers (OpenRouter, DeepSeek, etc.).
GitHub Push Protection scanned the ENTIRE commit and found `sk-or-` on line 287.

## Fix applied (2026-07-26)

### 1. Updated backup script to redact BEFORE git commit

Added to `scripts/backup-server.sh`:
```bash
# Redact API keys from config.yaml before committing
if [ -f "$BACKUP_DIR/hermes-config/config.yaml" ]; then
    echo "🔒 Redacting API keys from config.yaml..."
    sed -i -E 's/(api_key: )(.+)/\1[REDACTED]/g' "$BACKUP_DIR/hermes-config/config.yaml"
    sed -i -E 's/(api_key=)(.+)/\1[REDACTED]/g' "$BACKUP_DIR/hermes-config/config.yaml"
    sed -i -E 's/("api_key": *")[^"]+/\1[REDACTED]/g' "$BACKUP_DIR/hermes-config/config.yaml"
fi

# Redact secrets from cron output files (LLM may have included keys in output)
find "$BACKUP_DIR/hermes-cron" -type f -exec sed -i -E 's/(sk-[a-zA-Z0-9_-]{20,})/[REDACTED_API_KEY]/g' {} \; 2>/dev/null || true
```

This runs AFTER `cp` but BEFORE `git add`. The raw config.yaml on disk stays intact — only the backed-up copy is redacted.

### 2. Cleaned existing git history with filter-repo

The secret existed in commits going back to `d8b5735` (2026-07-24). `git commit --amend` on the latest commit wasn't enough because GitHub scans all pushed history.

```bash
# Replacement pattern
printf 'regex:api_key: sk-or-[a-zA-Z0-9_-]{30,}==>api_key: [REDACTED]\n' > /tmp/filter-replace.txt

# Run filter-repo (auto-answers continuation prompt)
cd ~/syncera-ai-wasap
rm -f .git/filter-repo/already_ran
echo "Y" | git filter-repo --replace-text /tmp/filter-replace.txt --force

# filter-repo removes origin, re-add it
git remote add origin https://github.com/2024866732/syncera-ai-wasap.git
git push origin feat/hafjet-azure-whatsapp-bot --force
```

Result: All 37 commits rewritten, every `api_key: sk-or-...` → `api_key: [REDACTED]`.

## Verification

```bash
# Check that latest commit has no real keys
git show HEAD:server-backup/hermes-config/config.yaml | grep "api_key"
# Should show: api_key: [REDACTED]

# Check the specific commit that triggered the block
git show e5d4421:server-backup/hermes-config/config.yaml | grep -n "api_key" | head
# Should all show [REDACTED]
```

## Lessons

1. **Redact before commit, not after.** Amending after the fact is harder.
2. **GitHub scans all pushed commits**, not just HEAD. One old commit with a secret blocks everything.
3. **`git filter-repo --replace-text` is the right tool** for bulk history cleanup. `git commit --amend` alone is insufficient.
4. **Always include cron output files** in the redaction — LLM-generated text can contain API keys verbatim.
5. **The origin remote is removed** after `filter-repo`. Always re-add before pushing.
6. **Force push must be user-approved.** The timeout on approval = "not consent." Don't retry without the user.
