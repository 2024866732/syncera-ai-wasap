# Face Crop Media Serving and Gallery Verification

## Storage and route split

- Full event snapshots live in `config.SNAPSHOT_DIR` → `/mnt/cctv/snapshots/` and are served only by `GET /snapshots/{filename}`.
- D.5 face crops live in `config.DATA_DIR / "faces"` → `/mnt/cctv/faces/` and must be served only by `GET /faces/{filename}`.
- Never generate a face-crop URL under `/snapshots/`; that returns a valid-looking but incorrect 404 because the filename is looked up in the full-snapshot directory.

## Required handler properties

`GET /faces/{filename}` must:
1. Resolve only under `config.DATA_DIR / "faces"`.
2. Reject traversal using `full_path.relative_to(face_dir)`.
3. Return JSON 400 for invalid traversal and JSON 404 for a missing crop.
4. Return `FileResponse(..., media_type="image/jpeg")` for an existing crop.
5. Remain read-only; never expose the storage parent or permit deletion.

## Gallery and Event List rendering contract

For an event with `face_snapshot_path`:
- Event List face anchor and image use `/faces/{Path(face_snapshot_path).name}`.
- Face Gallery anchor and image use `/faces/{Path(face_snapshot_path).name}`.
- Full event snapshot remains `/snapshots/{Path(snapshot_path).name}`.

## Verification procedure

Do this before claiming the gallery visually works:

```bash
# Obtain one real crop path from SQLite without modifying DB.
python3 - <<'PY'
import sqlite3
c = sqlite3.connect('file:/mnt/cctv/db/cctv_events.db?mode=ro', uri=True)
print(c.execute('''
 SELECT face_snapshot_path FROM camera_events
 WHERE face_snapshot_path IS NOT NULL AND face_snapshot_path != ''
 ORDER BY occurred_at DESC LIMIT 1
''').fetchone()[0])
PY

# GET, not HEAD: the application route is GET-only, so curl -I yields 405.
curl -sS -o /dev/null -w 'HTTP=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
  "http://127.0.0.1:8091/faces/<basename>"
```

Expected: `HTTP=200`, `type=image/jpeg`, non-zero bytes.

Control test: a real full snapshot must still return 200 through `/snapshots/<basename>`.

## Remote access boundary

The API is deliberately bound to `127.0.0.1:8091`. A direct request to the machine Tailscale IP on port 8091 is expected to fail and is **not** a reason to bind it publicly. Remote browser access must use the approved SSH/Tailscale tunnel. The tunnel preserves the same server-side route behaviour, so test face GET on localhost first.

## Visual closure gate

HTML class/URL inspection is not visual proof. Before closing dashboard/Face Gallery work, obtain real rendered screenshots at desktop, tablet, and phone widths. Confirm actual face images load, there is no overflow, and mobile overlays remain visible without hover.
