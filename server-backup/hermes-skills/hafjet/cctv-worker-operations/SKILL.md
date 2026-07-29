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

## Offline face-detector evaluation

- Build a reproducible stratified sample from paired existing full snapshots and crop records.
- Label each replay output strictly: `TRUE_FACE`, `FALSE_POSITIVE`, or `UNCERTAIN`; do not label a candidate crop from its baseline crop assumption because the largest selected box can differ.
- Test one configuration/model at a time under low CPU priority. Persist a checkpoint after each configuration.
- Measure accepted detections, true/false accepted, precision, true-face retention, and median/p95 latency.
- For a DNN candidate, also record disposable-process RSS/PSS/anonymous memory at 0/1/5/10/25/50 cycles. Exit the process after each model run.
- Never promote a detector based only on a small or false-positive-heavy sample. Require an explicit acceptance gate and separate approval.

## DNN/memory-workstream separation

Do not add a new DNN face detector while native-memory investigation is unresolved. A third DNN network confounds root-cause evidence. Keep model quality and memory remediation as separate decision records, with separate offline tests and approvals.
