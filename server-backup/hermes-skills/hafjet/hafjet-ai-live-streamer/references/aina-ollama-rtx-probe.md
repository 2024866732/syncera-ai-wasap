# Aina local LLM probe (RTX Ollama) — 2026-09-05

Phase A: stub → local LLM. **Do not** edit `~/projects/hafjet-ai-live-streamer`. **Do not** GO LIVE from this probe.

## Where things run

| Piece | Host | Notes |
|---|---|---|
| Orchestrator brain | Hermes `:8740` | `AINA_BRAIN_MODE=stub\|llm`, `AINA_LLM_*` |
| Speak consumer | RTX WSL `venv-chatterbox` | Chatterbox → `/humanaudio` only |
| Ollama | RTX `127.0.0.1:11434` | Hermes has no `:11434` and cannot host 3B |

Hermes `/health` with stub: `brain_mode=stub`, `llm_configured=false`.

## Models (RTX, 2026-09-05)

Wanted `qwen2.5:3b`: **absent**. Do not pull without Tuan approve.

Present (subset): `gemma3:1b-it-qat`, `qwen3.5:4b` (4.7B Q4_K_M), `qwen3.5:9b`, `qwen2.5-coder:7b/14b`, `llama3.1:8b`, `deepseek-r1:7b`, `gemma4:e4b`.

## Dry-run that worked

1. GPU_STOP if temp >80°C or VRAM >10240 MiB **before** generate.
2. `POST http://127.0.0.1:11434/api/chat` on RTX via Office jump (not from Hermes loopback).
3. For `qwen3.5:4b` set **`"think": false`**. Without it: `eval_count` burns on thinking, `message.content` empty, wall ~54s cold.
4. With think off, warm mock "Salam bang, kedai buka pukul berapa?": wall **1.38s**, 19 words, GPU ~43°C / **6073 MiB**.
5. Unload: `ollama stop qwen3.5:4b` → VRAM ~753 MiB. `keep_alive: 0` on `/api/generate` did **not** drop VRAM in the same second.

Spoken output can invent shop hours. Live path must still use catalog JSON + price_guard.

## Wiring later (needs separate approve)

```
AINA_BRAIN_MODE=llm
AINA_LLM_BASE_URL=http://127.0.0.1:<tunneled-11434>/v1
AINA_LLM_API_KEY=ollama
AINA_LLM_MODEL=qwen3.5:4b   # or qwen2.5:3b after pull
AINA_LLM_MAX_TOKENS=60
```

Requires: reverse tunnel RTX 11434 → Hermes, then **restart orch** (env is process-start). Persona file still demands JSON actions, not free 20-word chat.
