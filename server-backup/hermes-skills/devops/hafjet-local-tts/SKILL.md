---
name: hafjet-local-tts
description: "Run local AI model inference on the HAFJET on-prem PC Office worker node (CPU-only, no GPU): Malaysian TTS via mesolitica Qwen3-TTS + DistilCodec, including the Python/bootstrap workarounds required on that box."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Local TTS / Model Inference on PC Office

Tuan Hafizi wants **natural (non-robotic) Malay TTS** as an alternative to Edge
TTS Yasmin. The best open Malay TTS on HF is `mesolitica/Malaysian-TTS-0.6B-v1`
(Qwen3-based, ~13.7k downloads, 7 speakers: husein, idayu, singaporean,
DisfluencySpeech, singlish-speaker2050/2202, haqkiem). It runs on the on-prem
**PC Office** worker node (16GB RAM, 4-core i3, Intel iGPU only — **NO CUDA**).

## How the model works (non-standard TTS)
- NOT a normal TTS. A Qwen3 causal LM **generates speech tokens**, then
  **DistilCodec** (`decode_from_codes`) turns tokens → 24kHz audio.
- Needs 3 pieces: the TTS model, DistilCodec lib, and DistilCodec weights
  (`model_config.json` + `g_00204000` from `IDEA-Emdoor/DistilCodec-v1.0`).
- Trained on **normalized text** — spell out numbers/letters
  (e.g. `satu dua tiga`, `one two three`, `A B C`), not `123`/`ABC`.

## PC Office environment gotchas (READ FIRST)
PC Office (hafjet-pc-office, TS 100.121.94.41) has ONLY Python 3.14 system-wide,
NO `python3-venv` package, and is **PEP 668 externally-managed** (bare `pip` and
`pip --user` are blocked). Also **no GPU** → all torch builds must be CPU.

### Bootstrap recipe (verified 2026-07-20)
1. Install `uv` as the ONLY system tool (override PEP 668 for this one tool):
   `python3 -m pip install --user --break-system-packages uv`
2. Standalone Python 3.11 (3.14 often lacks torch wheels):
   `uv python install 3.11`
3. venv: `uv venv --python 3.11 ~/tts_venv` (clear stale: `rm -rf ~/tts_venv`)
4. Install into venv with **`uv pip`** — a uv-made venv has NO pip module, so
   `python -m pip` resolves to system pip and fails under PEP 668:
   `uv pip install --python ~/tts_venv/bin/python <pkg>`

### torch / torchaudio MUST be CPU builds
- torch: `uv pip install --python ... torch --index-url https://download.pytorch.org/whl/cpu`
- torchaudio ALSO CPU (default pulls CUDA build → `libcudart.so.13: cannot open
  shared object file` at import):
  `uv pip install --python ... --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu`

## DistilCodec missing dependencies
`setup.py` does NOT list all runtime imports — it imports OK but fails per-module
on use. Install the FULL set up front to avoid whack-a-mole:
`transformers soundfile librosa matplotlib wandb tensorboard torchaudio einops vector_quantize_pytorch`

## DistilCodec CUDA hardcode → CPU crash (the big one)
`DistilCodec.from_pretrained()` hardcodes `codec.device = torch.device('cuda:0')`
and calls `.to(device)` → `torch.cuda._lazy_init` →
`AssertionError: Torch not compiled with CUDA enabled` on a CPU box.

**Fix: monkeypatch `torch.device` BEFORE importing distilcodec** so any
`'cuda:*'` string resolves to `'cpu'`. Patching only `torch.cuda.is_available`
is NOT enough — the `torch.device('cuda:0')` object still gets built and `.to()`
still hits lazy init.

```python
import torch
_orig = torch.device
class _CpuDevice(torch.device):
    def __new__(cls, *a, **k):
        if a and isinstance(a[0], str) and a[0].startswith('cuda'):
            return _orig('cpu')
        return _orig(*a, **k)
torch.device = _CpuDevice
torch.cuda.is_available = lambda: False
```
See `references/mesolitica-tts-pipeline.md` for the full tested script.

## HF download notes
- Model uses **Xet storage** → use `hf download` / `hf_hub_download`, NOT curl.
- `hf download REPO --include "a" "b"` prints "Ignoring --include since filenames
  have been explicitly set" and downloads everything anyway. Prefer
  `hf_hub_download(repo_id=..., filename=..., local_dir=...)`.
- `huggingface_hub[cli]` extra does NOT exist (warning at install; `hf-xet` is
  pulled automatically). `hf` CLI exists ONLY on the Azure gateway, NOT PC Office —
  use the Python `huggingface_hub` API on PC Office.

## Verification
See `references/mesolitica-tts-pipeline.md` (full download + test script) and
`references/deps-manifest.md` (exact pinned versions that installed cleanly
2026-07-20).

## License caveat
`mesolitica/Malaysian-TTS-0.6B-v1` card declares **no license** (None). Personal/
dev use is fine; do NOT deploy commercially until license is confirmed with the
author. (Tuan approved personal-use-only for the 2026-07-20 test.)
