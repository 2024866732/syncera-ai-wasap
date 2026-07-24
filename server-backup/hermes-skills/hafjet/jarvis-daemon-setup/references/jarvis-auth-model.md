# JARVIS Auth Model — Source-Code Map (v0.8.2)

Reconstructed from `/home/hafizi145/.bun/install/global/node_modules/@usejarvis/brain/src/`.

## Files
- `comms/websocket.ts` — HTTP route gate, `/sidecar/connect`, `/sidecar/token`, static/dashboard serving.
- `sidecar/manager.ts` — `issueAccessToken`, `verifyAccessToken`, key pair load (`ES256`).
- `config/types.ts` — `AuthConfig.insecure_open_access` (SYSTEM-owned, config.yaml only).
- `daemon/index.ts` — startup applies `insecure_open_access` (line ~3670) + sidecarManager init (line ~562).

## Handler order in websocket.ts (critical)
1. `POST /sidecar/connect` (line 237) — WebSocket upgrade, gated by enrollment JWT in `Authorization: Bearer`.
2. `POST /sidecar/token` (line 262) — **runs BEFORE the auth gate at line 284.** Authenticated by enrollment JWT in `Authorization: Bearer` header. Returns short-lived `access_token`.
3. Auth gate (line 284) — `if (!insecureOpenAccess && !isPublicRoute)` → rejects with 401 HTML unless a valid access token is present (cookie `token` or `?token=` query).
4. Static dashboard HTML (line 465) — when JWT-only, injects `injectTokenStrip` script that moves `?token=` from hash to query so the server can Set-Cookie + 302.

## Key facts
- `isPublicRoute` = `/health`, `/sidecar/connect`, `/api/sidecars/.well-known/jwks.json`, `/api/webhooks/*`, `OPTIONS` only.
- Enrollment JWT accepted ONLY at `/sidecar/connect` and `/sidecar/token`. NEVER on data-plane routes.
- Access token is stateless (no DB lookup); short TTL is the revocation mechanism.
- `issueAccessToken` requires `privateKey` + `isEnrolled(sid)`. `verifyAccessToken` requires `publicKey` + valid audience+expiry.
- `.secrets.enc` / `.secrets.key` under `~/.jarvis/` hold the encrypted keychain (LLM keys etc.).

## Gotchas
- Minting with JWT in JSON body → **403** (handler expects `Authorization: Bearer` header).
- JWT minted before a daemon restart can 401 against the new process (stale signing context). Always re-enroll against the live daemon in the same session as the mint.
- Dashboard HTML 401 page includes a bootstrap script that moves `#/path?token=xxx` (hash) into the query string — so links must use `?token=` (query), not hash.
