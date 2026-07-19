# PC Office → Ubuntu 26.04 LTS + Hermes Agent Runbook (Tuan Hafizi)
**Spec:** Intel i3, 18GB RAM, 512GB SSD (Windows) + 320GB HDD (document NTFS) | **Mode:** On-demand dual-boot
**Draft:** 19 Julai 2026

## Phase 1: Download & Flash
- Ubuntu 26.04 LTS Server: https://ubuntu.com/download/server
- Flash via Rufus (Windows): GPT + UEFI, ISO mode, target USB

## Phase 2: Shrink Windows FIRST (critical)
- Boot to Windows → Disk Management → right-click C: → Shrink Volume
- Leave ~50GB Windows (enter 425000 MB to free) OR 100GB (enter 375000 MB)
- Do NOT use Ubuntu installer to shrink — it can't

## Phase 3: Install Ubuntu (dual-boot)
- Boot USB (F12) → Ubuntu Server
- Network: ens33 (LAN) auto DHCP, leave wlo1 alone
- Proxy: empty | Mirror: default
- Storage: **Custom/Manual** (NOT "Use entire disk")
  - Create `/` ext4 on FREE SPACE (150-420GB)
  - Leave Windows partition + HDD 320GB UNTOUCHED
  - NO RAID, NO LVM
- Profile: hafizi145, password paste
- ✅ TICK Install OpenSSH server

## Phase 4: Post-install
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl xz-utils git build-essential
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
hermes config set provider openrouter
hermes config set model tencent/hy3:free
```

## Phase 5: Access Windows docs from Ubuntu
```bash
sudo fdisk -l
sudo mkdir /mnt/docs && sudo mount /dev/sdb1 /mnt/docs
ls /mnt/docs
```

## Phase 6: On-demand remote
- LAN: `ssh hafizi145@<local-ip>`
- External: Cloudflared tunnel (free, no port forward)

## Known issues
| Issue | Fix |
|-------|-----|
| Python 3.14 default | Let installer use uv, don't force system python |
| hermes update git corruption (#32384) | Use normal `hermes update`, not git path |
| Read-only fs | touch /forcefsck && reboot (root console) |

## Azure rollover
1. Migrate ~/.hermes from Azure to PC (scp/rsync)
2. Test Hermes on PC
3. Terminate Azure → save RM30/bln
