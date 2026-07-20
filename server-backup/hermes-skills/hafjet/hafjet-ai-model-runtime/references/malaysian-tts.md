# mesolitica/Malaysian-TTS-0.6B-v1 — run recipe (HAFJET PC Office)

Verified 2026-07-20 by Hermes-HAFJET. Status: install pending, run not yet executed (env bootstrap in progress).

## What it actually is
- A **Qwen3 ForCausalLM** (0.6B, 28 layers, hidden 1024) trained to GENERATE speech tokens, not a classic TTS pipeline.
- Audio is recovered by **DistilCodec** (24kHz output).
- Supports Malay ⇄ English context switching. Trained on normalized text (numbers must be spelled out: "123" → "one two three").

## License ⚠️
- HF card `license: null` (not declared). README gives NO license statement.
- **Do NOT use commercially** until verified. The 2026-07-20 test was approved **personal-use only**.
- Compare: parler-tts family is Apache-2.0 (commercial-safe) but lower quality / different pipeline.

## Deploy target for this test
- `hafjet-pc-office` (TS 100.121.94.41): Ubuntu, 4-core i3, 16GB RAM, NO GPU. CPU inference only.

## Install (after uv+py3.11 venv from SKILL.md step 0)
```bash
source ~/tts_venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "transformers" "huggingface_hub[cli]" soundfile tqdm
pip install "git+https://github.com/mesolitica/DistilCodec"
```

## Download (Xet storage → must use hf, not curl)
```bash
hf download mesolitica/Malaysian-TTS-0.6B-v1 --local-dir ~/tts/Malaysian-TTS-0.6B-v1
hf download IDEA-Emdoor/DistilCodec-v1.0 --local-dir ~/tts/DistilCodec-v1.0 \
  --include "model_config.json" "g_00204000"
```

## Generate (test snippet)
```python
import os, re
import soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = os.path.expanduser('~/tts')
tok = AutoTokenizer.from_pretrained(f'{BASE}/Malaysian-TTS-0.6B-v1')
model = AutoModelForCausalLM.from_pretrained(f'{BASE}/Malaysian-TTS-0.6B-v1', torch_dtype='auto').to('cpu')
codec = DistilCodec.from_pretrained(
    config_path=f'{BASE}/DistilCodec-v1.0/model_config.json',
    model_path=f'{BASE}/DistilCodec-v1.0/g_00204000',
    use_generator=True, is_debug=False).eval()

string = 'Selamat datang ke HAFJET. Ada apa yang boleh saya bantu hari ini?'
for s in ['idayu', 'husein']:
    prompt = f'<|im_start|>{s}: {string}<|speech_start|>'
    out = model.generate(
        **tok(prompt, return_tensors='pt', add_special_tokens=False).to('cpu'),
        max_new_tokens=1024, temperature=0.7, do_sample=True, repetition_penalty=1.1)
    sp = tok.decode(out[0]).split('<|speech_start|>')[-1].replace('<|endoftext|>', '')
    nums = list(map(int, re.findall(r'speech_(\d+)', sp)))
    y = codec.decode_from_codes(nums, minus_token_offset=False)
    sf.write(f'{BASE}/test_{s}.mp3', y[0, 0].cpu().numpy(), 24000)
    print('WROTE', f'test_{s}.mp3', 'tokens=', len(nums))
```

## 7 built-in speakers
husein, idayu, singaporean, DisfluencySpeech, singlish-speaker2050, singlish-speaker2202, haqkiem (private dataset).

## Limitations (from README)
- Trained on normalized text → must normalize numbers/abbreviations first (use Malaya normalizer).
- Repetitive pronunciation dataset uses commas inconsistently (e.g. "A, A, A" spoken as "A A A").
- `haqkiem` voice is a private dataset — commercial use especially unclear.

## Why not the Azure box
Azure = 1GB RAM + 4GB swap. Torch + 0.6B model won't fit comfortably. PC Office (16GB) is the correct worker.
