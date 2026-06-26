import os, sys, json, time
from datetime import datetime, timezone, timedelta
import urllib.request, urllib.error

def load_token():
    env_path = os.path.expanduser('~/.hermes/.env')
    token = os.environ.get('LOYVERSE_ACCESS_TOKEN', '').strip()
    if token:
        return token
    if os.path.exists(env_path):
        marker = 'LOYVERSE_ACCESS_TOKEN'
        with open(env_path) as f:
            for line in f:
                s = line.strip()
                if s.startswith(marker + '='):
                    return s.split('=', 1)[1].strip()
    return None

token = load_token()
if not token:
    print('ERROR: Token not found')
    sys.exit(1)

base_url = 'https://api.loyverse.com/v1.0'
myt = timezone(timedelta(hours=8))
today = datetime.now(myt).strftime('%Y-%m-%d')

print('=' * 50)
print('  LOYVERSE DAILY SALES REPORT')
print('  Date: ' + today)
print('=' * 50)

all_receipts = []
cursor = None
page = 0

while True:
    page += 1
    url = base_url + '/receipts?limit=10&created_at.gte=' + today + 'T00:00:00.000Z'
    if cursor:
        url += '&cursor=' + cursor

    req = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    })

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print('  (Rate limit at page ' + str(page) + ')')
        else:
            print('  (HTTP ' + str(e.code) + ' at page ' + str(page) + ')')
        break

    receipts = data.get('receipts', [])
    if not receipts:
        break
    all_receipts.extend(receipts)
    cursor = data.get('cursor')
    if not cursor:
        break

    time.sleep(0.3)

# Calculate totals
total_sales = 0.0
total_transactions = len(all_receipts)
payment_totals = {}
item_sales = {}

for r in all_receipts:
    try:
        total_sales += float(r.get('total_money', 0))
    except (ValueError, TypeError):
        pass
    for p in r.get('payments', []):
        pt = p.get('name', 'Unknown')
        try:
            payment_totals[pt] = payment_totals.get(pt, 0) + float(p.get('money_amount', 0))
        except (ValueError, TypeError):
            pass
    for item in r.get('line_items', []):
        name = item.get('item_name', 'Unknown')
        try:
            qty = float(item.get('quantity', 1))
        except (ValueError, TypeError):
            qty = 1
        item_sales[name] = item_sales.get(name, 0) + qty

print()
print('SUMMARY')
print('   Total Sales:        RM {:,.2f}'.format(total_sales))
print('   Total Transactions: {}'.format(total_transactions))

if payment_totals:
    print()
    print('PAYMENT BREAKDOWN')
    for pt, amount in sorted(payment_totals.items(), key=lambda x: x[1], reverse=True):
        print('   {:<20} RM {:,.2f}'.format(pt, amount))

if item_sales:
    print()
    print('TOP SELLING ITEMS')
    for name, qty in sorted(item_sales.items(), key=lambda x: x[1], reverse=True)[:10]:
        print('   {:<30} x {}'.format(name, int(qty)))

print()
print('=' * 50)
print('  Report generated: ' + datetime.now(myt).strftime('%Y-%m-%d %H:%M:%S') + ' MYT')
print('=' * 50)
