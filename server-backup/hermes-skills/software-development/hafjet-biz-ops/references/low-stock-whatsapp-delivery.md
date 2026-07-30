# Low-stock WhatsApp delivery guardrails

## Problem pattern
A low-stock query can return a very large number of records (for example, old variants held at zero stock). Sending every line as WhatsApp text is unsuitable for an owner alert.

## Graph API constraints observed
- Text message body limit: **4,096 characters**.
- Sending many messages rapidly from one business number to the same recipient can fail with Meta error **`131056`** (Business Account / Consumer Account pair rate limit).

## Safe operational pattern
1. Fetch and count all low-stock records, grouped by store.
2. Send one concise triage alert: overall count, per-store count, and a ranked shortlist (default 25 items/store).
3. State the number of remaining records and direct the owner to review/export in Loyverse; do not paginate a full inventory list into dozens of WhatsApp messages.
4. Treat an unexpectedly high count, especially mostly zero stock, as an inventory-data quality signal (inactive/legacy variants or stock baseline issue).
5. Include the Graph API response body in failure logs so rate limits, invalid credentials, and invalid recipient errors are distinguishable.

## Configuration
`LOW_STOCK_ALERT_MAX_ITEMS_PER_STORE` may override the default shortlist cap when deliberately required.
