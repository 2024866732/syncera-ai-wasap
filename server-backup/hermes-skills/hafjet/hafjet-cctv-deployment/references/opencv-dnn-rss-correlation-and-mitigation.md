# OpenCV DNN RSS Correlation and Mitigation

Use when D.6 age/gender inference is enabled and the CPU-only CCTV worker shows sustained RSS growth after face-attribute processing.

## Evidence-led correlation method

Do not treat a single post-restart RSS jump as a leak. During a no-restart 3–4-hour run, correlate each RSS interval with exact `Face attr:` timestamps:

```bash
# RSS source (worker process, not shell PID)
systemctl status cctv-worker --no-pager | grep Memory

# D.6 inference timestamps, bounded to the tracker window
journalctl -u cctv-worker --since '<UTC tracker start>' --until '<UTC end>' --no-pager \
  | grep 'Face attr:'
```

Also read the SQLite event count through Python's read-only URI if `sqlite3` CLI is absent. Record `person_detected`, face crop, and persisted face-attribute counts separately. A person event is not necessarily a D.6 inference.

Classify by interval, not just final RSS:

- **One-time allocation:** large early rise, then stable RSS across multiple later D.6 inference groups.
- **Continuous native-memory accumulation:** fresh RSS increases resume after successive D.6 groups, with small/no growth in a no-inference interval.
- **Unclear:** insufficient post-inference intervals; extend the read-only tracker.

## What `.copy()` fixes—and what it cannot prove

`frame[y1:y2, x1:x2].copy()` and a scoped `del face_array` are correct to remove the NumPy parent-frame view lifetime. They do **not** guarantee release of native OpenCV DNN allocations. If RSS still grows after this fix, do not claim that the Python crop path remains the root cause.

Use `/proc/<worker-pid>/smaps_rollup` to distinguish anonymous process memory from file-backed model pages:

```bash
PID=$(systemctl show cctv-worker -p MainPID --value)
grep -E '^(Rss|Pss|Pss_Anon|Pss_File|Private_Dirty|Anonymous)' /proc/$PID/smaps_rollup
```

Predominantly anonymous/private growth after D.6 inference points to native allocations or allocator retention, not merely loaded model files.

## OpenCV DNN investigation notes

- The D.6 code uses two cached `cv2.dnn.Net` Caffe networks and a fixed 227×227 blob. Fixed-size blobs make unbounded input-size growth an unlikely explanation.
- OpenCV's documented `Net` flow is `setInput()` then `forward()`. Do not assume a public API exists to clear/reset internal workspace; verify against the exact installed version's docs before proposing one.
- Explicit `del blob, gender_pred, age_pred` is harmless Python cleanup, but it is not evidence that `cv2.dnn.Net` native workspace will be released. Do not ship it as a claimed fix without a controlled comparison.
- Historical OpenCV DNN leak issues can guide investigation, but do not generalize a historical issue to the installed OpenCV build without reproduction.

## Isolated probe protocol and 2026-07 evidence

Use a copied face crop under `/tmp` and a script that imports no production modules. Run variants **sequentially at low priority** so the production worker is not restarted or modified. For each variant, report `/proc/self/smaps_rollup` RSS, PSS, Anonymous, and Private_Dirty after cumulative forward totals `0, 1, 5, 10, 25, 50`.

Required ladder:

1. cached/retained age net alone;
2. cached/retained gender net alone;
3. deliberately create/destroy the relevant net for each forward in a separate test process;
4. cached age+gender pair in the same process, matching production call order;
5. only if the pair remains flat, add the production detector boundary before blaming the production application.

**Observed on the Office PC with OpenCV 4.13.0 build `4.13.0-1-gb4c5ec4042`:** retained `age_net` alone and retained `gender_net` alone each made a one-forward PSS jump to about 151 MB, then remained effectively flat through 50 forwards. Their destroy-per-forward variants fell back to about 34 MB PSS after several iterations and stayed flat. This excludes a simple unbounded leak in either single model alone, but it does **not** clear the production process: investigate the cached age+gender combination and any detector/DNN interaction before selecting per-inference model reload or a subprocess remediation.

Do not use a separate-process `gc.collect()` as evidence about worker memory. It is valid only inside the isolated test to make the destroy-per-forward comparison explicit.

## Safe remediation decision order

1. **Controlled isolated reproducer (preferred):** separate test process, exact models/blob shape, measure RSS/PSS after batches of forwards; compare cached Net with destroyed Net. No production worker changes or restarts are needed for this study.
2. **Validate a code workaround only after reproduction:** e.g., per-inference net destruction. Measure latency and RSS; repeated loading can be expensive on i3-class CPU and may not defeat allocator fragmentation.
3. **Isolated D.6 subprocess:** send crop through local IPC, return only estimates, recycle child after a bounded inference count. Process exit lets the OS reclaim C-level memory. This is the robust fallback but needs IPC/timeouts/privacy-safe implementation.
4. **Scheduled main-worker restart:** emergency containment only. It creates detection gaps and conflicts with the explicit-per-restart approval gate unless Tuan Hafizi grants a narrow written exception. Derive cadence from measured RSS risk; do not assume 6–8 hours is safe.

## Post-restart media-route verification

When a restart also loads Face Gallery media-route changes, test a real face filename obtained read-only from `face_snapshot_path`:

```bash
curl -sS -o /dev/null -w 'HTTP=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
  "http://127.0.0.1:8091/faces/<basename-from-face_snapshot_path>"
```

Expected: HTTP 200 and `image/jpeg`. `curl -I` can return 405 when a FastAPI media route exposes GET only; use a real GET for availability verification. Keep full event snapshots on `/snapshots/{filename}` and face crops on `/faces/{filename}`—they map to separate directories.
