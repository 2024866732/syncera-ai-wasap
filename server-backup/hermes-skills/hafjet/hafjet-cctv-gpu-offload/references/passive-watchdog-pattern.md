# Fasa 1 Passive Watchdog Pattern (7-day monitor)

Corak monitor pasif untuk fasa soak/monitor yang panjang. Matlamat: **senyap bila OK, alert bila anomaly** — Tuan tidak mahu spam setiap jam; hanya mahu tahu bila ada masalah.

## Cara setup (Hermes cron)
1. Tulis script watchdog: `~/.hermes/scripts/<name>_watchdog.sh` (bash, `set -uo pipefail`)
2. Cipta cron job dengan `no_agent=true` + `script=<filename relative to ~/.hermes/scripts/>`:
   - Schedule: `every 30m` (atau `*/30 * * * *`) + `repeat=0` → jadi **forever** (default repeat untuk recurring cron kadang jadi `once` — set repeat=0 eksplisit)
   - `deliver: origin`
3. Semak dengan `cronjob action=list` — pastikan `repeat: forever`

## Kontrak script
- **stdout kosong = senyap** (tiada delivery) — ini kunci no_agent watchdog
- **stdout bukan kosong = alert** dihantar verbatim ke chat
- Exit code 0 walau ada alert (jangan trigger cron error alert palsu)

## Checks yang terbukti berguna (Fasa 1 CCTV offload)
```bash
# 1. Circuit breaker flag di RTX
ssh office 'ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 "cat ~/cctv-analysis/.circuit_breaker 2>/dev/null"'
# 2. rsync/cron failures — TAPI tapis ke selepas cron aktif (manual-test noise!)
awk '$0 ~ /^\[/ {line=$0} /FAIL|CIRCUIT/ && line ~ /^\[2026-08-04T0[89]|^\[2026-08-04T1[0-9]/ {print line}' /mnt/cctv/logs/cctv-offload-push.log | tail -5
# 3. Push-cron freshness: fail mesti dikemas kini oleh cron (max ~100 min)
stat -c %Y /home/hafizi145/cctv-analysis/clips_to_push.txt   # vs $(date +%s)
# 4. Backlog SEBENAR = staging RTX (bukan fail sumber!):
ssh office 'ssh ... hafjet@100.119.32.87 "find ~/cctv-analysis/staging -name \"*.mp4\" | wc -l"'
#    alert bila > ~200
# 5. RTX reachable? (echo ok melalui chain ssh)
```

## Pitfalls (dialami 2026-08-04)
- Jangan ukur `clips_to_push.txt` sebagai "backlog" — pick_clips tulis SEMUA (~1365), push hanya cap (50) → alert palsu setiap run.
- Tapis log FAIL mengikut masa cron mula — kalau tidak, kegagalan test manual lama ditarik semula sebagai alert.
- `mtime` fail sumber berfungsi sebagai heartbeat cron: jika `clips_to_push.txt` >100 minit tua, bermakna cron push mati/gagal — alert itu, bukan sekadar "backlog".
- `find ... | sed -E "s#.*/staging/([0-9-]+/[0-9]+)/.*#\1#" | sort | uniq -c` — cara cepat bucket staging ikut jam untuk lihat sama ada backlog terkumpul atau stabil.
