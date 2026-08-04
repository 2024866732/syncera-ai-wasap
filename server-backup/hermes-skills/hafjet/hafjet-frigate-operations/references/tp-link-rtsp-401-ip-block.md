# TP-Link RTSP 401 → Source-IP Block (full saga, 2026-08-03/04)

## Symptom
- `ffmpeg -rtsp_transport tcp -i "rtsp://user:pass@192.168.1.226:554/stream1"` from office PC → `401 Unauthorized` (RC=8), ALWAYS.
- Same URL in **VLC from laptop** → plays fine (including `--rtsp-tcp`).
- Camera power-cycle did NOT clear it. MAC matched (`ec:b9:31` = TP-Link), port 554 open, ping fine, `OPTIONS` returns 200 with `WWW-Authenticate: Basic realm="TP-Link IP-Camera"` + Digest.

## Root cause
TP-Link camera **silently blocks a source IP** after repeated failed RTSP auth attempts (we had hammered it with wrong creds/streams earlier). The block survives power-cycle. All Docker container traffic NATs to the host LAN IP, so container ffmpeg = host ffmpeg = blocked.

## Fix (what actually worked)
1. Stop the hammer: `docker compose down` (watchdog retries extend the block).
2. **Change the source IP**: office PC LAN IP was changed `192.168.1.252` → `192.168.1.250`.
3. Verify from HOST with correct creds, once: `ffmpeg -rtsp_transport tcp -i "rtsp://hafizi145:skyblues@192.168.1.226:554/stream1" -t 3 -f null -` → succeeded immediately (RC=0, 61 frames).
4. Only then `docker compose up -d`.

## Extra twist: docker compose restart vs recreate
After .env fix, `docker compose restart` still used the OLD container env (`hafizi145%40gmail.com`). Had to `docker compose up -d --force-recreate` to load the new `.env`. Also verified via `docker inspect frigate --format '{{range .Config.Env}}{{println .}}{{end}}' | grep FRIGATE_RTSP`.

## Redaction rule
When saving test outputs to files, redact creds first: `sed -E 's#rtsp://[^@]+@#rtsp://***:***@#'`. Never paste raw RTSP passwords into chat/logs.

## Diagnostic sequence (in order, each ONE shot to avoid extending block)
1. `ping -c2 ip` + `ip neigh show ip` (MAC vendor check) + `</dev/tcp/ip/554` port check.
2. Raw RTSP `OPTIONS` and `DESCRIBE` via bash `/dev/tcp` to see WWW-Authenticate realm (no auth attempt).
3. Single ffmpeg test with correct URL; compare laptop-VLC vs server-ffmpeg (different source IPs).
4. If server-only fails → suspect IP block, change source IP or wait, do NOT retry repeatedly.
