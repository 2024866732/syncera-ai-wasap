---
name: ai-model-proxy
description: "Run a LiteLLM proxy server to route any AI client (Claude Code, OpenWebUI, curl) through any provider (OpenCode Go, OpenRouter, local models, custom endpoints). Covers model name mapping for API format compatibility, systemd service setup, and provider-specific configs."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# AI Model Proxy (LiteLLM)

## Overview

Run **LiteLLM** as a local proxy server that translates between any AI client's API format and any upstream provider's API. This lets you:

- Use **Claude Code** with **OpenCode Go / OpenRouter / local models**
- Route **any OpenAI-compatible client** through a single gateway
- Switch providers without changing client configuration
- Pool multiple API keys behind one endpoint

## Architecture

```
Claude Code / OpenWebUI / curl
        │
        ▼  (Anthropic or OpenAI format)
┌─────────────────┐
│  LiteLLM Proxy  │  localhost:4000
│  (API translator)│
└────────┬────────┘
         │ (upstream format)
         ▼
OpenCode Go / OpenRouter / Anthropic / OpenAI / custom
```

## Setup

### 1. Install

```bash
uv venv ~/litellm-env --python 3.13
source ~/litellm-env/bin/activate
uv pip install 'litellm[proxy]'
```

### 2. Create config

```yaml
# ~/litellm-config.yaml
model_list:
  # Each entry maps a client-facing model name to an upstream provider
  - model_name: claude-sonnet-4-20250514    # what the client requests
    litellm_params:
      model: openai/glm-5                   # actual upstream model
      api_base: https://opencode.ai/zen/go/v1
      api_key: "sk-..."                     # your provider API key

  - model_name: claude-haiku-4-20250514
    litellm_params:
      model: openai/kimi-k2.5
      api_base: https://opencode.ai/zen/go/v1
      api_key: "sk-..."

litellm_settings:
  master_key: "sk-litellm-master"           # optional auth for proxy
  drop_params: true                         # drop unsupported params
  set_verbose: false
```

### 3. Start

```bash
litellm --config ~/litellm-config.yaml --port 4000
```

### 4. Systemd service

```bash
mkdir -p ~/.config/systemd/user

# Create ~/.config/systemd/user/litellm-proxy.service:
cat > ~/.config/systemd/user/litellm-proxy.service << 'SERVICEEOF'
[Unit]
Description=LiteLLM Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/uv run --directory %h/litellm-env litellm --config %h/litellm-config.yaml --port 4000
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
SERVICEEOF

systemctl --user daemon-reload
systemctl --user enable --now litellm-proxy
systemctl --user status litellm-proxy --no-pager
```

## Client configuration

### Claude Code

```bash
# Point Claude Code at the LiteLLM proxy
export ANTHROPIC_BASE_URL=http://localhost:4000
export ANTHROPIC_API_KEY=sk-litellm-master
claude
```

Claude Code sends requests in Anthropic's Messages API format. LiteLLM automatically translates to OpenAI format for the upstream provider. The `model_name` in the config must match what Claude Code requests (e.g. `claude-sonnet-4-20250514`).

### Any OpenAI-compatible client

```python
from openai import OpenAI
client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="sk-litellm-master"
)
response = client.chat.completions.create(
    model="glm-5",    # or any model_name from config
    messages=[{"role": "user", "content": "Hello"}]
)
```

### curl

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-master" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"Hello"}]}'
```

## Provider-specific configs

### OpenCode Go

```yaml
api_base: https://opencode.ai/zen/go/v1
# Models: glm-5, glm-5.1, kimi-k2.5, qwen3.5-plus, qwen3.6-plus
```

### OpenRouter

```yaml
api_base: https://openrouter.ai/api/v1
# Add: https://openrouter.ai/api/v1/chat/completions
```

## Model name mapping

Claude Code requests specific model IDs. Map them in the config:

| Claude Code model name | Suggested upstream | Provider |
|------------------------|-------------------|----------|
| `claude-sonnet-4-20250514` | `glm-5` | OpenCode Go |
| `claude-opus-4-20250514` | `glm-5.1` | OpenCode Go |
| `claude-haiku-4-20250514` | `kimi-k2.5` | OpenCode Go |
| `claude-sonnet-4-20251001` | `qwen3.5-plus` | OpenCode Go |
| `claude-sonnet-4-20260201` | `qwen3.6-plus` | OpenCode Go |

Each model entry must have its **own** `api_key` in the config unless using a shared env variable approach.

## Verify proxy is working

```bash
curl -s http://localhost:4000/models | python3 -m json.tool
# Should list all configured models

curl -s http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-master" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"Halo"}],"max_tokens":30}' | python3 -m json.tool
```

## Pitfalls

- **API key redaction in tool output:** Hermes redacts secrets from SSH output. The agent cannot read back the real key. Always have the user paste their key directly into the config via `nano`. The agent provides the config skeleton with `YOUR_KEY_HERE` placeholders.
- **Each model entry needs its own `api_key`:** LiteLLM does not inherit `api_key` from a parent scope. Every `litellm_params` block must include the key explicitly.
- **Model name must match what the client sends:** Claude Code sends `claude-sonnet-4-20250514` not just `claude-sonnet-4`. Check Claude Code's actual request with `--verbose` if in doubt.
- **Non-Claude models may not support all features:** Tool use, extended thinking, and structured output may not work with OpenCode Go models. Test basic chat first.
- **LiteLLM cost tracking shows warnings:** Models not in the built-in cost map produce warnings like `cache cost fields will default to 0`. This is cosmetic and does not affect functionality.
- **Security:** The proxy binds `0.0.0.0:4000` by default. If exposed on a Tailscale network, restrict with `--host 127.0.0.1` or add `master_key` authentication.

## Related skills

- `self-hosted-deployment` — systemd and Tailscale patterns for production exposure
- `hafjet-worker-project-setup` — PC Office project scaffolding and Python env bootstrap
