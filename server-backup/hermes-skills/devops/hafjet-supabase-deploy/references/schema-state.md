# HAFJET Supabase Schema Reference

## Current Table State (2026-08-05)

| Table | Rows | Missing Columns (vs hardened) |
|-------|------|------|
| `expenses` | 0 | vendor_name_raw, receipt_number, tax_amount, deleted_at, raw_ocr_text, ocr_confidence, image_quality, vendor_id FK, category_confidence, category_source, items JSONB, sender_whatsapp_id, sender_name, UNIQUE constraint on whatsapp_message_id |
| `fixed_costs` | 3 | label, is_active, effective_from, effective_to, notes, updated_at |
| `vendors` | 0 | canonical_name (old has `name`), aliases, default_category, is_active, created_at, updated_at |

## RLS State
- All 3 tables have RLS enabled
- No service_role-only INSERT policy on expenses → needs hardening

## Views
- `expenses_active` — excludes `deleted_at IS NULL` (exists)
- `monthly_expense_summary` — Not yet created (needs hardened schema)
- `yearly_expense_summary` — Not yet created
- `vendor_expense_summary` — Not yet created

## Deployment Order
1. Run `supabase_expenses_schema_hardened.sql` → adds missing columns, constraints, RLS, views, indexes, grants
2. Run `supabase_vendor_rpc.sql` → creates `find_vendor_by_alias(search_term)` function
3. Verify: `fixed_costs` has 3 rows with `is_active=true`, `vendors` has 17 seed rows
4. Re-run `pnl_generator_v2.py` → should load fixed costs from DB without fallback warning
