# Google Gemini API — Access & Pricing

Source: https://ai.google.dev/gemini-api/docs/pricing, https://aistudio.google.com/apikey.

## Key Distinction: Subscription vs API Key

- **Google AI Pro** ($19.99/mo): consumer subscription for Gemini app/web only. Does NOT include API access for Hermes/external clients.
- **Google AI Studio API key**: required for API access. Create at https://aistudio.google.com/apikey. Key starts with `AIza...`.

## Free Tier Behavior

Valid API key on free-tier project can still return 429:
```
Quota exceeded for metric: ...free_tier_input_token_count, limit: 0
```
Causes:
1. Free quota genuinely exhausted
2. Project has no billing linked and free limits collapsed to 0
3. Model-specific free quota not enabled

Fix: enable billing in Google Cloud Console, or create new project with billing enabled.

## Paid Tier Pricing (per 1M tokens, USD)

| Model | Input | Output | Est RM (4.4) |
|---|---|---|---|
| gemini-2.0-flash | $0.15 | $0.75 | ~RM4.00 |
| gemini-2.0-flash-lite | $0.05 | $0.20 | ~RM1.10 |
| gemini-2.5-flash | $0.30 | $2.50 | ~RM12.30 |
| gemini-3.1-pro | $0.75 | $4.50 | ~RM23.10 |
| gemini-3.5-flash | $1.50 | $9.00 | ~RM46.20 |
| gemini-3-pro | $2.00 | $12.00 | ~RM61.60 |

- No monthly fee. Pay-per-token only.
- Minimum top-up: $50.
- Cached input tokens: ~10% of standard input price.
- Grounding with Google Search: free 5,000 prompts/mo for Gemini 3, then $14/1k queries.

## Hermes Config

```bash
hermes config set model.provider gemini
hermes config set model.base_url https://generativelanguage.googleapis.com/v1beta
hermes config set model.default gemini-2.0-flash
hermes config set model.api_mode chat_completions
```

## Budget Estimate (Hermes Agent)

| Usage level | Model | Est RM/bulan |
|---|---|---|
| Light (50 req/day) | 2.0 Flash | ~RM18–30 |
| Medium (150 req/day) | 2.0 Flash | ~RM60–120 |
| Medium (150 req/day) | 2.5 Flash | ~RM250–500 |
| Heavy (300+ req/day) | 3.1 Pro | ~RM300–600 |

Enable billing: https://console.cloud.google.com/billing
