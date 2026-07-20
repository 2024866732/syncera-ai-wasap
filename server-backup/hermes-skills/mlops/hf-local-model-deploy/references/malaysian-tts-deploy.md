# Malaysian-TTS local deployment (mesolitica / Qwen3 + DistilCodec)

Tested on HAFJET PC Office worker (hafjet-pc-office, no GPU, Python 3.11 venv).

## What the model is
`mesolitica/Malaysian-TTS-0.6B-v1` is a **Qwen3ForCausalLM (0.6B)** that generates
discrete *speech tokens*; **DistilCodec** (IDEA-Emdoor/DistilCodec-v1.0) detokenizes
them to 24 kHz audio. It is NOT a standard `text-to-audio` pipeline.
- 7 built-in speakers: `husein, idayu, singaporean, DisfluencySpeech,
  singlish-speaker2050, singlish-speaker2202, haqkiem`.
- Input text MUST be normalized (`123` -> `satu dua tiga` / `one two three`),
  else pronunciation breaks.

## Files needed
- Model: `mesolitica/Malaysian-TTS-0.6B-v1` (model.safetensors ~2.4 GB + tokenizer files)
- Codec: `IDEA-Emdoor/DistilCodec-v1.0` -> `model_config.json` + `g_00204000` (~1.6 GB)
- `hf download` handles Xet storage. On PC Office the `hf` CLI is absent -> use
  `from huggingface_hub import hf_hub_download`.

## Inference snippet
```python
import re, soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM
codec = DistilCodec.from_pretrained(
    config_path='DistilCodec-v1.0/model_config.json',
    model_path='DistilCodec-v1.0/g_00204000',
    use_generator=True, is_debug=False).eval()
tok = AutoTokenizer.from_pretrained('Malaysian-TTS-0.6B-v1')
model = AutoModelForCausalLM.from_pretrained('Malaysian-TTS-0.6B-v1', torch_dtype='auto')
speaker = 'idayu'
prompt = f'<|im_start|>{speaker}: {text}<|speech_start|>'
out = model.generate(**tok(prompt, return_tensors='pt', add_special_tokens=False),
    max_new_tokens=1024, temperature=0.7, do_sample=True, repetition_penalty=1.1)
sp = tok.decode(out[0]).split('<|speech_start|>')[-1].replace('<|endoftext|>','')
nums = list(map(int, re.findall(r'speech_(\d+)', sp)))
y = codec.decode_from_codes(nums, minus_token_offset=False)
sf.write('out.mp3', y[0,0].cpu().numpy(), 24000)
```

## DistilCodec undeclared dependencies (install manually)
DistilCodec's setup.py does NOT list these; imported at top level even when unused,
so the import fails one-by-one until all are present:
`librosa, matplotlib, wandb, tensorboard, torchaudio, einops, vector_quantize_pytorch`

## CRITICAL: CPU-only machines (no GPU)
PC Office has only an Intel iGPU -> CPU inference.
- Install **torch CPU build**: `uv pip install --python ~/tts_venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu`
- Install **torchaudio CPU build too**, or it links `libcudart.so.13` and crashes:
  `uv pip install --python ~/tts_venv/bin/python --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu`
- Expect ~30-90 s per short sentence on CPU (0.6B).

## PC Office venv bootstrap (no python3-venv, PEP 668)
System Python is 3.14 only, externally-managed, and `python3 -m venv` fails
(ensurepip missing). Also torch has no 3.14 wheel, so use Python 3.11 via uv:
```bash
python3 -m pip install --user --break-system-packages uv
uv python install 3.11
rm -rf ~/tts_venv && uv venv --python 3.11 ~/tts_venv
# venv has NO pip module -> always use uv pip:
uv pip install --python ~/tts_venv/bin/python <pkg>
```
Note: `pip` on PC Office resolves to system 3.14 (PEP 668 blocks it); never trust
`pip` after activating the venv -> use `uv pip --python ~/tts_venv/bin/python`.

## License caveat
Model card declares `license: None` (undeclared). DistilCodec is its own repo.
**Do NOT use in the HAFJET customer-facing bot (commercial) until license is confirmed.**
Fine for personal/dev use per Tuan's approval.
