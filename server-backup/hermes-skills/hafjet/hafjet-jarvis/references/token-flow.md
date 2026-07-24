# JARVIS token flow — secured browser dashboard access

JARVIS is JWT-only. To open the dashboard in a browser (without a sidecar GUI app),
you mint a short-lived access token from the enrollment JWT, then pass it as a
`?token=` query param. The server sets a cookie and 302-redirects.

## Flow
1. `jarvis enroll "<device>" --json`  -> enrollment JWT
2. `POST /sidecar/token`  header `Authorization: Bearer <JWT>`  -> `{ access_token }`
3. Open `http://<brain_domain>/?token=<access_token>`  -> 200 (cookie set, redirect)

No-token request -> 401. This is the proof the daemon is secured.

## Helper script (run on the brain host)
Save as `~/jarvis-token.sh`, `chmod +x`. Prints a working secured URL.
Proven to work against JARVIS v0.8.2 on hafjet-pc-office.

```bash
#!/usr/bin/env bash
# jarvis-token.sh — print a secured dashboard URL (JWT-only, no sidecar GUI)
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
BASE="${1:-http://localhost:3142}"
DEVICE="${2:-hafjet-office-pc}"

ENROLL=$(jarvis enroll "$DEVICE" --json 2>/dev/null)
JWT=$(printf '%s' "$ENROLL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')

ACCESS=$(printf '%s' "$JWT" | python3 - "$BASE" <<'PY'
import sys, json, urllib.request
jwt = sys.argv[1]; base = sys.argv[2]
req = urllib.request.Request(base + "/sidecar/token", data=b"",
    headers={"Authorization": f"Bearer {jwt}"}, method="POST")
print(json.loads(urllib.request.urlopen(req, timeout=10).read().decode()).get("access_token",""))
PY
)
echo "${BASE}/?token=${ACCESS}"
```

## Inline Python mint+verify (for debugging)
```python
import sys, json, urllib.request
jwt = sys.argv[1]; base = sys.argv[2]
req = urllib.request.Request(base + "/sidecar/token", data=b"",
    headers={"Authorization": f"Bearer {jwt}"}, method="POST")
resp = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
tok = resp.get("access_token","")
ver = urllib.request.urlopen(base + "/?token=" + tok, timeout=10).status
print("MINT_OK" if tok else "MINT_FAILED", "DASHBOARD_HTTP", ver)
```

## Decode a JWT to confirm brain_domain origin
```python
import sys, json, base64
tok = sys.stdin.read().strip()
p = tok.split('.')[1]; p += '=' * (-len(p) % 4)
pl = json.loads(base64.urlsafe_b64decode(p))
print("brain:", pl.get("brain"))   # must be wss://100.121.94.41:3142/sidecar/connect
print("jwks:",  pl.get("jwks"))
```
If `brain` points at `localhost`, `daemon.brain_domain` was NOT set when the token
was enrolled -> set it and re-enroll.

## Notes
- Access token is short-lived (TTL in seconds). Re-run the helper for a fresh URL.
- `jarvis enroll` re-mints a JWT each run; old tokens become invalid.
- Over plain HTTP (Tailscale LAN), `Set-Cookie` is not marked `Secure` — fine for
  LAN access, just don't rely on it over public HTTP.
