#!/bin/bash
# azure-deploy-verify.sh — Post-deployment verification for HAFJET WhatsApp Bot
# Usage: bash azure-deploy-verify.sh [APP_NAME] [DOMAIN]
# Example: bash azure-deploy-verify.sh hafjet-whatsapp-bot hafjet-whatsapp-bot.azurewebsites.net

set -e

APP_NAME="${1:-hafjet-whatsapp-bot}"
DOMAIN="${2:-hafjet-whatsapp-bot.azurewebsites.net}"
BASE="https://${DOMAIN}"
FAIL=0

echo "============================================"
echo "  Azure Deployment Verification"
echo "  App: ${APP_NAME}"
echo "  URL: ${BASE}"
echo "============================================"
echo ""

# --- App Settings Check ---
echo "--- App Settings (preview) ---"
SETTINGS=$(az webapp config appsettings list \
  --resource-group hafjet-bot-rg \
  --name "${APP_NAME}" \
  --output json 2>/dev/null)
echo "${SETTINGS}" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    critical = ['SCM_DO_BUILD_DURING_DEPLOYMENT', 'WEBSITES_PORT', 'STARTUP_COMMAND', 'ENABLE_ORYX_BUILD', 'WHATSAPP_ACCESS_TOKEN', 'APP_SECRET', 'VERIFY_TOKEN', 'OPENROUTER_API_KEY']
    found = {s['name']: s.get('value','') for s in data}
    missing = []
    null_keys = []
    for k in critical:
        if k not in found:
            missing.append(k)
        elif not found[k] or found[k] == '[REDACTED]':
            null_keys.append(k)
    print(f'Total settings: {len(data)}')
    if missing:
        print(f'MISSING: {missing}')
    if null_keys:
        # CLI redacts secrets — so [REDACTED] doesn't mean null for secret keys
        true_nulls = [k for k in null_keys if k not in ('WHATSAPP_ACCESS_TOKEN','APP_SECRET','OPENROUTER_API_KEY')]
        redacted = [k for k in null_keys if k in ('WHATSAPP_ACCESS_TOKEN','APP_SECRET','OPENROUTER_API_KEY')]
        if true_nulls:
            print(f'NULL VALUES: {true_nulls}')
        if redacted:
            print(f'REDACTED (likely OK): {redacted}')
    if not missing and not [k for k in null_keys if k not in ('WHATSAPP_ACCESS_TOKEN','APP_SECRET','OPENROUTER_API_KEY')]:
        print('All critical settings present.')
except Exception as e:
    print(f'Error parsing: {e}')
" || true

echo ""

# --- Startup Command Check ---
echo "--- Startup Command ---"
STARTUP=$(az webapp config show \
  --resource-group hafjet-bot-rg \
  --name "${APP_NAME}" \
  --query "appCommandLine" \
  -o tsv 2>/dev/null)
echo "appCommandLine: ${STARTUP:-[NULL]}"
if [ -z "${STARTUP}" ] || [ "${STARTUP}" = "None" ]; then
    echo "WARNING: appCommandLine is null — app will not start!"
    FAIL=1
fi

echo ""

# --- Endpoint Checks ---
check_endpoint() {
    local path="$1"
    local expected="$2"
    local label="$3"
    local url="${BASE}${path}"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${url}" 2>/dev/null || echo "000")
    
    if [ "${status}" = "${expected}" ]; then
        echo "  ✅ ${label} (${path}) → ${status}"
    else
        echo "  ❌ ${label} (${path}) → ${status} (expected ${expected})"
        FAIL=1
    fi
}

echo "--- HTTP Endpoints ---"
check_endpoint "/health" "200" "Health check"
check_endpoint "/dashboard" "200" "Dashboard SPA"
check_endpoint "/api/stats" "200" "Stats API"
check_endpoint "/webhook" "403" "Webhook (no token)"

# --- Check dashboard loads assets ---
echo ""
echo "--- Dashboard Assets ---"
ASSET_URL=$(curl -s --max-time 15 "${BASE}/dashboard" 2>/dev/null | grep -o '/dashboard/assets/index-[^"]*\.js' | head -1)
if [ -n "${ASSET_URL}" ]; then
    ASSET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${BASE}${ASSET_URL}" 2>/dev/null || echo "000")
    if [ "${ASSET_STATUS}" = "200" ]; then
        echo "  ✅ JS bundle loads (${ASSET_URL})"
    else
        echo "  ❌ JS bundle failed (${ASSET_URL}) → ${ASSET_STATUS}"
        FAIL=1
    fi
else
    echo "  ⚠️  Could not find asset URL in dashboard HTML"
fi

echo ""
echo "============================================"
if [ ${FAIL} -eq 0 ]; then
    echo "  ✅ ALL CHECKS PASSED"
else
    echo "  ❌ SOME CHECKS FAILED — see above"
fi
echo "============================================"
exit ${FAIL}
