# HAFJET BI Agent — QA Checklist
# ============================================
# Run before production deployment

## OCR Tests (Receipt Processing)

### OCR-01: Clear digital receipt (JPG)
- Input: Clear, well-lit receipt photo
- Expected: vendor detected, date correct, total_amount matches, category correct, confidence ≥ 0.70
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-02: Faded thermal receipt
- Input: Old/faded thermal receipt (low contrast)
- Expected: image_quality='poor', returns needs_review=True, helpful error message
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-03: PDF invoice (text-based)
- Input: PDF invoice with embedded text
- Expected: All fields extracted, is_scanned=false, ocr_confidence ≥ 0.80
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-04: Scanned PDF (image-based)
- Input: PDF that is scanned image
- Expected: is_scanned=true, processes through Tesseract, reasonable results
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-05: Receipt with 6% SST tax
- Input: Receipt showing SST 6% line item
- Expected: tax_amount populated, total_amount excludes tax
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-06: Total amount label precedence
- Input: Receipt with "Subtotal: RM 100", "Tax: RM 6", "Grand Total: RM 106"
- Expected: total_amount = 106 (Grand Total, NOT 100, NOT 106 from "any RM")
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-07: Malaysian receipt with "Jumlah" label
- Input: Receipt with "Jumlah: RM 245.50" as final total
- Expected: total_amount = 245.50, extracted from "Jumlah" label
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-08: Blurry/low-light receipt
- Input: Dark/blurry receipt photo (Laplacian var < 50)
- Expected: image_quality='poor', needs_review=True
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-09: Vendor normalization
- Input: Receipt from "Tenaga Nasional Berhad"
- Expected: vendor_name_raw="Tenaga Nasional Berhad", canonical="TNB", vendor_id not null
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### OCR-10: "Bank In Transfer" receipt
- Input: Receipt with "Bank In Transfer" payment
- Expected: payment_method="transfer", detected correctly
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

## P&L Tests (Financial Accuracy)

### P&L-01: Discount allocation
- Input: Month with RM 100 total sales, RM 10 discounts, RM 80 COGS
- Expected: Gross Profit = (100-10) - (80 * (1 - 10/100)) = 90 - 72 = RM 18
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### P&L-02: Fixed costs from database
- Input: Change tnb to 450 in supabase fixed_costs table
- Expected: P&L shows TNB = RM 450 (not hardcoded 500)
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### P&L-03: Consistent hire threshold
- Input: Both pnl_generator_v2.py and gaji_profit_calc.py
- Expected: Both use HIRE_THRESHOLD = 2900 (not 3500 vs 2900)
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### P&L-04: Revenue reconciliation
- Input: Month with some items uncategorized
- Expected: reconciliation_gap shows difference, reconciliation_ok=False if >5%
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### P&L-05: Loyverse 31-day warning
- Input: Generate P&L for a month >31 days ago
- Expected: Warning printed about incomplete data
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### P&L-06: Soft-deleted expenses excluded
- Input: Soft-delete 1 expense row (set deleted_at)
- Expected: P&L excludes that expense, total adjusts correctly
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### P&L-07: UTC month boundary
- Input: Month with receipts at midnight UTC exactly on 1st
- Expected: All receipts for that month captured, none missed/shifted
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

## Webhook Tests (Reliability)

### WEB-01: Webhook verification
- Input: GET /webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test123
- Expected: Returns "test123" with 200
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### WEB-02: Idempotent processing
- Input: Send same receipt twice (same whatsapp_message_id)
- Expected: Only 1 row in Supabase expenses table (UPSERT, no duplicate)
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### WEB-03: Unauthorized sender blocked
- Input: Message from non-authorized WhatsApp number
- Expected: Silently ignored, logged, no reply sent
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### WEB-04: Rate limiting
- Input: 11 messages in 60 seconds from same sender
- Expected: 10 processed, 11th rate-limited
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### WEB-05: Media download retry on failure
- Input: Temporary network failure during media download
- Expected: Retries up to 3x with exponential backoff
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### WEB-06: Health endpoint
- Input: GET /health
- Expected: {"status": "healthy", ...} with monitor data
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

## Integration Tests

### INT-01: End-to-end receipt → P&L
- Input: Send 3 receipts via WhatsApp → wait → generate monthly P&L
- Expected: All 3 in expenses table, P&L includes them in variable costs
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

### INT-02: Cron job runs end-to-end
- Input: Trigger monthly P&L cron manually
- Expected: P&L report generated, CSV updated, dashboard refreshed
- Result: [ ] PASS  [ ] FAIL
- Notes: ____________________

## PASS/FAIL SUMMARY

| Section | Passed | Failed | Total |
|---------|--------|--------|-------|
| OCR     | __/10  | __/10  | 10    |
| P&L     | __/7   | __/7   | 7     |
| Webhook | __/6   | __/6   | 6     |
| Integration | __/2 | __/2  | 2     |
| **TOTAL** | **__/25** | **__/25** | **25** |

## PRODUCTION GO/NO-GO

- [ ] GO — All critical tests pass (OCR-01,06; P&L-01,02; WEB-02)
- [ ] NO-GO — List blocking issues: ____________________