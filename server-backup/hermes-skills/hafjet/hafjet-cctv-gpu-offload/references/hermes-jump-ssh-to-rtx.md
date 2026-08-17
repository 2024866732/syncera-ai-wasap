# Hermes → RTX SSH jump (2026-08-17)

Azure Hermes-Server normally **cannot** `ssh hafjet@100.119.32.87` directly:

- Offline → connection timeout  
- Online without key → `Permission denied (publickey)`  
- Hermes `~/.ssh` often only has `id_rsa`, **not** `id_ed25519_office2rtx`

## Working path

Key lives on **PC Office** (`hafizi145@100.121.94.41`):

```bash
ssh -o BatchMode=yes -o ConnectTimeout=12 hafizi145@100.121.94.41 \
  'ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes -o ConnectTimeout=12 \
   hafjet@100.119.32.87 '"'"'hostname; /usr/lib/wsl/lib/nvidia-smi || nvidia-smi'"'"
```

- RTX WSL user: **`hafjet`** (not hafizi145)  
- Tailscale: `desktop-rhdusf3-1` = 100.119.32.87  

Used by CCTV offload **and** AI Live Streamer G2 deploy.  
Optional later: install Hermes→RTX dedicated key (separate approve).

Live streamer lock coexistence: `references/live-gpu-lock-coexistence.md`.
