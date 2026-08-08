# WhatsApp Cloud API — BSUID / User ID Audit

**Date:** 2026-08-08  
**Conclusion:** No changes needed. WhatsApp Cloud API uses `from` (wa_id) as the canonical identifier.

## Does the webhook handler read `user_id` / `from_user_id`?

**No.** The handler only reads:

```python
from_number = msg.get("from", "")      # ← wa_id / phone number ONLY
```

There is NO reference to `user_id`, `from_user_id`, `bsuid`, or `username` anywhere in the webhook handler, database schema, or any helper function.

## Is the system 100% phone-dependent?

**Yes — by design.** Every layer uses phone number as the primary identifier:

| Layer | Phone Dependency |
|---|---|
| Webhook inbound | `msg["from"]` → phone number |
| DB `customers` | `phone VARCHAR(20) UNIQUE NOT NULL` |
| DB `messages` | `customer_phone VARCHAR(20)` |
| Customer lookup | `get_customer_detail(phone)` → `WHERE phone=?` |
| Session send | `send_whatsapp_message(to_number, ...)` |
| Template send | `send_whatsapp_template(to_number, ...)` |
| 24h window check | `_check_24h_window(phone)` |
| Smart send | `send_whatsapp_smart(to_number, ...)` |
| Status callback | `status["recipient_id"]` → phone number |
| SPX reminders | `order["recipient_phone"]` → phone number |
| Blast/broadcast | Phone list from `customers.phone` |
| Dashboard API | All queries keyed by phone |

## Does WhatsApp Cloud API even provide a `user_id` field?

**No.** In standard WhatsApp Cloud API webhook payloads:
- `msg["from"]` = wa_id (WhatsApp phone number) — this is the ONLY identifier
- `contacts[0].wa_id` = same as `from` (redundant but more reliable)
- There is NO `user_id` or `from_user_id` field in the standard webhook schema

**BSUID** (Business Service User ID) is a concept relevant to Business Solution Providers (BSPs) who assign their own internal IDs. HAFJET is not a BSP.

## Edge Cases

| Scenario | Risk | Handling |
|---|---|---|
| `msg["from"]` empty | Low — Meta always sends wa_id | Falls through to empty string (silent failure) |
| `contacts[0].wa_id` mismatches `from` | Very Low — Meta redundancy | Not checked |
| Username-based ID | N/A — WhatsApp doesn't support this | Not applicable |
| WhatsApp Flows | Medium — uses `flow_token`, not `from` | Not implemented |

## Recommendation

**Option A (Minimal Safety — Recommended):** Add dual-source fallback:

```python
from_number = msg.get("from") or ""
if not from_number:
    contacts = value.get("contacts", [])
    from_number = contacts[0].get("wa_id", "") if contacts else ""
if not from_number:
    log.warning("??? Skipping message — no wa_id")
    return  # Don't process messages with no identifier
```

**Option B (No Change):** Risk is acceptable. WhatsApp Cloud API reliably provides `msg["from"]` for all standard messages. Option A is ~5 lines, safe to defer.

## Verdict

**Status:** `from` → phone number dependency is correct WhatsApp behaviour.  
**Action:** Deferred. No BSUID support needed at this time.
