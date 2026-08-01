# Stage 3 Correlation Methodology

**Session:** 2026-07-30 to 2026-07-31
**Worker:** HAFJET CCTV production worker (PID 58914, then 1217555 post-restart #3)
**Duration:** ~6h35m Stage 3 + 4h Stage 3b extension (total ~10h35m before 900 MiB escalation)

## Data Collection

External low-priority monitor sampled every 5 minutes:
- `systemctl show cctv-worker -p MemoryCurrent,MemoryPeak,MainPID`
- `/proc/<pid>/smaps_rollup` (Rss, Pss, Pss_Anon, Private_Dirty)
- `ps -p <pid> -o pcpu=,rss=`
- `curl http://127.0.0.1:8091/health`
- `journalctl -u cctv-worker --since <START_UTC> --no-pager -o short-iso` parsed into safe categories

Safe categories only:
- `Face attr` — successful D.6 inference after crop
- `Person detected` — person_detected event
- `Detection started` — stream start/reconnect
- `Detection loop ended` — stream end
- `reconnect_notice` — explicit reconnect log line

No raw journal lines persisted; only category, timestamp, and aggregate counts.

## Correlation Computation

For each consecutive 5-minute sample pair:
- `delta_memory = MemoryCurrent(t+1) - MemoryCurrent(t)` (MiB)
- `delta_count[category] = cumulative_count[category](t+1) - cumulative_count[category](t)`

Pearson correlation across all intervals:

| Category | Total Events | Pearson r (delta_mem vs delta_count) |
|----------|--------------|--------------------------------------|
| `person_detected` | 153 | **+0.870** |
| `Face attr` (D.6) | 81 | **+0.808** |
| `detection_started` | 205 | +0.011 |
| `loop_ended` | 205 | -0.018 |
| `reconnect_notice` | 205 | -0.018 |

## Interpretation

**Strong positive correlation with activity events** (`person_detected`, `Face attr`):
- Each person event triggers frame processing → Haar crop → D.6 inference → event/snapshot write
- This path allocates: frame buffer, crop array, DNN workspace, image encode buffer, SQLite page, cgroup file cache
- The correlation indicates **activity-related accumulation** in cgroup memory (both anon and file-backed)

**Near-zero correlation with reconnect cycles**:
- Despite 205 reconnect/start/end cycles, no linear association with 5-min memory growth
- Reconnect cycles are **not the primary driver** of the continuous RSS increase

## Cgroup vs Procfs Accounting

At escalation point (937 MiB MemoryCurrent):

| Source | Metric | Value |
|--------|--------|-------|
| cgroup | `MemoryCurrent` | 937.5 MiB |
| cgroup | `anon` | 565.9 MiB |
| cgroup | `file` | 369.3 MiB |
| cgroup | `kernel` | 13.5 MiB |
| cgroup | `sock` | 2.9 MiB |
| procfs | `Rss` | 584.0 MiB |
| procfs | `Pss` | 571.6 MiB |
| procfs | `Pss_Anon` | 539.7 MiB |
| procfs | `Private_Dirty` | 539.7 MiB |

**Key insight:** cgroup `MemoryCurrent` includes ~369 MiB file-backed memory (page cache, mmapped model files, SQLite DB pages, image buffers). This is **normal for a production CCTV worker** and not a "native leak" signal. Use procfs `Pss_Anon` / `Private_Dirty` (~540 MiB) for native-leak assessment.

## Restart Helper False-Failure

Helper `/home/hafizi145/restart-cctv.sh` exit code `1` on both restart #2 and #3 due to **Dashboard Column Check** expecting stale UI marker. Service health, PID change, MemoryCurrent drop to ~290 MiB, API responsiveness all confirm successful restart. Helper exit code is a **known false failure**; record separately, never treat as restart failure if service checks pass.

## Files

- Stage 3 full log: `/tmp/cctv-stage3-correlation-20260730.jsonl` (81 samples)
- Stage 3b extension log: `/tmp/cctv-stage3b-correlation-20260730.jsonl` (stopped at alert)
- Summary report: `/home/hafizi145/.hermes/cache/documents/cctv-option-b-stage3-production-correlation-2026-07-30.txt`