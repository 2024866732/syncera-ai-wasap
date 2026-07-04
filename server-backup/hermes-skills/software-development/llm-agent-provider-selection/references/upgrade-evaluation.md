# Provider Value Evaluation Guide

## Conversion Rates (Jul 2026)
- 1 USD ≈ RM 4.40
- 1 EUR ≈ RM 4.70

## OpenCode Go vs Free Tier Decision Matrix

| Signal | Action |
|---|---|
| Free model (Big Pickle) works fine for daily tasks | Stay free |
| Getting 429 rate limits 3+ times per day | Upgrade to Go $10/mo |
| Need consistent coding quality without interruptions | Go gives 14 curated models |
| Model quality insufficient for complex refactoring | Try DeepSeek V4 Pro on Go |
| Need Claude/GPT/Gemini specifically | Go won't help — all Chinese models |
| Want to test before spending | Sign up Zen free → try Big Pickle → buy Go later |

## Typical Monthly Token Usage for Hermes

| Usage Level | Req/day | Input/mo | Output/mo | Gemini 2.0 Flash cost/mo |
|---|---|---|---|---|
| Light (QA/chat) | 50 | 7.5M | 2.5M | ~$4.20 (~RM18) |
| Medium (daily coding) | 150 | 45M | 13.5M | ~$27 (~RM119) |
| Heavy (agent tasks) | 300+ | 90M | 40M | ~$67 (~RM295) |

## Typical Monthly Cost Comparison

| Provider | Light | Medium | Heavy | Model Quality |
|---|---|---|---|---|
| **OpenCode Go** | RM44 fixed | RM44 fixed | RM44 fixed | Very good (coded-optimized) |
| Gemini 2.0 Flash (paid) | ~RM18 | ~RM119 | ~RM295 | Good |
| Gemini 2.5 Flash (paid) | ~RM55 | ~RM368 | ~RM903 | Excellent |
| OpenRouter Free | RM0 | RM0 | RM0 | Variable, rate-limited |
| OpenCode Zen Free | RM0 | RM0 | RM0 | Good (Big Pickle) |
