# OpenCode Go — Model IDs & Pricing Reference

Source: https://opencode.ai/docs/go/ (official docs, July 2026)

## Base URL

```
https://opencode.ai/zen/go/v1
```

OpenAI-compatible. Auth via `OPENCODE_API_KEY` environment variable.

## Confirmed Model IDs

Used with OpenCode Go API. Tested during HAFJET CCTV AI Sprint v0.1:

| Model Display Name | API Model ID | Usage Pool (monthly) | Type |
|---|---|---|---|
| Grok 4.5 | `grok-4.5` | $15 | Reasoning (high limit) |
| GLM-5.2 | `glm-5.2` | $60 | Heavy coding |
| GLM-5.1 | `glm-5.1` | $60 | Heavy coding |
| Kimi K3 | `kimi-k3` | $15 | Multi-step reasoning, agentic |
| Kimi K2.7 Code | `kimi-k2.7-code` | $60 | Coding specialist |
| Kimi K2.6 | `kimi-k2.6` | $60 | General reasoning |
| MiMo-V2.5 | `mimo-v2.5` | $60 | Lightweight (high throughput) |
| MiMo-V2.5-Pro | `mimo-v2.5-pro` | $15 | Lightweight pro |
| MiniMax M3 | `minimax-m3` | $60 | General |
| MiniMax M2.7 | `minimax-m2.7` | $60 | General |
| Qwen3.7 Max | `qwen3.7-max` | $60 | Heavy BM/EN text, coding |
| Qwen3.7 Plus | `qwen3.7-plus` | $60 | Fast general |
| Qwen3.6 Plus | `qwen3.6-plus` | $60 | Fast general |
| DeepSeek V4 Pro | `deepseek-v4-pro` | $15 | Heavy coding |
| DeepSeek V4 Flash | `deepseek-v4-flash` | $60 | Fast coding, highest throughput |
| Hy3 | `hy3` | $60 | General reasoning safety net |

## Pricing per 1M tokens

Based on the official Go billing table:

| Model | Input | Output | Cached Read | Cached Write |
|---|---|---|---|---|
| Grok 4.5 | $2.00 | $6.00 | $0.30 | - |
| GLM-5.2 | $1.40 | $4.40 | $0.26 | - |
| GLM-5.1 | $1.40 | $4.40 | $0.26 | - |
| Kimi K3 | $3.00 | $15.00 | $0.30 | - |
| Kimi K2.7 Code | $0.95 | $4.00 | $0.19 | - |
| Kimi K2.6 | $0.95 | $4.00 | $0.16 | - |
| MiMo V2.5 | $0.14 | $0.28 | $0.0028 | - |
| MiMo V2.5 Pro | $0.435 | $0.87 | $0.003625 | - |
| MiniMax M3 | $0.30 | $1.20 | $0.06 | - |
| MiniMax M2.7 | $0.30 | $1.20 | $0.06 | $0.375 |
| Qwen3.7 Max | $2.50 | $7.50 | $0.50 | $3.125 |
| Qwen3.7 Plus (≤256K) | $0.40 | $1.60 | $0.04 | $0.50 |
| Qwen3.7 Plus (>256K) | $1.20 | $4.80 | $0.12 | $1.50 |
| Qwen3.6 Plus (≤256K) | $0.50 | $3.00 | $0.05 | $0.625 |
| Qwen3.6 Plus (>256K) | $2.00 | $6.00 | $0.20 | $2.50 |
| DeepSeek V4 Pro | $0.435 | $0.87 | $0.003625 | - |
| DeepSeek V4 Flash | $0.14 | $0.28 | $0.0028 | - |
| Hy3 | $0.14 | $0.58 | $0.035 | - |

## Estimated request counts (per subscription)

Based on $60/month usage pool (Kimi K3 uses the $15 pool):

| Model | Requests per 5 hours | Requests per week | Requests per month |
|---|---|---|---|
| Grok 4.5 | 120 | 300 | 600 |
| GLM-5.2 | 880 | 2,150 | 4,300 |
| GLM-5.1 | 880 | 2,150 | 4,300 |
| Kimi K3 | 110 | 250 | 490 |
| Kimi K2.7 Code | 1,350 | 3,380 | 6,750 |
| Kimi K2.6 | 1,150 | 2,880 | 5,750 |
| MiMo-V2.5 | 30,100 | 75,200 | 150,400 |
| MiMo-V2.5-Pro | 3,250 | 8,150 | 16,300 |
| MiniMax M3 | 3,200 | 8,000 | 16,000 |
| MiniMax M2.7 | 3,400 | 8,500 | 17,000 |
| Qwen3.7 Max | 950 | 2,390 | 4,770 |
| Qwen3.7 Plus | 4,300 | 10,800 | 21,600 |
| Qwen3.6 Plus | 3,300 | 8,200 | 16,300 |
| DeepSeek V4 Pro | 3,450 | 8,550 | 17,150 |
| DeepSeek V4 Flash | 31,650 | 79,050 | 158,150 |
| Hy3 | 4,300 | 10,750 | 21,500 |

## Routing matrix (HAFJET default)

| Task Type | Model to Use |
|---|---|
| Multi-step coding, architecture, diff review, debugging panjang | Kimi K3 (primary) |
| Fast repetitive coding, shell commands, lightweight fixes | DeepSeek V4 Flash (fallback 1) |
| Bahasa Melayu heavy prompts / user-facing BM text | Qwen3.7 Max (fallback 2) |
| Reasoning heavy (if primary + fallback 1-2 unavailable) | Hy3 (fallback 3) |
