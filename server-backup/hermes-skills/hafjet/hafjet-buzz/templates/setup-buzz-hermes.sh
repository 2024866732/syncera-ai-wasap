#!/usr/bin/env bash
set -euo pipefail

# =========================================================================
#  HAFJET Buzz + Hermes Install Script
#  Untuk PC Office Ubuntu Server 26.04 (headless)
#  Run LOCAL: ./setup-buzz-hermes.sh
# =========================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_step()  { echo -e "\n${GREEN}==>${NC} $1"; }
echo_info()  { echo -e "    ${YELLOW}→${NC} $1"; }
echo_done()  { echo -e "    ${GREEN}✓${NC} $1"; }

BUZZ_DIR="$HOME/buzz"
RELAY_PORT="${BUZZ_RELAY_PORT:-3000}"

# ────────────────────────────────────────────────────────────────────
#  STEP 1: Install Docker (official apt repo — bukan curl|bash)
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 1: Install Docker Engine"

if ! command -v docker &>/dev/null; then
    echo_info "Adding Docker GPG key..."
    sudo apt update -qq
    sudo apt install -y ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    echo_info "Adding Docker APT repository..."
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    echo_info "Installing Docker packages..."
    sudo apt update -qq
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    echo_info "Adding user '$USER' to docker group..."
    sudo usermod -aG docker "$USER"

    echo_done "Docker installed (log out/in untuk docker group aktif)"
else
    echo_done "Docker already installed: $(docker --version)"
fi

# ────────────────────────────────────────────────────────────────────
#  STEP 2: Install base tools
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 2: Install base tools"
sudo apt install -y git curl tar gzip make 2>/dev/null || true
echo_done "Base tools ready"

# ────────────────────────────────────────────────────────────────────
#  STEP 3: Clone Buzz
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 3: Clone Buzz repository"

if [ ! -d "$BUZZ_DIR" ]; then
    git clone --depth 1 https://github.com/block/buzz.git "$BUZZ_DIR"
    echo_done "Cloned to $BUZZ_DIR"
else
    echo_info "Buzz already cloned at $BUZZ_DIR"
    cd "$BUZZ_DIR"
    git pull --ff-only 2>/dev/null || echo_info "Skip pull (local changes?)"
fi

cd "$BUZZ_DIR"

# ────────────────────────────────────────────────────────────────────
#  STEP 4: Activate Hermit toolchain
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 4: Activate Hermit toolchain"

if [ -f ./bin/activate-hermit ]; then
    # shellcheck disable=SC1091
    . ./bin/activate-hermit
    echo_done "Hermit activated"
else
    echo_info "Installing Hermit binary..."
    HERMIT_VER="v0.41.0"
    HERMIT_URL="https://github.com/cashapp/hermit/releases/download/${HERMIT_VER}/hermit-${HERMIT_VER}-linux-amd64.tar.gz"
    mkdir -p ~/bin
    curl -fsSL "$HERMIT_URL" | tar xz -C ~/bin/
    export PATH="$HOME/bin:$PATH"
    echo_done "Hermit installed"
fi

# ────────────────────────────────────────────────────────────────────
#  STEP 5: Setup + Build Buzz (one-time)
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 5: Setup & Build Buzz"

echo_info "Running 'just setup' (Docker services + migrations + toolchain)..."
just setup

echo_info "Running 'just build' (compile relay + CLI)..."
just build

echo_done "Buzz built successfully"

# ────────────────────────────────────────────────────────────────────
#  STEP 6: Configure relay for network access (0.0.0.0)
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 6: Configure relay for LAN/Tailscale access"

ENV_FILE="$BUZZ_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    cp "$BUZZ_DIR/.env.example" "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"
fi

if ! grep -q "BUZZ_RELAY_HOST" "$ENV_FILE" 2>/dev/null; then
    cat >> "$ENV_FILE" << 'EOF'

# HAFJET: Bind pada semua interface utk LAN/Tailscale access
BUZZ_RELAY_HOST=0.0.0.0
BUZZ_RELAY_PORT=3000
BUZZ_RELAY_URL=ws://0.0.0.0:3000
EOF
    echo_done "Added relay bind config to .env"
else
    echo_info ".env already has relay config"
fi

echo_info "Relay: ws://0.0.0.0:${RELAY_PORT}"

# ────────────────────────────────────────────────────────────────────
#  STEP 7: Verify Docker & print next steps
# ────────────────────────────────────────────────────────────────────

echo_step "STEP 7: Verify Docker"

if ! docker info &>/dev/null 2>&1; then
    echo -e "${RED}WARNING:${NC} Docker daemon not accessible. Did you log out & in?"
    echo "  Run: newgrp docker"
    exit 1
fi
echo_done "Docker ready"

# ────────────────────────────────────────────────────────────────────
#  PRINT: Hermes gateway config + NEXT STEPS
# ────────────────────────────────────────────────────────────────────

cat << 'HERMESCFG'

╔══════════════════════════════════════════════════════════════╗
║  TAMBAH ke ~/.hermes/config.yaml:                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                            ║
║  gateway:                                                  ║
║    platforms:                                              ║
║      buzz:                                                 ║
║        enabled: true                                       ║
║        extra:                                              ║
║          relay_url: "ws://localhost:3000"                  ║
║          privkey_hex: "BUZZ_PRIVKEY_HEX_HERMES"           ║
║          require_mention: true                             ║
║          allow_all_users: false                            ║
║                                                            ║
║  display:                                                  ║
║    platforms:                                              ║
║      buzz:                                                 ║
║        interim_assistant_messages: false                   ║
║        tool_progress: off                                  ║
║                                                            ║
╠══════════════════════════════════════════════════════════════╣
║  TAMBAH ke ~/.hermes/.env:                                  ║
║    BUZZ_RELAY_URL=ws://localhost:3000                       ║
║    BUZZ_PRIVATE_KEY=BUZZ_PRIVKEY_HEX_HERMES                 ║
╚══════════════════════════════════════════════════════════════╝

HERMESCFG

echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │  NEXT (PRODUCTION HEADLESS):                         │"
echo "  │                                                     │"
echo "  │  1. Start relay (bukan just dev!):                  │"
echo "  │     cd ~/buzz && . ./bin/activate-hermit            │"
echo "  │     docker compose -f deploy/compose/compose.yml up -d"
echo "  │                                                     │"
echo "  │  2. Generate & register agent key (official):       │"
echo "  │     docker compose -f deploy/compose/compose.yml exec relay buzz-admin generate-key"
echo "  │     docker compose -f deploy/compose/compose.yml exec relay buzz-admin add-member --pubkey KEY_HEX"
echo "  │                                                     │"
echo "  │  3. Hermes gateway:                                 │"
echo "  │     hermes gateway setup  → pilih Buzz              │"
echo "  │     hermes gateway install && hermes gateway start  │"
echo "  │     hermes gateway status                           │"
echo "  │                                                     │"
echo "  │  4. Buka Buzz Desktop di laptop (Tailscale):        │"
echo "  │     Set BUZZ_RELAY_URL=ws://TAILSCALE_IP:3000       │"
echo "  │     Invite Hermes pubkey ke channel                 │"
echo "  └──────────────────────────────────────────────────────┘"
echo -e "\n${GREEN}Done.${NC}"
