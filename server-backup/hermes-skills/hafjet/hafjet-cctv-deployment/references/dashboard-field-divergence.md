# Dashboard Field-Divergence Triage

Use this only for a **single exact event ID/timestamp**. A visible crop is not enough to prove that the dashboard, API, and database are discussing the same row.

## Read-only evidence chain

1. Capture the exact event ID and UTC timestamp from the dashboard card/DOM.
2. Query the raw SQLite record for that ID.
3. Fetch `/api/events` and isolate the same ID.
4. Fetch the server-rendered dashboard HTML and isolate the matching card by timestamp, snapshot filename, or event ID context.
5. Inspect the storage helper used by the dashboard/date-filter route separately from the helper used by the JSON API. Check both selected-column order and positional row-to-dict indices.

## Classification

| DB | API | Server HTML | Likely boundary |
|---|---|---|---|
| null | null | em dash | D.6 write/call path or absent inference |
| populated | null | em dash | API storage query/serializer mapping |
| populated | populated | em dash | dashboard-specific query mapping/template context; **not browser cache** |
| populated | populated | correct value | browser cache/client rendering or a different visible event |

## Evidence discipline

- `curl` proves server output only. It cannot prove desktop/mobile layout or a browser cache state.
- Do not restart to diagnose a field divergence. It changes process state and can hide the original condition.
- If dashboard HTML and API differ, investigate code/path mapping before proposing a template/CSS patch.
