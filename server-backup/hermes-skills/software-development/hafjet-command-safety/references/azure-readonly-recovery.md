# Azure Read-Only Filesystem Recovery Runbook

## Symptom (what Tuan sees)
- Hermes bot "stuck", needs direct VPS terminal to do anything
- `df -h /` shows ~76% used (NOT actually full)
- Any `rm` / `touch` / `npm cache clean` fails with:
  `rm: cannot remove '...': Read-only file system`
- NOT a permission-denied error — every single file is read-only

## Root cause
ext4 mounted with `errors=remount-ro`. When the kernel detects a filesystem
error (bad block, unclean shutdown, Azure hypervisor hiccup), it remounts
the root fs read-only to prevent further corruption. This is protective, not
a storage problem.

## Confirm (run from Hermes terminal — safe, read-only)
```bash
mount | grep " / "
# EXPECT: /dev/sda1 on / type ext4 (ro,relatime,discard,errors=remount-ro)
#        /dev/sda1 on /root type ext4 (ro,...)   <- the 'ro' is the smoking gun

touch ~/.__writetest 2>&1
# EXPECT: touch: cannot touch '/home/hafizi145/.__writetest': Read-only file system

df -h /
# Shows used% but WRITE is blocked regardless
```

## Fix (ROOT REQUIRED — Hermes user CANNOT do this)
Hermes runs as `hafizi145` (UID 1000). `sudo` is blocked by the
`no-new-privileges` container flag. fsck also cannot run on a mounted fs.
You MUST use Azure Serial Console (Portal → VM → Serial Console) or SSH as
root (Azure provides root on the direct console).

### Step 1 — force fsck on next boot
```bash
touch /forcefsck
reboot
```
Azure Serial Console will show fsck running during boot. Wait for login prompt.

### Step 2 — verify writable after reboot
```bash
mount | grep " / "
# MUST show "rw" now (not "ro")

touch ~/.__test && echo "WRITE OK" && rm ~/.__test
```

### Step 3 — once rw, run the deferred cleanup
Only NOW can Hermes (or Tuan) safely:
- `rm -rf ~/.npm/_cacache`  (1.4G npm cache, safe to rebuild)
- `apt clean`  (root: `sudo apt clean` on direct console)
- compact `~/.hermes/state.db`

## Prevention
- Azure occasionally hits hypervisor-level fs errors. If this recurs, consider
  moving heavy write workloads (Hermes cache, logs) to the PC-office Ubuntu
  box (256GB) instead of the 30GB Azure disk.
- A monitoring cron that alerts on `mount | grep " ro,"` would catch this
  before the bot fully hangs.
