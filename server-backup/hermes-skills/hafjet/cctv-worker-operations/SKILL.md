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

### Multi-camera readiness preflight

A second camera is normally a code-architecture decision, not a config-only addition. Before proposing it, apply the read-only preflight in `references/multicamera-readiness.md`. Keep it deferred while the single-camera RSS lifecycle remains unresolved.
