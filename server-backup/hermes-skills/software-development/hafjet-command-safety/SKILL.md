---
name: hafjet-command-safety
description: HAFJET-Hermes-Server command-execution SOP. Banned patterns (curl|python3, heredoc, .env redirection) and the safe alternatives Tuan Hafizi requires before any terminal work.
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Server Command Safety SOP

Tuan Hafizi enforces a strict command-approval security policy on the
HAFJET-Hermes-Server (Azure, Ubuntu). Violating it gets the command **DENIED**
and wastes a turn. Internalize this before proposing ANY terminal command.

## BANNED patterns (will be denied — do NOT propose them)

- `curl ... | python3 -c "..."`
  Pipes network output straight into the interpreter. HIGH risk (injection /
  credential exfiltration). Classed same as `curl | sh`.

- `python3 << 'EOF' ... EOF`
  Agent-supplied heredoc script executed on the server. Flagged as arbitrary
  script execution — agent is running code Tuan didn't review.

- `cat >> ~/.hermes/.env` or ANY redirection writing to a dotfile
  (`~/.hermes/.env`, `~/.bashrc`, `~/.config/**`). Agent must NEVER write
  secrets or config. Hidden lines in an approval prompt = invisible edits.

- **Python script writing to .env** (e.g. `open('/path/.env','a').write(...)`)
  Writing to `.env` via a Python script from `/tmp/` is NOT safe — it achieves
  the same outcome as shell redirection without Tuan reviewing the secret being
  written. The intent of the rule is: **Agent never modifies .env by any
  means.** The suggested `KEY=VALUE` line goes in the response text; Tuan adds
  it via `nano ~/.hermes/.env`.

- Any shell redirection that writes credentials/tokens to a file
  (e.g. `echo TOKEN > file`, `curl -d @file` with secrets in history).

## REQUIRED alternatives (safe form)

- **Parse API output:** write a `.py` script to `/tmp/` (or a project dir)
  with `write_file`, THEN run `python3 /tmp/script.py`. No pipe, no heredoc.
- **Fetch then inspect:** `curl -s URL -o /tmp/file.json` (save to file),
  then parse with a SEPARATE script that reads the file — never `curl | python3`.
- **Edit `.env`:** AGENT SUGGESTS the exact `KEY=VALUE` lines; Tuan edits
  manually via `nano ~/.hermes/.env`. Agent never writes there.
- **Dotfile config:** tell Tuan the exact key=value to add; he applies it himself.
- **Test external API:** Tuan can run `curl -X GET ...` himself, or agent writes
  a `.py` file that reads token from env and prints result — Tuan runs it.

## Why this matters

- Server runs production-ish HAFJET infra (Loyverse POS, WhatsApp Cloud bot,
  Gmail). A bad pipe or leaked token is hard to undo.
- Tuan wants to SEE and APPROVE every script before it runs. Agent generates;
  Tuan executes/edits. This is the standing SOP — not a one-off.
- Hermes redacts secrets in tool output by default. Do NOT disable redaction,
  and do NOT paste tokens into chat. Have Tuan run token-bearing commands himself.

## Approval gate summary

| Pattern | Verdict |
|---------|---------|
| `curl \| python3 -c` | ❌ DENY |
| `python3 << 'EOF'` | ❌ DENY |
| `cat >> ~/.hermes/.env` | ❌ DENY |
| Write `.py` to file → run manually | ✅ OK |
| `curl -s URL -o /tmp/f.json` then parse | ✅ OK |
| Suggest `.env` lines, Tuan edits | ✅ OK |

## When Tuan says "deny"
Do not retry, rephrase, or achieve the same outcome another way. Stop the
workflow, explain what you would have done, and wait for Tuan to apply it
manually or redirect you.
