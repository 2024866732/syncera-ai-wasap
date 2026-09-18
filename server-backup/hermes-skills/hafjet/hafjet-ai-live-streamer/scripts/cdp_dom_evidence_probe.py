#!/usr/bin/env python3
"""CDP DOM evidence probe for a TikTok/FB live room (HAFJET live-streamer).

WHY: when a listener reports 0 comments, the first question is ALWAYS
"is the room actually chatty, or is the selector wrong?". This prints the
evidence needed to answer that without touching selectors.

Run this ON THE NODE THAT OWNS THE BROWSER (RTX Windows host):
    /mnt/c/Python314/python.exe /tmp/cdp_dom_evidence_probe.py
    # optional: pass a substring to pick the tab, default "tiktok.com"
    /mnt/c/Python314/python.exe /tmp/cdp_dom_evidence_probe.py facebook.com

Reads only. Never types, clicks, or touches chat input.

Interpreting the output:
  * chatMessage.count == 0 but liveChatContainer present and viewers > 0
      -> room is genuinely quiet. NOT a selector bug. Wait / ask the host
         to type. Do not edit selectors.
  * chatMessage.count == 0 while comments are visibly scrolling on screen
      -> NOW suspect the selector: compare `e2e` inventory + chat-container
         innerHTML against the listener's selector and patch the listener.
  * tab_url not ending in /live  -> navigate first (Page.navigate), the
      listener filter requires /live.
"""
from __future__ import annotations

import json
import sys
import urllib.request

try:
    import websocket  # websocket-client
except ImportError:  # pragma: no cover
    print("MISSING_websocket_client: pip install websocket-client")
    sys.exit(2)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CDP = "http://127.0.0.1:9223"
MATCH = sys.argv[1] if len(sys.argv) > 1 else "tiktok.com"

PROBE_JS = r"""(() => {
  const q = (s) => document.querySelectorAll(s);
  const counts = {
    chatMessage: q('[data-e2e="chat-message"]').length,
    ownerName: q('[data-e2e="message-owner-name"]').length,
    liveChatContainer: q('[data-e2e="live-chat-container"]').length,
    commentClass: q('[class*="comment" i]').length,
    anyChat: q('[data-e2e*="chat" i]').length,
  };
  const texts = [...q('[data-e2e="chat-message"]')]
      .slice(-6)
      .map(n => (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90));
  const e2e = [...new Set([...document.querySelectorAll('[data-e2e]')]
      .map(n => n.getAttribute('data-e2e')))]
      .filter(v => /chat|comment|live|message|viewer/i.test(v));
  const c = document.querySelector('[data-e2e="live-chat-container"]');
  const body = document.body ? document.body.innerText.replace(/\s+/g, ' ') : '';
  return JSON.stringify({
    url: document.URL,
    title: document.title,
    counts,
    texts,
    e2e,
    chatHtml: c ? c.innerHTML.replace(/\s+/g, ' ').slice(0, 400) : null,
    bodyLen: body.length,
    bodySample: body.slice(0, 240),
  });
})()"""


def pick_tab() -> dict:
    with urllib.request.urlopen(f"{CDP}/json/list", timeout=8) as r:
        pages = json.loads(r.read())
    for p in pages:
        if MATCH in p.get("url", ""):
            return p
    raise SystemExit(f"NO_TAB_MATCHING {MATCH}: {[p.get('url') for p in pages]}")


def evaluate(ws, expr: str) -> str | None:
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == 1:
            return (msg.get("result", {}).get("result", {}) or {}).get("value")


def main() -> int:
    tab = pick_tab()
    ws = websocket.create_connection(f"ws://127.0.0.1:9223/devtools/page/{tab['id']}")
    try:
        raw = evaluate(ws, PROBE_JS)
    finally:
        ws.close()
    data = json.loads(raw) if raw else {}
    print("EVIDENCE", json.dumps(data, ensure_ascii=False, indent=2))

    url = data.get("url", "")
    counts = data.get("counts", {})
    verdict = []
    if "/live" not in url:
        verdict.append("TAB_NOT_ON_/live -> navigate to the exact room URL first")
    if counts.get("chatMessage") == 0 and counts.get("liveChatContainer"):
        verdict.append("chat container present / 0 messages -> room quiet, likely NOT a selector bug")
    if counts.get("chatMessage", 0) > 0:
        verdict.append("comments detected -> selector is working")
    print("VERDICT:", " | ".join(verdict) or "inconclusive")
    return 0


if __name__ == "__main__":
    sys.exit(main())
