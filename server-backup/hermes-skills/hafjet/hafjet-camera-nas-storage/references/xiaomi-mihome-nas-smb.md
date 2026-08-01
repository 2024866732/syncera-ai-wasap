# Xiaomi / Mi Home → SMB NAS (HAFJET)

## Goal
Mi Home “NAS network storage” dumps camera clips to an SMB share on the **same LAN**.

## Form values (PC Office default)

| Field | Value |
|-------|--------|
| Protocol | SMB |
| IP | `192.168.1.252` (confirm with `ip -4 -br addr` on PC) |
| Port | 445 |
| Share | `xiaomi-nas` |
| User | `smbcam` |
| Password | set via `smbpasswd` (never store in chat/memory) |
| Subfolder | `recordings` |

## Phone steps
1. Phone on **same WiFi/LAN** as PC (not mobile data, not guest SSID).
2. Mi Home → Camera → Settings → Manage storage → NAS network storage.
3. Add NAS → SMB → values above → Test → select `recordings` → enable.

## SMB1
Many Xiaomi models only speak SMBv1. Samba must allow NT1:

```
server min protocol = NT1
server max protocol = SMB3
ntlm auth = yes
```

Tradeoff: weaker protocol — restrict with `hosts allow` to LAN (and Tailscale `100.` only if needed).

## PC Office install
- Script: `scripts/hafjet-xiaomi-samba-pc-office-setup.sh`
- Requires **interactive sudo** on office PC (TTY). Stage via scp; Tuan runs.
- Does **not** restart `cctv-worker`.
- Share root: `/mnt/cctv/xiaomi-nas` — keep out of worker `snapshots/` / `faces/`.

## Verify
```bash
systemctl is-active smbd nmbd
ss -lntu | grep -E ':445|:139'
smbclient -L //127.0.0.1 -U smbcam
ls -la /mnt/cctv/xiaomi-nas
df -h /mnt/cctv
```

## Pitfalls
- AP/client isolation hides PC from camera.
- Oray 组网 online ≠ camera can reach SMB IP.
- Filling CCTV LVM with camera dumps — monitor free space.
- Never port-forward 445 to WAN.
