# systemd Worker Service — Auto-Restart After Reboot

The default `nohup + disown` daemonisation does NOT survive a system reboot.
When the office PC restarts (OS update, power cycle, kernel panic), any worker
started with `nohup` is lost. The only way to detect the gap is a cron health
check that reports "process not running".

## Solution: systemd user service or system service

### Option A: System-level service (requires sudo)

**Create unit file:** `/etc/systemd/system/cctv-worker.service`

```ini
[Unit]
Description=HAFJET CCTV Worker – Person Detection Daemon
Documentation=https://github.com/diegosouzapw/OmniRoute
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hafizi145
WorkingDirectory=/home/hafizi145/projects/hafjet-cctv-worker
ExecStart=/home/hafizi145/projects/hafjet-cctv-worker/.venv/bin/python -m app.main
Restart=on-failure
RestartSec=10
StandardOutput=append:/tmp/cctv-worker.log
StandardError=append:/tmp/cctv-worker.log

[Install]
WantedBy=multi-user.target
```

**Key directives:**
- `Restart=on-failure` — auto-restart if the process exits with non-zero code
- `RestartSec=10` — wait 10 seconds before restarting (prevents thrash)
- `After=network-online.target` — wait for network before starting (critical for RTSP)
- `WorkingDirectory` — sets the Python module search path for `-m app.main`

**Lifecycle commands:**
```bash
sudo systemctl daemon-reload          # reload after creating/editing unit file
sudo systemctl enable cctv-worker     # enable auto-start on boot
sudo systemctl start cctv-worker      # start now
sudo systemctl status cctv-worker     # check status (running, enabled, uptime)
sudo systemctl stop cctv-worker       # stop gracefully
sudo systemctl disable cctv-worker    # remove auto-start on boot
```

**Logs:**
```bash
# Primary: systemd journal (captures stdout/stderr even if file rotation happens)
journalctl -u cctv-worker -n 100 --no-pager

# Secondary: /tmp/cctv-worker.log (the app writes here via StandardOutput=append:)
tail -f /tmp/cctv-worker.log

# Follow logs live
journalctl -u cctv-worker -f
```

**Resource limits (optional):**
Add these under `[Service]` to prevent the worker from using too many resources:
```ini
CPUQuota=80%                # max 80% of one core
MemoryMax=500M              # max 500 MB RSS
MemoryHigh=400M             # soft limit (triggers reclaim before hard limit)
```

### Option B: User-level systemd service (no sudo)

If sudo is not available, create `~/.config/systemd/user/cctv-worker.service`
with the same content (omit `User=`). Enable/start with `--user`:

```bash
systemctl --user daemon-reload
systemctl --user enable cctv-worker
systemctl --user start cctv-worker
systemctl --user status cctv-worker
```

Note: user services are tied to the user session and stop when the user logs out.
Use `loginctl enable-linger hafizi145` to keep user services alive after logout.

## Migration from nohup to systemd

```bash
# 1. Kill existing nohup instance
pkill -f 'python -m app.main'

# 2. Create the unit file (use Option A content above)
sudo nano /etc/systemd/system/cctv-worker.service

# 3. Enable + start
sudo systemctl daemon-reload
sudo systemctl enable cctv-worker
sudo systemctl start cctv-worker

# 4. Verify
sudo systemctl status cctv-worker
journalctl -u cctv-worker -n 20 --no-pager
```

## Detection after reboot: gap analysis

To detect whether the worker was down (due to reboot or crash) without
running a full health check, inspect event timestamps:

```bash
# Get the latest event timestamp
curl -s http://127.0.0.1:8091/api/events?limit=1 | python3 -c \
  "import sys,json; e=json.load(sys.stdin)['events'][0]; print(e['occurred_at'])"

# Compare with current time. Gap >1 hour + no crash logs = probable reboot.
```

If the worker has been down for hours, events will have stopped at the
last detection before the shutdown. After restart, detection resumes
immediately (cooldown resets to zero). The first post-restart event is
especially high-confidence because the cooldown state starts fresh.

**Cron health checks cannot restart a dead worker** — they can only report
the failure. Systemd is the proper solution for automatic recovery.
