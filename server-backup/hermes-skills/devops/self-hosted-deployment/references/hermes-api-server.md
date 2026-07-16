# Exposing Hermes as an OpenAI-Compatible API Server (`hermes-api-server`)

## What it is
Hermes ships a built-in gateway platform, `api_server` (toolset `hermes-api-server`),
that exposes an **OpenAI-compatible HTTP API**. Any OpenAI-compatible client —
white-label portable AI gadgets (e.g. ZUOWEI-style devices), Open WebUI, LobeChat,
LibreChat, ChatBox, or a custom app — can point at it and chat through the full
Hermes agent (tools included).

## When to use
- User wants to connect an external device/app to Hermes as the LLM backend
- User wants an OpenAI-compatible endpoint for a third-party frontend
- User bought a white-label AI gadget and wants to route it to Hermes

## Enable (via `.env`, NOT config.yaml)
The API server reads its config from environment variables only. Add to
`~/.hermes/.env`:

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<strong random key: openssl rand -base64 32>
API_SERVER_HOST=127.0.0.1      # default (loopback). Set 0.0.0.0 ONLY behind a secure proxy
API_SERVER_PORT=8642           # default
# API_SERVER_CORS_ORIGINS=https://app.example.com   # comma-separated, if CORS needed
# API_SERVER_MODEL_NAME=gpt-4o                      # optional model name the endpoint advertises
```

Then **restart the gateway** (`/restart` in chat, or the gateway service) — env
changes are not picked up live.

> ⚠️ `API_SERVER_HOST` defaults to `127.0.0.1` (loopback only). The server is NOT
> reachable from outside unless you either set `0.0.0.0` OR put a reverse
> proxy/tunnel in front.

## Endpoints (all under the listen host:port)
- `POST /v1/chat/completions` — OpenAI Chat Completions format (stateless; opt-in
  session continuity via `X-Hermes-Session-Id` header)
- `POST /v1/responses` — OpenAI Responses API format (stateful via `previous_response_id`)
- `GET  /v1/models` — lists models / model aliases
- `GET  /v1/capabilities` — machine-readable capabilities
- `GET  /health` and `GET /health/detailed` — health checks
- `/api/sessions/*` — session management

Auth: client sends `Authorization: Bearer <API_SERVER_KEY>`.

## 🚨 Security pitfalls (READ BEFORE EXPOSING)
1. **Full toolset exposure.** The `hermes-api-server` toolset includes `terminal`,
   `file`, `browser`, `execute_code`, `delegate_task`, and more. Anyone with the
   API key effectively gets **code-execution + file + shell access** to the host.
   Treat the key like a root password.
2. **No TLS by default.** The server speaks plain HTTP. Sending the key over
   `http://public-ip:8642` exposes it in cleartext. Always front it with HTTPS
   (Cloudflare Tunnel or nginx + Let's Encrypt).
3. **Default host is loopback.** Forgetting to set `0.0.0.0` (or a proxy) =
   "nothing connects" confusion. But do NOT set `0.0.0.0` directly to the
   internet without a proxy + key.
4. **Confirm the client supports a custom base URL first.** Many white-label
   gadgets hardcode 3 providers and cannot be repointed — the whole exercise is
   pointless if the firmware locks the endpoint.

## Exposure options (best → worst)
| Option | Notes |
|---|---|
| **Cloudflare Tunnel** | Free HTTPS + domain, no open firewall port. Recommended. `cloudflared tunnel --url http://127.0.0.1:8642` |
| **nginx + Let's Encrypt** | `API_SERVER_HOST=127.0.0.1`, nginx reverse-proxies `https://api.example.com` → localhost:8642 with TLS. Needs DNS + certbot. |
| **Raw public IP:port** | `API_SERVER_HOST=0.0.0.0`, access `http://<public-ip>:8642/v1`. No TLS — key cleartext. Test only. |
| **Internal only** | Keep `127.0.0.1`, reach via Tailscale/SSH tunnel. Most secure. |

## Verification
```bash
# After gateway restart:
curl -s http://127.0.0.1:8642/health
curl -s http://127.0.0.1:8642/v1/models -H "Authorization: Bearer <API_SERVER_KEY>"
# Chat test:
curl -s http://127.0.0.1:8642/v1/chat/completions \
  -H "Authorization: Bearer <API_SERVER_KEY>" -H "Content-Type: application/json" \
  -d '{"model":"hermes","messages":[{"role":"user","content":"hi"}]}'
```

## Server-state note (HAFJET Azure box, 2026-07-15)
- Port 8642: FREE. Public IP `52.237.113.23`. `hafjet.my` DNS → Vercel
  (`76.76.21.21`), NOT this VM.
- No nginx / certbot / port 443 / TLS present. **Cloudflare Tunnel is the
  cleanest path** for this host — no cert management, no open port.
