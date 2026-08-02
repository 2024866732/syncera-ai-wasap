# UpCloud Frankfurt Benchmarks — August 2 2026

## Server: 2xCPU-4GB, Frankfurt (de-fra1)
- CPU: AMD EPYC 9575F (2 cores)
- RAM: 3.8GB (0 swap!)
- Disk: 80GB MaxIOPS (69GB free)
- Public IP: 94.237.88.114
- OS: Ubuntu 26.04 LTS

## Disk I/O (fio)
- Random 4K Mixed (70/30, 2 jobs, QD=64): **READ 1.35 GB/s, WRITE 580 MB/s**
- Sequential 128K Read (1 job, QD=16): **READ 19.7 GB/s**
- vs Singapore: 3x faster random, 19x faster sequential

## Network
- Latency to OpenRouter: **0.9ms** (Frankfurt = tech hub)
- vs Singapore: 0.99ms
- vs Azure: 10ms

## LLM (Ollama llama3.2:3b)
- Single request: **29-31 tok/s** (CPU only)
- Long generation: 116 tokens in 4.25s = 27.3 tok/s
- Concurrent (2 requests): 30 tok/s each
- RAM usage: ~1.5GB during inference
- OOM risk: services use ~1.5GB, model uses ~2GB, total ~3.5GB on 3.8GB server
- Fix: stop n8n/grafana/cadvisor before LLM inference

## Docker + K8s
- Docker: ✅ working
- k3s: ✅ working
- Note: Docker Compose v2 not installed by default
- Fix: `sudo apt-get install -y docker-compose-v2`

## Services Deployed
- Ollama (llama3.2:3b) - 30 tok/s CPU
- PostgreSQL 16 (inventory DB)
- Valkey (Redis)
- Inventory API (FastAPI)
- Inventory UI (HTML)
- Prometheus + Node Exporter

## Frankfurt vs Singapore vs Azure
| Metric | Frankfurt | Singapore | Azure B1s |
|--------|-----------|-----------|-----------|
| Disk Random 4K | **1.35 GB/s** | 512 MB/s | 23 MB/s |
| Disk Sequential | **19.7 GB/s** | N/A | N/A |
| Latency | **0.9ms** | 0.99ms | 10ms |
| RAM | 3.8GB | 3.8GB | 1GB |
| LLM Speed | 30 tok/s | N/A | N/A |
| Zone availability | ✅ Usually available | ⚠️ Often full | N/A |

## Recommendation
- Frankfurt is best for disk I/O and latency
- Singapore often at capacity for trial accounts
- Multi-zone fallback: try de-fra1 → uk-lon1 → nl-ams1 → us-nyc1
