# HAFJET P&L System v2 (Production Hardened)

## Architecture

The P&L system combines **Loyverse revenue** + **Supabase expenses** + **fixed costs** into a complete monthly Profit & Loss statement with hire-readiness verdict.

```
Loyverse API ──┐
               ├── pnl_generator_v2.py ──► Console Report
Supabase ──────┤                           ├── pnl_tracker_v2.csv
              │                           └── pnl_dashboard_v2.html
Fixed Costs ───┘ (from DB, not hardcoded)
```

## Files

| File | Purpose |
|------|---------|
| `~/.hermes/skills/pnl_generator_v2.py` | Monthly P&L generator |
| `~/.hermes/skills/supabase_expenses_schema_hardened.sql` | Supabase schema (vendors, expenses, fixed_costs, RLS) |
| `~/.hermes/skills/supabase_vendor_rpc.sql` | `find_vendor_by_alias()` function |
| `~/.hermes/reports/pnl_tracker_v2.csv` | Monthly P&L CSV |
| `~/.hermes/reports/pnl_dashboard_v2.html` | Dark-themed Chart.js dashboard |

## Critical Fixes (v2 over v1)

### 1. Discount Allocation to COGS

```
V1 (BROKEN):  gross_profit = total_sales - cogs
              → discount ignored, profit inflated

V2 (FIXED):   discount_rate = total_discount / total_sales
              cogs_adjusted = cogs * (1 - discount_rate)
              gross_profit = (sales - discount) - cogs_adjusted
```

**Impact:** On RM 100 sale with 10% discount and RM 80 COGS:
- V1: RM 20 gross profit (inflated by RM 2)
- V2: RM 18 gross profit (correct)

### 2. Fixed Costs from Database

```sql
CREATE TABLE public.fixed_costs (
    id UUID PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,        -- 'sewa', 'bsn_loan', 'tnb'
    label TEXT NOT NULL,              -- 'Sewa Kedai', 'BSN Loan', 'TNB'
    amount DECIMAL(12,2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,                -- NULL = ongoing
    is_active BOOLEAN DEFAULT true
);
```

Never hardcode fixed costs in Python. Fetch from `fixed_costs` table at runtime.

### 3. Consistent Hire Threshold

**Single source of truth:** `HIRE_THRESHOLD = 2900.0` (RM 2,900/month net profit)

This value must be the SAME across:
- `pnl_generator_v2.py`
- `gaji_profit_calc.py`  
- `loyverse-sales/scripts/gaji_profit_calc.py`

Any script that answers "boleh hire?" must use this exact threshold.

### 4. UTC Month Boundaries

```python
from dateutil.relativedelta import relativedelta

start_utc = datetime(year, month, 1, tzinfo=timezone.utc)
end_utc = (start_utc + relativedelta(months=1))
```

Using UTC avoids the MYT ±8h edge case where a receipt at 00:30 MYT on the 1st is technically the previous month in UTC.

### 5. Revenue Reconciliation

```python
categorized_total = sum(revenue_breakdown.values())
reconciliation_gap = total_sales - categorized_total
reconciliation_pct = abs(reconciliation_gap / total_sales * 100)

if reconciliation_pct > 5.0:
    print(f"⚠ {reconciliation_pct:.1f}% revenue uncategorized")
```

### 6. Loyverse 31-Day Limit Detection

```python
days_ago = (today - month_end).days
if days_ago > 31:
    print(f"⚠ Data may be incomplete ({days_ago} days > 31-day limit)")
```

## Hire-Readiness Logic (Production Model)

```python
HIRE_THRESHOLD = 2900.0  # net profit needed

net_profit = gross_profit - total_all_expenses
hire_ready = net_profit >= HIRE_THRESHOLD

if not hire_ready and net_profit > 0:
    monthly_growth = net_profit * 0.05  # assume 5% monthly growth
    months_to_ready = int((HIRE_THRESHOLD - net_profit) / max(monthly_growth, 50)) + 1
```

## Revenue Categories

```python
REVENUE_CATEGORIES = {
    "bill_redone": ["bill redone", "reload", "topup"],
    "tnb_payments": ["tnb", "tenaga", "electric"],
    "tunetalk": ["tunetalk", "tune talk"],
    "phone_sales": ["vivo", "iphone", "pixel", "phone", "handphone", "unit"],
    "repair_services": ["repair", "tukar lcd", "ganti battery", "charging port"],
    "accessories": ["casing", "tempered", "charger", "cable", "headphone"],
    "photostat": ["photostat", "fotostat", "fotokopi"],
    "other_bills": ["bill maxis", "bill air", "bill astro"]
}
```

## Cron Integration

| Job ID | Name | Schedule | Script |
|--------|------|----------|--------|
| `bb8a6cae36e8` | Monthly P&L Report | `0 14 1 * *` (1st, 22:00 MYT) | `pnl_generator_v2.py` |
| `41a5046bdc08` | Gaji-Profit Tracker | `0 14 1 * *` (1st, 22:00 MYT) | `gaji_profit_calc.py` |
| `9408be4cd593` | Daily Sales Report | `0 13 * * *` (21:00 MYT) | `fetch_sales.py` |

## Deployment

```bash
# 1. Run SQL
# Open Supabase SQL Editor → paste supabase_expenses_schema_hardened.sql
# Then run supabase_vendor_rpc.sql

# 2. Generate P&L
python3 ~/.hermes/skills/pnl_generator_v2.py 2026 07

# 3. Open dashboard
# ~/.hermes/reports/pnl_dashboard_v2.html
```

## ROLLBACK

P&L v2 is additive over v1:
- SQL schema changes are additive (DROP NOT performed)
- Script changes are parallel files (`_v2.py`)
- CSV tracker is parallel file (`pnl_tracker_v2.csv`)
- No v1 data is overwritten
