---
name: bare-metal-ubuntu-hermes-setup
description: Install Ubuntu (Server/Desktop) on a physical PC, deploy Hermes Agent, mount existing data disks safely, and expose the box for remote on-demand access via Tailscale. Covers dual-boot pitfalls (MBR/GPT, NTFS resize), the "Use an entire disk wipes Windows" trap, and the "RAW partition is normal" gotcha. Use when Tuan Hafizi wants to repurpose a physical PC (office/i3 class) as a Hermes engine instead of a VPS.
---

# Bare-Metal Ubuntu + Hermes Agent Setup (HAFJET PC)

## When to use
- Tuan wants to run Hermes on a physical PC instead of (or to replace) a cramped VPS.
- PC has Windows on SSD + data on HDD, and Tuan wants to keep the data disk.
- Goal: on-demand Hermes engine at near-zero fixed cost (electricity only).

## Decision: distro version
- **Ubuntu 24.04 LTS** = default for Tuan. He prefers "more stable" over newest.
- 26.04 LTS IS compatible with Hermes (confirmed live deploys May 2026, Python 3.14 handled via `uv` installer) but Tuan opted back to 24.04 when unsure. Recommend 24.04 unless he insists on 26.04.
- Desktop vs Server: **Server** for headless bot/agent box (8-18GB RAM fine). Desktop only if PC is also a daily workstation. For WSL2-in-Windows path, see note at bottom.

## Decision: full format vs dual-boot
- **Full Ubuntu (format SSD)** = recommended for a Hermes-only box. Simple, no MBR errors.
- **Dual-boot** = only if Windows must stay. Higher risk (see pitfalls).

## INSTALL WORKFLOW (full format, HDD kept)
1. Backup HDD data (D:/E:) to USB/cloud FIRST.
2. Flash Ubuntu ISO with Rufus (GPT + UEFI, ISO mode).
3. Boot F12 → USB.
4. Storage → **"Use an entire disk"** → select the **SSD** (e.g. SPCC 476.939G).
   ⚠️ NEVER select the HDD (e.g. WDC 320G) — that holds documents.
5. User `hafizi145`, password **paste** (never type secrets).
6. ✅ TICK **Install OpenSSH server**.
7. Reboot, remove USB.
8. Post-install: `sudo apt update && sudo apt upgrade -y` then `sudo apt install -y curl xz-utils git build-essential`.
9. Install Hermes: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash` (use Recommended setup; let `uv` handle Python).
10. Mount HDD: `sudo mkdir /mnt/docs && sudo mount /dev/sdb1 /mnt/docs` (NTFS readable).

## REMOTE ACCESS (on-demand, dynamic IP)
- **Tailscale** = primary choice. Private mesh, no port-forward, free for personal.
  ```bash
  curl -fsSL https://tailscale.com/install/linux | sh
  sudo tailscale up   # opens URL, login, PC joins network
  # then: ssh hafizi145@<tailscale-ip> from phone/laptop
  ```
- Cloudflare Tunnel = only if a PUBLIC URL is needed (bot webhook). Avoid for private admin.

## PITFALLS (learned the hard way this session)
- **"Use an entire disk" wipes EVERYTHING on that disk.** If dual-boot intended, this is fatal to Windows. Always confirm the selected disk is the SSD, not the data HDD.
- **Ubuntu installer CANNOT resize NTFS.** Shrink Windows partition from Windows Disk Management BEFORE booting USB. The installer's Custom layout has no resize button for NTFS — only Delete/Reformat (dangerous).
- **MBR extended-partition conflict** → error: `The attempt to mount a file system with type ext4 at '/' failed. No usable device found.` Caused by creating logical ext4/swap inside an extended partition on an MBR table with Windows already using primary slots. Fix: full format (GPT) or convert to GPT (wipes all). For a Hermes-only box, just full-format.
- **Windows shows Linux partition as "RAW"** → this is NORMAL. Windows can't read ext4; it labels it RAW/Unknown. Not corruption. Ubuntu reads it fine.
- **Don't create "New Simple Volume" in Windows Disk Management** on the unallocated space meant for Ubuntu — that formats it as NTFS and breaks the plan. Leave it UNALLLOCATED; Ubuntu creates the partition.
- **Custom storage layout mount point** = select `/` (root) for the big ext4 partition. Not /boot, /home, /srv, /usr, /var, and NOT "leave unmounted".
- **GRUB stuck at "Welcome to GRUB!" (freeze, no progress)** → cause: network cable plugged in during boot → GRUB/installer attempts PXE network boot or hangs on DHCP/network scan. FIX: **unplug the LAN cable during first boot/install**, boot from disk, then plug the cable back in AFTER Ubuntu is up. This resolved a 30-min hang instantly. Confirmed session 2026-07-19.
- **26.04 boots fine but 24.04 hangs at GRUB** → Tuan experienced 26.04 booting cleanly yet 24.04 freezing at "Welcome to GRUB!". If 24.04 hangs and 26.04 worked before on the same hardware, go back to 26.04 (GPT/UEFI path). Don't force 24.04 just for "stability" if it won't boot. The "24.04 default" preference is overridden by actual boot failure.
- **Swap** doesn't boost performance (it's a RAM overflow to disk, slower). On 18GB RAM it's optional safety net. Take all free space as `/` if skipping swap.

## Azure read-only filesystem recovery (related context)
If a VPS shows 100% or Hermes hangs and `rm`/write fails with "Read-only file system":
- Root fs remounted `ro` (kernel detected ext4 error, `errors=remount-ro`).
- `mount | grep " / "` shows `ro`. `touch ~/x` fails = confirmed.
- Fix needs root console (Serial Console / direct): `touch /forcefsck && reboot`, or fsck on next boot. Cannot fix from an unprivileged shell or while mounted.

## WSL2 alternative (if PC keeps Windows)
Install WSL2 + Ubuntu inside Windows, run Hermes there. No format needed. But Windows itself eats ~3GB RAM. Good if Tuan won't commit to full Linux.

## Reference
See `references/pc-office-runbook.md` for the full step-by-step Tuan followed (i3, 18GB RAM, 512GB SSD + 320GB HDD, on-demand, Tailscale).
