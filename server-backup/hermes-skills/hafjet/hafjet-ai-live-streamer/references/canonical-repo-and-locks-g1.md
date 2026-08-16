# Canonical repo + locks after G1 (2026-08-15)

Supersedes outdated bits in `repo-structure.md` / earlier blueprint drafts when they conflict.

## Repo

`~/projects/hafjet-ai-live-streamer`

- Catalog: `catalog/products.json` (not `agent/knowledge/`)
- Persona: `persona/aina_system.md`
- Orchestrator: `orchestrator/api.py` on **`127.0.0.1:8740`**
- G1 verify: `pytest -q` → 17 passed; `/health` → `status: ok`, `gate: G1`
- Details: `references/g1-orchestrator-stub.md`

## Locks

| Topic | Value |
|-------|--------|
| Approach | B hybrid (Hermes brain · RTX avatar · Office listeners · Windows OBS) |
| Comments | Auto AI × 4 platforms |
| Catalog | Static JSON pre-live |
| Avatar | Synthetic first |
| Next gate | Await user phrase **`approve G1`** before G2 |

## Do not

- Re-scaffold G1 if green
- Install LiveTalking on Azure or PC Office
- Skip to public live without G5–G7
