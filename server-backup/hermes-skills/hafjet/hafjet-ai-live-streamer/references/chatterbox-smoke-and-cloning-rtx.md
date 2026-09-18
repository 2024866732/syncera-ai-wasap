# Chatterbox Multilingual — Offline Smoke & Voice-Clone Tuning on RTX (2026-08)

Session evidence extending `references/chatterbox-rd.md` (research/install plan) with the executed smoke. Full run was offline: no `/humanaudio`, no LiveTalking restart, no `LIVE_GPU_LOCK` mutation.

## Verified install path (RTX WSL2, user `hafjet`, direct SSH via Hermes key)

```bash
mkdir -p ~/hafjet-chatterbox
~/.local/bin/uv venv ~/hafjet-chatterbox/venv-chatterbox --python 3.11   # uv venvs are NOT seeded with pip; use `uv pip install --python <venv python>` only
uv pip install --python ~/hafjet-chatterbox/venv-chatterbox/bin/python chatterbox-tts   # resolves 122 packages incl. torch 2.6.0 cu124 (~3GB download)
```

System Python 3.14 is OUTSIDE Chatterbox's supported range (>=3.10,<3.14) — use uv-managed 3.11 in a dedicated venv.

## Known-good API (chatterbox-tts 0.1.7)

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS      # NOT chatterbox.tts
model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")  # NO t3_model kwarg (TypeError)
wav = model.generate(text, language_id="ms", audio_prompt_path=ref_wav, exaggeration=0.5, cfg_weight=0.5)
```

## Watermark blocker + acceptable offline workaround

`PerthImplicitWatermarker()` raises `TypeError: 'NoneType' object is not callable`. Installing CPU `onnxruntime` (1.29.0) does NOT fix it (still None). Until fixed/reported upstream, insert before the chatterbox import:

```python
import perth
if perth.PerthImplicitWatermarker is None or not callable(perth.PerthImplicitWatermarker):
    from perth import DummyWatermarker
    perth.PerthImplicitWatermarker = lambda **kw: DummyWatermarker()
```

Consequence for offline evals only: output WAVs carry **no PerTh watermark**.

## Measured results (RTX 4070 / 12282 MiB, LiveTalking DOWN at :8010 both runs)

| Variant | Ref clip | Load | Peak VRAM | Temp | RTF |
|---|---|---|---|---|---|
| Default male voice (no clone) | – | 12.7s | 6246 MiB | 59°C | 0.49–0.65 |
| Yasmin clone cfg=0.5 | ms-MY-YasminNeural 9.24s | 54.1s cold | 6744 MiB | 57°C | ~0.49–0.52 (first-gen spike 2.39 RTF, forced-EOS token repetition) |
| Tuning exag=0.7 | same ref | – | 6712 MiB | 58°C | 0.699 |
| Tuning cfg=0.7 | same ref | – | 6740 MiB | 48°C | 0.484 |
| Tuning long-ref 20.86s cfg=0.5 | yasmin-ref-long.wav | – | 6880 MiB | 58°C | 0.486 |

Max VRAM ≈ 56% of card → large headroom vs the 10752 MiB CB stop threshold even before coexistence testing.

## Compare-and-listen A/B sets (user-owned decision)

- Default-male vs Yasmin-clone: `~/hafjet-chatterbox/smoke-01..03.wav` vs `voiced-01..03.wav`
- Tuning baseline (voiced-02) vs exag07/cfg07/longref: `tuning-exag07.wav`, `tuning-cfg07.wav`, `tuning-longref.wav`
- Reports: `smoke-report.json`, `voiced-report.json`, `tuning-report.json`; scripts staged from Hermes repo `scripts/chatterbox_smoke_test.py`, `_voiced.py`, `_tuning.py`.

## Delivering WAV outputs to Tuan (Telegram)

Copy WAV → `~/.hermes/cache/documents/<name>.wav.txt` then `MEDIA:` lines; user renames back to `.wav`. One ≤3-line chat message for all clips plus metrics table.

## Open items

1. PerTh watermarker fix or upstream issue (auto-rec currently withheld = TIDAK LAYAK until watermark + quality clear).
2. VRAM coexistence gate while LiveTalking session is UP and TikTok Studio is capturing.
3. Warm-start latency: first generation after load shows a forced-EOS RTF outlier; measure steady-state separately.
