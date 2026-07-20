# Known-good data/.config.yaml blocks (xiaozhi-esp32-server)

Copy `config.yaml` to `data/.config.yaml` and override the blocks below.
`data/.config.yaml` takes precedence over the shipped `config.yaml`.

## server (device connects here)
```yaml
server:
  ip: 0.0.0.0
  port: 8000            # WebSocket endpoint for devices
  http_port: 8003       # vision / simple http
  websocket: ws://<VM_PUBLIC_IP>:8000/xiaozhi/v1/   # <-- set to your public IP/domain
  vision_explain: http://<VM_PUBLIC_IP>:8003/mcp/vision/explain
  timezone_offset: +8
  auth:
    enabled: false
```

## LLM → Hermes (OpenAI-compatible localhost)
```yaml
LLM:
  HermesLLM:
    type: openai
    base_url: http://localhost:8642/v1
    model_name: hermes          # any name; Hermes ignores/echoes
    api_key: <API_SERVER_KEY>   # same value set in ~/.hermes/.env
    temperature: 0.7
    max_tokens: 800
```
Note: provider reads `base_url` (else falls back to `url`) and builds
`openai.OpenAI(api_key=..., base_url=...)`. Any OpenAI-compatible endpoint works.

## ASR → Groq Whisper (free cloud, avoids local torch/funasr)
```yaml
ASR:
  GroqASR:
    type: openai
    api_key: <GROQ_API_KEY>
    base_url: https://api.groq.com/openai/v1/audio/transcriptions
    model_name: whisper-large-v3-turbo
```

## TTS → Edge (free, Malay voice)
```yaml
TTS:
  EdgeMalay:
    type: edge
    voice: ms-MY-YasminNeural
```

## MCP (leave empty for self-host)
```yaml
# mcp_endpoint: <leave commented / empty — vendor xiaozhi.me token not used>
```
