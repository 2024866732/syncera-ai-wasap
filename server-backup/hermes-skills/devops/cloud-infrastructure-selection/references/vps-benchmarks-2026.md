# VPS Benchmarks & Research Data (2026)

## Key Data Points from July 2026 Research

### Hetzner Cloud Post-April 2026 Pricing Adjustment

Hetzner raised prices on CX series in June 2026:
- CX22: €2.99 → **€3.99** (+33%)
- CX32: €5.99 → **~€8.00** (+33%)
- CX42: €14.99 → **~€20.00** (+33%)

ARM instances (CAX series) unaffected and remain best value.

### Latency to Malaysia

| Provider DC | Ping from KL | Notes |
|---|---|---|
| Hetzner Singapore | 5–15ms | Best option |
| Hostinger Singapore | 10–20ms | Comparable |
| DigitalOcean Singapore | 10–20ms | Same region |
| Vultr Singapore | 10–20ms | Same region |
| Contabo Germany | 150–200ms | Noticeable lag |
| Contabo Japan | 80–120ms | OK but limited |

### Hermes Agent Resource Usage Baseline

Based on a running instance with Telegram bot + PM2 + Node.js:

| Service | RAM (idle) | RAM (active) | CPU (idle) |
|---|---|---|---|
| Hermes Agent (Node) | ~120 MB | ~250 MB | 0-5% |
| Telegram bot poller | ~45 MB | ~80 MB | 1-3% |
| Python webhook listener | ~35 MB | ~60 MB | 0-2% |
| System (OS + PM2) | ~200 MB | ~300 MB | 2-5% |
| **Total baseline** | **~400 MB** | **~690 MB** | **3-15%** |

**Conclusion:** 2GB RAM is sufficient for basic setup. 4GB gives headroom for models/tools. 8GB only needed if running local LLMs.

### Provider Comparison Sources

- https://blog.byte-guard.net/vps-uptime-latency-benchmark-2026/ (Hetzner vs Contabo vs Vultr vs Linode vs DO)
- https://bestvpsmatch.com/cheapest-vps-hosting (budget VPS under $5/mo)
- https://www.hermify.io/en/blog/cheap-vps-for-ai-agent (AI agent VPS comparison)
- https://vpsranking.com/ai/vps-for-ai-agents/ (AI agent hosting guide)
- https://agentdeals.dev/vendor/hetzner (Hetzner detailed pricing)
- https://costgoat.com/pricing/hetzner (Hetzner pricing calculator)
