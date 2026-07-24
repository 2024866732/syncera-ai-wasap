#!/usr/bin/env bash
# jarvis-token.sh — generate a JARVIS dashboard URL with a fresh access token.
# Run ON the daemon host (e.g. hafjet-office-pc). Requires: bun on PATH, jarvis running.
#
# Usage:
#   ./jarvis-token.sh [device-name] [host:port]
#   device-name  default: hafjet-office-pc
#   host:port    default: localhost:3142
#
# Prints a ready-to-open URL:  http://<host>:3142/?token=<access_token>
# Open it in a browser over Tailscale (or localhost). Cookie is then set.

set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"

DEVICE="${1:-hafjet-office-pc}"
TARGET="${2:-localhost:3142}"

# 1) enroll fresh against the RUNNING daemon (stale JWT after restart = 401)
ENROLL_JSON="$(jarvis enroll "$DEVICE" --json 2>/dev/null)"
JWT="$(printf '%s' "$ENROLL_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')"
[ -n "$JWT" ] || { echo "ENROLL FAILED" >&2; exit 1; }

# 2) mint short-lived access token (JWT MUST be in Authorization: Bearer header)
ACCESS="$(curl -s -X POST "http://$TARGET/sidecar/token" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d '{}')"
TOKEN="$(printf '%s' "$ACCESS" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')"
[ -n "$TOKEN" ] || { echo "MINT FAILED: $ACCESS" >&2; exit 1; }

# 3) print URL (works with JWT-only mode — server sets cookie + redirects)
HOST_ONLY="${TARGET%%:*}"
PORT_ONLY="${TARGET##*:}"
echo "Dashboard URL (valid until access token TTL expires):"
echo "http://$HOST_ONLY:$PORT_ONLY/?token=$TOKEN"
