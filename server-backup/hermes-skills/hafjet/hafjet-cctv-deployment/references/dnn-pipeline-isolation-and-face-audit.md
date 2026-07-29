# DNN Pipeline Isolation and Face-Crop Audit

Use this reference for two independent CCTV diagnostics. Do not combine their experiments, decisions, or production changes.

## A. Native-memory / RSS investigation

### Confirmed evidence boundary
- A production trend can correlate RSS growth with `Face attr:` journal events without proving `cv2.dnn.Net.forward()` itself leaks.
- With the production OpenCV build and Caffe models, isolated tests showed:
  - cached `age_net`: one-time working-set increase then flat through 50 forwards;
  - cached `gender_net`: same pattern;
  - cached age+gender pair: one-time increase then flat through 50 inference pairs;
  - destroying isolated Net instances returned almost all process allocation after several runs.
- Therefore, do not prescribe per-inference reload or subprocess isolation as a root-cause fix solely from production RSS/D.6 correlation.

### Required staged experiment design
Run only after explicit approval. Each stage uses a disposable, lower-priority process and records `RSS`, `PSS`, `Pss_Anon`, and `Private_Dirty` from `/proc/<pid>/smaps_rollup` at cumulative 0/1/5/10/25/50 cycles.

1. **Static all-model harness** — cached MobileNet-SSD person detector + Haar crop + age/gender nets; replay existing stored full snapshots, no RTSP, no DB persistence, no production imports. Record memory immediately after model load, detector forward, crop, age forward, and gender forward at least on cycles 1 and 50.
2. **Decode-only harness** — only if stage 1 plateaus. Disposable `VideoCapture` process reads and discards RTSP frames, without detector/D.6/storage. This opens an extra camera stream, so obtain separate approval immediately before it.
3. **External production correlation** — no code instrumentation. Sample `/proc/<worker-pid>/smaps_rollup`, `MemoryCurrent/MemoryPeak`, and existing journal markers for person/crop/D.6/reconnect at a short fixed cadence.

### Decision rule
- Sustained anonymous/PSS growth in a stage is the reproducible boundary; stop expanding scope and present remediation options for that boundary.
- If every isolated stage plateaus, do not guess. The remaining hypothesis is worker event-loop/lifecycle interaction; propose narrowly scoped temporary instrumentation separately.

### Restart containment
- A restart resets PID, RSS, `MemoryPeak`, and uninterrupted evidence windows. It is immediate relief only, not proof of root cause.
- A 3-hour automatic restart can bound operational RSS, but creates capture gaps and makes a 4-hour continuous growth run impossible. Keep it disabled while evidence collection is the goal unless an explicit emergency policy exception is approved.

## B. Haar face-crop accuracy audit

### Scope separation
Haar false positives (for example price labels, product boxes, and shelving) are an accuracy/data-quality issue. They can trigger meaningless D.6 estimates but are not evidence of the native-memory root cause. Keep this workstream separate from memory experiments.

### Ground truth requirements
- Existing crop JPGs can measure **precision** only. They cannot measure faces missed by the detector.
- Build a reproducible stratified sample of existing crop events (e.g. recent, seeded random older, evenly time-spread), then use each event's paired stored full snapshot to replay candidate detector settings offline.
- Human visual labeling is the ground truth authority. If Hermes performs preliminary labels, mark `UNCERTAIN` only for genuinely ambiguous imagery; Tuan Hafizi reviews those cases.
- Label criteria:
  - `TRUE_FACE`: identifiable facial structure (eyes plus nose/mouth or other coherent facial geometry), even if partially occluded.
  - `FALSE_POSITIVE`: clearly non-human geometry/texture such as printed pricing, packaging, shelving, repeated straight lines, or product surface, with no coherent face.
  - `UNCERTAIN`: image blur, severe occlusion, or framing prevents either conclusion confidently.

### Candidate Haar evaluation
Compare baseline `minNeighbors=5, minSize=(60,60)` against proposed candidates such as:
- A: `minNeighbors=8, minSize=(80,80)`;
- B: `minNeighbors=10, minSize=(80,80)`.

For the same stored snapshots, record detection/no-detection, box count/largest box geometry, elapsed time, and manual-label match.

**Path and checkpoint safeguards**
- Normalize every DB media path before replay. Snapshot paths can be relative to the data root (for example `snapshots/...`), while face-crop paths can be absolute. Validate both paired files exist before sampling; a raw `os.path.isfile(snapshot_path)` can incorrectly yield an empty sample.
- Run one candidate/configuration at a time at low priority on the edge PC. Persist a per-config result/checkpoint after every completed configuration (and preferably incrementally per sample), then report timeout/failure rather than silently omitting a candidate.
- Label the crop selected by each candidate, not only the originally stored baseline crop. A stricter Haar setting can select a different box on the same snapshot, so baseline labels alone cannot establish candidate precision or true-face retention.

Report:
- precision = manually-confirmed candidate true faces / all candidate detections;
- true-face retention = baseline-true events where the candidate also selected a true face / all baseline-true events;
- representative baseline false positives eliminated, plus baseline true faces no longer selected as true by the candidate;
- median and p95 latency.

Suggested approval gate before a production parameter change: precision >=90%, true-face retention >=85% of baseline accepted true faces, and no material cadence/CPU regression on the i3-class edge PC.

Do not download or add a DNN face detector while native DNN memory root cause remains unresolved unless Tuan Hafizi separately approves a new model and that risk.
