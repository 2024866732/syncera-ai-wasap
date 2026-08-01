# Xiaomi NAS (Samba) + Ingest Phase 1

## Samba (PC Office)
- LAN IP: `192.168.1.252`
- Share: `xiaomi-nas` → `/mnt/cctv/xiaomi-nas`
- User: `smbcam` (smbpasswd); not login account
- SMB1: `server min protocol = NT1` for many Mi cams
- hosts allow: office LAN `192.168.1.` (+ Tailscale `100.` if needed)
- Mi Home form: Protocol SMB, IP, port 445, share `xiaomi-nas`, user/pass, then folder `recordings`
- **Never** choose `IPC$`

### ACL checklist
1. `/mnt/cctv` must allow traverse for `smbcam` (`setfacl -m u:smbcam:--x /mnt/cctv`) if parent is `750`.
2. Share dirs owned by `smbcam`, writable.
3. Ingest as `hafizi145` needs rwx on `recordings` + default ACL for new files from camera (`scripts/fix_acl.sh` pattern).
4. Office PC: `sudo` requires TTY — run ACL script at physical/SSH `-t` terminal.

### Oray X1
- USB never detected (pendrive+HDD) after FW ~5.5.0 → RMA/support track; not blocking Xiaomi if PC Samba works.
- 组网 software authorization = 0 does not fix USB; Xiaomi cam NAS needs same LAN SMB, not Oray client.

## Ingest service Phase 1
- Project: `hafjet-xiaomi-ingest` (sibling to worker)
- Watch drop dir → stability (size+mtime window) → claim → ffprobe → ffmpeg 1-frame thumb → archive + JSON + SQLite
- API: `127.0.0.1:8092` — `/health`, `/api/videos`, `/dashboard`
- DB: `/mnt/cctv/db/xiaomi_ingest.db` (isolated from `cctv_events.db`)
- Layout: `/mnt/cctv/xiaomi/{incoming,archive,thumbs,json,failed}`
- Retention dry-run default (`RETENTION_APPLY=false`)
- **No DNN/AI in P1**; no systemd until separate approval
- Smoke test may use `/mnt/cctv/xiaomi/test-drop` if Samba ACL not yet fixed; production `.env` must point at `.../xiaomi-nas/recordings` after ACL

### Verify
- Worker PID unchanged; `curl :8091/health` still ok
- `curl :8092/health` watcher_alive
- Drop finished `.mp4` → appears in `/api/videos` after STABLE_SECONDS
