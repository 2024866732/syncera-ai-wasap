# DNN Memory Mitigation — Option A + C (Implemented 2026-08-03)

## Context
Production cctv-worker continuous RSS growth (~40.9 MB/h) correlated with `person_detected` (r≈0.87) and `Face attr` (r≈0.81). Root cause: OpenCV `cv2.dnn.Net.forward()` native accumulation. NumPy `.copy()` + `del face_array` is kept but insufficient alone.

Models: age + gender Caffe ~91 MB total under `/mnt/cctv/models/`.
Baseline post-restart: ~260–350 MB. Escalation: **900 MB alert only, no auto-restart**.

---

## Status (2026-08-03)

| Piece | Status |
|-------|--------|
| **Option C** code in `app/vision/face_attr.py` | **LOADED in production** |
| Backup | `app/vision/face_attr.py.before-optionc` |
| One approved restart to load C | Done (helper may exit 1 on stale UI marker — ignore if health OK) |
| **Option A** unit sources | `~/projects/hafjet-cctv-worker/systemd/` + `/etc/systemd/system/` |
| **Option A** timer in `/etc` + enabled | **VERIFIED enabled** (user TTY sudo install 2026-08-03). Cron fallback **removed**. Verify: `systemctl list-timers \| grep cctv-worker-restart` |

---

## Option C — Production pattern (do not re-introduce lazy globals)

**Forbidden:** module-level `_age_net` / `_gender_net` / `_get_networks()` cache.

**Required:**
- `_load_networks()` each call via `readNetFromCaffe`
- `predict_age_gender`: init `age_net = gender_net = None`, try load+forward, **`finally: _unload_networks(age_net, gender_net)`**
- `_unload_networks`: `del` nets + `gc.collect()` — **no dummy `forward()` required** (dummy forward was proposed early; production uses simple del+gc)

**Signature of `predict_age_gender` unchanged** → `main.py` untouched.

### Verification after restart
Journal (redact RTSP) should show **one load line per Face attr**, not a single lifetime load:
```
Age+gender DNN models loaded for single inference (unload after)
Face attr: gender=… age=…
```
If you only see Face attr without per-call load lines, old lazy-cache code may still be running (stale process).

Smoke offline (from project dir, venv python):
```bash
cd ~/projects/hafjet-cctv-worker && .venv/bin/python -c "
import inspect, numpy as np, app.vision.face_attr as fa
assert '_age_net' not in open(fa.__file__).read()
assert 'finally:' in inspect.getsource(fa.predict_age_gender)
print(fa.predict_age_gender(np.zeros((120,120,3), dtype=np.uint8)))
"
```

### Latency / risk
- +~100–150 ms per D.6 call (model load)
- Only on face crop conf ≥ 0.70 path
- Peak memory may spike briefly on first post-restart inferences; watch MemoryPeak separately from steady Current

---

## Option A — 6-hourly timer (A1)

### Unit contents
**`cctv-worker-restart.service`** — Type=oneshot, `ExecStart=/usr/bin/systemctl restart cctv-worker`

**`cctv-worker-restart.timer`** — `OnCalendar=*-*-* 00,06,12,18:00:00`, `Persistent=true`, `RandomizedDelaySec=300`

Source copies (agent-writable):
```
~/projects/hafjet-cctv-worker/systemd/cctv-worker-restart.service
~/projects/hafjet-cctv-worker/systemd/cctv-worker-restart.timer
```

### Install (human TTY sudo — agent BatchMode often cannot)
```bash
sudo cp ~/projects/hafjet-cctv-worker/systemd/cctv-worker-restart.service /etc/systemd/system/
sudo cp ~/projects/hafjet-cctv-worker/systemd/cctv-worker-restart.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cctv-worker-restart.timer
systemctl list-timers --all | grep cctv-worker-restart
```

**Do not** treat timer install as an immediate worker restart. First fire is next calendar slot (or catch-up if `Persistent=true` and slot missed — be aware of catch-up behavior).

### Pitfall: sudo / BatchMode
- `sudo -n` / non-TTY SSH: `A terminal is required to authenticate` for installing units
- Scoped sudoers for worker restart does **not** allow writing `/etc/systemd/system/`
- Leave unit files in project `systemd/`; hand off install commands to Tuan Hafizi when agent cannot elevate

### Option A fallback (historical — only if `/etc` timer missing)
NOPASSWD covers only `systemctl restart/status cctv-worker`. User crontab + wrapper was used briefly, then **removed when systemd timer was enabled**.

Do **not** re-add crontab while `cctv-worker-restart.timer` is enabled (double restart). Inert leftover: `~/.local/bin/cctv-worker-scheduled-restart.sh` may still exist on disk.

---

## Combined strategy
| Layer | Role |
|-------|------|
| C | Reduce per-inference native accumulation |
| A | Hard ceiling via scheduled restart regardless of C efficacy |

Post-C monitoring: track slope of MemoryCurrent vs Face attr count over hours. If slope stays near zero, A still stays as safety valve. If slope returns, escalate — do not auto-restart outside A timer / explicit approval.

---

## Related
- Full proposal archive: `~/.hermes/cache/documents/cctv-dnn-mitigation-option-a-c-proposal-2026-08-03.txt`
- Shared `python -m app.main` pkill pitfall: never kill worker via broad pkill when restarting siblings
