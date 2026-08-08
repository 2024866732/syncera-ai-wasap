---
name: hafjet-camera-nas-storage
description: "Use when IP cameras need SMB/NAS dump (Xiaomi/Oray/Samba) or Xiaomi recording ingest beside the RTSP worker."
---

# HAFJET Camera NAS Storage

## Overview

IP cameras that dump clips to “NAS” almost always mean **SMB on the same LAN**, not cloud VPN mesh. Keep this path separate from the HAFJET **Tapo RTSP AI worker** (`hafjet-cctv-deployment` on `/mnt/cctv` worker trees).

**Chat style for Tuan Hafizi:** long runbooks = Telegram MEDIA `.txt` only; chat ≤3 lines `STEP/ACTION/NEED`. Never paste multi-page Samba configs inline.

## When to use

- Xiaomi / Mi Home: Settings → Manage storage → NAS network storage
- Oray / 蒲公英 / Pgybox X1 “private cloud” USB file share as camera target
- Samba on `hafjet-pc-office` as temporary or permanent SMB NAS
- Camera finds hosts but not Ubuntu share, auth OK but **not readable/writable**, or only SMB1 works
- Planning **file ingest** of Xiaomi dumps into AI CCTV (separate service — see below)

## Architecture decision

| Path | Use when | Not for |
|------|----------|---------|
| **A. Samba @ PC Office** | Need working Xiaomi NAS now; large free disk on `/mnt/cctv` | Exposing 445 to WAN |
| **B. Oray X1 USB share** | X1 File Sharing shows volume + SMB | If UI says storage not detected |
| **C. True NAS / other SMB** | Dedicated appliance | Mixing with worker DB paths carelessly |
| **D. SD only** | NAS blocked | Long retention |

**Xiaomi constraints (class rules):**

1. Camera + NAS IP must share **L2/L3 LAN** (same SSID/LAN). Oray **组网** helps humans/remote clients; it does **not** replace same-LAN SMB for Mi Home NAS.
2. Many Mi models need **SMBv1 (NT1)**. If SMBv2-only, discovery often fails.
3. Turn off **AP/client isolation** / guest WiFi for cameras.
4. Prefer dedicated SMB user (e.g. `smbcam`), not interactive Linux login.
5. Mi Home often lists Windows hosts + Oraybox via discovery but **not** Ubuntu Samba — **manual IP add is normal and preferred**. Auto-discovery failure ≠ Samba down.
6. When Mi Home lists shares, pick the **data share** (e.g. `xiaomi-nas`). Never pick **`IPC$`** (admin/inter-process share — will fail camera dump).

## Default HAFJET layout (PC Office)

- LAN IP (typical): `192.168.1.252` (`enp1s0`)
- Share path: `/mnt/cctv/xiaomi-nas` (sibling to worker data; **not** `snapshots/` or `faces/`)
- Share name: `xiaomi-nas`
- Subfolder: `recordings` (⚠️ documented share subfolder — but cameras ACTUALLY write to `xiaomi_camera_videos/{device_id}/{YYYYMMDDHH}/`; see "Live camera dump layout" below. `recordings/` stays empty in production.)
- User: `smbcam`
- Setup script: `scripts/hafjet-xiaomi-samba-pc-office-setup.sh`
- Writable/ACL fix: `scripts/hafjet-xiaomi-samba-fix-writable.sh`
- Runbook: `references/xiaomi-mihome-nas-smb.md`
- Path ACL diagnosis: `references/samba-path-acl-writable-fix.md`
- Oray USB failure / RMA: `references/oray-x1-usb-not-detected.md`
- Comet dashboard prompt: `references/comet-pgybox-xiaomi-prompt.md`
- Ingest P1 design: `references/xiaomi-ingest-p1-design.md`
- Ingest P1 deploy: `references/xiaomi-ingest-p1-deploy.md`
- Session outcomes 2026-08-01: `references/session-2026-08-01-xiaomi-nas-outcomes.md`

## Workflow

1. Confirm goal = **camera dump NAS**, not RTSP worker storage.
2. Prefer **Alt-A Samba** if Oray USB undetected or unproven.
3. PC Office **sudo needs TTY** — stage script on host; Tuan runs interactively (`hafjet-command-safety`).
4. **Do not** restart `cctv-worker` for Samba install.
5. After `smbd` up: verify with `namei -l` that **every path component** to the share is traversable by `smbcam` (see ACL pitfall).
6. Mi Home: **Add manually** if Ubuntu not in list — IP/share/user/pass/SMB; choose `xiaomi-nas` then `recordings` (not `IPC$`, not bare Oraybox without volume).
7. Verify: `systemctl is-active smbd`, port 445, camera dump creates files under `recordings/`.
8. Oray RMA can proceed in parallel; Samba does not block RMA.

## Critical pitfall — parent path mode (learned 2026-08-01)

Putting the share under `/mnt/cctv/xiaomi-nas` while `/mnt/cctv` is **`drwxr-x--- hafizi145:hafizi145` (750)** makes Samba `force user = smbcam` **unable to traverse** the path.

Mi Home error (verbatim class):

> Couldn't set / Make sure the selected folder is readable and writable

**Fix (do not chmod 777 the whole CCTV tree):**

```bash
# Preferred: traverse-only ACL on parent
sudo setfacl -m u:smbcam:--x /mnt/cctv
sudo chown -R smbcam:smbcam /mnt/cctv/xiaomi-nas
sudo chmod 775 /mnt/cctv/xiaomi-nas /mnt/cctv/xiaomi-nas/recordings
# Prove as smbcam:
sudo -u smbcam test -x /mnt/cctv && sudo -u smbcam touch /mnt/cctv/xiaomi-nas/recordings/.write_test
```

Diagnose with `namei -l /mnt/cctv/xiaomi-nas/recordings` before blaming Mi Home UI. Full notes: `references/samba-path-acl-writable-fix.md`. Script: `scripts/hafjet-xiaomi-samba-fix-writable.sh`.

**Ingest process as `hafizi145` later** also needs rwx on `recordings/` (ACL both ways or group). Plan before enabling watcher moves.

## Mi Home form template

```
Protocol: SMB
IP: 192.168.1.252
Port: 445
Share: xiaomi-nas          # NOT IPC$
User / Pass: smbcam / <smbpasswd>
Folder: recordings
```

## AI CCTV integration (ingest) — class rule

Xiaomi dumps ≠ live RTSP loop. **Do not** bolt a folder watcher into `cctv-worker` (RSS/restart coupling).

**Design APPROVED 2026-08-01** (`APPROVE DESIGN XIAOMI INGEST P1`). Tuan locked: separate service; P1 metadata+thumb only; DNN deferred; no cctv-worker restart/modify; source `/mnt/cctv/xiaomi-nas/recordings`.

| Item | Phase 1 | Phase 2 |
|------|---------|---------|
| Service | Separate `hafjet-xiaomi-ingest` | same |
| API port | `127.0.0.1:8092` | + AI routes |
| DB | `/mnt/cctv/db/xiaomi_ingest.db` (not `cctv_events.db`) | optional unify later |
| Work | stable file detect, move, ffprobe, thumb, JSON, dashboard, retention | person/face pipeline |
| Worker | **never restart** for P1 deploy | separate approval |

**Code / deploy location:**  
VPS scaffold `~/.hermes/cache/documents/xiaomi-ingest/` → PC `~/projects/hafjet-xiaomi-ingest`.  
Deploy runbook: `references/xiaomi-ingest-p1-deploy.md`. Design: `references/xiaomi-ingest-p1-design.md`.  
Session deploy report pattern: `references/xiaomi-ingest-p1-deploy-report-template.md`.

**Deploy sequence (class):**
1. Capture `cctv-worker` MainPID + `:8091/health` **before** any work
2. rsync tree to PC (exclude `.venv`, exclude live `.env` overwrite)
3. TTY sudo `scripts/fix_acl.sh` so `hafizi145` can claim `smbcam`-written files under `recordings/`
4. venv + `pip install -r requirements.txt` + unittest
5. Foreground `python -m app.main` (nohup OK for smoke) — prove `:8092/health` while `:8091/health` still ok / **PID unchanged**
6. systemd unit **only** after separate install approval (`systemd/xiaomi-ingest.service.example`)

**Stability gate defaults:** `STABLE_SECONDS=45`, ignore `*.tmp`/`*.part`/dotfiles, min size 64KiB, extensions mp4/mov/mkv/avi/ts.

### Deploy outcome 2026-08-01 (verified)
- rsync + 4 unit tests OK; `:8092` phase=1 ai=deferred watcher_alive
- Worker PID **unchanged** (e.g. 2474808); `:8091` still ok
- Sample mp4 ingested end-to-end on writable drop (ffprobe+thumb+`/api/videos`)
- BatchMode SSH cannot `sudo` — Tuan runs `fix_acl.sh` on PC TTY
- **ACL DONE:** `recordings` has `user:hafizi145:rwx` (+ defaults); `test -w` WRITABLE
- Post-ACL: `.env` → `XIAOMI_RECORDINGS_DIR=/mnt/cctv/xiaomi-nas/recordings`, `STABLE_SECONDS=45`; restart **ingest :8092 only**; `/health` must show real recordings path (not `test-drop`)
- Production ACL approval phrase + dual ACL: `references/production-acl-approval.md`

### ⚠️ Live camera dump layout — `recordings/` is NOT where cameras write (verified 2026-08-08)

Xiaomi cameras connected to the Samba share actually dump to:

```
/mnt/cctv/xiaomi-nas/xiaomi_camera_videos/{device_id}/{YYYYMMDDHH}/NNMSS_<epoch>.mp4
```

- `{device_id}` per camera (seen: `94f827062753` active, `788b2a9c88dc`, `788b2aa0d9fe`)
- `{YYYYMMDDHH}` = per-hour folder (e.g. `2026080810`), filename `08M38S_1786154918.mp4` = 8min38s + unix epoch
- **`recordings/` stays EMPTY in production** — the ingest watcher (`XIAOMI_RECORDINGS_DIR=/mnt/cctv/xiaomi-nas/recordings`, non-recursive `root.iterdir()`) will never fire for real camera dumps; a manual drop into `recordings/` is the only way the current pipeline triggers.
- **Fix options (awaiting Tuan approval):** A) point `XIAOMI_RECORDINGS_DIR` at `xiaomi_camera_videos` + make `scan_once()` recursive; B) small cron that syncs new files from `xiaomi_camera_videos/**` into `recordings/`.

### ✅ Pilihan A IMPLEMENTED (2026-08-08) — recursive scan of `xiaomi_camera_videos`

Tuan approved and the code was deployed (BLOCKED on ACL — see below):

- `watcher.py`: added `_iter_files(root)` using `os.walk` — recursive yield of video candidates, skipping hidden dirs (`.thumbnails`) and any file older than `BACKFILL_HOURS`.
- `config.py`: `BACKFILL_HOURS = _int("XIAOMI_BACKFILL_HOURS", 24)` — **critical guard**: `xiaomi_camera_videos` holds ~5K+ historical files; without a backfill cutoff the watcher would try to ingest every old clip on first boot (CPU/disk storm on i3). HAFJET set `XIAOMI_BACKFILL_HOURS=2` so only recent clips are claimed.
- `ALERT_NEW_MINUTES = _int("XIAOMI_ALERT_NEW_MINUTES", 30)` — alert Telegram ONLY for files with mtime ≤30 min old; backfill clips are ingested silently (no alert spam).
- `.env` → `XIAOMI_RECORDINGS_DIR=/mnt/cctv/xiaomi-nas/xiaomi_camera_videos`.
- Compile checks pass; service restart pattern per the restart pitfall below.

**✅ ACL RESOLVED (2026-08-08, same session):** Tuan ran `~/fix_acl_xiaomi_camera_videos.sh`
interactively → `WRITE OK`. After ACL, restart xiaomi-ingest (venv pattern below) and verify:
`curl -s http://127.0.0.1:8092/health` → `recordings_dir=.../xiaomi_camera_videos`, watcher_alive=true,
then watch `processed_ok` climb (24+ files ingested in first minutes, `processed_fail` stays low).
`cctv-worker` MainPID must remain unchanged. Full detail in `references/xiaomi-ingest-telegram-alert-2026-08-08.md`.

**⚠️ Partial-file pitfall — `moov atom not found` (verified 2026-08-08):** Xiaomi cameras write MP4
streamingly; the watcher claims a file after `STABLE_SECONDS=45` of no size/mtime change, but a clip
can still be mid-write (large rolling files, ~30s–2min). ffprobe then fails `moov atom not found`
(rc=1) and the clip lands in `failed/{y}/{m}/{d}/` — counted in `processed_fail`, never alert-spammed.
Not harmful (ingest continues), but the clip is lost. If this becomes frequent, either raise
`STABLE_SECONDS` for large clips or add a retry that re-probes the file once after a few minutes
before final failure. To verify a suspected partial file: `ffprobe -v error -show_format <file>` →
`moov atom not found` = incomplete/streaming write.

**Verifying alert with a "new" clip (test recipe):** because `ALERT_NEW_MINUTES=30` suppresses
alerts for backfill, an existing real clip (e.g. `08M38S_...`) will NOT alert when ingested.
To prove the alert path, copy a known-good archived clip back into `xiaomi_camera_videos/{id}/{YYYYMMDDHH}/`
with a fresh mtime (`cp ... "test_new_$(date +%s).mp4"`), wait stability 45s → expect
`telegram alert sent ok=True` in the log and a thumbnail in `thumbs/`.

### Xiaomi RTSP via miloco + go2rtc (infra approved 2026-08-08, no cameras yet)

Tuan approved setting up `~/xiaomi-rtsp` on Office PC with Docker Compose: **miloco + micam + go2rtc** (Xiaomi official RTSP bridge — Tuan must login Xiaomi account in Miloco before adding cameras; add none until then). Reference repo: `PC-Office/mi-camera-ha-rtsp-guide` (compose runs miloco+micam+go2rtc, publishes each camera to local RTSP, keeps H.265 + creates H.264 browser aliases). Do not touch Frigate / cctw-worker / xiaomi-ingest while doing this.

### Telegram alert on new recording (2026-08-08, Fasa A)
xiaomi-ingest sends a Telegram alert (photo thumbnail + caption) to group **`-5330700835`**
("CCTV ALERT") for every successfully ingested clip ≥10s, cooldown 5 min.

- New module `app/telegram_alert.py`: `send_recording_alert(thumb_path, original_name, recorded_at, duration_s)`.
  Uses stdlib-only **urllib multipart/form-data** (no `requests` dep). Returns bool; caller wraps in
  try/except so **alert failure never fails the ingest**.
- Caption format: `📁 Xiaomi Recording Baru` / Kamera (device_id from Xiaomi filename `{device_id}_{YYYYMMDD}_{HHMMSS}.mp4`) / Masa (dd/mm HH:MM MYT) / Tempoh (int saat).
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CCTV_CHAT_ID=-5330700835`, `XIAOMI_ALERT_MIN_DURATION=10`,
  `XIAOMI_ALERT_COOLDOWN_SECONDS=300` (add to `~/projects/hafjet-xiaomi-ingest/.env`).
- Hook in `watcher.py` `process_file()` AFTER `store.insert_video()` success.
- Full recipe + service restart pitfall: `references/xiaomi-ingest-telegram-alert-2026-08-08.md`.

### ⚠️ Restart xiaomi-ingest — NEVER `pkill -f "python -m app.main"`
`cctv-worker` ALSO runs as `python -m app.main` (different cwd/venv) — a `pkill -f` match kills BOTH.
Always:
1. Find listener: `ss -tlnp | grep 8092` → capture PID.
2. **`kill <PID>`** (specific PID only), `sleep 3`, confirm `ss -tlnp | grep 8092` empty.
3. Check process env first: `tr '\0' '\n' < /proc/PID/environ | grep VIRTUAL_ENV` — the process exe may
   resolve to `/usr/bin/python3.14` but it runs with `VIRTUAL_ENV=.../hafjet-xiaomi-ingest/.venv`;
   plain `python3` shells fail `import dotenv/uvicorn`.
4. Restart with venv + env:
   ```bash
   cd ~/projects/hafjet-xiaomi-ingest
   VIRTUAL_ENV=$PWD/.venv PATH=$PWD/.venv/bin:$PATH nohup .venv/bin/python -m app.main > /mnt/cctv/logs/xiaomi-ingest.log 2>&1 &
   ```
5. Verify: `curl -s http://127.0.0.1:8092/health` (watcher_alive=true) AND `systemctl is-active cctv-worker`
   still `active` with **unchanged MainPID**.

### P1 Deploy Verification Checklist (added 2026-08-01)

After any deploy to Office PC (xiaomi-ingest or similar sibling services), run this **read-only verification** before declaring success:

1. **Pre-deploy capture**: `systemctl show cctv-worker -p MainPID -p MemoryCurrent -p MemoryPeak` + `curl -s http://127.0.0.1:8091/health`
2. **Deploy steps** (rsync, venv, tests, foreground smoke)
3. **Post-deploy capture**: Same checks — confirm **PID unchanged**, health still `ok`, MemoryCurrent stable
4. **New service health**: `curl -s http://127.0.0.1:8092/health` → `phase=1`, `watcher_alive=true`
5. **Sample ingest**: Drop test file → verify `/api/videos` lists it with thumb + metadata
6. **No systemd install/enable** until separate approval

This checklist prevents silent worker disruption during sibling-service deploys.

### Tapo is out of scope for this skill’s SMB path
TC74 / C560WS app has **no generic SMB NAS** (Storage Hub / microSD / Care only). Do not route Tapo into `xiaomi-nas`. Use `hafjet-cctv-deployment` RTSP worker + optional event clips; see that skill’s `references/tapo-storage-paths.md`.

## Oray X1 class notes

- Product is SD-WAN router with optional USB file share — **not** a full NAS if USB host fails.
- Default LAN often `10.168.1.1`; SN on chassis/box.
- “Storage device not detected” after good FAT32/NTFS stick + HDD + FW upgrade → USB hardware/FW; escalate RMA (template in `references/oray-x1-usb-not-detected.md`).
- 组网 software authorization = 0 does **not** block same-LAN camera SMB to PC Office.

## Pitfalls

| Symptom | Likely cause |
|---------|----------------|
| NAS not in Mi Home list | Normal for Linux; use **manual IP** |
| Selected IPC$ | Wrong share — pick `xiaomi-nas` |
| Readable/writable error after correct share | Parent `/mnt/cctv` 750 — ACL traverse for `smbcam` |
| Auth fail | Wrong smb user/pass; special chars |
| Oray File Sharing “not detected” | USB host/enclosure/FW — not 组网 seats |
| 组网 “insufficient authorizations” | Software client seats; irrelevant to same-LAN Xiaomi NAS |
| Filled `/mnt/cctv` | Camera dump grew into worker volume — monitor free space; separate disk later |
| Agent tries non-interactive sudo on Office PC | Will fail; give TTY commands only |
| Ingest into live worker process | Forbidden without explicit redesign + restart approval |

## Related skills

- `hafjet-cctv-deployment` — Tapo RTSP person-detection worker (different stack)
- `cctv-worker-operations` — worker incidents; never auto-restart
- `hafjet-command-safety` — Office PC TTY sudo, no destructive globs under `/mnt/cctv`
- `telegram-file-delivery` — long runbooks as MEDIA `.txt`; chat ≤3 lines STEP/ACTION/NEED
- `brainstorming` / `writing-plans` — required before implementing xiaomi-ingest code

## Safety

- No WAN port-forward of 445
- No camera/Samba passwords in chat/memory
- No wildcard deletes under `/mnt/cctv`
- SMB1 = compatibility tradeoff; keep `hosts allow` to LAN (+ Tailscale `100.` if required)
- Samba/ingest changes must not imply `cctv-worker` restart
- **Production ACL gate:** any `setfacl`/`chmod`/`chown` under `/mnt/cctv` needs standalone approval phrase (not just “continue deploy”). Prefer `test -w` over create+delete probes. Dual ACL: `smbcam` traverse on `/mnt/cctv`; `hafizi145` rwx on `recordings`. Details: `references/production-acl-approval.md`
