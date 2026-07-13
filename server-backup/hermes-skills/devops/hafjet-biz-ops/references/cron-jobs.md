# Cron Jobs — HAFJET Operations

## Job Schedule

| Job | Schedule | Time (MYT) | Description |
|:---|:---|:---:|:---|
| `hafjet-sales-daily-digest` | `0 21 * * *` | 9:00 PM | Ringkasan jualan harian → WhatsApp owner |
| `hafjet-repair-pickup-reminder` | `0 11 * * *` | 11:00 AM | Reminder item READY >3 hari |
| `hafjet-low-stock-alert` | `0 9 * * *` | 9:00 AM | Alert stok bawah threshold |
| `hafjet-exception-report` | `0 */2 * * *` | Setiap 2 jam | Lapor errors + missing data |

## Job Details

### 1. hafjet-sales-daily-digest

```
Schedule: 0 21 * * * (9:00 PM MYT daily)
Purpose: Ringkaskan jualan harian untuk owner
Data Source: Loyverse API (today's receipts)
Output: WhatsApp owner + optional Gmail archive
```

**Logic:**
1. Fetch today's receipts from Loyverse API
2. Filter by `created_at` prefix (MYT timezone)
3. Calculate: total sales, transaction count, top items, payment mix
4. Check for exceptions (failed payments, missing data)
5. Format owner digest
6. Send to owner WhatsApp

### 2. hafjet-repair-pickup-reminder

```
Schedule: 0 11 * * * (11:00 AM MYT daily)
Purpose: Reminder customer ambil peranti siap
Data Source: Repair tickets (status = ready-pickup)
Output: WhatsApp customer (max 1/day/customer)
```

**Logic:**
1. Query tickets with `status = 'ready-pickup'`
2. Filter: `ready_since >= 3 days`
3. Check: already reminded today? → skip
4. Send reminder message
5. If no response after 7 days → escalate ke owner
6. Log sent reminders

### 3. hafjet-low-stock-alert

```
Schedule: 0 9 * * * (9:00 AM MYT daily)
Purpose: Alert item stok rendah
Data Source: Loyverse inventory API
Output: WhatsApp owner
```

**Logic:**
1. Fetch inventory items from Loyverse
2. Filter: `stock < threshold` (per category)
3. Group by category
4. Format critical items list
5. Send owner alert
6. Optional: suggest reorder quantities

### 4. hafjet-exception-report

```
Schedule: 0 */2 * * * (Every 2 hours)
Purpose: Monitor errors & missing data
Data Source: System logs, failed sends, missing fields
Output: WhatsApp owner (only if exceptions found)
```

**Logic:**
1. Scan recent logs for errors
2. Check: failed WhatsApp sends
3. Check: missing phone/email in orders
4. Check: webhook failures
5. Check: token expiry warnings
6. If exceptions found → send report
7. If no exceptions → silent (no message)

## Environment Variables

```bash
# Loyverse
LOYVERSE_ACCESS_TOKEN=...

# WhatsApp (for customer messages)
WHATSAPP_API_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...

# Gmail (for invoice dispatch)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...

# Notifications
OWNER_WHATSAPP=+60...
OWNER_EMAIL=hafjetai@gmail.com
```

## Monitoring Commands

```bash
# Check cron jobs
crontab -l

# View job logs
tail -50 ~/.hermes/cron/output/hafjet-*.log

# Manual trigger
hermes cron run hafjet-sales-daily-digest

# Check Loyverse sync
curl -s "https://api.loyverse.com/v1.0/receipts?limit=5" -H "Authorization: Bearer $LOYVERSE_ACCESS_TOKEN"
```

## Escalation Rules

| Scenario | Escalation |
|:---|:---|
| Customer no response (pickup reminder) | After 7 days → owner |
| WhatsApp send failed | Retry 2x → owner alert |
| Missing customer phone | Log to exception, skip send |
| Loyverse API error | Retry 3x → owner alert |
| Token expiring (<24h) | Alert owner immediately |
