---
name: llm-agent-provider-selection
description: >
  Select cost-effective LLM providers/models for agentic workflows (Hermes, bots, coding agents).
  Use when comparing free/cheap LLM APIs, choosing a primary model for an AI agent, or configuring
  Hermes fallback provider chains. Covers 2026 market best-value picks, free-tier alternatives,
  and Hermes CLI workflow for model + fallback setup.
tags:
  - llm
  - agents
  - openrouter
  - deepseek
  - coding
  - cost-optimization
---

# LLM Agent Provider Selection

Class-level guidance for picking the best LLM model/provider for autonomous agents in 2026.

## Trigger

- “Compare LLM prices / free tiers / best value”
- “Switch Hermes model / provider / fallback”
- “Configure Hermes to use X as primary, Y as fallback”
- User shows rate limit / quota exhausted / access depleted status
- “Replace OpenRouter owl / lost access / need new provider”

## Hermes First-Class Models (2026)

| Rank | Model | Provider | Cost | Notes |
|---|---|---|---|
| 1 | DeepSeek V4-Flash | OpenRouter | ~$0.09/M in, $0.18/M out | Best value agentic coding, 1M ctx, SWE-Bench ~80% |
| 2 | Gemini 2.5 Flash | Google AI Studio | FREE | 1,500 req/day, most accessible daily baseline |
| 3 | Groq Llama 3.1 70B | Groq | FREE | Fastest (LPU, 315 TPS), prototyping / debugging |
| 4 | Qwen3 Coder 480B | OpenRouter | FREE | Coding specialist, 1M ctx |
| 5 | Cerebras gpt-oss-120b | Cerebras | FREE | 1M tokens/day, large prompts / batch |

## Default Hermes Chain for Tuan Hafizi

- **Primary:** `deepseek/deepseek-v4-flash` via OpenRouter
- **Fallback:** `openrouter/qwen3-coder:free`
- **Last resort:** `cerebras/gpt-oss-120b`

## Hermes CLI Workflow

Use CLI only — avoid hand-editing config for model + fallback:

```bash
# Set primary model + provider
hermes config set model.default deepseek/deepseek-v4-flash
hermes config set model.provider openrouter
hermes config set model.base_url https://openrouter.ai/api/v1

# Build ordered fallback chain
hermes fallback list
hermes fallback add   # pick provider/model via interactive picker
hermes fallback list
```

## Pitfalls

- **base_url mismatch:** Switching provider from Nous to OpenRouter requires explicit base_url update. Verify with `hermes config show | grep base_url`.
- **fallback state is separate from config fallback entries:** Use `hermes fallback add`, not manual YAML edits under `fallback_providers:`.
- **Provider routing:** OpenRouter key is required for both DeepSeek and Qwen3-Coder via OpenRouter. Do not route DeepSeek models through Nous base_url.
- **Free quota expiry:** Nous free/sub depleted → renew date is per-subscription; detect via status “access depleted” and switch provider instead of waiting.
- **Context vs speed tradeoff:** DeepSeek V4-Flash is cheap but not ultra-fast. For latency-sensitive REPL/tool loops, use Groq free tier.
- **Restart requirement:** Changing model/fallback requires `/new` (new session) or gateway restart to load fresh config caching.

## User Preferences

- Language: casual Malay with Kelantan dialect
- Depth: concise, scannable (tables / bullets), minimal explanation
- Reasoning style: direct instructions, avoid over-explaining
- This workflow: one-unit-of-work per session, stop after verification
