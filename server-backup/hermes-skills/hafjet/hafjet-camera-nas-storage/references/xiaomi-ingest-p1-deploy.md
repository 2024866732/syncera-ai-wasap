# Xiaomi ingest P1 — deploy notes (2026-08)

## Status
- Design: **APPROVED**
- Samba NAS Xiaomi: **WORKING** on PC Office (`192.168.1.252`, share `xiaomi-nas`, user `smbcam`)
- Ingest service: code scaffold on VPS; PC rsync/venv/systemd may still be pending approval gates

## Paths
| Role | Path |
|------|------|
| VPS source tree | `/home/hafizi145/.hermes/cache/documents/xiaomi-ingest/` |
| PC target | `~/projects/hafjet-xiaomi-ingest` |
| Drop zone | `/mnt/cctv/xiaomi-nas/recordings` |
| Work root | `/mnt/cctv/xiaomi/{incoming,archive,thumbs,json,failed}` |
| DB | `/mnt/cctv/db/xiaomi_ingest.db` |
| API | `127.0.0.1:8092` |
| Live worker | `127.0.0.1:8091` — do not restart |

## Modules (P1)
`app/config.py`, `store.py`, `probe.py` (ffprobe/ffmpeg), `watcher.py` (poll+stable+claim), `retention.py` (default dry-run), `api_routes.py`, `main.py`

## ACL for ingest claim
`smbcam` writes dumps; ingest runs as `hafizi145` and must move files out of `recordings/`:
- `setfacl -m u:hafizi145:rwx` + default ACL on `recordings/`
- Keep existing `smbcam:--x` traverse on `/mnt/cctv` from Samba writable fix

## Verify checklist
1. `curl -s http://127.0.0.1:8092/health` → watcher_alive, phase=1, ai=deferred
2. `curl -s http://127.0.0.1:8091/health` → still ok; note PID before/after deploy
3. Drop finished mp4 → after STABLE_SECONDS → row in `/api/videos` + thumb on `/dashboard`
4. Growing file must **not** ingest mid-write

## Explicit non-goals P1
No person/face DNN, no writes to `cctv_events.db`, no merge dashboards with worker UI.