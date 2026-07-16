# NotebookLM Access — Install & Auth Detail

## Verified install (HAFJET-Hermes-Server, 2026-07-16)
Environment: Linux 6.8.0, Python 3.10 venv, 1GB RAM + 4GB swap. PEP 668 active.

```bash
cd /home/hafizi145
python3 -m venv .venv-notebooklm
source .venv-notebooklm/bin/activate
pip install --no-cache-dir notebooklm-py
# -> Successfully installed filelock-3.29.7 notebooklm-py-0.7.3
notebooklm --version   # -> NotebookLM CLI, version 0.7.3
notebooklm list        # -> "Not logged in" (expected before cookies supplied)
```

WARNING: `uv venv .venv-notebooklm` succeeded but `.venv-notebooklm/bin/uv` does NOT
exist, so `.venv-notebooklm/bin/uv pip install ...` fails with "No such file or
directory". Always use plain `pip` after `source bin/activate`. The global `uv`
binary is on PATH but `uv pip install` resolves to a different target — prefer the
venv `pip` to keep the package inside the venv.

## Auth Path 1 — One-shot storage_state.json (simplest)
Run ON A MACHINE WITH A BROWSER (user's laptop, not the server):
```bash
pip install notebooklm-py
notebooklm login          # opens Chromium, Google sign-in, writes storage_state.json
cat ~/.notebooklm/profiles/default/storage_state.json   # copy this JSON
```
On the server:
```bash
mkdir -p ~/.notebooklm/profiles/default
# write the pasted JSON to ~/.notebooklm/profiles/default/storage_state.json (0600)
notebooklm list           # should now list the user's notebooks
```
Validity: hours–days on a stable IP. Enough for one pull-and-generate session.

## Auth Path 2 — Master token (self-healing, best for recurring/automated)
Run ON A MACHINE WITH A BROWSER:
```bash
pip install "notebooklm-py[headless]"          # adds gpsoauth
notebooklm -p hafjet login --master-token --account hafjetai@gmail.com
# one browser sign-in captures single-use oauth_token, then durable master_token.json
```
Ship BOTH files to the server (each 0600):
- `~/.notebooklm/profiles/hafjet/master_token.json`
- `~/.notebooklm/profiles/hafjet/storage_state.json` (minted at bootstrap)

On the server, cookies re-mint automatically on expiry (L4 recovery ladder). Force a
re-mint with `notebooklm -p hafjet login --master-token-refresh`.

SECURITY: master token is full-account, durable, survives password changes until
revoked. Use a DEDICATED/throwaway Google account. Never log or commit it.

## Notebook ID extraction
From `https://notebooklm.google.com/notebook/3b143ab9-10cb-4e1c-a2fa-0178002717e1`
the ID is `3b143ab9-10cb-4e1c-a2fa-0178002717e1`.

## Pulling LAW299 revision content (the actual task that triggered this skill)
Once authenticated against Tuan Hafizi's LAW299 notebook:
```bash
ID=3b143ab9-10cb-4e1c-a2fa-0178002717e1
notebooklm --notebook $ID metadata --json          # confirm sources (PDFs/transcripts) present
# identify source IDs, then for each:
notebooklm --notebook $ID source get-fulltext <source_id> > /tmp/src_<n>.txt
# THEN build revision from the real extracted text (do NOT hallucinate content)
```
Note: web_extract on a raw notebooklm.google.com URL FAILS (login wall) — the CLI
with cookies is the only working path on this server.
