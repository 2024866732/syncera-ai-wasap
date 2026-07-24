# Dashboard & Alert Logging — CCTV Worker Extensions

Added to the CCTV worker v0.1 (July 2026) after baseline detection was stable.

## Architecture

```
Event created (main.py)
  ├── ev.write_alert()    → /tmp/cctv-alerts.log  (Layer 1, implemented)
  └── DB insert           → existing pipeline
                          → /dashboard             (new route)
                          → /snapshots/{filename}  (new route)
```

## Alert log (Layer 1 — implemented)

**Location:** `/tmp/cctv-alerts.log`

**Format per line:**
```
TIMESTAMP | EVENT_ID | CAMERA_ID | CONFIDENCE | SNAPSHOT_PATH
```

**Rotation:** When file exceeds 10 MB, rename to `cctv-alerts.log.old` (overwrite) and start fresh.

**Implementation — `app/storage/events.py`:**
```python
from pathlib import Path
from datetime import datetime, timezone

ALERT_LOG = Path('/tmp/cctv-alerts.log')
ALERT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB

def write_alert(event_id: str, camera_name: str, confidence: float,
                snapshot_path: str | None) -> None:
    try:
        if ALERT_LOG.exists() and ALERT_LOG.stat().st_size >= ALERT_MAX_BYTES:
            backup = ALERT_LOG.with_suffix('.log.old')
            ALERT_LOG.rename(backup)
        ts = datetime.now(timezone.utc).isoformat(timespec='milliseconds')
        snap = snapshot_path or '-'
        line = f"{ts} | {event_id} | {camera_name} | {confidence:.4f} | {snap}\n"
        with open(str(ALERT_LOG), 'a') as f:
            f.write(line)
    except Exception:
        logger.exception('Failed to write alert')
```

**Integration — `app/main.py`** (called after `insert_event`):
```python
event_id = ev.insert_event(...)
ev.write_alert(event_id, camera_name, best['confidence'], snap_rel)
_mark_event()
```

## Dashboard route (`GET /dashboard`)

**Route:** `GET /dashboard?limit=20`

**Returns:** HTML page with dark theme, showing the most recent N `person_detected` events in a table with snapshot thumbnails. Filters out non-person events so the dashboard stays focused on the primary use case.

**Key refinements (July 2026):**
- Filter events to `person_detected` only (`event_type` field check)
- Show a count line: `"Showing X recent person_detected event(s)"`
- Snapshot thumbnails served via `/snapshots/{filename}` route

**Implementation — `app/api/routes.py`:**
```python
from fastapi.responses import HTMLResponse

@router.get("/dashboard")
async def dashboard(limit: int = 20):
    if db_conn is None:
        return HTMLResponse("<h1>Database not connected</h1>", status_code=503)
    try:
        events = ev.get_recent_events(db_conn, limit=limit)
    except Exception as exc:
        return HTMLResponse(f"<h1>Error</h1><p>{exc}</p>", status_code=500)

    # Filter to person_detected only
    events = [e for e in events if e.get("event_type", "") == "person_detected"]
    total = len(events)

    rows = ""
    for e in events:
        ts = e.get("occurred_at", "-")
        cam = e.get("camera_name", "-")
        conf = e.get("confidence", 0)
        snap = e.get("snapshot_path", "")
        eid = e.get("id", "")
        if snap:
            fname = Path(snap).name
            img = f"<a href='/snapshots/{fname}'><img src='/snapshots/{fname}' width='160' alt='snapshot'></a>"
        else:
            img = "-"
        rows += f"<tr><td>{ts}</td><td>{cam}</td><td>{conf:.4f}</td><td>{img}</td>...</tr>\\n"

    count_line = f"<p style='color:#aaa'>Showing {total} recent person_detected event(s)</p>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HAFJET CCTV — Dashboard</title>
<style>
  body {{ font-family: sans-serif; margin: 20px; background: #111; color: #eee; }}
  h1 {{ color: #0f0; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #333; padding: 8px; text-align: left; }}
  th {{ background: #222; }}
  tr:nth-child(even) {{ background: #1a1a1a; }}
  img {{ border-radius: 4px; }}
  a {{ color: #4af; }}
</style></head>
<body>
<h1>📈 HAFJET CCTV — Recent Events</h1>
{count_line}
<a href="/health">/health</a> | <a href="/api/events">/api/events</a>
<table><thead><tr><th>Timestamp</th><th>Camera</th><th>Confidence</th><th>Snapshot</th><th>Event ID</th></tr></thead>
<tbody>{rows}</tbody></table></body></html>"""
    return HTMLResponse(html)
```

## Snapshot serving route (`GET /snapshots/{filename}`)

**Route:** `GET /snapshots/{filename}`

**Returns:** JPEG image directly from `/mnt/cctv/snapshots/`. Read-only, path-traversal protected.

```python
@router.get("/snapshots/{filename}")
async def serve_snapshot(filename: str):
    snap_dir = config.SNAPSHOT_DIR
    full_path = snap_dir / filename
    try:
        full_path.relative_to(snap_dir)  # path traversal guard
    except ValueError:
        return JSONResponse({"error": "invalid path"}, status_code=400)
    if not full_path.exists() or not full_path.is_file():
        return JSONResponse({"error": "snapshot not found"}, status_code=404)
    return FileResponse(str(full_path), media_type="image/jpeg")
```

## Safety constraints for dashboard/snapshot routes

- No authentication/authorisation (LAN-only in v0.1)
- No DELETE, PUT, POST — GET only
- Path traversal protection via `relative_to()` check
- Snapshot serving reads from `/mnt/cctv/snapshots/` only — no access to DB, config, or other paths
- Dashboard never exposes RTSP URL, passwords, or credentials

## Future layers (not yet implemented)

| Layer | Channel | Status |
|-------|---------|--------|
| Layer 1 | `/tmp/cctv-alerts.log` | ✅ Implemented |
| Layer 2 | JSON file (`/mnt/cctv/alerts/events.json`) | ✅ Implemented |
| Layer 3 | External (WhatsApp, Telegram, email) | 🔒 Requires explicit approval |

---

## Layer 2 — JSON alerts (`/mnt/cctv/alerts/events.json`)

**Approved design (July 2026) — implemented.**

### Architecture

This piggybacks on the detection loop: after `insert_event()` writes to SQLite,
`write_json_alert()` is called to append the same event to a human-readable
JSON file under `/mnt/cctv/alerts/events.json`.

### Append-only strategy

Rather than re-reading and rewriting the entire file on every event (which
would cause O(N²) I/O over time), the implementation uses a **seek-truncate-append**
approach that only touches the last few bytes of the file:

1. Open file in `r+b` mode
2. Seek 2 bytes before EOF (expecting `]}`)
3. If the tail matches `]}`, truncate (remove them), write `,\n  {new_entry}\n]}`
4. This adds the new entry without parsing or rewriting the full file

This is truly append-only — the file content before the last `]}` is never
touched or moved.

### Size guard

If the file exceeds **5 MB**, `write_json_alert()` silently stops writing new
entries and logs a single warning. The file remains readable; no automatic
deletion or rotation occurs. The guard prevents unbounded storage growth while
preserving historical data.

### Implementation — `app/storage/events.py`

```python
from pathlib import Path
import json

JSON_ALERTS_DIR = Path('/mnt/cctv/alerts')
JSON_ALERTS_FILE = JSON_ALERTS_DIR / 'events.json'
JSON_ALERTS_MAX_BYTES = 5 * 1024 * 1024  # 5 MB

def write_json_alert(event_id, camera_name, confidence, snapshot_path, occurred_at):
    JSON_ALERTS_DIR.mkdir(parents=True, exist_ok=True)

    # Size guard
    if JSON_ALERTS_FILE.exists() and JSON_ALERTS_FILE.stat().st_size >= JSON_ALERTS_MAX_BYTES:
        logger.warning('events.json >5 MB — stopping JSON alert writes')
        return

    entry = {
        'timestamp': occurred_at,
        'event_id': event_id,
        'camera_id': camera_name,
        'confidence': round(confidence, 4),
        'snapshot_path': snapshot_path or '',
    }

    if not JSON_ALERTS_FILE.exists():
        # First event — create file with array
        with open(str(JSON_ALERTS_FILE), 'w') as f:
            json.dump({'alerts': [entry]}, f, indent=2)
        return

    # Append-only: replace trailing ']}' with ',' + new entry + ']}'
    entry_line = ',\n  ' + json.dumps(entry)
    with open(str(JSON_ALERTS_FILE), 'r+b') as f:
        f.seek(-2, 2)
        tail = f.read()
        if tail == b']}':
            f.seek(-2, 2)
            f.truncate()
            f.write(entry_line.encode() + b'\n]}')
        else:
            # Malformed — full re-read fallback
            f.seek(0)
            try:
                data = json.loads(f.read().decode())
            except json.JSONDecodeError:
                data = {'alerts': []}
            data.setdefault('alerts', []).append(entry)
            with open(str(JSON_ALERTS_FILE), 'w') as fw:
                json.dump(data, fw, indent=2)
```

### Example output

```json
{
  "alerts": [
    {
      "timestamp": "2026-07-24T03:35:24.517+00:00",
      "event_id": "2026-07-24T03:35:24.517+00:00-entrance-551142",
      "camera_id": "entrance",
      "confidence": 0.5138,
      "snapshot_path": "snapshots/entrance_2026-07-24T03-35-24.517+00-00.jpg"
    }
  ]
}
```
