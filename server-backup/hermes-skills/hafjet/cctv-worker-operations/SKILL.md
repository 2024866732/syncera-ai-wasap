---
name: cctv-worker-operations
description: Safely diagnose, verify, and operate HAFJET CCTV workers without conflating UI, DNN, capture, and restart evidence.
---

# HAFJET CCTV Worker Operations

## Use when

Use for HAFJET CCTV worker incidents, dashboard/API discrepancies, face-crop/D.6 diagnostics, controlled restarts, RSS investigations, and offline detector evaluation.

## Hard safety boundaries

- Never restart the worker without explicit written approval in the current chat.
- A restart approval covers only the named command and one execution; do not combine it with code, model, config, timer, or threshold changes.
- Keep RTSP loopback/private exposure unchanged unless separately approved.
- Treat gender/age only as non-identifying estimates; never infer identity or trigger action from them.
- Offline tests must use stored snapshots/crops only. Do not open a live RTSP stream, import the production worker, or write production DB/data unless separately approved.

## Resource model (Office PC vs Hermes VPS)

- **Office PC** (`100.121.94.41` / `hafjet-pc-office`): Intel i3-2100 **2C/4T**, **16 GB RAM** — runs `cctv-worker`, `xiaomi-ingest`, Frigate evaluation.
- **Hermes Azure VPS**: **1 GB + 4 GB swap** — agent host only. **Never size Frigate or worker resource plans against the VPS 1 GB figure.**
- With worker + ingest running, Office PC often still has **~14–15 GiB available**. Extra video AI bottleneck is usually **CPU**, not RAM.

## Dashboard/API parity diagnosis

When a dashboard renders a placeholder despite an API/DB value, trace one exact event through four layers before proposing a patch:

1. Query the raw database row read-only by exact event ID/timestamp.
2. Fetch the JSON API object for that same ID.
3. Fetch raw server-rendered HTML and locate the same event by timestamp, crop URL, or ID.
4. Trace route -> data-access function -> SQL SELECT -> tuple indexes -> returned dict -> template fallback.

A correct JSON API does not prove the dashboard query is correct: routes may use separate query helpers. If raw HTML already renders a placeholder, diagnose server query/serialization before considering browser cache.

For an additive field fix:
- add the column to the relevant SELECT;
- add the matching dict key;
- shift every later tuple index correctly;
- preserve function signature, filters, ordering, existing keys, and external semantics;
- verify DB -> JSON -> raw HTML parity on the same event before a separately-approved restart/browser check.

See `references/dashboard-field-parity.md` and `references/safe-minimal-patches.md`.

## Controlled RSS-relief restart

Use only after explicit single-restart approval.

### Pre-restart evidence

Record UTC and MYT, active PID, MemoryCurrent/MemoryPeak, `/proc/<pid>/smaps_rollup` RSS/Pss_Anon/Private_Dirty, health, real crop GET, full snapshot GET, dashboard/CSV response, tracker samples, and a bounded current journal window. If any mandatory lookup fails, pause the restart and repeat only that precheck; never treat an empty asset name/404 as success.

### Execute

Run only the expressly approved helper/command once. Record its exit code separately: a helper may fail a stale UI marker despite a healthy service.

### Post-restart evidence

Record new PID, active state, health, dashboard/face-dashboard/CSV/crop/snapshot status, immediate MemoryCurrent/Peak, journal startup and later successful face-attribute evidence. Capture coverage/reconnect gap from timestamps. Browser screenshot verification remains separate from raw HTML checks.

### Historical-event dashboard verification pitfall

Do not assert that a historical event must appear in the default `/dashboard` response: pagination, default date windows, or route-specific filter semantics can omit it even when the patch is loaded and the API/DB values are correct. Before using an event as a server-HTML assertion:

1. Inspect the dashboard route's accepted filter parameter names and date format.
2. Fetch the intended filtered response and locate the event by a stable value (event ID if rendered, otherwise its exact timestamp plus face-crop path).
3. If the event is absent, classify this as **verification scope incomplete**, not a mapping regression. Stop the assertion block and report it; do not restart again.
4. For post-restart patch proof, prefer a newly-created event with non-null gender/age fields, then separately require a real browser hard-refresh confirmation.

### RTSP incident journal handling

- Journal lines can contain credential-bearing RTSP URLs, including percent-encoded usernames. Never print raw journal excerpts into chat or reports.
- Save the bounded journal window locally for evidence if authorized, but display only explicitly redacted summaries: detection-start time, loop-end time, disconnect/reconnect time, and error category.
- **Redaction pitfall:** do not trust an ad-hoc shell/Python regex until it is tested against a fixture containing an encoded username (`%40`) and password marker. Redact the entire URI token before a tool call can return it; a failed regex can leak the username even if the password is masked.
- `Detection started` after a disconnect is evidence of a successful reconnect; distinguish it from a continuously healthy stream. Repeated start/end cycles indicate an unstable-but-reconnecting stream, not necessarily a stuck worker.
- If there are no new events after restart, first establish stream state from reconnect evidence plus health/service state; do not infer capture failure solely from event silence.

## Offline face-detector evaluation

- Build a reproducible stratified sample from paired existing full snapshots and crop records.
- Label each replay output strictly: `TRUE_FACE`, `FALSE_POSITIVE`, or `UNCERTAIN`; do not label a candidate crop from its baseline crop assumption because the largest selected box can differ.
- Test one configuration/model at a time under low CPU priority. Persist a checkpoint after each configuration.
- Measure accepted detections, true/false accepted, precision, true-face retention, and median/p95 latency.
- For a DNN candidate, also record disposable-process RSS/PSS/anonymous memory at 0/1/5/10/25/50 cycles. Exit the process after each model run.
- Never promote a detector based only on a small or false-positive-heavy sample. Require an explicit acceptance gate and separate approval.

## DNN/memory-workstream separation

Do not add a new DNN face detector while native-memory investigation is unresolved. A third DNN network confounds root-cause evidence. Keep model quality and memory remediation as separate decision records, with separate offline tests and approvals.

### Stage 1: static-snapshot all-model isolation

Use this only with explicit approval for the diagnostic run. Create a disposable, low-priority process that does **not** import the worker, open RTSP/VideoCapture, or write production data. It must load the exact production detector + age + gender models with the same CPU backend/target and preprocessing, then run detector → Haar crop → gender/age forwards at 0/1/5/10/25/50 cycles.

- Record RSS, PSS, Pss_Anon, Private_Dirty, and median/p95 full-cycle latency at every checkpoint.
- Record memory at `after_model_load` (before any forward), then at detector, Haar, gender, age, and explicit temporary-output deletion boundaries for cycles 1 and 50.
- A large first-forward native allocation which plateaus through cycle 50 is **not** reproduction of a continuous production leak; distinguish one-time workspace allocation from recurrent growth.
- Do not proceed to decode/VideoCapture isolation after a plateau without separately approved Stage 2 scope.

See `references/option-b-static-harness.md` for the concrete evidence pattern and report checklist.

### Stage 2: isolated RTSP decode/discard isolation

Use this only after an explicit Stage-2 approval that specifically permits **one additional RTSP stream**. This is an exception to the default offline-test boundary; do not infer it from Stage 1 approval.

1. Create a disposable standalone process: no production-app imports, detector/Haar/DNN, DB access, file/image persistence, or worker attachment. Read frames with `cv2.VideoCapture`, then immediately discard each frame.
2. Keep the camera URI out of source, output, command arguments, and reports. Pass it through a short-lived environment variable extracted locally from the approved configuration source; never print it or raw journal lines.
3. Run one process at low scheduling/I/O priority (`nice` plus idle `ionice`). Enforce the approved hard wall-clock cap (30 minutes unless another duration is explicitly authorized).
4. Before opening the stream, record production PID, active state, MemoryCurrent, and CPU baseline. At frame checkpoints (0/1/5/10/25/50) and timed checkpoints (1/5/10/30 min), record test RSS/PSS/Pss_Anon/Private_Dirty, read median/p95, frame count, and production PID/state/CPU/RSS.
5. Add stop guards: worker inactive/PID changed; three consecutive test `read()` failures; or an explicitly defined production-CPU threshold. Always release the capture before exit.
6. Record a final memory sample **after** `VideoCapture.release()`. Decode growth that drops after release is a bounded/releasable capture-buffer or allocator footprint, not enough to establish a persistent leak.
7. Never attribute concurrent production RSS growth to the second stream without a control: production may already be trending. Report pre-test baseline, contemporaneous values, and that causal limitation separately.
8. Post-test, verify worker `active`, health, and a bounded safely summarized journal window. Classify reconnect/detection-start and stream-end/error counts without emitting raw journal or URI text.

Interpretation: sustained growth that remains high after release supports decode/frame-buffer retention; a modest plateau or post-release drop weakens decode-only as primary cause. Neither outcome authorizes Stage 3 or a production change without new approval.

### Stage 3: read-only production lifecycle correlation

Use only after explicit approval. This is an external-observer diagnostic, not production instrumentation.

1. Create a low-priority monitor outside the worker. It may read systemd `MemoryCurrent`/`MemoryPeak`, `/proc/<pid>/smaps_rollup`, health, CPU/RSS, the existing RSS tracker, and a bounded journal window; do not import or alter the app.
2. Record a 5–10-minute time series for the approved duration. Each sample must include UTC and MYT, worker PID/state, RSS/PSS/Pss_Anon/Private_Dirty, CPU, and only safe journal-derived categories/timestamps: `Face attr`, `Person detected`, `Detection started`, `Detection loop ended`, and reconnect notice.
3. Never emit or persist raw journal lines/RTSP tokens. Parse them in-process and retain only category, timestamp, and aggregate/new-count fields. `Face attr` is evidence of successful D.6 after a crop; absence of it is **not** proof that no crop occurred.
4. If memory is already over the breach threshold at monitor start, record `breach-at-start` and continue observation. Do not silently classify it as a new crossing and do not auto-restart.
5. Protect lifecycle integrity: if worker PID or active state changes, stop that run and report the boundary rather than mixing measurements from two worker generations.
6. Respect the approved reporting mode. In normal mode, send progress at the approved 1–2-hour cadence. In explicitly approved **passive mode**, retain routine samples in the diagnostic log and notify only for final completion, the specified critical RSS threshold, worker crash/stop, a blocker, or an action needing new approval. Reconfigure the external monitor/watch delivery if needed; never change production just to alter reporting frequency.
7. A breach is evidence, not an authorization to restart. If RSS is below the critical escalation threshold, continue the approved observation; wait for explicit written restart approval.
8. Interpret only against a control: distinguish a one-time native allocation, activity-correlated steps, reconnect-correlated steps, and time/event-count trends. Do not attribute a concurrent RSS increase to a diagnostic stream/test when production was already trending.

#### Stage 3 Correlation Methodology (Added 2026-07-31)

Compute Pearson correlation between 5-minute MemoryCurrent deltas and category-count deltas across the observation window:
- `person_detected` delta: strongest positive correlation (r ≈ +0.87)
- `Face attr` / successful D.6 delta: strong positive correlation (r ≈ +0.81)
- `detection_started` / `loop_ended` / `reconnect_notice`: near-zero correlation (r ≈ ±0.02)

This isolates the **activity-related growth** (person→crop→D.6→event/snapshot write→cgroup file+anon) from **reconnect-cycle noise**. The correlation is computed in-process by the external monitor; no raw journal persists.

#### Cgroup vs Procfs Memory Accounting (Added 2026-07-31)

`systemd MemoryCurrent` = cgroup memory (includes anonymous + file-backed + kernel + socket).
`/proc/<pid>/smaps_rollup` RSS = process resident set (mostly anonymous + mapped files).

Example at 937 MiB escalation:
- cgroup anon: 565.9 MiB
- cgroup file: 369.3 MiB (page cache, mmapped model files, DB pages)
- procfs RSS: 584.0 MiB
- procfs Pss_Anon/Private_Dirty: ~540 MiB

**Do not equate cgroup MemoryCurrent with "native leak" alone** — substantial file-backed component is normal for a process holding model files, SQLite pages, and image buffers. Use procfs anon/dirty for native-leak signal.

#### Restart Helper False-Failure Pattern (Added 2026-07-31)

The approved helper `/home/hafizi145/restart-cctv.sh` exits `1` when its **Dashboard Column Check** expects a stale UI marker. This is a **helper bug, not a service failure**. Post-restart evidence (new PID, health 200, MemoryCurrent ~290 MiB, API responding) is the ground truth. Record helper exit code separately; never treat non-zero helper exit as restart failure if service checks pass.

### Option A + C DNN mitigation (implemented 2026-08-03)

Details: `references/dnn-memory-mitigation-option-a-c.md` and `references/option-a-timer-install.md`.

- **Option C (production):** `app/vision/face_attr.py` loads age+gender nets **per** `predict_age_gender` call and unloads in `finally` (`del` + `gc.collect()`). Never restore module-level `_age_net` / `_gender_net` lazy cache. Backup: `face_attr.py.before-optionc`. **`main.py` unchanged** (signature stable).
- **Prove C is live:** journal (redacted) must show `Age+gender DNN models loaded for single inference (unload after)` immediately before each `Face attr:` — one load per inference, not a single lifetime load.
- **Option A (safety valve):** unit sources at `~/projects/hafjet-cctv-worker/systemd/cctv-worker-restart.{service,timer}` — 6-hourly `OnCalendar=00,06,12,18 UTC`. Installing into `/etc/systemd/system/` needs **interactive TTY sudo**; BatchMode fails. Scoped sudoers = restart/status only.
- **Option A LIVE (verified 2026-08-03):** systemd timer **enabled** in `/etc/systemd/system/cctv-worker-restart.{service,timer}` (A1 6-hourly + RandomizedDelaySec=300). User installed via TTY sudo; agent BatchMode cannot copy into `/etc`. **Cron fallback removed** after timer install — do not re-add crontab while timer is enabled (double restart). Optional leftover wrapper `~/.local/bin/cctv-worker-scheduled-restart.sh` is inert if not in crontab. Verify: `systemctl list-timers | grep cctv-worker-restart`.
- **Post-C RSS:** baseline after approved restart ~260–350 MB; brief MemoryPeak spikes on early inferences OK. Keep slope watch vs Face attr count; ≥900 MB remains alert-only outside timer or explicit approval.

### Multi-camera readiness preflight

A second camera is normally a code-architecture decision, not a config-only addition. Before proposing it, apply the read-only preflight in `references/multicamera-readiness.md`. Keep multi-cam worker expansion gated while validating Option C RSS slope and Frigate 1-cam soak CPU headroom (Option A timer already enabled as ceiling).

### Tapo storage + C560WS (updated 2026-08-03)

- No Tapo Storage Hub (budget). Path = RTSP worker → `/mnt/cctv`, **not** Xiaomi Samba.
- Expand order: **event clips first** (not continuous).
- **TC74 entrance:** `192.168.1.94` RTSP **`stream1`** (`CAMERA_1`).
- **C560WS outdoor (luar kedai):** `192.168.1.226` RTSP **`stream1`** (user-corrected 2026-08-03; an earlier `stream2` note was wrong — **re-verify path each session**, TP-Link paths vary by model). On-device facial recognition is **app-trapped** (no reliable ONVIF face-ID export).
- **C560WS 401 pitfall (2026-08-03):** 401 on ALL stream/usernames = device RTSP "Camera Account" not enabled or wrong password — fix on-device in Tapo app (Advanced Settings → Camera Account), re-test with ffmpeg, THEN update `.env`. **After 3–4 consecutive 401s STOP probing** — TP-Link applies a temporary IP-based lockout; every extra attempt extends it (VLC from a laptop with a different IP can still work while the server is locked). Rule out IP conflict first by matching `arp` MAC on both hosts + OUI lookup. Full ladder + lockout evidence: `references/frigate-cpu-only-deploy.md` → "Camera auth diagnosis" + "IP lockout discovery".
- Still multi-cam **architecture** gate for cctv-worker; do not add a second live RTSP path without redesign + approval.
- Never bind Tapo into Mi Home share `xiaomi-nas`.
- **Dashboard SSH tunnels:** open `-L` from the **laptop**, not from an already-SSH session on the Office PC (server→server loop causes bind “Address already in use” / browser connection refused).
- **EZVIZ CS-C6N:** indoor human detection/tracking only — **no facial recognition**; do not market it as face-ID for HAFJET integration.

### Frigate 1-cam soak (updated 2026-08-03)

See `references/frigate-cpu-only-deploy.md` (full deploy/tune/soak procedure) and `references/frigate-1cam-soak-prep.md`.

- Purpose: browser **live view** (+ optional motion record), not a silent swap for worker D.3–D.6.
- Files: `~/frigate/` (`docker-compose.yml`, `config/config.yml`, `.env`). Media `/mnt/cctv/frigate/media`.
- **Defaults:** detect **1280×720 @ 3 fps** (optimised from 5 after soak — see tuning table below), CPU `num_threads: 2`, person-only, MQTT/birdseye off, `restart: "no"`, ports **`127.0.0.1:5000`** / `127.0.0.1:8554`.
- **Camera 3 (C560WS) state (2026-08-03):** user approved the 2-cam draft (`config/config.yml.c3-draft`, 960×540 @ 2 fps, person-only) → applied + `docker compose restart` — **restart was approved and executed**. `outdoor_shop` came up but ffmpeg died on **401** (Camera Account auth). Frigate itself stayed healthy; `entrance` kept streaming. Multi-cam remains **blocked on auth resolution + soak re-verify**, not on draft approval. Do not assume draft re-application is needed; fix auth, ONE ffmpeg test, then restart.
- Secrets in `.env` only; username may need `%40`. Mount **`./config:/config` once**.
- Double RTSP on TC74: monitor worker PID/health/reconnect; stop Frigate on reconnect storm or worker ≥900 MB.
- **CPU tuning (measured i3-2100, TC74 720p):** 5 fps → **~224–254%** (process_fps lags camera_fps, skip non-zero) — too hot. **3 fps → ~48–75%**, process_fps 3.0–3.1, skipped_fps ~0 — **recommended**. 2nd camera draft = **960×540 @ 2 fps, person only**.
- Frigate RAM ~0.7–0.8 GiB is normal; host has ~14–15 GiB free. **CPU is the gate, not RAM.**
- Frigate 0.17+ may create default `admin` password in logs on first boot; early `/api` 500 while FastAPI starts is normal for ~30–60s.
- Never `docker compose up` without explicit soak approval **after** config review.
- Config-change flow: draft to `config/config.yml.c3-draft` → show full content → wait for written apply approval → copy + `docker compose restart`.
- **`.env` reload + multi-credential (2026-08-04):** `docker compose restart` does NOT reload `.env` — use `up -d --force-recreate`, then verify with `docker inspect frigate ... | grep FRIGATE_RTSP`. Cameras with different credentials need separate env pairs (`FRIGATE_RTSP_USER_C3` / `_PASSWORD_C3`), not one shared set — a single pair breaks the other camera. TP-Link IP lockout re-triggers on the new IP if Frigate keeps probing with wrong creds: test once from host first, never let the watchdog loop hammer. Full details: `references/frigate-cpu-only-deploy.md` → ".env reload + multi-credential pitfall".

## Xiaomi NAS / file-ingest boundary (added 2026-08-01)

- Mi Home SMB dumps and Oray USB shares are **not** RTSP sources. Use skill **`hafjet-camera-nas-storage`**.
- Do **not** implement folder watchers inside the live `cctv-worker` process without a separate design + restart approval (RSS coupling).
- **P1 design approved:** sibling `hafjet-xiaomi-ingest`, DB `xiaomi_ingest.db`, port **8092**, metadata+thumb only; must not write `cctv_events.db` or restart this worker. File DNN = Phase 2 gate.
- Samba install/ACL fixes on `/mnt/cctv` must not be paired with `systemctl restart cctv-worker`.
- When verifying ingest deploy, sample worker PID + `:8091/health` before and after — **unchanged PID** is the bar for “did not interrupt worker”.

## P1 Deploy Verification Checklist (added 2026-08-01)

After any deploy to Office PC (xiaomi-ingest or similar sibling services), run this **read-only verification** before declaring success:

1. **Pre-deploy capture**: `systemctl show cctv-worker -p MainPID -p MemoryCurrent -p MemoryPeak` + `curl -s http://127.0.0.1:8091/health`
2. **Deploy steps** (rsync, venv, tests, foreground smoke)
3. **Post-deploy capture**: Same checks — confirm **PID unchanged**, health still `ok`, MemoryCurrent stable
4. **New service health**: `curl -s http://127.0.0.1:8092/health` → `phase=1`, `watcher_alive=true`
5. **Sample ingest**: Drop test file → verify `/api/videos` lists it with thumb + metadata
6. **No systemd install/enable** until separate approval

This checklist prevents silent worker disruption during sibling-service deploys.

## Critical Pitfall: Shared Entry Point Process Killing (2026-08-01)

**Incident**: `pkill -f "python -m app.main"` killed **both** cctv-worker (:8091) and xiaomi-ingest (:8092) because they share the exact same entry point pattern.

**Root cause**: Both services use `python -m app.main` as their entry point. A broad `pkill -f` pattern matches all processes whose full command line contains that string.

**Prevention rules** — add to any deploy/restart procedure for sibling services:

1. **Never use `pkill -f` with a pattern that matches the main worker's entry point** (`python -m app.main`).
2. **For cctv-worker (systemd service)**: Always use `sudo systemctl restart cctv-worker` — never pkill.
3. **For xiaomi-ingest (foreground/background)**: Use specific PID from `$!` at launch, or `pkill -f "xiaomi-ingest"` if the module path differs, or write PID to a file at startup and kill by PID.
4. **Verification after any process manipulation**: Always check both `:8091/health` and `:8092/health` (or whatever ports) and confirm cctv-worker PID is unchanged (or properly restarted via systemctl).

**Correct restart patterns**:
```bash
# cctv-worker (systemd) — ONLY this:
sudo systemctl restart cctv-worker

# xiaomi-ingest (foreground test) — use PID:
cd ~/projects/hafjet-xiaomi-ingest && . .venv/bin/activate
python -m app.main &
INGEST_PID=$!
# later:
kill $INGEST_PID

# xiaomi-ingest (background) — write PID file at launch:
echo $! > /tmp/xiaomi-ingest.pid
# later:
kill $(cat /tmp/xiaomi-ingest.pid)
```

**Verification bar**: "cctv-worker PID unchanged" (for non-restart ops) OR "cctv-worker restarted cleanly via systemctl with new PID and health=ok" (for approved restarts). Never assume a pkill only hit the intended target.
