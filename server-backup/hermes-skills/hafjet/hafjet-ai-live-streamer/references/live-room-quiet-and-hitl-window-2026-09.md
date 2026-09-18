# Quiet-room diagnosis + HITL window sizing (2026-09)

Delta from `groq-brain-tailscale-egress-and-persistence.md`. Both items came out of the
`@hafizi.raub/live` v5 cap-10 session where the listener looked broken but was not.

## 1. An empty room is NOT a broken selector

Symptom: listener launched fine, `start` logged with `max_enq=10`, then **no** `enqueue` lines
for minutes. Previously the same silence meant the CDP tab had drifted to `tiktok.com/foryou`
(see the `/live` filter note in the egress reference) — this time the tab was correct.

Evidence collected before touching anything (`scripts/cdp_dom_evidence_probe.py`):

```json
{"url": "https://www.tiktok.com/@hafizi.raub/live",
 "title": "HAFIZI GAMING (@hafizi.raub) is LIVE - TikTok LIVE",
 "counts": {"chatMessage": 0, "ownerName": 1, "liveChatContainer": 1, "anyChat": 8},
 "e2e": ["live-chat-container", "public-screen-live-chat-slot", "enter-message",
         "message-owner-name", "room-chat-input-field", "room-chat-send-button"],
 "bodySample": "… LIVE royazizan ChipNiBoss 1.2K LIVE hafizi.raub HAFIZI GAMING 2 …"}
```

`live-chat-container` innerHTML also showed `Viewers · 3` and a placeholder `<div style="height:182px">`
— i.e. a healthy container with **zero messages**. Room genuinely quiet.

**Rule:** with `chatMessage == 0` but `liveChatContainer` present, do not edit a selector.
Confirm the room is chatty (viewer count, body text, `enter-message` present) and wait.
Only suspect the selector when comments visibly scroll on screen while the count stays 0.

Probe from the RTX Windows host (reads only — never types, clicks or touches chat input):

```bash
scp scripts/cdp_dom_evidence_probe.py hafjet@<rtx>:/tmp/
ssh hafjet@<rtx> '/mnt/c/Python314/python.exe /tmp/cdp_dom_evidence_probe.py'            # default match "tiktok.com"
ssh hafjet@<rtx> '/mnt/c/Python314/python.exe /tmp/cdp_dom_evidence_probe.py facebook.com'
```

Needs `websocket-client` on the Windows Python. First comment arrived the moment the host typed:
`enqueue n=1 "Host Assalamualaikum"` → Groq `speak` → queue
`"Waalaikumussalam bro! Welcome ke live HAFJET."` (n=2 was seen but skipped by the 1/5s rate limit).

## 2. Window sizing when Tuan types the test comments

- `MAX_SEC=600` lapsed **twice** mid-session while waiting for a human to type. Relaunch with
  `MAX_SEC=1800` (cap untouched, e.g. `MAX_ENQ=10`) and keep `RATE_S=5`.
- Compute and report the budget explicitly instead of guessing:

```bash
NOW=$(date +%s); echo "remaining=$(( <run_start_ts> + MAX_SEC - NOW ))"
```

- Relaunch the expired window rather than asking him to hurry. Re-apply the listener copy to the
  **Windows** path each time (`cp /tmp/cdp_dual_listener.py "C:\Users\PC CUSTOM\hafjet-live-listeners\"`),
  and confirm the new `start` line carries the intended `max_enq`/`max_sec`.

## 3. Reminder: normal-looking non-zero exits

`start_dual_listener.ps1` invoked over SSH exits **124** right after printing
`DUAL_LISTENER_LAUNCHED` — that is the detached launch, not a failure. Likewise a previous
ad-hoc tunnel/orch killed by a config switch reports **143/255** and is *superseded*.
Always read the live artifact (listener log tail, `ss -tlnp`, `systemctl --user is-active`,
`/queue`) and, in the Telegram report, name the notification as an old process.
