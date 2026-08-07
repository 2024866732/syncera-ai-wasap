---
name: hafjet-tts-deploy
description: Deploy & run HuggingFace Malay/English TTS on the HAFJET PC Office (CPU-only, no GPU). Covers the mesolitica/Malaysian-TTS (Qwen3 LM → DistilCodec) pipeline, uv/PEP668 venv setup, hidden DistilCodec deps, torchaudio CPU index, the hf --include download bug, and mandatory CUDA→CPU source patches.
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET TTS Deploy (PC Office, CPU-only)

## When to use
- Tuan wants natural Malay/English TTS beyond Edge Yasmin (ms-MY-YasminNeural).
- Deploying `mesolitica/Malaysian-TTS-*` or similar HF TTS on the on-prem PC Office worker.
- Running speech generation locally (personal/dev use) instead of a cloud API.

## Architecture note (critical — this is NOT a normal TTS)
`mesolitica/Malaysian-TTS-0.6B-v1` is a **Qwen3 causal LM** that emits `speech_N` tokens; `IDEA-Emdoor/DistilCodec` decodes those tokens → 24 kHz audio. You need BOTH:
1. The TTS model repo (tokenizer + `model.safetensors`).
2. DistilCodec weights: `model_config.json` + `g_00204000` (~1.6 GB checkpoint).

Built-in speakers: `husein` (m), `idayu` (f), `singaporean`, `DisfluencySpeech`, `singlish-speaker2050`, `singlish-speaker2202`, `haqkiem` (private).
Prompt format: `<|im_start|>{speaker}: {normalized_text}<|speech_start|>`
Text MUST be normalized (e.g. `123` → `one two three` / `satu dua tiga`) or pronunciation breaks.

## PC Office environment prep
PC Office = Ubuntu, **Python 3.14 system, PEP 668 externally-managed (no `pip --user`, no `python3-venv`)**, **NO GPU** (Intel iGPU only). Use `uv`:

```bash
# 1. install uv itself (single tool; --break-system-packages ok, lands in ~/.local/bin)
python3 -m pip install --user --break-system-packages uv
export PATH="$HOME/.local/bin:$PATH"
# 2. standalone Python 3.11 (has torch CPU wheels; 3.14 often lacks them)
uv python install 3.11
# 3. venv + install (use `uv pip`, NOT `pip` — the venv has NO pip module)
uv venv --python 3.11 ~/tts_venv
VENV_PY="$HOME/tts_venv/bin/python"
uv pip install --python "$VENV_PY" torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python "$VENV_PY" "transformers" "huggingface_hub" soundfile tqdm
uv pip install --python "$VENV_PY" "git+https://github.com/mesolitica/DistilCodec"
```

### DistilCodec hidden dependencies (NOT declared in setup.py)
Import fails at runtime, one at a time, until all present:
`librosa`, `matplotlib`, `wandb`, `tensorboard`, `torchaudio` (CPU build!), `einops`, `vector_quantize_pytorch`
```bash
uv pip install --python "$VENV_PY" librosa matplotlib wandb tensorboard \
  torchaudio --index-url https://download.pytorch.org/whl/cpu \
  einops vector_quantize_pytorch
```
⚠️ **torchaudio MUST come from the CPU index** or it links `libcudart.so.13` and crashes on the GPU-less box. If a CUDA-build slipped in, reinstall: `uv pip install --python "$VENV_PY" --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu`.

## Download (hf download quirk)
`hf download --include "*.json"` prints "Ignoring --include" and **silently skips** `config.json` / `model_config.json`. Fetch single files with the Python API instead:
```python
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='mesolitica/Malaysian-TTS-0.6B-v1', filename='config.json',
                local_dir='~/tts/Malaysian-TTS-0.6B-v1')
hf_hub_download(repo_id='IDEA-Emdoor/DistilCodec-v1.0', filename='model_config.json',
                local_dir='~/tts/DistilCodec-v1.0')
```
Bulk download (model.safetensors etc.) is fine via `hf download mesolitica/Malaysian-TTS-0.6B-v1 --local-dir ~/tts/Malaysian-TTS-0.6B-v1`.

## CPU patch (mandatory — no GPU on PC Office)
DistilCodec hardcodes CUDA. Patch two lines in `<venv>/lib/python3.11/site-packages/distilcodec/distil_codec.py`:
- `from_pretrained`: `codec.device = torch.device('cuda:{:d}'.format(local_rank))` → `torch.device('cpu')`
- `decode_from_codes` (≈line 588): `.unsqueeze(-1).cuda()` → `.unsqueeze(-1).cpu()`

See `references/distilcodec_cpu_patch.py` for an idempotent patcher. Do NOT try `torch.device` subclassing — it's a C type and raises "not an acceptable base type".

## Test script
See `references/test_tts.py` — loads codec + model on CPU, generates one mp3 per speaker, writes `~/tts/test_{speaker}.mp3` (24 kHz).

## Quality defect: Malaysian-TTS does NOT stop (no EOS)
The Qwen3 LM behind `mesolitica/Malaysian-TTS-*` **never emits `<|endoftext|>` (id 151643)** during generation — verified by generating and inspecting the token stream (EOS absent within 1024 tokens; `max_new_tokens` cap just truncates). Result: it speaks the sentence correctly, then **continues hallucinating gibberish** until `max_new_tokens` is hit. Confirmed with both `do_sample=True` and greedy (`do_sample=False`) — neither self-terminates. Mitigation options are imperfect: greedy + `eos_token_id=151643` still overruns; token-by-token n-gram-repeat detection is fragile. **Do not ship this pipeline for clean unattended output without a robust stop heuristic.**

## Commercial-safe alternative: VoxCPM2 (RECOMMENDED when license matters)
`openbmb/VoxCPM2` is **confirmed `apache-2.0`** in `cardData.license` AND README → free for commercial use. Unlike Malaysian-TTS it has **no license ambiguity** and no gibberish issue.
- **Malay:** supported (`ms` in its 30-language list; no lang tag needed — type Malay directly).
- **Quality:** 48 kHz studio output (higher than DistilCodec's 24 kHz).
- **Voice design:** describe the voice in-text, no reference audio — e.g. `"(A young Malay woman, gentle voice)Selamat datang ke HAFJET"`.
- **Size:** 2B params, needs ~8 GB VRAM on GPU. On the **CPU-only PC Office it may be very slow or the lib may assume CUDA** — test before relying on it for local use.
- Install & run:
```bash
uv pip install --python "$VENV_PY" voxcpm
# ---
from voxcpm import VoxCPM
import soundfile as sf
m = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
wav = m.generate(text="(A young Malay woman, gentle voice)Selamat datang ke HAFJET",
                 cfg_value=2.0, inference_timesteps=10)
sf.write("out.wav", wav, m.tts_model.sample_rate)
```
Note: `mlx-community/VoxCPM2-8bit` is Apple-Silicon only — not for the Linux PC Office. For production at scale, deploy VoxCPM2 as an **HF Inference Endpoint** (Apache-2.0 permits commercial use).

## License verification (HF API gives false positives!)
Searching `https://huggingface.co/api/models?license=mit&search=...` returns models whose **tags** matched `mit`, NOT necessarily `cardData.license`. The query returned `mesolitica/Malaysian-TTS-0.6B-v1` as "mit" yet its actual `cardData.license` is **None**. Always confirm directly:
```bash
curl -sS "https://huggingface.co/api/models/<REPO>" | python3 -c \
  "import sys,json;d=json.load(sys.stdin);print(repr(d.get('cardData',{}).get('license')))"
```
and read the README "License" section. Ship to the customer-facing bot ONLY models with explicit `apache-2.0` / `mit` in `cardData.license`.

## Related Skills

- `hafjet-voice-assistant` — Full voice assistant pipeline (Whisper STT + Piper TTS + FastAPI + WhatsApp webhook)
- `hafjet-whisper-stt` — STT-only details, model benchmarks
- **SCP to raw IP (100.121.94.41) needs approval every time and times out if Tuan doesn't click fast.** Batch the work: write scripts locally to `/tmp`, SCP once, then run remotely via `ssh ... "bash /tmp/x.sh"` in background with `notify_on_complete`. Avoid many round-trips.
- Honor `hafjet-command-safety`: no `curl | python3`, no heredoc, no `.env` writes. Write `.py` to `/tmp`, SCP, run.
- **License = None** on `mesolitica/Malaysian-TTS-0.6B-v1` HF card → treat as **personal/dev use only**; do NOT wire into the customer-facing WhatsApp bot until license is confirmed.
- CPU inference is slow (~tens of seconds per ~10 s clip) — not realtime for concurrent users. Use PC Office or an HF Inference Endpoint, never the 1 GB Azure gateway.
