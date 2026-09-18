# Aina Brain LLM via RTX Ollama (2026-09)

Brain lives on **Hermes orchestrator `:8740`**, not the RTX speak consumer.

## Placement

| Piece | Where |
|-------|--------|
| `AINA_BRAIN_MODE` / `AINA_LLM_*` | Hermes orch process env |
| Ollama | RTX WSL `127.0.0.1:11434` only |
| Hermes box | **no** Ollama (1GB RAM) |

Forward (Hermes → RTX), **not** `-R`:

```bash
ssh -N -L 127.0.0.1:11434:127.0.0.1:11434 -J hafizi145@100.121.94.41 hafjet@100.119.32.87
```

Speak tunnel stays separate: `-R 127.0.0.1:18744:127.0.0.1:8740`.

## Live model lock

- Prefer **`qwen2.5:3b`** (not `qwen3.5:4b`) when LiveTalking is up.
- `qwen3.5:4b` thinking: `/api/chat` with `think:false` or content is empty.
- `qwen2.5:3b` is not a thinking model; `llm_client.py` has no `think` flag (repo read-only).

Orch env (process only; do not write `.env`):

```
AINA_BRAIN_MODE=llm
AINA_LLM_BASE_URL=http://127.0.0.1:11434/v1
AINA_LLM_API_KEY=ollama
AINA_LLM_MODEL=qwen2.5:3b
AINA_LLM_TIMEOUT_S=20
AINA_LLM_MAX_TOKENS=150
```

`llm_configured` needs **all three**: base_url + api_key + model.

**`AINA_LLM_MAX_TOKENS=60` truncates JSON** → orch `ignore/llm_error`. Use **150**.

`load_persona()` runs each `decide()` — persona file edits apply without orch restart.

## Persona / off-catalog (2026-09)

Premis allowed: **HAFJET (Hafizi Gadget)**, **Taman Aminan Lestari, Raub, Pahang**.
No invented hours, street, phone. Hours/location questions → 1–2 sentences, bio / beg kuning.
Price_guard stays on. **3B still hallucinated hours + SKU in probe** — do not treat persona text as sufficient; verify a mock `/events/comment` before live.

## GPU with live

Tuan cap: STOP >80°C or VRAM **>10GB**.
Measured v4 `@royazizan/live`: LT + Chatterbox + `qwen2.5:3b` → **10477 MiB** after job 1 → GPU_STOP. Cancel leftover queue; kill listener + **18744** only; leave LT and **11434** unless asked.

## GO LIVE room gate

Require the **exact** approved `/live` URL in CDP `json/list`. Refuse another merchant (e.g. `@emeet.philippines`) unless Tuan names that handle. `fb` not `facebook`. Listener `MAX_ENQ` + consumer `MAX_JOBS` must match the cap (v4 = 5).
