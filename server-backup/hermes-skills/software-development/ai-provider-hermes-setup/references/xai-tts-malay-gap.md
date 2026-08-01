# xAI TTS vs Malay (Edge) — session notes

**Date verified:** 2026-08-01  
**Symptom:** User voice reply / TTS on Telegram not proper Bahasa Melayu while chat text is BM.

## Root cause
- Active config had `tts.provider: xai` and `tts.xai.language: en`.
- xAI Grok TTS official language table has no `ms` / `ms-MY` (has `id` Indonesian).
- English language code forces English-like phoneme path → BM text sounds wrong.

## Fix applied
```bash
hermes config set tts.provider edge
hermes config set tts.edge.voice ms-MY-OsmanNeural
```
Verify with `text_to_speech` → tool result `provider: edge`. Sample path under `~/.hermes/cache/audio/`.

## Do not
- Only flip `tts.xai.language` and claim “suara Melayu”.
- Store or re-echo user passwords from chat when doing unrelated setup.
- Restart gateway from inside gateway session (blocked); tell Tuan to `/restart` if auto-TTS still old provider.

## Related
- Parent skill: `ai-provider-hermes-setup` (TTS section).
- Local natural Malay (PC Office): `hafjet-malaysian-tts` / `hafjet-local-tts` — separate from Hermes gateway TTS.
