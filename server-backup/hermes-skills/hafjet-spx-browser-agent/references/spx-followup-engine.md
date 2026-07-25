# SPX Follow-Up Engine — Mapping & Test Cases

## Status-Based Mapping (Primary)

| SPX Page Status | `spx_status` | → `followup_stage` | → `template_name` |
|----------------|-------------|--------------------|--------------------|
| Remind1 | `Remind1` | `remind1` | `template_remind1` |
| Remind2 | `Remind2` | `remind2` | `template_remind2` |
| Remind3 | `Remind3` | `remind3` | `template_remind3` |
| Remind4 | `Remind4` | `remind4` | `template_remind4` |
| Collection Failed | `Collection Failed` | `collection_failed` | `template_collection_failed` |
| Collected | `Collected` | (no follow-up) | `None` |
| Ready For Collection | `Ready For Collection` | fallback to date | (see below) |

## Date-Based Fallback (ReadyForCollection only)

| `days_left` | → `followup_stage` | → `template_name` |
|------------|--------------------|--------------------|
| `< 0` | `collection_failed` | `template_collection_failed` |
| `== 0` | `remind4` | `template_remind4` |
| `== 1` | `remind3` | `template_remind3` |
| `== 2` | `remind2` | `template_remind2` |
| `>= 3` | `remind1` | `template_remind1` |

`days_left = (collect_by_date - today).days`

## Anti-Duplicate Rules

| Rule | Logic |
|------|-------|
| Same stage | If `current_stage == next_stage` → skip (no re-send) |
| Downgrade | If `current_stage > next_stage` → skip (never go backwards) |
| Terminal | `collected` / `returned` / `cancelled` → always skip |
| Repeated | `collection_failed` is terminal — send once, never repeat |

## Real SPX Data (from page, 2026-07-25 context)

| Tracking | Name | Status (page) | Current DB Stage | collect_by | inbound | Expected Output |
|----------|------|---------------|-----------------|------------|---------|----------------|
| SPXMY060732178147 | eddy | Remind1 | none | 2026-07-27 | 2026-07-22 | `(remind1, template_remind1)` |
| SPXMY064732182707 | Nor Hanis | Remind2 | none | 2026-07-25 | 2026-07-20 | `(remind2, template_remind2)` |
| SPXMY066126167837 | Ayra | Collection Failed | none | 2026-07-24 | 2026-07-19 | `(collection_failed, template_collection_failed)` |
| Same eddy, re-run | eddy | Remind1 | remind1 | 2026-07-27 | 2026-07-22 | `(None, None)` — already sent |
| ReadyForCollection | — | Ready For Collection | none | 2026-07-27 | 2026-07-22 | `(remind2, template_remind2)` ← fallback: 2 days left |
| Collected | — | Collected | remind2 | — | — | `(None, None)` — terminal |

## Integration with webhook_listener.py

```python
from spx_followup import determine_followup

def _check_spx_reminders():
    orders = get_spx_due_orders()
    for order in orders:
        next_stage, template = determine_followup(dict(order), now=datetime.now())
        if next_stage:
            send_whatsapp(order['recipient_phone'], template, order)
            update_followup_stage(order['id'], next_stage)
```

## Key Design Decisions

1. **SPX page status is authoritative** — if the page says "Remind2", that is the truth. No day-counting overrides it.
2. **`first_seen_at` never used for SLA** — browser agent may discover parcels late. Only `collect_by_date` and `inbound_time` are date sources.
3. **Lifecycle is ~6 days**, not 14. The old 14/10/7/4/2 day rule is obsolete.
4. **Backend decides WhatsApp send, not browser** — browser only delivers raw scraped facts.
