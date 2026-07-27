# D.3–D.6 final operation and security notes

## Final feature state

- **D.3 Dashboard**: date filtering, CSV export, UTC + MYT presentation.
- **D.5 Face crop**: Haar cascade crop on high-confidence person events; 30-day retention timer at `20:00 UTC` (`04:00 MYT`).
- **D.6 Face attributes**: CPU OpenCV DNN age/gender inference only after face crop succeeds. Display-only estimates; dashboard must label columns `Gender (est.)` and `Age (est.)` and expose tooltip text `AI estimate, ±5 years accuracy`.
- No recognition, identity matching, embeddings, watchlists, or biometric database.

## Honest reporting and closure gate

1. Do not call a feature closed from source inspection alone.
2. Before closure, verify real endpoint output, real worker logs, and actual data records.
3. State separately: **proposed**, **applied**, **restarted**, and **verified**.
4. When remote access is unavailable, report that limitation; never substitute historical or inferred output for a current command result.

## Scoped systemctl sudo rule

The Office-PC sudoers rule is intentionally exact and narrow:

```sudoers
hafizi145 ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart cctv-worker, /usr/bin/systemctl status cctv-worker
```

Verification must use exact matching commands with no additional arguments:

```bash
sudo -n /usr/bin/systemctl status cctv-worker
sudo -n -l /usr/bin/systemctl restart cctv-worker
```

`--no-pager`, `--lines`, and other added arguments do not match this exact rule and will invoke normal authentication. `cat` and `visudo` are intentionally outside the rule; do not widen privileges merely to obtain audit output without explicit approval.

## Restart helper requirements

`/home/hafizi145/restart-cctv.sh` must use absolute exact commands:

```bash
sudo /usr/bin/systemctl restart cctv-worker
sleep 8
sudo /usr/bin/systemctl status cctv-worker
```

Health and dashboard verification remain non-sudo `curl` requests to `127.0.0.1:8091`. Keep the workflow approval-gated: edit → show diff → explicit approval → apply → restart → verify. Do not add automatic restart-on-file-change.

## RTSP secret hygiene

Never log a raw RTSP source URL. Before every `logger.*` call, redact password to this shape:

```text
rtsp://username:***@host:port/stream
```

Audit source for any logging of `source`/camera URLs, including startup and detection-loop termination lines. Rotate a compromised camera password first. Existing journal records retain prior secrets until a separately approved journal-retention/cleanup action; do not delete journal data without approval.
