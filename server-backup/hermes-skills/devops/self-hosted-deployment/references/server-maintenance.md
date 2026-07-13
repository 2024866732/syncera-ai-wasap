# Server Maintenance & Cleanup

## Weekly Cleanup Script

Small VPS servers (1GB RAM, 29GB disk) accumulate logs, journal entries, and caches that slowly eat disk space. A weekly cron job keeps root disk below ~80% without micromanagement.

### Script: `/usr/local/bin/hafjet-clean.sh`

Safe-mode cleanup targeting:
- APT cache & orphaned packages
- systemd journal (vacuum to 7 days / 500MB max)
- `/var/log` rotated/compressed archives (.gz, .1 files)
- Truncate active logs (syslog, kern.log, auth.log) — keeps files, zeros content
- `/tmp` and `/var/tmp` files older than 7 days
- User-level caches (`~/.cache`)

```bash
#!/bin/bash
echo "=== HAFJET Hermes Server Cleanup (SAFE MODE) ==="
echo "Date: $(date)"

# 1) APT cache
sudo apt-get autoremove -y && sudo apt-get clean && sudo apt-get autoclean -y

# 2) Journal vacuum
sudo journalctl --vacuum-time=7d
sudo journalctl --vacuum-size=500M

# 3) Rotated logs
sudo find /var/log -type f -name "*.gz" -delete
sudo find /var/log -type f -name "*.1" -delete
for LOGFILE in /var/log/syslog /var/log/kern.log /var/log/auth.log; do
  [ -f "$LOGFILE" ] && sudo truncate -s 0 "$LOGFILE"
done

# 4) Temp files
sudo find /tmp -type f -mtime +7 -delete
sudo find /var/tmp -type f -mtime +7 -delete

# 5) User cache
rm -rf "$HOME/.cache/"* 2>/dev/null

df -h
```

### Cron Setup

```bash
sudo cp hafjet-clean.sh /usr/local/bin/hafjet-clean.sh
sudo chmod +x /usr/local/bin/hafjet-clean.sh
sudo touch /var/log/hafjet-clean.log && sudo chmod 644 /var/log/hafjet-clean.log

# Add to root crontab — Sundays 3am (low-load window)
(sudo crontab -l 2>/dev/null; echo "0 3 * * 0 /usr/local/bin/hafjet-clean.sh >> /var/log/hafjet-clean.log 2>&1") | sudo crontab -
```

### Post-Cleanup Verification

```bash
df -h                                    # root should be <80%
sudo tail -50 /var/log/hafjet-clean.log  # confirm no errors
```

### When Disk Still >80% After Cleanup

```bash
sudo du -sh /* 2>/dev/null | sort -hr | head -10   # find large dirs
ncdu /                                               # interactive explorer (if installed)
```

Typical space hogs on Hermes servers:
- `~/.cache/` (pip, npm, uv caches)
- `~/hermes-agent/venv/` (Python venv)
- `/var/log/journal/` (systemd logs)
- PostgreSQL WAL: check `pg_wal/` in data dir

### Upgrade Triggers

When to consider larger VPS:
- Hermes running multiple heavy skills concurrently (OCR + YouTube + PowerPoint + ArXiv)
- PostgreSQL DB growing past 1GB
- Swap usage consistently >50%
- Disk >80% even after cleanup

Typical path: 1GB RAM + 4GB swap → 2GB RAM + 4GB swap → 4GB RAM
