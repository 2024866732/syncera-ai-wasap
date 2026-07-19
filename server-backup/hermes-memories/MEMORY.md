Tuan Hafizi — MD HAFJET. UiTM study leave. Malay+Kelantan. Concise tables/bullets, hates overexplaining. Rules: pre-commit review (show git status+diff, approve BEFORE commit — never commit-then-show); pre-deploy review (diff+logs before deploy, deploy only on explicit cmd); long/irreversible ops (log tail >2min, DB writes, deletes) need SEPARATE approval each time — commands auto-block on timeout, respect it, don't retry; never modify/delete DB rows without approval. Max ~20 calls/task. Never guess secrets. Batch setup preferred.
§
Git repo: https://github.com/2024866732/hafjet-whatsapp-bot.git (confirmed active — NOT syncera-ai-wasap)
§
External API defense: never trust resp.json() alone — use _safe_json() that returns {} instead of raising. Guard empty body, prefix (Shopee: )]}\'\n), unmatched brackets, parse failures. Log raw body(500) for debugging.
§
Office PC (Hermes engine #2): i3, 18GB RAM, 512GB SSD (SPCC, Ubuntu 26.04) + 320GB HDD (WDC docs, NEVER format). Remote=Tailscale. Boot needs LAN unplugged first try; on-demand. PC Office had no github.com:443 (clone failed) — fix via `git config --global http.curloptResolve github.com:443:20.205.243.166` or scp tarball from Azure.
§
TTS voice: ElevenLabs Rachel (pNInz6obpgDQGcFmaJgB, eleven_multilingual_v2) preferred. Edge TTS ms-MY-YasminNeural fallback.
§
HAFJET fixed costs (Jul 2026): Sewa tertunggak RM400/bln (baki RM5,000), BSN loan RM400/bln, TNB RM400-500/bln. Min gaji pekerja RM1,700/bln. Tuan jaga kedai sendiri tiap hari (terperuk). Hire bila net profit >RM3,500/bln stabil atau nilai masa bebas >(gaji+gap).
§
Remote `origin` = github.com/2024866732/hafjet-whatsapp-bot.git (maintained). Local branch `release/v2.2.0` NO upstream → push: `git push -u origin release/v2.2.0`. Tuan gave standing push permission for own repo.
§
Hermes install cmd (verified 2026-07-19): `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`. NOTE: `hermes-agent.nousresearch.com/install`=404, `/install.sh`=200.