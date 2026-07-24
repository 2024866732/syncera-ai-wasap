---
name: hafjet-litellm-opencode
description: "LiteLLM proxy untuk OpenCode Go kat PC Office. Guna model GLM-5, Kimi K2.5, Qwen3.5+ dari Claude Code dll. $10/month. Tailscale: 100.121.94.41:4000."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET LiteLLM + OpenCode Go Proxy

## Overview

LiteLLM proxy kat PC Office (`100.121.94.41`:4000) yang bagi Claude Code (atau mana-mana OpenAI-compatible client) akses ke model **OpenCode Go** — $10/month je.

### Models Available

| Claude Code Name | Actual Model | OpenCode Go Model |
|---|---|---|
| `claude-sonnet-4-20250514` | GLM-5 | ✅ |
| `claude-opus-4-20250514` | GLM-5.1 | ✅ |
| `claude-haiku-4-20250514` | Kimi K2.5 | ✅ |
| `claude-sonnet-4-20251001` | Qwen3.5+ | ✅ |
| `claude-sonnet-4-20260201` | Qwen3.6+ | ✅ |

### Lokasi

- **PC Office:** `100.121.94.41` (Tailscale)
- **Proxy URL:** `http://100.121.94.41:4000`
- **Master Key:** `sk-litellm-master`
- **Systemd Service:** `litellm-proxy` (user service)
- **Config:** `~/litellm-config.yaml`

---

## Guna dari Claude Code (Windows PC)

```bash
set ANTHROPIC_BASE_URL=http://100.121.94.41:4000
set ANTHROPIC_API_KEY=sk-litellm-master
claude
```

Atau guna PowerShell:
```powershell
$env:ANTHROPIC_BASE_URL="http://100.121.94.41:4000"
$env:ANTHROPIC_API_KEY="sk-litellm-master"
claude
```

---

## Guna dari Hermes (SSH)

```bash
curl -s http://100.121.94.41:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-litellm-master" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"Halo"}],"max_tokens":100}'
```

---

## Management (via SSH)

```bash
# Status
ssh hafizi145@100.121.94.41 "systemctl --user status litellm-proxy --no-pager"

# Restart
ssh hafizi145@100.121.94.41 "systemctl --user restart litellm-proxy"

# Logs
ssh hafizi145@100.121.94.41 "journalctl --user -u litellm-proxy -n 50 --no-pager"

# Stop
ssh hafizi145@100.121.94.41 "systemctl --user stop litellm-proxy"
```

---

## Cara Update API Key

Kalau OpenCode Go key expired atau tukar:

```bash
ssh hafizi145@100.121.94.41
nano ~/litellm-config.yaml
# Tukar "sk-MS8..." dekat setiap entry
systemctl --user restart litellm-proxy
```

---

## Architecture

```
Windows PC (Claude Code)
     ↕ ANTHROPIC_BASE_URL=http://100.121.94.41:4000
PC Office (LiteLLM Proxy)
     ↕ https://opencode.ai/zen/go/v1
OpenCode Go API (GLM-5, Qwen3.5+...)
```

---

## Troubleshooting

**"Connection refused"** — PC Office mungkin offline. Check Tailscale:  
```bash
tailscale ping 100.121.94.41
```

**"401 Unauthorized"** — Master key salah. Check `~/litellm-config.yaml` → `master_key`.

**Model lambat respon** — OpenCode Go models mungkin high latency. Cuba model lain (`kimi-k2.5` biasanya cepat).

**"Model not found"** — Claude Code version mungkin guna nama model berbeza. Check:
```bash
# List available models
curl -s http://100.121.94.41:4000/models -H "Authorization: Bearer sk-litellm-master"
```
Kemudian update config dengan nama betul.

---

## Install Semula

```bash
# Install
uv venv ~/litellm-env --python 3.13
source ~/litellm-env/bin/activate
uv pip install 'litellm[proxy]'

# Config (Tuan kena edit key sendiri)
cp /tmp/litellm-config-updated.yaml ~/litellm-config.yaml
nano ~/litellm-config.yaml

# Service
mkdir -p ~/.config/systemd/user
cp /tmp/litellm-proxy.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable litellm-proxy
systemctl --user start litellm-proxy
```
