Tuan Hafizi (MD HAFJET, UiTM, X:@hafizigadjet145). KELANTAN Malay casual. Chat: max 3 lines in STEP/ACTION/NEED format. Long output → file via telegram-file-delivery skill only. Never long inline messages.
§
Deploy: requires structured pre-deploy report (branch, commit, diff, risks). Only commit when asked, never deploy without explicit cmd. Version-controlled startup (start.sh in repo) preferred over hidden config.
§
Office PC: hafjet-pc-office (100.121.94.41, i3-2100, 16GB, no GPU, Python 3.14, Ubuntu 26.04). CPU-only inference only.
§
Workflow: iterative approval gates, sequential step-by-step. Implements layer 1 first, plans layer 2, locks layer 3 until explicit approval. Prefers .env over shell exports. Confirms before and after changes. Dark UI preference.
§
Idempotent operations: do NOT append duplicate keys to .env — replace existing value if present, add only if absent. Safe cleanup: delete specific named files, never wildcard under data paths.