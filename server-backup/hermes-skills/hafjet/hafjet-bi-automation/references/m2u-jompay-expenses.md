# M2U JomPAY PDF → Supabase expenses

## When

Telegram document named like `M2U_YYYYMMDD_HHMM.pdf` (Maybank2U JomPAY success receipt).

## Extract (example fields)

| PDF label | Example | Maps to |
|-----------|---------|---------|
| Timestamp near Reference ID | 15 Aug 2026, 7:46 PM | `expense_date` = `2026-08-15` |
| Reference ID | `260871731M` | `receipt_number` (idempotent key) |
| Biller Code + name | 2360 E-PAY (M) SDN BHD | vendor resolve |
| Reference 1 / 2 | 267989 / MAIN | notes |
| JomPAY reference number | `D8F4LBS6` | notes |
| Amount | RM 77.00 | `total_amount` |

## Insert contract

```text
whatsapp_message_id = m2u_jompay_<receipt_number>
vendor_name_raw     = from PDF
vendor_id           = resolved vendors.id
expense_date        = YYYY-MM-DD
total_amount        = decimal
category            = vendor.default_category (E-PAY → utilities)
category_source     = manual
status              = completed
receipt_number      = M2U Reference ID (e.g. 260871731M) — NOT only JomPAY D8… code
notes               = biller/ref/jompay/time/pdf name
items               = optional single-line summary
```

Idempotent pre-check:

```text
SELECT where receipt_number = ? OR whatsapp_message_id = ?
AND deleted_at IS NULL
→ if row exists: print existing, exit 0 (do not double-insert)
```

## E-PAY specifically

- Biller **2360**
- vendor_id **`6c8e862b-b3b1-405f-95c8-2bbe65dfd665`**
- category **`utilities`** (not stock_purchase)
- **Pitfall (2026-08-15):** vendor `default_category` was still `stock_purchase` while mid-August E-PAY rows already used `utilities`. After insert, if category wrong: UPDATE expense + set `vendors.default_category='utilities'`.
- Prefer vendor default after it is fixed; still force utilities for biller 2360 if default drifts.

## Runtime

- Write script to `/tmp/*.py` then `/usr/bin/python3` (no heredoc; Hermes venv may lack pip/supabase)
- Env: read `~/.hermes/.env` in script (`SUPABASE_URL` + `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`)
- Refuse `sb_publishable_*` for writes
- Never echo secrets; print month rollup after insert
- PDF text: `read_file` on cached doc path works (anydoc) when terminal blocked

## Example success (2026-08-15)

- Ref `260871731M`, RM 77.00, utilities, id `5a79028f-…`
- Vendor default aligned to utilities after category fix
