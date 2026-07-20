# Pinned dependency versions — PC Office TTS venv (2026-07-20)

Install method: `uv pip install --python ~/tts_venv/bin/python <pkg>`
Base: Python 3.11.15 venv (uv), torch CPU index.

| Package | Version | Note |
|---|---|---|
| torch | 2.13.0+cpu | `--index-url https://download.pytorch.org/whl/cpu` |
| torchaudio | 2.11.0+cpu | MUST reinstall from CPU index (default = CUDA build, crashes) |
| transformers | 5.14.1 | |
| huggingface_hub | 1.24.0 | hf-xet 1.5.2 auto-pulled (Xet storage) |
| soundfile | 0.14.0 | |
| librosa | 0.11.0 | pulls numba/llvmlite/scikit-learn (~3 min resolve) |
| matplotlib | 3.11.1 | |
| wandb | 0.28.1 | |
| tensorboard | 2.21.0 | |
| einops | 0.8.2 | |
| vector_quantize_pytorch | 1.30.1 | |
| distilcodec | 0.1 (git master @ 3173efd) | `git+https://github.com/mesolitica/DistilCodec` |
| uv | 0.11.29 | installed via `python3 -m pip install --user --break-system-packages uv` |

## Model weights
| Repo | Files | Size |
|---|---|---|
| mesolitica/Malaysian-TTS-0.6B-v1 | model.safetensors + tokenizer/* | ~2.4 GB |
| IDEA-Emdoor/DistilCodec-v1.0 | g_00204000 + model_config.json | ~1.6 GB |
