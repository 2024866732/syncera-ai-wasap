# PC Office venv setup (Python 3.14, PEP 668, no python3-venv)

HAFJET PC Office (`hafjet-pc-office`, TS 100.121.94.41): only Python 3.14 system-wide,
NO `python3-venv` package, PEP 668 externally-managed. `python3 -m venv` and
`pip --user` both fail. Fix: install `uv` with `--break-system-packages` (single tool
to ~/.local/bin, does NOT touch system packages), then let `uv` manage Python 3.11 + venv.

```bash
export PATH="$HOME/.local/bin:$PATH"
python3 -m pip install --user --break-system-packages uv
uv --version                       # 0.11.x
uv python install 3.11             # standalone, has torch wheels
rm -rf ~/tts_venv
uv venv --python 3.11 ~/tts_venv
VENV_PY="$HOME/tts_venv/bin/python"

# torch MUST come from the CPU index (default torchaudio pulls CUDA build)
uv pip install --python "$VENV_PY" torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python "$VENV_PY" "transformers" "huggingface_hub" soundfile tqdm
uv pip install --python "$VENV_PY" "git+https://github.com/mesolitica/DistilCodec"
# DistilCodec undeclared deps (install all or it fails progressively):
uv pip install --python "$VENV_PY" librosa matplotlib wandb tensorboard einops vector_quantize_pytorch
# torchaudio MUST be CPU build too:
uv pip install --python "$VENV_PY" --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu
```

NOTE: venv created by `uv` has NO `pip` module — always drive installs with
`uv pip install --python ~/tts_venv/bin/python ...` (or `python -m pip` won't exist).
