# Telegram bank-document intake

Use this reference when a Telegram PDF/image is supplied for HAFJET expense processing.

## Safe sequence

1. Extract text first; do not infer an amount, vendor, or payment status from filename alone.
2. Classify the document:
   - **Payment proof** (e.g. JomPAY/DuitNow marked successful): propose the parsed vendor, amount, date, receipt/reference ID, and category.
   - **Invoice / e-statement** without a successful-payment marker: label it as invoice/accrual, not proof of payment; request an explicit accounting decision before inserting an expense.
3. Require explicit user confirmation before any Supabase write. Keep confirmation syntax concise and include the exact total/vendor.
4. On approved write, use a deterministic idempotency key derived from the payment reference (e.g. `telegram_jompay_<reference>`), and upsert against the existing message/idempotency column.
5. Store source filename and masked/non-secret metadata in notes. Never put bank account numbers, credentials, cookies, or API keys in Telegram output.
6. Read back the returned database record ID and report vendor, amount, category, and idempotency behaviour.

## HAFJET conventions observed

- E-PAY (M) Sdn Bhd JomPAY biller 2360 is categorised as `utilities`.
- The current expense category set includes `misc`, `rent`, `stock_purchase`, and `utilities`; do not invent a new category without schema/owner approval.
- A loan/financing payment with no dedicated category may be recorded as `misc` only with a clear note of the recipient reference.
