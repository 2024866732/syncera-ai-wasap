# HAFJET BI Agent — Deployment Checklist

## Phase 1: Supabase Schema (5 min)
1. Open Supabase Dashboard → SQL Editor
2. Run `supabase_expenses_schema_hardened.sql`
3. Run `supabase_vendor_rpc.sql`
4. Verify: `SELECT COUNT(*) FROM vendors` → 17
5. Verify: `SELECT COUNT(*) FROM fixed_costs` → 3

## Phase 2: Environment (10 min)
1. Copy credentials template: `cp .env.example ~/.hermes/.env`
2. Fill: LOYVERSE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
3. Fill: WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
4. Set: AUTHORIZED_WHATSAPP_ID = Tuan's number
5. Set: PORT=8080 (or desired webhook port)

## Phase 3: Dependencies (5 min)
```bash
apt-get install tesseract-ocr tesseract-ocr-msa poppler-utils
pip install supabase pytesseract pillow pdfplumber numpy opencv-python-headless python-dotenv python-dateutil
# Verify
tesseract --list-langs | grep msa
python3 -c "from supabase import create_client; print('OK')"
```

## Phase 4: Scripts (2 min)
```bash
cd ~/.hermes/skills/
chmod +x *_v2.py
python3 -m py_compile receipt_ocr_processor_v2.py && echo "OCR OK"
python3 -m py_compile pnl_generator_v2.py && echo "P&L OK"
python3 -m py_compile whatsapp_webhook_v2.py && echo "Webhook OK"
```

## Phase 5: Webhook Deploy (5 min)
```bash
# Stop old service on port 8080 if any
kill $(lsof -ti:8080) 2>/dev/null

# Start webhook
gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 -w 2 --timeout 120 --daemon

# Verify
curl http://localhost:8080/health
# → {"status": "healthy", "service": "hafjet-whatsapp-webhook-v2"}

# Set Meta webhook URL
# https://your-domain.com/webhook
```

## Phase 6: Meta Webhook Verify (10 min)
1. Go to Meta Developer Console → WhatsApp → Configuration
2. Set Callback URL: `https://your-domain.com/webhook`
3. Set Verify Token: same as `WHATSAPP_VERIFY_TOKEN` in `.env`
4. Click "Verify and Save"
5. Send test message from authorized WhatsApp number
6. Verify reply received within 30 seconds

## Phase 7: Cron Update (2 min)
```bash
# Update monthly P&L cron to use v2 script
hermes cron update bb8a6cae36e8 --prompt "...Run: python3 /home/hafizi145/.hermes/skills/pnl_generator_v2.py..."
```

## Phase 8: Final Verification (5 min)
```bash
# Test P&L generation
python3 pnl_generator_v2.py 2026 07

# Verify outputs exist
ls -la ~/.hermes/reports/pnl_tracker_v2.csv
ls -la ~/.hermes/reports/pnl_dashboard_v2.html

# No warnings expected:
# "Could not fetch fixed costs from DB" → schema not deployed yet
# "LOYVERSE WARNING: 35 days ago" → expected for months >31d
```

## Rollback Plan
- Stop webhook: `kill $(lsof -ti:8080)`
- Revert cron prompt to old script
- Schema changes are additive — no rollback needed
