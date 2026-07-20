---
name: hf-local-model-deploy
description: "Deploy/run Hugging Face models locally on HAFJET infra (PC Office worker, no GPU). Covers Qwen3+DistilCodec TTS, the DistilCodec undeclared dependency chain, CPU-only torch/torchaudio builds, and the PC Office venv bootstrap when python3-venv/PEP 668 block normal venv creation."
version: 1.0.0
author: HAFJET (M) SDN BHD
---
# HF Local Model Deploy (HAFJET)

Run Hugging Face speech/LLM models locally — mainly on the **PC Office worker**
(hafjet-pc-office, TS 100.121.94.41), which has NO GPU (Intel iGPU only → CPU
inference). Use `hf` CLI on the Azure gateway for search/list; use scripts on PC
Office for actual run/download.

## When to use
- Tuan wants to test a HF model locally (TTS, LLM, whisper) before any cloud/bot use.
- Downloading model weights / codec checkpoints via `hf download` or `hf_hub_download`.
- Setting up a Python env on PC Office where `python3 -m venv` / `pip` are blocked.

## PC Office environment facts (verified 2026-07-20)
- Only **Python 3.14** system-wide; `python3.14-venv` package NOT installed →
  `python3 -m venv` fails ("ensurepip is not available").
- System Python is **PEP 668 externally-managed** → `python3 -m pip --user` is blocked.
- No `hf` CLI, no `uv` preinstalled. ~16 GB RAM, 4-core i3, no GPU.
- **Fix:** install `uv` with `--break-system-packages`, then Python 3.11 + `uv venv`:
  ```bash
  python3 -m pip install --user --break-system-packages uv
  uv python install 3.11
  rm -rf ~/tts_venv && uv venv --python 3.11 ~/tts_venv
  ```
  The venv has **NO pip module** → always `uv pip install --python ~/tts_venv/bin/python <pkg>`.
  `pip` in the shell resolves to system 3.14 (blocked) even with venv active — never trust it.

## CRITICAL: CPU-only installs (no GPU)
- torch: `uv pip install --python ~/tts_venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu`
- torchaudio MUST also be CPU build or it links `libcudart.so.13` and crashes:
  `uv pip install --python ~/tts_venv/bin/python --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu`

## DistilCodec undeclared dependencies
`mesolitica/DistilCodec` (git install) does NOT declare these but imports them at top
level, so imports fail one-by-one until all present:
`librosa matplotlib wandb tensorboard torchaudio einops vector_quantize_pytorch`
Install them with `uv pip` into the 3.11 venv.

## Xet storage downloads
Models using HF Xet storage can't be `curl`'d directly. On PC Office (no `hf` CLI),
use the Python API:
```python
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='model_config.json',
                local_dir='~/tts/DistilCodec-v1.0')
```

## Safety / scope
- SCP to PC Office is a raw-IP command that needs explicit approval each time (don't retry on timeout).
- Confirm LICENSE before any commercial/customer-facing use. `mesolitica/Malaysian-TTS-0.6B-v1`
  declares `license: None` (undeclared) → personal/dev use only until confirmed; NOT for the HAFJET bot.

See `references/malaysian-tts-deploy.md` for the full Malaysian-TTS inference snippet,
speaker list, and normalized-text requirement.
