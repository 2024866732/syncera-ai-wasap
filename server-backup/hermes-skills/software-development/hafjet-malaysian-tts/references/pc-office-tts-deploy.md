# PC Office Malay-TTS Deploy — Exact Recipe

Target: `hafjet-pc-office` (TS 100.121.94.41, Ubuntu, i3/16GB, **NO GPU**, only Python 3.14 system).
Run all steps over SSH from the Azure gateway (or any node with SSH to PC Office).

## 1. Bootstrap env (host has no venv, PEP 668 blocks pip --user)
```bash
# on PC Office:
python3 -m pip install --user --break-system-packages uv
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.11
rm -rf ~/tts_venv
uv venv --python 3.11 ~/tts_venv
VENV_PY="$HOME/tts_venv/bin/python"
# install deps (uv venv has NO pip module -> use uv pip)
uv pip install --python "$VENV_PY" torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python "$VENV_PY" "transformers" "huggingface_hub" soundfile tqdm
uv pip install --python "$VENV_PY" "git+https://github.com/mesolitica/DistilCodec"
# DistilCodec does NOT declare deps -> install manually:
uv pip install --python "$VENV_PY" librosa matplotlib wandb tensorboard
uv pip install --python "$VENV_PY" --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu
uv pip install --python "$VENV_PY" einops vector_quantize_pytorch
```

## 2. Download model + codec weights
`hf download --include` is IGNORED (warning). Use `hf_hub_download()` per file from the venv:
```bash
source ~/tts_venv/bin/activate
python - <<'PY'
from huggingface_hub import hf_hub_download
base = '/home/hafizi145/tts'
for f in ['config.json','model.safetensors','README.md','added_tokens.json',
          'chat_template.jinja','merges.txt','special_tokens_map.json',
          'tokenizer.json','tokenizer_config.json','vocab.json']:
    hf_hub_download(repo_id='mesolitica/Malaysian-TTS-0.6B-v1', filename=f,
                    local_dir=f'{base}/Malaysian-TTS-0.6B-v1')
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='g_00204000',
                local_dir=f'{base}/DistilCodec-v1.0')
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='model_config.json',
                local_dir=f'{base}/DistilCodec-v1.0')
PY
```
> NOTE: `hf` CLI is NOT on PC Office (only on Azure gateway). Use the Python API.

## 3. Patch DistilCodec CUDA hardcodes (CPU-only box)
File: `~/tts_venv/lib/python3.11/site-packages/distilcodec/distil_codec.py`
- Line ~94 (in `from_pretrained`):
  `codec.device = torch.device('cuda:{:d}'.format(local_rank))`
  → `codec.device = torch.device('cpu')`
- Line ~588 (in `decode_from_codes`):
  `...unsqueeze(-1).cuda()`
  → `...unsqueeze(-1).cpu()`

Without these, you get `AssertionError: Torch not compiled with CUDA enabled`.

## 4. Run
```bash
source ~/tts_venv/bin/activate
cd ~/tts
python test_tts.py
```
Outputs `~/tts/test_idayu.mp3` + `~/tts/test_husein.mp3` (24 kHz).

## 5. Hallucination fix (post-sentence gibberish)
The model rarely emits `<|endoftext|>` (id 151643), so sampled output overran into ~1172 codes of karut. Use GREEDY (`do_sample=False`) + `eos_token_id=151643` + trim at first EOS. See `scripts/test_tts.py`.
