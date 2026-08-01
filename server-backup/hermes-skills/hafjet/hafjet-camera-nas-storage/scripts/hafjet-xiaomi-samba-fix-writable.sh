#!/usr/bin/env bash
# Fix Xiaomi Samba: allow smbcam to traverse /mnt/cctv without listing other CCTV data.
# Run on PC Office with interactive sudo. Does NOT restart cctv-worker.
set -euo pipefail

echo "=== Fix path ACL for smbcam ==="
namei -l /mnt/cctv/xiaomi-nas/recordings || true

if ! command -v setfacl >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y acl
fi

sudo setfacl -m u:smbcam:--x /mnt/cctv
echo "ACL set: user smbcam execute(traverse) on /mnt/cctv"
getfacl -p /mnt/cctv | head -20

sudo mkdir -p /mnt/cctv/xiaomi-nas/recordings
sudo chown -R smbcam:smbcam /mnt/cctv/xiaomi-nas
sudo chmod 775 /mnt/cctv/xiaomi-nas
sudo chmod 775 /mnt/cctv/xiaomi-nas/recordings

if [[ -f /etc/samba/smb.conf ]]; then
  sudo cp -a /etc/samba/smb.conf "/etc/samba/smb.conf.bak-$(date -u +%Y%m%dT%H%M%SZ)"
fi

sudo tee /etc/samba/smb.conf >/dev/null <<'SMBCONF'
[global]
   workgroup = WORKGROUP
   server string = HAFJET Xiaomi NAS
   netbios name = HAFJET-NAS
   security = user
   map to guest = never
   dns proxy = no
   log file = /var/log/samba/log.%m
   max log size = 1000
   server min protocol = NT1
   server max protocol = SMB3
   ntlm auth = yes
   hosts allow = 127. 192.168.1. 100.
   hosts deny = 0.0.0.0/0
   load printers = no
   printing = bsd
   printcap name = /dev/null
   disable spoolss = yes
   follow symlinks = no
   wide links = no
   unix extensions = yes

[xiaomi-nas]
   path = /mnt/cctv/xiaomi-nas
   browseable = yes
   read only = no
   writable = yes
   valid users = smbcam
   force user = smbcam
   force group = smbcam
   create mask = 0664
   directory mask = 0775
   force create mode = 0664
   force directory mode = 0775
SMBCONF

sudo testparm -s
sudo systemctl restart smbd nmbd
systemctl is-active smbd nmbd

echo "=== Permission check (as smbcam) ==="
sudo -u smbcam test -x /mnt/cctv && echo "TRAVERSE_OK /mnt/cctv"
sudo -u smbcam test -w /mnt/cctv/xiaomi-nas && echo "WRITE_OK xiaomi-nas"
sudo -u smbcam test -w /mnt/cctv/xiaomi-nas/recordings && echo "WRITE_OK recordings"
sudo -u smbcam touch /mnt/cctv/xiaomi-nas/recordings/.write_test && echo "TOUCH_OK" && sudo -u smbcam rm -f /mnt/cctv/xiaomi-nas/recordings/.write_test

echo "Re-try Mi Home: share xiaomi-nas (NOT IPC$) → folder recordings."
namei -l /mnt/cctv/xiaomi-nas/recordings
