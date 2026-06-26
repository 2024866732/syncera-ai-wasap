# Loyverse API Notes

Working patterns discovered through integration (June 2026).

## Base URL
```
https://api.loyverse.com/v1.0
```

## Auth
```
Authorization: Bearer <token>
```
Token from: Loyverse Back Office → Settings → API → Personal Access Tokens

## Receipts Endpoint

### Get list of receipts
```
GET /receipts?limit=10&created_at.gte=2026-06-22T00:00:00.000Z
```

### Parameters
| Parameter | Type | Default | Max | Notes |
|-----------|------|---------|-----|-------|
| limit | int | 50 | **50** (not 250) | Use 10 for reliability; values > 50 return 402 |
| cursor | string | - | - | Do NOT url-encode |
| cursor | string | - | - | Do NOT url-encode |
| created_at.gte | ISO 8601 | - | - | Start of date range |
| created_at.lt | ISO 8601 | - | - | End of date range |
| receipt_numbers | string | - | - | Comma-separated |

### Response structure
```json
{
  "receipts": [...],
  "cursor": "Qgeo_QOclIECSKTst48mYApwBw=="
}
```

### Receipt object key fields
| Field | Type | Description |
|-------|------|-------------|
| receipt_number | string | e.g., "6-2066" |
| receipt_type | string | "SALE" or "REFUND" |
| created_at | ISO 8601 | Creation timestamp |
| total_money | float | Total amount |
| total_tax | float | Tax amount |
| payments | array | Payment breakdown |
| line_items | array | Items purchased |
| customer_id | string/null | Customer reference |
| store_id | string | Store reference |
| employee_id | string | Staff reference |

### Payment object
```json
{
  "name": "Cash",
  "type": "CASH",
  "money_amount": 30.00
}
```

### Line item object
```json
{
  "item_name": "HOTLINK RM30 MAXIS",
  "quantity": 1,
  "price": 30.00,
  "total_money": 30.00
}
```

## Known Issues

### HTTP 402 on deep pagination
- Occurs around page 10+ (90+ receipts) when using cursor pagination
- **Not** a payment issue — it's a soft pagination depth limit
- **Fix:** Stop pagination at first 402, return accumulated data
- Alternative: Use smaller date windows instead of deep cursor pagination

### Cursor encoding
- Do NOT use `urllib.parse.quote(cursor)` — Loyverse rejects encoded cursors
- Pass cursor raw: `url += "&cursor=" + cursor`

### Date filter + cursor
- `created_at.gte` + cursor works, but may hit 402 sooner than without date filter
- For daily reports, first page (limit=50) is usually sufficient
- **Best practice:** Use both `created_at.gte` AND `created_at.lte` to bound the range:
  ```
  ?created_at.gte=2026-06-22T00:00:00+08:00&created_at.lte=2026-06-22T23:59:59+08:00&limit=10
  ```

### HTTP 402 — clarified root cause
- Loyverse free tier only allows retrieving receipts **created within the last 31 days**
- When cursor pagination reaches receipts older than 31 days, API returns:
  ```json
  {"errors": [{"code": "PAYMENT_REQUIRED", "details": "Unable to retrieve receipts created earlier than 31 days ago. Please subscribe to Unlimited sales history."}]}
  ```
- **This is NOT a rate limit** (rate limit is 429). It's a subscription feature gate.
- **Fix:** Stop pagination at first 402, return accumulated data. For daily reports this is fine since today's data is always within 31 days.

### Rate limits
- 300 requests per 300 seconds per account
- Add `time.sleep(0.3)` between paginated requests

## Working Python Pattern

```python
import os, json, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

token = os.environ["LOYVERSE_ACCESS_TOKEN"]
base_url = "https://api.loyverse.com/v1.0"
myt = timezone(timedelta(hours=8))
today = datetime.now(myt).strftime("%Y-%m-%d")

all_receipts = []
cursor = None

while True:
    url = base_url + "/receipts?limit=10&created_at.gte=" + today + "T00:00:00.000Z"
    if cursor:
        url += "&cursor=" + cursor  # Raw cursor, no encoding

    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code in (402, 429):
            break  # Pagination limit or rate limit
        raise

    receipts = data.get("receipts", [])
    if not receipts:
        break
    all_receipts.extend(receipts)
    cursor = data.get("cursor")
    if not cursor:
        break
    time.sleep(0.3)
```
