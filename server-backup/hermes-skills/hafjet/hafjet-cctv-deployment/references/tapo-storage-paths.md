# Tapo storage paths (TC74 / C560WS / family)

## What the Tapo app offers
- microSD (on supported models)
- Tapo Care (cloud subscription)
- **Tapo Storage Hub** (TP-Link hardware ecosystem) — often expensive; not required for HAFJET
- **No** generic “add SMB NAS IP” like Xiaomi Mi Home for these models

## HAFJET free path (preferred)
1. Tapo app → enable **Camera Account** + **RTSP** (and ONVIF if available).
2. PC Office `cctv-worker` pulls RTSP → person detect → snapshots/events under `/mnt/cctv`.
3. Expand later: **event clips** on detection (not continuous 24/7) to save CPU/disk on i3-class hosts.
4. Multi-cam (second RTSP e.g. C560WS) = separate architecture/approval gate; not `.env`-only.

## Do not
- Tell user to bind Tapo to Samba `xiaomi-nas` share expecting app NAS UI to work
- Buy Storage Hub when RTSP→worker already covers local storage goals
- Paste RTSP passwords into chat; collect LAN IP + “RTSP ON confirmed” only

## Related
- Live worker ops / restart gates: skill `cctv-worker-operations`
- C560WS product notes: `references/tapo-c560ws.md`
