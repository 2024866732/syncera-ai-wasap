#!/usr/bin/env bash
set -euo pipefail

echo "== Node path =="
ls -ld ~/.hermes/n8n/bin/node ~/.hermes/npm-global/bin 2>/dev/null || true
echo "== Versions =="
export PATH="$HOME/.hermes/n8n/bin:$HOME/.hermes/npm-global/bin:$PATH"
node --version || true
npm --version || true
n8n --version || true
ctx7 --version || true
