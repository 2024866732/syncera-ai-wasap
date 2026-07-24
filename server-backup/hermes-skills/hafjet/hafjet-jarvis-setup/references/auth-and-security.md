# JARVIS Auth & Security — v0.8.2

## Auth model (from src/comms/websocket.ts + src/config/types.ts)
- **JWT-only by default.** There is NO shared dashboard password/token. Every API route + dashboard HTML requires a valid short-lived sidecar **access token**.
- The long-lived enrollment **JWT** is accepted ONLY on `/sidecar/connect` and the token-mint endpoint — never on normal routes. A leaked panel credential is bounded to the access-token TTL.
- `auth.insecure_open_access` (SYSTEM-owned, config.yaml) is the ONLY escape hatch: when `true`, the daemon logs a loud warning and accepts requests WITHOUT auth. Meant ONLY for first-run self-host setup before any device is enrolled.

## Route gating (websocket.ts)
```
if (!self.insecureOpenAccess && !isPublicRoute(pathname, req.method)) {
  const cookieToken = getCookie(req, 'token');
  if (!verifyAccessToken(cookieToken)) {
    const queryToken = url.searchParams.get('token');   // ?token= supported
    if (verifyAccessToken(queryToken)) { set cookie + 303 redirect (strip token from URL) }
    else → 401 HTML with hash-to-query bootstrap script (injectTokenStrip)
  }
}
```
- Public routes (no auth): `/health`, `/sidecar/connect`, `/api/sidecars/.well-known/jwks.json`, `/api/webhooks/*`, `OPTIONS`.
- `.html` responses in JWT mode are wrapped with `TOKEN_STRIP_SCRIPT` that removes `?token=` from the hash after load.

## Enrollment
```
jarvis enroll "<device-name>" [--json] [--rotate]
# returns: { token: <JWT>, sid: <uuid>, name, created }
jarvis sidecars            # list enrolled (sid, status, last seen)
jarvis revoke <sid>        # revoke
```
⚠️ Without `daemon.brain_domain` set, minted tokens point at `localhost:3142` and only work for sidecars ON THAT MACHINE. Set `brain_domain` for cross-machine sidecars.

## ✅ Minting an access token with curl (VERIFIED working)
`POST /sidecar/token` DOES work from curl/scripts. The earlier "403, don't rely on curl" note
was WRONG — the 403 only occurred when the enrollment JWT was sent in the JSON **body**.
Send it as an `Authorization: Bearer` **header** instead:

```bash
JWT=$(jarvis enroll "hafjet-office-pc" --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:3142/sidecar/token -H "Authorization: Bearer $JWT"
# → {"access_token":"<ACCESS>","expires_in":<sec>}   (HTTP 200)
```
Then open `http://<host>:3142/?token=<ACCESS>` in a browser. NOTE: a python `urllib` client
WITHOUT a cookiejar sees a FALSE 401 — the `?token=` endpoint 302-redirects + sets a cookie,
and only `http.cookiejar.CookieJar` + `HTTPCookieProcessor` follows it to a 200. A real
browser handles this natively. See `scripts/jarvis-token.sh` for the proven full helper.

### Verify access BEFORE dropping the flag
- (a) enroll the real **sidecar app** (desktop), OR
- (b) run `bash ~/jarvis-token.sh` → copy the `?token=` URL → browser returns dashboard (200), OR
- (c) curl-mint as above and confirm `access_token` is returned (HTTP 200).

## Hardening checklist (do in order)
1. Write `auth.insecure_open_access: true` + restart → user does first-run setup in browser.
2. `jarvis enroll` the device, copy JWT.
3. Confirm a working access path (sidecar connected, or `?token=` browser load returns the dashboard).
4. Edit `~/.jarvis/config.yaml`: remove `insecure_open_access`, set `daemon.brain_domain`, restart.
5. Prefer Tailscale-only exposure of port 3142; never public.

## Config shape (config.yaml)
```yaml
auth:
  insecure_open_access: false   # remove this line entirely after setup
daemon:
  brain_domain: "100.121.94.41" # reachable origin for sidecar tokens
```
`brain_domain` is optional but required for cross-machine sidecars.

## Remote file push pitfalls (HAFJET SSH workflow)
- **`write_file` writes to the HERMES SERVER's local disk, NOT the SSH target.** Never use it
  to edit files on the office PC. To push a file there, use `cat localfile | ssh host 'cat > ~/remotefile'`
  (reliable). `scp` failed silently in one session; the `cat | ssh` pipe is the proven pattern.
- Heredocs through `ssh '...'` break on quoting (`%{http_code}`, `$()`, nested quotes). Prefer the
  `cat | ssh` pipe or a pre-written script file on the target.
- `execute_code` is BLOCKED for SSH/subprocess work — use the `terminal` tool.
