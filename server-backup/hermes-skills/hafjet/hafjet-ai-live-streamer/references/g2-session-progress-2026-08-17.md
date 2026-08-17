# G2 session progress (2026-08-15 → 2026-08-17)

Update for agents: SKILL.md status section may lag; **this file is authoritative for G2 progress**.

## Done

| Item | State |
|------|--------|
| Design spec | `~/docs/superpowers/specs/2026-08-15-hafjet-ai-live-streamer-design.md` |
| G1 | `approve G1` · repo `~/projects/hafjet-ai-live-streamer` · pytest **26** · `/health` ok · stub brain |
| G2 plan | `~/docs/superpowers/plans/2026-08-15-hafjet-ai-live-streamer-g2.md` |
| G2 Task 1 | Hermes glue: `avatar/livetalking_glue/*`, CB unit tests, runbooks |
| G2 Task 2 | RTX preflight **PASS** (see `g2-rtx-preflight-2026-08.md`) |
| G2 Task 3 | `~/hafjet-live/` dirs + glue deploy **PASS**; lock/CB/dry-run OK; CCTV venv intact |

## Blocked until Tuan OK

- Task 4+: LiveTalking clone/install, dedicated venv, weights, TTS full path, OBS 30s, CCTV skip patch

## Workflow lessons (encode)

1. **Narrow task scope is hard stop** — “Task 3 sahaja” / “jangan Task 4” → report and wait.
2. **Hermes→RTX SSH** must jump PC Office + `id_ed25519_office2rtx` → `hafjet@100.119.32.87`.
3. **Dedicated LiveTalking venv** ≠ `~/cctv-analysis/.venv` (YOLO torch 2.13.0+cu126).
4. **LIVE_GPU_LOCK** = `~/hafjet-live/LIVE_GPU_LOCK`; release after demo unless testing skip.
5. Inline G2 after `approve G2`; Task 1 Hermes-safe first; preflight BLOCKED if Tailscale offline.
6. CB: temp 80/88 · VRAM 8192/10752 MiB · no auto-resume.

## Quick commands

```bash
# RTX via Office jump
ssh -o BatchMode=yes hafizi145@100.121.94.41 \
  'ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes hafjet@100.119.32.87 '"'"'…'"'"

# On RTX after Task 3
python3 ~/hafjet-live/bin/livetalking_glue/circuit_breaker.py
python3 ~/hafjet-live/bin/livetalking_glue/gpu_lock.py status
```
