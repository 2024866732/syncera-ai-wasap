#!/bin/bash
# HAFJET-Hermes-Server Backup Script
# Run: bash ~/syncera-ai-wasap/scripts/backup-server.sh

set -e

REPO_DIR="$HOME/syncera-ai-wasap"
BACKUP_DIR="$REPO_DIR/server-backup"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S UTC')

echo "🔄 Starting server backup at $TIMESTAMP..."

cd "$REPO_DIR"

git pull origin feat/hafjet-azure-whatsapp-bot 2>/dev/null || true

find "$BACKUP_DIR" -mindepth 1 ! -name 'README.md' -delete 2>/dev/null || true
mkdir -p "$BACKUP_DIR"/{hermes-config,hermes-skills,hermes-memories,hermes-cron,hermes-scripts,configs}

echo "📁 Copying hermes config..."
cp ~/.hermes/config.yaml "$BACKUP_DIR/hermes-config/" 2>/dev/null || true
cp ~/.hermes/SOUL.md "$BACKUP_DIR/hermes-config/" 2>/dev/null || true
cp ~/.hermes/.hermes_history "$BACKUP_DIR/hermes-config/" 2>/dev/null || true

echo "📁 Copying skills..."
cp -r ~/.hermes/skills/* "$BACKUP_DIR/hermes-skills/" 2>/dev/null || true

echo "📁 Copying memories..."
cp -r ~/.hermes/memories/* "$BACKUP_DIR/hermes-memories/" 2>/dev/null || true

echo "📁 Copying cron..."
cp -r ~/.hermes/cron/* "$BACKUP_DIR/hermes-cron/" 2>/dev/null || true

echo "📁 Copying scripts..."
cp -r ~/.hermes/scripts/* "$BACKUP_DIR/hermes-scripts/" 2>/dev/null || true

echo "📁 Copying configs..."
cp ~/.config/ngrok/ngrok.yml "$BACKUP_DIR/configs/ngrok.yml" 2>/dev/null || true

echo "🔒 Redacting secrets..."

# Strong YAML api_key redaction
if [ -f "$BACKUP_DIR/hermes-config/config.yaml" ]; then
  python3 - <<'PY'
from pathlib import Path
import re
p = Path.home() / "syncera-ai-wasap/server-backup/hermes-config/config.yaml"
text = p.read_text(errors="replace")
# Redact api_key values (YAML)
text = re.sub(r"(api_key\s*:\s*)(.+)", r"\1[REDACTED]", text)
text = re.sub(r"(api_key\s*=\s*)(.+)", r"\1[REDACTED]", text)
# Known prefixes
patterns = [
    r"sk-or-v1-[A-Za-z0-9_-]+",
    r"sk-or-[A-Za-z0-9_-]+",
    r"ghp_[A-Za-z0-9_]+",
    r"gho_[A-Za-z0-9_]+",
    r"ghu_[A-Za-z0-9_]+",
    r"csk-[A-Za-z0-9_-]+",
    r"sk-[a-z0-9]{2,12}-[A-Za-z0-9_-]{16,}",
]
for pat in patterns:
    text = re.sub(pat, "[REDACTED]", text)
p.write_text(text)
print("config.yaml redacted")
PY
fi

# Redact across text files
python3 - <<'PY'
from pathlib import Path
import re
root = Path.home() / "syncera-ai-wasap/server-backup"
exts = {".yaml", ".yml", ".json", ".md", ".txt", ".env", ".sh", ".py", ".toml"}
patterns = [
    (re.compile(r"sk-or-v1-[A-Za-z0-9_-]+"), "[REDACTED_OPENROUTER]"),
    (re.compile(r"sk-or-[A-Za-z0-9_-]+"), "[REDACTED_OPENROUTER]"),
    (re.compile(r"ghp_[A-Za-z0-9_]+"), "[REDACTED_GITHUB]"),
    (re.compile(r"gho_[A-Za-z0-9_]+"), "[REDACTED_GITHUB]"),
    (re.compile(r"ghu_[A-Za-z0-9_]+"), "[REDACTED_GITHUB]"),
    (re.compile(r"csk-[A-Za-z0-9_-]+"), "[REDACTED_CEREBRAS]"),
    (re.compile(r"(?m)^(api_key\s*:\s*).+$"), r"\1[REDACTED]"),
]
count = 0
for path in root.rglob("*"):
    if not path.is_file():
        continue
    if path.suffix.lower() not in exts and path.name not in {"SOUL.md", "README.md"}:
        continue
    try:
        text = path.read_text(errors="replace")
    except Exception:
        continue
    orig = text
    for pat, repl in patterns:
        text = pat.sub(repl, text)
    if text != orig:
        path.write_text(text)
        count += 1
print(f"redacted files: {count}")
PY

# Delete secret files
find "$BACKUP_DIR" \( -name ".env" -o -name "auth.json" -o -name "*.key" -o -name "*.pem" -o -name "hosts.yml" -o -name "credentials" \) -delete 2>/dev/null || true

sed -i "s/^Last Updated:.*/Last Updated: $TIMESTAMP/" "$BACKUP_DIR/README.md" 2>/dev/null || true

# Abort if OpenRouter keys remain
if grep -RInE 'sk-or-v1-[A-Za-z0-9]{8,}|sk-or-[A-Za-z0-9_-]{16,}' "$BACKUP_DIR" 2>/dev/null | grep -v 'REDACTED'; then
  echo "❌ Abort: secret-like strings still present"
  exit 2
fi

echo "✅ Redaction check passed"

cd "$REPO_DIR"
git add -A server-backup/ scripts/backup-server.sh .gitignore

if git diff --cached --quiet; then
  echo "✅ No changes to backup. Everything up to date."
else
  git commit -m "backup: auto-update server backup ($TIMESTAMP)"
  git push origin feat/hafjet-azure-whatsapp-bot
  echo "✅ Backup pushed to GitHub!"
fi
