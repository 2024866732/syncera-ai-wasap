# PC Office Python ML venv — tested scripts & mesolitica Qwen3-TTS notes

All commands run on **PC Office** (`hafizi145@100.121.94.41`, Tailscale). Files
written to `/tmp` on the local/Azure side then `scp`-ed over (SCP needs Tuan's
approval each time — it blocks on timeout).

## 1. Working install script (`pc_install3.sh`)
```bash
set -e
export PATH="$HOME/.local/bin:$PATH"
python3 -m pip install --user --break-system-packages uv   # single allowed break
export PATH="$HOME/.local/bin:$PATH"
uv --version
uv python install 3.11                                      # stable, has torch wheels
rm -rf ~/tts_venv                                           # uv venv won't overwrite
uv venv --python 3.11 ~/tts_venv
VENV_PY="$HOME/tts_venv/bin/python"
uv pip install --python "$VENV_PY" torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python "$VENV_PY" "transformers" soundfile tqdm
uv pip install --python "$VENV_PY" "git+https://github.com/mesolitica/DistilCodec"
# DistilCodec declares NONE of these — each was a separate failed import (2026-07-20):
# librosa -> matplotlib -> wandb -> tensorboard -> torchaudio (7 sequential ModuleNotFoundError).
# torchaudio MUST be the CPU build on PC Office (plain install pulls CUDA -> libcudart.so.13 load error).
uv pip install --python "$VENV_PY" librosa matplotlib wandb tensorboard
uv pip install --python "$VENV_PY" --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu
"$VENV_PY" -c "import torch, transformers, soundfile, distilcodec, librosa, matplotlib, wandb, tensorboard, torchaudio; print(torch.__version__, transformers.__version__)"
```
Why not the obvious approaches: `python3 -m venv` fails (no `python3.14-venv`);
`pip --user` is blocked by PEP 668. Only `--break-system-packages` for the `uv`
binary works, then `uv` owns everything.

**⚠️ Pitfalls hit & debugged 2026-07-20:**
- `uv venv` creates a venv **WITHOUT a `pip` module**. `python -m pip` →
  `No module named pip`, and `which pip` may resolve to system 3.14 pip (PEP 668).
  ALWAYS install deps with `uv pip install --python "$VENV_PY" <pkgs>` — never
  `python -m pip install`.
- `huggingface_hub[cli]` extra does NOT exist (harmless `does not have an extra
  named cli` warning); `hf-xet` is auto-included. `hf` CLI is **NOT on PC Office**
  (only on the Azure gateway) — use the Python API there (see download note).
- DistilCodec undeclared deps (full chain, hit 2026-07-20 as 7 sequential
  ModuleNotFoundErrors): `librosa` → `matplotlib` → `wandb` → `tensorboard` →
  `torchaudio`. Install `librosa matplotlib wandb tensorboard` up front; then
  install `torchaudio` SEPARATELY from the CPU index (see next bullet).
- 🔴 **torchaudio CUDA trap on GPU-less PC Office:** plain
  `uv pip install torchaudio` pulls the **CUDA build**, which fails at runtime
  with `OSError: libcudart.so.13: cannot open shared object file` (no GPU/CUDA,
  only Intel iGPU). Fix: `uv pip install --python "$VENV_PY" --reinstall
  torchaudio --index-url https://download.pytorch.org/whl/cpu`. Always pair it
  with the torch CPU index you already used.

## 2. Download (Xet storage — `curl` does NOT work; `hf` CLI may be absent)
mesolitica models use **Xet** storage; `curl` only returns a redirect/broken
transfer. Two reliable paths:

**(a) Python API inside the venv — RECOMMENDED on PC Office** (`hf` CLI is not
installed there). Save the snippet below with `write_file` (no heredoc) to
`/tmp/dl.py`, `scp` it over, then run `source ~/tts_venv/bin/activate && python /tmp/dl.py`:
```python
from huggingface_hub import hf_hub_download
for f in ['model.safetensors','README.md','added_tokens.json','chat_template.jinja',
          'merges.txt','special_tokens_map.json','tokenizer.json','tokenizer_config.json','vocab.json']:
    hf_hub_download(repo_id='mesolitica/Malaysian-TTS-0.6B-v1', filename=f,
                    local_dir='/home/hafizi145/tts/Malaysian-TTS-0.6B-v1')
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='model_config.json',
                local_dir='/home/hafizi145/tts/DistilCodec-v1.0')
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='g_00204000',
                local_dir='/home/hafizi145/tts/DistilCodec-v1.0')
```
**(b) `hf` CLI (only where `hf` is on PATH, e.g. Azure gateway):** whole-repo
pull is simplest — `hf download REPO --local-dir DIR` (NO `--include`; passing
filenames positionally silently DROPS `--include`, wasting a cycle 2026-07-20).

## 3. Run script (`test_tts.py`)
```python
import os, re
import soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = os.path.expanduser('~/tts')
tok = AutoTokenizer.from_pretrained(f'{BASE}/Malaysian-TTS-0.6B-v1')
model = AutoModelForCausalLM.from_pretrained(f'{BASE}/Malaysian-TTS-0.6B-v1',
                                             torch_dtype='auto').to('cpu')
codec = DistilCodec.from_pretrained(
    config_path=f'{BASE}/DistilCodec-v1.0/model_config.json',
    model_path=f'{BASE}/DistilCodec-v1.0/g_00204000',
    use_generator=True, is_debug=False).eval()

text = 'Selamat datang ke HAFJET. Ada apa yang boleh saya bantu hari ini?'
for s in ['idayu', 'husein']:
    prompt = f'<|im_start|>{s}: {text}<|speech_start|>'
    out = model.generate(**tok(prompt, return_tensors='pt',
                        add_special_tokens=False).to('cpu'),
                         max_new_tokens=1024, temperature=0.7,
                         do_sample=True, repetition_penalty=1.1)
    sp = tok.decode(out[0]).split('<|speech_start|>')[-1].replace('<|endoftext|>', '')
    nums = list(map(int, re.findall(r'speech_(\d+)', sp)))
    y = codec.decode_from_codes(nums, minus_token_offset=False)
    sf.write(f'{BASE}/test_{s}.mp3', y[0, 0].cpu().numpy(), 24000)
    print('WROTE', f'{BASE}/test_{s}.mp3', 'tokens=', len(nums))
```
Run: `source ~/tts_venv/bin/activate && python /tmp/test_tts.py` (CPU ~10–30s/sentence).
All deps from §1 must be installed first.

## 4. mesolitica Malaysian-TTS model facts (verified 2026-07-20)
- **Architecture:** Qwen3 causal LM (`Qwen3ForCausalLM`) that *generates speech
  tokens*; a separate **DistilCodec** detokenizer turns them into 24 kHz audio.
  NOT a standard `text-to-audio` pipeline — needs both the TTS model AND the
  DistilCodec checkpoint.
- **Speakers** (prefix the prompt with `NAME: `): `husein`, `idayu`,
  `singaporean`, `DisfluencySpeech`, `singlish-speaker2050`, `singlish-speaker2202`,
  `haqkiem`.
- **Text must be NORMALIZED** (model trained on normalized text): write `one two
  three` not `123`; `A B C` not `ABC`. Unnormalized digits mispronounce.
- **License = None** on the HF card (not Apache/MIT). Fine for personal/dev use
  per Tuan's approval; do NOT deploy commercially until license is confirmed.
- **Size:** `model.safetensors` ~2.4 GB; + DistilCodec `g_00204000` ~1.6 GB.
- Top pick vs alternatives: `Malaysian-TTS-0.6B-v1` (13.7k downloads, Qwen3) is
  the most-used natural Malay TTS. The `Malaysian-F5-TTS-*` series are
  `cc-by-nc-4.0` = NON-COMMERCIAL, avoid for business. Parler-TTS tiny is
  Apache-licensed but lower quality / less natural.
