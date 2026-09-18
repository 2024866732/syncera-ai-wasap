# Groq-brain egress + persistence (Tailscale, 2026-09)

Supersedes the Office-jump parts of `groq-socks-aina-brain-2026-09.md`. Brain stays on Hermes orch (`AINA_*`); RTX only does TTS + `/humanaudio`.

## 1. Egress path — direct Tailscale, no Office jump

Azure Hermes → `api.groq.com` = Cloudflare **1010**. Fix = loopback SOCKS terminating on RTX.

```bash
# seed host key ONCE, else "Host key verification failed" and the unit crash-loops
ssh-keyscan -T 5 100.65.152.29 >> ~/.ssh/known_hosts

ssh -N -D 127.0.0.1:10808 -o BatchMode=yes -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 hafjet@100.65.152.29
```

- RTX WSL Tailscale IP **100.65.152.29**, works with Hermes `~/.ssh/id_rsa` (`hostname` → `DESKTOP-RHDUSF3`).
- Office-jump form (`-J hafizi145@100.121.94.41 hafjet@100.119.32.87`) went flaky: `Connection timed out during banner exchange`. **A dead jump ≠ dead RTX** — retarget to the Tailscale IP before declaring BLOCKED.
- Stale-tunnel tell-tale: unit says `active (running)` and MainPID is alive, but `ss -tulpn | grep 10808` is **empty** and the journal shows 255 exits with a restart counter in the thousands. Stop the unit, kill leftover `ssh -D` PIDs, fix the host, restart.
- Verify egress properly, not by exit code alone: `GET https://api.groq.com/openai/v1/models` through `socks5://127.0.0.1:10808` returns 200 + model list. Cloudflare 1010 shows up as HTTP 403 `error code: 1010`.

## 2. Persistence — user systemd units

| Unit | Role |
|------|------|
| `~/.config/systemd/user/hafjet-rtx-socks.service` | SOCKS `-D 127.0.0.1:10808`, `Restart=always`, `RestartSec=5` |
| `~/.config/systemd/user/hafjet-orch.service` | uvicorn `orchestrator.api:app :8740`, `EnvironmentFile=~/.config/hafjet-live/orch.env`, `After=/Wants=` socks |

```bash
systemctl --user daemon-reload
systemctl --user enable --now hafjet-orch.service
systemctl --user is-active hafjet-rtx-socks.service hafjet-orch.service
curl -s http://127.0.0.1:8740/health   # brain_mode=llm, llm_configured=true
```

- **Never `User=root`** on Azure Hermes — sudo is blocked; user units + existing linger (`hafizi145`) are the working shape. Bind loopback only.
- Kill any ad-hoc `uvicorn orchestrator.api` **before** starting the unit, else port 8740 is taken and the unit silently fails to bind.
- Keep the SSH target literal inside `ExecStart`; a `~/.ssh/config` `Host rtx-tunnel` indirection is optional and writes under `~/.ssh/` can be refused by the write gate — edit via `sed -i` on the unit instead.
- Env template lives at `~/.config/hafjet-live/orch.env.example` (mode 600). **Tuan pastes the real `AINA_LLM_API_KEY` himself with `nano`**; agent never writes secrets. Treat any key seen in Telegram as burned → rotate before use.

## 3. Orch env keys that matter

```
AINA_BRAIN_MODE=llm
AINA_LLM_BASE_URL=https://api.groq.com/openai/v1
AINA_LLM_MODEL=qwen/qwen3.6-27b
AINA_LLM_MAX_TOKENS=800
AINA_LLM_TIMEOUT_S=45
ALL_PROXY=socks5h://127.0.0.1:10808
HTTPS_PROXY=socks5h://127.0.0.1:10808
NO_PROXY=127.0.0.1,localhost
```

- `httpx` needs `socksio` → `pip install 'httpx[socks]'` in the **repo `.venv`**, never the Hermes venv.
- **`MAX_TOKENS=150` breaks `qwen3.6-27b`**: the model emits a `<think>…</think>` block first, so the JSON gets truncated → `llm_error` / `llm_json_parse`. 800 works. `WALL_S` of 0.1–0.3s alongside `llm_error` is the signature of a request rejected before generation (403 from Cloudflare, or 429).
- Groq free tier **429** on rapid repeat probes → wait 60s for the sliding window to reset, then the identical mock passes. Don't touch config to "fix" a 429.
- `llm_configured=true` only means the key string is non-empty — a placeholder key still reports `true`. Always confirm with a mock that returns a real `speak` action.

## 4. Model IDs on this Groq key (2026-09)

`llama-3.1-8b-instant` → `404 model_not_found`. Available chat models: `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `openai/gpt-oss-safeguard-20b`, `allam-2-7b`, `groq/compound`, `groq/compound-mini` (+ whisper, orpheus TTS, prompt-guard). Chosen for Aina: **`qwen/qwen3.6-27b`**.

## 5. Live-run fixes that recur every session

- **`~./tmp` on RTX WSL is cleared across reboots.** Consumer script disappears → `can't open file '/tmp/autospeak_consumer_loop.py'` exit 2 on the very first poll. Re-`scp` `/tmp/autospeak_consumer_loop.py` to `hafjet@<rtx>:/tmp/` **before** launching the consumer, and confirm `GPU_VRAM_STOP_MB = 11000` on the copy.
- **Reverse tunnel 18744 binds on the RTX side**, so `ss` on Hermes shows nothing — that is normal. Verify from RTX: `curl -s -o /dev/null -w %{http_code} http://127.0.0.1:18744/health` → `200`. A second `-R 18744` attempt dies with `Error: remote port forwarding failed for listen port 18744` because the first tunnel still holds it: **reuse the live tunnel instead of opening another**.
- **CDP tab must sit on the exact `/live` URL.** If the TikTok tab drifted to `tiktok.com/foryou`, the listener reports `0` comments forever (its filter requires `/live`) while `start`/no error is logged. Check the tab list, then navigate the TikTok page (CDP `Page.navigate`) and relaunch the listener.
- Launch order that works: `/session/start` → reverse tunnel → confirm RTX→orch 200 → `start_dual_listener.ps1` (exit 124 is the normal detached launch) → consumer with `MAX_JOBS=5 MAX_SEC=600`.
- Windows `kill_dual.py` must exist on the **Windows** filesystem; invoking the `/tmp` copy via `C:\Python314\python.exe` fails with `\\wsl.localhost\...` path error.

## 6. Brain-quality evidence (qwen3.6-27b, 2026-09)

Bounded `@royazizan/live` cap-5 sets: offtopic/golf/emoji comments → `ignore` (3/5), relevant ones → `speak`. Off-catalog questions ("buka pukul berapa") get **redirected to bio / beg kuning**, no invented hours or SKUs — the anti-hallucination persona works with this model. Speak jobs: `ok_spoke`, `ack done`, `/humanaudio` `code:0`, RTF 0.66–0.71, GPU ≤ 57°C / ~8.3GB (inner `sqc` CB ≈ 10752 MiB never tripped once Ollama left VRAM).
