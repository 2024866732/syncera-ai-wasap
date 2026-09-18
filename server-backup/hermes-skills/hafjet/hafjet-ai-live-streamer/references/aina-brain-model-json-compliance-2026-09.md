# Aina brain model selection: JSON compliance first (2026-09)

**This file corrects `groq-brain-tailscale-egress-and-persistence.md` §4**, which still recommends
`qwen/qwen3.6-27b`. That recommendation is **superseded** — see the table below. Trust this file.
(`references/INDEX.md` could not be updated in the same session due to a write-guard deadlock, so if
the index still points at `qwen3.6-27b`, this file wins.)

## The failure mode, and why it looks like something else

Symptom reported by Tuan: *"Aina tak balas"* / a second comment goes unanswered. The listener was
fine, the consumer was running, LiveTalking was not stuck. The orchestrator's decisions came back as:

```json
{"event_id": "...", "actions": [{"type": "ignore", "text": null, "reason": "llm_error"}],
 "is_paused_honored": true}
```

`reason: "llm_error"` is the orchestrator wrapping a failure from `agent/ainta_brain` → `agent/llm_client`.
Two different root causes hide behind that single string:

| Signature | Cause |
|---|---|
| **~0.4 s** latency, empty text, episodic | Request rejected before generation — **HTTP 429** (Groq free-tier TPM) or Cloudflare 403 |
| **≥1 s** latency, model *did* return a long body | Output the naive parser cannot use — **`<think>`-prefixed reasoning models** |

`agent/llm_client.parse_json_object()` strips ``` fences, tries `json.loads`, then falls back to
`text[find("{") : rfind("}")+1]`. A reasoning model that emits `<think>…reasoning…</think>` and *then*
the JSON makes that fallback grab the whole thinking blob → `LlmError("llm_json_parse")`.

## Measured model matrix (3 samples each, same prompt shape as the orch path)

| Model | JSON OK | `<think>` block | Latency | Notes |
|---|---|---|---|---|
| `groq/compound-mini` | **3/3** | none | ~1.2 s | **SELECTED** — 70k TPM headroom, good BM output |
| `openai/gpt-oss-20b` | 3/3 | none | ~1.1 s | clean BM, but only **8,000 TPM** |
| `openai/gpt-oss-120b` | 3/3 | none | ~1.0 s | clean, 8,000 TPM |
| `allam-2-7b` | 3/3 | none | 0.5 s | parses, but echoes the literal placeholder `<ayat pendek BM>` |
| `qwen/qwen3.6-27b` | **0/3** | **yes** | 0.4–2.1 s | unusable without editing `llm_client.py` |

## Rate limits are the second trap — read the headers

A big persona + catalog prompt burns roughly 1.5–2k tokens per call, so a token-cap (not request-cap)
model dies after only a few comments:

```
openai/gpt-oss-20b   x-ratelimit-limit-tokens = 8000    limit-requests = 1000
groq/compound-mini   x-ratelimit-limit-tokens = 70000   limit-requests = 250
```

Log the headers once per candidate instead of guessing; a "the model works, then stops" complaint is
almost always TPM, not a bug. Do **not** "fix" a 429 by changing config — wait out the sliding window
(60 s was enough for the earlier probe case) or move to a higher-TPM model.

## Operational rules that came out of this

- Live value lives in `~/.config/hafjet-live/orch.env` → `AINA_LLM_MODEL=groq/compound-mini`.
  **Tuan** rotates `AINA_LLM_API_KEY` himself; the agent never writes secrets, and any key pasted into
  Telegram is burned.
- Changing the model means `systemctl --user restart hafjet-orch.service` — which **resets session
  state to idle** (in-memory). Re-`POST /session/start` before pushing comments and do not quote a
  pre-restart `event_count`.
- Before declaring a model good, run ~8 comments through the **orch path** (not just a direct API call):
  direct calls bypass the persona prompt and the orchestrator's parser, which is exactly where the
  failures live. A clean run shows every comment returning `speak` or `ignore` with `reason: null`.
- Diagnostic shortcut: probe `/events/comment` and print the full action object including `reason`.
  `reason: "llm_error"` with a real store question (e.g. "Aina kedai bukak ke hari ni?") is the signal
  to suspect the model, not the listener.
