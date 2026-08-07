# HAFJET BI Agent — Production Deployment Checklist
# =====================================================
# Last updated: 4 Aug 2026

## PHASE 1: Infrastructure (30 min)
- [ ] 1.1  Supabase schema deployed (supabase_expenses_schema_hardened.sql)
- [ ] 1.2  Vendor RPC function deployed (supabase_vendor_rpc.sql)
- [ ] 1.3  Verify RLS policies: service_role only for INSERT
- [ ] 1.4  Verify UNIQUE constraint on whatsapp_message_id
- [ ] 1.5  Test vendors table has seed data (17 vendors)
- [ ] 1.6  Test fixed_costs table has 3 entries (sewa, bsn_loan, tnb)
- [ ] 1.7  Backup strategy: Supabase point-in-time recovery enabled

## PHASE 2: Environment (15 min)
- [ ] 2.1  Copy .env.example → ~/.hermes/.env
- [ ] 2.2  Set LOYVERSE_ACCESS_TOKEN
- [ ] 2.3  Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
- [ ] 2.4  Set WHATSAPP_VERIFY_TOKEN + WHATSAPP_ACCESS_TOKEN
- [ ] 2.5  Set WHATSAPP_PHONE_NUMBER_ID
- [ ] 2.6  Set AUTHORIZED_WHATSAPP_ID (Tuan Hafizi's number)
- [ ] 2.7  Verify token file: echo $LOYVERSE_ACCESS_TOKEN | head -c 8

## PHASE 3: System Dependencies (10 min)
- [ ] 3.1  Install tesseract-ocr + tesseract-ocr-msa
- [ ] 3.2  Verify: tesseract --list-langs | grep msa
- [ ] 3.3  Install Python deps: pip install -r requirements.txt
- [ ] 3.4  Verify: python3 -c "import pytesseract; print('OK')"

## PHASE 4: Script Deployment (15 min)
- [ ] 4.1  Deploy receipt_ocr_processor_v2.py → ~/.hermes/skills/
- [ ] 4.2  Deploy pnl_generator_v2.py → ~/.hermes/skills/
- [ ] 4.3  Deploy whatsapp_webhook_v2.py → ~/.hermes/skills/
- [ ] 4.4  Deploy find_vendor_by_alias RPC to Supabase
- [ ] 4.5  Set scripts executable: chmod +x *_v2.py

## PHASE 5: Webhook Deployment (20 min)
- [ ] 5.1  Start webhook: gunicorn whatsapp_webhook_v2:app -b 0.0.0.0:8080 -w 2 --timeout 120
- [ ] 5.2  Expose via Cloudflare Tunnel / ngrok / VPS public IP
- [ ] 5.3  Verify: curl https://your-domain.com/webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test
- [ ] 5.4  Set webhook URL in Meta Developer Console
- [ ] 5.5  Send test receipt image from authorized WhatsApp number
- [ ] 5.6  Verify reply received within 30 seconds
- [ ] 5.7  Check /health endpoint returns healthy

## PHASE 6: Cron Jobs (10 min)
- [ ] 6.1  Verify daily sales cron (9408be4cd593) → runs at 13:00 UTC
- [ ] 6.2  Verify monthly tracker cron (41a5046bdc08) → runs 1st 14:00 UTC
- [ ] 6.3  Verify monthly P&L cron (bb8a6cae36e8) → runs 1st 14:00 UTC
- [ ] 6.4  Update cron prompts to use v2 scripts:
      - Daily sales: use fetch_sales.py (already v2)
      - Monthly tracker: use gaji_profit_calc.py
      - Monthly P&L: use pnl_generator_v2.py
- [ ] 6.5  Test run: hermes cron run <job_id>

## PHASE 7: QA Testing (30 min)
- [ ] 7.1  Run QA checklist (see qa_checklist.md)
- [ ] 7.2  Test with 3 real HAFJET receipt samples
- [ ] 7.3  Generate P&L for July 2026: python3 pnl_generator_v2.py 2026 07
- [ ] 7.4  Compare P&L output with manual spreadsheet
- [ ] 7.5  Verify dashboard renders: open ~/.hermes/reports/pnl_dashboard_v2.html

## PHASE 8: Monitoring (15 min)
- [ ] 8.1  Health check cron: every 5 min ping /health
- [ ] 8.2  Alert if OCR failure rate > 20% in any hour
- [ ] 8.3  Alert if Loyverse API returns 401/402
- [ ] 8.4  Alert if Supabase connection fails
- [ ] 8.5  Alert if webhook returns 5xx for > 5 min

## ROLLBACK PLAN
- Stop webhook: kill gunicorn
- Revert to v1 scripts (functional but not hardened)
- Supabase schema changes are additive (no rollback needed)

## CONTACTS
- Loyverse support: https://loyverse.com/contact
- Meta WhatsApp support: https://developers.facebook.com/support/
- Supabase support: https://supabase.com/dashboard/support/new