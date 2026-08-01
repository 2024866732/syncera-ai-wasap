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

  **Security scanner enforcement:** Even if both agent and user approve the
  command in chat, Hermes' `tirith` security scanner may BLOCK it at runtime
  with `"[HIGH] Pipe to interpreter: curl | python3"` and the command
  exits with -1. This is NOT a bypass — do NOT retry, rephrase, or try
  another pipe variant. The ONLY working pattern (Tuan confirmed Jul 2026):
  1. `curl -s URL -o /tmp/file.json` (save response to file)
  2. `python3 /tmp/script.py` (read file, parse JSON) — SEPARATE turn, no pipe.

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
- **API key pasted in chat:** If Tuan pastes a key/token, warn immediately —
  it's now exposed. Proceed with setup if needed, but after completion
  instruct Tuan to **rotate/regenerate** the key from the provider dashboard.

## Why this matters

- Server runs production-ish HAFJET infra (Loyverse POS, WhatsApp Cloud bot,
  Gmail). A bad pipe or leaked token is hard to undo.
- Tuan wants to SEE and APPROVE every script before it runs. Agent generates;
  Tuan executes/edits. This is the standing SOP — not a one-off.
- Hermes redacts secrets in tool output by default. Do NOT disable redaction,
  and do NOT paste tokens into chat. Have Tuan run token-bearing commands himself.

## Approval-bounded execution (HAFJET orchestration)

When Tuan approves a numbered command list or a narrowly scoped phase, treat that approval as an immutable execution boundary:

1. Run the approved commands **in order** and keep each command separate so an error has a clear stop point.
2. Do not add convenience, cleanup, retry, diagnostic, SSH, or follow-up commands that are not explicitly in the approved list.
3. If any approved command exits non-zero, **stop immediately**. Report the exact command, exit code, and sanitized output; do not attempt an alternative verification/fix until Tuan approves a new plan.
4. Before applying, reconcile the plan: every required verification or synthetic-record action must appear in the approved command list. If the plan requires an unlisted action, raise the mismatch before implementation rather than silently adding it.
5. Temporary files are still writes/deletes. Prefer a unique temporary path created only within approved scope; never prepend `rm -f` merely for convenience.

### TDD expected-RED exception

A test-first plan may deliberately include one non-zero **RED** test run before its implementation file exists. Treat it as an allowed continuation point **only when all three conditions are explicit in the approved plan and approval message**:

1. The exact command/order and expected non-zero exit are named.
2. The expected failure signature/reason is named (for example, verifier script absent).
3. The user explicitly authorizes continuing to the next numbered command after that RED result.

Report the RED result as evidence, then continue only with the already-approved next command. Any other non-zero exit, wrong failure signature, or verifier result such as `FAILED`, `DATABASE_ERROR`, or `DATABASE_MISSING` remains a hard stop requiring a new plan. Never infer this exception from a generic approval phrase.

### Sanitized remote-audit contract

For an approval-gated **read-only** audit of a remote HAFJET worker:

1. Verify the live ED25519 host key against Tuan's trusted fingerprint **before** SSH. A temporary `known_hosts` file on the VPS is a write and must be explicitly listed/tagged; use `StrictHostKeyChecking=yes` for the audit connection.
2. Define an allowlist of report fields before running the remote command. Prefer mount UUID/FSTYPE/capacity, file mode/owner/size/mtime, executable path, and package version. Never print config bodies, service `ExecStart`, environment variables, raw stderr, recipient files, or private-key material.
3. Model missing non-destructive prerequisites (for example absent external mount, encryption binary, or version metadata) as bounded status fields in an otherwise-zero audit command. They are implementation blockers for the next phase, not permission to install, mount, create folders, or recover automatically.
4. Do **not** infer a service's actual Python runtime solely from `/proc/<pid>/exe`: process supervisors/launchers (such as `uv`) can occupy that path. If it resolves to a launcher rather than a verified Python interpreter containing the service package, report `RUNTIME_PYTHON_UNRESOLVED`; do not expose `ExecStart` just to guess.
5. When a service-bound runtime resolver is explicitly approved, use a bounded chain only: read `systemctl --user show <service> -p MainPID --value`; read `/proc/<pid>/cwd` without printing it; accept **only** `<service-cwd>/.venv/bin/python` if executable; run `PYTHONDONTWRITEBYTECODE=1 <candidate> -c 'from importlib.metadata import version; print(version("<package>"))'` with stderr suppressed. Print only `RESOLVED`, the absolute candidate path, and distribution version. If any link is absent, return one `UNRESOLVED` status—never scan alternative venvs, use `uv`, or inspect `ExecStart`, command lines, environment, YAML, or logs.
6. If audited output contains a possible secret marker (`api_key`, `master_key`, `token`, `salt`, `sk-`, `ak_`, `password`), stop. Do not retransmit, redact in-place, delete artifacts, or rerun a broader command without a new approval.
7. A config-only encrypted backup may explicitly waive an unresolved application runtime/version **only when Tuan approves that exception in the policy**. The backup must then omit runtime/version fields entirely and still verify every non-runtime gate: fixed config path, actual external mount, pinned UUID **and FSTYPE**, non-world-accessible destination, `age`, a public-recipient-only file, and sanitized metadata. Runtime unresolved is never permission to guess a Python path or change the service.

For a reusable systemd unit/start-command classification and conservative service-CWD runtime-pinning method, see `references/sanitized-systemd-runtime-audits.md`. For the config-only encrypted-backup exception/gates, see `references/config-only-encrypted-backup-gate.md`.

### Multi-node job orchestration (VPS + light/heavy workers)

VPS = always-on gateway + job registry + API. Workers (PC Office light, GPU node heavy) = on-demand pollers.

**Core pattern (2026-07-31 session):**
- VPS exposes:
  - `POST /register-node` (heartbeat with capabilities/resources).
  - `GET /jobs?node_id=...&tag=light|heavy&status=pending`.
  - `POST /jobs` (create job from trigger; supports explicit target_node + tags).
  - `POST /jobs/{job_id}/result` (worker submits outputs/metrics/error).
- Workers poll the VPS API (Tailscale). Never push from VPS to sleeping nodes.
- File-based verification only: `curl -s -o /tmp/xxx.json URL` then separate `python3 -c 'import json; ... Path("/tmp/xxx.json")'` (avoids `curl | python3` blocks).
- Classify at create time (task_name + payload keywords → tag + target_node). Heavy jobs only to GPU node when online.
- Health: VPS timer curls remote `/health` (e.g. PC Office :9090) → updates workers.status (online/offline/degraded). Do not route to offline nodes.
- Systemd on VPS:
  - `hafjet-orchestrator-api.service` (Restart=always) for the polling API.
  - `xxx.timer` + `xxx.service` for monitors (health every 2m, retention daily).
- Retention: `retention_cleanup.py` deletes completed/failed jobs + events after RETENTION_DAYS (default 30). Run via timer.
- Real vs sim: Keep `simulate_*.py` for local testing. Deploy `real_*_poller.py` (or equivalent) inside the target Hermes worker on the node. The poller must handle dispatch → run → submit_result, with graceful degradation if VPS unreachable.

**Job record minimum fields (SQLite):**
job_id, type, tags, target_node, task_name, payload, status (pending/dispatched/running/success/failed), created_utc, completed_utc, result (JSON), error, node_id, retry_count, last_error.

**Approval & safety gates (extends existing):**
- Every new service/timer requires separate approval.
- New worker script on remote node: review + explicit "deploy to <node>" approval.
- When creating heavy job while GPU node offline: job is created as pending but routing is blocked; log "BLOCKED_NODE_OFFLINE".
- Always verify worker status (mark_offline_if_stale) before returning jobs in GET /jobs.

See `references/multi-node-job-orchestration.md` for exact API examples, poller skeleton, systemd units, and retention script.

### Portable verification and artifact-permission rule

When writing an approval-gated infrastructure plan, verification must be runnable using tools already guaranteed by the plan's runtime. Do not make a core verification gate depend solely on an optional CLI binary. For SQLite-backed Python tooling, the portable default is a **read-only Python `sqlite3` module** check using `file:<absolute-path>?mode=ro` with `uri=True`, followed by `PRAGMA query_only = ON`; it must print to stdout only and create no report/log/database artifact.

For every planned file created by a program (especially SQLite databases), list its final permission explicitly in the approved command set and verify it afterwards. Directory/file creation modes do not automatically govern artifacts created later by another process. Do not silently correct an unexpected mode: report it and obtain a separate approved correction plan.

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

### Office PC sudo gate (learned 2026-07-24)

The HAFJET office PC (Ubuntu 26.04, `hafjet-pc-office` at 100.121.94.41) has a
different sudo configuration from the Azure VPS:

- **`sudo` requires a terminal (TTY)** for password authentication. Any
  `sudo ...` command run via non-interactive SSH will fail with:
  `sudo: A terminal is required to authenticate`
  
- **DO NOT retry** sudo commands with `ssh -t` or pipe passwords. Instead,
  provide the exact commands for Tuan Hafizi to run directly at the office
  PC terminal.

- This applies to: `sudo systemctl daemon-reload/restart/enable/start`,
  `sudo tee /etc/systemd/system/...`, `sudo sed -i ...` on system files.

- **Safe pattern:** Agent shows the commands in chat. Tuan runs them at
  the physical terminal (or via SSH with `-t` flag). Agent then verifies
  results with read-only checks (`systemctl status`, `journalctl`, `curl`).

- **Distinction from Azure VPS:** Azure VPS blocks sudo via container
  `no-new-privileges` flag (different root cause). Office PC only blocks
  it due to TTY requirement — `sudo` works fine when run interactively.

### Scheduled service automation scope check

Before proposing or applying a scheduled restart/containment timer on an Office PC:

1. Verify the privilege boundary first: system units under `/etc/systemd/system/` require root for file installation and `systemctl daemon-reload`; a narrow NOPASSWD allowlist for one `systemctl restart` command does **not** grant those setup operations.
2. Do not bypass an Office-PC TTY sudo requirement with `ssh -t`, password pipes, or a privilege workaround. Stage reviewed artifacts and give Tuan the direct-terminal steps when root installation is required.
3. A `systemctl --user` timer is not automatically equivalent. Verify whether it survives logout/reboot before presenting it as containment; otherwise label it temporary/non-reliable instead of silently deploying it.
4. A restart safety valve must log a sanitized timestamp and `MemoryCurrent` **before** restart, use an explicit operation window, and set `Persistent=false` where missed off-hours must not catch up.
5. Automatic-restart approval is a narrow written exception: record cadence, window, log path, and disable procedure. It does not authorize unrelated restarts.

### CCTV state-sensitive restart gate (learned 2026-07-28)

CCTV-worker restarts are **state-changing operations**, not a routine follow-up to a code edit:

1. **Explicit approval is mandatory for every restart.** Approval to inspect, patch, syntax-check, or save code is never approval to run `restart-cctv.sh`, `systemctl restart`, reload, or an equivalent service reset.
2. During RSS/leak, time-series, camera-stability, or other state-sensitive monitoring, a restart resets the evidence baseline. Do not restart until the approved observation window is complete, unless Tuan Hafizi explicitly authorizes immediate relief for a confirmed worsening condition.
3. Separate the workflow into auditable gates: **backup → code edit → syntax/import check → source proof → user review → separate restart approval → one restart → live verification**. A successful `py_compile` only validates source syntax; it does not load the changed service code.
4. If several approved changes are pending, wait for explicit instruction to perform **one combined restart**; do not restart after each small patch.
5. Before an approved restart that will end a monitor, capture and report the current tracker samples, start time, elapsed duration, RSS/peak, and relevant event/inference correlation. After restart, start a new tracker with a clearly labelled new baseline; never mix pre- and post-restart samples.
6. A user may grant a narrow written exception for a temporary scheduled restart. Treat it as containment only: encode its exact cadence/window/log fields, keep it disabled until separately approved for installation, and remove/disable it when the permanent remediation is accepted. It does not create a general auto-restart permission.

### Bundled delete + install pitfall (learned 2026-07-20)
Do NOT chain a destructive delete with a long-running install in ONE command,
e.g. `rm -rf ~/.cache/pip ~/xiaozhi-server/.venv && python3 -m venv .venv && pip install ...`.
This session it hit the approval/timeout gate and was **BLOCKED as a whole** —
the delete never ran, the venv was never created, state was left exactly as
before. That is correct safety behavior; do NOT retry or rephrase it. Instead:
(1) get a standalone approval for the delete alone, run it, confirm it worked;
(2) THEN run the install as a separate command in a later step. Keep destructive
ops and setup ops in SEPARATE turns.

### Targeted-cleanup rule (extends the destructive-delete gate)

When cleaning test artifacts (snapshots, database files, logs):

1. **NEVER use wildcard deletes** under data directories (`/mnt/cctv/snapshots/*`, `/mnt/cctv/db/*`, `/mnt/cctv/logs/*`). Always specify exact filenames to delete.
2. **List each file explicitly** in the `rm` command — do not use `*` globs.
3. **Remove SQLite WAL/SHM siblings** alongside the main `.db` file (`.db-shm`, `.db-wal`).
4. **Separate delete from create** — do not chain `rm -f` with `mkdir` or service restart in the same command. Each destructive operation needs its own approval turn.
5. **Report before and after** — show `ls -lh` output both before and after cleanup to confirm only the intended files were removed.

Rationale: Tuan caught and blocked `rm -f /mnt/cctv/snapshots/*.jpg` during a July 2026 session and redirected to explicit-file-only cleanup.

### Kudu ZIP API root overwrite (learned 2026-07-28)

**BANNED:** `curl -X PUT "https://APP.scm.azurewebsites.net/api/zip/site/wwwroot/<subdir>/" --data-binary @file.zip`

The Kudu ZIP API at `/api/zip/site/wwwroot/<any-path>/` treats the target as the **extraction root**, not a subdirectory. It deletes everything in `/site/wwwroot/` before extracting the ZIP. Even if the ZIP contains only dashboard assets, the API first clears the entire parent directory.

**Incident (2026-07-28):** Deploying `dashboard/dist/` via ZIP API wiped `webhook_listener.py`, `db_logger.py`, `requirements.txt`, `start.sh`, and all other backend files. App crashed to 503. Recovery required manual VFS PUT of 7 backend files + `start.sh` recreation + restart.

**Safe alternative for dashboard assets:** file-by-file VFS PUT with `If-Match: *`, updating `index.html` last for atomic switch:
```bash
for f in dist/index.html dist/assets/*; do
  rel=${f#dist/}
  curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: *" \
    --data-binary @"$f" "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/$rel"
done
```

**Rule:** ZIP API is for **full-site deploys only** (use `az webapp deployment source config-zip` or the root `/api/zip/site/wwwroot/`). Never target a subdirectory. Dashboard = static assets, deploy via VFS file-by-file.

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

### Hardware-spec discovery rule (learned 2026-07-19)
When planning a deployment onto user hardware, DO NOT lock assumptions from
an early off-hand mention. Tuan's PC office spec evolved across the session:
"i5/8GB/256GB" → "i3" → "512GB SSD + 320GB HDD" → "18GB RAM" →
"Windows on SSD, docs on HDD". Always ask for explicit spec BEFORE writing a
runbook, and re-confirm if the user corrects any detail. Write the FINAL
confirmed spec at the top of any runbook file.

### Dual-boot / installer safety (learned 2026-07-19)
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

### Cross-reference
For the full on-prem PC → Azure replacement plan, Ubuntu 26.04 + Hermes
compatibility verification, and the on-demand hybrid topology, see
`hafjet-deployment-plan` → `references/on-prem-pc-replacement.md`.
