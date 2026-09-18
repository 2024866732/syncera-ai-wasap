# Groq SOCKS Aina brain (2026-09)

Brain stays on **Hermes orch** (`AINA_*`). RTX consumer only TTS+/humanaudio.

## Why SOCKS

Azure Hermes → `api.groq.com` = Cloudflare **1010**. Working: loopback SOCKS via RTX.

```
ssh -N -D 127.0.0.1:10808 -o BatchMode=yes -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -J hafizi145@100.121.94.41 hafjet@100.119.32.87
```

Persist: user-systemd `~/.config/systemd/user/hafjet-rtx-socks.service` (`Restart=always`). Linger already on `hafizi145`. **Not** `User=root` (Azure sudo blocked). Bind **127.0.0.1:10808**.

Orch env (Tuan fills real key; never paste `gsk_` in TG/git):

`~/.config/hafjet-live/orch.env` — copy from `orch.env.example`.

```
AINA_BRAIN_MODE=llm
AINA_LLM_BASE_URL=https://api.groq.com/openai/v1
AINA_LLM_MODEL=qwen/qwen3.6-27b
AINA_LLM_MAX_TOKENS=800
AINA_LLM_TIMEOUT_S=45
ALL_PROXY=socks5h://127.0.0.1:10808
HTTPS_PROXY=socks5h://127.0.0.1:10808
```

httpx needs `socksio` (`pip install 'httpx[socks]'` in **repo `.venv` only**, not Hermes venv).

## Models (this Groq key, 2026-09)

- `llama-3.1-8b-instant` → `model_not_found`
- Working chat: `qwen/qwen3.6-27b` (thinking prefix → JSON parse fail if max_tokens=150; **800** works)
- Mock “Salam kedai kat mana?” ~2.7s → speak Taman Aminan Lestari + beg kuning (no invented hours)

## Dual CDP listener (Windows)

- `ORCH=http://localhost:18744` (not 127.0.0.1)
- `MAX_ENQ` cap; shared 1/5s
- POST `/events/comment` **timeout 30s** when brain=llm (12s → `enqueue_err timed out`)
- `vis_expr`: `querySelectorAll(%s) % json.dumps(sel)` — quoted `"%s"` breaks TikTok `[data-e2e="chat-message"]`
- facebook enqueue `platform=fb`

## GO LIVE preflight (also `go-live-preflight-2026-09.md`)

CDP exact `/live` URL · LT `:8010` · `/api/admin/sessions` ≥1 WebRTC · SOCKS 10808 if Groq · queue 0/0/0 · session idle or stop first.

Cleanup: listener + consumer + tunnel **18744**. Leave LT and SOCKS 10808 unless asked. `POST /session/stop` separate.

## VRAM

LT+Chatterbox speak ~8GB. +Ollama 3B → 10.4GB+ → wrapper GPU_STOP or sqc **CB ~10752 MiB** (`blocked_circuit_breaker`). Prefer Groq for brain.
