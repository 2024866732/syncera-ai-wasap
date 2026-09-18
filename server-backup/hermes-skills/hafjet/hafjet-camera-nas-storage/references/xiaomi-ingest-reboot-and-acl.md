# xiaomi-ingest — reboot survivability & verified post-ACL outcome (2026-08-08 → 2026-09-11)

Companion to `references/xiaomi-ingest-telegram-alert-2026-08-08.md` (alert module + `.env`) and the
Pilihan A section of SKILL.md (recursive scan of `xiaomi_camera_videos`).

## It does NOT survive an office-PC reboot

`cctv-worker` is a **systemd unit** → auto-starts. `xiaomi-ingest` is a **bare nohup process** with no
restart policy → after a reboot `:8092` stays DOWN until started manually. This is the **#1 cause of
"Telegram recording alerts stopped"** and is easy to mistake for a broken alert module.

Post-reboot order on the Office PC:

```bash
# 1. Frigate first — it is the snapshot source for the OTHER alert poller
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000   # 000 ⇒ cd ~/frigate && docker compose up -d
# 2. Ingest
ss -tlnp | grep 8092 || echo "8092 MATI — start xiaomi-ingest"
cd ~/projects/hafjet-xiaomi-ingest
VIRTUAL_ENV=$PWD/.venv PATH=$PWD/.venv/bin:$PATH nohup .venv/bin/python -m app.main > /mnt/cctv/logs/xiaomi-ingest.log 2>&1 &
# 3. Worker untouched
systemctl is-active cctv-worker
systemctl show cctv-worker -p MainPID      # must equal the pre-restart value
```

Full office-PC triage (including the Tailscale/Frigate symptoms):
`hafjet-frigate-operations` → `references/office-pc-reboot-recovery.md`.

A systemd unit exists as an option (`systemd/xiaomi-ingest.service.example`) but installing/enabling it
needs a **separate approval** — until then, assume manual start after every reboot.

## ACL that unblocks the whole pipeline

`xiaomi_camera_videos` is `smbcam:smbcam`; `hafizi145` can read but not write, so the post-ingest
`shutil.move()` fails `PermissionError [Errno 13]`. Fix needs TTY sudo — stage the reviewed script,
Tuan runs it (production ACL gate):

```bash
sudo setfacl -R -m u:hafizi145:rwx /mnt/cctv/xiaomi-nas/xiaomi_camera_videos
sudo setfacl -R -d -m u:hafizi145:rwx /mnt/cctv/xiaomi-nas/xiaomi_camera_videos
```

Script staged as `~/fix_acl_xiaomi_camera_videos.sh`; proof = `touch .write_test` → `WRITE OK`
(avoid create+delete probes). Verify afterwards with `getfacl -p <dir>` → both `user:hafizi145:rwx`
and `default:user:hafizi145:rwx` present.

## Verified end-to-end outcome

- Restart with venv → `curl -s http://127.0.0.1:8092/health` → `recordings_dir=…/xiaomi_camera_videos`,
  `watcher_alive=true`.
- Minutes later: **`processed_ok: 25`**, `processed_fail: 4` (all partial files — `moov atom not found`),
  `queue_depth` settling to 0.
- Fresh clip → `telegram alert sent ok=True` and a thumbnail written to `thumbs/{y}/{m}/{d}/`.
- `cctv-worker` MainPID **unchanged** throughout; Frigate untouched.
- Backfill clips (mtime older than `ALERT_NEW_MINUTES=30`) ingest **silently** — so a real clip ingested
  during catch-up will NOT alert. To prove the alert path, copy a known-good clip back into the camera
  tree with a fresh mtime and wait out `STABLE_SECONDS=45`.
