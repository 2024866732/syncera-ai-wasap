# Malay TTS — Live Alternatives Research (2026-08)

Research for wiring a more natural Malay voice into the Aina live path (LiveTalking `/human` text or `/humanaudio` WAV). **No models were installed** — this is a decision reference. CosyVoice remains **LOCKED OUT** for Malay live.

## Verified official Malay support

| Engine | License | Malay support | Size / VRAM | Latency / RTF | Wire to LiveTalking? |
|--------|---------|---------------|-------------|----------------|----------------------|
| **Chatterbox Multilingual** (ResembleAI, HF `ResembleAI/chatterbox`) | MIT | ✅ `ms` in 23 langs (ar da de el en es fi fr he hi it ja ko **ms** nl no pl pt ru sv sw tr zh) | 0.5B — fits RTX 4070 12GB alongside LiveTalking | real-time / faster-than-realtime | ✅ generate WAV → `/humanaudio`, or stream text → `/human` |
| **VoxCPM2** (OpenBMB, HF `openbmb/VoxCPM2`) | Apache-2.0 | ✅ `ms` in 30 langs | 2B, ~8GB VRAM | RTF ~0.3 PyTorch, ~0.13 vLLM-Omni | ✅ WAV → `/humanaudio`; heavy for sync live on same GPU |
| **Edge-TTS** `ms-MY-YasminNeural` (current live voice) | Microsoft cloud (free endpoint) | ✅ ms-MY | cloud | low latency | ✅ already wired (`edge_tts_to_wav` in consumer) |

## Not viable for Malay live
- **Piper** — no official ms-MY voice in `rhasspy/piper-voices` (community only).
- **Kokoro-82M** — no Malay language code (en/es/fr/hi/it/ja/pt/zh only).
- **mesolitica/Malaysian-TTS-0.6B-v1** — license None + no-EOS gibberish (personal/dev only; see `hafjet-malaysian-tts`).
- **CosyVoice** — locked out; not suitable for Malay live (see `cosyvoice-stage1-safe-offline.md`).

## Recommendation (tegas)
1. **Chatterbox Multilingual = top candidate** to augment/replace Edge-Yasmin for live. MIT (commercial OK), 0.5B fits RTX 12GB, real-time, zero-shot voice cloning from ~5s reference (can clone a consistent Aina voice). Wire: on-demand WAV → LiveTalking `/humanaudio` with the same queue-hygiene rule (ack/cancel the orchestrator job after direct dispatch).
2. **VoxCPM2** = pre-rendered / approved clips only (48kHz quality) — too heavy for synchronous live on the same GPU as the avatar.
3. **Edge-TTS Yasmin** = keep as the low-risk fallback / cooldown voice while validating Chatterbox.

## Research method (repeatable)
- Verify the Malay claim from the **model card language list / README**, not search snippets (search results routinely list `ms`-adjacent languages or stale data).
- Confirm license from HF API `cardData.license` (tags lie — see `hafjet-tts-deploy`).
- Piper voice list: `rhasspy/piper-voices` `VOICES.md` — look for `my`/`ms` codes.
- Chatterbox languages: GitHub `resemble-ai/chatterbox` → Supported Languages table + HF card.
- VoxCPM2: GitHub `OpenBMB/VoxCPM` README + HF card (30 languages incl. Malay).
