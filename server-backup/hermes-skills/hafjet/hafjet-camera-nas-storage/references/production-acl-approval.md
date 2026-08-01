# Production ACL approval under `/mnt/cctv`

## Why
`/mnt/cctv` holds live worker snapshots, faces, DB, and Xiaomi dumps. ACL/mode changes are production ops even when “only for Samba”.

## Required before `fix_acl.sh` / `setfacl` / `chmod` on CCTV paths
1. Explicit approval phrase in current chat (not implied by deploy approval).
2. Written list of paths + intended ACL/mode.
3. Confirm: no media deletes, no `cctv-worker` restart, no Phase 2 AI.

## Example approval
```
APPROVE ACL fix_acl.sh ONLY — no deletes of CCTV/Xiaomi media; no cctv-worker touch
```

## Office PC execution
- `sudo` from Hermes BatchMode SSH **fails** (`A terminal is required to authenticate`).
- Tuan runs interactively on PC TTY; agent verifies with `test -w` / `getfacl` read-only.

## Dual ACL pair (Xiaomi Samba + ingest)
| Principal | Path | Need |
|-----------|------|------|
| smbcam | `/mnt/cctv` | `--x` traverse only (parent often 750) |
| smbcam | `.../xiaomi-nas` + `recordings` | rwx (camera dump) |
| hafizi145 | `recordings` | rwx + default ACL (claim/move for ingest) |

## Verification (no delete preferred)
```bash
test -w /mnt/cctv/xiaomi-nas/recordings && echo WRITABLE
getfacl -p /mnt/cctv/xiaomi-nas/recordings | head -30
namei -l /mnt/cctv/xiaomi-nas/recordings
systemctl show cctv-worker -p MainPID --value
```

## After ACL
1. `.env`: `XIAOMI_RECORDINGS_DIR=/mnt/cctv/xiaomi-nas/recordings`, `STABLE_SECONDS=45`
2. Restart ingest on `:8092` only (kill old ingest PID listening on 8092)
3. Confirm worker PID unchanged + both health endpoints
