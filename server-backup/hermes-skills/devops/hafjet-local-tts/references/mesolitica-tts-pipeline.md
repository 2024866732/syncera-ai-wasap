# mesolitica/Malaysian-TTS-0.6B-v1 — tested pipeline (PC Office, CPU)

Verified working 2026-07-20 on hafjet-pc-office (16GB RAM, i3, no GPU).

## Install (run inside venv built per ../ SKILL.md "PC Office environment gotchas")
```
uv pip install --python ~/tts_venv/bin/python \
  transformers soundfile librosa matplotlib wandb tensorboard \
  einops vector_quantize_pytorch
uv pip install --python ~/tts_venv/bin/python --reinstall torchaudio \
  --index-url https://download.pytorch.org/whl/cpu
```

## Download (HF Xet storage → use hf/hf_hub_download, NOT curl)
```
uv pip install --python ~/tts_venv/bin/python "huggingface_hub"
# in venv python:
from huggingface_hub import hf_hub_download
# model
hf_hub_download(repo_id='mesolitica/Malaysian-TTS-0.6B-v1', filename='model.safetensors', local_dir='~/tts/Malaysian-TTS-0.6B-v1')
# ... + tokenizer files (added_tokens.json, tokenizer*.json, vocab.json, merges.txt, special_tokens_map.json, chat_template.jinja)
# codec weights (separate repo!)
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='g_00204000', local_dir='~/tts/DistilCodec-v1.0')
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='model_config.json', local_dir='~/tts/DistilCodec-v1.0')
```
Note: `huggingface_hub[cli]` extra does NOT exist (hf-xet auto-pulled). `hf` CLI
is NOT on PC Office — use the Python API.

## test_tts.py (FINAL WORKING — CPU forced)
```python
import os, re
import torch
# PC Office has NO GPU. DistilCodec.from_pretrained() hardcodes
#   codec.device = torch.device('cuda:0')  -> .to() crashes on CPU box.
# Intercept torch.device so any 'cuda:*' resolves to 'cpu'.
# (Patching only torch.cuda.is_available is NOT enough.)
_orig = torch.device
class _CpuDevice(torch.device):
    def __new__(cls, *a, **k):
        if a and isinstance(a[0], str) and a[0].startswith('cuda'):
            return _orig('cpu')
        return _orig(*a, **k)
torch.device = _CpuDevice
torch.cuda.is_available = lambda: False
os.environ['CUDA_VISIBLE_DEVICES'] = ''

import soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = os.path.expanduser('~/tts')
MODEL_DIR = os.path.join(BASE, 'Malaysian-TTS-0.6B-v1')
CODEC_CFG = os.path.join(BASE, 'DistilCodec-v1.0', 'model_config.json')
CODEC_CKPT = os.path.join(BASE, 'DistilCodec-v1.0', 'g_00204000')

codec = DistilCodec.from_pretrained(
    config_path=CODEC_CFG, model_path=CODEC_CKPT,
    use_generator=True, is_debug=False).eval()
tok = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, torch_dtype='auto').to('cpu')

# MUST normalize text: "123" -> "one two three", "ABC" -> "A B C"
string = 'Selamat datang ke HAFJET. Ada apa yang boleh saya bantu hari ini?'
for s in ['idayu', 'husein']:
    prompt = f'<|im_start|>{s}: {string}<|speech_start|>'
    out = model.generate(
        **tok(prompt, return_tensors='pt', add_special_tokens=False).to('cpu'),
        max_new_tokens=1024, temperature=0.7, do_sample=True,
        repetition_penalty=1.1)
    sp = tok.decode(out[0]).split('<|speech_start|>')[-1].replace('<|endoftext|>', '')
    nums = list(map(int, re.findall(r'speech_(\d+)', sp)))
    y = codec.decode_from_codes(nums, minus_token_offset=False)
    sf.write(os.path.join(BASE, f'test_{s}.mp3'), y[0, 0].cpu().numpy(), 24000)
    print('WROTE', f'test_{s}.mp3', 'tokens=', len(nums))
```

## Run
```
ssh hafizi145@100.121.94.41 "source ~/tts_venv/bin/activate && cd ~/tts && python /tmp/test_tts.py"
```
Expect ~10–30s per sentence on CPU. Output: `~/tts/test_idayu.mp3`, `test_husein.mp3` (24 kHz).

## License
Card declares **no license (None)**. Personal/dev use OK; do NOT deploy commercially
until confirmed with author.
