# RTX Direct SSH, Mid-Live Read-Only Checks & OBS Asset Shipping (2026-08)

Session-verified procedures complementing `windows-rtx-local-tiktok-listener.md`.

## 1) Direct Hermes → RTX SSH (verified 2026-08-26)

Office hop `hafizi145@100.121.94.41` → `id_ed25519_office2rtx` remains the fallback, but Hermes can now reach `hafjet@100.119.32.87` directly: its `~/.ssh/id_rsa.pub` was staged Office→RTX `/tmp` and **appended idempotently** (`grep -qxF || >>`) to `~/.ssh/authorized_keys`. Rules that kept this safe:

- Public key only; never transmit/display private key material.
- Never rewrite/delete `authorized_keys` — always append-if-absent.
- The scanner flags raw-IP URLs ([MEDIUM]) and dotfile redirection ([HIGH]); both are expected here and were separately approved. Do not switch to password auth as a workaround.
- Verify after authorization: `ssh -o BatchMode=yes hafjet@100.119.32.87 'id -un'` → `hafjet`.
- When Tailscale flakes (`ssh timeout`), retry later. Do not retarget work to other nodes.

## 2) Read-only live check when Tuan reports "I'm live" mid-session

Attaching to read a live room's comments = evidence-only: CDP tab list/DOM comment counts only. No typed reply, like, follow, share, speak, `/humanaudio`, no relaunches while Tuan streams.

- **CDP is per-Chrome-instance.** Port `9223` exists only if the dedicated-profile Chrome was launched with `--remote-debugging-port=9223`. A normal browser window or TikTok Live Studio has no debugging port → `/json/list` refuses (`WinError 10061`). Check listeners first: PowerShell `Get-NetTCPConnection -State Listen -LocalPort 9223`; Chrome process presence alone proves nothing.
- **Windows probes from WSL interop:** absolute path `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` (bare `powershell.exe` is not on WSL PATH). Quoting pitfalls hit twice: paths with spaces ("C:\Users\PC CUSTOM\...") break plain `-Command`, and naive quoting turned an .exe launch log into Python source (SyntaxError from VC_redist output). Working pattern: run Windows-side Python helper directly — `/mnt/c/Python314/python.exe 'C:\\Users\\PC CUSTOM\\hafjet-live-listeners\\scripts\\list_cdp.py'` where `list_cdp.py` just prints `http://127.0.0.1:9223/json/list` JSON (staged from Hermes repo `scripts/list_cdp.py`).
- If nothing listens on 9223: report BLOCKED honestly, name what would fix it (relaunching listener Chrome with debugging flags), and WAIT. Do not kill/relaunch the user's browser mid-live.
- Helper scripts must be delivered `scp hafjet@RTX:/tmp/... → cp "/mnt/c/Users/PC CUSTOM/hafjet-live-listeners/scripts/"` (quote the space).

## 3) Shipping OBS overlay assets to the Windows host (verified 2026-08-26)

Generate locally then ship — never open/mutate OBS scenes yourself (adding Image Sources stays manual/Tuan-owned):

```bash
python3 scripts/gen_obs_overlay_assets.py   # ai-streamer.png & aina-hafjet.png 520x96, product-banner.png 680x210 (reads catalog/products.json first ACTIVE item)
scp obs/assets/{ai-streamer,aina-hafjet,product-banner}.png hafjet@100.119.32.87:~/   # staged copies
ssh hafjet@100.119.32.87 'mkdir -p "/mnt/c/Users/PC CUSTOM/hafjet-obs-assets"'
ssh hafjet@100.119.32.87 'cp ~/ai-streamer.png ~/aina-hafjet.png ~/product-banner.png "/mnt/c/Users/PC CUSTOM/hafjet-obs-assets/"'
ssh hafjet@100.119.32.87 'ls -la "/mnt/c/Users/PC CUSTOM/hafjet-obs-assets/"'
ssh hafjet@100.119.32.87 'rm ~/ai-streamer.png ~/aina-hafjet.png ~/product-banner.png'   # cleanup temp, separate step
```

Verification that survived (Pillow absent on WSL system Python): `file <each>.png` → `PNG image data, 520 x 96 / 680 x 210 … RGBA` plus magic bytes `8950 4e47`. `scp` with multiple sources AND a spaced destination path fails (`ambiguous target`) — stage to `~/` first, then single-source-style quoted copy, or scp one file at a time with fully quoted target.

Layer order when Tuan adds them manually: Background → Avatar capture → watermark chip bottom-right → banner top-left; keep Aina's face uncovered; wording stays "AI Streamer"/"Aina · HAFJET". See `obs-overlay-assets.md`.
