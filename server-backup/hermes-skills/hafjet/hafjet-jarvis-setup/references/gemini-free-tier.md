# Gemini API Free Tier (for JARVIS LLM)

JARVIS supports Gemini natively as an LLM provider. Free tier works — no credit card, no expiration.

## Limits (as of 2026, model-dependent)
| Metric | Free Tier |
|---|---|
| RPM (requests/min) | ~15 (Gemini 2.0 Flash has the highest) |
| RPD (requests/day) | ~1,500 |
| TPM (tokens/min) | ~1M |

Paid tiers scale up: Tier 1 ~150-300 RPM, Tier 2 ~1000+ RPM after $250 cumulative spend.

## Get a key
- https://aistudio.google.com/apikey → sign in with Google → create key.
- Entered in JARVIS dashboard Settings → LLM, stored in encrypted keychain + DB (NOT env var).

## Tradeoffs
- **Free tier may use prompts for model training.** Opt out in Google AI Studio settings if privacy matters.
- **Quota burns fast** for an autonomous 24/7 daemon (screen capture every 5-10s via sidecar, multi-agent delegation, goal/heartbeat services). Keep autonomous features light during testing; prefer **Gemini 2.0 Flash** (cheapest + highest free-tier limits).

## Source note
Official limits: https://ai.google.dev/gemini-api/docs/rate-limits (verify before relying on exact numbers — they shift). Cross-checked against multiple 2026 third-party writeups which agreed on ~15 RPM / 1500 RPD / 1M TPM.
