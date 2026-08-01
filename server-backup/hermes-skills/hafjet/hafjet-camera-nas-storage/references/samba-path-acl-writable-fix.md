# Samba share under /mnt/cctv — path ACL / writable fix

## Symptom (Mi Home)

After selecting share `xiaomi-nas` (not `IPC$`):

> Couldn't set  
> Make sure the selected folder is readable and writable

Samba may still show `smbd` active and `:445` listening.

## Root cause (hafjet-pc-office, 2026-08-01)

```
namei -l /mnt/cctv/xiaomi-nas/recordings
# ...
# drwxr-x--- hafizi145 hafizi145 cctv    ← smbcam cannot traverse
# drwxr-xr-x smbcam    smbcam    xiaomi-nas
# drwxrwxr-x smbcam    smbcam    recordings
```

Share config used `force user = smbcam`. File ops run as `smbcam`, so **every directory component** from `/` to the share must allow execute (traverse) for that user. Mode `750` on `/mnt/cctv` blocks others and non-group users.

## Diagnosis

```bash
namei -l /mnt/cctv/xiaomi-nas/recordings
id smbcam
grep -A15 '\[xiaomi-nas\]' /etc/samba/smb.conf
sudo -u smbcam test -x /mnt/cctv; echo traverse:$?
sudo -u smbcam test -w /mnt/cctv/xiaomi-nas/recordings; echo write:$?
```

## Fix (preferred)

Do **not** `chmod 777 /mnt/cctv` (exposes worker trees).

```bash
sudo setfacl -m u:smbcam:--x /mnt/cctv
sudo chown -R smbcam:smbcam /mnt/cctv/xiaomi-nas
sudo chmod 775 /mnt/cctv/xiaomi-nas /mnt/cctv/xiaomi-nas/recordings
sudo systemctl restart smbd nmbd
sudo -u smbcam touch /mnt/cctv/xiaomi-nas/recordings/.write_test \
  && sudo -u smbcam rm -f /mnt/cctv/xiaomi-nas/recordings/.write_test
```

Scripted: `scripts/hafjet-xiaomi-samba-fix-writable.sh` (TTY sudo on Office PC).

Optional smb.conf hardening for camera writers: `force create mode` / `force directory mode` 0664/0775.

## Mi Home share picker

| Choice | Action |
|--------|--------|
| `xiaomi-nas` | Correct |
| `recordings` (if listed as folder inside) | OK after connect |
| `IPC$` | **Never** — system share |

## Ingest note

Watcher running as `hafizi145` must also move files out of `recordings/`. Grant ACL `u:hafizi145:rwx` on `recordings` (and default ACL) when enabling `hafjet-xiaomi-ingest`, without weakening worker-only paths more than needed.
