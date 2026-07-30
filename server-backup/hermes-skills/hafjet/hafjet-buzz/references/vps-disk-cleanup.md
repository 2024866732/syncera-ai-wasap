# VPS Disk Cleanup (HAFJET-Hermes-Server)

Quick cleanup routine for the 1GB RAM Azure VPS running Hermes Agent (git install).

## Common Space Hogs

| Path | Typical Size | Safe to Delete? |
|------|:---:|---|
| `~/.cache/pip` | 2-3GB | ✅ `rm -rf ~/.cache/pip` |
| `~/.cache/uv` | 800MB-1GB | ✅ `uv cache clean` |
| `~/.cache/huggingface` | 100-500MB | ✅ Delete unused models |
| `~/.cache/models` | Varies | ⚠️ Keep if Whisper/OCR models cached here |
| `/var/cache/apt` | 100-300MB | ✅ `sudo apt clean` |
| `/var/log` | 200-500MB | ✅ `sudo journalctl --vacuum-size=50M` |
| `~/.hermes/logs` | 10-50MB | ✅ Rotate old logs |
| `~/.hermes/sessions` | 5-20MB | ⚠️ Keep recent, prune via config |

## Quick Cleanup Commands

```bash
# Fastest wins (safe, no data loss):
rm -rf ~/.cache/pip
uv cache clean
sudo apt clean
sudo journalctl --vacuum-size=50M
df -h /   # check result
```

## Discovery Commands

```bash
# Find what's eating disk:
du -sh /* 2>/dev/null | sort -rh | head -15    # / level (slow on small VPS)
du -sh ~/* 2>/dev/null | sort -rh | head -10   # home dir (fast)
du -sh ~/.cache/* 2>/dev/null | sort -rh | head -5  # cache breakdown

# Journal size:
journalctl --disk-usage
```

## Critical Thresholds

- **>90% full** → Gateway cron jobs may fail, sessions can't write
- **>95% full** → Hermes may crash, agent can't write state.db
- Aim for **<85%** on VPS (29GB disk) for safe operation
