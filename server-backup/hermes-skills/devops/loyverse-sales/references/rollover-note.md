# Loyverse API 31-Day Rollover Notes

## The Problem
Loyverse API on the free plan only returns receipts up to ~31 days old. This means:

- A June 30 query may **miss receipts from early June** (too old) and **miss receipts from late June** (if latest receipts are from July, pushing June receipts outside the window)
- Sequential daily queries gradually shift which months are visible
- A monthly report queried on different days returns **different totals**

## Concrete Impact (June 2026)

| Query Date | Receipts Captured | Total Sales | Notes |
|------------|-------------------|-------------|-------|
| 25 Jun 2026 | 90 | RM 4,708.00 | Missed pre-June 1, missed late June |
| 25 Jun 2026 (client-fixed) | 3 | RM 65.00 | Only today (correct) |
| 4 Jul 2026 (June range) | 104 | RM 9,443.98 | Now includes June 30 (RM 4,358) |

**Lesson:** Monthly totals from the Loyverse free tier are **unstable** — always note the query date and acknowledge data may be incomplete for months older than ~21 days.

## Workaround
For monthly reports, query on the **2nd or 3rd of the next month** — by then all receipts from the previous month will be within the 31-day window but before the oldest start dropping off.

E.g. July report → query on 2-3 August 2026.

## Data Integrity Check
Cross-reference with the Loyverse Dashboard (web UI). The dashboard shows accurate totals; the API is a best-effort supplement on the free plan.
