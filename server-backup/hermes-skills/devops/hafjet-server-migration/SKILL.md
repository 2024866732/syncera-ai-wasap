---
name: hafjet-server-migration
description: HAFJET infrastructure migration — Azure VPS → local PC as Hermes engine. Covers read-only filesystem recovery (Azure), Ubuntu dual-boot install pitfalls (installer cannot shrink NTFS), PC-as-engine topology, and cost-aware decision making. Use when Tuan Hafizi wants to migrate Hermes/Azure workload to a local machine, fix a stuck Azure VPS, or install Ubuntu alongside Windows.
---

# HAFJET Server Migration (Azure → Local PC)

## When to use this skill
- Tuan wants to move Hermes Agent / bot workload OFF Azure VPS to a local PC (cost saving)
- Azure VPS is stuck / bot hangs / "read-only file system" errors
- Tuan is installing Ubuntu (dual-boot or fresh) and hits storage/partition screens
- Decision: buy VPS vs use existing hardware vs PC-as-on-demand-engine

## Core principle: COST-AWARE
Tuan Hafizi runs HAFJET on thin margins. Fixed costs already ~RM2,900/bln (sewa tertunggak, BSN, TNB, gaji).
- Adding VPS subscription = BAD unless necessary
- Reusing existing PC hardware = GOOD (only electricity, ~RM5-15/bln for i3 on-demand)
- PC specs beat VPS: RTX 4070 PC (32GB/3TB) >> any VPS; even i3/18GB/512GB PC >> Azure 1GB/30GB

## Topology: PC as on-demand Hermes engine
```
Tuan (browser/Telegram)
   │
   ▼
Azure VPS (small, optional relay)  ──or deprecate──►  Cloudflare Tunnel / Tailscale
   │                                                      │
   ▼                                                      ▼
PC (Ubuntu/WSL2, on-demand)  ◄── Hermes MAIN ENGINE + storage
```
- Azure kept only if already paid; otherwise terminate to save RM30/bln
- Dynamic IP solved by Cloudflare Tunnel (free) or Tailscale — no port forward

---

## PITFALL 1: Azure read-only filesystem (CRITICAL)
Symptom: bot stuck, `rm` fails with "Read-only file system", `touch` blocked.
Diagnosis:
```bash
mount | grep " / "          # look for "ro" not "rw"
touch ~/.__t 2>&1           # "Read-only file system" = confirmed ro
df -h /                     # disk may NOT be full (76% common) — ro is fs error, not capacity
dmesg | grep -iE "error|ext4|corrupt"   # often empty if kernel already remounted ro
```
Cause: kernel auto-`remount-ro` on ext4 error (`errors=remount-ro`). NOT disk full.
Fix (needs root console, NOT user shell):
- Azure Portal → Serial Console / SSH direct as root
- `touch /forcefsck && reboot`  → fsck runs at boot, remounts rw
- Verify: `mount | grep " / "` shows `rw`; `touch ~/.__t && rm ~/.__t` works
Hermes-agent shell CANNOT fix this (sudo blocked by no-new-privileges, user not root).
NEVER `rm` in ro state — it silently fails.

## PITFALL 2: Ubuntu installer cannot shrink NTFS
Symptom: Custom storage layout shows Windows partition, but NO resize/shrink button — only Save/Delete/Reformat.
Cause: Ubuntu Server live installer does NOT shrink NTFS. "Use an entire disk" = WIPES Windows.
WRONG path: "Create software RAID" / "Create volume group (LVM)" — both irrelevant for 1 SSD + 1 HDD.
CORRECT path:
1. EXIT installer (Ctrl+Alt+Del or reboot)
2. Boot back to WINDOWS
3. Windows → Disk Management → right-click C: → Shrink Volume → enter MB to free (e.g. 425000 = leave ~50GB Windows, rest to Ubuntu)
4. Reboot to Ubuntu USB → Custom layout → free space now visible → create `/` ext4
5. NEVER touch HDD with data (NTFS document drive) — Ubuntu reads NTFS fine post-install via `mount /dev/sdb1 /mnt/docs`

Dual-boot rule: Windows on SSD, Ubuntu on shrunk free space, HDD = data (untouched).
GRUB appears at boot: choose Windows or Ubuntu.

## PITFALL 3: VERIFY before denying user
Tuan stated "Ubuntu 26.04 LTS dah keluar" — agent wrongly assumed it didn't exist (training cutoff).
FIX: when user claims a version/release exists, VERIFY via web_search/web_extract BEFORE contradicting.
Result: 26.04 LTS "Resolute Raccoon" released 23 Apr 2026, confirmed via Canonical blog + Ubuntu release notes.
Hermes Agent compatible with 26.04 (multiple live deploys documented May 2026). Caveat: Python 3.14 default — let installer use `uv` (don't force system python). Known issue #32384 `hermes update` git corruption on 26.04 — use normal `hermes update`, not git path.

## Decision matrix: VPS vs PC
| Factor | Azure VPS (1GB/30GB) | PC i3 (18GB/512GB) | PC RTX4070 (32GB/3TB) |
|--------|---------------------|--------------------|-----------------------|
| Storage | 30GB (ro risk) | 512GB | 3TB |
| RAM | 1GB+swap | 18GB | 32GB |
| Cost | RM30/bln | ~RM5-15 elec | high elec (off due to bill) |
| Best for | relay only | on-demand engine | 24/7 local LLM |

Recommendation: use existing PC, deprecate Azure. On-demand (boot when needed) to save electricity.

## Runbook template (PC Office → Ubuntu 26.04 + Hermes)
See references/pc-office-runbook.md for full step-by-step (already drafted for Tuan Hafizi's i3/18GB/512GB+320GB HDD case).

## User preferences observed
- Kelantan dialect casual, technical when executing
- Concise tables/bullets, hates overexplaining
- Pastes secrets, warns before setup
- No curl|python3, no heredoc, no shell redirect in terminal (write .py to /tmp)
- Long/irreversible ops need SEPARATE approval; silence ≠ consent (timeout = blocked)
- WSL2 previously used on gaming PC; PC off due to electricity bill → migrated to VPS → VPS ro-broken → back to PC
