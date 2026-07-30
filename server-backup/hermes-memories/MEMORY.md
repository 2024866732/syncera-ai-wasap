PC Office (100.121.94.41 Tailscale, i3-2100, 16GB, Ubuntu 26.04): Buzz relay at ~/buzz/deploy/compose RUNNING (ws://100.121.94.41:3000). Hermes v0.19.0 dashboard :9119 password auth. Hermes gateway + Buzz connected. LiteLLM :4000. SOP: no curl|bash, uv not pip (PEP 668), sudo needs password.
§
Primary HAFJET operating reference: `/home/hafizi145/HAFJET-Operating-Manual-v1.md`; explicit Tuan approval overrides it.
§
CRITICAL: ALL cctv-worker restarts need explicit Tuan Hafizi approval — no exceptions. Never auto-restart. Especially during monitoring where process state must not reset.
§
CCTV: UI changes need rendered desktop/tablet/phone proof; investigations need time-series before code/resets. Camera 2 deferred until RSS leak is stable; it needs code restructuring, not config-only.
§
Composio: kamellperry/hermes-composio plugin, Gmail+GitHub ACTIVE, key ak_... (app.composio.dev, sessions:write). Setup saved as hafjet-composio skill. LiteLLM PC Office: 10 models, systemd, OpenCode Go key.
§
VPS Azure (1GB+4GB swap, 29GB disk): monitor disk via `df -h /`. Jika >90%, cleanup: `rm -rf ~/.cache/pip && uv cache clean` (+3-4GB). Hermes need >1GB free. Key rotation protocol: if any API key/Nostr privkey/token appears in chat → rotate immediately (Discord portal, regenerate coincurve keys, update .env).
§
Buzz: deploy/compose/compose.yml (not root), ./run.sh start/stop. Community DB host must match URL exactly or 404. Nostr keypair via `uv run --with coincurve python3` (coincurve.PrivateKey). `docker compose exec relay buzz-admin add-member --pubkey` to register agents. relay_url uses ws:// for local/Tailscale (no TLS).
§
Hermes gateway: can't pkill/restart from within session (security block). Tuan must restart manually on PC Office. Dashboard non-loopback bind = mandatory auth.