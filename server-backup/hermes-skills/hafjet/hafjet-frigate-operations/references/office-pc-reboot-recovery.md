# Office-PC reboot recovery (HAFJET) — verified 2026-09-11

The office PC (`hafjet-pc-office`, Tailscale `100.121.94.41`) hosts Frigate, `cctv-worker` and
`xiaomi-ingest`. After a reboot/power-cut they come back **unevenly**, and the usual report is
"Frigate tak boleh buka" or "alert CCTV tak masuk".

## What auto-starts and what does not

| Service | After reboot | Recovery |
|---------|--------------|----------|
| `cctv-worker` | ✅ auto (systemd unit) | nothing |
| Frigate container (`~/frigate`) | ❌ `Exited (255)`, no restart policy | `cd ~/frigate && docker compose up -d` |
| `xiaomi-ingest` :8092 | ❌ bare nohup, no restart policy | manual start (venv recipe in `hafjet-camera-nas-storage`) |
| Tailscale | ✅ daemon reconnects | `tailscale status` / `tailscale ping 100.121.94.41` |
| `tailscale serve` root | ✅ persists in tailscaled | `tailscale serve status` → `/ proxy http://127.0.0.1:5000` |

## Triage sequence

```bash
# 0. Is the box even up?
tailscale ping 100.121.94.41                      # pong … or "timed out"
ssh -o BatchMode=yes -o ConnectTimeout=12 hafizi145@100.121.94.41 'uptime; date -u'

# 1. Frigate
docker ps -a --format '{{.Names}} | {{.Status}}'  # frigate | Exited (255) 2 weeks ago  ← needs up -d
curl -s -o /dev/null -w "local :5000 HTTP %{http_code}\n" http://127.0.0.1:5000   # 000 = down
cd ~/frigate && docker compose up -d              # NOT `restart` — that reuses stale container env
sleep 12; docker ps --filter name=frigate --format '{{.Names}} | {{.Status}}'     # Up (health: starting) → healthy

# 2. Ingest
ss -tlnp | grep 8092 || echo "8092 MATI — xiaomi-ingest needs manual start"

# 3. Worker
systemctl is-active cctv-worker
systemctl show cctv-worker -p MainPID             # must not change during any of this

# 4. Public link
curl -s -o /dev/null -w "serve HTTP %{http_code}\n" https://hafjet-pc-office.tail260d72.ts.net/
```

## Reading the symptoms

- `HTTP 000` on port 5000 **and** `Exited (255)` in `docker ps -a` → container simply exited; `up -d` is
  enough. `docker compose restart` is the wrong tool (it reuses old env; see the Frigate skill step 2).
- `HTTP 000` everywhere including SSH working, while `tailscale status` shows the node `offline, last
  seen …` → the PC is off/asleep, nothing to fix remotely. Tell Tuan to power it on, then re-verify.
- Frigate up but the shared `ts.net` link still fails → check `tailscale serve status`; a previous
  `tailscale serve --bg <port>` can silently REPLACE the root mapping (serve keeps one root target).
- Frigate healthy, alerts still silent → `xiaomi-ingest` is down (`:8092` no listener). Start it with the
  venv pattern; `pkill -f "python -m app.main"` must NEVER be used (it matches `cctv-worker` too).

## Ordering rule

Frigate first (it is the detection + snapshot source for the alert poller), then `xiaomi-ingest`.
Never restart `cctv-worker` as part of a recovery — verify its MainPID is unchanged at the end.
