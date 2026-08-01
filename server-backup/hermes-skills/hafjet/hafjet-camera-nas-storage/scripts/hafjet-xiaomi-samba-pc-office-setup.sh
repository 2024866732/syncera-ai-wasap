#!/usr/bin/env bash
# HAFJET — Xiaomi CCTV → Samba NAS on PC Office
# Run ON hafjet-pc-office with interactive sudo (physical/TTY SSH).
# Does NOT touch cctv-worker service, RTSP, or Oray X1 RMA.
set -euo pipefail

SHARE_ROOT="/mnt/cctv/xiaomi-nas"
SHARE_NAME="xiaomi-nas"
SMB_USER="smbcam"
SMB_CONF="/etc/samba/smb.conf"
BACKUP_TS="$(date -u +%Y%m%dT%H%M%SZ)"

echo "=== HAFJET Xiaomi Samba setup ==="
echo "Host: $(hostname)  Time UTC: $(date -u -Iseconds)"
echo "Share: ${SHARE_ROOT}  Name: ${SHARE_NAME}  User: ${SMB_USER}"
echo

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as normal user with sudo, not as root login."
  exit 1
fi

if [[ ! -d /mnt/cctv ]]; then
  echo "ERROR: /mnt/cctv missing"
  exit 1
fi

echo "[1/8] Install samba"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y samba samba-common-bin smbclient

echo "[2/8] System user ${SMB_USER} (no login shell)"
if id "${SMB_USER}" &>/dev/null; then
  echo "User ${SMB_USER} already exists"
else
  sudo adduser --system --group --home "${SHARE_ROOT}" --shell /usr/sbin/nologin "${SMB_USER}"
fi

echo "[3/8] Create share directory (separate from worker snapshots/faces)"
sudo mkdir -p "${SHARE_ROOT}/recordings"
sudo chown -R "${SMB_USER}:${SMB_USER}" "${SHARE_ROOT}"
sudo chmod 755 "${SHARE_ROOT}"
sudo chmod 775 "${SHARE_ROOT}/recordings"

echo "[4/8] Samba password for ${SMB_USER}"
echo ">>> Set a NEW password for camera NAS (not your Linux login password)."
sudo smbpasswd -a "${SMB_USER}"
sudo smbpasswd -e "${SMB_USER}"

echo "[5/8] Backup existing smb.conf if any"
if [[ -f "${SMB_CONF}" ]]; then
  sudo cp -a "${SMB_CONF}" "${SMB_CONF}.bak-${BACKUP_TS}"
  echo "Backup: ${SMB_CONF}.bak-${BACKUP_TS}"
fi

echo "[6/8] Write smb.conf (SMB1/NT1 for Xiaomi; LAN allowlist)"
sudo tee "${SMB_CONF}" >/dev/null <<'SMBCONF'
[global]
   workgroup = WORKGROUP
   server string = HAFJET Xiaomi NAS
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
SMBCONF

echo "[7/8] Validate + enable services"
sudo testparm -s
sudo systemctl enable smbd nmbd
sudo systemctl restart smbd nmbd
systemctl is-active smbd nmbd || true
sudo systemctl --no-pager --full status smbd | head -25

if command -v ufw >/dev/null 2>&1; then
  if sudo ufw status 2>/dev/null | grep -q 'Status: active'; then
    echo "[firewall] UFW active — allow Samba from LAN"
    sudo ufw allow from 192.168.1.0/24 to any app Samba \
      || sudo ufw allow from 192.168.1.0/24 to any port 445 proto tcp
    sudo ufw status | head -30
  else
    echo "[firewall] UFW installed but not active"
  fi
else
  echo "[firewall] no ufw — OK if local LAN only"
fi

echo "[8/8] Local smoke test"
ip -4 -br addr | sed -n '1,12p'
echo "Listening:"
ss -lntu | grep -E ':445|:139' || true
echo
ls -la "${SHARE_ROOT}"
echo
echo "=== MI HOME FORM ==="
LAN_IP="$(ip -4 -o addr show scope global | awk '/enp|eth|wlan|wlp/ {print $4}' | cut -d/ -f1 | head -1)"
echo "Protocol: SMB"
echo "IP address: ${LAN_IP:-192.168.1.252}"
echo "Port: 445"
echo "Shared folder: ${SHARE_NAME}"
echo "Username: ${SMB_USER}"
echo "Password: (value you set with smbpasswd)"
echo "Subfolder: recordings"
echo
echo "Phone + Xiaomi camera MUST be on same LAN (192.168.1.x), not guest WiFi, not mobile data."
echo "DONE. Oray X1 RMA unaffected. cctv-worker not restarted."
