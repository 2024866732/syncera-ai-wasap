# Telegram PDF → expenses insert (2026-09)

## Pause vs DNS

`ksqrpttesrrnzatgagyh.supabase.co` NXDOMAIN on Google DoH (Status 3) + `getent` fail means the **project is paused/deleted**, not a broken Hermes resolver. Do not insert. After Tuan Restore, poll DoH until Status 0 (A records), then use `/usr/bin/python3` + global supabase SDK (Hermes venv has no pip).

## Live constraints (prod may differ from schema SQL)

- `whatsapp_message_id` NOT NULL → `tg-pdf-{receipt_number}` for Telegram PDFs.
- `category_source` live check **rejected `auto`**; existing rows are **`manual`**. Use `manual` for this path.
- Idempotent on `receipt_number` (M2U Ref ID / myTNB REFERENCE NUMBER).
- `vendors.name` can be NULL — skip when building a name→id map.
- Do not send `processed_at` if the column is absent.

## Date parse

myTNB prints `M/D/YYYY` (`9/2/2026` = 2 Sep 2026). Record the assumption in `notes`.

## Vendors (id prefix)

E-PAY / JomPAY 2360 → `6c8e862b` utilities; TNB → `c7f2b782`; BSN → `71c653d0` loan_repayment; Sewa → `9aadb46c`.

## Logged 2026-09-05 (after restore)

| receipt_number | amount | category | date |
|---|---|---|---|
| 544814916M | 400.00 | loan_repayment | 2026-08-31 |
| 666950961M | 300.00 | utilities | 2026-09-01 |
| MYTN260952951989 | 479.35 | utilities | 2026-09-02 |
| 929196445M | 40.00 | utilities | 2026-09-04 |
