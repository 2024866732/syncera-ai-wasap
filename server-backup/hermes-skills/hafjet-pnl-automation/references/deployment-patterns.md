# P&L v2 Deployment Patterns

## Systemd Service Conflicts

The `hafjet-orchestrator-api` systemd service binds port 8080 and auto-restarts when killed.

### Detection
```bash
systemctl list-units --type=service | grep -i orchestrator
# hafjet-orchestrator-api.service  loaded active running
```

### Resolution
```bash
sudo systemctl stop hafjet-orchestrator-api
# Verify port free
lsof -i :8080  
```

## Python Environment Isolation

Hermes Agent runs in its own virtual environment (`~/.hermes/hermes-agent/venv/`) with Python 3.11. This venv has **no pip module** and **no Flask**.

### Verification
```bash
which python3                          # /home/hafizi145/hermes-agent/venv/bin/python3
python3 --version                       # Python 3.11.15
python3 -c "import flask"             # ModuleNotFoundError
```

### Workaround
Use global Python 3.10 for Flask/gunicorn deployment:
```bash
/usr/bin/python3 --version             # Python 3.10.12
/usr/bin/python3 -c "import flask"    # OK
pip3 install flask gunicorn            # installs to global Python

# Deploy with global Python
~/.local/bin/gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 -w 1 --timeout 120 --daemon
```

## P&L Generator: Global vs Venv Python

For `pnl_generator_v2.py` — the `supabase` module must be importable:
```bash
# Test: can the Python used by gunicorn import supabase?
/usr/bin/python3 -c "from supabase import create_client; print('OK')"
```

If `pnl_generator_v2.py` runs inside Hermes cron (uses venv Python), ensure dependencies are in venv. If run standalone, use global Python.

## Webhook Health Verification

```bash
curl -s http://localhost:8080/health | python3 -m json.tool
# Expected:
# {
#   "service": "hafjet-whatsapp-webhook-v2",
#   "status": "healthy",
#   "monitor": { ... }
# }
```

Key check: `service` field must show `hafjet-whatsapp-webhook-v2`, NOT `hafjet-orchestrator`.

## Production File Paths

| File | Path |
|------|------|
| P&L Generator | `/home/hafizi145/.hermes/skills/pnl_generator_v2.py` |
| OCR Processor | `/home/hafizi145/.hermes/skills/receipt_ocr_processor_v2.py` |
| Webhook | `/home/hafizi145/.hermes/skills/whatsapp_webhook_v2.py` |
| Supabase Schema | `/home/hafizi145/.hermes/skills/supabase_expenses_schema_hardened.sql` |
| Vendor RPC | `/home/hafizi145/.hermes/skills/supabase_vendor_rpc.sql` |
| CSV Tracker | `~/.hermes/reports/pnl_tracker_v2.csv` |
| Dashboard | `~/.hermes/reports/pnl_dashboard_v2.html` |
| Token File | `/tmp/.loyverse_token` |
| Env Config | `~/.hermes/skills/.env.example` |

## Cron Jobs

| ID | Name | Schedule | Script |
|----|------|----------|--------|
| `9408be4cd593` | Daily Sales Report | 0 13 * * * (21:00 MYT) | `fetch_sales.py` |
| `41a5046bdc08` | Monthly Gaji-Profit Tracker | 0 14 1 * * | `gaji_profit_calc.py` |
| `bb8a6cae36e8` | Monthly P&L Report (v2) | 0 14 1 * * (22:00 MYT 1st) | `pnl_generator_v2.py` |