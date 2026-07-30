# Nostr Key Generation + Rotation for Buzz Relay

## ✅ CORRECT: `uv + coincurve` (secp256k1 proper)

Requires no system installs — `uv` auto-handles venv + dependency. Works on Ubuntu 26.04 (PEP 668).

```bash
uv run --with coincurve python3 -c "
from coincurve import PrivateKey
import secrets
priv = PrivateKey(secrets.token_bytes(32))
pub_hex = priv.public_key.format().hex()[2:]  # strip 02/03 prefix → 64 chars
print(f'PRIVKEY={priv.to_hex()}')
print(f'PUBKEY={pub_hex}')
"
```

Output:
```
PRIVKEY=<64-char-hex>   → BUZZ_RELAY_PRIVATE_KEY
PUBKEY=<64-char-hex>    → RELAY_OWNER_PUBKEY (or Hermes agent pubkey)
```

## ❌ DO NOT USE: openssl ecparam

`openssl ecparam -name secp256k1` produces keys but:
- Public key extraction via `grep pub -A5 | ... | tail -c 64` is **unreliable**
- Extracted hex is NOT valid Nostr pubkey format (wrong length, includes metadata)
- `BUZZ_RELAY_PRIVATE_KEY` rejected with: `Error: invalid BUZZ_RELAY_PRIVATE_KEY: Invalid secret key`

## ❌ DO NOT USE: pip install on Ubuntu 26.04

Python 3.14 on Ubuntu 26.04 enforces PEP 668:
```
error: externally-managed-environment
```
Use `uv run --with <pkg>` instead — auto-creates temporary venv.

## Key Usage in Buzz

| Env Variable | Key | Format |
|-------------|-----|--------|
| `BUZZ_RELAY_PRIVATE_KEY` | Relay owner private key | 64-char hex |
| `RELAY_OWNER_PUBKEY` | Relay owner public key | 64-char hex |
| Hermes agent key | Agent identity | 64-char hex |

> Relay owner keypair ≠ Hermes agent keypair. Dua keypair berbeza. Generate separately.

## Security: NEVER paste keys into chat

- **Save to file first**, then source from file:
  ```bash
  uv run --with coincurve python3 -c "..." > /tmp/buzz-keys.txt
  cat /tmp/buzz-keys.txt   # ← verify locally, JANGAN paste output ke chat!
  source /tmp/buzz-keys.txt
  ```
- Rotate keys after ANY exposure (chat, screenshot, log, clipboard paste)
- Backup securely (vault, not git)
- `rm /tmp/buzz-keys.txt` when done

---

## Full Key Rotation Procedure

Guna bila private key terdedah di mana-mana.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/buzz/deploy/compose

# 1. Generate keypair BARU → simpan ke file
uv run --with coincurve python3 -c "
from coincurve import PrivateKey
import secrets
priv = PrivateKey(secrets.token_bytes(32))
pub = priv.public_key.format().hex()[2:]
with open('/tmp/buzz-rotate-keys.txt', 'w') as f:
    f.write(f'BUZZ_PRIVATE_KEY={priv.to_hex()}\n')
    f.write(f'HERMES_PUBKEY={pub}\n')
"

# 2. Source dari file (JANGAN print)
source /tmp/buzz-rotate-keys.txt

# 3. Update relay .env
sed -i "s|BUZZ_RELAY_PRIVATE_KEY=.*|BUZZ_RELAY_PRIVATE_KEY=$BUZZ_PRIVATE_KEY|" .env
sed -i "s|RELAY_OWNER_PUBKEY=.*|RELAY_OWNER_PUBKEY=$HERMES_PUBKEY|" .env

# 4. Restart relay
./run.sh restart

# 5. Re-register Hermes
docker compose exec relay buzz-admin add-member --pubkey "$HERMES_PUBKEY"

# 6. Update Hermes config
sed -i "s|BUZZ_PRIVATE_KEY=.*|BUZZ_PRIVATE_KEY=$BUZZ_PRIVATE_KEY|" ~/.hermes/.env
pkill -f "hermes gateway" 2>/dev/null; hermes gateway &

# 7. Cleanup
rm /tmp/buzz-rotate-keys.txt /tmp/hermes-buzz-keys.txt 2>/dev/null
```

### Rotation Checklist

- [ ] Relay restarted (new private key active)
- [ ] Hermes re-registered as relay member
- [ ] Hermes .env updated
- [ ] Hermes gateway restarted
- [ ] Temp key files deleted
- [ ] Old pubkey removed dari channel memberships (manual via Buzz UI)
