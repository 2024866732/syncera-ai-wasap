---
name: hafjet-command-safety
description: HAFJET-Hermes-Server command-execution SOP. Banned patterns (curl|python3, heredoc, .env redirection) and the safe alternatives Tuan Hafizi requires before any terminal work.
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Server Command Safety SOP

Tuan Hafizi enforces a strict command-approval security policy on the
HAFJET-Hermes-Server (Azure, Ubuntu). Violating it gets the command **DENIED**
and wastes a turn. Internalize this before proposing ANY terminal command.

## BANNED patterns (will be denied — do NOT propose them)

- `curl ... | python3 -c "..."`
  Pipes network output straight into the interpreter. HIGH risk (injection /
  credential exfiltration). Classed same as `curl | sh`.

- `python3 << 'EOF' ... EOF`
  Agent-supplied heredoc script executed on the server. Flagged as arbitrary
  script execution — agent is running code Tuan didn't review.

- `cat >> ~/.hermes/.env` or ANY redirection writing to a dotfile
  (`~/.hermes/.env`, `~/.bashrc`, `~/.config/**`). Agent must NEVER write
  secrets or config. Hidden lines in an approval prompt = invisible edits.

- **Python script writing to .env** (e.g. `open('/path/.env','a').write(...)`)
  Writing to `.env` via a Python script from `/tmp/` is NOT safe — it achieves
  the same outcome as shell redirection without Tuan reviewing the secret being
  written. The intent of the rule is: **Agent never modifies .env by any
  means.** The suggested `KEY=VALUE` line goes in the response text; Tuan adds
  it via `nano ~/.hermes/.env`.

- Any shell redirection that writes credentials/tokens to a file
  (e.g. `echo TOKEN > file`, `curl -d @file` with secrets in history).

## REQUIRED alternatives (safe form)

- **Parse API output:** write a `.py` script to `/tmp/` (or a project dir)
  with `write_file`, THEN run `python3 /tmp/script.py`. No pipe, no heredoc.
- **Fetch then inspect:** `curl -s URL -o /tmp/file.json` (save to file),
  then parse with a SEPARATE script that reads the file — never `curl | python3`.
- **Edit `.env`:** AGENT SUGGESTS the exact `KEY=VALUE` lines; Tuan edits
  manually via `nano ~/.hermes/.env`. Agent never writes there.
- **Dotfile config:** tell Tuan the exact key=value to add; he applies it himself.
- **Test external API:** Tuan can run `curl -X GET ...` himself, or agent writes
  a `.py` file that reads token from env and prints result — Tuan runs it.

## Why this matters

- Server runs production-ish HAFJET infra (Loyverse POS, WhatsApp Cloud bot,
  Gmail). A bad pipe or leaked token is hard to undo.
- Tuan wants to SEE and APPROVE every script before it runs. Agent generates;
  Tuan executes/edits. This is the standing SOP — not a one-off.
- Hermes redacts secrets in tool output by default. Do NOT disable redaction,
  and do NOT paste tokens into chat. Have Tuan run token-bearing commands himself.

## Approval gate summary

| Pattern | Verdict |
|---------|---------|
| `curl \| python3 -c` | ❌ DENY |
| `python3 << 'EOF'` | ❌ DENY |
| `cat >> ~/.hermes/.env` | ❌ DENY |
| Write `.py` to file → run manually | ✅ OK |
| `curl -s URL -o /tmp/f.json` then parse | ✅ OK |
| Suggest `.env` lines, Tuan edits | ✅ OK |

## When Tuan says "deny"
Do not retry, rephrase, or achieve the same outcome another way. Stop the
workflow, explain what you would have done, and wait for Tuan to apply it
manually or redirect you.

## Azure VPS safe-cleanup pitfalls (learned 2026-07-19)

Server = Azure Ubuntu, user `hafizi145` (UID 1000), **NOT root**. These bit us:

- **`sudo` is blocked** by the `no-new-privileges` container flag. Any
  `sudo apt clean` / `sudo rm` is denied. System paths (`/var/cache/apt`,
  `/var/log`) owned by root CANNOT be cleared from Hermes. Hand those to Tuan
  to run on the direct VPS terminal as root (Azure provides root access there).
- **`npm` binary is NOT on PATH** and not in `~/.hermes/npm-global/bin`
  (only `ctx7` + `n8n` symlinks live there). Do NOT call `npm cache clean`.
  The real npm cache is at **`~/.npm/_cacache` (~1.4G)**. Safe to `rm -rf`
  (rebuilds on next npm use) BUT see the delete gate below.
- **`~/.hermes/npm-cache` (~900M)** is the Hermes-internal npm-global cache —
  NOT the same as `~/.npm`. Treat per Tuan's "do not touch" list.
- **`/tmp` is a tmpfs (RAM)** — clearing it frees RAM, NOT root disk. `df -h /`
  won't move. Still worth doing for swap pressure on the 1GB-RAM box.

### Disk-tight diagnostic recipe (safe, read-only first)
```
df -h /                          # root disk
du -h --max-depth=1 / 2>/dev/null | sort -rh | head   # top dirs
du -sh ~/.hermes/*               # Hermes breakdown
du -sh ~/.npm                    # real npm cache
free -h ; swapon --show          # RAM/swap pressure
```
Run these BEFORE proposing any delete. Never delete based on a guess.

### Destructive-delete gate (extends the standing SOP)
Even a reversible cache delete (`rm -rf ~/.npm/_cacache`) is a destructive
action. The agent MUST self-block and request **explicit separate approval**
("yes delete npm cache") BEFORE running it — do not wait for the user to deny.
Tuan's rule: no delete without a standalone approval each time, even for
safe-to-rebuild caches. If the command would have been DENIED anyway, stop
and wait.

### READ-ONLY FILESYSTEM — the real "disk full" cause (learned 2026-07-19)
If `rm`/`touch` fail with **"Read-only file system"** on EVERY file (not
permission denied), the root fs has been remounted read-only by the kernel
(ext4 `errors=remount-ro`). This is the ACTUAL cause of the "bot stuck / disk
full" symptom — NOT a full disk. `df -h` may show only 76% used.

**Diagnostic (safe, read-only):**
```bash
mount | grep " / "          # look for "ro" not "rw"
touch ~/.__t 2>&1 && echo OK || echo "WRITE BLOCKED"
dmesg 2>/dev/null | grep -iE "error|read-only|ext4|corrupt" | tail
```
If `mount` shows `ro` and `touch` is blocked → read-only fs confirmed.

**Recovery (NEEDS ROOT — cannot be done from Hermes user session):**
Hermes runs as `hafizi145` (UID 1000), sudo blocked. Fix requires Azure
Serial Console / direct VPS terminal as root:
```bash
touch /forcefsck && reboot     # fsck runs on next boot
# after reboot:
mount | grep " / "             # must show "rw"
touch ~/.__t && echo "WRITE OK" && rm ~/.__t
```
Hand this to Tuan — do NOT attempt `rm`/`fsck` from Hermes (they fail). Full
runbook with confirm/fix/prevention steps: `references/azure-readonly-recovery.md`.

### Verify-before-assert rule (learned 2026-07-19)
Do NOT assert a fact about external availability (OS versions, package
existence, API status) from memory alone. When Tuan says "it exists on the
official site", VERIFY via web_search / web_extract before contradicting.
Ambo wrongly told Tuan "Ubuntu 26.04 doesn't exist yet" — it was released
23 Apr 2026 (LTS, "Resolute Raccoon"). Tuan was right. Always confirm
external facts with a live fetch when there is disagreement.

## Hardware-spec discovery rule (learned 2026-07-19)
When planning a deployment onto user hardware, DO NOT lock assumptions from
an early off-hand mention. Tuan's PC office spec evolved across the session:
"i5/8GB/256GB" → "i3" → "512GB SSD + 320GB HDD" → "18GB RAM" →
"Windows on SSD, docs on HDD". Always ask for explicit spec BEFORE writing a
runbook, and re-confirm if the user corrects any detail. Write the FINAL
confirmed spec at the top of any runbook file.

## Dual-boot / installer safety (learned 2026-07-19)
When installing Ubuntu on a machine with existing Windows:
- In the installer "Storage configuration" screen, **NEVER pick "Use an
  entire disk"** — that formats the whole SSD including Windows. Pick
  **"Manual"** and create `/` only on pre-shrunk FREE SPACE.
- Shrink Windows partition FIRST (Disk Management → Shrink Volume ~150GB)
  before booting the USB, OR use Ubuntu live "Try" + gparted.
- **HDD with user data: do NOT touch / format.** Mount post-install to read
  NTFS docs directly (`sudo mount /dev/sdb1 /mnt/docs`).
- Network screen: leave both `ens33` (ethernet) and `wlo1` (wifi) ON; don't
  disable ethernet. Select `wlo1` only if connecting via WiFi (needs SSID+pw).
- Always TICK "Install OpenSSH server" — without it, no remote access.

## Cross-reference
For the full on-prem PC → Azure replacement plan, Ubuntu 26.04 + Hermes
compatibility verification, and the on-demand hybrid topology, see
`hafjet-deployment-plan` → `references/on-prem-pc-replacement.md`.
