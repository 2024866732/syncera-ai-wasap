---
name: xiaozhi-hermes-bridge
description: Link a xiaozhi-esp32-based AI companion device (e.g. ZUOWEI, generic ESP32 voice bots) to Hermes Agent as the LLM backend by self-hosting xiaozhi-esp32-server. Covers the firmware-vs-server repo confusion, the secure localhost topology (Hermes never public), low-RAM minimal install, config.yaml LLM/ASR/TTS wiring, and device OTA provisioning.
version: 1.0.0
author: Hermes-HAFJET
license: MIT
platforms: [linux]
---

# xiaozhi-esp32 ↔ Hermes Bridge

Many cheap "AI smart assistant" gadgets (ZUOWEI-70DD, generic ESP32 voice
companions) ship running the open-source **xiaozhi-esp32** firmware. Their
default backend is the vendor cloud (`xiaozhi.me`), but you can repoint them at
**Hermes Agent** so every conversation is powered by your own model/provider —
with Hermes never exposed to the public internet.

## When to use
- User bought an ESP32 AI companion / "AI smart assistant" device and wants it
  to use Hermes (or their own LLM) instead of the vendor cloud.
- Device shows a hotspot config portal (often `http://192.168.4.1`) or a
  "Hotspot Connection / Browser Access" screen.
- Seller referenced `github.com/78/xiaozhi-esp32` or any xiaozhi firmware.

## Critical repo distinction (gotcha)
- `github.com/78/xiaozhi-esp32` = **FIRMWARE** (runs ON the device). This is
  what the seller usually links. You generally do NOT build/flash it unless you
  want a custom device image.
- `github.com/xinnan-tech/xiaozhi-esp32-server` = the **SERVER** you self-host.
  This is what we actually deploy.
- Do NOT try to run the firmware repo as a server. Clone the `-server` repo.

## Architecture — keep Hermes private (secure pattern)
```
[Device ESP32] --WiFi--> [xiaozhi-esp32-server :8000 WS + :8002 OTA]
                                │  LLM = OpenAI client
                                ▼
                     [Hermes API server :8642 localhost]   ← NOT public
                                │
                         [your model / OpenRouter]
```
- Device only needs to reach the VM's port 8000 (WebSocket) and 8002 (OTA/http).
  It does NOT talk to Hermes directly.
- Hermes API server listens on `127.0.0.1:8642` only → no public exposure, no
  risk of the full tool set (terminal/browser/file) leaking.
- This is safer than exposing `hermes-api-server` publicly (which would expose
  terminal/file tools to the internet).

## Prerequisites / environment notes
- Python 3.11+ (HAFJET VM has 3.11.15). Use `uv venv` (no system pip; PEP 668).
- The server repo's `requirements.txt` is HEAVY (torch, funasr, modelscope,
  sherpa_onnx) for its default LOCAL offline ASR. On a 1GB-RAM box that will
  OOM/swap-thrash. **Install minimal** — see below.
- Choose cloud ASR (Groq Whisper, free) + Edge TTS (free, `ms-MY-YasminNeural`
  for Malay) instead of local models.

## Steps

### 1. Enable Hermes API server (localhost only)
Suggest these lines to the user; they edit `~/.hermes/.env` via `nano`
(agent MUST NOT write .env — see `hafjet-command-safety`):
```env
API_SERVER_ENABLED=true
API_SERVER_KEY=<generate a strong random key>
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
```
Then **restart the gateway** (explicit approval — it's the production gateway
running Telegram/WhatsApp bot). Verify: `curl -s http://127.0.0.1:8642/health`.

### 2. Clone & minimal-install xiaozhi-server
```bash
git clone --depth 1 https://github.com/xinnan-tech/xiaozhi-esp32-server.git /tmp/xz-server
mv /tmp/xz-server/main/xiaozhi-server ~/xiaozhi-server   # strip nested main/ dir
cd ~/xiaozhi-server
uv venv --python 3.11 && source .venv/bin/activate
# MINIMAL — do NOT pip install -r requirements.txt (torch/funasr kill 1GB RAM)
uv pip install websockets openai edge_tts aiohttp aiohttp_cors ruamel.yaml loguru httpx pydub silero_vad
```
The `models/` dir ships small stubs; with cloud ASR you don't need full model
downloads.

### 3. Configure `data/.config.yaml`
Copy `config.yaml` → `data/.config.yaml`, override only what you need. Key
blocks (exact schema in `references/config.yaml.example.md`):
- `server.websocket: ws://<VM_PUBLIC_IP>:8000/xiaozhi/v1/` (device connects here)
- `LLM.<Name>.type: openai`, `base_url: http://localhost:8642/v1`,
  `api_key: <API_SERVER_KEY>`, `model_name: hermes`
- `ASR.<Name>.type: openai`, `base_url: https://api.groq.com/openai/v1/audio/transcriptions`,
  `api_key: <GROQ_API_KEY>`, `model_name: whisper-large-v3-turbo`
- `TTS.<Name>.type: edge`, `voice: ms-MY-YasminNeural` (Malay; free)

The OpenAI LLM provider reads `base_url` (fallback `url`) and builds
`openai.OpenAI(api_key=..., base_url=...)` — so any OpenAI-compatible endpoint
works, including Hermes.

### 4. Run & verify
```bash
python app.py        # or: nohup python app.py > ~/xiaozhi-server.log 2>&1 &
```
Read the startup log. It auto-prints the OTA address (something like
`http://<ip>:8002/xiaozhi/ota/`) and should say `OTA接口运行正常`
(OTA interface OK). **Use the printed OTA address — do not guess the port.**

### 5. Provision the device (user does this on the phone)
1. Connect phone to the device's Wi-Fi hotspot (e.g. `ZUOWEI-70DD`).
2. Open the config portal: `http://192.168.4.1`.
3. Go to **Advanced options (高级选项)** → enter the server **OTA address** from
   step 4 → Save.
4. Restart the device. It will now register with your xiaozhi-server and route
   LLM calls to Hermes.

## Pitfalls / FAQ
- **"Do I need the MCP endpoint token (wss://api.xiaozhi.me/mcp/?token=...)?"**
  NO. That token is for the vendor's cloud. Self-hosting doesn't use it; leave
  `mcp_endpoint` empty in config.
- **Official DIY wiki is login-walled.** The Feishu wiki (`my.feishu.cn/wiki/...`)
  requires login. Use the in-repo `docs/firmware-setting.md` and
  `docs/Deployment.md` instead — they are accurate and open.
- **Don't install full requirements.txt on a small VM.** Local ASR
  (funasr/torch) will exhaust 1GB RAM. Use cloud ASR.
- **OTA port guess wrong?** Always copy the address printed in the server log,
  not a remembered port.
- **`hermes-api-server` exposed publicly = dangerous.** It mounts the full
  `hermes-api-server` tool set (terminal, browser, file write). Keep it on
  `127.0.0.1` and let xiaozhi-server be the only public face.
- **Device firmware must be ≥ v1.6.1** to support custom OTA server config
  (newer ZUOWEI units are fine).

## References
- `references/config.yaml.example.md` — known-good `data/.config.yaml` LLM/ASR/TTS/server blocks.
- `references/device-setup.md` — device-side provisioning flow (from in-repo docs).
