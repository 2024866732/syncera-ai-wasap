# Message Data Model & Conversation Linking (server-side)

How the bot's message tables link, and two bugs that broke conversation-dashboard
linking (fixed 2026-08-14). Discovered while debugging SPX reminders — the "Saya
di sini" name bug and synthetic-wamid bug both hit SPX customers.

## Core Tables

| Table | Purpose | Key column |
|-------|---------|-----------|
| `messages` | inbound + outbound log | `wamid`, `customer_phone`, `direction` |
| `customers` | customer identity | `phone` (PK), `name` |
| `message_delivery_status` | Meta delivery receipts | `wamid`, `status`, `error_code` |
| `conversation_state` | live thread mode/owner | `customer_phone` |

**Linking rule:** `messages.wamid` MUST equal `message_delivery_status.wamid`
(real Meta `wamid.HBg...`) for the dashboard to join an outbound message to its
delivery receipt (sent → delivered → read).

## WABA Number Verification (Graph API)

```bash
TOKEN=$(az webapp config appsettings list --name hafjet-whatsapp-bot \
  --resource-group hafjet-bot-rg \
  --query "[?name=='WHATSAPP_ACCESS_TOKEN'].value | [0]" -o tsv)
curl -sS "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}?fields=display_phone_number,verified_name,quality_rating,status" \
  -H "Authorization: Bearer $TOKEN"
```

**Bot number = `+60 11-4956 1698` (wa_id `601149561698`).** NOT `016-9808736`.
`+60169808736` is the WhatsApp *admin* number (catalog/db_logger) — different.

## Bug A — Customer name overwritten by inbound text

`_save_inbound()` used `INSERT ... name = content[:20]` → "Saya di sini" (first
inbound) became `customers.name`. Fix `_resolve_customer_name()` priority:
1. existing name → keep, 2. `recipient_name` from `spx_self_collection_orders`,
3. non-generic inbound → `content[:20]`, 4. generic/`<3 chars` → empty.

## Bug B — Synthetic `out_*` wamid

`log_outbound()` fell back to `out_{timestamp}`; send fns returned `bool`, so real
wamid never flowed through → delivery receipts couldn't join to outbound messages.
Fix: `send_whatsapp_message/template/smart` now return `str|None` (real wamid);
all `log_outbound()` callers pass it as 6th arg. Truthiness preserved (`None` falsy).

## Historical backfill limits

- **wamid:** old `out_*` rows CANNOT be reconstructed (was a timestamp). Only future links.
- **name:** CAN be repaired by joining `spx_self_collection_orders.recipient_name`.

```python
# name backfill
generic = ['Saya di sini','saya di sini','Hi','Hai','Hello','salam','Saya sampai']
ph = ','.join(['?']*len(generic))
for p,n in c.execute(f"SELECT phone,name FROM customers WHERE LOWER(name) IN ({ph})", tuple(generic)):
    spx = c.execute("SELECT recipient_name FROM spx_self_collection_orders "
                    "WHERE recipient_phone=? OR recipient_phone=? ORDER BY updated_at DESC LIMIT 1",
                    (p,'+'+p)).fetchone()
    if spx and spx[0]: c.execute("UPDATE customers SET name=? WHERE phone=?", (spx[0], p))
```
