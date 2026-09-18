# Multi-platform dual-listener — TikTok + FB live (verified 2026-08-31)

Session evidence + hardened patterns from two bounded auto-speak runs:
Task 1 (incl. two incidents) and clean Round 2, session
`dual_platform_live_v1` (platforms tiktok+fb), rooms @hafizpitz/live +
`facebook.com/<page>/videos/<id>`, one CDP Chrome on RTX Windows, one queue.

## Run proof

| Run | Seen | Enqueue | Processed | Result |
|---|---|---|---|---|
| Task 1 (4 consumer runs) | TT 48+FB 45 (v3 window) | 10 + 7 TT + 3 FB | 12 TT + 3 FB ok_spoke, 5 cancelled | FB e2e 3/3 code:0 |
| Round 2 (clean) | TT 80 + FB 44 = 124 | TT 9 + FB 1 = 10 (85.6s) | 10/10 ok_spoke, ack done, code:0 | queue 0/0/0 zero-touch |

Round 2 RTF: FB 0.941; TT median 0.988 (0.74–1.011); combined median 0.966.
GPU: no guard event (VRAM max 8,805MB, temp max 54°C, wall ~7.7s/job).
Task 1 RTF medians: TT 0.903, FB 0.962; temp max 53°C; one VRAM spike 10,842MB
(cold model reload) triggered the GPU guard stop by design.

## Hardened rules (each earned the hard way)

1. **Platform name is `fb`, NOT `facebook`** — orchestrator
   `ALLOWED_PLATFORMS = {shopee, tiktok, fb, ig}` (api.py G1 lock).
   `/session/start` with `platforms:["facebook"]` → 422
   `unsupported platform: facebook`; tiktok-only sessions also 422 fb
   `/events/comment`. Adding a platform = `/session/stop` + `/session/start`
   with the full set while queue is empty (API state only, zero code change).
2. **FB live comment selector (verified)**:
   `div[aria-label*="comment" i] div[dir="auto"]` (29–45 visible nodes);
   `data-sigil="comment-body"` and `div[role="listitem"]` are weaker
   fallbacks. FB innerText is one line → user not separable; enqueue with
   placeholder user `fb-user` (dedup via full-text hash + per-platform key).
3. **CDP JS quoting**: build selector literals with `json.dumps(sel)` —
   `"-quoting breaks selectors containing `"` (TikTok
   `data-e2e="chat-message"`) → Runtime.evaluate returns null SILENTLY
   (Task 1: zero seen_comment on both platforms). Log an `eval_none` event
   on first null per selector so the failure is visible.
4. **Shared rate limiter (1 job/5s total) favors the denser room** (Round 2:
   TT 9 + FB 1 of cap 10). Balanced counts need a per-platform quota split
   inside the listener = code change = separate approval.
5. **Cap ledger discipline**: relaunching consumer/listener mid-window can
   overshoot a hard cap (Task 1: 12 TT processed vs 8 planned). Reconcile
   from `~/hafjet-chatterbox/autospeak_consumer_report.jsonl` by event_id
   nonce; cancel leftover pending via `/queue/ack {status:"cancelled"}`;
   report honest processed totals (user sends stop mid-execution).
6. **GPU guard on cold reload**: first job after model unload can spike VRAM
   past a 10GB stop (10,842MB, wall 32s) → consumer stops by design. Just
   relaunch to drain remaining jobs; idle returns to ~4.5GB / low 40s°C.
   Steady-state jobs are ~7-8s wall with VRAM ~8.5-8.8GB.
7. **Nested SSH quoting is a time sink**: inline `grep -E "…"` inside a
   double-hop ssh breaks (PowerShell EncodedCommand mangling, bash escape
   loops, silent exit-1 kills). Write the probe/killer python to /tmp,
   scp both hops (Hermes→Office→RTX), run with
   `/mnt/c/Python314/python.exe`. Kill scripts must match a unique cmdline
   token (`cdp_dual_listener`) so the Hermes gateway python.exe is never hit;
   taskkill /F on Windows skips `finally` blocks (no stop event in log).
8. **Windows artifacts**: `cdp_dual_listener.py` + `start_dual_listener.ps1`
   in `C:\Users\PC CUSTOM\hafjet-live-listeners\`; log
   `cdp_dual_listener.log`; stdout/stderr redirect via Start-Process (the
   launching ssh call timing out at 45s is cosmetic — the listener stays
   detached and runs).
9. **Summarize runs** with skill `scripts/summarize_autospeak_report.py`
   (scp to RTX /tmp, run with any python3, pass event_id prefixes).
