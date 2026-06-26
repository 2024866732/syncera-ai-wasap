#!/bin/bash
# HAFJET-Hermes-Server Backup Script
# Run: bash ~/syncera-ai-wasap/scripts/backup-server.sh

set -e

REPO_DIR="$HOME/syncera-ai-wasap"
BACKUP_DIR="$REPO_DIR/server-backup"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S UTC')

echo "🔄 Starting server backup at $TIMESTAMP..."

cd "$REPO_DIR"

# Pull latest to avoid conflicts
git pull origin feat/hafjet-azure-whatsapp-bot 2>/dev/null || true

# Clean old backup (keep README)
find "$BACKUP_DIR" -mindepth 1 ! -name 'README.md' -delete 2>/dev/null || true

# Recreate structure
mkdir -p "$BACKUP_DIR"/{hermes-config,hermes-skills,hermes-memories,hermes-cron,hermes-scripts,configs}

# Copy files (excluding secrets)
echo "📁 Copying hermes config..."
cp ~/.hermes/config.yaml "$BACKUP_DIR/hermes-config/" 2>/dev/null
cp ~/.hermes/SOUL.md "$BACKUP_DIR/hermes-config/" 2>/dev/null
cp ~/.hermes/.hermes_history "$BACKUP_DIR/hermes-config/" 2>/dev/null

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

# Remove any secrets that slipped through
find "$BACKUP_DIR" -name ".env" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "auth.json" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.key" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.pem" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "hosts.yml" -delete 2>/dev/null || true  # gh CLI hosts has OAuth tokens

# Update README timestamp
sed -i "s/^Last Updated:.*/Last Updated: $TIMESTAMP/" "$BACKUP_DIR/README.md" 2>/dev/null || true

# Commit & push
cd "$REPO_DIR"
git add -A server-backup/ .gitignore

if git diff --cached --quiet; then
    echo "✅ No changes to backup. Everything up to date."
else
    git commit -m "backup: auto-update server backup ($TIMESTAMP)"
    git push origin feat/hafjet-azure-whatsapp-bot
    echo "✅ Backup pushed to GitHub!"
fi
