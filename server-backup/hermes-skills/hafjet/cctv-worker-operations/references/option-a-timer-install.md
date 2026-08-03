# Option A timer install (TTY sudo handoff)

## Why the agent often cannot finish install
Office PC sudoers for hafizi145 typically allow only:
- `/usr/bin/systemctl restart cctv-worker`
- `/usr/bin/systemctl status cctv-worker`

Installing units needs write to `/etc/systemd/system/` + `daemon-reload` + `enable --now` → **password TTY**. BatchMode SSH returns `sudo: A terminal is required to authenticate`.

## Agent duties before handoff
1. Write unit files under `~/projects/hafjet-cctv-worker/systemd/` (agent-writable).
2. Do **not** pretend timer is active if `list-timers` has no `cctv-worker-restart`.
3. Give Tuan Hafizi the exact four sudo commands (copy/paste).
4. After he runs them, verify only: `systemctl list-timers --all | grep cctv-worker-restart` and `systemctl is-enabled cctv-worker-restart.timer`.

## Calendar (A1)
`OnCalendar=*-*-* 00,06,12,18:00:00` UTC → MYT 08:00, 14:00, 20:00, 02:00.
`Persistent=true` + `RandomizedDelaySec=300`.

## LIVE status (verified 2026-08-03)
- **systemd timer ENABLED** in `/etc/systemd/system/cctv-worker-restart.{service,timer}` (user TTY sudo install).
- **User crontab path removed** after timer install — do not re-add while timer is enabled (double restart risk).
- Leftover wrapper may still exist at `~/.local/bin/cctv-worker-scheduled-restart.sh` but is inert if not in crontab.
- Verify: `systemctl list-timers --all | grep cctv-worker-restart` and `systemctl is-enabled cctv-worker-restart.timer`.

## Historical fallback only (if `/etc` timer missing)
NOPASSWD covers worker restart/status. Temporary user crontab + wrapper was used once before `/etc` install:

```cron
0 0,6,12,18 * * * /home/hafizi145/.local/bin/cctv-worker-scheduled-restart.sh >> /mnt/cctv/logs/cctv-worker-scheduled-restart.log 2>&1
```

Prefer restoring **systemd timer** over long-term cron when TTY sudo is available.

## Do not
- Use timer enable as a substitute for an approved one-shot Option C code-load restart (those are separate).
- Expand sudoers without explicit separate approval.
- Leave both crontab and `/etc` timer enabled at once.
