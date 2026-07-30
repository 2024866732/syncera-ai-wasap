# Multi-Camera Readiness Preflight

Use this before proposing a second live CCTV camera. It is a design/decision reference, not a rollout runbook.

## Classify the current system first

Do not call a second camera a config-only change merely because the event table already has `camera_name`.

Inspect, read-only:
1. Camera configuration shape: scalar `CAMERA_1_*` keys vs data-driven camera registry/list, including camera name, RTSP secret reference, enabled state, zone, and per-camera cooldown.
2. Capture lifecycle: count `VideoCapture` objects, reconnect loops, detection loops, and whether the only concurrency is an API thread.
3. State ownership: module-global cooldowns, shared face directories, shared DNN Net instances, and shared SQLite connections.
4. Database: primary/unique constraints, camera/time indexes, camera-scoped query support, and whether zone is merely schema capacity or actually populated.
5. Live resource state: worker CPU, MemoryCurrent/Peak, host memory/cgroup limit, swap, event rate, reconnect rate, and unresolved leak status.

## Architecture implications

- A module-global cooldown must become camera-scoped; otherwise one camera can suppress another's events.
- Do not assume OpenCV DNN `Net` is safe for concurrent camera threads. Validate a shared-net design explicitly, or use process isolation with its known memory duplication cost.
- Do not share one SQLite connection across multiple capture threads without an explicit writer/serialization or per-worker connection design.
- Camera event storage may already be logically multi-camera, yet need a `(camera_name, occurred_at)` index and camera filters for dashboard/API/retention performance.
- Shared snapshot/face stores need camera-aware operational boundaries even where unique event IDs prevent immediate filename collision.

## Capacity gate

A second camera must be blocked when either CPU headroom is low or native RSS growth is unresolved. Separate process-per-camera improves fault isolation but duplicates Python/OpenCV/model workspaces; shared process/threading reduces copies but increases lifecycle/concurrency coupling.

Require, before any live Camera 2 activation:
- a completed memory-stability gate on current Camera 1;
- a documented architecture choice and rollback method;
- a safe SQLite write model;
- camera-scoped monitoring/queries;
- shadow or offline validation before a second live stream;
- separate approvals for code application, load/restart, and Camera 2 activation.

Do not confuse the live Office-PC host memory with a separate VPS memory limit; check `free -b` and `systemctl show ... MemoryMax` at decision time.
