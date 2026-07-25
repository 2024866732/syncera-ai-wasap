# SPX Self-Collection Follow-Up Rules (v1.1 — Jul 2026)

## Key Change from Legacy
- **OLD**: Day-counting (14/10/7/4/2 days from first_seen_at or inbound_time)
- **NEW**: SPX page status is PRIMARY source of truth. Lifecycle max ~6 days.

## Priority Logic
1. SPX page status = primary source. Map directly via `_DIRECT_STATUS_MAP`.
2. If status = `ReadyForCollection`, fall back to `collect_by_date`.
3. If `collect_by_date` missing, use `inbound_time + 5 days`.
4. `first_seen_at` NEVER used as SLA basis.

## Stage Order (low → high)
```
none → remind1 → remind2 → remind3 → remind4 → collection_failed → collected
```

## Direct Status Mapping
| SPX Page Status | Follow-Up Stage | WhatsApp Template |
|----------------|-----------------|-------------------|
| Remind1 | remind1 | template_remind1 |
| Remind2 | remind2 | template_remind2 |
| Remind3 | remind3 | template_remind3 |
| Remind4 | remind4 | template_remind4 |
| Collection Failed | collection_failed | template_collection_failed |
| Collected / Returned / Cancelled | (terminal) | none |

## Fallback by collect_by_date
| days_left | Stage |
|-----------|-------|
| < 0 | collection_failed |
| 0 | remind4 |
| 1 | remind3 |
| 2 | remind2 |
| >= 3 | remind1 |

## Anti-Duplicate / Anti-Downgrade
- Never re-send same stage (check `_stage_index(current) >= _stage_index(target)`)
- Never downgrade (remind3 → remind1 blocked)
- collection_failed = terminal
- Collected overrides everything

## Implementation
- **File**: `spx_followup.py` (208 lines, v1.1)
- **Function**: `determine_followup(order, now=None) → (stage, template) | (None, None)`
- **Integration**: `_check_spx_reminders()` in `webhook_listener.py`
- **Key fix v1.1**: Terminal check now uses `_is_terminal(current_stage)` covering `returned`/`cancelled` in DB (not just `collected`)

## Test Cases (20 verified)
1. SPX=Remind1, stage=none → (remind1, template_remind1)
2. SPX=Remind1, stage=remind1 → (None, None) [anti-duplicate]
3. SPX=Remind2, stage=remind1 → (remind2, template_remind2) [upgrade OK]
4. SPX=Collection Failed, stage=remind2 → (collection_failed, template_collection_failed)
5. SPX=Collected, stage=remind4 → (None, None) [terminal]
6. ReadyForCollection, 2 days left → (remind2, template_remind2)
7. ReadyForCollection, overdue → (collection_failed, template_collection_failed)
8. No dates, no inbound → (None, None) [graceful]
9. SPX="", stage=returned → (None, None) [v1.1 fix]
10. SPX="", stage=cancelled → (None, None) [v1.1 fix]

## Real SPX Lifecycle (confirmed from portal data)
- Max ~6 days: inbound_time → collect_by_date
- Statuses visible on portal: ReadyForCollection → Remind1 → Remind2 → Remind3 → Remind4 → Collection Failed
- `inbound_time + 5 days` ≈ collect_by_date deadline