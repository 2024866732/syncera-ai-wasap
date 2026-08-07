# Gaji vs Profit / Hire-Readiness Monthly Tracker

Downstream monthly report built on Loyverse sales data for HAFJET. Computes payroll-vs-profit
readiness so Tuan Hafizi can decide when to hire.

## Runner
`/tmp/gaji_profit_calc.py [YYYY MM]` — no args = CURRENT month; with args = explicit month.
Reads token from `/tmp/.loyverse_token`. Writes/upserts
`~/.hermes/reports/gaji_profit_tracker.csv`.

Cron job `41a5046bdc08` "HAFJET Monthly Gaji-Profit Tracker" runs this on `0 14 1 * *`
(10:00 AM MYT, day 1) reporting the PREVIOUS month.

## Calculation chain (actual script logic)
1. Fetch all receipts whose `created_at` starts with `YYYY-MM` (client-side filter — Loyverse
   ignores server-side date filters; see main SKILL.md pitfall).
2. `total_sales = Σ total_money`
3. `total_cost  = Σ line_items[].cost_total` (COGS)
4. `net_profit  = total_sales - total_cost - total_discount` (gross profit before fixed costs)
5. `kos_tetap   = 400 + 400 + 500 = 1300` (Sewa tertunggak + BSN loan + TNB)
6. `baki_hidup  = net_profit - kos_tetap` (after fixed costs, before salary)
7. hire status from `net_profit` vs thresholds below (NOT baki_hidup).

## Hire-readiness thresholds (on net_profit)
| net_profit            | status                                  |
|-----------------------|-----------------------------------------|
| ≥ RM 3,500            | ✅ READY TO HIRE (full-time)            |
| ≥ kos_tetap+1500+1700 | 🟡 BOLEH hire part-time je              |
| < above               | ⚠️ BELUM — perlu +RM {gap} lagi         |

where gap = (1300 + 1500 + 1700) - net_profit = 4500 - net_profit.
(1500 = Tuan's living wage draw; 1700 = min employee salary.)

## CSV schema (`gaji_profit_tracker.csv`)
`bulan,jualan,net_profit,kos_tetap,gaji_pekerja,baki_hidup,status`
- `bulan`        : `YYYY-MM`
- `jualan`       : total sales (RM)
- `net_profit`   : gross profit before fixed costs (RM)
- `kos_tetap`    : 1300.00
- `gaji_pekerja` : 0.00 (no employee salary yet)
- `baki_hidup`   : net_profit - 1300
- `status`       : hire-readiness string

## 31-day API window — operational reality
Loyverse free tier only returns the last 31 days of receipts. The day-1 cron run captures the
full previous month because day-1 is within 31 days of month-end. Running mid-month for a
previous month (e.g. July 16 for June) will return ZERO June matches — June 1-15 is >45 days old.

**Data-integrity guard implemented in `scripts/gaji_profit_calc.py`:** if `today - month_start > 31 days`
AND a row already exists in the tracker, PRESERVE the existing row — do NOT fetch/overwrite.
This prevents accidental zeroing of historical data.

## P&L System v2 (Full Financial Statement)

For consolidated P&L reporting that combines Loyverse revenue + Supabase expenses + fixed costs,
see `references/pnl-system-v2.md`. The calculator script (`gaji_profit_calc.py`) is the simple
version; the full P&L generator (`pnl_generator_v2.py`) produces complete Profit & Loss statements
with discount-adjusted COGS, category-level reconciliation, and hire-readiness dashboards.

**⚠️ CONSISTENCY RULE**: `pnl_generator_v2.py` uses `HIRE_THRESHOLD = 2900.0` (net_profit).
This is the same source of truth. Do not introduce a different threshold in any script.

## Status as of 2026-08-04
- Supabase schema hardened: vendors table, fixed_costs table, RLS restricted to service_role,
  soft-delete via deleted_at, UNIQUE on whatsapp_message_id for idempotency.
- OCR v2 deployed: label-precedence total amount extraction (7/7 test pass), image preprocessing
  pipeline, field-level confidence scoring.
- P&L v2 deployed: discount allocation to COGS, UTC month boundaries, revenue reconciliation,
  Loyverse 31-day warning.
- WhatsApp webhook v2: idempotent UPSERT, exponential backoff retry, rate limiting, monitoring.
- QA checklist: 25 test cases across OCR (10), P&L (7), Webhook (6), Integration (2).
- Verdict: CONDITIONAL GO — all critical fixes applied, pending QA test pass.
