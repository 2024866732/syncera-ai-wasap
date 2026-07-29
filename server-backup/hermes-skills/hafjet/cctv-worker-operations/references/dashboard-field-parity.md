# Dashboard field-parity diagnostic pattern

## Symptom

A direct database query and JSON endpoint contain a field such as `gender` or `age_range`, while the server-rendered dashboard displays a default placeholder.

## Evidence chain

Use one exact event ID/timestamp:

| Layer | Evidence to collect |
|---|---|
| DB | Raw selected columns and tuple order, using a read-only connection |
| API | The returned object for the same ID |
| HTML | Raw server output surrounding the same event timestamp/crop URL |
| Route | The function called by the dashboard route |
| Storage | SQL SELECT columns, tuple indexes, returned dict keys |

## Common failure

The API and dashboard use different data-access functions. One function selects/marshals new fields; the other omits them. A template pattern like `e.get("gender") or "—"` correctly renders its fallback because the field was never placed in the dashboard object.

## Minimal patch rules

1. Add missing columns to only the affected query.
2. Add corresponding dict keys.
3. Move later positional indexes exactly once (especially `created_at`).
4. Keep function signature, filters, sort, limits, and old keys intact.
5. Verify exact record parity DB -> API -> raw HTML before a separately-approved process reload.

## Do not misdiagnose

- If raw HTML already has the placeholder, it is not a browser-cache-only bug.
- If API is correct, do not assume the dashboard has the same query path.
- Do not restart merely to collect this evidence.
