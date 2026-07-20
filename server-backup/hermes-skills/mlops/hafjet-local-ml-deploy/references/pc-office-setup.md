# PC Office (hafjet-pc-office) — Environment Facts & Setup

Verified 2026-07-20 during Malaysian-TTS + VoxCPM2 deploy.

## Hardware / OS
- TS reachable at `100.121.94.41` (Tailscale). SSH only. Ubuntu (7.0.0 kernel reported).
- CPU: 4-core Intel i3 (no GPU; Intel iGPU only) → **CPU inference only**.
- RAM: 16 GiB (9.5 GiB free at idle). Disk: 100 GB LV, ~78 GB free.
- 320 GB HDD = user docs — **NEVER format/touch**.

## Python / package state
- ONLY `python3.14` system-wide (`/usr/bin/python3.14`). `python3.venv` pkg NOT installed.
- PEP 668 externally-managed → `pip install` / `pip install --user` BLOCKED.
- No `hf` CLI. `uv` not preinstalled (install via `--break-system-packages`, see SKILL.md).
- `uv venv` creates a venv with **no `pip` module** → never use `python -m pip`; use `uv pip install --python <venv>/bin/python`.

## Proven working setup (do not reinvent)
```bash
python3 -m pip install --user --break-system-packages uv
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.11
rm -rf ~/tts_venv && uv venv --python 3.11 ~/tts_venv
V=~/tts_venv/bin/python
uv pip install --python $V torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python $V transformers "huggingface_hub" soundfile tqdm
```
- For TTS research repos, also need (undeclared): librosa, matplotlib, wandb,
  tensorboard, torchaudio (cpu index!), einops, vector_quantize_pytorch.
- `torchaudio` MUST use `--index-url https://download.pytorch.org/whl/cpu` or it pulls
  a CUDA build → `libcudart.so.13` missing on CPU box.

## HF downloads
- Use Python `huggingface_hub.hf_hub_download()` for single files. `hf download --include`
  silently drops files. Xet-storage models can't be curl'd.
- Unauthenticated downloads work but are rate-limited (warning only).

## Detached long runs (SSH idle drops)
Generation >~1 min can drop the SSH session (exit 255, kills process).
```bash
ssh user@100.121.94.41 "source ~/tts_venv/bin/activate; setsid bash -c 'python /tmp/run.py' >/dev/null 2>&1 & echo LAUNCHED"
# poll: ssh user@100.121.94.41 "cat ~/path/run.log"
```
