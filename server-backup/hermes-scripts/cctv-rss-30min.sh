#!/usr/bin/env bash
# Read-only CCTV worker memory sample. No restart, write, or alert action.
#
# FIX 2026-09-19: tambah GUARD. Sebelum ni job ni gagal 363x berturut (setiap
# 30 minit) sebab PC Office offline — ssh exit 255. Sekarang kalau PC tak
# reachable, keluar exit 0 dengan satu baris nota (bukan error), jadi job
# auto-sambung sendiri bila PC hidup balik. Logik sampling TIDAK diubah.
set -uo pipefail
HOST="100.121.94.41"
SSHUSER="hafizi145"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- Guard: PC Office reachable? (TCP 22, timeout 6s) ---
if ! timeout 6 bash -c "exec 3<>/dev/tcp/${HOST}/22" 2>/dev/null; then
  echo "${TS} [skip] pc-office ${HOST} unreachable — no sample taken (read-only job, no action)"
  exit 0
fi

ssh -o BatchMode=yes -o ConnectTimeout=8 "${SSHUSER}@${HOST}" \
  'line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $(systemctl show cctv-worker -p MemoryCurrent -p MemoryPeak --value | tr "\n" " ")"; printf "%s\n" "$line" | tee -a /tmp/cctv-rss-baseline-30min.log'
