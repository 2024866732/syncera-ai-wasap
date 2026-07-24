#!/usr/bin/env bash
# jarvis-token.sh — generate a secured dashboard URL for JARVIS (JWT-only mode)
# Usage: bash ~/jarvis-token.sh
# Requires: jarvis enrolled device + running daemon on this host (port 3142)
# Copy the printed URL into a browser on the same Tailscale network.
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"

DEVICE_NAME="${1:-hafjet-office-pc}"
HOST_PORT="${2:-http://localhost:3142}"

# 1) enroll (re-mints JWT each run; old token becomes invalid)
ENROLL_JSON=$(jarvis enroll "$DEVICE_NAME" --json 2>/dev/null)
JWT=$(printf '%s' "$ENROLL_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("token",""))')

if [ -z "$JWT" ]; then
  echo "ERROR: failed to enroll device '$DEVICE_NAME'" >&2
  exit 1
fi

# 2) mint short-lived access token via the /sidecar/token endpoint
ACCESS=$(python3 - "$JWT" "$HOST_PORT" <<'PY'
import sys, json, urllib.request
jwt = sys.argv[1]; base = sys.argv[2]
req = urllib.request.Request(base + "/sidecar/token", data=b"",
    headers={"Authorization": f"Bearer {jwt}"}, method="POST")
try:
    r = urllib.request.urlopen(req, timeout=10)
    print(json.loads(r.read())["access_token"])
except Exception as e:
    print("", file=sys.stderr); print("MINT_ERR:", e, file=sys.stderr); sys.exit(2)
PY
)

if [ -z "$ACCESS" ]; then
  echo "ERROR: failed to mint access token" >&2
  exit 2
fi

echo ""
echo "=============================================="
echo " JARVIS SECURE DASHBOARD URL (JWT-only)"
echo " Copy-paste into your browser (must be on"
echo " the same Tailscale network as this host):"
echo "=============================================="
echo ""
echo "${HOST_PORT}/?token=${ACCESS}"
echo ""
echo "(token is short-lived; re-run this script for a fresh one)"
