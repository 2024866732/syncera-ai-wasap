# G4b TikTok — Office dry-run (2026-08-18)

## Scope

- Approve phrase: `approve G4b tiktok`
- **TikTok only** — do not start Shopee/FB/IG
- Private/test — no public announce, no RTMP
- Cookies/profiles stay on Office disk only

## Preflight (measured)

| Check | Result |
|-------|--------|
| Office host | `hafjet-pc-office` `100.121.94.41` · ~16GB RAM · Python 3.14 |
| DISPLAY / X11 | **Often empty** — no `/tmp/.X11-unix` → headed HITL **blocked** |
| Office → Hermes SSH | May be **Permission denied (publickey)** |
| Hermes orch | `127.0.0.1:8740` · `AINA_BRAIN_MODE=stub` · `POST /session/start` platforms=`["tiktok"]` |
| Orch path that works | **Reverse tunnel Hermes → Office** |

```bash
# On Hermes (after uvicorn up on 127.0.0.1:8740):
ssh -o BatchMode=yes -f -N -R 8740:127.0.0.1:8740 hafizi145@100.121.94.41
# On Office:
curl -s http://127.0.0.1:8740/health
```

Alternative (only if Tuan approves): bind orch to Tailscale IP — not default.

## Office bootstrap

```bash
# From Hermes
rsync -az --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
  -e 'ssh -o BatchMode=yes' \
  ~/projects/hafjet-ai-live-streamer/ \
  hafizi145@100.121.94.41:~/projects/hafjet-ai-live-streamer/

# On Office
mkdir -p ~/hafjet-live-listeners/{profiles/tiktok,logs}
python3 -m venv ~/hafjet-live-listeners/.venv
~/hafjet-live-listeners/.venv/bin/pip install -r \
  ~/projects/hafjet-ai-live-streamer/requirements-listeners.txt
~/hafjet-live-listeners/.venv/bin/playwright install chromium
```

## Two tracks

### A) Private mock live (plumbing proof — preferred when headless)

```bash
# Office terminal 1
~/hafjet-live-listeners/.venv/bin/python \
  ~/projects/hafjet-ai-live-streamer/scripts/g4b_mock_live_server.py --port 8765

# Office terminal 2
export LISTENER_LIVE=1 LISTENER_SLEEP=1 LISTENER_HEADLESS=1
export TIKTOK_LIVE_URL=http://127.0.0.1:8765/
export ORCH_BASE_URL=http://127.0.0.1:8740
export TIKTOK_PROFILE_DIR=$HOME/hafjet-live-listeners/profiles/tiktok
export G4B_MIN_COMMENTS=10 G4B_MAX_REPLIES=2 G4B_STOP_ON_TARGET=1
export G4B_LOG=$HOME/hafjet-live-listeners/logs/g4b_tiktok.jsonl
cd ~/projects/hafjet-ai-live-streamer
~/hafjet-live-listeners/.venv/bin/python scripts/g4b_tiktok_dryrun.py
```

**Pass bar:** `posted >= 10`, optional `typed_reply` 1–2 with `ok`, orch `event_count` matches, only tiktok platform.

Verified once: **10 posts, 2 typed_reply ok**, queue pending speaks, log `g4b_tiktok_v2.jsonl`.

### B) Real TikTok.com

Requires GUI (`DISPLAY=:0` or Windows browser host) + Tuan manual login into persistent profile.

```bash
export LISTENER_HEADLESS=0 LISTENER_LIVE=1 LISTENER_SLEEP=1
export TIKTOK_LIVE_URL='https://www.tiktok.com/@ACCOUNT/live'  # Tuan supplies
# same dry-run script
```

**Hard stop:** captcha, ban signals, empty chat forever after login, selector total break → unhealthy stop **tiktok only**, alert, do not retry-storm.

## Code touchpoints

| File | Role |
|------|------|
| `listeners/tiktok.py` | Live Playwright + multi-selector scrape + reply best-effort |
| `scripts/g4b_tiktok_dryrun.py` | Single-platform loop, JSONL log, min comments |
| `scripts/g4b_mock_live_server.py` | Localhost mock chat + contenteditable input |
| `docs/runbook-g4b-tiktok.md` | Repo-facing report |

## Honesty rule

Never report “TikTok.com live PASS” if only the mock server was used. Label clearly:

- **Mock plumbing PASS** vs **TikTok.com BLOCKED/PASS**.

## Hygiene

- No cookie/profile scp to Hermes or Telegram
- No G4c / other platforms under tiktok-only approve
- Price guard + pause remain on orchestrator (listeners must not bypass)
