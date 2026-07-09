# 2026 LLM Provider Pricing & Limits (July 2026 snapshot)

Condensed market data for cost-effective agentic coding. DATED — verify before committing money.
Compiled from live web research during Tuan Hafizi's provider-evaluation session (Jul 2026).

## Pay-per-token (no monthly fee) — best value for heavy use

### DeepSeek V4 Pro (direct API, `https://api.deepseek.com/v1`)
- Pricing (permanent 75% reduction after 2026-05-31): **$0.435/M cache-miss input, $0.003625/M cache-hit input, $0.87/M output**
- Specs: 1.6T total params, 49B activated (MoE), 1M context window
- Benchmark: Intelligence 31.2 (82nd percentile per aggregators)
- OpenAI-compatible. ~$3-5/mo for HEAVY personal agentic use (≈1000 tasks ≈ $5)
- Hermes: `model.provider=openai` (custom base_url), `default=deepseek-v4-pro`
- **Verdict:** cheapest path to a top-tier model with zero monthly lock-in

## Curated subscriptions

### OpenCode Go — $10/mo (first month $5)
- 14 models: GLM-5.2, GLM-5.1, DeepSeek V4 Pro, Qwen 3.7, MiniMax M3, Kimi, etc.
- **Limits (dollar-based): $12 / 5 hours, $30 / week, $60 / month**
- Servers: US, EU, **Singapore** (stable global, good MY latency)
- OpenAI-compatible. Best for MODEL VARIETY + reliable global access
- Caveat: "Only one member per workspace can subscribe"

### Mimo Starter Pack (Xiaomi MiMo) — $6/mo (promo $5.28)
- 4.1 Billion credits/month (credit→token conversion NOT 1:1 confirmed, still generous)
- Model: MiMo-V2.5 family (text flagship / multimodal / speech), MoE 310B/15B active, 1M ctx
- API: OpenAI-compatible, base_url `https://api.xiaomimimo.com/v1`
- Token Plan uses `tp-xxxxx` key + possibly different subscription endpoint (check dashboard)
- 20% off-peak discount = PDT 9AM-5PM = **MYT midnight-8AM** (user asleep → mostly full price)
- Servers: Asia/China. Cheapest option, but SINGLE model family

## Free tiers (zero cost)

### OpenCode Zen — 100 req/day
- Models: minimax-m2.5-free, mimo-v2-pro-free, big-pickle, nemotron-3-super-free
- base_url `https://opencode.ai/zen/v1`, OpenAI-compatible

### Groq — free tier
- base_url `https://api.groq.com/openai/v1`, OpenAI-compatible
- Models: `llama-4-scout-17b-16e-instruct` (default coding), `qwen-qwq-32b` (reasoning), `deepseek-r1-distill-llama-70b`, `llama-3.3-70b-versatile`
- Rate limit ~30 req/min + daily cap — throttles on heavy agentic use
- Ultra-fast (LPU). Best for testing / light coding. $0

### DeepSeek chat (consumer) — NOT an API

## Decision logic (Tuan Hafizi context: price-sensitive, Hermes coding agent)
- Cheapest + top model, no lock-in → **DeepSeek V4 Pro direct** (~$3-5/mo)
- Variety + reliability → **OpenCode Go** ($10/mo, 14 models, SG server)
- Zero-cost testing → **Groq free** or **OpenCode Zen free**
- Mimo ONLY if pure price priority + OK single-model + Asia servers
- ALWAYS keep a free tier (Zen/Groq) as backup

## Hermes setup snippets
```bash
# Groq free
hermes config set model.provider openai          # or 'groq' if recognized
hermes config set model.base_url https://api.groq.com/openai/v1
hermes config set model.default llama-4-scout-17b-16e-instruct
hermes config set model.api_mode chat_completions

# DeepSeek V4 Pro direct
hermes config set model.provider openai
hermes config set model.base_url https://api.deepseek.com/v1
hermes config set model.default deepseek-v4-pro

# Mimo (Token Plan may need tp- endpoint)
hermes config set model.provider openai
hermes config set model.base_url https://api.xiaomimimo.com/v1
hermes config set model.default mimo-v2.5
```
Note: set `api_key` separately via `hermes config set model.api_key <key>` (never hardcode).
