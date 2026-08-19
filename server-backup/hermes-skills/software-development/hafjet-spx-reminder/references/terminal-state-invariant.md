# Terminal SPX State Invariant — Verified Production Playbook

Use when SPX rows show a terminal `spx_status` but `hafjet_reminder_state='Pending'`.

## Invariant

For `Collected`, `Returned`, `Cancelled`, `Collection Failed`, and `CollectionFailed`, `hafjet_reminder_state` must become `Completed`. This decision depends on status only; `recipient_phone` must not participate.

## Regression source of truth

A frequent gap is applying terminal handling only in the existing-row UPDATE path. Incremental SPX sync can first discover an order after it is terminal, so the INSERT path must bind the same canonical values:

```python
new_status = _safe_str(data.get("spx_status", "ReadyForCollection"))
terminal = {"Collected", "Returned", "Cancelled", "Collection Failed", "CollectionFailed"}
requested_state = _safe_str(data.get("hafjet_reminder_state", ""))
reminder_state = "Completed" if new_status in terminal else (requested_state or None)

if existing:
    # bind reminder_state through COALESCE(...)
    ...
else:
    # bind new_status and (reminder_state or "Pending")
    ...
```

## Required tests

1. Insert a new `Collected` row with an inbound `Pending` state; assert stored state is `Completed`.
2. Insert a new `ReadyForCollection` row; assert stored state remains `Pending`.
3. Update an existing terminal row carrying stale `Pending`; assert stored state is `Completed`.

## Production repair order

1. Deploy the tested source with Kudu VFS read-back verification.
2. After an approved stop/start, wait for the first `/health` 200 and then require six consecutive 200 responses, five seconds apart.
3. Migrate only terminal rows that are currently `Pending`:

```sql
UPDATE spx_self_collection_orders
SET hafjet_reminder_state='Completed', updated_at=datetime('now')
WHERE spx_status IN ('Collected','Returned','Cancelled','Collection Failed','CollectionFailed')
  AND COALESCE(hafjet_reminder_state, 'Pending')='Pending';
```

4. Download the production DB again and independently verify zero terminal-Pending rows plus any user-specified tracking numbers.

Do not modify `ReadyForCollection` records during this repair.
