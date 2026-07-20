---
name: hafjet-xiaozhi-device
description: "Integrate a xiaozhi-ESP32-based physical AI voice assistant (e.g. ZUOWEI-70DD, or any ESP32 clone running 78/xiaozhi-esp32 firmware) with the HAFJET/Hermes infra. Covers self-hosting xiaozhi-esp32-server and wiring its LLM provider to Hermes's LOCAL OpenAI-compatible API server. Use whenever Tuan Hafizi buys/flashes a voice companion gadget, asks to 'link device to Hermes', wants a self-hosted XiaoZhi server, or mentions 192.168.4.1 hotspot config portals / ZUOWEI / xiaozhi.me."
version: 1.0.0
author: Hermes-HAFJET
license: MIT
platforms: [linux]
---

# HAFJET xiaozhi-ESP32 Device Integration

Link a physical xiaozhi-ESP32 AI assistant (the ZUOWEI-70DD Tuan Hafizi bought is one such clone) to Hermes so the device's LLM brain runs on our own models/agents instead of the vendor's cloud.

## What the device actually is

- `78/xiaozhi-esp32` (the GitHub link sellers hand out) is the **DEVICE firmware** — ESP-IDF / C++, runs ON the ESP32 chip. Not something we run on the server.
- The device is a voice client: it streams Opus audio over **WebSocket** to a server, the server does ASR → LLM → TTS, and streams audio back.
- Devices ship pointing at the vendor cloud `wss://api.xiaozhi.me`. We replace that with **our own server**.
- The device exposes a **config hotspot** (`ZUOWEI-70DD` WiFi → `http://192.168.4.1`) where you set the server endpoint. That is the user-facing setup step Tuan Hafizi does from his phone — the agent cannot do it.

## Architecture (secure, everything on the VM except the device)

```
[ZUOWEI ESP32]
   │  WiFi → WebSocket  ws://<VM_PUBLIC_IP>:8000/xiaozhi/v1/
   ▼
[xiaozhi-esp32-server]      (Python, port 8000, on the HAFJET VM)
   │  LLM call → openai.OpenAI(base_url=http://localhost:8642/v1)
   ▼
[Hermes API Server]         (hermes-api-server, port 8642, LOCALHOST ONLY)
   │
[OpenRouter / configured model]
```

KEY SECURITY POINT: Hermes API server stays on `127.0.0.1`. Only the xiaozhi-server port 8000 needs to be reachable by the device. The device never talks to Hermes directly, so the dangerous terminal/browser tools exposed by `hermes-api-server` are NOT reachable from the internet. Do NOT set `API_SERVER_HOST=0.0.0.0` unless a TLS reverse proxy + auth sits in front.

## Repos

- Server (self-host on VM): `https://github.com/xinnan-tech/xiaozhi-esp32-server` (Python; ~330MB clone, ships a `models/` dir with silero VAD).
- Device firmware (reference only): `https://github.com/78/xiaozhi-esp32`.

## Step 1 — Enable Hermes API server (localhost only)

Enabled via **`.env` env vars, NOT `config.yaml`**. Add to `~/.hermes/.env`:

```env
API_SERVER_ENABLED=true
API_SERVER_KEY=<generate a strong random key>
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
```

Then restart the gateway: `hermes gateway restart` (or kill the `gateway run` process and relaunch). Verify with `ss -ltn | grep 8642` and a local `curl -H "Authorization: Bearer <KEY>" http://127.0.0.1:8642/v1/models`.

Notes:
- Default `API_SERVER_HOST` is `127.0.0.1` already — but set it explicitly so it can never drift to public.
- `API_SERVER_MODEL_NAME` is optional (the model name the endpoint reports).
- The adapter code lives at `gateway/platforms/api_server.py`; it serves `POST /v1/chat/completions` (OpenAI-compatible) — exactly what xiaozhi's `openai` LLM provider expects.

## Step 2 — Deploy xiaozhi-esp32-server

No docker on the HAFJET VM → use a venv (Python 3.11.15 is present).

```bash
git clone --depth 1 https://github.com/xinnan-tech/xiaozhi-esp32-server.git ~/xiaozhi-server
cd ~/xiaozhi-server/main/xiaozhi-server
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt   # pins: openai==2.8.1, websockets==14.2, aiohttp==3.13.2
```

## Step 3 — Configure LLM → Hermes

xiaozhi reads `config.yaml` by default, but **your overrides go in `data/.config.yaml`** (copy `config_from_api.yaml` → `data/.config.yaml` first). The server merges `data/.config.yaml` over `config.yaml`.

Set the LLM block to the `openai` provider pointed at Hermes localhost:

```yaml
LLM:
  HermesLLM:
    type: openai
    base_url: http://localhost:8642/v1
    model_name: hermes
    api_key: <SAME_VALUE_AS_API_SERVER_KEY>
    temperature: 0.7
    max_tokens: 500
```

And the server's public WebSocket endpoint (what the device will connect to):

```yaml
server:
  ip: 0.0.0.0
  port: 8000
  websocket: ws://<VM_PUBLIC_IP>:8000/xiaozhi/v1/
  vision_explain: http://<VM_PUBLIC_IP>:8003/mcp/vision/explain
```

Why this works: `core/providers/llm/openai/openai.py` reads `config["base_url"]` (falls back to `url`), then builds `openai.OpenAI(api_key=self.api_key, base_url=self.base_url)` — so any OpenAI-compatible endpoint (Hermes) is accepted. The `model_name` is arbitrary (Hermes ignores/forwards it).

## Step 4 — Point the device at our server (USER step)

Tuan Hafizi does this from his phone:
1. Connect phone to the device's WiFi hotspot (`ZUOWEI-70DD`).
2. Open `http://192.168.4.1` in browser (the device config portal).
3. Set the server / WebSocket endpoint to `ws://<VM_PUBLIC_IP>:8000/xiaozhi/v1/`.
4. Save & reboot the device. It should now register against our xiaozhi-server (watch the server log).

## ASR / TTS decision (still open — pick before go-live)

- **A. Cloud keys** — Groq Whisper (`whisper-large-v3-turbo`) for ASR + OpenAI TTS. Easiest, needs API keys.
- **B. Local/free** — Edge TTS + silero VAD (ships in repo). Free, but Malay TTS is robotic.
- **C. Hermes TTS** — reuse the `hafjet-malaysian-tts` / Edge Yasmin (`ms-MY-YasminNeural`) pipeline for natural Malay voice. Needs wiring xiaozhi TTS provider → Hermes; more work.

## Pitfalls (learned the hard way this session)

- **MCP endpoint confusion.** The seller/device may show a `wss://api.xiaozhi.me/mcp/?token=...` URL. That is the VENDOR's cloud MCP — NOT needed for self-hosting. Leave `mcp_endpoint` empty in `data/.config.yaml`. Only set it later if you want to give the device external tools (smart home, calendar) via your OWN MCP server.
- **config.yaml vs data/.config.yaml.** Editing `config.yaml` directly is wrong — the loader prefers `data/.config.yaml`. Always override there.
- **Two repos, don't mix.** `78/xiaozhi-esp32` = device firmware (C++/ESP-IDF). `xinnan-tech/xiaozhi-esp32-server` = the Python server we run. Clone the second one.
- **Don't expose Hermes publicly.** Keep `API_SERVER_HOST=127.0.0.1`. Only xiaozhi-server port 8000 faces the device.
- **Resource.** HAFJET VM is 1GB RAM + 4GB swap. xiaozhi-server + Hermes gateway + (OpenRouter, not local model) should fit, but monitor `free -m` after launch.
- **API key must match.** The `api_key` in the xiaozhi `LLM` block MUST equal `API_SERVER_KEY` in Hermes `.env`, or the LLM call is rejected.

## Verification

1. `ss -ltn | grep -E ':8000|:8642'` — both listening.
2. Local Hermes check: `curl -H "Authorization: Bearer <KEY>" http://127.0.0.1:8642/v1/models`.
3. Start xiaozhi-server, watch log for the generated `ws://...` line.
4. From phone, set device endpoint → device should appear in server log / `GET /api/sessions`.

See `references/xiaozhi-server-config.md` for the exact config.yaml schema excerpts and provider source references.
