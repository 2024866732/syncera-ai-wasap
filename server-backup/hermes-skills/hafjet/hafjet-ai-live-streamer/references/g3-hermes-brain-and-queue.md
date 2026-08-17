# G3 — Hermes brain + speak queue (2026-08-17)

## Scope done (Hermes-first)

| Task | Deliverable |
|------|-------------|
| 1 | `agent/schema.py`, `catalog_tools.py`, `price_guard.py` + tests |
| 2 | `llm_client.py`, `aina_brain.py` (`stub`\|`llm`) + mock tests |
| 3 | `orchestrator/queue.py`; API claim/ack; pause cancels queue ≤2s |
| 4 | `scripts/g3_golden_qa.json` 10 cases; stub 10/10 |
| 5 | RTX consumer — **not started** until Tuan OK |

**pytest:** 40 passed with `AINA_BRAIN_MODE=stub`.

## Env

```bash
AINA_BRAIN_MODE=stub|llm
AINA_LLM_BASE_URL=   # OpenAI-compatible .../v1
AINA_LLM_API_KEY=
AINA_LLM_MODEL=
AINA_LLM_TIMEOUT_S=20
AINA_LLM_MAX_TOKENS=400
```

Agent never writes secrets into `.env` — only `.env.example` placeholders.

## Price guard

- Regex `\bRM\s*(\d+(?:\.\d{1,2})?)\b` on speak/typed_reply
- Allowlist = active products' `price_rm` + `promo_price_rm` (normalized 29.9 / 29.90 / 169)
- Bad amount → drop action; if no speak left → safe redirect speak **without** invented numbers
- **Never disable**

## Decide path

1. paused / no catalog → ignore (no LLM)
2. stub → `stub_decide` then `guard_decision`
3. llm → persona + catalog context → JSON parse → `guard_decision`
4. each `speak` → `speak_queue.enqueue`

## Queue API

- `GET /queue` → pending + in_flight
- `POST /queue/claim` → one job `in_flight`
- `POST /queue/ack` `{id, status: done|cancelled}`
- `POST /session/pause` → cancel pending+in_flight

## Golden cases (stub)

charger live 29.9 · PB 79 · LCD 169 · tempered 35 · no demo 9.9 · drone no RM · spam ignore · hai · postage objection · duplicate event_id

## Next (Task 5 — wait for OK)

RTX `speak_queue_consumer.py`: claim text → LIVE_GPU_LOCK → CB → edge-tts → LiveTalking `/human` or `/humanaudio` if server up. No G4 listeners.
