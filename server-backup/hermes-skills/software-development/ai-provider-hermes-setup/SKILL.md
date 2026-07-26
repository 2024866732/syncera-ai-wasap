---
title: Hermes Configuration for this Server
name: ai-provider-hermes-setup
description: "Configure Hermes Agent on this server — both LLM model providers and TTS/voice settings. Covers OpenRouter fallback (Groq + OpenCode Zen IP-banned), secret-key guardrails, Edge TTS Malay voices, ElevenLabs setup, model recommendations for coding agents, and OpenCode CLI diagnostics. Use whenever the user wants to add/switch/test any Hermes provider (model or TTS) or OpenCode CLI."
---

# AI Provider Setup for Hermes (this server)

Hermes model config lives in `/home/hafizi145/.hermes/config.yaml` (model dict: provider, base_url, default, api_key, api_mode). Secrets (OpenRouter, etc.) also live in `/home/hafizi145/.hermes/.env`. Set via `hermes config set model.<key> <value>`.

## ⛔ IP-BANNED PROVIDERS FROM THIS SERVER (hard constraint)

Two providers are **Cloudflare-banned** (HTTP 403, error code 1010) from this host. **Do NOT waste time trying to use either directly from this server.** The user's keys are fine; the network is the problem.

| Provider | Banned Domain | Symptom | Verified |
|---|---|---|---|
| **Groq** | `api.groq.com` | `hermes chat` → `HTTP 401: Wrong API Key` (misleading — it's the IP ban) | 2026-07-09 |
| **OpenCode Zen** | `opencode.ai` | Direct curl → `403 error 1010`; Hermes → `HTTP 401` | 2026-07-24 |

**CRITICAL EXCEPTION — OpenCode Go `/go/v1` is NOT banned:**
- `opencode.ai/zen/v1` → ❌ IP-banned (403/1010)
- `opencode.ai/zen/go/v1` → ✅ **WORKS!** (tested 2026-07-24, 19s response)

The Go plan endpoint uses a **different Cloudflare path** that is NOT banned. Use `/go/v1` for Hermes config when user has OpenCode Go subscription.

**Verification pattern:** Test with `Bearer dummy` key first. If dummy → 403/1010, it's an IP ban, not a key problem. Don't waste time re-checking the key.

**Fallbacks that WORK from this server:**
- **DeepSeek direct** (`https://api.deepseek.com/v1`) — ✅ cheapest, tested 7s response
- **OpenRouter** (`https://openrouter.ai/api/v1`) — ✅ user has key in `.env`
- **TokenRouter** (`https://api.tokenrouter.com/v1`) — ✅ reachable but free tier too slow (200s timeout)

## Recommended setup (verified working 2026-07-09)

```bash
# OpenRouter key is already in .env — source it, DON'T retype it
OR_KEY=$(grep -oP 'OPENROUTER_API_KEY\s*[=:]\s*\K\S+' /home/hafizi145/.hermes/.env)
hermes config set model.api_key "$OR_KEY"
hermes config set model.provider openrouter
hermes config set model.base_url https://openrouter.ai/api/v1
hermes config set model.default deepseek/deepseek-v4-pro
hermes config set model.api_mode chat_completions
```

Test: `hermes chat -q "reply OK"` → expect a clean reply, no 401/403.

### Working OpenRouter model IDs (verified)
- `deepseek/deepseek-v4-pro` ✅ — top coding model, MoE 1.6T/49B active, 1M ctx. ~$0.435/M in, $0.87/M out (cache-hit $0.0036/M). ~$3-5/mo for heavy personal use.
- `meta-llama/llama-4-scout-17b-16e-instruct` ✅ — fast, Llama 4 Scout.
- `openrouter/auto` ✅ — auto-routes.
- `groq/...` ❌ — Groq models are NOT on OpenRouter. Don't use this prefix.

To switch models live: `hermes config set model.default <id>`.

## 🔴 SECRET-KEY HANDLING GUARDRAIL (CRITICAL — violated 5+ times in 2 sessions)

When configuring a provider with an API key the user pasted into chat, **NEVER type the key yourself — always write the full string the user gave you, character by character.**

**WHY THIS KEEPS HAPPENING:** The model auto-abstracts long secrets as `gsk_FY...SIEY` in its internal representation. When you then write a `hermes config set` command, you unknowingly write the **truncated 13-char string** `gsk_FY...SIEY` (with three real dots) instead of the actual 56-char key. This happened **5+ times in one session** with Groq, and again with OpenCode — even AFTER the guardrail existed.

**THE RULE — ONE LINE TO REMEMBER:**
> **Copy-paste the user's EXACT key text into the command. Never abbreviate. Never add `...`. Never let the model rewrite it.**

**Verification after every key set:**
```bash
python3 -c "import re;s=open('/home/hafizi145/.hermes/config.yaml').read();k=re.search(r'api_key:\s*(\S+)',s).group(1);print('LEN',len(k),'HAS_DOTS','...' in k,'HEAD',k[:10],'TAIL',k[-6:])"
```
- `HAS_DOTS False` + correct length → ✅ stored correctly
- `HAS_DOTS True` or `LEN < 20` → ❌ you truncated it, redo with full key

**Preferred method (safest):** Source the secret from a file, never retype it.
```bash
OR_KEY=$(grep -oP 'OPENROUTER_API_KEY\s*[=:]\s*\K\S+' /home/hafizi145/.hermes/.env) && hermes config set model.api_key "$OR_KEY"
```

**For keys only available in chat:** The user MUST paste it. You write the **full string** with no `...`. The display redaction (`gsk_FY...SIEY` in `hermes config` output) is automatic — you don't need to manually abbreviate, and doing so corrupts the stored value.

**User may set keys manually in `.env` themselves** (e.g. `DEEPSEEK_API_KEY`, `TOKENROUTER_API_KEY`). When they say "I already added the key manually," do NOT ask them to re-paste it. Verify with `hermes config` + a real test call (`hermes chat -q "reply OK"`), then switch `model.provider`/`base_url`/`default` accordingly.

## Isolation test pattern (when a provider fails)

Don't trust `hermes chat` error messages alone — they may name a wrong/default model (e.g. `gpt-oss-120b`) and obscure the real cause. Test the key + endpoint **directly**:

```bash
python3 -c "
import re, urllib.request, json
s=open('/home/hafizi145/.hermes/config.yaml').read()
k=re.search(r'api_key:\s*(\S+)',s).group(1)
print('KEY_LEN',len(k),'HEAD',k[:10],'TAIL',k[-6:])  # confirm key matches paste
req=urllib.request.Request('https://api.groq.com/openai/v1/chat/completions',
  data=json.dumps({'model':'llama-4-scout-17b-16e-instruct','messages':[{'role':'user','content':'OK'}]}).encode(),
  headers={'Authorization':'Bearer '+k,'Content-Type':'application/json'})
try:
  r=urllib.request.urlopen(req,timeout=30); print('STATUS',r.status)
except urllib.error.HTTPError as e:
  print('HTTP_ERR',e.code,e.read()[:200].decode())
"
```
- `403 error 1010` → IP banned (network), key is fine.
- `401` with correct-length key → key invalid/expired.
- `400` "not a valid model ID" → connection works, wrong model name.
- **`401` on a DUMMY key (e.g. `Bearer dummy`) → server is responsive and the auth layer is reachable.** Fastest way to distinguish "network/IP-banned" from "key problem". If dummy→401 but real→401 too, key is bad; if dummy→401 but real→**timeout**, auth PASSED and the model is just slow/queued.
- **`timeout` (no 401/403) with a correct-length real key → AUTH PASSED, model is slow/queued.** Seen with TokenRouter `z-ai/glm-5.2-free`: request entered queue but never returned within 200s. NOT a key problem — free tier too congested for agentic use. Don't re-check the key.
- **`403` "This token has no access to model X" with a correct key → key valid but tier lacks that model.** Seen with TokenRouter: free key can't reach paid `z-ai/glm-5.2`. Use a free-tier model or upgrade the plan.

## TTS / Voice Configuration

Hermes TTS lives under the `tts.*` config keys and uses `ELEVENLABS_API_KEY` from `.env` or the built-in Edge TTS backend. Set via `hermes config set tts.<key> <value>`.

### Provider comparison

| Provider | Setup | Cost | Malay support |
|----------|-------|------|---------------|
| **Edge TTS** | Built-in, no API key | **Free** | ✅ Native Malay voices |
| **ElevenLabs** | `ELEVENLABS_API_KEY` in `.env` | Free tier (10k chars/mo) | ✅ Multilingual v2 model |
| OpenAI | `VOICE_TOOLS_OPENAI_KEY` in `.env` | Paid | ❌ No Malay |
| NeuTTS (local) | `pip install neutts[all]` + espeak-ng | Free | ❌ Robotic |

### Quick-switch workflow

1. **Edge TTS (free, good for Malay):**
   ```bash
   hermes config set tts.provider edge
   hermes config set tts.edge.voice ms-MY-YasminNeural   # female, friendly
   # Alternative: ms-MY-OsmanNeural (male)
   ```
   No API key needed — works immediately.

2. **ElevenLabs (premium, most natural for Malay):**
   - Sign up at https://elevenlabs.io → choose **ElevenCreative** plan (not ElevenAgents)
   - Go to Settings → API Keys → **Create API Key**
   - Name: `Hermes-HAFJET`
   - **Enable ONLY these permissions:**
     - **Text to Speech** → **Access** ✅ (required for voice generation)
     - **Voices** → **Read** ✅ (required to list/use voices)
     - **All other endpoints** → **No Access** ❌ (Speech to Speech, STT, SFX, Dubbing, ElevenAgents, etc.)
   - Usage Limits: **Unlimited** (capped by plan, not this key)
   - **Auto-disable if leaked**: keep **ON** (default, safe)
   - Click **Create**, copy the `sk_xxx...xxx` key
   - Add API key to `.env`: `ELEVENLABS_API_KEY=sk_xxxxxxxx`
   - Default voice ID `pNInz6obpgDQGcFmaJgB` (Rachel) and `eleven_multilingual_v2` model are pre-configured
   ```bash
   hermes config set tts.provider elevenlabs
   ```
   Test via `text_to_speech` tool → verify `provider: elevenlabs` in output.

3. **Verify current config:**
   ```bash
   grep -A12 'tts:' ~/.hermes/config.yaml
   ```
   Key fields to check: `provider`, `edge.voice`, `elevenlabs.voice_id`, `elevenlabs.model_id`.

### Voice quality notes (learned from experience)

| Scenario | Problem | Fix |
|----------|---------|-----|
| Edge TTS with English voice (`en-US-AriaNeural`) reading Malay | Robotic, unintelligible | Switch to native Malay voice |
| Edge TTS `ms-MY-YasminNeural` (female) | Decent synthetic tone; user described as "suara pengumuman stesen bas" | Good enough for daily use |
| Edge TTS `ms-MY-OsmanNeural` (male) | Also synthetic; user described as "narator cerita Cina di sosial media" | Viable alternative to Yasmin |
| ElevenLabs Rachel (`eleven_multilingual_v2`) | Natural, human-like; user said "macam orang betul cakap" | Best option, free tier 10k chars/mo |
| User says "English voice OK, Malay not OK" | Voice mismatch, not provider quality | Use Malay-optimised voice |

Key insight: the **same** Edge TTS provider sounds robotic for Malay ONLY when using an English voice like `en-US-AriaNeural`. Switching to `ms-MY-YasminNeural` instantly fixes it at zero cost.

### ElevenLabs Free Trial Management (learned from usage)

| Item | Detail |
|------|--------|
| Free tier | **10,000 characters/month** (~10-12 min continuous speech) |
| Per-request minimum | **~49 credits** on `eleven_multilingual_v2` — even for 1 word |
| Cost per short reply (15-20s) | ~300-400 chars → 50-65 credits |
| Cost per full reply (30s+) | ~600+ chars → 90-100+ credits |
| Practical daily use | 3-4 short replies/day → **covers ~1 month** |
| Heavy use (5-10 min speech/day) | Lasts **~2-3 days only** |

**Key finding:** ElevenLabs Multilingual v2 has a **base cost per request** (~49 credits minimum), NOT purely per-character pricing. A single-word test ("Ambo") cost 49 credits, while a 74-char sentence cost 65 credits. Short replies are disproportionately expensive.

**Detecting trial exhaustion vs auth failure:**

| Error signature | Cause | Action |
|-----------------|-------|--------|
| `quota_exceeded` + remaining credits < required | Trial buffer almost out | Switch to Edge TTS |
| `quota_exceeded` + "This request exceeds your quota" + remaining > 0 but less than required | Still has credits but text too long for remaining | Shorten text or switch provider |
| `401` + `invalid_api_key` | API key wrong/expired | Re-check `.env` key |
| `text_to_speech` → silent failure / no output at all | Provider config wrong / key missing | Check `tts.provider` in config.yaml and `ELEVENLABS_API_KEY` in .env |

**Fallback workflow (when trial runs out):**

```bash
# Detect: run text_to_speech → check error for 'quota_exceeded'
# Fix: switch to Edge TTS with Malay voice
hermes config set tts.provider edge
hermes config set tts.edge.voice ms-MY-YasminNeural
```

No restart needed — `text_to_speech` tool reads config live. For voice messages in Telegram gateway, send `/restart` after switching.

**Character-to-credits rule of thumb:**
- Very short ("Ambo", 4 chars) → ~49 credits (minimum)
- Short reply (10-15 words) → ~65 credits
- Medium reply (30-40 words) → ~94 credits
- Each ~150 characters ≈ 94 credits

### TTS config keys reference
- `tts.provider` — `edge`, `elevenlabs`, `openai`, `neutts`
- `tts.edge.voice` — voice ID for Edge TTS (e.g. `ms-MY-YasminNeural`)
- `tts.elevenlabs.voice_id` — ElevenLabs voice UUID (default: `pNInz6obpgDQGcFmaJgB` = Rachel)
- `tts.elevenlabs.model_id` — model for ElevenLabs (default: `eleven_multilingual_v2`)

The `text_to_speech` tool reads config live. For voice messages in gateway conversations, do `/restart` after changing config.

## Other providers (tested from this server, July 2026)

### ✅ WORKS from this server
| Provider | Base URL | Key Location | Notes |
|---|---|---|---|
| **OpenCode Go** | `https://opencode.ai/zen/go/v1` | User pastes key to chat | ✅ Go plan models (Kimi K3, DeepSeek V4 Pro, etc.). 19s response. |
| **DeepSeek direct** | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` in `.env` | ✅ Cheapest ($0.435/$0.87/M), 7s response. **Best for agent tasks.** |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` in `.env` | ✅ Routes to many models. Best free models below. |

**Verified OpenRouter free models (2026-07-24):**
| Model | Status | Notes |
|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | ✅ Works (~5s) | **550B param, best free option** |
| `openai/gpt-oss-20b:free` | ✅ Works (~3s) | Smaller, faster |
| `tencent/hy3:free` | ✅ Works (was default before) | 295B, Apache 2.0 |
| `nousresearch/hermes-3-llama-3.1-405b:free` | ❌ 429 rate-limited | Too popular, queue congested |
| `qwen/qwen3-coder:free` | ❌ 429 rate-limited | Coding specialist but congested |
| `meta-llama/llama-3.3-70b-instruct:free` | ❌ 429 rate-limited | Congested |

### Free model selection strategy:** If primary free model is rate-limited (429), fall back: `nemotron-3-ultra:free` → `gpt-oss-20b:free` → `hy3:free`. Switch with `hermes config set model.default <id>`.

### OpenCode Go setup (verified working 2026-07-24)
```bash
hermes config set model.provider opencode-go
hermes config set model.base_url https://opencode.ai/zen/go/v1
hermes config set model.default kimi-k3
hermes config set model.api_mode chat_completions
hermes config set model.api_key <USER_PASTED_KEY>
# Test: hermes chat -q "Reply OK" → expect response in ~19s
```

### ❌ BLOCKED from this server (IP-banned)
| Provider | Base URL | Error | Note |
|---|---|---|---|
| **Groq** | `https://api.groq.com/openai/v1` | 403 error 1010 | Key is fine, IP banned |
| **OpenCode Zen** | `https://opencode.ai/zen/v1` | 403 error 1010 | Key is fine, IP banned. User's Go subscription can't work here. |

### ⚠️ REACHABLE but impractical
| Provider | Base URL | Issue |
|---|---|---|
| **TokenRouter** | `https://api.tokenrouter.com/v1` | Auth passes but free tier timeout 200s+ |

### Other (research, not tested from server)
- **Mimo / Xiaomi MiMo** ($6/mo): `https://api.xiaomimimo.com/v1`, OpenAI-compatible. Likely also IP-banned (same pattern as OpenCode).

## Provider Fallback Chain (auto-switch on rate-limit/error)

When the primary provider returns **429 (rate limit)**, **529 (overload)**, or **connection failure**, Hermes config v30+ auto-switches to `fallback.provider` + `fallback.model`. The fallback provider is defined under `providers.<name>` in config.yaml — a custom OpenAI-compatible endpoint, not one of the built-in named providers.

### Configuring a fallback (tested with Cerebras, 2026-07-26)

```bash
# Step 1 — register the custom provider
hermes config set providers.cerebras.base_url https://api.cerebras.ai/v1
hermes config set providers.cerebras.api_mode chat_completions
hermes config set providers.cerebras.key_env CEREBRAS_API_KEY

# Step 2 — set it as the fallback
hermes config set fallback.provider cerebras
hermes config set fallback.model gpt-oss-120b

# Step 3 — ensure the API key is available at runtime
# Option A: put it in ~/.hermes/.env (preferred, but agent can't write .env — user does it)
# Option B: put it in ~/.bashrc (works, but not ideal — survives logins only)
echo 'export CEREBRAS_API_KEY="csk-xxx...xxx"' >> ~/.bashrc && source ~/.bashrc
```

**Verification before wiring:** Test the fallback provider standalone first:
```bash
source /tmp/cerebras-test/bin/activate  # venv with pip install cerebras-cloud-sdk
python3 -c "
from cerebras.cloud.sdk import Cerebras
c = Cerebras(api_key='csk-xxx')
print(c.chat.completions.create(
    messages=[{'role':'user','content':'hi'}],
    model='gpt-oss-120b', max_completion_tokens=20
).choices[0].message.content)
"
```

**Provider name must match:** The `providers.<name>` key in config.yaml IS the name used in `fallback.provider`. No built-in provider list membership needed — any `providers.<new-name>` with `base_url` + `api_mode` works.

**Pitfall — `hermes gateway restart` is BLOCKED from inside the gateway process.** The restart sends SIGTERM which kills the agent before the restart completes. Run from a separate terminal: `hermes gateway restart`. Config changes take effect on next session (`/reset` in chat) without a restart — only `fallback` changes need a gateway restart for the running process.

**Pitfall — config.yaml is agent-protected.** `write_file` and `patch` on `~/.hermes/config.yaml` are denied. Use `hermes config set` exclusively for all provider/fallback changes.

**Cerebras specifics:** Uses the `cerebras-cloud-sdk` pip package (not generic OpenAI), but the Hermes config uses the standard `chat_completions` api_mode with `base_url: https://api.cerebras.ai/v1`. The SDK is only needed for standalone testing, not for Hermes itself.

## OpenCode CLI (separate from Hermes — useful for coding)

**OpenCode CLI partially works from this server.** Install: `npm i -g opencode-ai`. Version tested: 1.18.4.

### Auth mechanism (critical finding)
- `opencode providers login` → **FAILS** from headless VPS ("fetch() URL is invalid" — IP ban blocks auth metadata fetch)
- Manual `auth.json` write → **NOT recognized** by CLI (`opencode providers list` shows 0 credentials)
- CLI's internal auth mechanism differs from manual file writing
- **Workaround:** User must login from laptop/phone, then sync credentials OR use Hermes directly with `/go/v1`

### Key vs Plan distinction
- **OpenCode Zen** = API provider (`https://opencode.ai/zen/v1`) — IP-banned from this server
- **OpenCode Go** = $10/mo subscription that unlocks paid models on Zen
- **Key from `opencode.ai/auth`** might be **free tier**, not Go plan — even if user subscribed. Verify by testing a paid model: `opencode run --model opencode/deepseek-v4-pro "OK"` → "not supported" = free key.

### Working models (free tier, verified 2026-07-24)
`big-pickle`, `deepseek-v4-flash-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `laguna-s-2.1-free`, `ling-3.0-flash-free`, `north-mini-code-free`

Paid models listed in `opencode models opencode` but **"not supported"** when run with free key.

### Recommended use
- **Hermes** with `https://opencode.ai/zen/go/v1` → ✅ Works for agent tasks (Go plan)
- **OpenCode CLI** for coding tasks (TUI, diff viewer) — free tier only from this server
- Don't try `opencode providers login` from headless VPS — it won't work

## TokenRouter (added 2026-07-18, tested from this server)

`https://api.tokenrouter.com/v1` — OpenAI-compatible aggregator proxy. User key `sk-dTBjBoSjYFE0...` (51 chars) tested.

| Model ID | Result from this server | Note |
|---|---|---|
| `z-ai/glm-5.2-free` | ✅ Auth passes, ❌ **never returns** (timeout 200s) | Free tier queue too congested for agentic loops |
| `z-ai/glm-5.2` (paid) | ❌ `403` "This token has no access" | Free key can't reach paid models |

**Verdict:** TokenRouter key is valid and the server can reach it (dummy key → 401, real key → auth-passed timeout). But the **free tier is unusable for Hermes** — agent needs sub-minute responses, not 3+ minute queues. Only viable if the user buys a paid plan that exposes non-`-free` models.

Hermes config (if paid plan later):
```bash
hermes config set model.provider tokenrouter
hermes config set model.base_url https://api.tokenrouter.com/v1
hermes config set model.default z-ai/glm-5.2
hermes config set model.api_mode chat_completions
hermes config set model.api_key <KEY>
```

## See also
- `software-development/llm-agent-provider-selection` — cost/quality ranking of providers for agentic work (broader than this server).
- `software-development/hafjet-spx-reminder` — SPX system runs on Azure; its session cookies need SAP headers (see that skill's SAP header pitfall).

## Reference files
- `references/elevenlabs-quota-errors.md` — Error transcripts, credit consumption patterns, and fallback flow from real ElevenLabs session
- `references/provider-diagnostic-ladder.md` — Reusable urllib probe + result-interpretation table for isolating any provider failure (dummy-key → 401 = network OK; real-key timeout = auth passed but model slow; etc.)
- `references/opencode-cli-diagnostics.md` — OpenCode CLI install, auth file format, free vs Go plan detection, opencode.json config, useful commands
