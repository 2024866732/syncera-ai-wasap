---
name: notebooklm-access
description: Access NotebookLM notebooks programmatically from this headless server via notebooklm-py (unofficial Google API) — read sources, pull fulltext, ask grounded questions, and generate study guides / quizzes / revision content. Triggers when the user shares a notebooklm.google.com URL, references a NotebookLM notebook, asks to install/use notebooklm-py (github.com/teng-lin/notebooklm-py), or wants to pull their NotebookLM notes/sources into Hermes for summarization, revision, or study-material generation.
---

# NotebookLM Access (headless server)

## When to use
- User pastes a `notebooklm.google.com/notebook/<ID>` link and wants its contents read/summarized.
- User asks to install/use `notebooklm-py`.
- User wants to pull NotebookLM sources/fulltext and generate revision notes, summaries, quizzes, or study guides grounded on those sources (e.g. LAW299 exam revision from lecture transcripts uploaded to NotebookLM).
- User says notes are "in my notebook" expecting Hermes to read them.

## HARD CONSTRAINT: NotebookLM has NO public OAuth
Auth = **scraped Google session cookies** in `~/.notebooklm/profiles/<profile>/storage_state.json`. No API key, no OAuth scope, no service account. This server is **headless (no browser/screen)**, so `notebooklm login` (which drives a Playwright Chromium sign-in) **cannot run here**. The user MUST mint cookies on a machine that HAS a browser, then bring them to the server.

Two auth paths (see `references/install-and-auth.md` for verbatim steps):
1. **One-shot `storage_state.json`** (simplest): run `notebooklm login` on the user's laptop → copy `~/.notebooklm/profiles/default/storage_state.json` → paste the JSON into the server. Valid hours–days on a stable IP. Enough for a single pull-and-generate session.
2. **Master token (self-healing)** (best for recurring/automated): `pip install "notebooklm-py[headless]"`, then `notebooklm -p <profile> login --master-token --account <gmail>` on the laptop; ship BOTH `master_token.json` and `storage_state.json` to the server. Cookies auto re-mint on expiry — no browser needed afterward. Use a DEDICATED/throwaway Google account (master token is full-account, infostealer-grade, survives password changes until revoked).

## Install (VERIFIED on HAFJET-Hermes-Server, 1GB RAM)
Install the LIGHT build (NO `[browser]` extra) — Chromium is NOT needed because auth comes from externally supplied cookies, not Playwright. Saves RAM.
```bash
cd /home/hafizi145
python3 -m venv .venv-notebooklm
source .venv-notebooklm/bin/activate
pip install --no-cache-dir notebooklm-py   # plain, NOT [browser]
notebooklm --version   # expect 0.7.x
```
Pitfall: `uv venv` creates the venv but does NOT put a `uv` binary inside `.venv/bin/`, so `uv pip install` inside the activated venv fails — use plain `pip` after `source bin/activate`.

## Verify auth before doing any work
```bash
source /home/hafizi145/.venv-notebooklm/bin/activate
notebooklm list
# "Not logged in" => supply cookies first (see auth paths above)
```

## Pulling notebook content (after auth)
Notebook ID = the `<ID>` segment from `notebooklm.google.com/notebook/<ID>`.

**⚠️ CRITICAL CORRECTION (verified 2026-07-16): there is NO `-n` global flag.** Older notes claimed `notebooklm -n <ID> metadata` works — it does NOT (`Error: No such option '-n'`). The correct flow is TWO steps: first `notebooklm use <ID>` to set session context (partial-ID match works, e.g. `a7416353`), then run subcommands WITHOUT `-n`. Env fallback `NOTEBOOKLM_NOTEBOOK` is also not a real flag — use `use`.

```bash
source /home/hafizi145/.venv-notebooklm/bin/activate
notebooklm use <ID>                       # set active notebook context (persists for session)
notebooklm metadata                       # list sources + artifacts (NO -n; titles only, no --json ID column)
notebooklm source fulltext <source_id>    # full indexed text of ONE source
notebooklm ask --prompt-file q.txt        # grounded Q&A (stateful — see Pitfalls)
notebooklm generate report --format study-guide --prompt-file p.txt --wait --json
notebooklm download report ./guide.md --force
notebooklm generate quiz --difficulty hard
notebooklm download quiz --format markdown ./quiz.md
```

**Subcommand gotchas:**
- Source fulltext is `source fulltext <source_id>` — NOT `get-fulltext` (errors: "No such command 'get-fulltext'. Did you mean 'fulltext'?").
- `source fulltext <N>` matches by partial-ID/ordinal ambiguously — `source fulltext 5` may resolve to a DIFFERENT source than the 5th listed in `metadata`. For reliable single-source pulls, prefer `ask --prompt-file` grounded extraction.
- `metadata --json` returns sources WITHOUT an `id` field (only title) — you cannot map ordinal→source_id from JSON; rely on `ask` instead.

Use `--prompt-file PATH` for long prompts (never put long prompts on the shell line). Full cookbook incl. a worked LAW299 example: `references/notebooklm-cli-cookbook.md`.

## Pitfalls
- **Unofficial / ToS-grey**: uses undocumented Google `batchexecute` RPC; endpoints can break without notice. Fine for reading your OWN notebook; don't rely on it for production.
- **Cookies expire**: `__Secure-1PSIDTS` rotates (~600s hint, stale values work hours–days). If `notebooklm list` starts 302-redirecting to signin, re-supply cookies or re-mint master token.
- **Workspace/Enterprise accounts**: admin session-binding (DBSC) NOT supported — use a personal Google account.
- **Secrets**: treat `storage_state.json` / `master_token.json` as 0600 secrets; redact before logging.
- **`ask` is STATEFUL / conversational.** Each `ask` continues one thread (output shows "Continuing conversation <uuid>" / "Resumed conversation"). Repeated `ask` calls leak prior context and can cross-contaminate answers — be explicit and self-contained per call, and when stitching several `ask` outputs together, note the leakage. For a clean fresh answer, the user can reset the conversation in the NotebookLM UI.
- **`generate report` takes EITHER a positional DESCRIPTION OR `--prompt-file`, NOT BOTH.** Passing both errors: "Cannot use both the description argument and --prompt-file." Use `--format study-guide --prompt-file p.txt` (no positional arg) for long targeted prompts; use the positional arg only for short custom one-liners.
- **Source-type warnings are harmless.** "Unknown source type code 0" for some uploaded PDFs — metadata still returns the full source list fine.
- **TRUST the source-grounded answer over your own canon.** When you `ask` NotebookLM to list cases/sections, it will flag items that are NOT in the user's materials (e.g. "Jones v Padavatton — Not found in the sources"). The user's syllabus often differs from standard textbooks — surface "these cases you mentioned aren't in your notebook" to the user rather than inventing them. This is the single biggest value of grounding on their notebook.

## Reference
- `references/install-and-auth.md` — verified install log + both auth flows verbatim.
- `references/notebooklm-cli-cookbook.md` — verified CLI flags, end-to-end flow, error table, and the LAW299 grounding lesson.
