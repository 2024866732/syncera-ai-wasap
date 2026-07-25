# FastAPI Route Ordering Pitfall

## Symptom
A literal route like `GET /api/events/csv` returns the wrong handler output (e.g. `{"error":"event not found"}`) or `null` instead of CSV data. The route is defined correctly but another route hijacks it.

## Root cause
FastAPI evaluates routes in **registration order**. If a parameterized route is registered BEFORE a literal route with the same prefix, FastAPI matches the parameterized one first:

```python
# ❌ WRONG ORDER — /api/events/{event_id} registered FIRST
@router.get("/api/events/{event_id}")     # line 77 — matches "csv" as event_id!
async def get_event(event_id: str): ...

@router.get("/api/events/csv")            # line 276 — NEVER REACHED
async def export_csv(...): ...

# ✅ CORRECT ORDER — literal BEFORE parameterized
@router.get("/api/events/csv")            # line 77 — matched first
async def export_csv(...): ...

@router.get("/api/events/{event_id}")     # line 86 — matched after literal check
async def get_event(event_id: str): ...
```

## Detection
```bash
# Check route registration order
grep -n "router.get.*events" app/api/routes.py
# Should show: list → csv → {event_id} → {event_id}/snapshot
```

## Recovery pattern
1. Identify the literal and parameterized routes with overlapping prefixes
2. Write a Python script that extracts the literal route block, removes it, and inserts it BEFORE the parameterized route
3. Verify: `curl -s http://host:port/api/events/csv` returns CSV content, not JSON error

## See also
- Systemd `StandardOutput=append:` pitfall in `self-hosted-deployment/SKILL.md`
- Remote patch pattern: `write script locally → scp → python3 script.py` to avoid SSH escaping nightmares
