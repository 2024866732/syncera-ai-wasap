---
name: hafjet-pnl-automation
description: Generate HAFJET monthly P&L from Loyverse + Supabase.
version: 1.0.0
category: devops
metadata:
  hermes:
    tags: [hafjet, pnl, loyverse, supabase, finance]
---

# HAFJET P&L Automation

Automated Profit & Loss system combining Loyverse revenue + Supabase expenses + WhatsApp receipt intake.

## Architecture

```
Loyverse API  →  Revenue Data  ──┐
                                 ├→  pnl_generator_v2.py  →  CSV + Dashboard + Telegram
Supabase DB   →  Expenses Data ──┘
WhatsApp      →  Receipt Images  →  receipt_ocr_processor_v2.py  →  Supabase
```

## Key Scripts

| Script | Purpose |
|--------|---------|
| `pnl_generator_v2.py` | Monthly P&L: revenue + expenses + fixed costs + hire verdict |
| `receipt_ocr_processor_v2.py` | OCR receipt → structured data → Supabase |
| `whatsapp_webhook_v2.py` | Flask webhook for WhatsApp receipt intake |

## Loyverse API: Critical Patterns

### Client-Side Date Filtering (MANDATORY)
Loyverse free-tier API **ignores** `created_at.gte/lte`. All receipts return regardless.

```python
# CORRECT: client-side filter
prefix = "2026-07"
month_receipts = [r for r in all_receipts if r.get("created_at","").startswith(prefix)]
```

### 31-Day Window
Always compare `today - month_start` (not `month_end`):
```python
month_start = date(year, month, 1)
if (date.today() - month_start).days > 31: warn("truncated")
```

### HTTP 402 = Expected
402 on page 10+ means 31-day limit reached. Stop pagination — not an error.

### Token Handling
Shell `$()` breaks with special chars. Use token file:
```bash
grep LOYVERSE_ACCESS_TOKEN ~/.hermes/.env | cut -d= -f2 > /tmp/.loyverse_token
```

## P&L Financial Logic

### Discount → COGS (Critical)
```python
discount_rate = total_discount / total_sales if total_sales > 0 else 0
cogs_adjusted = cogs_raw * (1 - discount_rate)
gross_profit = (total_sales - total_discount) - cogs_adjusted
```

### Fixed Costs: 3-Layer Safety Net
1. Query DB `fixed_costs` where `is_active=True`
2. If empty result → warn, use hardcoded RM 1,300
3. If exception → warn, use hardcoded RM 1,300

### Hire Threshold: Consistent RM 2,900
Same value in `pnl_generator_v2.py` AND `gaji_profit_calc.py`.

## Supabase Schema (Hardened)

- RLS: INSERT only via `service_role`
- `whatsapp_message_id` UNIQUE (idempotency)
- Soft delete: `deleted_at TIMESTAMPTZ`
- Views: `WHERE deleted_at IS NULL`
- SQL: `supabase_expenses_schema_hardened.sql` · `supabase_vendor_rpc.sql`

## OCR: Label Precedence

Total amount extraction by priority:
1. Grand Total (conf 0.95)
2. Amount Payable (conf 0.90)
3. Jumlah — last occurrence (conf 0.80)
4. Total — last occurrence (conf 0.75)
5. Last RM amount — fallback (conf 0.50)

## Deployment

### Webhook (port 8080)
```bash
# Check for systemd conflicts
systemctl list-units | grep orchestrator
sudo systemctl stop hafjet-orchestrator-api  # if blocking

# Deploy
cd ~/.hermes/skills
gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 -w 1 --timeout 120 --daemon
```

### Python Environment
Hermes venv Python 3.11 has no `pip`. Use global Python 3.10:
```bash
/usr/bin/python3 -c "import flask"  # verify
~/.local/bin/gunicorn whatsapp_webhook_v2:app ...
```

## Pitfalls

- Never trust Loyverse server-side date filters — always client-side filter
- Never use `month_end` for 31-day check — use `month_start`
- Never ignore discounts on COGS — inflates gross profit
- Always have hardcoded fixed-cost fallback
- Always check for systemd services before binding port 8080

## References

- `references/loyverse-api-patterns.md` — Detailed API patterns, date filtering, token handling
- `references/deployment-patterns.md` — Systemd conflicts, venv isolation, file paths, cron jobs