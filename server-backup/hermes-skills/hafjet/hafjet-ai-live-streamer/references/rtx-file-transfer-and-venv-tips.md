# RTX file transfer + venv tips (verified 2026-08-28)

Session-specific detail for pushing scripts to the RTX WSL2 host and installing
small deps without touching `venv-livetalking` or the repo.

## Pushing a file Hermes → Office → RTX (relay)

Do NOT try to pipe a file through the two-hop jump with `<` redirection:

```bash
# WRONG — `cat > /tmp/x.py < /tmp/x.py` inside the Office-shell jump runs on OFFICE:
#   the < redirect is consumed by the OFFICE shell; RTX path "not found" errors follow.
ssh office 'ssh rtx "cat > /tmp/x.py" < /tmp/x.py'   # file lands on OFFICE, not RTX

# CORRECT — relay in two scp steps:
scp /tmp/x.py hafizi145@100.121.94.41:/tmp/x.py
ssh hafizi145@100.121.94.41 'scp -i ~/.ssh/id_ed25519_office2rtx /tmp/x.py hafjet@100.119.32.87:/tmp/x.py'

# Then run commands on RTX explicitly (nested jump):
ssh hafizi145@100.121.94.41 'ssh -i ~/.ssh/id_ed25519_office2rtx hafjet@100.119.32.87 "RTX_COMMAND"'
```

Single-hop ProxyJump also works for both file and exec:
```bash
ssh -J hafizi145@100.121.94.41 hafjet@100.119.32.87 "cat > /tmp/x.py" < /tmp/x.py
ssh -J hafizi145@100.121.94.41 hafjet@100.119.32.87 "RTX_COMMAND"
```

Common symptom of the wrong pattern: `bash: line 1: /home/hafizi145/hafjet-chatterbox/venv-chatterbox/bin/python: No such file or directory` — that is the OFFICE path, proving the command ran on Office, not RTX.

## uv is not on PATH in non-login RTX shells

`uv` lives at `~/.local/bin/uv` but non-login SSH shells do not have `~/.local/bin`
on PATH. Always invoke by full path:

```bash
~/.local/bin/uv pip install --python ~/hafjet-chatterbox/venv-chatterbox/bin/python websocket-client
```

Useful for adding small listener deps (`websocket-client`) to the dedicated
Chatterbox venv WITHOUT touching `venv-livetalking` (hard rule).

## CDP listener dependency note

The Chatterbox venv (`venv-chatterbox`) has no pip module (uv-created). Install
extra packages with `uv pip install --python <venv>/bin/python ...` only.
`websocket-client` was added this way for the CDP TikTok listener.
