---
name: hafjet-cctv-gpu-offload
description: Use when offloading CCTV clips to the RTX 4070 GPU node.
---

# HAFJET CCTV GPU Offload (Hybrid AI — Fasa 1)

Offload **post-hoc clip re-analysis** (NOT live detection) from the office PC to Tuan's RTX 4070 GPU node. Live path (Frigate detect, cctv-worker :8091, xiaomi-ingest :8092) stays untouched — office PC is read-only production baseline.

## Nodes
- **Source:** office PC `hafizi145@100.121.94.41` (`hafjet-pc-office`, Ubuntu 26.04, LAN 192.168.1.250).
- **GPU node:** `desktop-rhdusf3-1`, Tailscale `100.119.32.87`, **WSL2 (linux)**, Ryzen 7, 11GB RAM, RTX 4070 12GB, CUDA 12.4. **SSH user on the RTX node is `hafjet` (NOT `hafizi145`)** — the WSL2 Ubuntu account is `hafjet`; only the office PC uses `hafizi145`. Windows twin node `desktop-rhdusf3` (100.65.152.29) is OFFLINE — use the WSL2 linux node.

## Locked design (Fasa 1, approved by Tuan 2026-08-04)
- **Events:** person-only clips (query Frigate SQLite DB `label='person'`).
- **Batch:** every 60 min (not real-time).
- **Model:** YOLOv8n (ultralytics, CUDA).
- **Staging (RTX):** `~/cctv-analysis/staging/`.
- **Output:** `/mnt/cctv/frigate/analysis/{camera}/{date}/{clip_id}.json` — **sidecar JSON only, NO writes to worker/Frigate DB.**
- **Privacy:** NO identity/embedding/re-ID (matches HAFJET no-biometric constraint).
- rsync = **copy only**; source clips never deleted/moved.

## Flow
```
Office PC (hourly cron :17)             RTX node (hourly cron :23)
  pick_clips.py (Frigate DB, person)      YOLOv8n infer
  rsync push → staging/  ──────────────►   write result JSON + optional annotated clip
                                          rsync result → office /mnt/cctv/frigate/analysis/
```
Both sides run on **hourly user crontabs** (office :17 push → RTX :23 analyze, 6-min gap lets clips land). The early draft's "5-min poller" on RTX was replaced by the hourly cron in the approved design — see references/fasa1-scheduler-install-session.md for exact cron lines.

## 3-approval framework (mandatory; sequential — #2 needs #1, #3 needs #1+#2)
1. **"approve 1"** → SSH key setup two-way + test + rsync one-way test (dry-run then ONE real clip, exit 0 + same size).
2. **"approve 2"** → `pip install torch --index-url https://download.pytorch.org/whl/cu126` + `pip install ultralytics` on RTX + CUDA/YOLO single-clip test. (VERIFIED 2026-08-04: cu126 wheel → torch 2.13.0+cu126, works on Python 3.14; the checklist's cu124 guess was wrong — check `nvidia-smi` CUDA UMD and use the newest cuXXX index that resolves for the installed Python.)
3. **"approve 3"** → enable scheduler both sides (cron/systemd on office; WSL2 Task Scheduler/systemd on RTX) + dry-run batch.
After #3: **monitor 7 days** green before proposing Fasa 2 (live low-confidence offload — separate approval).

## WSL2 SSH blocker (check BEFORE approve-1 work)
RTX WSL2 does NOT run sshd by default — `ssh hafizi145@100.119.32.87` → `Connection refused` even though Tailscale node is active (`tailscale ssh` gives 502 Bad Gateway). Fix on the RTX WSL2 shell:
```bash
sudo apt update && sudo apt install -y openssh-server
sudo service ssh start && sudo systemctl enable ssh
ss -tlnp | grep :22        # must show LISTEN
```
WSL2 restarts lose sshd → re-enable via Windows Task Scheduler (part of approve 3) or note it.

## Key commands (see references/fasa1-execution-checklist.md for full runbook)
```bash
# Office PC → RTX key
ssh-keygen -t ed25519 -C "office-pc-to-rtx" -f ~/.ssh/id_ed25519_office2rtx -N ""
cat ~/.ssh/id_ed25519_office2rtx.pub   # paste into RTX ~/.ssh/authorized_keys (user hafjet)
ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 'echo RTX_SSH_OK'
# RTX → Office PC: mirror with id_ed25519_rtx2office (user hafizi145@100.121.94.41), test 'echo OFFICE_SSH_OK'
# rsync test (one-way, copy) — MUST pass the key explicitly, default key is not used:
rsync -avz -e "ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes" --dry-run <source.mp4> hafjet@100.119.32.87:~/cctv-analysis/staging/test.mp4
# real push, verify size matches source:
rsync -az -e "ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes" <source.mp4> hafjet@100.119.32.87:~/cctv-analysis/staging/test.mp4
# CUDA check (nvidia-smi NOT on PATH in WSL2 — use the WSL lib path):
/usr/lib/wsl/lib/nvidia-smi
python3 -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# GPU temp/VRAM (thermal_zone absent in WSL2; query via nvidia-smi):
/usr/lib/wsl/lib/nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,power.draw --format=csv
```

## Approve-2 measured performance (VERIFIED 2026-08-04, RTX 4070, yolov8n, 2.8K clip)
- 2880×1620, 200 frames → **3.2 ms/frame**, total 3.15 s/clip, **VRAM 22 MB**, GPU **51°C** (idle ~1209 MiB used).
- WAY under circuit-breaker limits and beats the ≥2 clips/min success metric. Model `yolov8n.pt` auto-downloads on first infer.

## Frigate recording path (verified during approve-1, differs from runbook draft)
Actual layout is `media/recordings/{date}/{hour}/{camera}/{ss.mm}.mp4` — NOT `{camera}/{date}/{HH}`:
```
/mnt/cctv/frigate/media/recordings/2026-08-03/17/entrance/35.13.mp4
```
5k+ segments accumulate; `pick_clips.py` must filter person events via Frigate SQLite DB (read-only, `file:...?mode=ro`) and map event time → hour dir → segment, not scan the whole tree. **DB lives at `/home/hafizi145/frigate/config/frigate.db`** (NOT `/mnt/cctv/frigate/config/...` — that path does not exist; compose mount is `~/frigate/config -> /config`, verify via `docker inspect frigate --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`). **Person-only still yields ~1000+ clips per 2h window** (Frigate writes a segment every ~10s and many map to person events) — ALWAYS cap batch size (e.g. `CCTV_MAX_CLIPS=50`) or the push runs for hours and times out; use a small cap for smoke tests.

## Pitfalls
1. **Never touch the live detection path.** All offload work is post-hoc on recorded clips; any change to Frigate detect config / cctv-worker requires the Frigate skill's approval rules.
2. **WSL2 sshd absent** → connection refused / Tailscale SSH 502. Install + start openssh-server first (above). `tailscale ssh` wrapper rejects `-o`/`--accept-risk` flags — use plain `ssh` with the dedicated key instead.
3. **WSL2 IP may change per boot** — use the stable Tailscale IP `100.119.32.87` in all configs/scripts.
4. **rsync copy-only discipline** — never `--remove-source-files` on the office recordings tree.
5. **Batch failure ≠ production incident** — RTX offline just skips the batch; office services must stay healthy (delta CPU/RAM <5%, no new 401s).
6. **Chicken-egg key bootstrap:** you cannot SSH into the RTX node to install its authorized_keys before a key exists. The office→RTX pubkey must be pasted manually on the RTX WSL2 shell by Tuan (or via an existing access path); only after that can automated ssh/rsync run. Similarly test RTX→office FROM the RTX shell (the key lives there), not from the office PC.
7. **Append the pubkey to the RIGHT authorized_keys** — the first attempt appended `office2rtx` key into the office PC's own `~/.ssh/authorized_keys` (wrong side, harmless) while testing from the wrong host gave a confusing `Permission denied`. Verify hostname (`hostname`) at both ends after each key test.
8. **YOLOv8n on video: `model(clip)` without `stream=True` returns only ONE frame** (silently!). First test printed `frames 1` on a 200-frame clip and misled the count. For full-video person counts iterate: `for r in model(clip, stream=True, device=0): ...` and accumulate `len([b for b in r.boxes if int(b.cls)==0])` per result. `r.speed["inference"]` is per-frame ms.
9. **rsync into non-existent dest subdirs FAILS with `change_dir#3` (code 3):** pushing `recordings/2026-08-04/05/outdoor_shop/...` into `~/cctv-analysis/staging/` one-file-at-a-time dies because `staging/2026-08-04/05/outdoor_shop/` doesn't exist yet on the receiver. Fix: `cd` to the source root and use `--relative` (`-R`) so rsync recreates the tree: `(cd /mnt/cctv/frigate/media/recordings && rsync -az -R -e "ssh -i ~/.ssh/id_ed25519_office2rtx ..." "./$rel" hafjet@100.119.32.87:~/cctv-analysis/staging/)`.
10. **Windows Task Scheduler from WSL2 = Access denied:** `schtasks.exe /create ... /ru SYSTEM` run from inside WSL2 fails with `ERROR: Access is denied` (no admin token). The binary exists at `/mnt/c/Windows/System32/schtasks.exe` and `powershell.exe` at `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/` but elevation is required — Tuan must create the `WSL2-CCTV-Services` startup task from a Windows admin PowerShell, same pattern as sudo-requiring steps.
11. **scp keeps the SOURCE basename — cron refs must match:** cache drafts are prefixed `cctv-` (e.g. `cctv-offload_push.sh`, `cctv-pick_clips.py`). `scp ... cctv-offload_push.sh host:~/cctv-analysis/` (directory destination) lands as `cctv-offload_push.sh`, but the cron line references `offload_push.sh` → silent "No such file or directory" at the top of the push log. Rename after push (`mv cctv-offload_push.sh offload_push.sh && mv cctv-pick_clips.py pick_clips.py`) or specify the full destination filename in scp. Also: chmod on a just-scp'd file intermittently reports "No such file or directory" transiently — re-check with `stat`/`ls` and retry after a beat rather than assuming the copy failed.
12. **HEVC decode errors → failed clips stay in staging → retried EVERY batch (backlog creep):** Frigate HEVC segments that hit `Error constructing the frame RPS` / `Could not find ref with POC` during YOLO decode are written as `status: failed` JSON but `cctv_analyze.py` only archives SUCCESSFUL clips to `processed/`. Failed clips remain in `staging/` and get re-inferred every 60-min batch — observed 344 clips stuck (179 @ hour 07 + 165 @ hour 08) with 851 processed OK. Not a live-path issue, but wastes GPU time and inflates the watchdog backlog metric. Fix option A (approved pattern): in `cctv_analyze.py`, move failed clips to `processed/` (or a `failed/` dir) in the `except` block so they are not re-picked. When triaging, bucket staging by hour (`find ~/cctv-analysis/staging -name "*.mp4" | sed -E "s#.*/staging/([0-9-]+/[0-9]+)/.*#\1#" | sort | uniq -c`) and check `grep -l '"status": "failed"' results/**/*.json | wc -l`.
13. **Watchdog must measure RTX staging backlog, NOT the office `clips_to_push.txt` count:** `pick_clips.py` writes ALL selected clips (~1365) to the file while `offload_push.sh` pushes only the cap (50) — so a >300 "backlog" alert on the source file fires every run and is noise. Real backlog = clips waiting in RTX `~/cctv-analysis/staging/` (find | wc -l); alert only when THAT exceeds ~200. Also guard push-cron freshness via `stat -c %Y clips_to_push.txt` (>100 min old = cron dead) and filter rsync-FAIL log lines to AFTER cron activation time so manual-test noise isn't re-alerted.

## Circuit breaker thresholds (RTX, auto-stop)
| Metric | Warning | STOP |
|--------|---------|------|
| GPU temp | >80°C | **>88°C** |
| VRAM | >8 GB | **>10.5 GB** (12 GB card) |
| GPU util | >85% 10min | >95% 5min |
| RTX RAM | >9 GB | >10.5 GB (11 GB total) |
| Infer latency | >2 s | >5 s × 10 clips |
| Batch fail rate | >10% | >30% |
Stop → log `status: circuit_breaker` + reason → notify Tuan → **no auto-resume** (manual approval).

## Success metrics (7-day gate to Fasa 2)
≥95% batch reliability · ≥2 clips/min (yolov8n 720p) · VRAM <8 GB · clip→result <15 min · ≥80% GPU-vs-Frigate detection agreement · office delta <5% CPU/RAM · daily transfer <10 GB · **zero incidents**.

## Support files
- `references/fasa1-execution-checklist.md` — full pre-exec checklist: SSH key gen/exchange, rsync dry-run + one-clip test, CUDA + YOLOv8n test, scheduler sequence, daily_summary_YYYY-MM-DD.json schema.
- `references/fasa1-scheduler-install-session.md` — approve-3 live-state: component paths, cron lines, Task Scheduler command, bugs hit during manual batch test (DB path, rsync -R, clip cap), **volume discovery (~1365 clips/2h) + cap-50/overflow-defer decision**, resume checklist.
- `references/passive-watchdog-pattern.md` — no_agent cron watchdog for the 7-day monitor: silent-when-OK contract, checks to use (CB flag, filtered rsync-FAIL, push-cron freshness, RTX staging backlog not source-file count), pitfalls (noise from manual tests, mtime heartbeat).
