#!/usr/bin/env bash
# Read-only CCTV worker memory sample. No restart, write, or alert action.
set -euo pipefail
ssh -o BatchMode=yes -o ConnectTimeout=8 hafizi145@100.121.94.41 \
  'line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $(systemctl show cctv-worker -p MemoryCurrent -p MemoryPeak --value | tr "\n" " ")"; printf "%s\n" "$line" | tee -a /tmp/cctv-rss-baseline-30min.log'