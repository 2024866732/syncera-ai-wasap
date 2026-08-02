---
name: hafjet-ai-model-runtime
description: "Run/serve Hugging Face ML models (TTS, LLM, whisper, vision) on HAFJET's on-demand PC Office worker (hafjet-pc-office). Covers env bootstrap when venv fails (uv + pinned py3.11), model download via `hf` (Xet storage), and the mesolitica/Malaysian-TTS Qwen3+DistilCodec workflow. Use whenever Tuan wants to self-host/test an AI model instead of paying for an API or running it on the 1GB Azure box."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET AI Model Runtime (PC Office worker)

Class of work: download, install deps for, and run/sandbox ML models from Hugging Face on HAFJET's on-prem PC Office worker. Trigger this when Tuan asks to test a TTS/LLM/STT/vision model, replace a paid API (Edge TTS, OpenAI), or benchmark a checkpoint before deploying.

## Target: hafjet-pc-office
- Reachable via Tailscale SSH: `ssh hafizi145@100.121.94.41` (raw IP → MEDIUM security-scan approval every time; see `hafjet-command-safety`).
- **Workflow rule:** Before giving manual "copy-paste this" instructions, always try SSH first. If Tuan says he has Tailscale access, that means you CAN SSH in.
- Confirmed profile (2026-07-26): Ubuntu 26.04, **Intel i3-2100 (Sandy Bridge, 2011)**, 16GB RAM, **NO GPU** (Intel iGPU only → CPU inference only), ~78G free on `/`.
- **CPU instruction set:** i3-2100 has AVX **but NOT AVX2/FMA/AVX-512**. Any ML framework compiled with `-mavx2` or higher **will crash with SIGILL** (exit 132). Always prefer ONNX Runtime when available instead of native PaddlePaddle/TensorFlow.
- On-demand: may be asleep; first `ssh` wakes/probes it. If SSH times out, Tuan must power it on.
- **NEVER format/delete the 320GB HDD (`/dev/sdb1`)** — customer docs live there.

## Pitfall: Python 3.14 venv + uv
PC Office ships Python 3.14.4 ONLY, with **no python3-venv**. `sudo apt install` is blocked. Use `uv` user-install (already present at `~/.local/bin/uv`). Always use `--python 3.13` or `--python 3.11` for ML frameworks (PyTorch/paddlepaddle often have no 3.14 wheel):
```bash
uv python install 3.13
uv venv --python 3.13 ~/ocr-env
source ~/ocr-env/bin/activate
```

```bash
python3 -m pip install --user uv
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.11
uv venv --python 3.11 ~/tts_venv
source ~/tts_venv/bin/activate
# now pip install normally
```

Pitfall: never suggest `apt install python3.14-venv` — sudo is blocked. `uv` user-install is the ONLY path.

## Step 1 — Download models via `hf` (NOT curl)
Modern HF repos use **Xet storage**. `curl .../resolve/main/model.safetensors` returns a 302 to an `xet-bridge` CDN and will NOT yield the file (and `-L` just fetches a redirect stub). Use the `hf` CLI inside the venv:

```bash
pip install "huggingface_hub[cli]"
hf download mesolitica/Malaysian-TTS-0.6B-v1 --local-dir ~/tts/Malaysian-TTS-0.6B-v1
```

## Step 2 — Run (concrete: Malaysian-TTS-0.6B-v1)
This is a **Qwen3 causal LM that emits speech tokens**, decoded to 24kHz audio by **DistilCodec** — NOT a standard `pipeline("text-to-speech")`. Full recipe + speaker list in `references/malaysian-tts.md`. Key facts:
- Needs `git+https://github.com/mesolitica/DistilCodec` + IDEA-Emdoor/DistilCodec-v1.0 weights (`model_config.json`, `g_00204000`).
- Prompt format: `<|im_start|>{speaker}: {text}<|speech_start|>`.
- **License: None declared on the HF card** → do NOT use commercially until verified. The 2026-07-20 test run was approved personal-use only.
- CPU inference on PC Office: ~10–30s per short sentence. Fine for dev/single-file, NOT realtime multi-user.

## Approval & safety notes
- SCP/SSH to `100.121.94.41` triggers a MEDIUM approval each time (raw IP). Write scripts to `/tmp` locally, SCP them, then run remotely — never inline heredocs/pipe-to-python (see `hafjet-command-safety`).
- For **commercial** TTS, prefer models with explicit Apache/MIT license (e.g. parler-tts) over unlicensed mesolitica checkpoints. Tuan currently uses Edge TTS Yasmin (ms-MY-YasminNeural) for production — keep that until a licensed self-hosted option is validated.

## OCR Deployment (RapidOCR/ONNX)

When Tuan asks for OCR on PC Office — **do NOT install PaddlePaddle**. The i3-2100 CPU lacks AVX2 → PaddlePaddle 3.x crashes with SIGILL. Use **RapidOCR** (PP-OCRv6 models via ONNX Runtime) instead:

```bash
# Fresh env, no PaddlePaddle
uv venv ~/ocr-env --python 3.13
source ~/ocr-env/bin/activate
uv pip install rapidocr-onnxruntime pillow
```

Usage:
```python
from rapidocr_onnxruntime import RapidOCR
engine = RapidOCR()
result, elapse = engine('invois.jpg')
for box, text, conf in result:
    print(f'{text} ({conf:.0%})')
```

Performance on i3-2100: ~1.5s/image (detection 1.16s + recognition 0.32s). Malay support via PP-OCRv6 multilingual model (50 languages, no explicit Malay model needed — multilingual handles it).

Full setup details in `references/ocr.md`.

## Ollama on Limited RAM Servers (≤4GB)

When deploying local LLMs on small servers (UpCloud trial 2C/4GB, Azure B1s 1GB+swap), Ollama is the easiest path but has strict RAM limits.

### Installation
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### RAM Limits by Model Size
| Model | Size | Min RAM Needed | Notes |
|-------|------|----------------|-------|
| gemma:2b | 1.5 GB | 2.5 GB | Safest on 4GB server |
| llama3.2:3b | 2.0 GB | 3.0 GB | Tight on 4GB with other services |
| phi3:mini | 2.2 GB | 3.5 GB | Will OOM on 4GB if services running |

### CRITICAL: OOM Pitfall
On a 3.8GB server with Docker containers (Postgres, n8n, monitoring), loading a 3B+ model triggers OOM kill. The kernel OOM killer targets Ollama because it's the largest memory consumer.

**Symptoms:**
- `journalctl -u ollama` shows: `The kernel OOM killer killed some processes in this unit`
- Model loads partially then connection drops (curl exit code 52 = empty reply)

**Fix — Free RAM before loading model:**
```bash
# Stop non-essential containers
docker stop hafjet-stack-n8n-1          # ~200MB
docker stop monitoring-grafana-1        # ~200MB
docker stop monitoring-cadvisor-1       # ~50MB

# Configure Ollama for low RAM
sudo mkdir -p /etc/systemd/system/ollama.service.d
cat << 'EOF' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_CONTEXT_LENGTH=2048
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

**Verify model loaded:**
```bash
curl -s http://localhost:11434/api/ps  # Should show loaded model
free -h                                 # Check available RAM
```

### SSH Session Overload Pitfall
Running Ollama inference via SSH can hang the connection (CPU-heavy, blocks SSH banner exchange). If SSH stops responding after an Ollama test:
1. Wait 60s for inference to complete
2. If still stuck, restart server via UpCloud API (hard stop + start)
3. Configure Ollama to bind `0.0.0.0:11434` for remote API access instead of SSH tunneling

### Test Inference via API
```bash
# Short test (50 tokens max)
curl -s --max-time 120 http://localhost:11434/api/generate \
  -d '{"model":"llama3.2:3b","prompt":"Say hi","stream":false,"options":{"num_predict":20}}'

# Chat API
curl -s --max-time 120 http://localhost:11434/api/chat \
  -d '{"model":"llama3.2:3b","messages":[{"role":"user","content":"Hi"}],"stream":false}'
```

## References
- `references/malaysian-tts.md` — full run recipe, dependency list, speaker list, limitations, license status.
- `references/ocr.md` — RapidOCR setup, PaddlePaddle crash workaround, test results.
