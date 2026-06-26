# Telegram Delivery Pattern

How to send formatted reports to Telegram from cron jobs and scripts.

## Overview

After generating a report (e.g., sales summary), deliver the stdout output directly to a Telegram chat using the Telegram Bot API. This is common for cron jobs where the agent's final response is auto-delivered.

## Credentials

Telegram bot credentials are stored in `~/.hermes/.env`:

```env
TELEGRAM_BOT_TOKEN=8877701062:...
TELEGRAM_HOME_CHANNEL=1485374469
TELEGRAM_ALLOWED_USERS=1485374469
```

- `TELEGRAM_BOT_TOKEN` — Bot token from @BotFather
- `TELEGRAM_HOME_CHANNEL` — Chat ID (can be a user private chat or group/channel ID)
- `TELEGRAM_ALLOWED_USERS` — Whitelist of user IDs allowed to interact with the bot

## Reading Telegram Credentials

**⚠️ GOTCHA:** Telegram bot tokens contain a colon (`:`) and alphanumeric characters. Terminal output may **redact or mask** tokens (showing `887770...Nrq0` instead of the full value). The `cut -d= -f2-` extraction pattern works for reading the raw value from the file, but the output will be truncated/masked by the shell.

**Safe pattern:** Read the token into a Python variable by opening the file directly — never print the full token to stdout or log files:

```python
import os, json, urllib.request

def load_telegram_creds():
    """Read bot token and chat ID from ~/.hermes/.env without printing them."""
    env_path = os.path.expanduser("~/.hermes/.env")
    bot_token = chat_id = None
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                bot_token = line.split("=", 1)[1].strip()
            elif line.startswith("TELEGRAM_HOME_CHANNEL="):
                chat_id = line.split("=", 1)[1].strip()
    return bot_token, chat_id
```

## Sending a Message

```python
def send_telegram_message(bot_token, chat_id, text, parse_mode="Markdown"):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))
```

## Cron Job Pattern

For a cron job that runs a report and sends to Telegram:

1. Script fetches data (API/DB) → saves CSV → prints formatted summary to stdout
2. Cron agent reads the script's stdout
3. Agent sends the stdout to Telegram using the pattern above
4. CSV is preserved in `~/.hermes/reports/` for archival

```bash
# Run the report and capture output
REPORT_OUTPUT=$(LOYVERSE_ACCESS_TOKEN=<token> python3 ~/.hermes/skills/fetch_sales.py 2>/dev/null)
# Then send $REPORT_OUTPUT to Telegram
```

**Tip:** Use `2>/dev/null` when capturing output so debug/stderr lines (like "CSV saved: ...") don't pollute the message.

## Formatting for Telegram

Telegram supports Markdown (bold, italic) in messages. Use it for readability:

```
📊 *Laporan Jualan Harian — 2026-06-24*

💰 Total Jualan: *RM 4,693.00*
🧾 Transaksi: *90*
```

Emoji prefixes make scannable reports on mobile.
