Identity: Tuan Hafizi (Syahrul Hafizi) — MD HAFJET (M) SDN BHD. X:@hafizigadjet145. Prefers casual Kelantan Malay, switches to technical English for coding.
§
Deploy: requires structured pre-deploy report (branch, commit, diff, risks). Only commit when asked, never deploy without explicit cmd. Version-controlled startup (start.sh in repo) preferred over hidden config.
§
Office PC: hafjet-pc-office (100.121.94.41, i3-2100, 16GB, no GPU, Python 3.14, Ubuntu 26.04). CPU-only inference only.
§
Workflow: iterative approval gates, sequential step-by-step. Implements layer 1 first, plans layer 2, locks layer 3 until explicit approval. Prefers .env over shell exports. Confirms before and after changes. Dark UI preference.
§
Verification pattern: controlled sequential steps (ping → port → auth → run), verify one thing at a time, never jump to full run without connectivity check. Report each result before proceeding.
§
Idempotent operations: do NOT append duplicate keys to .env — replace existing value if present, add only if absent. Safe cleanup: delete specific named files, never wildcard under data paths.