#!/usr/bin/env bash
# HAFJET Fasa 1 watchdog — senyap (stdout kosong) jika semua OK.
# Alert hanya bila: circuit breaker, cron/rsync failures, RTX unreachable,
# backlog staging RTX (klip menunggu diproses) > 200, push cron stale.
set -uo pipefail
SSH="ssh -o BatchMode=yes -o ConnectTimeout=10"
OFFICE="hafizi145@100.121.94.41"
ALERTS=""

# 1. Circuit breaker di RTX
CB=$($SSH "$OFFICE" 'timeout 15 ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes hafjet@100.119.32.87 "cat ~/cctv-analysis/.circuit_breaker 2>/dev/null" 2>/dev/null' 2>/dev/null)
if [ -n "$CB" ]; then
  ALERTS="${ALERTS}⚠️ CIRCUIT_BREAKER: $CB
"
fi

# 2. rsync/cron failures — HANYA selepas cron aktif (cron aktif 2026-08-04 ~08:00Z)
FAILS=$($SSH "$OFFICE" 'awk '\''$0 ~ /^\[/ {line=$0} /FAIL|CIRCUIT/ && line ~ /^\[2026-08-04T0[89]|^\[2026-08-04T1[0-9]/ {print line}'\'' /mnt/cctv/logs/cctv-offload-push.log 2>/dev/null | tail -5' 2>/dev/null)
if [ -n "$FAILS" ]; then
  ALERTS="${ALERTS}⚠️ PUSH_FAILURES (selepas cron aktif):
$FAILS
"
fi

# 3. Push cron stale: clips_to_push.txt mesti dikemas kini oleh cron (max 100 minit)
MTIME=$($SSH "$OFFICE" 'stat -c %Y /home/hafizi145/cctv-analysis/clips_to_push.txt 2>/dev/null || echo 0' 2>/dev/null)
NOW=$(date +%s)
if [ -n "$MTIME" ] && [ "$MTIME" -gt 0 ] && [ $((NOW - MTIME)) -gt 6000 ]; then
  ALERTS="${ALERTS}⚠️ PUSH_CRON_STALE: clips_to_push.txt tidak dikemas kini >100min (cron gagal?)
"
fi

# 4. Backlog staging RTX — NOT an alert (Opsyen B: expected backlog ~682/h vs cap 50/h).
#    Rekod sahaja dalam log watch, bukan delivery. (keputusan Tuan 2026-08-04)

# 5. RTX unreachable
if ! $SSH "$OFFICE" 'timeout 10 ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes hafjet@100.119.32.87 "echo ok" 2>/dev/null' >/dev/null 2>&1; then
  ALERTS="${ALERTS}⚠️ RTX UNREACHABLE (rsync/analysis mungkin gagal)
"
fi

if [ -n "$ALERTS" ]; then
  echo "[Fasa1 Watchdog $(date -u +%Y-%m-%dT%H:%M:%SZ)]"
  echo "$ALERTS"
fi
# stdout kosong = senyap (no delivery)
