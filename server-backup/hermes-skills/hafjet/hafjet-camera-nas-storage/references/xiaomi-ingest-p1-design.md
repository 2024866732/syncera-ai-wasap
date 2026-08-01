# Xiaomi NAS → AI CCTV ingest (Phase 1 design summary)

**Status:** Design drafted 2026-08-01; implement only after Tuan `APPROVE DESIGN XIAOMI INGEST P1`.

## Decisions locked in session

| Decision | Choice |
|----------|--------|
| Coupling to `cctv-worker` | **A — separate service** (no in-process watcher) |
| Phase 1 AI | **Metadata + thumbnail only** (person detection = Phase 2) |
| Stack | Python, watchdog, FastAPI, SQLite, system ffprobe/ffmpeg |
| API | `127.0.0.1:8092` |
| DB | `/mnt/cctv/db/xiaomi_ingest.db` — **not** `cctv_events.db` |
| Source | `/mnt/cctv/xiaomi-nas/recordings` |
| Media layout | `/mnt/cctv/xiaomi/{incoming,archive,thumbs,json,failed}` |

## Pipeline P1

1. Stability gate (size/mtime unchanged ≥ ~45s; ignore `*.tmp`/partials)  
2. Claim → `incoming/`  
3. ffprobe metadata  
4. ffmpeg single-frame thumb  
5. JSON side-car  
6. Archive under `archive/YYYY/MM/DD/`  
7. SQLite `videos` row  
8. Dashboard/API list + timeline (events empty until P2)  
9. Retention dry-run then apply (raw/thumbs/json/failed days; free-disk guard)

## Hard constraints

- Do **not** restart `cctv-worker` for P1 deploy.  
- Do **not** open RTSP from ingest.  
- No wildcard deletes under `/mnt/cctv`.  
- Office PC systemd install = TTY sudo by Tuan.  
- Full design text may live under project `docs/superpowers/specs/` once copied with approval.

## Phase 2 (deferred)

- Sample frames / person DNN (reuse worker models carefully — prefer separate process still)  
- `detections` / `events` writers  
- Optional later merge/view with live worker DB — separate design gate  

## Next skill step after approval

`writing-plans` → task checklist → scaffold `~/projects/hafjet-xiaomi-ingest/`.
