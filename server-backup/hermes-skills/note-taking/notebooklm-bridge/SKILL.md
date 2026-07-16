---
name: notebooklm-bridge
description: Access a user's Google NotebookLM notebooks from a headless Hermes server (no browser/GUI) using the unofficial notebooklm-py library. Activate when the user references a notebooklm.google.com notebook, pastes a NotebookLM share link, says "my notes are in NotebookLM", or wants you to read/summarize/quiz/generate from their NotebookLM sources. Covers install (RAM-safe), the auth-handoff workflow from a browser machine, the CLI command surface, and the flag pitfalls that break naive invocations. Do NOT use this to fabricate content — its whole purpose is to ground output in the user's actual uploaded sources.
---

# NotebookLM Bridge (headless server → NotebookLM)

## When to use
- User gives a `notebooklm.google.com/notebook/<ID>` link and expects you to read its contents.
- User says their notes/lectures/PDFs/transcripts are "in NotebookLM" and wants revision, summary, quiz, or analysis from them.
- `web_extract` on the link fails (it will — NotebookLM is behind a Google login wall; there is **no public API**).

## The core constraint
NotebookLM has no official API or OAuth scope. `notebooklm-py` (teng-lin/notebooklm-py, MIT) drives Google's *undocumented* `batchexecute` RPC using scraped session cookies. It is "ToS-grey" but fine for reading your own notebooks. It works headless **only if you supply a `storage_state.json`** captured from a real browser sign-in.

## Install (RAM-safe on small servers)
The server in play had 1 GB RAM + 4 GB swap. Avoid the `[browser]` extra (it pulls Playwright + ~170 MB Chromium you do NOT need server-side — auth happens on the user's machine).
```bash
cd ~ && python3 -m venv .venv-notebooklm
source .venv-notebooklm/bin/activate
pip install notebooklm-py          # plain, no [browser]
# CLI lands at ~/.local/bin/notebooklm (or venv/bin/notebooklm)
```
Verify: `notebooklm --version` → e.g. `NotebookLM CLI, version 0.7.3`.

## Auth handoff (the key workflow)
Server has no browser, so the user generates cookies on a machine that has one:
1. **On user's machine (Windows/Mac/Linux with browser):**
   ```
   pip install notebooklm-py
   notebooklm login            # opens Chromium; user signs in with the Google account that owns the notebook
   ```
   Cookies saved at:
   - Windows: `C:\Users\<user>\.notebooklm\profiles\default\storage_state.json`
   - macOS/Linux: `~/.notebooklm/profiles/default/storage_state.json`
2. **User delivers the file** to the chat (send as a document/attachment, or paste JSON). On iPhone Telegram, sending the `.json` as a document works; pasting huge JSON also works but may be truncated — prefer the file.
3. **On server:** place it and lock perms:
   ```bash
   mkdir -p ~/.notebooklm/profiles/default
   cp /path/to/storage_state.json ~/.notebooklm/profiles/default/storage_state.json
   chmod 600 ~/.notebooklm/profiles/default/storage_state.json
   ```
4. Test: `notebooklm list` → should print the user's notebooks (title + ID + Owner/Shared).

### Privacy warning (always tell the user)
`storage_state.json` = **full Google session cookies** (can read NotebookLM, and a slice of the account). Advise the user to revoke the session afterwards at `https://myaccount.google.com/device-activity`. Never log, commit, or forward it to groups.

## CLI command surface (verified against v0.7.3)
Notebook ID supports **partial match** (e.g. `3b143ab9` matches the full UUID). Most commands take `-n <id>` (NOT `--notebook`).

| Task | Command |
|---|---|
| List notebooks | `notebooklm list` |
| Notebook metadata + source list | `notebooklm metadata -n <id> --json` |
| Generate study guide (from all sources) | `notebooklm generate report --format study-guide -n <id> --prompt-file prompt.txt --wait --json` |
| Download latest report as markdown | `notebooklm download report /path/out.md -n <id> --force` |
| Targeted Q&A grounded on sources | `notebooklm ask -n <id> --prompt-file q.txt` |
| Generate quiz | `notebooklm generate quiz -n <id> --prompt-file q.txt --wait --json` |
| Download quiz | `notebooklm download quiz /path/out.md -n <id> --force` |
| Generate mind-map | `notebooklm generate mind-map -n <id>` (no `--wait`!) |
| Download mind-map JSON | `notebooklm download mind-map /path/out.json -n <id> --force` |

For long prompts use `--prompt-file /tmp/x.txt` (the CLI rejects inline `--prompt` on `generate report`, and shells choke on long args). `notebooklm ask` **reuses a single conversation across calls** in one process — so successive `ask` calls are answered in the same thread (good for follow-ups, but be aware the bot accumulates context and may say "not in sources" for cases you assumed exist).

## Pitfalls (hit and fixed this session)
- ❌ `notebooklm --notebook <id> metadata` → `No such option '--notebook'`. Use `metadata -n <id>`.
- ❌ `notebooklm generate report "study-guide" --prompt "..."` → cannot use both arg + `--prompt`. Use `--format study-guide --prompt-file x.txt`.
- ❌ `notebooklm download report --format markdown out.md` → `No such option '--format'` (download has no format flag; format is chosen at generate time). Just `download report out.md`.
- ❌ `notebooklm generate mind-map --wait` → `No such option '--wait'`. Mind-map has no wait; just run then download (artifact appears quickly).
- ❌ Don't install `[browser]` on a RAM-tight server — wastes ~170 MB and isn't needed.
- ⚠️ `notebooklm ask` returns a JSON blob with `answer` key when `--json` is passed; parse with `json.load` then read `d['answer']`. Without `--json` it prints the text directly.
- ⚠️ Mind-map JSON uses `name` + `children` keys (NOT `root`/`text`). Walk recursively on `node['children']` printing `node['name']`.

## Grounding discipline (critical for exam/legal/study tasks)
When the user says "use MY sources exclusively" / "based on my notes", you MUST:
1. Pull the real content first (metadata → fulltext/ask/generate).
2. Compare what the user *assumed* the sources contain vs. what they actually contain.
3. Explicitly flag famous cases/topics the user mentioned that are **absent** from their sources (e.g. a lecturer may teach a different case list than standard textbooks). Do NOT invent them. This is the single highest-value behavior — it prevents the user from studying the wrong material.

See `references/workflow-example.md` for the exact end-to-end run that produced a LAW299 revision set.
