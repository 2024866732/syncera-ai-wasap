# Loyverse API Patterns for HAFJET

## Client-Side Date Filtering (Critical)

Loyverse free-tier API **ignores** `created_at.gte` and `created_at.lte` parameters on the `/receipts` endpoint. All available receipts within the 31-day window are returned regardless of what date filters you set.

### Root Cause
Tested with explicit date ranges:
```
gte: 2026-06-25T00:00:00+08:00
lte: 2026-06-25T23:59:59+08:00
```
API returned receipts from June 22, 24, AND 25 — ignoring the range.

### Fix Pattern
```python
def fetch_month_receipts(year, month):
    prefix = f"{year:04d}-{month:02d}"
    all_receipts = []
    params = {"created_at.min": start.isoformat(), "limit": 10}
    while True:
        data = api_get("/receipts", params)
        receipts = data.get("receipts", [])
        # CLIENT-SIDE filter — mandatory
        month_receipts = [r for r in receipts 
                         if r.get("created_at", "").startswith(prefix)]
        all_receipts.extend(month_receipts)
        cursor = data.get("cursor")
        if not cursor or not receipts: break
        params = {"cursor": cursor}
    return all_receipts
```

### Impact if not fixed
- Daily sales reports include prior days' receipts
- Example: June 25 report showed RM 4,696 (90 receipts) instead of RM 65 (3 receipts)
- Monthly P&L revenue inflated by cross-month contamination

## 31-Day Window Check

Loyverse free tier only returns receipts from the last 31 calendar days.

### Corrected Check
```python
def check_loyverse_window(year, month):
    """Use month START, not month END."""
    month_start = date(year, month, 1)
    days_ago = (date.today() - month_start).days
    if days_ago > 31:
        return False, f"{days_ago} days ago — first receipts may be truncated"
    return True, f"OK"
```

### Why month_start
- July 1 receipts are 34 days old on August 5
- Old code compared `today - month_end` (July 31 = 4 days) → said "OK"
- New code compares `today - month_start` (July 1 = 34 days) → correctly warns

## HTTP 402 = Expected Behavior

When pagination reaches receipts older than 31 days, Loyverse returns:
```json
{"errors":[{"code":"PAYMENT_REQUIRED","details":"Unable to retrieve receipts created earlier than 31 days ago. Please subscribe to Unlimited sales history."}]}
```
This is NOT an error — just stop pagination. All recent receipts have been captured.

## Token Handling

The `LOYVERSE_ACCESS_TOKEN` contains characters that break shell `$()` substitution. Always use a file:
```bash
# Write token to file (one-time per session)
grep LOYVERSE_ACCESS_TOKEN ~/.hermes/.env | head -1 | cut -d= -f2 > /tmp/.loyverse_token

# In Python
with open("/tmp/.loyverse_token") as f:
    token = f.read().strip()
```

## Receipt Structure

Each receipt has:
- `total_money`: gross sale (before discount)
- `total_discount`: sum of all discounts
- `line_items[].total_money`: per-item sale price
- `line_items[].cost_total`: per-item COGS (from Loyverse item setup)
- `payments[].money_amount`: payment breakdown by method
- `created_at`: ISO 8601 in UTC (e.g., `2026-06-25T14:15:05.000Z`)