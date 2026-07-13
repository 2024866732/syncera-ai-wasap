---
name: whatsapp-bot-health-check
description: "HAFJET WhatsApp Bot health check, monitoring, and log analysis routine. Use when validating bot status, checking webhook health, reviewing logs, or proposing monitoring improvements."
version: 1.0.0
author: Hermes-HAFJET
tags: [whatsapp, health-check, monitoring, azure, hafjet]
---

# WhatsApp Bot Health Check

Reusable routine for validating HAFJET WhatsApp Bot status, logs, and infrastructure.

## Quick Health Check (3 commands)

```bash
# 1. Azure app status
az webapp show --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg --query "{state:state,hostname:defaultHostName}" -o tsv

# 2. Bot health endpoint
curl -fsS "https://hafjet-whatsapp-bot.azurewebsites.net/health" -o /tmp/health.json && cat /tmp/health.json

# 3. Webhook verification
curl -fsS "https://hafjet-whatsapp-bot.azurewebsites.net/webhook?hub.mode=subscribe&hub.verify_token=HAFJET_RAUB_RAK&hub.challenge=test123"
```

Expected results:
- Azure state: `Running`
- Health: `"status":"ok"`, `"configured":true`
- Webhook: returns challenge string (e.g. `test123`)

## Full Health Check

### DB Inspection (READ-ONLY)
```bash
cd /home/hafizi145/.hermes/whatsapp-bot && python3 -c "
import sqlite3, os
db = 'bot_data.db'
print(f'DB exists: {os.path.exists(db)}')
print(f'DB size: {os.path.getsize(db)/1024:.1f} KB')
conn = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
tables = [r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
print(f'Tables: {tables}')
for t in tables:
    cnt = conn.execute(f'SELECT COUNT(*) FROM [{t}]').fetchone()[0]
    print(f'  {t}: {cnt} rows')
conn.close()
"
```

### Log Analysis
```bash
# Error count (last 50 lines)
grep -c "ERROR" ~/.hermes/logs/errors.log 2>/dev/null

# Warning count (webhook log)
grep -c "WARNING" ~/.hermes/logs/webhook.log 2>/dev/null

# Recent errors (last 5)
tail -5 ~/.hermes/logs/errors.log 2>/dev/null

# Azure live log
az webapp log tail --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```

### Azure Restart (Clean)
```bash
az webapp stop --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
sleep 3
az webapp start --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```

## Error Patterns to Watch

| Pattern | Severity | Action |
|---------|----------|--------|
| `PrivilegedIntentsRequired` | LOW | Discord intents not enabled — not WhatsApp related |
| `SKILL.md content is 101,312 characters` | LOW | Skill too large — split into references/ |
| `zip: command not found` | LOW | Use tar instead |
| `BLOCKED: Command denied` | INFO | User approval denied — not a bug |
| `Run time of job was missed` | LOW | APScheduler missed tick — usually recoverable |
| `❌ Missing X-Hub-Signature-256` | WARN | External caller without signature — expected for non-Meta traffic |
| `❌ Invalid webhook signature` | WARN | Bad signature — possible attack or config drift |

## Log Retention Policy

| Log | Location | Retention | Action |
|-----|----------|-----------|--------|
| `gateway.log` | `~/.hermes/logs/` | 7 days | Rotate with logrotate |
| `errors.log` | `~/.hermes/logs/` | 30 days | Keep for audit |
| `webhook.log` | `~/.hermes/logs/` | 7 days | Rotate with logrotate |
| Azure logs | Azure portal | 30 days | Built-in retention |
| `bot_data.db` | `whatsapp-bot/` | Indefinite | Backup daily |

## Security Checks

- [ ] No secrets in logs (grep for token patterns)
- [ ] DB accessible only in read-only mode
- [ ] Webhook signature verification enforced
- [ ] `.env` not committed to git
- [ ] No `curl | python3` patterns (use file-based approach)

## Cron Job Schedule

Two APScheduler jobs run on the bot:
1. `_check_escalation_timeout` — every 5 min
2. `_check_spx_reminders` — every 15 min (08-21 MYT only)

Monitor for missed ticks in webhook.log:
```bash
grep "missed" ~/.hermes/logs/webhook.log | tail -5
```
