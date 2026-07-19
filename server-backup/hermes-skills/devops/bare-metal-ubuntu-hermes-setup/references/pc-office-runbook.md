# PC Office → Ubuntu + Hermes Runbook (HAFJET)
**Spec:** Intel i3, 18GB RAM, 512GB SSD (had Windows) + 320GB HDD SATA (documents)
**Mode:** On-demand | **Distro:** Ubuntu 24.04 LTS Server (Tuan chose stable over 26.04)
**Context:** Azure VPS was 30GB read-only + 1GB RAM bottleneck. PC repurposed as Hermes engine.

## Phase 0: Backup
- Copy HDD (D:/E:) documents to USB/cloud BEFORE any install.

## Phase 1: Flash ISO
- Rufus: GPT + UEFI, ISO mode, Ubuntu 24.04 Server ISO.

## Phase 2: Install (full format SSD, keep HDD)
- Boot F12 → USB.
- Network: `enp1s0` (Realtek ethernet) connected → Done. Ignore "Create bond".
- Storage: **"Use an entire disk"** → select **SPCC 476.939G (SSD)**. NOT WDC 320G HDD.
- User `hafizi145`, password paste. ✅ Tick OpenSSH server.
- Reboot, remove USB.

## Phase 3: Post-install
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl xz-utils git build-essential
```

## Phase 4: Hermes
```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
# Recommended setup, let uv handle Python
hermes config set provider openrouter
hermes config set model tencent/hy3:free
```

## Phase 5: Mount HDD (documents)
```bash
sudo mkdir /mnt/docs
sudo mount /dev/sdb1 /mnt/docs
ls /mnt/docs   # NTFS readable from Ubuntu
```

## Phase 6: Tailscale (remote, dynamic IP)
```bash
curl -fsSL https://tailscale.com/install/linux | sh
sudo tailscale up   # login via browser URL
# Access: ssh hafizi145@<tailscale-ip> from phone/laptop
```

## Mistakes made this session (don't repeat)
- Picked "Use an entire disk" while Windows still on SSD → would wipe Windows. Fix: full format is fine ONLY if Windows not needed; else shrink from Windows first.
- Looked for "Add partition" in Windows Disk Management → doesn't exist there. Create partitions in Ubuntu Custom layout, not Windows.
- Saw "RAW" partition in Windows → thought corrupted. It's normal ext4, Windows just can't read it.
- Custom layout mount point confusion → always pick `/` for root ext4.
- MBR extended-partition error "No usable device found" → resolved by going full-format (GPT).
