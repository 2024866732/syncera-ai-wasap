# LLM Market Notes — 2026-06/07

Quick reference from live web search during provider selection.

## Free Tier Leaders

| Provider | Model | Quota | Best for |
|---|---|---|---|
| Google AI Studio | Gemini 2.5 Flash | 1,500 req/day, 10 RPM | Daily baseline |
| Groq | Llama 3.1 70B/8B, Mixtral, Gemma 2 | 30 RPM, 1,000 req/day | Fastest inference |
| Cerebras | gpt-oss-120b, zai-glm-4.7 | 5 RPM, 30K TPM, 1M tokens/day | Large prompts |
| OpenRouter free | Qwen3 Coder 480B, Llama 3.3 70B, DeepSeek R1 | Rate-limited | Coding, 1M ctx |

## Cheapest Paid API Models

| Model | Input/M | Output/M | Notes |
|---|---|---|---|
| DeepSeek V4-Flash | $0.09–0.14 | $0.18–0.28 | Best value coding |
| DeepSeek V4-Pro | $0.87–1.74 | $3.48 | Pro tasks |
| Gemini 3.5 Flash | $1.50 | $9.00 | Near-pro quality |
| Groq paid | $0.05 (8B) / $0.59 (70B) | — | LPU if free exhausted |

## Coding Benchmarks (WhatLLM / DEV 2026)

Top: Claude Fable 5 (59.9) > Claude Opus 4.8 > GPT-5.5 (54.8)
Strong cheaper tier: Gemini 3.5 Flash (50.2), GLM-5.2 (51.1), DeepSeek V4 (SWE ~80%).

## OpenRouter Pricing Quick Links

- DeepSeek V4 Flash: https://openrouter.ai/deepseek/deepseek-v4-flash
- Qwen3 Coder 480B free: https://openrouter.ai/qwen/qwen3-coder:free
