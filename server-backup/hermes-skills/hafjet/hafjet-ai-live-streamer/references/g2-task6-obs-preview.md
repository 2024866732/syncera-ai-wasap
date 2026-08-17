# G2 Task6 — OBS formal preview (verified 2026-08-17)

## Goal
Scene **Aina Preview** on Windows OBS shows avatar ≥30s; evidence mkv/jpg; **no RTMP/stream keys**.

## Why not virtual cam
WSL2 has no `/dev/video*`. pyvirtualcam not viable until Windows OBS Virtual Camera bridge. Use **Media Source** of Task5 WebRTC speak MP4 for formal OBS proof.

## Windows paths
| Item | Path |
|------|------|
| Speak input MP4 | `C:\Users\PC CUSTOM\Videos\HAFJET-Live\g2_t5_avatar_speak.mp4` |
| Scene collection | `%AppData%\obs-studio\basic\scenes\HAFJET-Aina-Preview.json` |
| OBS binary | `C:\Program Files\obs-studio\bin\64bit\obs64.exe` |
| Evidence record | `...\Videos\HAFJET-Live\g2_t6_obs_aina_preview.mkv` (~49s, ~16MB) |
| Still | `...\Videos\HAFJET-Live\g2_t6_obs_frame12.jpg` |
| Raw OBS out | `Videos\2026-08-17 19-35-12.mkv` |

## Scene collection (minimal)
- Collection name: `HAFJET-Aina-Preview`
- Scene: `Aina Preview`
- Source: `Aina Speak Replay` id=`ffmpeg_source`
  - `is_local_file: true`
  - `local_file`: path to Task5 MP4 above
  - `restart_on_activate: true`, `looping: false`, `hw_decode: true`

Do **not** mutate `Untitled.json` as the only collection.

## Launch from WSL (automation)
```bash
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
"$PS" -NoProfile -Command \
  "Start-Process -FilePath 'C:\Program Files\obs-studio\bin\64bit\obs64.exe' \
   -WorkingDirectory 'C:\Program Files\obs-studio\bin\64bit' \
   -ArgumentList '--collection','HAFJET-Aina-Preview','--scene','Aina Preview','--startrecording' \
   -WindowStyle Minimized"
# wait ≥35s media, then:
"$PS" -NoProfile -Command "Get-Process obs64 -ErrorAction SilentlyContinue | Stop-Process -Force"
```

## Log signatures (success)
OBS log under `%AppData%\obs-studio\logs\`:
- `Switched to scene 'Aina Preview'`
- `[Media Source 'Aina Speak Replay']: settings:` + local_file path
- `==== Recording Start ====`
- Writing file under `Videos\YYYY-MM-DD ...mkv`
- No RTMP start required

## Live path (manual, later G5+)
1. LiveTalking webrtc on WSL `:8010`
2. Windows browser `http://localhost:8010/index.html` → connect
3. OBS Window Capture / Browser Source
4. Still no Stream panel keys until approved

## Repo docs
- `~/projects/hafjet-ai-live-streamer/docs/runbook-g2-task6-obs.md`
- `obs/checklist.md`, `obs/scenes.md`
