# RTX Windows CDP TikTok listener bootstrap (verified 2026-08-28)

Goal: read TikTok live comments from Chrome running on the **RTX Windows host**
(the same PC that runs Live Studio + OBS), enqueue to Hermes queue, then the WSL
consumer claims → Chatterbox → `/humanaudio` → ACK. All steps below were
verified live in the 2026-08-28 G6-readiness setup session.

## Architecture facts (verified)

- **Listener MUST run Windows-native.** Chrome CDP binds `127.0.0.1:9223` on the
  Windows host → only Windows loopback can reach it; WSL NAT cannot.
- **Windows→Hermes route = WSL2 localhost forwarding.** The Hermes→WSL reverse
  tunnel `-R 127.0.0.1:18744:127.0.0.1:8740` makes `http://127.0.0.1:18744`
  reachable inside WSL; WSL2 localhost forwarding additionally makes
  `http://localhost:18744` reachable **from Windows**. Verified with Windows
  `curl.exe` AND `C:\Python314\python.exe` urllib → returned orchestrator health.
- **CRITICAL:** in a Windows-native script use `ORCH = "http://localhost:18744"`,
  never `127.0.0.1:18744` — on Windows, `127.0.0.1` is Windows itself and has no
  tunnel. The WSL consumer (which runs next to the tunnel) uses `127.0.0.1:18744`.
- **RTX Windows Tailscale IP `100.65.152.29` (`desktop-rhdusf3`) has NO SSH**
  (port 22 refused) → cannot build a Hermes→Windows reverse tunnel directly.
  WSL Tailscale IP `100.119.32.87` (`desktop-rhdusf3-1`) has SSH. So the
  Hermes→WSL tunnel + Windows localhost forwarding is the ONLY verified route.
- Windows user on RTX: `PC CUSTOM`; dedicated profile:
  `C:\Users\PC CUSTOM\hafjet-live-listeners\profiles\tiktok-rtx` (exists).
- Windows Pythons: `C:\Python314\python.exe` (pip 26.1.1 works) and
  `C:\Users\PC CUSTOM\AppData\Local\Programs\Python\Python313\python.exe` (NO pip).

## Launch Chrome with CDP on RTX Windows (verified working)

What FAILS from WSL (do not retry):
- `schtasks.exe //Create ...` → `Invalid argument/option - '//Create'` (WSL path
  mangling of `/`).
- `cmd.exe /c start "..."` → HANGS on UNC path (`\\wsl.localhost\Ubuntu\...`
  not a valid Windows start dir).
- `Start-Process` via bare `powershell.exe` → no error but Chrome never appears
  (session/context issue).

What WORKS — .bat launcher + PowerShell `Register-ScheduledTask` Interactive:

1. Write `launch_chrome_cdp.bat` to the Windows profile dir:
```bat
@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --user-data-dir="C:\Users\PC CUSTOM\hafjet-live-listeners\profiles\tiktok-rtx" ^
  --remote-debugging-address=127.0.0.1 ^
  --remote-debugging-port=9223 ^
  --no-first-run ^
  --no-default-browser-check ^
  --new-window about:blank
```
2. From WSL, run PowerShell (full path) with `-ExecutionPolicy Bypass -File`:
```powershell
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"C:\Users\PC CUSTOM\hafjet-live-listeners\launch_chrome_cdp.bat`""
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\PC CUSTOM" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName hafjet-g6-cdp -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName hafjet-g6-cdp
```
3. Verify (all from WSL):
```bash
/mnt/c/Windows/System32/tasklist.exe //FI "IMAGENAME eq chrome.exe"   # expect ~30 procs
/mnt/c/Windows/System32/curl.exe -s http://127.0.0.1:9223/json/list    # expect tabs + webSocketDebuggerUrl
```
4. Cleanup the temp task after Chrome is up (`Unregister-ScheduledTask ... -Confirm:$false`).

Pitfall: PowerShell `(Invoke-WebRequest ...).Content.Substring(0,N)` throws
"Object reference not set to an instance of an object" when `.Content` is null —
use `curl.exe` or Python `urllib` for CDP checks instead.

## Windows-native CDP listener shape (verified pieces)

```python
ORCH = "http://localhost:18744"          # Windows → WSL tunnel → Hermes
CDP  = "http://127.0.0.1:9223/json/list" # Windows loopback CDP
# websocket-client installed for Python314:
#   /mnt/c/Python314/python.exe -m pip install --user websocket-client   (1.9.0)
# read visible [data-e2e="chat-message"] via Runtime.evaluate,
# filter keywords ("test"/"soak"), rate-limit 1/5s, dedup sha256(user+text),
# POST /events/comment {event_id unique, platform:"tiktok", user, text, live_id}
```
Consumer stays in WSL: `/tmp/soak_chatterbox.py` with
`VAL_ORCH_URL=http://127.0.0.1:18744` (WSL loopback tunnel) — claims the same
queue, runs Chatterbox + `/humanaudio` + ACK.

## File relay Hermes → Office → RTX (the reliable form)

Two-step scp, then run on RTX:
```bash
scp /tmp/script.py hafizi145@100.121.94.41:/tmp/script.py
ssh hafizi145@100.121.94.41 'scp -i ~/.ssh/id_ed25519_office2rtx /tmp/script.py hafjet@100.119.32.87:/tmp/script.py && ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 "~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/script.py"'
```
WARNING: `ssh office 'ssh rtx "cmd"' < /tmp/file` runs the `<` redirect + command
on OFFICE (path mismatch `~/hafjet-chatterbox/...` not found) — never use that
form for RTX targets. Also `venv-chatterbox` python must be invoked on RTX via
the jump, not on Office.

## G6-public-live note (2026-08-28, NOT yet validated)

The G6 public-live readiness run (auto-speak ON for all comments, ≤10 jobs,
≤5 min) was staged but NOT completed — Chrome/CDP was up and listener staged,
but the live room test had not run when the session ended. Do not present the
live portion as verified; only the bootstrap above is verified.
