# Oracle A1 Live Inventory — hafjet-oracle (ap-kulai-2)

**Verified live via Tailscale SSH: 2026-08-12**

## Instance

| Field | Value |
|-------|--------|
| Hostname | `hafjet-oracle` |
| Shape | `VM.Standard.A1.Flex` |
| CPU | **4 OCPU** ARM Neoverse-N1 |
| RAM | **24 GB** (no swap) |
| Boot disk | ~46.6 GB total · root ~45G · ~28% used (~12G) |
| OS | Ubuntu 24.04.4 LTS aarch64 |
| Kernel | `6.17.0-1018-oracle` |
| Region / AD | `ap-kulai-2` / `rOJM:AP-KULAI-2-AD-1` |
| Public IP | `149.118.152.50` |
| Private IP | `10.0.0.250` |
| Tailscale | `100.124.99.52` |
| SSH | user `ubuntu`, key `/tmp/hafjet-oracle-key` |
| Instance OCID | `ocid1.instance.oc1.ap-kulai-2.ansgwljrk6kbqnycdr4vjrep5c7nnbgrqls7glcwdovwzo6svwvxbyeemtoa` |
| Tenancy OCID | `ocid1.tenancy.oc1..aaaaaaaaigehfv7zkt2uuv5p74tx6yordkpk5sfdz2wkoiknfi7affzkivza` |

## Budget / tier

- Target: stay near Always Free A1 envelope (this VM is max shape 4 OCPU / 24 GB).
- Budget alert pattern: **$10/month**, **80%** threshold.
- Block volume free pool: 200 GB combined — boot uses ~47 GB.

## Access URLs (Tailscale)

| Service | URL |
|---------|-----|
| Command Center | `http://100.124.99.52` (:80) |
| WhatsApp UI (legacy stack) | `http://100.124.99.52:8116` |
| HAFJET AI Dashboard | `http://100.124.99.52:8117` |
| AI bot API (host network) | `http://100.124.99.52:8200` · health `/api/health` |

## AI runtime

| Item | Value |
|------|--------|
| Ollama | systemd active |
| Model | `qwen2.5:7b` Q4_K_M (~4.7 GB), tools-capable, 32K ctx |
| Note | CPU-only ARM — no GPU |

## Port map (multi-project)

| Stack | DB | API | UI |
|-------|-----|-----|-----|
| Inventory | 5433 | 8080 | 8082 |
| CRM | 5434 | 8090 | 8092 |
| MultiChannel | 5435 | 8097 | 8098 |
| Marketing | 5436 | 8100 | 8101 |
| Supplier | 5437 | 8105 | 8106 |
| Knowledge | 5438 | 8110 | 8111 |
| WhatsApp AI (legacy) | 5439 | host | 8116 |
| HAFJET AI WhatsApp | 5440 | **8200 host** | 8117 |
| Command Center | — | — | 80 |

## Ops constraints

- Docker typically needs `sudo` (ubuntu may not be in docker group).
- **No swap** — memory spikes can OOM; leave headroom for Ollama (~5 GB when loaded).
- Boot disk small — avoid dumping large models/logs without cleanup.
- Capacity note: **creating** new A1 VMs in ap-kulai-2 often fails (`Out of host capacity`); **this** instance is already live and healthy.
- Public services on `0.0.0.0` need OCI security list **and** host iptables (see whatsapp-webhook-dev iptables pitfall).

## Diagnosis quick commands

```bash
ssh -i /tmp/hafjet-oracle-key ubuntu@100.124.99.52
sudo docker ps -a
curl -sS http://127.0.0.1:8200/api/health
free -h; df -h /
systemctl is-active ollama
curl -sS http://127.0.0.1:11434/api/tags
```

## Related skills

- `whatsapp-webhook-dev` → `references/docker-healthcheck-slim-python.md`
- `whatsapp-webhook-dev` → hybrid Azure + Oracle architecture
- `hafjet-deployment-plan` → multi-env strategy
