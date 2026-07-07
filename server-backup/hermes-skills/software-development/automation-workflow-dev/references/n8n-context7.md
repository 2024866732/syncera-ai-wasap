# n8n Context7 Libraries

Proven library IDs for n8n lookups:

| ID | Strength | Use case |
|----|----------|----------|
| `/n8n-io/n8n-docs` | Highest snippet density | Auth, triggers, actions, error handling |
| `/context7/n8n_io` | Benchmark 76.55 | Broad integration examples |
| `/n8n-io/n8n-hosting` | Deployment focused | Docker, K8s, cloud reverse proxy configs |

# Verified Environment (2026-07-06)

- Ubuntu 22.04.5 LTS, /home mounted read-only
- Kernel: 6.8.0-1059-azure
- Writable base for Hermes/npm/node: `~/.hermes/`
- Node installed at `~/.hermes/n8n/bin/node` (v20.20.2)
- npm global prefix/cache/tmp under `~/.hermes/`

# Verification Commands

```bash
ls -ld ~/.hermes/npm-global ~/.hermes/n8n/bin/node ~/.hermes/npm-cache ~/.hermes/npm-tmp
export PATH="$HOME/.hermes/n8n/bin:$HOME/.hermes/npm-global/bin:$PATH"
node --version && npm --version && n8n --version && ctx7 --version
```
