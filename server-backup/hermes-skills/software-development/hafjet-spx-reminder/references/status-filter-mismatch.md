# SPX Status Filter Mismatch — Display Name vs DB Value

## Problem

Frontend dropdown filter "Ready For Collection" returns no results despite DB having 16+ orders with spx_status matching.

## Root Cause

Three values exist in the codebase:

| Source | Value | Used in |
|--------|-------|---------|
| SPX API integer mapping | `ReadyForCollection` (PascalCase) | `_SPX_STATUS_MAP` → `normalize_spx_status()` → DB |
| Frontend dropdown | `Ready For Collection` (with spaces) | `SPXOrders.jsx` constant |
| CSV import default | `Ready For Collection` | `import_spx_csv()` in `db_logger.py` |

The DB stores `"ReadyForCollection"` (from API normalization). The frontend sends `"Ready For Collection"` (from dropdown constant). Backend does exact-match comparison: `o.get("spx_status") == status`. Result: zero matches.

## Diagnosis

1. Check what DB actually stores: `SELECT DISTINCT spx_status FROM spx_self_collection_orders`
2. Compare with frontend `SPX_STATUSES` array
3. Check backend filter logic in `api_spx_orders()`

## Fix

### Frontend (SPXOrders.jsx) — correct the constant:

```jsx
// BEFORE:
const SPX_STATUSES = [
  'Ready For Collection', 'Collection Failed', ...
];
// AFTER:
const SPX_STATUSES = [
  'ReadyForCollection', 'CollectionFailed', ...
];
```

### Backend (webhook_listener.py) — add alias normalization for loose matching:

```python
_SPX_STATUS_ALIASES = {
    "ready for collection": "ReadyForCollection",
    "readyforcollection": "ReadyForCollection",
    "collection failed": "CollectionFailed",
    "collectionfailed": "CollectionFailed",
    "remind1": "Remind1",
    "remind2": "Remind2",
    "remind3": "Remind3",
    "remind4": "Remind4",
    "collected": "Collected",
    "return_outbound": "Return_Outbound",
    "return_packing": "Return_Packing",
}

# In the API endpoint:
if status:
    _normalised = _SPX_STATUS_ALIASES.get(status.lower().strip(), status)
    all_orders = [o for o in all_orders if o.get("spx_status") == _normalised]
```

### Side note — CSV import default

In `import_spx_csv()` in `db_logger.py`, the fallback default for missing status column:
```python
status = cols[11].strip() if len(cols) > 11 else "Ready For Collection"
```
Should be `"ReadyForCollection"` to match DB convention. Fixed as part of the same sweep.

## Lessons for Future Integrations

1. **All status value sources must agree on casing convention.** If the DB uses PascalCase (`ReadyForCollection`), every place that writes or filters status must use the same.
2. **Add a backward-compatible alias map** on the filter endpoint so that even if a stale client or manual API call sends the wrong format, the filter still works.
3. **After fixing status names in frontend, rebuild the bundle and delete old hashes.** The old JS still references the wrong names — if it's served from browser cache, the bug persists.
