---
name: loyverse-sales
description: Fetch and report daily sales from Loyverse POS API. Use when the user asks about daily sales, Loyverse reports, receipt data, or sales summaries. Handles the Loyverse API quirk where server-side date filters are ignored on limited plans.
---

# Loyverse Sales Report

Fetch daily sales data from Loyverse API and produce formatted reports with CSV export.

## Trigger

- User asks about "sales today", "daily sales report", "Loyverse sales", "jualan hari ini"
- Scheduled cron job runs the daily sales report

## Architecture

```
~/.hermes/skills/fetch_sales.py   ← main script
~/.hermes/reports/sales_YYYY-MM-DD.csv  ← output
~/.hermes/.env                    ← LOYVERSE_ACCESS_TOKEN
```

## How to Run

```bash
# Extract token and run
TOKEN=$(grep LOYVERSE_ACCESS_TOKEN ~/.hermes/.env | head -1 | cut -d= -f2-)
LOYVERSE_ACCESS_TOKEN=$TOKEN python3 ~/.hermes/skills/fetch_sales.py
```

## Critical Pitfall: Client-Side Date Filtering ⚠️

**Loyverse API ignores `created_at.gte` / `created_at.lte` server-side filters on limited plans.**

The API returns ALL available receipts (up to 31-day history limit) regardless of the date params you pass. If you rely solely on server-side filtering, your "daily" report will include receipts from multiple days.

**Fix:** Always implement client-side filtering:

```python
target_date = gte[:10]  # "2026-06-25"
today_receipts = [r for r in receipts if r.get("created_at", "").startswith(target_date)]
```

The `created_at` field format is ISO 8601: `2026-06-25T14:15:05.000Z`

## API Details

- Base URL: `https://api.loyverse.com/v1.0`
- Auth: Bearer token in `Authorization` header
- Pagination: cursor-based (use `cursor` from response)
- Rate limit: HTTP 402 when requesting receipts older than 31 days (requires Unlimited Sales History subscription)
- Page size: 10 (API max)

## Output Format

The script produces:
1. **Console summary** (Telegram-formatted Markdown) — total sales, transaction count, tax, discount, payment breakdown, top 5 items
2. **CSV file** at `~/.hermes/reports/sales_YYYY-MM-DD.csv` with per-item rows

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Report shows wildly wrong total (e.g. RM4,708 instead of RM65) | Server-side date filter ignored | Ensure client-side filtering is in place |
| HTTP 401 | Invalid/expired token | Update `LOYVERSE_ACCESS_TOKEN` in `~/.hermes/.env` |
| HTTP 402 | Receipt older than 31 days | Expected — stop pagination, what you have is fine |
| "Tiada transaksi" but dashboard shows sales | Timezone mismatch or filter bug | Check `created_at` dates in raw API response |

## Script Location

`~/.hermes/skills/fetch_sales.py` — single-file script, no dependencies beyond Python stdlib.

The canonical corrected version is in this skill's `references/fetch_sales.py`. If the deployed script is producing wrong totals, compare against this reference.
