# Server Backup — GitHub Push Protection

Repo: `2024866732/syncera-ai-wasap` · Branch: `feat/hafjet-azure-whatsapp-bot`  
Script: `~/syncera-ai-wasap/scripts/backup-server.sh` · Cron: `315e1bdcd7fc` daily 14:00 UTC

Sessions: 2026-07-26 (first GH013) · 2026-08-01 (sed false-confidence + GITHUB_TOKEN + successful push `9bc7199`)

## Root cause

Backup copies live `~/.hermes/config.yaml` which contains multiple `api_key:` lines (OpenRouter `sk-or-…`, DeepSeek, etc.). GitHub Push Protection (`GH013`) rejects the push when **any commit in the pushed set** still contains a recognized secret — not just HEAD.

## Required backup pipeline

```
cp live → server-backup/
  → Python redact api_key + known prefixes (backup copy only)
  → delete .env / auth.json / hosts.yml / *.key / *.pem
  → abort if grep still finds sk-or-
  → git add + commit + push
```

### Python redaction (preferred over sed)

```python
import re
from pathlib import Path
p = Path.home() / "syncera-ai-wasap/server-backup/hermes-config/config.yaml"
text = p.read_text(errors="replace")
text = re.sub(r"(api_key\s*:\s*)(.+)", r"\1[REDACTED]", text)
for pat in [
    r"[REDACTED_OPENROUTER][A-Za-z0-9_-]+",
    r"sk-or-[A-Za-z0-9_-]+",
    r"ghp_[A-Za-z0-9_]+",
    r"gho_[A-Za-z0-9_]+",
    r"csk-[A-Za-z0-9_-]+",
]:
    text = re.sub(pat, "[REDACTED]", text)
p.write_text(text)
```

Also walk `server-backup/**/*.{yaml,yml,json,md,txt}` for the same prefixes (cron LLM output can leak keys).

### Abort gate (before commit)

```bash
if grep -RInE '[REDACTED_OPENROUTER][A-Za-z0-9]{8,}|sk-or-[A-Za-z0-9_-]{16,}' "$BACKUP_DIR" \
  | grep -v REDACTED; then
  echo "Abort: secrets remain"; exit 2
fi
```

## GH013 recovery (history rewrite)

```bash
unset GITHUB_TOKEN GH_TOKEN
printf 'regex:api_key: sk-or-[a-zA-Z0-9_-]{20,}==>api_key: [REDACTED]\n' > /tmp/filter.txt
printf 'regex:[REDACTED_OPENROUTER][A-Za-z0-9_-]+==>[REDACTED_OPENROUTER]\n' >> /tmp/filter.txt
cd ~/syncera-ai-wasap
rm -f .git/filter-repo/already_ran
echo "Y" | git filter-repo --replace-text /tmp/filter.txt --force
git remote add origin https://github.com/2024866732/syncera-ai-wasap.git
git push -u origin feat/hafjet-azure-whatsapp-bot --force   # Tuan approval required
```

Then ensure `scripts/backup-server.sh` has the Python redact + abort gate, and run it once.

## Auth prerequisites

```bash
gh auth status
# If "Failed … GITHUB_TOKEN" is Active while hosts.yml looks OK:
unset GITHUB_TOKEN GH_TOKEN
# Classic PAT scopes: repo + workflow + read:org (+ optional gist)
gh auth login   # or: echo "$PAT" | gh auth login --with-token
gh auth setup-git
```

Never paste full tokens into Telegram. Do not commit tokens.

## Dangerous ordering mistakes

1. **Edit script → `git reset --hard`** — hard reset restores old script from HEAD and **deletes** the redact fix. Use `git reset --soft HEAD~1` for a local-only bad backup commit, or rewrite the script **after** any hard reset.
2. **Trust tool output truncation** — Hermes may display `sk-or-...74f7` while the on-disk backup file still has the full secret. Always run the abort gate on files, not on human-readable tool output.
3. **`git commit --amend` only** — Push Protection still sees older commits with secrets.
4. **Force-push without approval** — timeout = not consent; stop and wait for Tuan.

## Verification after success

```bash
git show HEAD:server-backup/hermes-config/config.yaml | grep api_key
# expect only: api_key: [REDACTED]
git status -sb
# expect clean tracking of origin/feat/hafjet-azure-whatsapp-bot
```

Known good: commit `9bc7199` (2026-08-01) after Python redact + abort gate.
