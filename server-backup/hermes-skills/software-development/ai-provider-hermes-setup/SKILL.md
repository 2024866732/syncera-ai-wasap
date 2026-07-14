---
title: Hermes Configuration for this Server
name: ai-provider-hermes-setup
description: "Configure Hermes Agent on this server — both LLM model providers and TTS/voice settings. Covers OpenRouter fallback (Groq is IP-banned), secret-key guardrails, Edge TTS Malay voices, ElevenLabs setup, and model recommendations for coding agents. Use whenever the user wants to add/switch/test any Hermes provider (model or TTS)."
---

# AI Provider Setup for Hermes (this server)

Hermes model config lives in `/home/hafizi145/.hermes/config.yaml` (model dict: provider, base_url, default, api_key, api_mode). Secrets (OpenRouter, etc.) also live in `/home/hafizi145/.hermes/.env`. Set via `hermes config set model.<key> <value>`.

## ⚠️ GROQ IS IP-BANNED FROM THIS SERVER (hard constraint)

`api.groq.com` returns **Cloudflare HTTP 403, error code 1010** from this host — the server's egress IP is banned. A valid Groq key still fails (401/403). **Do NOT waste time trying to use Groq directly from this server.** The user's Groq key is fine; the network is the problem.

**Symptom:** `hermes chat` → `HTTP 401: Wrong API Key` (or direct curl → `403 error 1010`). The 401 is misleading — it's the IP ban, not a bad key.

**Fallback that WORKS:** **OpenRouter** (`https://openrouter.ai/api/v1`). The user already has an `OPENROUTER_API_KEY` in `.env`. OpenRouter is NOT IP-banned here and routes to DeepSeek, Llama, Qwen, etc.

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

## 🔴 SECRET-KEY HANDLING GUARDRAIL (critical, learned the hard way)

When configuring a provider with an API key the user pasted into chat, **NEVER truncate the key with `...` in the `hermes config set` command.** Writing `gsk_FY...SIEY` stores the literal 13-char string `gsk_FY...SIEY` (with three real dots) as the key → every call 401s.

This happened 4 times in one session. The model auto-abstracts long secrets as `gsk_FY...SIEY` even when the real value is known. **The fix:**

1. **Source the secret from a file, never retype it.** For OpenRouter: `OR_KEY=$(grep -oP 'OPENROUTER_API_KEY\s*[=:]\s*\K\S+' /home/hafizi145/.hermes/.env) && hermes config set model.api_key "$OR_KEY"`.
2. For a key only available in chat (e.g. Groq), the user MUST paste it and you must write the **full string** with no `...`. To prevent the truncation habit, verify after setting:
   ```bash
   python3 -c "import re;s=open('/home/hafizi145/.hermes/config.yaml').read();k=re.search(r'api_key:\s*(\S+)',s).group(1);print('LEN',len(k),'HAS_DOTS', '...' in k)"
   ```
   - A correctly-stored Groq key is **56 chars, HAS_DOTS False**. If LEN==13 and HAS_DOTS True → you truncated it again, redo.
3. **Never use `...` as a placeholder in any config-set command.** The display redaction (`gsk_FY...SIEY` in `hermes config` output) is automatic — you don't need to manually abbreviate, and doing so corrupts the stored value.

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

## Other providers (from research, not all tested from this server)
- **DeepSeek direct** (`https://api.deepseek.com/v1`, model `deepseek-v4-pro`): pay-per-token, ~same price as OpenRouter's DeepSeek. Reachability from this server UNVERIFIED — test before relying on it. Strong choice if OpenRouter ever fails.
- **OpenCode Go** ($10/mo): 14 models (DeepSeek V4 Pro, GLM-5.2, Qwen 3.7, MiniMax M3), dollar-based limits ($60/mo, $30/wk, $12/5h), servers US/EU/SG. OpenAI-compatible.
- **Mimo / Xiaomi MiMo** ($6/mo, 4.1B credits, model `mimo-v2.5`): OpenAI-compatible (`https://api.xiaomimimo.com/v1`), Token Plan uses `tp-xxxxx` key + possibly different base_url.
- **OpenCode Zen**: free tier, 100 req/day, OpenAI-compatible. Good backup.

## See also
- `software-development/llm-agent-provider-selection` — cost/quality ranking of providers for agentic work (broader than this server).
- `software-development/hafjet-spx-reminder` — SPX system runs on Azure; its session cookies need SAP headers (see that skill's SAP header pitfall).

## Reference files
- `references/elevenlabs-quota-errors.md` — Error transcripts, credit consumption patterns, and fallback flow from real ElevenLabs session
