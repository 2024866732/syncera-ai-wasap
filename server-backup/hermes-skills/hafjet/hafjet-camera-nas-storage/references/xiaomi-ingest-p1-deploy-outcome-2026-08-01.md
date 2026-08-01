# Xiaomi Ingest P1 Deploy Outcome — 2026-08-01

**Session:** 2026-08-01 (Tuan Hafizi + Hermes)
**Target:** hafjet-pc-office (100.121.94.41)
**Source scaffold:** `~/.hermes/cache/documents/xiaomi-ingest/`
**Destination:** `~/projects/hafjet-xiaomi-ingest/`

## Deploy Scope (P1 — Metadata + Thumbnail Only)

| Item | Value |
|------|-------|
| Service | `hafjet-xiaomi-ingest` (separate from cctv-worker) |
| Port | `127.0.0.1:8092` |
| DB | `/mnt/cctv/db/xiaomi_ingest.db` |
| Recordings source | `/mnt/cctv/xiaomi-nas/recordings` (SMB drop by `smbcam`) |
| Phase | 1 — metadata + thumbnail; AI/DNN deferred |
| Systemd | NOT installed (separate approval) |
| cctv-worker | MUST remain unchanged |

## Deploy Steps Executed

### 1. Rsync (✅ OK)
```bash
rsync -az --delete --exclude '.venv' --exclude '__pycache__' --exclude '.env' \
  /home/hafizi145/.hermes/cache/documents/xiaomi-ingest/ \
  hafizi145@100.121.94.41:projects/hafjet-xiaomi-ingest/
```
Result: `RSYNC_SUCCESS`

### 2. ACL Fix — Partial (⚠️ Blocker)
- `mkdir/chown` directories: OK (owned by hafizi145)
- `setfacl` on `/mnt/cctv/xiaomi-nas/recordings` (owned by `smbcam:smbcam`): **FAILED** — "Operation not permitted" (requires sudo TTY)
- **Workaround**: Used `/mnt/cctv/xiaomi/test-drop` (owned by hafizi145) for smoke test — WRITE OK
- **Production ACL**: Tuan ran manual `sudo fix_acl.sh` on PC TTY — completed after deploy

### 3. Venv + Requirements + Compile + Tests (✅ OK)
- `python3 -m venv .venv` — OK
- `pip install -r requirements.txt` — OK (watchdog, fastapi, uvicorn, python-dotenv)
- `python -m compileall app` — OK
- `python -m unittest discover -s tests -v` — **4 tests OK**

### 4. Foreground Smoke Test (✅ OK)
```bash
cd ~/projects/hafjet-xiaomi-ingest && . .venv/bin/activate && python -m app.main
```
- Bind: `127.0.0.1:8092` — LISTEN confirmed
- Phase: 1, AI: deferred, watcher_alive: true
- Recordings dir: `/mnt/cctv/xiaomi/test-drop` (smoke test path)

### 5. Background Restart + Production Path Cutover
After Tuan confirmed "ACL done":
1. Updated `.env`: `XIAOMI_RECORDINGS_DIR=/mnt/cctv/xiaomi-nas/recordings`
2. Restarted ingest only (`pkill -f "python -m app.main"` — **CRITICAL ERROR: also killed cctv-worker**)
3. Restarted xiaomi-ingest on :8092 — healthy
4. **cctv-worker killed inadvertently** — required manual `sudo systemctl restart cctv-worker` by Tuan

## Health Verification (Post-Cutover)

| Service | Port | Status | Key Metrics |
|---------|------|--------|-------------|
| xiaomi-ingest | 8092 | ✅ RUNNING | phase=1, watcher_alive=true, recordings_dir=/mnt/cctv/xiaomi-nas/recordings |
| cctv-worker | 8091 | ✅ RUNNING (after manual restart) | PID changed, health=ok, MemoryCurrent ~570 MB |

## Sample Ingest Verification (✅ OK)
```json
{
  "count": 1,
  "videos": [{
    "id": "af2b6066638149e7ba600a6034272983",
    "original_name": "sample_xiaomi_test.mp4",
    "duration_s": 10.03,
    "width": 320,
    "height": 176,
    "codec": "h264",
    "status": "ingested",
    "thumb_path": "xiaomi/thumbs/2026/08/01/af2b6066638149e7ba600a6034272983.jpg",
    "json_path": "xiaomi/json/2026/08/01/af2b6066638149e7ba600a6034272983.json",
    "time": { "utc": "2026-08-01 07:57:22 UTC", "myt": "2026-08-01 15:57:22 MYT" }
  }]
}
```

## Critical Incident: Shared Entry Point `pkill` Pitfall

**What happened**: `pkill -f "python -m app.main"` matched **both** services:
- cctv-worker (systemd): `/home/hafizi145/projects/hafjet-cctv-worker/.venv/bin/python -m app.main`
- xiaomi-ingest: `/home/hafizi145/projects/hafjet-xiaomi-ingest/.venv/bin/python -m app.main`

**Result**: cctv-worker killed (inactive at 09:07:35 UTC). Required Tuan to run `sudo systemctl restart cctv-worker` manually.

**Prevention added to skills**:
- `cctv-worker-operations` → SKILL.md (Critical Pitfall section)
- `cctv-worker-operations` → `references/shared-entry-point-pkill-pitfall.md`
- `hafjet-camera-nas-storage` → P1 Deploy Verification Checklist includes PID verification

**Correct restart patterns**:
```bash
# cctv-worker (systemd) — ONLY this:
sudo systemctl restart cctv-worker

# xiaomi-ingest — use PID file or $!:
cd ~/projects/hafjet-xiaomi-ingest && . .venv/bin/activate
nohup python -m app.main > /mnt/cctv/logs/xiaomi-ingest.log 2>&1 &
echo $! > /tmp/xiaomi-ingest.pid
# later:
kill $(cat /tmp/xiaomi-ingest.pid)
```

## Blocker Summary

| Blocker | Status | Resolution |
|---------|--------|------------|
| ACL on smbcam-owned `recordings/` | ⚠️ Manual required | Tuan ran `fix_acl.sh` on PC TTY with sudo |
| No sudoers for automated ACL | Deferred | Manual TTY only for now |
| Shared entry point pkill | ❌ Incident | Prevention rules documented; must use PID-specific kills |

## Next Steps (Require Separate Approval)

1. **Systemd service** for xiaomi-ingest (auto-start, restart policy)
2. **Production ACL** sudoers entry for automated `fix_acl.sh` (if desired)
3. **Phase 2** — AI/DNN pipeline (person/face on ingested files)
4. **Tapo C560WS integration** — RTSP enable + Camera Account + LAN IP (separate multi-cam architecture gate)

## Files Created/Updated

- `/home/hafizi145/.hermes/cache/documents/cctv-malaysia-camera-recommendation-2026-08-01.txt`
- `/home/hafizi145/.hermes/cache/documents/cctv-tapo-c560ws-capability-brief-2026-08-01.txt`
- `/home/hafizi145/.hermes/cache/documents/cctv-ezviz-cs-c6n-capability-brief-2026-08-01.txt`
- Skill `cctv-worker-operations` — patched with Critical Pitfall + P1 Checklist
- Skill `cctv-worker-operations` — added `references/shared-entry-point-pkill-pitfall.md`
- Skill `hafjet-camera-nas-storage` — already has P1 Deploy Verification Checklist