#!/bin/bash
# Azure for Students - Credit check (run daily via cron)
# Note: CLI can't show remaining credit directly, so we check for any non-zero cost

OUTPUT=$(az consumption usage list 2>/dev/null | grep -v "WARNING" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total = 0.0
    for item in data:
        cost = item.get('pretaxCost')
        if cost and cost not in ('None', 'null', ''):
            try: total += float(cost)
            except: pass
    print(f'{total:.2f}')
except:
    print('0.00')
")

TODAY=$(date +%Y-%m-%d)
echo "$TODAY: Azure tracked cost = \$$OUTPUT"

if (( $(echo "$OUTPUT > 50" | bc -l) )); then
    echo "⚠️  WARNING: Azure cost exceeding \$50 this month!"
fi
