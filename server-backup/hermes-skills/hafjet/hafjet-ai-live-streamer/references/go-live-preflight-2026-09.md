# GO LIVE preflight — dual CDP + Chatterbox (2026-09)

## Must-pass before enqueue

| Check | Pass |
|---|---|
| Orch `:8740/health` | ok, queue 0/0/0 |
| Orch session | idle, or `POST /session/stop` first |
| Chrome CDP 9223 Windows | `json/list` includes TikTok/FB `/live` |
| LT `:8010` | LISTEN + HTTP ≠ 000 |
| `GET :8010/api/admin/sessions` | ≥1 WebRTC session (sarah / wav2lip) |
| GPU | idle-ish; CB stop >80°C or >10240 MiB |
| Tunnel 18744 | only after the above; RTX `curl :18744/health` = 200 |

Empty `sessions: []` while `:8010` is up means Live Studio/WebRTC client is not attached. Do **not** `/offer` unless Tuan explicitly asks. Do **not** start LT/Chrome unless those steps are in the approved GO LIVE list.

## Session start

```http
POST /session/start
{"platforms":["tiktok","fb"],"title":"dual_platform_live_v2","read_only":false}
```

Use `fb` not `facebook`.

## Proven listener/consumer (scripts only — no repo edits)

- Windows: `C:\Users\PC CUSTOM\hafjet-live-listeners\cdp_dual_listener.py` + `start_dual_listener.ps1`
- ORCH `http://localhost:18744`, MAX_ENQ=10, RATE_S=5 shared, UTF-8 stdout, log under `hafjet-live-listeners`
- FB selector that worked: `div[aria-label*="comment" i] div[dir="auto"]`
- TikTok: `[data-e2e="chat-message"]`
- RTX consumer: `/tmp/autospeak_consumer_loop.py` in `venv-chatterbox`, `VAL_ORCH_URL=http://127.0.0.1:18744`, `skip_lock=True` when owner LT already holds GPU, single `/humanaudio`, GPU_STOP 80°C/10GB

## vis_expr quoting (silent null)

Broken: `querySelectorAll("%s") % sel` when `sel` contains `"`.
Working: `querySelectorAll(%s) % json.dumps(sel)`.

## dual_platform_live_v2 (2026-09-05)

Room `@roadcam.malaysia/live`. 8/8 ok_spoke, ack done, humanaudio code:0, RTF median 0.627 (0.588–0.707), GPU max 54°C/8398 MiB, stop_reason=time (605s), FB 0 (no FB tab). Queue ended 0/0/0. LT left up. Tunnel killed.

## Cleanup

Kill Windows `cdp_dual_listener` only (not Hermes gateway python). Kill supervised tunnel. Leave LT `:8010` unless Tuan asked to stop avatar. Confirm queue 0/0/0 and RTX `18744` http_code 000.
