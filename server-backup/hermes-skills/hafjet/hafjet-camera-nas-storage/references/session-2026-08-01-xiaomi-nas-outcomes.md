# Session outcomes — Xiaomi NAS + Oray + Tapo (2026-08-01)

## Decisions
- Oray X1 SN `112081250984`: USB File Sharing never detects storage (pendrive+HDD, FW~5.5.0) → **RMA path**; not camera NAS target
- Working NAS: **Samba on hafjet-pc-office** for Mi Home
- Mi Home share pick: **`xiaomi-nas`**, never **`IPC$`**
- Ubuntu often absent from Mi discovery list → **manual IP form**
- Writable error after correct share → `/mnt/cctv` 750 blocked `smbcam` traverse → ACL `u:smbcam:--x`
- Ingest AI CCTV: **separate service P1 meta+thumb** (`:8092`); design + deploy approved; DNN phase 2
- Tapo TC74/C560WS: no Storage Hub budget → RTSP worker; **event-clip expand first**; C560WS RTSP still pending confirm

## Deploy / ACL
- Ingest smoke OK with worker PID unchanged
- TTY `fix_acl.sh` DONE: `hafizi145` rwx on `recordings`
- Post-ACL production `.env` points at `/mnt/cctv/xiaomi-nas/recordings`; restart ingest only
- Production ACL needs **standalone approval phrase** — see `production-acl-approval.md`

## Comet / browser-AI pattern
When Tuan is logged into Pgybox/SD-WAN dashboard, give a **read-only** prompt that forces sections A–I (status, disk, SMB, MI_HOME_FORM, blockers). Do not ask Comet to factory-reset or change passwords.

## Chat delivery
Long RMA drafts, Samba scripts, design docs → MEDIA `.txt` only; Telegram chat stays STEP/ACTION/NEED ≤3 lines.
