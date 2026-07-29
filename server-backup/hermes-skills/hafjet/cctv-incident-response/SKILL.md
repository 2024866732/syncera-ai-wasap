---
name: cctv-incident-response
description: "Investigate and contain HAFJET CCTV worker incidents safely: RSS escalation, D.6 estimate discrepancies, route/UI evidence, and explicitly-approved one-time restarts."
---

# HAFJET CCTV Incident Response

## Use when

Use for production CCTV worker incidents involving memory escalation, missing gender/age estimates, crop/route failures, dashboard discrepancies, or requests for a controlled restart.

## Non-negotiable safety boundary

- Never restart, enable a timer, change code/config/models, open an additional RTSP capture, or clean data unless the user has explicitly approved that exact action in chat.
- Treat production read-only checks separately from isolated test processes. An isolated process must not import or alter the running worker.
- Keep tracking read-only unless the user explicitly cancels it. Monitoring must never take recovery action on its own.
- Do not treat a browser/UI symptom as proof of an inference or DB failure without tracing the exact event ID through each layer.

## Evidence-first workflow

### 1. Capture the current operational baseline

Record all times in UTC and MYT, then collect:

- worker active PID, `MemoryCurrent`, `MemoryPeak`;
- `/proc/<PID>/smaps_rollup`: `Rss`, `Pss_Anon`, `Private_Dirty`;
- `/health` response;
- tracker's latest samples;
- current journal window around DNN, face crop, person event, RTSP/reconnect messages.

Never infer a memory leak from a single value. Preserve an uninterrupted time series and correlate it with model-load/inference/event boundaries.

### 2. Trace D.6 estimate discrepancies by exact event ID

For the exact `event_id` / `occurred_at` shown to the user:

1. Find the matching `Face attr:` journal line or exception.
2. Query SQLite read-only for `face_snapshot_path`, `gender`, and `age_range`.
3. Request the same event from the live API and compare the fields exactly.
4. Inspect the server dashboard query/serializer/template that emits those fields.
5. Only then assess browser cache, selected date/event, or rendered UI behavior.

Decision table:

| Evidence | Diagnostic direction |
|---|---|
| Journal + DB + API values present | D.6 and persistence work; investigate dashboard query, selected event/date, or browser rendering/cache. |
| Journal output present, DB fields null | Trace attribute update/commit/write path. |
| Crop exists, no journal output | Trace confidence gate, crop result, and D.6 invocation path. |
| Journal exception | Inspect model paths, input blob creation, and the caught exception before proposing a fix. |

### 3. Validate route/UI claims correctly

- Use a real known JPEG filename and `GET` (not `HEAD`) to verify image routes; GET-only image routes may return 405 to HEAD.
- Verify face crops and full snapshots through their separate routes/stores.
- Curl/HTML checks prove server emission, not visual correctness. Browser/screenshot confirmation is still required for layout, broken thumbnails, cache, and responsive UI claims.

### 4. Controlled one-time restart (only after explicit approval)

A restart is RSS relief, never a root-cause fix. Do not bundle it with code/model/config changes.

**Pre-restart record**

- UTC/MYT timestamps, PID, memory, smaps summary;
- health, dashboard, CSV, known crop GET, known full-snapshot GET;
- latest tracker samples and explicit escalation reason;
- retained journal window before the action.

**Action**

- Run only the user-approved helper/command once.
- Record helper exit code separately. A nonzero helper result is not sufficient evidence of restart failure or success.

**Post-restart verification**

- service active state and PID change;
- health plus dashboard/CSV/real image endpoints;
- immediate memory and later tracker samples at the agreed observation points;
- new `Face attr:` journal evidence when a valid new crop occurs;
- actual reconnect/capture gap from timestamps.

Do not perform a second restart without fresh explicit approval, regardless of helper exit status.

## Memory-isolation diagnostic ladder

Use one variable at a time and stop expanding when sustained PSS/anonymous-memory growth is reproduced:

1. static D.6 model test with one fixed crop;
2. paired age+gender test in one isolated process;
3. detector + crop + D.6 replay using stored snapshots only;
4. decode-only capture test only after explicit approval, because it adds a camera stream;
5. external production correlation using journal markers plus smaps sampling, without production instrumentation.

A single model plateau does not prove the complete production pipeline is leak-free. It only eliminates that isolated boundary.

## References

- `references/cctv-evidence-chain.md` — compact event-to-dashboard evidence chain and restart record format.
