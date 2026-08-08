# Oracle Cloud VM iptables Pitfall

## Problem

Oracle Cloud VMs have iptables INPUT chain with a default REJECT policy. Even if Oracle Cloud Security Lists allow traffic, the VM's iptables blocks it.

## Symptoms

- Port accessible via Tailscale (100.x.x.x) but NOT via public IP (149.x.x.x)
- `curl http://public-ip:port` times out
- `curl http://tailscale-ip:port` works

## Diagnosis

```bash
# Check current iptables rules
sudo iptables -L INPUT -n

# Look for REJECT rule at end of chain
# Chain INPUT (policy ACCEPT)
# target     prot opt source               destination
# ACCEPT     6    --  0.0.0.0/0            0.0.0.0/0  tcp dpt:22
# REJECT     0    --  0.0.0.0/0            0.0.0.0/0  reject-with icmp-host-prohibited
```

## Fix

```bash
# Add rule for your port (e.g., 8200)
sudo iptables -I INPUT 3 -p tcp --dport 8200 -j ACCEPT

# Make persistent (survives reboot)
sudo netfilter-persistent save
```

## Verification

```bash
# Test from public IP
curl -s http://149.118.152.50:8200/api/health

# Should return JSON, not timeout
```

## Rule of Thumb

Every port exposed to the internet needs BOTH:
1. Oracle Cloud Security List rule (network level)
2. iptables INPUT rule (VM level)
