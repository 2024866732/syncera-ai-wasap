#!/bin/bash
set -e
#
# deploy.sh — Clean production deploy for HAFJET WhatsApp Bot
# Usage: bash deploy.sh
#
# Builds a secrets-safe ZIP and deploys to Azure App Service.
# Excludes: .env, .backup/, bot_data.db, *.pyc, __pycache__/, node_modules/, .git/
#

cd "$(dirname "$0")"

APP_NAME="${APP_NAME:-hafjet-whatsapp-bot}"
RG="${RG:-hafjet-bot-rg}"
ZIP_FILE="hafjet-prod.zip"

echo "=== Building clean production ZIP ==="
python3 << 'EOF'
import zipfile, os, fnmatch

EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', '.backup', '.venv', 'venv'}
# NOTE: 'dist' and 'build' are NOT in EXCLUDE_DIRS — they would exclude dashboard/dist/
# which is the React SPA build that MUST be deployed. Only root-level dist/build are
# excluded via the should_exclude_dir() path check below.
EXCLUDE_FILES = {'.env', '.env.local', '.env.production', '.gitignore', 'deploy.sh', 'deploy.py',
                 'azure-settings-backup-2026-06-27.json', 'startup_debug.log', 'startup.txt',
                 'known-good-baseline.md', 'post-deploy-actions.md', 'bot_data.db'}
EXCLUDE_EXT = {'.pyc', '.pyo', '.md'}
ROOT_DIRS_EXCLUDE = {'dist', 'build'}  # only exclude at root level, not subdirs like dashboard/dist

def should_exclude_dir(dirpath, dirname):
    """Exclude root-level dist/build but NOT dashboard/dist or other subdirectory builds."""
    full = os.path.join(dirpath, dirname)
    if full in ('./dist', './build'):
        return True
    return dirname in EXCLUDE_DIRS

def should_exclude(relpath):
    parts = relpath.split(os.sep)
    basename = os.path.basename(relpath)
    if basename in EXCLUDE_FILES:
        return True
    if any(basename.endswith(ext) for ext in EXCLUDE_EXT):
        return True
    if basename.startswith('deploy_') and basename.endswith('.zip'):
        return True
    if basename == 'hafjet-prod.zip':
        return True
    return False

with zipfile.ZipFile('hafjet-prod.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if not should_exclude_dir(root, d)]
        for f in files:
            filepath = os.path.join(root, f)
            arcname = filepath[2:]  # remove ./
            if not should_exclude(arcname):
                zf.write(filepath, arcname)

size = os.path.getsize('hafjet-prod.zip')
print(f"ZIP built: {size:,} bytes")

# Verify no leaks
with zipfile.ZipFile('hafjet-prod.zip', 'r') as zf:
    sensitive = [n for n in zf.namelist() if n.startswith('.env') or '.backup' in n or 'azure-settings' in n]
    if sensitive:
        print(f"⚠️  WARNING: sensitive files in ZIP: {sensitive}")
        raise SystemExit(1)
    print(f"✅ No sensitive files ({len(zf.namelist())} entries)")
EOF

echo "=== Deploying to Azure ==="
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --src-path "$ZIP_FILE" \
  --type zip \
  --async false

echo "=== Validating ==="
sleep 60
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://$APP_NAME.azurewebsites.net/health")
if [ "$HTTP" = "200" ]; then
  echo "✅ /health — HTTP 200"
else
  echo "❌ /health — HTTP $HTTP"
  echo "   Check logs: az webapp log startup show -n $APP_NAME -g $RG"
  exit 1
fi
# Also verify dashboard is served (catches dist/ exclude bugs)
DASH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://$APP_NAME.azurewebsites.net/dashboard")
if [ "$DASH" = "200" ]; then
  echo "✅ /dashboard — HTTP 200"
else
  echo "⚠️ /dashboard — HTTP $DASH (dashboard/dist/ may be missing from ZIP)"
fi

echo "=== Done ==="
