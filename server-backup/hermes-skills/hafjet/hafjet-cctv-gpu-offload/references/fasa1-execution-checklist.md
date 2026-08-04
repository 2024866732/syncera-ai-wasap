# Fasa 1 Pre-Execution Checklist (GPU Offload)

Source: session 2026-08-04. **approve 1 COMPLETE** (SSH two-way + rsync one-clip) and **approve 2 COMPLETE** (torch+ultralytics+single-clip test) were executed successfully — corrections from actual runs are inline below. approve 3 (scheduler) still pending.

## Approval framework
- `approve 1` → SSH key setup (two-way) + connectivity test + folder creation + rsync one-way test. ✅ DONE
- `approve 2` → pip install torch + ultralytics on RTX + CUDA check + YOLOv8n single-clip inference. ✅ DONE
- `approve 3` → enable scheduler both sides + dry-run batch. ⏳ PENDING
- Each approval only proceeds after the previous one passes. After #3: 7-day monitor before Fasa 2 consideration (separate approval).

## 1. SSH key generation & exchange (two-way)

### 1a. Office PC → RTX (push clips to RTX)
```bash
# On Office PC (hafizi145@100.121.94.41)
ssh-keygen -t ed25519 -C "office-pc-to-rtx" -f ~/.ssh/id_ed25519_office2rtx -N ""
cat ~/.ssh/id_ed25519_office2rtx.pub

# On RTX (hafizi145@100.119.32.87, WSL2)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<paste public key office2rtx>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Test (from Office PC) — NOTE: RTX SSH user is `hafjet`, NOT `hafizi145`
ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 'echo RTX_SSH_OK; hostname'
```

### 1b. RTX → Office PC (push results back)
```bash
# On RTX — generate key
ssh-keygen -t ed25519 -C "rtx-to-office" -f ~/.ssh/id_ed25519_rtx2office -N ""

# On Office PC — authorize
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<paste public key rtx2office>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Test (from RTX)
ssh -i ~/.ssh/id_ed25519_rtx2office hafizi145@100.121.94.41 'echo OFFICE_SSH_OK; hostname'
```

> WSL2 note: if the WSL2 IP changes per boot, use the stable Tailscale IP `100.119.32.87` everywhere.

## 2. Test rsync one-way (Office PC → RTX)
```bash
# Ensure staging dirs on RTX first (SSH user hafjet!)
ssh hafjet@100.119.32.87 'mkdir -p ~/cctv-analysis/staging ~/cctv-analysis/logs ~/cctv-analysis/results'

# Dry-run with ONE real clip — rsync MUST use the dedicated key (-e), default key is not used.
# Real recording path: /mnt/cctv/frigate/media/recordings/{date}/{hour}/{camera}/{ss.mm}.mp4
rsync -avz -e "ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes" --dry-run \
  "/mnt/cctv/frigate/media/recordings/2026-08-03/17/entrance/35.13.mp4" \
  hafjet@100.119.32.87:~/cctv-analysis/staging/test.mp4

# Remove --dry-run once confident; verify destination:
ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 'ls -la ~/cctv-analysis/staging/test.mp4'
```
**Pass criteria:** exit code 0, destination file same size as source, no permission/network errors.

## 3. Test CUDA + YOLOv8n inference (single sample clip)
```bash
# On RTX, inside venv
cd ~/cctv-analysis && source .venv/bin/activate

# 1) CUDA check — nvidia-smi NOT on PATH in WSL2, use the WSL lib path
/usr/lib/wsl/lib/nvidia-smi
python3 -c "import torch; print('CUDA', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')"

# 2) YOLO inference on sample clip — MUST use stream=True for full-video counts!
#    model(clip) without stream=True silently processes only ONE frame.
python3 - <<'PY'
from ultralytics import YOLO
import torch
model = YOLO("yolov8n.pt")
total_persons = 0
for r in model("~/cctv-analysis/staging/test.mp4", verbose=False, device=0, stream=True):
    total_persons += sum(1 for b in r.boxes if int(b.cls)==0) if r.boxes is not None else 0
print("total_persons:", total_persons)
print("vram_mb:", round(torch.cuda.memory_allocated()/1e6))
PY

# 3) Negative test: clip with no person (must return 0, not crash)
```
**Pass criteria:** CUDA True + device name "NVIDIA GeForce RTX 4070"; inference runs; VRAM < 4 GB for yolov8n single clip; empty clip doesn't crash.
**Verified 2026-08-04:** torch 2.13.0+cu126, ultralytics 8.4.115, Python 3.14.4 venv; 2880×1620/200-frame clip → 3.2 ms/frame, VRAM 22 MB, GPU 51°C.

## 4. Circuit breaker thresholds
| Metric | Warning (alert) | Circuit breaker (stop) |
|--------|------------------|------------------------|
| GPU utilisation | >85% sustained 10 min | >95% sustained 5 min |
| GPU temperature | >80°C | >88°C |
| VRAM allocated | >8 GB | >10.5 GB (12 GB card) |
| CPU (RTX) | >80% | >95% |
| RAM (RTX) | >9 GB | >10.5 GB (11 GB total) |
| Infer latency per clip | >2 s | >5 s sustained 10 clips |
| Batch failure rate | >10% | >30% |

**Auto-stop sequence:** stop scheduler (cancel current batch) → log `status: circuit_breaker` + reason → notify Tuan (Telegram) → wait temp <60°C / VRAM <6 GB → NO auto-resume; needs manual Tuan approval.

Monitor command (WSL2 — use full path): `/usr/lib/wsl/lib/nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used --format=csv`

## 5. daily_summary_YYYY-MM-DD.json schema
Generated 00:05 after the date. Location: `/mnt/cctv/frigate/analysis/daily_summary_{YYYY-MM-DD}.json`

```json
{
  "date": "2026-08-04",
  "generated_at": "2026-08-05T00:05:00+08:00",
  "batch_count": 24,
  "clips_processed": 180,
  "clips_ok": 175,
  "clips_failed": 4,
  "clips_skipped": 1,
  "batches": {
    "total_duration_sec": 2160,
    "gpu_infer_ms_avg": 150,
    "gpu_mem_mb_peak": 2048,
    "gpu_temp_max_c": 72,
    "circuit_breaker_fired": false
  },
  "detections": {
    "person_clips": 62,
    "total_person_detections": 148,
    "max_persons_in_single_clip": 3
  },
  "cameras": {
    "entrance": {"clips": 120, "person_clips": 40, "failed": 1},
    "outdoor_shop": {"clips": 60, "person_clips": 22, "failed": 3}
  },
  "errors": [
    {"clip_id": "…", "error": "…", "ts": "…"}
  ],
  "next_action": "ok | review_errors | circuit_breaker_stopped"
}
```

## 6. Execution order (when all approvals granted)
| # | Action | Approval | Status |
|---|--------|----------|--------|
| 1 | SSH key Office PC → RTX + test | #1 | ✅ DONE 2026-08-04 |
| 2 | SSH key RTX → Office PC + test | #1 | ✅ DONE 2026-08-04 |
| 3 | rsync one-way test (dry-run + 1 clip) | #1 | ✅ DONE (1,147,837 B, exit 0) |
| 4 | pip install torch + ultralytics (cu126 wheel) | #2 | ✅ DONE (torch 2.13.0+cu126, ultralytics 8.4.115) |
| 5 | CUDA + YOLO sample clip test | #2 | ✅ DONE (CUDA True, 200 frames, VRAM 22 MB) |
| 6 | Setup scheduler both sides + monitor | #3 | ⏳ PENDING |
| 7 | Dry-run first batch (1 manual batch) | #3 | ⏳ PENDING |
| 8 | Live 60-min batch + daily summary | #3 | ⏳ PENDING |

## Blocker observed 2026-08-04 (approve-1 gate)
- RTX WSL2: port 22 `Connection refused`; `tailscale ssh` → 502 Bad Gateway; ports 22/2222/2022/8022 all closed. Tailscale node active but no sshd.
- **Fix:** on RTX WSL2 shell run `sudo apt install -y openssh-server && sudo service ssh start && sudo systemctl enable ssh` then verify `ss -tlnp | grep :22`.
- This is a prerequisite before ANY SSH key work; Tuan must run it (agent has no direct shell on the RTX WSL2 node).
