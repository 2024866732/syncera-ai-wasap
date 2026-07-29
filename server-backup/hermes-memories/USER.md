Tuan Hafizi (MD HAFJET, UiTM, X:@hafizigadjet145). KELANTAN Malay casual. Chat: max 3 lines in STEP/ACTION/NEED format. Long output → file via telegram-file-delivery skill only. Never long inline messages.
§
Deploy: requires structured pre-deploy report (branch, commit, diff, risks). Only commit when asked, never deploy without explicit cmd. Version-controlled startup (start.sh in repo) preferred over hidden config.
§
Office PC: hafjet-pc-office (100.121.94.41, i3-2100, 16GB, no GPU, Python 3.14, Ubuntu 26.04). CPU-only inference only.
§
Workflow: iterative approval gates, sequential steps; apply-code and load-via-restart approvals are separate. CCTV patches require scoped backup checksum + read-only RED/GREEN tests. Prefers .env and layered approval.
§
Idempotent operations: do NOT append duplicate keys to .env — replace existing value if present, add only if absent. Safe cleanup: delete specific named files, never wildcard under data paths.
§
Tuan Hafizi requires audit-grade operational reporting: never present unverified output as fact; clearly distinguish proposed, applied, and verified states; show exact diffs before changes and wait for explicit approval. Scoped sudo must be verified using the exact command and arguments allowed by its rule.