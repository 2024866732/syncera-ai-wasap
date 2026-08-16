# G1 orchestrator stub — verified 2026-08-15

## Location

`~/projects/hafjet-ai-live-streamer`

## What G1 includes

- FastAPI app: `orchestrator/api.py`
- In-memory session: `orchestrator/db.py`
- Bind: **`127.0.0.1:8740` only**
- Deterministic decision stub (no external LLM)
- Sample catalog 5 SKUs (4 active) with `promo_price_rm`
- Persona: `persona/aina_system.md`
- Tests: `tests/test_schema.py`, `tests/test_catalog_answers.py`
- **17 pytest passed**; live curl `/health` → `status: ok`, `gate: G1`

## Decision stub rules (keep stable until G3)

| Input | Action |
|-------|--------|
| No active session | `ignore` / `no_session` |
| `is_paused` | `ignore` / `paused` |
| Duplicate `event_id` | `ignore` / `duplicate` |
| Emoji-only / no alnum | `ignore` / `spam` |
| Product match (name/tags/sku aliases) | `speak` + `typed_reply` using **effective price** = promo if set else price |
| Inactive SKU only | treat as unknown — **no** price from inactive |
| Unknown product | short speak redirect; **no RM** invented |

Aliases in stub (api.py): charger/type-c → HFJ-TYPEC-25W; powerbank/pb → HFJ-POWERBANK-20K; iphone 11/lcd → HFJ-IP11-LCD; tempered/uv → HFJ-TEMPERED-UV.

## Verify commands

```bash
cd ~/projects/hafjet-ai-live-streamer
source .venv/bin/activate
pytest -q
uvicorn orchestrator.api:app --host 127.0.0.1 --port 8740
curl -s http://127.0.0.1:8740/health
# stop uvicorn after smoke — Azure 1GB RAM
```

## Do not redo G1 if green

If health + pytest already pass, next work is **`approve G1` → G2 plan only** (RTX synthetic avatar). Do not re-create tree or reinstall deps without need.

## G2 boundary

G1 must not: clone LiveTalking, pip torch CUDA on Azure, open public ports, store stream keys, run Playwright against live marketplaces.
