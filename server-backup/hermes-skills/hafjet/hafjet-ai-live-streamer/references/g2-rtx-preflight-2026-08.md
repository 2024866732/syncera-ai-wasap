# G2 RTX preflight & Task 3 deploy (2026-08-15 → 2026-08-17)

## Connectivity

| From | To | Result |
|------|-----|--------|
| Hermes → `100.119.32.87:22` | direct | timeout if offline; **publickey denied** if online (no office2rtx key on Hermes) |
| Hermes → Office `hafizi145@100.121.94.41` | OK | |
| Office → RTX `hafjet@100.119.32.87 -i ~/.ssh/id_ed25519_office2rtx` | OK | |

Tailscale names: `desktop-rhdusf3-1` (WSL linux), `desktop-rhdusf3` (Windows twin).

## Measured (2026-08-17, Task 2 PASS)

- Host: `DESKTOP-RHDUSF3`, user `hafjet`, WSL2 kernel 6.6.87.2  
- GPU: RTX 4070 · driver 610.88 · CUDA UMD 13.3 · idle ~38–44°C · ~747–988 / 12282 MiB  
- Disk: ~894G free on `/` (1007G)  
- RAM: 11Gi · ~7–9Gi available  
- `python3` system 3.14.4: **no torch**  
- `~/cctv-analysis/.venv`: torch **2.13.0+cu126**, cuda_available True — **do not install LiveTalking here**  
- CCTV tree present: analyze, staging (~191 mp4 / ~503M at check), yolov8n.pt  

## Task 3 layout (PASS)

```
~/hafjet-live/
  LiveTalking/   # empty until Task 4
  bin/livetalking_glue/   # gpu_lock, circuit_breaker, speak_local_demo, health_avatar.sh, README
  logs/ wav/ synthetic/
```

Verify: lock acquire/release, CB `action=run`, speak `--dry-run`, health script, `CCTV_VENV_INTACT`.

## Deploy recipe (glue only)

```bash
# Hermes stage
STAGE=/tmp/hafjet_g2_glue_stage
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -a ~/projects/hafjet-ai-live-streamer/avatar/livetalking_glue/. "$STAGE/"

scp -o BatchMode=yes -r "$STAGE"/* hafizi145@100.121.94.41:/tmp/hafjet_g2_glue_stage/

ssh -o BatchMode=yes hafizi145@100.121.94.41 \
  'scp -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes -r /tmp/hafjet_g2_glue_stage/* \
   hafjet@100.119.32.87:~/hafjet-live/bin/livetalking_glue/'
```

## Still blocked until Tuan OK

- Task 4: clone lipku/LiveTalking + dedicated venv + weights on RTX only  
- OBS 30s preview evidence  
- CCTV one-line `SKIP_LIVE_LOCK` patch on `cctv_analyze.py`
