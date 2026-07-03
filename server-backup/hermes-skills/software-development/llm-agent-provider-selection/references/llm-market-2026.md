# LLM Market Notes — 2026-06/07

Quick reference from live web search during provider selection.

## Free Tier Leaders

| Provider | Model | Quota | Best for | Notes |
|---|---|---|---|---|
| Google AI Studio | Gemini 2.5 Flash | 1,500 req/day, 10 RPM | Daily baseline | |
| Groq | Llama 3.1 70B/8B, Mixtral, Gemma 2 | 30 RPM, 1,000 req/day | Fastest inference | LPU speed |
| Cerebras | gpt-oss-120b, zai-glm-4.7 | 5 RPM, 30K TPM, 1M tokens/day | Large prompts | |
| OpenRouter free | Qwen3 Coder 480B, Llama 3.3 70B, DeepSeek R1 | Rate-limited | Coding, 1M ctx | ~20 req/min |
| **OpenCode Zen** | **MiniMax M2.5 Free, MiMo V2 Pro/Omni Free, Big Pickle, Nemotron 3 Super Free** | **100 req/day (free tier)** | **Coding agents, curated models** | **No credit card required per third-party sources** |

## Flat-rate API Subscriptions (Best Value for Coding Agents)

| Plan | Price | Limit | Models Included | API? |
|---|---|---|---|---|
| **OpenCode Go** | $10/mo | 5-hour request windows | DeepSeek V4 Pro, Kimi K2.7 Code, Qwen3.7 Max, MiMo-V2.5-Pro, MiniMax M3, GLM-5.2 | Yes |
| MiniMax Token Starter | $10/mo | Fraction of Plus window | MiniMax M2.7 | Yes |
| MiniMax Token Plus | $20/mo | 4,500 req/5hr | MiniMax M2.7 + speech/image | Yes |
| Fireworks Fire Pass | $7/wk (~$30/mo) | Unlimited tokens, RPM throttled | Kimi K2.5 Turbo | Yes |
| Synthetic.new 1 Pack | $30/mo | Unlimited, 135 concurrent | Claude-class frontier | Yes |
| OpenCode Zen PAYG | Top-up ~$20 | Per request, no markup | Kimi K2.5, GPT-5-Codex, Claude, Gemini | Yes |

## Consumer Subscriptions (CLI/API unlocked)

| Plan | Price | Models | Notes |
|---|---|---|---|
| GitHub Copilot Pro | $10/mo | GPT-5.5, Claude Code, Codex | Credits-based from June 2026 |
| Kimi Moderato | ~$19/mo | Kimi K2 + Kimi Code CLI | Rolling 5-hour quota |
| Claude Pro | $20/mo | All Claude models + Claude Code CLI | ~6k msgs/5h |
| ChatGPT Plus | $20/mo | GPT-5.5 + Codex | ~86k msgs/mo |
| Google AI Pro | $19.99/mo | Gemini 3.1 Pro, 1M ctx | Long-context |

## Cheapest Paid API Models (Per Token)

| Model | Input/M | Output/M | Notes |
|---|---|---|---|
| DeepSeek V4-Flash | $0.09–0.14 | $0.18–0.28 | Best value coding |
| DeepSeek V4-Pro | $0.87–1.74 | $3.48 | Pro tasks |
| MiniMax M2.7 | $0.30 | $1.20 | Multimodal, 1M ctx |
| Groq paid | $0.05 (8B) / $0.59 (70B) | — | LPU speed |

## Coding Benchmarks (WhatLLM / DEV 2026)

Top: Claude Fable 5 (59.9) > Claude Opus 4.8 > GPT-5.5 (54.8)
Strong cheaper tier: Gemini 3.5 Flash (50.2), GLM-5.2 (51.1), DeepSeek V4 (SWE ~80%).

## Provider-Specific Quirks

### Command Code
- **Go plan** blocks API access. Only Provider plan ($15/mo) allows `/chat/completions` and `/messages`.
- Models endpoint remains public.
- Auth: `Authorization: Bearer <token>`.

### OpenCode Zen
- Free models available without credit card (100 req/day).
- Endpoint: `https://opencode.ai/zen/v1/chat/completions`
- Auth: Bearer token from OpenCode account.
- Completely optional add-on to OpenCode CLI; can be used standalone by any agent.

## OpenRouter Pricing Quick Links

- DeepSeek V4 Flash: https://openrouter.ai/deepseek/deepseek-v4-flash
- Qwen3 Coder 480B free: https://openrouter.ai/qwen/qwen3-coder:free
