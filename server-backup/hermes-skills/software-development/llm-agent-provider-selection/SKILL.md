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
- “Use model from commandcode.ai / opencode.ai / new provider / unknown provider docs” → map to browser extraction workflow below
- User asks about OpenCode Go, OpenCode Zen, or similar curated model services

## Provider Reachability from HAFJET Server (July 2026)

| Provider | Base URL | Status | Notes |
|---|---|---|---|
| **DeepSeek direct** | `https://api.deepseek.com/v1` | ✅ Works | Cheapest ($0.435/$0.87/M), 7s response |
| **OpenRouter** | `https://openrouter.ai/api/v1` | ✅ Works | Free tier + paid, routes to many models |
| **Groq** | `https://api.groq.com/openai/v1` | ❌ IP banned | 403 error 1010 |
| **OpenCode Zen** | `https://opencode.ai/zen/v1` | ❌ IP banned | 403 error 1010. Go subscription can't work here. |
| **TokenRouter** | `https://api.tokenrouter.com/v1` | ⚠️ Slow | Auth passes but free tier timeout 200s+ |

**Rule:** Always test a new provider with `Bearer dummy` key first. 401 = reachable (auth layer works). 403/1010 = IP banned. Timeout = auth passed but model slow.

## Hermes First-Class Models (2026)

| Rank | Model | Provider | Cost | Notes |
|---|---|---|---|---|
| 1 | DeepSeek V4-Flash | OpenRouter | ~$0.09/M in, $0.18/M out | Best value agentic coding, 1M ctx, SWE-Bench ~80% |
| 2 | Gemini 2.5 Flash | Google AI Studio | FREE | 1,500 req/day, most accessible daily baseline |
| 3 | Groq Llama 3.1 70B | Groq | FREE | Fastest (LPU, 315 TPS), prototyping / debugging |
| 4 | Qwen3 Coder 480B | OpenRouter | FREE | Coding specialist, 1M ctx |
| 5 | Cerebras gpt-oss-120b | Cerebras | FREE | 1M tokens/day, large prompts / batch |

## Curated Flat-Rate Services

| Service | Price | Unique Value | API Endpoint | Notes |\n|---|---|---|---|---|\n| **OpenCode Go** | $10/mo (1st mo $5) | Best flat-rate coding bundle | `https://opencode.ai/zen/go/v1` | 14+ models: Kimi K3, DeepSeek V4 Flash, Qwen3.7 Max, GLM-5.2/5.1, Hy3, etc. Dollar-based limits: **$12/5hr, $30/wk, $60/mo**. See `references/opencode-go-models.md` for exact model IDs. |
| **Mimo Starter (Xiaomi)** | $6/mo (promo $5.28) | Cheapest, 4.1B credits/mo | OpenAI-compatible | MiMo-V2.5 family (text/multimodal/speech), MoE 310B/15B, 1M ctx. base_url `https://api.xiaomimimo.com/v1`. Token Plan uses `tp-xxxxx` key. Asia/China servers. See `references/provider-pricing-2026.md`. |\n| **OpenCode Zen** | Free / PAYG | Curated coding-optimized models | `https://opencode.ai/zen/v1/chat/completions` | Free tier: ~100 req/day, no credit card required per third-party reports. Paid: top-up balance. |\n| MiniMax Token Plus | $20/mo | 4,500 req/5hr window | OpenAI-compatible | MiniMax M2.7 only, high volume |\n| Fireworks Fire Pass | $7/wk | Unlimited tokens, Kimi K2.5 Turbo | OpenAI-compatible | RPM throttled, weekly billing |\n| Synthetic.new 1 Pack | $30/mo | Unlimited, Claude-class tier | OpenAI-compatible | 135 concurrent requests |\n\n## OpenCode Go — Confirmed API & Model IDs\n\nConfirmed during HAFJET CCTV AI Sprint v0.1 model configuration (July 2026) from OpenCode Go docs and pi.dev model listings.\n\n| Parameter | Value |\n|-----------|-------|\n| Provider type | `openai` (OpenAI-compatible) |\n| Base URL | `https://opencode.ai/zen/go/v1` |\n| Auth | `OPENCODE_API_KEY` environment variable |\n\nThe following model IDs are confirmed to work on OpenCode Go:\n\n| Model Display Name | API Model ID | Usage Pool (monthly) | Best For |\n|---|---|---|---|\n| Kimi K3 | `kimi-k3` | $15 | Multi-step coding, architecture, agentic tasks |\n| DeepSeek V4 Flash | `deepseek-v4-flash` | $60 | Fast repetitive coding, shell commands |\n| Qwen3.7 Max | `qwen3.7-max` | $60 | Bahasa Melayu, user-facing text |\n| Hy3 | `hy3` | $60 | General reasoning safety net |\n| GLM-5.2 | `glm-5.2` | $60 | Heavy coding (lower rate limit) |\n\n### Hermes config for OpenCode Go\n\n```bash\n# Set primary provider\nhermes config set model.provider openai\nhermes config set model.base_url https://opencode.ai/zen/go/v1\nhermes config set model.default kimi-k3\n\n# Add fallback chain (interactive — run each command and select the model)\nhermes fallback add   # pick deepseek-v4-flash\nhermes fallback add   # pick qwen3.7-max\nhermes fallback add   # pick hy3 (optional)\n\n# Verify\nhermes fallback\n```\n> **Note:** `hermes fallback add` is interactive by design. There is no non-interactive flag. Each invocation opens a provider/model picker.\n\nSee `references/opencode-go-models.md` for the full pricing table and request-count estimates copied from the official Go docs.\n\n## OpenCode Zen — Free Models\n\nZen free tier exposes these models at `https://opencode.ai/zen/v1/chat/completions`. Auth: Bearer token from OpenCode account.\n\n| Model ID | Name | Notes |\n|---|---|---|\n| `minimax-m2.5-free` | MiniMax M2.5 Free | Strong coding model |\n| `mimo-v2-pro-free` | MiMo V2 Pro Free | Xiaomi coding model |\n| `mimo-v2-omni-free` | MiMo V2 Omni Free | Multimodal variant |\n| `big-pickle` | Big Pickle | Stealth model, rotating capabilities |\n| `nemotron-3-super-free` | Nemotron 3 Super Free | NVIDIA model |\n\nHermes config for Zen free:\n```bash\nhermes config set model.provider openai\nhermes config set model.base_url https://opencode.ai/zen/v1\nhermes config set model.default minimax-m2.5-free\nhermes config set model.api_mode chat_completions\n```\n\n## Google Gemini — Pricing & Access\n\nGoogle AI Pro consumer subscription does NOT provide API access. Use Google AI Studio for API keys.\n\n**Free tier:** `gemini-2.0-flash` free with quota limits. Valid key can still return 429 with `limit: 0` when quota depleted.\n**Paid tier:** per-token pricing, no monthly fee. Top-up starts $50.\n\n| Model | Input / 1M | Output / 1M | Est RM / 1M (4.4) |\n|---|---|---|---|\n| gemini-2.0-flash | $0.15 | $0.75 | ~RM4.00 |\n| gemini-2.0-flash-lite | $0.05 | $0.20 | ~RM1.10 |\n| gemini-2.5-flash | $0.30 | $2.50 | ~RM12.30 |\n| gemini-3.1-pro | $0.75 | $4.50 | ~RM23.10 |\n\nHermes config for Gemini:\n```bash\nhermes config set model.provider gemini\nhermes config set model.base_url https://generativelanguage.googleapis.com/v1beta\nhermes config set model.default gemini-2.0-flash\nhermes config set model.api_mode chat_completions\n```\n\nBudget estimate for Hermes agent usage on Gemini paid tier:\n- Light (50 req/day): ~RM18–30/bulan\n- Medium (150 req/day): ~RM60–120/bulan\n- Heavy (300+ req/day): ~RM200–600/bulan\n\nEnable billing at https://console.cloud.google.com/billing before switching to paid tier.

## Default Hermes Chain for Tuan Hafizi

**⚠️ CRITICAL: OpenCode Zen (opencode.ai) is IP-banned from the HAFJET server** (Cloudflare 403/1010). The user's OpenCode Go subscription ($10/mo) cannot be used from this server. Use alternatives below.

**From this server (HAFJET VPS), only these work:**
- ✅ **DeepSeek direct** (`https://api.deepseek.com/v1`) — cheapest, $2 credit
- ✅ **OpenRouter** (`https://openrouter.ai/api/v1`) — free tier + paid models

| Priority | Model | Provider | Base URL | Notes |
|---|---|---|---|---|
| 1 (primary) | `deepseek-v4-pro` | DeepSeek direct | `https://api.deepseek.com/v1` | Cheapest, 7s response, $2 credit |
| 2 (fallback) | `nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter | `https://openrouter.ai/api/v1` | Free, 550B param, rate-limited |
| 3 (fallback) | `openai/gpt-oss-20b:free` | OpenRouter | `https://openrouter.ai/api/v1` | Free, fast, small |

**OpenCode Go chain** (when running from laptop/non-banned network):
- Primary: `kimi-k3` via `https://opencode.ai/zen/go/v1`
- Fallback 1: `deepseek-v4-flash`
- Fallback 2: `qwen3.7-max`
- Fallback 3: `hy3`

## Upgrade Path Strategy

When evaluating paid options, follow this ladder:

1. **Start free**: Big Pickle (OpenCode Zen free) → zero cost, ~100 req/day
2. **Test consistently**: If free tier rate-limits hamper daily work → upgrade
3. **Paid upgrade order**: OpenCode Go ($10/mo) first → then OpenRouter paid → Gemini API paid last
4. **Try before commit**: "Cuba free dulu, baru decide" — let usage data drive the decision

## Hermes CLI Workflow

Use CLI only — avoid hand-editing config for model + fallback:

```bash
# Set primary model + provider
hermes config set model.default qwen/qwen3-coder:free
hermes config set model.provider openrouter
hermes config set model.base_url https://openrouter.ai/api/v1

# Build ordered fallback chain
hermes fallback list
hermes fallback add   # pick provider/model via interactive picker
hermes fallback list
```

Provider-specific examples are in `references/opencode-zen.md`, `references/gemini-api-access.md`, `references/upgrade-evaluation.md` (cost decision matrix), and `references/provider-pricing-2026.md` (July 2026 market snapshot: DeepSeek V4 Pro direct pricing, OpenCode Go exact limits, Mimo Starter, Groq free setup).

## Additional Provider Proxies

If the user asks for a provider not listed above (e.g. Command Code, OpenCode Zen), extract its API details before configuring Hermes:
1. Open the provider’s docs root + `/provider` or `/api`.
2. Search the rendered article for endpoint URLs: `document.querySelector('article').innerText.match(/https?:\\/\\/[^\\s]+/g)`.
3. Search for auth keywords: `document.querySelector('article').innerText.match(/(Authorization|Bearer|API key|base_url|auth)[^\\n]*/gi)`.
4. Confirm OpenAI or Anthropic compatibility from the same page.
5. Configure Hermes with `hermes config set model.base_url <url>` + `model.api_key <key>` and set `model.provider` to a matching supported provider (often `openai` or `openrouter` format works if OpenAI-compatible).

**Known additional proxies:**
- **Command Code** (`https://api.commandcode.ai/provider/v1`) — OpenAI-compatible `/chat/completions` + Anthropic-compatible `/messages`. Auth: `Authorization: Bearer ***`. **⚠️ Only works on Provider plan ($15/mo); Go plan blocks API access.** See `references/commandcode-api.md`.
- **OpenCode Zen** (`https://opencode.ai/zen/v1`) — OpenAI-compatible. Free models available. See `references/opencode-zen.md`.
- **Google Gemini** (`https://generativelanguage.googleapis.com/v1beta`) — requires AI Studio API key, not consumer subscription. See `references/gemini-api-access.md`.
- **TokenRouter** (`https://api.tokenrouter.com/v1`) — OpenAI-compatible aggregator. Models: `z-ai/glm-5.2-free`, `z-ai/glm-5.2`. ⚠️ From HAFJET server: free-tier `glm-5.2-free` auth-passes but **times out (200s+) — too congested for agentic use**. Paid `glm-5.2` returns 403 on free keys. Only viable on a paid plan.

## Pitfalls

- **OpenCode Zen IP-banned from HAFJET server:** `opencode.ai` returns Cloudflare 403/1010 from this host. The user's OpenCode Go subscription ($10/mo) routes through this domain — **cannot work from this server**. Test with `Bearer dummy` key: if dummy → 403/1010, it's IP ban, not key problem. Use DeepSeek direct or OpenRouter instead.
- **OpenCode CLI `providers login` is browser-interactive:** Requires TUI picker + browser URL. Cannot work from headless VPS. Login from laptop/phone, paste key to chat, configure Hermes manually.
- **OpenCode CLI auth.json doesn't unlock paid models:** Writing `~/.local/share/opencode/auth.json` with API key stores it, but `opencode models` still shows only free tier. CLI may need OAuth tokens, not just API keys.
- **CommandCode Go plan trap:** Go plan allows `/models` but blocks `/chat/completions` and `/messages` with `permission_error`. Upgrade to Provider plan for API access.
- **base_url mismatch:** Switching provider from Nous to OpenRouter requires explicit base_url update. Verify with `hermes config show | grep base_url`.
- **fallback state is separate from config fallback entries:** Use `hermes fallback add`, not manual YAML edits under `fallback_providers:`.
- **Provider routing:** OpenRouter key is required for both DeepSeek and Qwen3-Coder via OpenRouter. Do not route DeepSeek models through Nous base_url.
- **Free quota expiry:** Nous free/sub depleted → detect via status “access depleted” and switch provider instead of waiting.
- **Context vs speed tradeoff:** DeepSeek V4-Flash is cheap but not ultra-fast. For latency-sensitive REPL/tool loops, use Groq free tier.
- **`hermes fallback add` is purely interactive:** The command opens an
  interactive provider/model picker. There is no non-interactive flag. If
  the tool environment cannot interact with the picker (common in automated
  workflows), you cannot add fallbacks via CLI. Workaround: manually edit
  `~/.hermes/config.yaml` and add entries under `fallback_providers:` with
  the correct YAML structure (`provider`, `model`, `base_url`, `api_mode`).
  This bypasses the interactive layer but is functionally equivalent.
- **Restart requirement:** Changing model/fallback requires `/new` (new session) or gateway restart to load fresh config caching.
- **Unknown provider docs:** Don’t guess endpoints. Use the browser extraction pattern above to verify base_url, auth header, and compatibility before configuring Hermes.
- **Gemini subscription ≠ API access:** Google AI Pro consumer subscription does not provide API access. Need separate Google AI Studio API key (`AIza...`).
- **Gemini free tier quota=0:** Valid API key from free-tier project can return 429 with `limit: 0` even when key is correct. Enable billing or use paid tier project.
- **Gemini API pricing:** Pay-per-token only, no monthly fee. Minimum top-up $50. Input/output billed separately. Cached tokens billed at discounted rate.
- **Provider key reuse:** Keys are provider-specific. CommandCode key won’t work with Gemini base_url, and vice versa.
- **TokenRouter free-tier timeout:** `z-ai/glm-5.2-free` passes auth but never returns within 200s from the HAFJET server — free tier too congested for agentic loops needing sub-minute responses. Not a key/config problem; upgrade to a paid plan or use a different provider.
- **Diagnostic ladder for provider failures:** dummy key → 401 means server+auth reachable (network OK); real key → timeout (not 401/403) means auth PASSED but model is slow/queued; real key → 403 "no access to model" means key valid but tier lacks that model. Don't re-check the key on timeouts.

## Trigger (expanded)

- “Compare LLM prices / free tiers / best value”
- “Switch Hermes model / provider / fallback”
- “Configure Hermes to use X as primary, Y as fallback”
- User shows rate limit / quota exhausted / access depleted status
- “Replace OpenRouter owl / lost access / need new provider”
- “Use model from commandcode.ai / opencode.ai / new provider / unknown provider docs” → map to browser extraction workflow above
- “OpenCode Go / OpenCode Zen worth it?” → see Curated Flat-Rate Services table

## User Preferences

- Language: casual Malay with Kelantan dialect
- Depth: concise, scannable (tables / bullets), minimal explanation
- Reasoning style: direct instructions, avoid over-explaining
- Workflow: one-unit-of-work per session, stop after verification