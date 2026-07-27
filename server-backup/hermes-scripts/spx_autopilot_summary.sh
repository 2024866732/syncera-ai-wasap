#!/bin/bash
# SPX Autopilot Summary — fetches latest [SPX-SUMMARY] from Azure logs
# Run by Hermes cron every 65 minutes, output delivered to Telegram

TOKEN=$(az account get-access-token --resource "https://management.azure.com" --query "accessToken" -o tsv 2>/dev/null | tr -d '\n')

if [ -z "$TOKEN" ]; then
    echo "❌ Cannot get Azure token"
    exit 1
fi

# Download recent containerStream log
LOG=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/LogFiles/2026_07_25_lw0sdlwk000AHX_containerStream.log" 2>/dev/null)

if [ -z "$LOG" ]; then
    echo "❌ Cannot fetch logs"
    exit 1
fi

# Extract latest summary line
SUMMARY=$(echo "$LOG" | grep '\[SPX-SUMMARY\]' | tail -1)

if [ -z "$SUMMARY" ]; then
    echo "📊 SPX Autopilot: belum ada summary lagi (tunggu cycle pertama)"
    exit 0
fi

# Format for Telegram
echo "$SUMMARY" | sed 's/\[SPX-SUMMARY\] //' | while read line; do
    echo "📊 $line"
done

# Also check reminders if they exist in the same log
REMINDER_OK=$(echo "$LOG" | grep -c '\[SPX-REMINDER\].*SENT OK')
REMINDER_FAIL=$(echo "$LOG" | grep -c '\[SPX-REMINDER\].*FAILED')
if [ "$REMINDER_OK" -gt 0 ] || [ "$REMINDER_FAIL" -gt 0 ]; then
    echo "📨 Reminders: sent=$REMINDER_OK failed=$REMINDER_FAIL"
fi

# Check bulk-phone logs
BULK=$(echo "$LOG" | grep '\[SPX-BULK-PHONE\]' | tail -1)
if [ -n "$BULK" ]; then
    echo "$BULK" | sed 's/\[SPX-BULK-PHONE\]/📱 Bulk:/'
fi
