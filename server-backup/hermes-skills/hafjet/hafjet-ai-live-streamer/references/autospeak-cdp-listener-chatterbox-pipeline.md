# Auto-speak CDP listener → Chatterbox pipeline on RTX (verified 2026-08-28)

End-to-end proven flow: TikTok live comment → Chrome CDP listener (Windows) →
Hermes `/events/comment` → queue → WSL consumer (`venv-chatterbox`) → Chatterbox →
`/humanaudio` → ACK done. Companion to `windows-rtx-local-tiktok-listener.md`
(bootstrap/containment); this file covers the **auto-speak + queue-native** path.

## Topology
- Chrome on RTX Windows host, profile `tiktok-rtx`, CDP loopback `127.0.0.1:9223`
- Listener: Windows-native Python314 (`C:\Python314\python.exe`) — CDP read + enqueue
- Hermes: orchestrator `127.0.0.1:8740`, exposed to RTX via `-J` tunnel `18744`
- Consumer: WSL `venv-chatterbox` (`~/hafjet-chatterbox/venv-chatterbox/bin/python`)

## Critical gotchas (all hit this session)
1. **Chrome CDP WebSocket 403** — modern Chrome rejects WS unless launched with
   `--remote-allow-origins=*` (or exact origin). Without it: `Handshake status 403
   Forbidden` from `websocket.create_connection`. Relaunch Chrome with the flag.
2. **Windows reaches Hermes via `http://localhost:18744`** — WSL2 localhost
   forwarding routes Windows `localhost:<port>` to WSL loopback. `127.0.0.1:18744`
   on Windows is Windows loopback (no tunnel) → refused. Always `localhost` in the
   Windows listener ORCH URL.
3. **Windows Python**: `C:\Python314\python.exe` HAS pip (26.1.1); user Python313
   (`C:\Users\PC CUSTOM\AppData\Local\Programs\Python\Python313`) has NO pip.
   Install listener dep:
   `/mnt/c/Python314/python.exe -m pip install --user websocket-client`
4. **Listener log dir**: on Windows, `Path.home()/hafjet-chatterbox` does NOT
   exist (it is a WSL dir) → use `Path.home()/hafjet-live-listeners/...`.
5. **Launch Chrome from WSL**: `schtasks /Create` chokes on spaces (`C:\Program
   Files`), `cmd /c start` hangs (UNC cwd). Working: PowerShell `Start-Process`
   via a `.ps1` file with quoted `--user-data-dir`, run with `-File`.

## Launch Chrome (launch_chrome.ps1)
```powershell
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "C:\Users\PC CUSTOM\hafjet-live-listeners\profiles\tiktok-rtx"
Start-Process -FilePath $chromePath -ArgumentList "--user-data-dir=`"$profileDir`"","--remote-debugging-address=127.0.0.1","--remote-debugging-port=9223","--remote-allow-origins=*","--no-first-run"
```
From WSL (RTX):
```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\PC CUSTOM\hafjet-live-listeners\launch_chrome.ps1"
```
Kill before relaunch: `powershell.exe -NoProfile -Command "Stop-Process -Name chrome -Force"`.

## Listener (Windows-native, keyword auto-speak)
`autospeak_tiktok_listener.py` (staged at `/tmp/` on RTX, copied to
`C:\Users\PC CUSTOM\hafjet-live-listeners\`):
- Reads visible `[data-e2e="chat-message"]` via CDP `Runtime.evaluate` (WebSocket)
- Filters keyword `test`/`soak` (case-insensitive) + spam guard (emoji-only skip)
- Enqueues `POST http://localhost:18744/events/comment` platform=tiktok, unique
  event_id (`autospeak-<sha256[:16]>`)
- Rate 1 job/5s, max 10 enqueues, max 600s — STOP on either
- Logs JSONL to `autospeak_listener.log` in `hafjet-live-listeners`

Start from WSL via PowerShell `Start-Process` with `-WorkingDirectory` and
`-RedirectStandardOutput`/`-RedirectStandardError` (quote the `PC CUSTOM` path).

Verify CDP tabs (Windows Python):
```python
import json, urllib.request
tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9223/json/list", timeout=6).read().decode())
[t for t in tabs if t.get("type") == "page"]
```
Listener only reads pages whose URL contains `/live` — confirm the live tab exists
in the SAME Chrome CDP instance before starting (user opens live manually; login
persists across relaunch because profile dir is reused).

## Consumer (WSL)
`soak_chatterbox.py` claim loop: GET /queue → POST /queue/claim (or reuse
in_flight) → `sqc.run_once(job_override=job, skip_lock=True, ...)` → Chatterbox
generate → `/humanaudio` (single POST) → orch ack done → record per-job JSONL to
`~/hafjet-chatterbox/soak_report.jsonl`.

## Soak results (10 queue-native jobs, 2026-08-28)
- 10/10 `ok_spoke`, 10× ack `done`, 10× humanaudio `code:0`
- RTF 0.549–0.806 (avg 0.652) — real-time
- VRAM 8,498–8,598 MB; GPU temp 46–53°C — under CB stops (88C / 11GB)
- Job 1 ~24s (model load+warmup), steady state ~5s/job
- Queue ended empty; LT :8010 untouched; GPU returned to idle after 600s unload
- Telemetry in `~/hafjet-live/logs/tts_wiring.jsonl`

## Operator flow notes
- Tuan's bounded-test pattern: hard limits (max jobs/minutes), STOP at limits,
  fixed report format (counts, telemetry, queue final, LT/GPU state).
- After killing/relaunching Chrome, user must reopen the TikTok live tab; the
  listener will idle (no enqueue) until a `/live` page exists.

## G6 public readiness run (verified 2026-08-31)
- **Tunnel 18744 death trap:** a stale `ssh -f -N -R 18744` from 28 Aug died
  silently mid-run → consumer idle-poll hit `URLError: Connection refused` and
  crashed (uncaught). Lesson: run the tunnel **supervised** via
  `terminal(background=true)` (no `-f`), health-check it from RTX before AND
  after the run, and `process kill` it during cleanup. Guarded consumer v2
  (`/tmp/autospeak_consumer_loop.py` on RTX): get()/claim() retry 3x/2s;
  `/humanaudio` stays single-POST (no retry).
- **Run numbers (attempt 2, @hafizpitz/live):** seen 26 → enqueue 1 → claim 1 →
  ok_spoke 1 → ack done 1 → humanaudio code:0; RTF 0.583 (attempt-1 job 0.523);
  GPU max 46°C/7.9GB; queue 0/0/0; listener auto-stop 301.8s (MAX_SEC=300 via
  `sed` on Windows copy); LT :8010 untouched (owner session sarah/18eb238e).
- 1 job only because room comment rate was sparse in-window — NOT a selector
  failure (seen_comment events prove detection; dedup + rate 1/5s by design).
