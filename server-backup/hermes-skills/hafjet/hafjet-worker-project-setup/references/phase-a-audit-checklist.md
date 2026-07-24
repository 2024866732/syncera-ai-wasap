# Phase A Audit Report — Template Checklist

Use this template whenever Tuan requests a Phase A system audit for a new
worker project on the office PC.

## Section A — Worker machine confirmation

Table format:

| Item | Value | Source command |
|------|-------|----------------|
| Hostname | `hostnamectl` | `hostname` |
| OS | `lsb_release -d` | |
| Kernel | `uname -r` | |
| CPU | `lscpu \| grep "Model name"` | |
| Cores/Threads | `lscpu \| grep -E "Core|Thread"` | |
| RAM | `free -h \| grep Mem` | |
| Swap | `free -h \| grep Swap` | |
| Private IP / Tailscale | `tailscale ip` | |
| ffmpeg version | `ffmpeg -version \| head -1` | |
| Python version | `python3 --version` | |
| Docker present? | `docker --version` or "not installed" | |
| NVIDIA GPU? | `lspci \| grep -i nvidia` should fail → "none" | |

## Section B — Storage confirmation

Use `df -hT /mnt/cctv` and `stat -c "%U %G %a" /mnt/cctv`.

| Item | Value |
|------|-------|
| Mounted? | yes/no |
| Filesystem type | ext4 / xfs / ... |
| Free space | GiB |
| Writable by hafizi145? | yes/no |
| Exact data directories | List each path |

## Section C — Proposed PoC architecture

Single paragraph. Format:

> Single-pipeline topology: `[source] → [processing component] → [storage] → [API]`.
> All components run on `hafjet-pc-office`, CPU-only.
> No cloud dependencies, no Azure egress, no production changes.

## Section D — Candidate model/runtime comparison

Table with columns:

| Option | Runtime | CPU suitability | Expected FPS/latency | Pros | Cons | Recommendation |
|--------|---------|-----------------|----------------------|------|------|----------------|
| ... | ... | ... | ... | ... | ... | ✅/⚠️ |

Fill at least 2-3 options. Use `opencv-python-headless` as the recommended
baseline for CPU-only CV projects.

## Section E — Exact files planned for Phase B

Path-only list, one per line:

```
/home/hafizi145/projects/<name>/README.md
/home/hafizi145/projects/<name>/requirements.txt
...
```

## Section F — Exact commands planned for Phase B

Command-only list:

```bash
mkdir -p /home/hafizi145/projects/<name>
cd /home/hafizi145/projects/<name>
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
...
```

Must use venv (no `--user`), bind `127.0.0.1`, no Docker, no `0.0.0.0`.

## Section G — Risk list

One bullet per risk, office PC only:

- CPU overload ...
- RTSP instability ...
- Disk exhaustion ...
- Model loading ...
- Port conflicts with OmniRoute/Hermes
- Python 3.14 package compatibility
- Tailscale IP changes
- Accidentally touching production HAFJET code
