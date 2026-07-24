# Gemini Free Tier — for JARVIS LLM provider setup

Source: Google AI for Developers rate-limits docs + multiple 2026 community writeups (consistent across sources as of 2026-07).

## Free tier limits (approx — confirm at https://ai.google.dev/gemini-api/docs/rate-limits)
| Metric | Free tier |
|---|---|
| RPM (requests / min) | ~15 (varies by model; **Gemini 2.0 Flash** has the highest) |
| RPD (requests / day) | ~1,500 |
| TPM (tokens / min) | ~1,000,000 |
| Card required | **No** |
| Expiry | No (free tier does not expire) |
| Paid tiers | Tier 1 ~150–300 RPM; Tier 2 1,000+ RPM after $250 cumulative spend; Tier 3 (enterprise) custom 4,000+ RPM |

## Get a key
- https://aistudio.google.com/apikey → sign in with Google → create key instantly.

## Where the key goes in JARVIS
- Dashboard **Settings → LLM** → add Gemini provider → paste key. Stored in **encrypted keychain** (NOT env var / config.yaml). The agent must NOT type Tuan's key.

## Implications for an always-on autonomous daemon
- 15 RPM is **tight** for 24/7 autonomous use. JARVIS background services (heartbeat, commitments, awareness) + a sidecar capturing the screen every 5–10s will exhaust quota quickly if left fully autonomous.
- Mitigations:
  - Use **Gemini 2.0 Flash** (best free-tier throughput/quality).
  - During testing, don't leave the daemon autonomously running for long stretches on free tier.
  - Consider a paid tier if JARVIS is meant to run unattended 24/7.
- Privacy trade-off: Google may train on free-tier prompts. Opt-out available in Google AI Studio settings. For strict privacy, use a paid tier or a local Ollama instance (but office PC is i3-2100 CPU-only → local models are slow/heavy).
