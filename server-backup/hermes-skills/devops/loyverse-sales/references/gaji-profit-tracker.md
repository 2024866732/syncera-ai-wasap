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

**The current script does NOT have a data-integrity guard.** If you re-run for an old month,
it fetches nothing and would overwrite the row with empty/zero data. **Mitigation:** do not
re-run the calc for months already closed; rely on the preserved CSV row. If a guard is needed,
add: skip fetch+upsert when (today - month_start).days > 31 AND a row already exists.

## Business context (from conversation with Tuan Hafizi)
- Tuan jaga kedai SENDIRI setiap hari — "terperuk, tak boleh ke mana". Hiring frees his time.
- ROI argument: hire when (value of freed time) > (salary + profit gap). Even if shop profit
  doesn't rise, if freed time earns >RM2,400/mo elsewhere (logistics, AI ops), hiring is ROI+.
- Margin insight: reload/bill-payment days = 2-5% margin; phone/repair days = 25-80%.
  Pushing 2-3 phone units/mo like VIVO V70 (+RM607) closes the hire gap fast.
- Fixed costs confirmed Jul 2026: Sewa tertunggak RM400/bln (baki RM5,000), BSN loan RM400/bln,
  TNB RM400-500/bln (use 500 conservative).

## Status as of 2026-07-16
- June 2026 row: complete (jualan 9443.98, net_profit 2722.19, baki_hidup 1422.19,
  status "OK - belum boleh hire").
- July 2026 row: partial (1-16 Julai) jualan 8445.49, net_profit 1196.95, baki_hidup -103.05.
- `/tmp/gaji_profit_calc.py` is the working copy; the dashboard is `/tmp/gaji_profit_dashboard.html`.
- Cron `41a5046bdc08` tested successfully (run on 2026-07-16 computed July correctly).
