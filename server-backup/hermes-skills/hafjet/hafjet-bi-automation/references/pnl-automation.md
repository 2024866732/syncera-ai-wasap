# HAFJET P&L Automation — Architecture & Known Pitfalls

## File Inventory

| File | Location | Purpose |
|------|----------|---------|
| `supabase_expenses_schema_hardened.sql` | `~/.hermes/skills/` | Expenses table + vendors + fixed_costs + RLS |
| `supabase_vendor_rpc.sql` | `~/.hermes/skills/` | `find_vendor_by_alias()` function |
| `receipt_ocr_processor_v2.py` | `~/.hermes/skills/` | OCR pipeline with label-precedence extraction |
| `pnl_generator_v2.py` | `~/.hermes/skills/` | Monthly P&L generator |
| `whatsapp_webhook_v2.py` | `~/.hermes/skills/` | WhatsApp webhook handler |
| `pnl_tracker_v2.csv` | `~/.hermes/reports/` | Monthly P&L CSV |
| `pnl_dashboard_v2.html` | `~/.hermes/reports/` | Visual dashboard |
| `gaji_profit_tracker.csv` | `~/.hermes/reports/` | Salary vs profit tracker |

## Architecture

```
Input: Loyverse API (revenue) + WhatsApp (receipt images/PDFs) + Supabase (expenses)
  │
  ├─ receipt_ocr_processor_v2.py   — OCR extraction → categorize → Supabase INSERT/UPDATE
  ├─ pnl_generator_v2.py           — Monthly P&L → print report + CSV + HTML dashboard
  ├─ whatsapp_webhook_v2.py        — WhatsApp intake → rate-limit → authorize → delegate to OCR
  └─ supabase_expenses_schema_hardened.sql — Database schema (RLS, UNIQUE, views, vendors)
  │
Output: Console P&L report → CSV file → HTML dashboard → WhatsApp confirmation reply
```

## Fixed Pitfalls (Session: Aug 4–5, 2026)

### 1. Loyverse 31-Day Window Detection (FIXED)
- **Commit**: `pnl_generator_v2.py` line ~160
- **Before**: `month_end = date(year, month+1, 1) - timedelta(days=1)` → compared end of month against today
- **Bug**: July 2026: month_end = Jul 31 (4 days ago) → "OK" — but July 1 receipts were 34 days old, already truncated
- **After**: `month_start = date(year, month, 1)` → compared first day of month against today
- **Result**: July 2026 now correctly warns: "35 days ago — first receipts may be truncated"
- **Test**: 4/4 test cases pass (July warn, August OK, June warn, May warn)

### 2. Fixed Costs Schema Mismatch (FIXED)
- **Commit**: `pnl_generator_v2.py` line ~131
- **Before**: `.select("name, label, amount")` → Supabase error `column fixed_costs.label does not exist`
- **Bug**: Deployed schema doesn't have `label` column; generator falls back to hardcoded values
- **After**: `.select("name, amount")` → no error
- **Display labels**: Already handled client-side via `fixed_labels = {"sewa": "Sewa Kedai", ...}` dict
- **Note**: `supabase_expenses_schema_hardened.sql` adds `label` column when deployed

### 3. Typo: bil_ratio → bill_ratio (User-fixed)
- **Symptom**: Dashboard HTML template referenced `report['bil_ratio']` (missing second 'l')
- **Fix**: Tuan fixed with `sed -i "s/bil_ratio/bill_ratio/g"`
- **Impact**: Dashboard JS comparison `report['bill_ratio'] < 5` would have thrown KeyError

## OCR Implementation Details

### Image Preprocessing Pipeline
1. Convert to grayscale
2. Resize to min 1500px width
3. Denoise (MedianFilter 3x3)
4. Sharpen
5. Enhance contrast (2.0x)
6. Adaptive threshold (Sauvola-like approximation)
7. Invert if dark-on-light

### Quality Detection
- **Blur**: Laplacian variance < 50 = poor, < 150 = fair, ≥ 150 = good
- **Brightness**: < 40 = too dark, > 240 = washed out
- **All quality issues** → `image_quality='poor'` → `needs_review=True`

### Categorization
- **Method**: Weighted keyword matching (weights 1–5) + vendor boost (+3 for known utilities/banks)
- **Confidence**: `min(score / 10.0, 1.0)` — normalized to 0–1
- **Threshold**: ≥ 0.70 → auto-complete; < 0.70 → flagged for review
- **Fallback**: If no keywords match → `misc` with confidence 0.05

## Verification Test Results

### Supabase Schema (33/33)
All required features verified in `supabase_expenses_schema_hardened.sql`:
- 3× RLS enabled (expenses, vendors, fixed_costs)
- Service role INSERT policy (no `WITH CHECK(true)`)
- UNIQUE `whatsapp_message_id`
- 8 CHECK constraints
- 6 new fields (tax_amount, receipt_number, deleted_at, vendor_id, raw_ocr_text, ocr_confidence)
- 5 indexes (incl. composite month_cat)
- 3 views exclude soft-deleted rows
- 2 seed tables (17 vendors, 3 fixed_costs)

### OCR Label Precedence (10/10)
- 7 unit tests: Grand Total → Jumlah → Total → fallback
- 3 synthetic receipts: TNB bill, thermal receipt, phone invoice
- All 10 correctly identified total amount by label priority

### P&L Math (8/8)
- Discount allocation: `cogs_adjusted = cogs_raw * (1 - discount/sales)`
- All edge cases: 0% disc, 10% disc, 100% disc, tiny disc on large sale
- V1-vs-V2 diff: RM 2.00 inflation on RM 100 sale with 10% discount

### Total: 77/77 checks passed
