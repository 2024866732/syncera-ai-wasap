# G2 RTX bootstrap — Task 3–4 (2026-08-17)

## Preflight (Task 2 recheck)

| Check | Result |
|-------|--------|
| Path | Hermes → Office → RTX jump |
| SSH | OK · `DESKTOP-RHDUSF3` · user `hafjet` |
| GPU | RTX 4070 · driver 610.88 · CUDA UMD 13.3 · idle ~38–44°C · ~0.7–1GB VRAM used |
| Disk | ~1007G · **>800G free** |
| RAM | 11Gi · ~7–9Gi available |
| system python3 | 3.14.4 · **no torch** |
| CCTV venv | `~/cctv-analysis/.venv` · torch `2.13.0+cu126` · **do not use for LiveTalking** |

## Task 3 — dirs + glue

```text
~/hafjet-live/{LiveTalking,wav,logs,bin/livetalking_glue,synthetic}
```

Deploy from Hermes repo `avatar/livetalking_glue/` via Office `scp` jump.  
Verify: `gpu_lock.py acquire|release`, live `circuit_breaker.py` → `action=run`, `speak_local_demo.py --dry-run`, `health_avatar.sh`.  
Leave **no** stale `LIVE_GPU_LOCK` after verify.

## Task 4 — LiveTalking install

```bash
export PATH="$HOME/.local/bin:$PATH"
# clone
git clone --depth 1 https://github.com/lipku/LiveTalking.git ~/hafjet-live/LiveTalking
# venv
uv python install 3.12
uv venv --python 3.12 ~/hafjet-live/venv-livetalking
PY=~/hafjet-live/venv-livetalking/bin/python
uv pip install --python $PY torch==2.9.1 torchvision==0.24.1 torchaudio==2.9.1 \
  --index-url https://download.pytorch.org/whl/cu128
uv pip install --python $PY -r ~/hafjet-live/LiveTalking/requirements.txt
uv pip install --python $PY gdown
# models (Drive folder from upstream README)
$PY -m gdown --folder 'https://drive.google.com/drive/folders/1FOC_MD6wdogyyX_7V1d4NDIO7P9NlSAJ' \
  -O ~/hafjet-live/models_dl/gdrive
cp ~/hafjet-live/models_dl/gdrive/wav2lip256.pth ~/hafjet-live/LiveTalking/models/wav2lip.pth
tar -xzf ~/hafjet-live/models_dl/gdrive/wav2lip256_avatar1.tar.gz -C ~/hafjet-live/LiveTalking/data/avatars
```

### Smoke (pass criteria)

```bash
cd ~/hafjet-live/LiveTalking
# weight load + avatar frame counts + cuda matmul — see bin/smoke_t4.py pattern
timeout 45s $PY app.py --transport webrtc --model wav2lip \
  --avatar_id wav2lip256_avatar1 --listenport 8010
# expect: Load checkpoint, warmup model, start http server
# timeout RC=124 is success for bounded smoke
```

Measured smoke: ckpt load OK · 550/550 avatar frames · http :8010 · post CB ~41°C / ~743 MiB · CCTV venv mtime unchanged · `~/hafjet-live` ~8.6G.

## Non-goals until later tasks

- Edge-TTS full speak queue wire (Task 5+)
- `--transport virtualcam` + Windows OBS preview ≥30s
- CCTV `SKIP_LIVE_LOCK` one-line patch (needs explicit OK)
- Hermes LLM Aina (G3)

## Do not

- Download weights onto Azure Hermes
- `source ~/cctv-analysis/.venv` for LiveTalking
- Commit `models/` or `models_dl/` into Hermes git
- Auto-start Task 5 after Task 4 without Tuan OK
