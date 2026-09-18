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

## DuitNow Transfer / TnG / Scan & Pay receipts (non-JomPAY)

M2U also emits `DuitNow Transfer` and `Scan & Pay` receipts. Fields differ from JomPAY:

| PDF label | Maps to |
|-----------|---------|
| Reference ID (`791143529M`, `QR86156299`) | `receipt_number` |
| Beneficiary name / account / bank | `notes` (mask account) |
| Recipient reference (e.g. `Toll`, `Toll Parking`) | `notes` |
| Amount | `total_amount` |

Established mapping (verified against existing rows, 2026-09-15):

| Pattern | vendor_id | vendor_name_raw | category | payment_method |
|---|---|---|---|---|
| DuitNow Transfer → own TnG eWallet | `cbc64606-d2b0-4976-a64a-5c8c8c9c0e3d` | `TOUCH N GO eWALLET` | `misc` | `transfer` |
| Scan & Pay QR to own name | ask Tuan — no precedent | — | — | `scan_pay` |

- Precedent row: 2026-08-13, RM10.00, ref `061483612M`, `misc`, notes
  "DuitNow Transfer to own TnG eWallet … Recipient reference: Toll Parking".
- TnG has **no row in `vendors`** — reuse the nameless `misc` vendor id above, keep
  the human label in `vendor_name_raw`.
- A `Scan & Pay` QR receipt with only "Beneficiary Name = own name" has **no
  inferable purpose** → ask Tuan before inserting; do not guess `misc`.

## ⚠️ Pitfall — cached PDF is PRUNED by the gateway (2026-09-11)

The gateway runs an hourly **`Document cache cleanup: removed N stale file(s)`** pass over
`~/.hermes/cache/documents/`. A receipt that arrived but was **not processed in the same turn**
(often because the agent run died — e.g. the xAI OAuth 403 failure) is deleted within hours.
The Telegram message then points at a path that no longer exists.

Symptoms / handling:

- `ls ~/.hermes/cache/documents/` shows only the newest PDF; earlier ones are gone.
- `grep "Cached user document" gateway.log` proves it DID arrive — trust that, plus
  `grep "Document cache cleanup" gateway.log` for the prune evidence. Never claim the
  user failed to send it.
- Recovery: ask Tuan to resend. Do NOT guess the missing amount/vendor from the filename.
- **Process every intake PDF in the same turn it arrives** (extract → confirm → insert).

Also check why a past receipt was never logged:

```bash
grep -n "unauthenticated:bad-credentials\|Non-retryable client error" ~/.hermes/logs/agent.log*
```

A 403 provider failure on the intake turn explains a silently-missing expense row.


## Example success (2026-08-15)

- Ref `260871731M`, RM 77.00, utilities, id `5a79028f-…`
- Vendor default aligned to utilities after category fix
