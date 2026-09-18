# Schema Migration Gotchas — Pre-existing Tables (verified Aug 2026)

Deploying `supabase_expenses_schema_hardened.sql` onto tables that ALREADY existed
(with an older, different schema) produced a sequence of errors. Each fix is below
with the exact failure. Goal: next time, write ONE idempotent file that handles all
of these up front — do NOT round-trip file → user → error → patch → resend.
(Tuan Hafizi explicitly lost patience with the round-trip delivery loop.)

## Error sequence (in order hit, with fixes)

| # | Error | Cause | Fix |
|---|-------|-------|-----|
| 1 | `42703: column "aliases" does not exist` | old `vendors` table missing new columns | `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}'` + every other new column |
| 2 | `42703: column "canonical_name" of relation "vendors" does not exist` | old `vendors` used `name`, not `canonical_name` | add `canonical_name`, then `UPDATE vendors SET canonical_name = name WHERE canonical_name IS NULL` (backfill) |
| 3 | `23502: null value in column "name" violates not-null constraint` | seed INSERT supplied `canonical_name` only, but old `name` column is still NOT NULL | seed must supply BOTH `name` AND `canonical_name`; only AFTER seed succeeds, relax: `ALTER TABLE vendors ALTER COLUMN name DROP NOT NULL` |
| 4 | `42701: column "total_amount" already exists` | both `amount` (old) and `total_amount` (new) exist; RENAME fails | detect dual-column: `DROP VIEW IF EXISTS expenses_active` → `UPDATE expenses SET total_amount = amount WHERE total_amount = 0` → `DROP COLUMN amount` |
| 5 | `2BP01: cannot drop column amount ... view expenses_active depends on it` | view depends on old column | `DROP VIEW IF EXISTS` the dependent view BEFORE dropping the column; recreate views after |
| 6 | `42710: policy "Service role full access" already exists` | policies created by earlier run | `DROP POLICY IF EXISTS "<name>" ON <table>` before every `CREATE POLICY` (no `CREATE OR REPLACE POLICY` in Postgres) |

## Known old-schema reality for HAFJET project `ksqrpttesrrnzatgagyh`

- `expenses`: had `amount` (NOT NULL) instead of `total_amount`; missing
  `vendor_name_raw`, `receipt_number`, `tax_amount`, `deleted_at`, `raw_ocr_text`,
  `ocr_confidence`, `image_quality`, `vendor_id`, `category_confidence`,
  `category_source`, `items`, `sender_whatsapp_id`, `sender_name`.
- `vendors`: had `name` (NOT NULL) instead of `canonical_name`; missing `aliases`,
  `default_category`, `is_active`, `created_at`, `updated_at`.
- `fixed_costs`: had `name`/`amount` only; missing `label`, `effective_from`,
  `effective_to`, `is_active`, `notes`, `updated_at`.
- View `expenses_active` depended on the old `amount` column.

## Post-deploy cleanup — duplicate fixed_costs seed

The schema seed runs `ON CONFLICT (name) DO NOTHING`, but old rows used different
capitalization (`Sewa`, `BSN Loan`, `TNB`) than the new seed (`sewa`, `bsn_loan`,
`tnb`) → both survive → total RM 2,600 instead of RM 1,300. Delete legacy names after deploy:

```python
from supabase import create_client
c = create_client(URL, SERVICE_ROLE_KEY)
for old in ['Sewa', 'BSN Loan', 'TNB']:
    c.table('fixed_costs').delete().eq('name', old).execute()
```

Verify: exactly 3 active rows (`sewa` 400, `bsn_loan` 400, `tnb` 500) = RM 1,300.

## Idempotency check-list for the one-shot file

- [ ] `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column
- [ ] backfill old→new key columns (`canonical_name` from `name`)
- [ ] seed supplies BOTH old and new required columns, `ON CONFLICT` on the old key
- [ ] `DROP NOT NULL` on deprecated columns AFTER seed
- [ ] dual-column branch for renamed money column (`amount`→`total_amount`)
- [ ] `DROP VIEW IF EXISTS` before dropping depended-on columns
- [ ] `DROP POLICY IF EXISTS` before every `CREATE POLICY`
- [ ] verify `pg_policies` → 2 policies per table (`expenses`, `vendors`, `fixed_costs`)
