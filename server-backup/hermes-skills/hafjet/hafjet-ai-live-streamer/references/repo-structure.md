# Suggested repo: `hafjet-ai-livestream`

Scaffold only after design + plan approval. Paths are class defaults — adjust if monorepo chosen.

```
hafjet-ai-livestream/
├── README.md
├── docker-compose.yml            # optional; RTX may run bare metal/WSL
├── .env.example                  # NO real stream keys
├── avatar/
│   ├── train_data/
│   ├── models/
│   └── configs/
├── livetalking/                  # fork or submodule lipku/LiveTalking
│   └── data/avatars/
│       ├── synthetic_poc/
│       └── hafjet_hijab/         # later
├── agent/
│   ├── graph.py
│   ├── nodes/
│   │   ├── script_generator.py
│   │   ├── comment_reply.py
│   │   ├── product_selector.py
│   │   └── urgency.py
│   ├── prompts/
│   │   └── live_sales_persona.md
│   ├── tools/
│   │   ├── product_search.py
│   │   ├── inventory.py
│   │   └── promo.py
│   └── knowledge/
│       ├── products.json         # curated pre-live
│       └── faqs.json
├── tts/
│   ├── cosyvoice_server.py
│   └── voice_profiles/
├── comment_listener/             # only after comment mode locked
│   ├── shopee_listener.py
│   ├── tiktok_listener.py
│   └── unified_queue.py
├── obs/
│   ├── scenes/
│   ├── overlays/
│   └── control.py
├── streaming/
│   ├── multi_rtmp.py
│   └── platform_keys.md          # instructions only; secrets local
├── n8n_workflows/
│   ├── live_scheduler.json
│   └── post_live_report.json
└── scripts/
    ├── start_live.sh
    ├── train_avatar.sh
    ├── preflight_catalog.py
    └── healthcheck.py
```

## v0.1 minimum files (if scaffold approved early)

- `agent/prompts/live_sales_persona.md` (from `aina-live-sales-persona.md`)  
- `agent/knowledge/products.json` (small sample, fake/demo OK until real SKUs)  
- `agent/knowledge/faqs.json`  
- `.env.example`  
- `README.md` with host = RTX + approval gates  
