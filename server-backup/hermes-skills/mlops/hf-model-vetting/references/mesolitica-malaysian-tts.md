# mesolitica Malaysian-TTS (Qwen3 + DistilCodec) — working pipeline

Condensed from the HAFJET Hermes session (2026-07-20) evaluating
`mesolitica/Malaysian-TTS-0.6B-v1` as a natural Malay TTS alternative to
Edge TTS Yasmin.

## What it actually is
- NOT a standard TTS. It is a **Qwen3-0.6B causal language model** fine-tuned to
  **generate speech tokens** in text. A separate **DistilCodec** model decodes
  those tokens → 24 kHz audio.
- `pipeline_tag` on the Hub says `text-generation` — misleading. README is the
  source of truth.
- 7 built-in speakers (conditioning prefixes): `husein`, `idayu`, `singaporean`,
  `DisfluencySpeech`, `singlish-speaker2050`, `singlish-speaker2202`, `haqkiem`.
- Trained on **normalized text** — you MUST normalize numbers/abbreviations first
  (`123` → `one two three` / `satu dua tiga`). Untransformed digits sound wrong.

## License caveat (commercial use)
- `cardData.license` = **None** (undeclared). Treat as NOT safe for
  customer-facing / commercial deployment until verified with the author.
- For HAFJET WhatsApp bot (komersial), either verify license or prefer an
  explicitly Apache/MIT model (e.g. parler-tts tiny).

## Dependencies (CPU inference)
```bash
python3 -m venv ~/tts_venv && source ~/tts_venv/bin/activate
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "transformers" "huggingface_hub[cli]" soundfile tqdm
pip install "git+https://github.com/mesolitica/DistilCodec"   # fork, not PyPI
```
NOTE: PC Office had **only Python 3.14.4** — if torch has no 3.14 wheel, use
`uv` to install a 3.11 venv instead. PC Office = 16 GB RAM, 4-core i3, **no GPU**
(Intel iGPU) → CPU inference only, ~10-30 s per short sentence.

## Download (Xet storage → use hf, not curl)
```bash
hf download mesolitica/Malaysian-TTS-0.6B-v1
# DistilCodec weights (NOT on the TTS repo):
curl -sL https://huggingface.co/IDEA-Emdoor/DistilCodec-v1.0/resolve/main/model_config.json -o DistilCodec-v1.0/model_config.json
curl -sL https://huggingface.co/IDEA-Emdoor/DistilCodec-v1.0/resolve/main/g_00204000 -o DistilCodec-v1.0/g_00204000
```

## Minimal working inference
```python
import os, re
import soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = os.path.expanduser('~/tts')
MODEL = os.path.join(BASE, 'Malaysian-TTS-0.6B-v1')
CODEC_CFG = os.path.join(BASE, 'DistilCodec-v1.0', 'model_config.json')
CODEC_CKPT = os.path.join(BASE, 'DistilCodec-v1.0', 'g_00204000')

codec = DistilCodec.from_pretrained(config_path=CODEC_CFG, model_path=CODEC_CKPT,
                                   use_generator=True, is_debug=False).eval()
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype='auto').to('cpu')

text = 'Selamat datang ke HAFJET. Ada apa yang boleh saya bantu hari ini?'
for spk in ['idayu', 'husein']:
    prompt = f'<|im_start|>{spk}: {text}<|speech_start|>'
    out = model.generate(**tok(prompt, return_tensors='pt',
                        add_special_tokens=False).to('cpu'),
                         max_new_tokens=1024, temperature=0.7,
                         do_sample=True, repetition_penalty=1.1)
    sp = tok.decode(out[0]).split('<|speech_start|>')[-1].replace('<|endoftext|>','')
    nums = list(map(int, re.findall(r'speech_(\d+)', sp)))
    y = codec.decode_from_codes(nums, minus_token_offset=False)
    sf.write(f'{spk}.mp3', y[0, 0].cpu().numpy(), 24000)
```

## Deployment decision (HAFJET)
- Server (1 GB RAM + swap) = too small to even load torch. Do NOT run here.
- PC Office (16 GB) = fine for dev/batch, not realtime for many concurrent users.
- For production bot: deploy as **HF Inference Endpoint** (API call) OR run on PC
  Office behind a small FastAPI service. Verify license before customer use.
