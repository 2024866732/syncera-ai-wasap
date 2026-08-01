# Oray / 蒲公英 X1 — USB storage not detected

## Symptom
APP Center → File Sharing always: **Storage device not detected, please check**  
even for known-good FAT32/NTFS pendrive and external HDD that works on a PC.

## What is NOT the root cause (for Xiaomi NAS)
- Smart Network / 组网 software authorization count = 0
- Missing software members
- SD-WAN client seats

Those block **Oray clients**, not local USB mount. Xiaomi Mi Home NAS needs **SMB on LAN**; without a mounted volume there is no share.

## Isolation ladder
1. Small FAT32 pendrive, no hub
2. Powered HDD enclosure (PSU on before boot)
3. NTFS then Ext4 trial
4. Cold plug vs hot plug order
5. All USB ports
6. Factory reset only after backup (last software step)

If all fail on FW 5.5.x → treat USB host defect or unresolved FW bug → **RMA**.

## RMA ticket essentials
- SN (example session: `112081250984`)
- FW version (e.g. 5.5.0)
- Screenshot File Sharing error + FS tips (VFAT/NTFS/Ext3/Ext4)
- Screenshot System Upgrade page
- Photo of SN label
- State: HDD OK on PC; stick also fails on X1

EN/CN draft pattern: storage never detected after reseat/reboot/hot-cold plug/official upgrade; request compatibility list or RMA.

## Parallel track
Proceed **Samba @ PC Office** (`references/xiaomi-mihome-nas-smb.md`) while waiting for Oray — does not affect RMA.

## Manual facts (X1 class)
- Default LAN often `10.168.1.1` (not 192.168.x)
- Default admin password often `admin` until changed
- USB FS tips may omit exFAT even if older manuals mention it — prefer FAT32/NTFS/Ext4
