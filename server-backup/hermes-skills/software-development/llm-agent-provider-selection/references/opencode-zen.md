# OpenCode Zen Reference

Source: https://opencode.ai/zen, https://opencode.ai/docs/zen/, GitHub issue #1302 (agent0ai/agent-zero).

## What it is

Curated AI gateway for coding agents. Provides tested/optimized models. Works with any OpenAI-compatible client (Hermes, Cursor, Claude Code, Cline, etc.).

## Free Tier Models

| Model ID | Name | Notes |
|----------|------|-------|
| `minimax-m2.5-free` | MiniMax M2.5 Free | Strong coding model |
| `mimo-v2-pro-free` | MiMo V2 Pro Free | Xiaomi coding model |
| `mimo-v2-omni-free` | MiMo V2 Omni Free | Multimodal variant |
| `big-pickle` | Big Pickle | Stealth model, rotating capabilities |
| `nemotron-3-super-free` | Nemotron 3 Super Free | NVIDIA model |

## Endpoints

- Base: `https://opencode.ai/zen/v1`
- Chat: `https://opencode.ai/zen/v1/chat/completions`
- Models: `https://opencode.ai/zen/v1/models`

## Auth

Bearer token from OpenCode Zen account. Get key at https://opencode.ai/auth.

## Pricing

- Free tier: ~100 requests/day, no credit card required (per third-party docs).
- Paid: pay-as-you-go top-up balance. No monthly fee.
- Auto-top-up when balance reaches $5 → adds $20.

## Hermes Config

```bash
hermes config set model.provider openai
hermes config set model.base_url https://opencode.ai/zen/v1
hermes config set model.default minimax-m2.5-free
hermes config set model.api_mode chat_completions
```

## Notes

- Models are curated for coding agents, not general chat.
- Zen models hosted in US; providers claim zero-retention policy.
- OpenCode Go plan uses same ecosystem but different `/go/v1` endpoints.
