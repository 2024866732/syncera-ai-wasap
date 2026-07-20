#!/usr/bin/env bash
# Full one-shot PC Office setup for mesolitica/Malaysian-TTS-0.6B-v1 (CPU).
# Run on PC Office:  bash /tmp/pc_install.sh
set -e
export PATH="$HOME/.local/bin:$PATH"

echo "[0] install uv (user, override PEP668 for this single tool)"
python3 -m pip install --user --break-system-packages uv
export PATH="$HOME/.local/bin:$PATH"
uv --version

echo "[1] install standalone python 3.11 (has torch wheel)"
uv python install 3.11

echo "[2] create venv py3.11 (clear any broken prior venv)"
rm -rf ~/tts_venv
uv venv --python 3.11 ~/tts_venv
VENV_PY="$HOME/tts_venv/bin/python"

echo "[3] torch CPU"
uv pip install --python "$VENV_PY" torch --index-url https://download.pytorch.org/whl/cpu

echo "[4] transformers + hf + audio deps"
uv pip install --python "$VENV_PY" "transformers" "huggingface_hub" soundfile tqdm

echo "[5] DistilCodec (mesolitica fork)"
uv pip install --python "$VENV_PY" "git+https://github.com/mesolitica/DistilCodec"

echo "[6] DistilCodec hidden deps (NOT in setup.py)"
uv pip install --python "$VENV_PY" librosa matplotlib wandb tensorboard \
  torchaudio --index-url https://download.pytorch.org/whl/cpu \
  einops vector_quantize_pytorch

echo "INSTALL_DONE"
"$VENV_PY" -c "import torch, transformers, soundfile, distilcodec, librosa; print('torch', torch.__version__); print('tf', transformers.__version__)"
