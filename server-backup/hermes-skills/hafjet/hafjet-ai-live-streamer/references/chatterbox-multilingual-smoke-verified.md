# Chatterbox Multilingual — Verified RTX Offline Smoke (2026-08)

Use for HAFJET AI Live Streamer Malay TTS R&D only. Do not wire `/humanaudio`, start a public server, or change LiveTalking during this workflow.

## Isolated environment

- Root: `~/hafjet-chatterbox/`
- Venv: `~/hafjet-chatterbox/venv-chatterbox`
- Use a Python version `>=3.10, <3.14`; RTX system Python 3.14 must not be used for Chatterbox.
- `uv venv` does not necessarily seed a `pip` executable. Install with:
  ```bash
  ~/.local/bin/uv pip install --python ~/hafjet-chatterbox/venv-chatterbox/bin/python chatterbox-tts
  ```
- Chatterbox package proven in this smoke: `chatterbox-tts==0.1.7`, Torch CUDA 12.4 on RTX 4070.

## API compatibility

For `chatterbox-tts==0.1.7`, use:

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
wav = model.generate(text, language_id="ms")
```

Do **not** pass `t3_model="v3"` to this installed package; the method rejects that keyword.

## PerTh watermark dependency

`resemble-perth==1.0.1` can expose `PerthImplicitWatermarker` as `None`. Installing `onnxruntime` may be required to diagnose the runtime, but does not by itself guarantee the class is callable.

For **offline-only evaluation**, a temporary `DummyWatermarker` substitution allows model load and WAV quality/latency testing. Mark all resulting WAVs as **non-production / no PerTh watermark**. Do not use this workaround for any customer-facing or wired live path. Resolve the PerTh runtime before a production trial.

## Verified smoke metrics — RTX 4070

With LiveTalking port `8010` down (coexistence therefore N/A):

| Metric | Result |
|---|---:|
| Baseline VRAM | 2608 MiB |
| Chatterbox load delta | +3276 MiB |
| Peak VRAM | 6246 MiB / 12282 MiB |
| Peak temperature | 59°C |
| Load time | 12.74s |
| Malay `language_id="ms"` RTF | 0.494–0.654 |

The model generated three Malay test WAVs successfully. Hardware/latency gates were healthy, but do not label it ready for `/humanaudio` until: (1) operator listening quality is accepted, (2) PerTh is resolved, and (3) a separate coexistence smoke has LiveTalking already active without restart and confirms port/session stability.

## Safe decision rule

- **Candidate only** if all three WAVs generate, max RTF <1, peak VRAM <11GB, GPU temp <88°C, and manual Malay quality passes.
- **Not ready to wire** if LiveTalking was down during smoke, watermark fallback was used, quality is unreviewed, or a circuit breaker triggers.
