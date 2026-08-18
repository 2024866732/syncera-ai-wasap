# G4a — Listeners fixtures (2026-08-18)

## What shipped

- Repo modules under `~/projects/hafjet-ai-live-streamer/listeners/`
- Fixture mode only; **no** Office Playwright live until G4b
- Full suite **55 passed** with `AINA_BRAIN_MODE=stub LISTENER_SLEEP=0`

## HTML contract

```html
<div class="hfj-comment" data-id="…" data-user="…" data-ts="…">comment text</div>
```

Parser: `listeners/parse_html.py` → `CommentEvent` aligned with `agent.schema`.

## Safety defaults

| Control | Value |
|---------|--------|
| human_delay | 1.5–4.0s (`sleep=False` unless `LISTENER_SLEEP=1`) |
| RateLimiter | 6 events / 60s |
| Deduper | event_id + normalized text / 60s |
| UserCooldown | 60s |
| Pause | `OrchestratorClient.should_skip_typed_reply()` if inactive/paused |
| Live | `LISTENER_LIVE=1` + mode=live; G4a raises `LiveNotEnabled` otherwise |

## Runner isolation

`ListenerRunner.force_fail(platform)` marks one unhealthy/stopped; siblings keep `selector_ok`. Restart backoff short in tests; live runbook uses longer delays.

## Git hygiene

Never commit: `listeners/profiles/`, `**/*.storage_state.json`, `hafjet-live-listeners/`, cookies.

## Office live (G4b checklist — not executed in G4a)

1. venv + `requirements-listeners.txt` + `playwright install chromium`
2. Manual login per profile dir under `~/hafjet-live-listeners/profiles/<platform>/`
3. Tunnel orch if needed: Office `ssh -N -L 8740:127.0.0.1:8740` → Hermes
4. `ENABLED_PLATFORMS=shopee LISTENER_LIVE=1 LISTENER_USE_ORCH=1 LISTENER_SLEEP=1 python -m listeners.runner`
5. Prefer `/session/pause` before stop

## Related repo docs

- `docs/runbook-g4-listeners.md`
- Plan: `~/docs/superpowers/plans/2026-08-18-hafjet-ai-live-streamer-g4.md`
