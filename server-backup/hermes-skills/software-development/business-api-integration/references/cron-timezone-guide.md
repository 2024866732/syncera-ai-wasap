# Cron Job Timezone Guide

When scheduling cron jobs on the HAFJET Hermes server, remember:

## Server Timezone
- The server runs on **UTC** (no local timezone set).
- Malaysia Time (MYT) = **UTC+8**.

## Cron Schedule Conversion

| MYT (Malaysia) | UTC (Server) | Cron Expression |
|----------------|--------------|-----------------|
| 22:00 (10 PM)  | 14:00        | `0 14 * * *`    |
| 06:00 (6 AM)   | 22:00 (prev) | `0 22 * * *`    |
| 09:00 (9 AM)   | 01:00        | `0 1 * * *`     |
| 12:00 (Noon)   | 04:00        | `0 4 * * *`     |
| 18:00 (6 PM)   | 10:00        | `0 10 * * *`    |

## Formula
```
UTC_hour = MYT_hour - 8
```
If result is negative, add 24 (previous day).

## Example: Daily Sales Report at 22:00 MYT
```yaml
schedule: "0 14 * * *"  # 14:00 UTC = 22:00 MYT
```

## Important Notes
- Always verify the next_run_at time shown after creating/updating a cron job.
- The `next_run_at` in the API response is in UTC — convert to MYT by adding 8 hours.
- For one-shot jobs, use ISO timestamp format: `2026-06-22T14:00:00` (UTC).
