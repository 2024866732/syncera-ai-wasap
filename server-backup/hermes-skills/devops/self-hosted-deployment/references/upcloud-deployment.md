# UpCloud VPS Deployment Reference

## Python SDK Setup

```python
# Install (requires Python 3.10 — 3.11 has compatibility issues)
pip install upcloud-api

# Auth
from upcloud_api import CloudManager, Server, Storage, login_user_block
cm = CloudManager(token='ucat_...')
```

## Server Lifecycle

```python
# Create
server = Server(
    zone='de-fra1',  # Frankfurt (best capacity)
    title='hafjet-trial',
    hostname='hafjet-trial',
    plan='2xCPU-4GB',
    storage_devices=[Storage(action='clone', storage=UBUNTU_TEMPLATE, size=80)],
    login_user=login_user_block(
        username='ubuntu',
        create_password=False,
        ssh_keys=[pub_key_content]  # Read from ~/.ssh/id_rsa.pub
    ),
    metadata=True  # REQUIRED for cloud-init templates
)
created = cm.create_server(server)

# Get status
s = cm.get_server(UUID)
print(s.state)  # 'started', 'stopped', 'error'

# Stop (hard)
import requests
requests.post(f"https://api.upcloud.com/1.3/server/{UUID}/stop",
    headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    json={"stop_server": {"stop_type": "hard", "timeout": 60}}, timeout=30)

# Start
s = cm.get_server(UUID)
s.start()

# Delete
requests.delete(f"https://api.upcloud.com/1.3/server/{UUID}",
    headers={"Authorization": f"Bearer {TOKEN}"},
    params={"stop": True}, timeout=30)
```

## Account Quota Check

```python
import requests
r = requests.get("https://api.upcloud.com/1.3/account",
    headers={"Authorization": f"Bearer {TOKEN}"})
limits = r.json()['account']['resource_limits']
# limits: cores=8, memory=16384, storage_total=1024, cloud_server_dev_1xcpu_1gb_plans=5
```

## SSH Key Injection

```python
with open('/tmp/hafjet-trial-key.pub') as f:
    pub_key = f.read().strip()

login_user=login_user_block(username='ubuntu', create_password=False, ssh_keys=[pub_key])
```

## Common Template UUIDs

| OS | UUID |
|----|------|
| Ubuntu 24.04 | `01000000-0000-4000-8000-000030260200` |

## Zone Availability (2026-08)

| Zone | Code | Capacity |
|------|------|----------|
| Frankfurt | de-fra1 | High (preferred) |
| Helsinki | fi-hel1 | Medium |
| Singapore | sg-sin1 | Low (fills fast) |

## Performance Benchmarks (Frankfurt 2C/4GB)

- Sequential read: 19.7 GB/s
- Random 4K: 1.35 GB/s
- Network latency: 0.9ms
- LLM (llama3.2:3b): ~30 tok/s CPU-only
