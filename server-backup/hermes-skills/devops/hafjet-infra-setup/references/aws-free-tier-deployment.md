# AWS Free Tier Deployment — HAFJET Projects (Aug 2026)

## Server Specs
- Instance: t3.micro (2 vCPU, 911MB RAM, 20GB EBS)
- OS: Ubuntu 24.04 LTS
- Public IP: 52.87.172.80
- Tailscale: 100.98.18.119 (hafjet-aws)
- SSH Key: /tmp/hafjet-aws-key.pem (ED25519)
- Account: syahrulhafizi101@gmail.com

## RAM Budget (CRITICAL)
911MB total. Each PostgreSQL ~100MB, each Python API ~50MB.
6 DBs + 6 APIs = ~1100MB OVERLOAD.
Rule: max 4-5 lightweight services on 911MB. Use 1 shared PG or upgrade to t3.small.

## Services Port Map
- Inventory: DB 5433, API 8080, UI 8082
- CRM: DB 5434, API 8090, UI 8092
- MultiChannel: DB 5435, API 8097, UI 8098
- Marketing: DB 5436, API 8100, UI 8101
- Supplier: DB 5437, API 8105, UI 8106
- Knowledge: DB 5438, API 8110, UI 8111
- Command Center: port 80 (proxy)

## Deployment Order (sequential, NOT parallel)
1. Docker: sudo apt install -y docker.io docker-compose-v2
2. usermod -aG docker ubuntu
3. Tailscale: curl -fsSL https://tailscale.com/install.sh | sh
4. DBs one at a time, 15s gap, wait 30s healthy
5. APIs one at a time, 20s gap
6. UIs
7. Command Center

## SSH Key Fix
Add final newline if libcrypto error: echo "" >> key.pem
Verify: ssh-keygen -l -f key.pem

## Command Center
cc_server.py threaded proxy on :80, proxies via 172.17.0.1:{port}, CORS enabled.
Health check caches 10s. HTTPError < 500 = service UP.

## UpCloud Suspension
Account suspended Aug 2026. Data lost. Migrated to AWS.
Backup: GitHub 2024866732/hafjet-backups
