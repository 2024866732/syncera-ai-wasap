#!/usr/bin/env bash
set -e
source ~/tts_venv/bin/activate   # or: export PATH="$HOME/.local/bin:$PATH"
BASE=~/tts
mkdir -p "$BASE"
cd "$BASE"

echo "[dl] Malaysian-TTS-0.6B-v1"
hf download mesolitica/Malaysian-TTS-0.6B-v1 --local-dir "$BASE/Malaysian-TTS-0.6B-v1"

echo "[dl] DistilCodec-v1.0 weights (g_00204000)"
hf download IDEA-Emdoor/DistilCodec-v1.0 --local-dir "$BASE/DistilCodec-v1.0"

# BUG: hf download --include silently drops files ("Ignoring --include").
# Always pull config.json / model_config.json explicitly:
python - <<'PY'
from huggingface_hub import hf_hub_download
import os
base=os.path.expanduser('~/tts')
hf_hub_download(repo_id='mesolitica/Malaysian-TTS-0.6B-v1', filename='config.json',
                local_dir=os.path.join(base,'Malaysian-TTS-0.6B-v1'))
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='model_config.json',
                local_dir=os.path.join(base,'DistilCodec-v1.0'))
print('CONFIGS_OK')
PY
echo "DOWNLOAD_DONE"
