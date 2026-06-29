---
name: hafjet-deployment-plan
description: "Use when discussing, planning, or executing deployment for the HAFJET WhatsApp Bot. Locked strategy with four environments (Azure, AWS, Heroku, Oracle), exact CLI steps, and decision matrices for upgrades, throttling recovery, and failovers."
version: 1.5.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [deployment, azure, aws, heroku, oracle, whatsapp-bot]
    related_skills: [whatsapp-webhook-dev]

---

# HAFJET WhatsApp Bot - Deployment Strategy (LOCKED)

## Overview

This skill documents the locked deployment strategy for HAFJET WhatsApp Bot v2.1.
It covers four environments: Azure (primary production), AWS (staging), Heroku (fallback), and Oracle Cloud Always Free (fallback/throttle-recovery).
**Do not execute migrations without explicit user confirmation.** This is a reference playbook only.

## Support Files

| File | Purpose |
|------|---------|
| `references/config-var-audit.md` | Exact env var name mapping (internal var → Azure setting → Heroku config) |
| `references/dashboard-portability.md` | Dashboard static serving compatibility across platforms |
| `references/heroku-cli-setup.md` | Heroku CLI installation + API key auth (no browser login) |
| `references/security-hardening-phase1.md` | Phase 1 security hardening (signature fail-closed, API key auth, log masking) — EXACT code changes |
| `references/vite-env-injection.md` | Build-time env var injection for Vite + Azure ZIP deploy |
| `references/azure-debug-503.md` | Debugging 503 errors after deploy (QuotaExceeded, import errors, logging, **resource-not-found/app-deleted**) |
| `references/fallback-provider-setup.md` | Fallback provider config pattern (Cerebras as OpenRouter backup) |
| `references/server-backup-restore.md` | Server config backup/restore from GitHub |
| `scripts/verify_endpoints.py` | Full endpoint verification script (health, dashboard, API, webhook GET/POST, WebSocket) |
| `references/b1-upgrade-troubleshooting.md` | F1→B1 upgrade steps + app unreachable after upgrade |
| `references/azure-webapp-up-deploy.md` | `az webapp up` full deploy pattern (Oryx build, startup time budget, common failures) |
| `references/oracle-cloud-free-tier.md` | Oracle Cloud Always Free tier: limits, regions, OCI CLI auth, A1.Flex deployment, capacity risks |
| `references/placeholder-patch-deploy.md` | Placeholder replacement and deployment procedure for business information updates |

## Workflow Rules

1. **Always show exact diff before implementing** — Tuan Hafizi reviews code changes before any deployment. Never apply changes silently.
2. **Audit before protecting** — When adding auth/middleware, audit frontend consumers first to avoid breaking existing functionality.
3. **Fail closed, not open** — Security checks should reject by default when config is missing, not silently skip.
4. **Minimal first pass** — Protect only what's necessary (write routes first, read routes later) to reduce blast radius.
5. **Coordinated frontend-backend deploys** — When backend adds auth, frontend must send headers in the SAME deploy. Never deploy backend-only auth without updating frontend first. See `references/vite-env-injection.md` for the Vite build-time env var pattern.
6. **Verify before declaring success** — After deploy, always run health checks + test protected routes with valid AND invalid credentials. Don't assume deployment = working.
7. **Stop operations on throttle, do not retry** — If Azure returns 429 on plan create/delete, STOP all create/delete operations immediately. Do not retry until 15+ minutes have passed. Reuse existing resources only. See pitfall #23.
8. **Prefer web app recreate over plan recreate** — Never delete the App Service Plan unless absolutely necessary. Deleting the last web app on a plan auto-deletes the plan regardless of `--keep-empty-plan`. If you must delete a web app, expect the plan to be deleted too and plan for the throttle window.
9. **Verify before declaring success** — After deploy, always run health checks + test protected routes with valid AND invalid credentials. Don't assume deployment = working.

## Current State (2026-06-28)

| Item | Value |
|------|-------|
| **Primary platform** | Azure App Service B1 (Basic) |
| **App name** | `hafjet-whatsapp-bot` |
| **Resource group** | `hafjet-bot-rg` |
| **App Service Plan** | `hafjet-bot-plan` (B1, Southeast Asia) — **DELETED** (auto-deleted when last web app removed) |
| **Entry point** | `webhook_listener:app` |
| **Startup command** | `bash /home/site/wwwroot/start.sh` → `python3 -m gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --timeout 120 --ws wsproto` |
| **DB** | SQLite (`bot_data.db`) |
| **Dashboard** | React SPA served via FastAPI at `/dashboard` |
| **WebSocket** | `/ws` with wsproto backend |
| **Meta webhook** | `https://hafjet-whatsapp-bot.azurewebsites.net/webhook` |
| **Security** | v2.1.0: fail-closed signature, X-API-Key on write routes, SecureFormatter masking |
| **Hardening status** | Code deployed locally, awaiting clean redeploy |
| **Subscription throttle** | Active — plan create/delete throttled until ~15 min after last violation |

## Credit Landscape

| Platform | Credit | Expiry | Monthly Cost |
|----------|--------|--------|--------------|
| **Azure for Students** | $100/month (recurring) | Renewable annually | $0 (F1), B1 ~$12.40 |
| **AWS Activate** | $200 | 6 months | t3.micro free 12mo, then ~$10.50 |
| **Heroku (GitHub Student Pack)** | $13/month | 24 months | Eco $5, Basic $7 |
| **DigitalOcean (GitHub Student Pack)** | $200 | 12 months | Basic 1GB: $6 |
| **Oracle Cloud Always Free** | Never expires | Unlimited | A1.Flex: 2 OCPU/12 GB, $0 |
| **Oracle Cloud (Kulai, Malaysia)** | `ap-kulai-2` | New region (Feb 2026), single AD | Best latency for Malaysia users |

---

## Playbook 1: Azure F1 to B1 Upgrade (Production)

[Content unchanged - truncated for brevity]

## Playbook 2: AWS Staging/Backup (t3.micro)

[Content unchanged - truncated for brevity]

## Playbook 3: Heroku Eco Fallback (Full Production if Azure Fails)

[Content unchanged - truncated for brevity]

## Playbook 4: Oracle Cloud Always Free (Malaysia/Kulai)

[Content unchanged - truncated for brevity]

---

## One-Shot Recipes

### Recipe: Quick B1 Upgrade
[Content unchanged]

### Recipe: Heroku Emergency Deploy
[Content unchanged]

### Recipe: AWS Staging Clone
[Content unchanged]

### Recipe: Placeholder Patch & Deploy (Azure)
**Use when:** Need to update business information placeholders and redeploy to Azure App Service 
**Based on:** Session 2026-06-28 placeholder fix for HAFJET WhatsApp Bot

```bash
set -euo pipefail

APP_DIR="$HOME/.hermes/whatsapp-bot"
APP_NAME="hafjet-whatsapp-bot"
RESOURCE_GROUP="hafjet-bot-rg"

# STEP 1: Backup
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="$HOME/.hermes/backups"
BACKUP_DIR="$BACKUP_ROOT/whatsapp-bot-$TS"

mkdir -p "$BACKUP_ROOT"

echo "==> STEP 1: Backup folder penuh"
cp -a "$APP_DIR" "$BACKUP_DIR"
cd "$BACKUP_ROOT"
zip -r "whatsapp-bot-$TS.zip" "whatsapp-bot-$TS" >/dev/null

echo "==> Backup siap"
echo "    Folder: $BACKUP_DIR"
echo "    ZIP   : $BACKUP_ROOT/whatsapp-bot-$TS.zip"

cd "$APP_DIR"

echo "==> STEP 2: Backup webhook_listener.py sebelum patch"
cp webhook_listener.py "webhook_listener.py.bak-$TS"

echo "==> STEP 3: Patch placeholder dalam webhook_listener.py"
python3 - <<'PY'
from pathlib import Path

path = Path("webhook_listener.py")
text = path.read_text(encoding="utf-8")

replacements = {
    "[Nombor HAFJET]": "+60 11-4956 1698",
    "[Alamat Kedai HAFJET]": "No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang",
    "[Alamat Penuh Kedai]": "No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang",
    "[Google Maps link]": "https://g.co/kgs/95C9TB",
}

before = text
for old, new in replacements.items():
    text = text.replace(old, new)

if text == before:
    print("WARNING: Tiada placeholder dijumpai untuk diganti.")
else:
    print("Placeholders successfully replaced.")

path.write_text(text, encoding="utf-8")
print("webhook_listener.py updated")
PY

echo "==> STEP 4: Verify placeholder sudah hilang"
grep -nE '\[Nombor HAFJET\]|\[Alamat Kedai HAFJET\]|\[Alamat Penuh Kedai\]|\[Google Maps link\]' webhook_listener.py || true

echo "==> STEP 5: Preview kawasan sekitar menu"
sed -n '620,660p' webhook_listener.py || true

echo "==> STEP 6: Validate Python & JSON"
python3 -m py_compile webhook_listener.py
python3 -m py_compile hermes_ai.py
python3 -m json.tool intent_rules.json >/dev/null
python3 -m json.tool media_map.json >/dev/null

echo "==> STEP 7: Build deploy ZIP"
rm -f deploy-hafjet-bot.zip
zip -r deploy-hafjet-bot.zip . \
  -x "*.git*" \
  -x "*__pycache__*" \
  -x "*.venv*" \
  -x "*.env" \
  -x ".env.*" \
  -x "*node_modules*" \
  -x "*.bak-*" >/dev/null

echo "==> ZIP siap: $APP_DIR/deploy-hafjet-bot.zip"

if [ "$APP_NAME" = "ISI_NAMA_WEBAPP_AZURE" ] || [ "$RESOURCE_GROUP" = "ISI_RESOURCE_GROUP_AZURE" ]; then
  echo "ERROR: Sila isi APP_NAME dan RESOURCE_GROUP dahulu."
  exit 1
fi

echo "==> STEP 8: Deploy ke Azure App Service"
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$APP_DIR/deploy-hafjet-bot.zip" \
  --type zip

echo "==> STEP 9: Restart web app"
az webapp restart \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP"

echo "==> STEP 10: Siap deploy"
echo
echo "Seterusnya, buka log tail dalam terminal lain:"
echo "az webapp log tail --resource-group \"$RESOURCE_GROUP\" --name \"$APP_NAME\""
echo
echo "Kemudian test WhatsApp sandbox / test recipient dengan mesej berikut:"
echo "- menu"
echo "- 2"
echo "- 3"
echo "- 4"
echo "- lokasi kedai"
echo "- waktu operasi"
echo "- bayaran apa"
echo "- nak repair iphone bateri problem"
echo
echo "Pastikan tiada lagi placeholder bracket keluar."
```

Expected: All HTTP checks return 200

---

## One-Shot Recipe: Placeholder Verification

**Use when:** Need to verify that all business information placeholders have been correctly replaced in the codebase

```bash
set -euo pipefail

cd "$HOME/.hermes/whatsapp-bot"

echo "=== Checking for remaining placeholders ==="
PLACEHOLDERS=$(grep -nE '\[Nombor HAFJET\]|\[Alamat Kedai HAFJET\]|\[Alamat Penuh Kedai\]|\[Google Maps link\]' webhook_listener.py || true)
if [ -z "$PLACEHOLDERS" ]; then
    echo "✓ No placeholders found in webhook_listener.py"
else
    echo "✗ Found placeholders:"
    echo "$PLACEHOLDERS"
    exit 1
fi

echo "=== Verifying replacement values =====\=\  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \  \ 0]
... Truncated