# Fasa 1 Scheduler Install + Manual Batch Test — Session Log (2026-08-04, Approve 3)

Live-state snapshot after "approve 3" install attempt. Useful when resuming the Fasa 1
rollout or re-running the manual batch test.

## Components installed (paths verified live)
| Host | File/Entry | Purpose |
|------|-----------|---------|
| Office PC | `/home/hafizi145/cctv-analysis/pick_clips.py` | query Frigate DB `label='person'` window (env `CCTV_WINDOW_MIN`, default 120), prints clip paths |
| Office PC | `/home/hafizi145/cctv-analysis/offload_push.sh` | cap via `CCTV_MAX_CLIPS`, rsync `-R` push to RTX staging |
| Office PC | crontab user: `17 * * * * /home/hafizi145/cctv-analysis/offload_push.sh >/dev/null 2>&1` | hourly push (minute 17) |
| RTX | `/home/hafjet/cctv-analysis/cctv_analyze.py` | YOLOv8n stream=True per clip, JSON sidecar → `~/cctv-analysis/results/`, move clip → `processed/` |
| RTX | `/home/hafjet/cctv-analysis/run_batch.sh` | circuit-breaker check (temp/VRAM via `/usr/lib/wsl/lib/nvidia-smi`) then run analyze |
| RTX | crontab user: `23 * * * * /home/hafjet/cctv-analysis/run_batch.sh >/dev/null 2>&1` | hourly analyze (minute 23, 6 min after push) |
| Windows | Task Scheduler `WSL2-CCTV-Services` (NOT YET created — blocked) | onstart: `wsl.exe -d Ubuntu -u root sh -c 'service ssh start; service cron start'` |

Dirs: office `/mnt/cctv/logs/` (push log), RTX `~/cctv-analysis/{staging,results,processed,logs}`.

## Frigate DB path (corrected during approve-3)
`/home/hafizi145/frigate/config/frigate.db` — the earlier `/mnt/cctv/frigate/config/frigate.db`
is wrong. Confirm mounts: `docker inspect frigate --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`.

## Volume discovery + cap/overflow decision (FINAL, after approve-3)
- Frigate produces **~1365 person clips per 120-min window** (~682/hr, 2 cameras) — near-continuous segments, NOT rare events.
- **Cap: `CCTV_MAX_CLIPS` default = 50 per batch**, enforced IN `offload_push.sh` (`DEFAULT_MAX="${CCTV_MAX_CLIPS:-50}"`). `pick_clips.py` still SELECTS all clips in the window (full list to `clips_to_push.txt`); the cap is applied at push time only.
- **Overflow (>50) = DEFER to next batch** (NOT skip/delete). Clips stay untouched on the office recordings tree and `pick_clips.py` re-selects them next hour while still inside the 120-min window. Documented in runbook §6a.
- Log line: `[STAMP] cap: selected=N limit=50 deferred=M`.
- **Backlog is accepted for Fasa 1** — volume (~682/hr) far exceeds cap (50/hr); batches always pick oldest-first. This is intentional measurement phase, not a defect. Revisit window size / cap / confidence filter before Fasa 2.
- Enforcement map: `pick_clips.py` selects-all → `offload_push.sh` CAPS → `run_batch.sh` circuit-breaker.

## Bugs hit during manual batch test (approve 3)
1. **pick_clips.py DB path wrong** → `DB_ERR unable to open database file`. Fixed to `~/frigate/config/frigate.db`.
2. **rsync `change_dir#3 failed` (code 3)** on every clip — dest subdir missing. Fixed with `cd` + `--relative`.
3. **1383 clips selected in a 2h window** → push loop never finished (120s timeout). Person-only is NOT small; must cap (`CCTV_MAX_CLIPS`). For smoke test use ~3-5.
4. **schtasks.exe from WSL2 → `ERROR: Access is denied`** — Task Scheduler needs Windows admin; Tuan creates it manually.
5. **Kill/pkill of a stuck push process requires approval** — a long push loop can outlive a 120s terminal timeout; ask Tuan before killing, or start with small cap so it finishes.

## Manual batch test — COMPLETED (2026-08-04, approve 3, verified green)

Ran to completion with `CCTV_MAX_CLIPS=5`:
- Office push: RC=0, `pushed=5` (outdoor_shop clips `00.07..00.46`), log `/mnt/cctv/logs/cctv-offload-push.log`.
- RTX `run_batch.sh`: RC=0, cb_check `temp=51C vram=1218MiB`, yolov8n.pt auto-downloaded.
- Sidecar JSONs: 6 files under `~/cctv-analysis/results/` (5 clips + old `test.mp4`), schema verified (clip_id, camera, model, device, frames, gpu_infer_ms, gpu_mem_mb, detections[], summary, status).
- Staging drained to 0 (all moved to `processed/`), **NO `.circuit_breaker`**, GPU 51°C.
- Measured per 200-frame clip: ~3.4-3.5 ms/frame, **hundreds of person detections** (311-416 per clip) — normal for person-event clips at YOLOv8n's default conf 0.25; don't treat high counts as anomalies.

Remaining: Task Scheduler `WSL2-CCTV-Services` on Windows (admin only — see bugs #4).

## Resume checklist (next session)
1. Verify RTX reachable: `ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 'echo RTX_SSH_OK'`
2. If needed, Tuan creates Task Scheduler entry (admin PowerShell):
   `schtasks /create /tn "WSL2-CCTV-Services" /tr "wsl.exe -d Ubuntu -u root sh -c 'service ssh start; service cron start'" /sc onstart /ru SYSTEM /rl highest /f`
3. Smoke test ALREADY PASSED — do not re-run unless something changed. If re-pushing scripts, rename to match cron refs (see SKILL.md pitfall on scp basename).
4. Confirm sidecar JSON exists in RTX `~/cctv-analysis/results/`, no `.circuit_breaker`, logs written.
5. STOP — report checkpoint. No automatic monitoring / result push-back until Tuan approves.
