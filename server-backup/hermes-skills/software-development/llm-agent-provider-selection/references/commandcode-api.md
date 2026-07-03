# Command Code Provider API Reference

Learned: 2026-07-03 session — user requested Command Code model integration.

## Endpoints

- OpenAI-compatible: `https://api.commandcode.ai/provider/v1/chat/completions`
- Anthropic-compatible: `https://api.commandcode.ai/provider/v1/messages`
- Models list: `https://api.commandcode.ai/provider/v1/models`

## Auth

Header: `Authorization: Bearer ***  
Source: Command Code Studio API key.

## ⚠️ Plan distinction — CRITICAL

- **Go Plan**: CLI/desktop access only. Does NOT include API access to `/provider/v1/chat/completions` or `/messages`.  
  Attempting to call these returns: `permission_error: "Your Go plan doesn't include API access. Upgrade to Provider or higher"`.
- **Provider Plan**: $15/month + $1.01 card fee. Includes API access, pay-as-you-go, no markup, credits never expire.
- **Models list endpoint** (`/provider/v1/models`) is publicly accessible even on Go plan.

## Model IDs confirmed from docs

| Model ID | Vendor |
|----------|--------|
| `claude-sonnet-5` | Anthropic |
| `claude-fable-5` | Anthropic |
| `claude-opus-4-8` | Anthropic |
| `claude-opus-4-7` | Anthropic |
| `gpt-5.5` | OpenAI |
| `google/gemini-3.5-flash` | Google |
| `deepseek/deepseek-v4-pro` | DeepSeek |
| `Qwen/Qwen3.7-Max` | Alibaba |
| `Qwen/Qwen3.7-Plus` | Alibaba |
| `nvidia/nemotron-3-ultra-550b-a55b` | Nvidia |
| `xiaomi/mimo-v2.5-pro` | Xiaomi |
| `MiniMaxAI/MiniMax-M3` | MiniMax |
| `moonshotai/Kimi-K2.7-Code` | Moonshot |

## Notes

- Docs mention usage chunks streamed at end for OpenAI clients.
- Pricing starts at $15/month + $1.01 card processing fee; pay-as-you-go, no markup.
- Bring-your-own-key supported.

## Extraction technique used

Rendered article text contained all endpoints and auth details. Used:
- `document.querySelector('article').innerText.match(/https?:\/\/[^\s]+/g)` for URLs
- `document.querySelector('article').innerText.match(/(Authorization|Bearer|API key|base_url|auth)[^\n]*/gi)` for auth
