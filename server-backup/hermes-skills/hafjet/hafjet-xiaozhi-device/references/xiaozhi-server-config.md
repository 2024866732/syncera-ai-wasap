# xiaozhi-esp32-server — config reference (excerpts)

Source: `xinnan-tech/xiaozhi-esp32-server`, `main/xiaozhi-server/config.yaml` + `core/providers/llm/openai/openai.py`.

## Config load order
- Default: `config.yaml` (repo root of the server).
- Override: `data/.config.yaml` (project dir). Loader merges this OVER config.yaml.
- To start: copy `config_from_api.yaml` → `data/.config.yaml`, then edit the copy.
- If you use the vendor "智控台" (web console), config.yaml settings are ignored.

## server: block (relevant keys)
```yaml
server:
  ip: 0.0.0.0
  port: 8000
  http_port: 8003
  websocket: ws://your-ip-or-domain:port/xiaozhi/v1/      # device connects here
  vision_explain: http://your-ip-or-domain:port/mcp/vision/explain
  timezone_offset: +8
  auth:
    enabled: false
    allowed_devices:
      - "11:22:33:44:55:66"
```
For public deployment, set `websocket` and `vision_explain` to the PUBLIC ip/domain (the comment in the file warns the auto-generated address is wrong under docker/public).

## LLM: block — openai provider shape
```yaml
LLM:
  HermesLLM:
    type: openai
    base_url: http://localhost:8642/v1     # Hermes API server (localhost)
    model_name: hermes
    api_key: <SAME_AS_API_SERVER_KEY>
    temperature: 0.7
    max_tokens: 500
    top_p: 1
    frequency_penalty: 0
```
Other provider types available: `dify`, `ollama`, `AliBL`, `coze`, `homeassistant`, `fastgpt`, `gemini`, `xinference`. The `openai` type is what we use because Hermes is OpenAI-compatible.

## Provider source behavior (`core/providers/llm/openai/openai.py`)
- Lines 25-28: `base_url = config.get("base_url")` else `config.get("url")`.
- Line 71: `self.client = openai.OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=custom_timeout)`.
- `THINKING_DISABLED_DOMAINS` (lines 13-18) auto-disables thinking for aliyuncs/bigmodel/moonshot/volces domains — irrelevant for localhost Hermes, but confirms base_url domain drives behavior.
- Default timeout 300s if unset.

## mcp_endpoint (optional, usually SKIP)
```yaml
mcp_endpoint: your-websocket-endpoint-address     # ws://ip:port/mcp/?token=...
```
This is for connecting the SERVER to an external MCP server (tools). The vendor `wss://api.xiaozhi.me/mcp/?token=...` URL is their cloud — do NOT use it for self-hosting. Leave unset unless adding your own tools.

## ASR / TTS provider types seen in config.yaml
- ASR: `type: openai` (OpenAI transcribe), `type: groq` (whisper-large-v3-turbo), `type: AliBL`/qwen3-asr-flash.
- TTS: separate `TTS:` block; providers include Edge/cosyvoice/ali/openai. For Malay, prefer Edge `ms-MY-YasminNeural` (the HAFJET standard) — see `hafjet-malaysian-tts` skill.

## Hermes API server enablement (`.env`, NOT config.yaml)
```
API_SERVER_ENABLED=true
API_SERVER_KEY=<strong random>
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
```
Env vars read in `gateway/config.py` (~line 1739). After editing, `hermes gateway restart`.
Endpoint served: `POST /v1/chat/completions` (OpenAI-compatible), `GET /v1/models`, `GET /health`. Toolset `hermes-api-server` exposes terminal/file/browser — keep it localhost-only.
