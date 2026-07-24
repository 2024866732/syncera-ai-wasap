#!/usr/bin/env bash
# jarvis-token.sh — generate a secured dashboard URL for JARVIS (JWT-only mode)
# Usage: bash ~/jarvis-token.sh [device-name] [base-url]
# Requires: jarvis enrolled device + running daemon on this host (port 3142)
# Proven during HAFJET setup 2026-07-24. Push to target via:
#   cat jarvis-token.sh | ssh hafjet-pc-office 'cat > ~/jarvis-token.sh && chmod +x ~/jarvis-token.sh'
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"

DEVICE_NAME="${1:-hafjet-office-pc}"
HOST_PORT="${2:-http://localhost:3142}"

# 1) enroll (re-mints a fresh enrollment JWT each run)
ENROLL_JSON=$(jarvis enroll "$DEVICE_NAME" --json 2>/dev/null)
JWT=$(printf '%s' "$ENROLL_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')

if [ -z "$JWT" ]; then
  echo "ERROR: failed to enroll device '$DEVICE_NAME'" >&2
  exit 1
fi

# 2) mint short-lived access token (Authorization: Bearer <JWT> header — NOT body)
ACCESS=$(printf '%s' "$JWT" | python3 - "$HOST_PORT" <<'PY'
import sys, json, urllib.request
jwt = sys.argv[1]; base = sys.argv[2]
req = urllib.request.Request(base + "/sidecar/token", data=b"",
    headers={"Authorization": f"Bearer {jwt}"}, method="POST")
print(json.loads(urllib.request.urlopen(req, timeout=10).read())["access_token"])
PY
)

if [ -z "$ACCESS" ]; then
  echo "ERROR: failed to mint access token" >&2
  exit 2
fi

echo ""
echo "=============================================="
echo " JARVIS SECURE DASHBOARD URL (JWT-only)"
echo " Copy-paste into your browser. For remote access,"
echo " swap 'localhost' for the host's Tailscale IP."
echo "=============================================="
echo ""
echo "${HOST_PORT}/?token=${ACCESS}"
echo ""
echo "(token is short-lived; re-run this script for a fresh one)"
