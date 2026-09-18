# Chatterbox pipeline e2e + TikTok live auto-speak (2026-08-28)

Session evidence for the full pipeline: orchestrator queue → RTX consumer → Chatterbox TTS → LiveTalking `/humanaudio` → ACK done, including a real TikTok live auto-speak run.

## Pipeline proof (queue-native, not manual-inject)

`POST /events/comment` (platform=tiktok) → Aina stub decide → speak queue (3 jobs) → RTX consumer claim via tunnel → `synth_for_consumer` (Chatterbox primary) → postgen pause gate → single `POST /humanaudio` (body `{code:0,msg:"ok"}`) → `ack: done` → queue ends empty.

## Smoke test numbers (Chatterbox Multilingual V3, ms, RTX 4070 12GB)

| Metric | Value |
|---|---|
| Model load | 12.7s warm / 41.3s cold |
| Generation RTF | 0.486 – 0.949 (all < 1 = real-time) |
| VRAM during gen | ~6.3 GB (delta ~3.3 GB from idle ~2.7 GB) |
| VRAM soak steady-state | ~8.5 GB |
| GPU temp max | 57–59 °C |
| WAV output | `ta.save(path, wav, model.sr)` after `model.generate(text, language_id="ms")` |

`PerthImplicitWatermarker = None` even with onnxruntime 1.29 installed → smoke falls back to `DummyWatermarker` (unwatermarked output). Flag for production compliance.

## Soak test (10 queue-native jobs)

10/10 `ok_spoke`, 10× `ack: done`, 10× `humanaudio code:0`, source=chatterbox (0 Edge fallback). RTF avg 0.652 (0.549–0.806), VRAM avg 8,539 MB, temp avg 48.8 °C, wall avg 7.04s (job 1 23.8s incl model load). Queue ends count 0. Driver: `/tmp/soak_chatterbox.py` on RTX (claims real queue, `skip_lock=True`, writes `soak_report.jsonl`).

## TikTok live auto-speak (real comments)

Live room `@royazizan/live` via Chrome CDP on RTX Windows. Comments "test" + "soak" from host → listener enqueue → 2 jobs processed end-to-end:

| Job | Comment | Status | RTF | /humanaudio | ACK |
|---|---|---|---|---|---|
| autospeak-9f86d081… | test | ok_spoke | 0.628 | code:0 | done |
| autospeak-c06f543b… | soak | ok_spoke | 0.949 | code:0 | done |

Listener log: `enqueued: 2, elapsed_s: 601.0` (auto-stopped at 10 min). Telemetry total: 18 × ok_spoke that day, all `humanaudio code:0`, session `5d7ac2c3` (avatar sarah).

## ALL-comments bounded run (2026-08-30, live @hafizpitz) — 10/10 PASS

- Listener `cdp_tiktok_listener_all.py` ALL-comments mode: **78.8s to enqueue 10 real comments** (rate 1/5s), then auto-stop at MAX_ENQ=10.
- Consumer `consumer_wrapper.py` (poll 10s, single instance): **10/10 ok_spoke, 10× ack done, 10× humanaudio code:0**, 0 Edge fallback.
- RTF min 0.687 / median 0.788 / max 0.862; wall ~7s/job steady; VRAM max 8,303 MB; temp max 53°C.
- Real comments processed: "ok", "parking kereta kat mana", "bas skg dah start amik ke ek?kat picc", "depan tu couple host", "Ada tempat lagi tak?" etc. — Aina stub brain replied contextually (picc/parking/gadget), price-guard on.
- Session this run: `18eb238e` (LT relaunched after 2-day gap; av1 held via `lt_hold_session.py`).
- Queue end 0/0/0; LT :8010 kept up; tunnel/ports torn down after test.

## Windows RTX CDP listener gotchas (all verified)

1. **Chrome launch must include `--remote-allow-origins=*`** or CDP WebSocket returns `403 Forbidden` ("Rejected an incoming WebSocket connection from the http://127.0.0.1:9223 origin. Use --remote-allow-origins=…").
2. **Launch via `launch_chrome.ps1`** (`Start-Process -FilePath chrome.exe -ArgumentList "--user-data-dir=<profile>","--remote-debugging-address=127.0.0.1","--remote-debugging-port=9223","--remote-allow-origins=*","--no-first-run"`) run with `powershell.exe -ExecutionPolicy Bypass -File`. Kill old Chrome first (`Stop-Process -Name chrome -Force`). Profile dir example: `C:\Users\PC CUSTOM\hafjet-live-listeners\profiles\tiktok-rtx`.
3. **WSL2 localhost forwarding**: Windows `http://localhost:18744` reaches the Hermes tunnel bound on WSL 127.0.0.1. A Windows-native listener must use `localhost` NOT `127.0.0.1` (127.0.0.1 on Windows = Windows loopback only → connection refused).
4. **Windows Python**: `C:\Python314\python.exe` has pip (Python313 under AppData does not). `python -m pip install --user websocket-client` (1.9.0).
5. **cp1252 console**: `print()` of emoji/BM text raises `UnicodeEncodeError` → add `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`.
6. **Windows log path**: `Path.home()/hafjet-chatterbox` does NOT exist on Windows → use `Path.home()/hafjet-live-listeners`.
7. **`schtasks.exe //Create` from WSL fails** (WSL mangles `//` → `/`); use PowerShell `Register-ScheduledTask` + `Start-ScheduledTask`, or simply `Start-Process` for a one-shot visible Chrome.
8. Listener pattern: CDP `Runtime.evaluate` on `[data-e2e="chat-message"]` visible nodes → parse `user text` → spam guard (emoji-only / <2 chars) → dedup sha256(user+text) → rate-limit 1 job/5s → `POST /events/comment` unique event_id → consumer claims via tunnel. Never touch chat input, typed reply, `/human`, `/offer`.

## Hermes→RTX tunnel (re-verified)

```bash
ssh -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -f -N \
  -R 127.0.0.1:18744:127.0.0.1:8740 -J hafizi145@100.121.94.41 hafjet@100.119.32.87
```

Two-command jump `ssh office 'ssh rtx "cmd"'` does NOT bind remote `-R` reliably (leaves limbo listeners → Connection reset). If a port is in limbo (`ss` shows LISTEN with no visible process, `fuser -k` no-op), use a fresh port. For long-lived runs use `terminal(background=true)` without `-f`.

## Remote relay pattern (Hermes → Office → RTX)

Use two-step scp/ssh (NOT nested heredoc redirection which runs on Office):

```bash
scp /tmp/script.py hafizi145@100.121.94.41:/tmp/
ssh hafizi145@100.121.94.41 'scp -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes /tmp/script.py hafjet@100.119.32.87:/tmp/script.py && ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes hafjet@100.119.32.87 "~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/script.py"'
```

A nested `ssh office 'ssh rtx "cmd"' < file` runs the command on Office (path not found), not RTX.

## WSL→Windows CDP reachability (verified 2026-08-30)

Chrome CDP binds Windows `127.0.0.1:9223` only; WSL2 CANNOT reach Windows loopback (no localhost forwarding WSL→Windows; only Windows→WSL works). Proven bridge:

```powershell
# portproxy (needs elevated PowerShell once):
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=19223 connectaddress=127.0.0.1 connectport=9223
# firewall: allow rule for TCP 19223 from 172.27.0.0/16 (WSL subnet) — needed on some hosts
```

Then WSL uses `http://172.27.0.1:19223` (the WSL gateway IP = Windows vEthernet). `127.0.0.1:19223` from WSL hits WSL loopback (dead) — must use gateway IP. Keep remoteip scoped to the WSL subnet; never open 0.0.0.0/0. The proxy owns its own PID on Windows (kill by PID or `netsh ... delete v4tov4` to remove).
