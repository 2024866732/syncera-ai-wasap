# Provider Quirks Reference

## CommandCode

- **Provider location**: `https://api.commandcode.ai/provider/v1/`
- **Auth**: `Authorization: Bearer *** for OpenAI route, `x-api-key: <token>` for Anthropic route.
- **Available routes**: `/models`, `/chat/completions`, `/messages`.
- **Models found**: `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-fable-5`, `claude-opus-4-8`, `gpt-5.5`, `deepseek/deepseek-v4-pro`, `Qwen/Qwen3.7-Max`, `nvidia/nemotron-3-ultra-550b-a55b`, `google/gemini-3.5-flash`, `xiaomi/mimo-v2.5`, `moonshotai/Kimi-K2.7-Code`, and more.
- **Plan gating**: Go plan allows `/models` discovery but blocks `/chat/completions` and `/messages` inference with `permission_error`.
- **Config shape**:
  ```yaml
  model:
    provider: commandcode
    base_url: https://api.commandcode.ai/provider/v1
    default: claude-sonnet-5
    api_mode: messages   # or chat_completions depending on model
    api_key: user_***
  ```
- **Model-to-endpoint routing**: `claude-sonnet-5` requires `/messages`. Requesting it via `/chat/completions` returns `unsupported_model`. Some OpenRouter models such as `gpt-5.5` use `/chat/completions` instead.
- **Hermes CLI fallback**: When using a provider without accessible inference, Hermes can auto-switch to configured `fallback_providers` instead of failing hard.
- **User action required**: upgrade to Provider/Max at `https://commandcode.ai/billing` for chat access.

## Fallback behavior

- Hermes falls back automatically when primary provider returns auth/permission errors.
- Default fallback list for this workspace currently includes `cerebras`.
