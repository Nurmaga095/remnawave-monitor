#!/usr/bin/env bash
#
# Remnawave Monitor — Interactive Setup Script
# Automatically installs dependencies, configures .env, and optionally sets up
# systemd service + Caddy reverse proxy.
#
# Usage:
#   chmod +x setup.sh
#   sudo ./setup.sh
#
set -euo pipefail

# ─── Colors & helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ┌─────────────────────────────────────────────┐"
  echo "  │         Remnawave Monitor Setup              │"
  echo "  │         v1.0.0 • Interactive Installer       │"
  echo "  └─────────────────────────────────────────────┘"
  echo -e "${NC}"
}

info()    { echo -e "  ${BLUE}ℹ${NC}  $1"; }
success() { echo -e "  ${GREEN}✔${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "  ${RED}✖${NC}  $1"; }
step()    { echo -e "\n${BOLD}${CYAN}[$1/$TOTAL_STEPS]${NC} ${BOLD}$2${NC}"; }

ask() {
  local prompt="$1"
  local default="${2:-}"
  local result=""
  if [ -n "$default" ]; then
    echo -ne "  ${GREEN}?${NC}  ${prompt} ${DIM}(${default})${NC}: " >&2
    read -r result
    echo "${result:-$default}"
  else
    echo -ne "  ${GREEN}?${NC}  ${prompt}: " >&2
    read -r result
    echo "$result"
  fi
}

ask_secret() {
  local prompt="$1"
  local result=""
  echo -ne "  ${GREEN}?${NC}  ${prompt}: " >&2
  read -rs result
  echo "" >&2
  echo "$result"
}

ask_yn() {
  local prompt="$1"
  local default="${2:-y}"
  local hint="Y/n"
  [ "$default" = "n" ] && hint="y/N"
  echo -ne "  ${GREEN}?${NC}  ${prompt} ${DIM}(${hint})${NC}: " >&2
  local result=""
  read -r result
  result="${result:-$default}"
  [[ "$result" =~ ^[Yy] ]]
}

generate_secret() {
  # Generate a cryptographically secure random string (48 chars)
  if command -v openssl &>/dev/null; then
    openssl rand -base64 36 | tr -d '=/+' | head -c 48
  elif [ -r /dev/urandom ]; then
    head -c 36 /dev/urandom | base64 | tr -d '=/+' | head -c 48
  else
    # Fallback: timestamp + PID based (less secure but functional)
    echo "$(date +%s%N)$(head -c 20 /dev/random 2>/dev/null || echo $$)" | sha256sum | head -c 48
  fi
}

TOTAL_STEPS=6

# ─── Main ─────────────────────────────────────────────────────────────────────
banner

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root (use sudo)"
  echo -e "  Run: ${BOLD}sudo ./setup.sh${NC}"
  exit 1
fi

# Detect install directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR=""

echo ""
info "Detected script location: ${BOLD}${SCRIPT_DIR}${NC}"

if ask_yn "Install in /opt/remnawave-monitor?" "y"; then
  INSTALL_DIR="/opt/remnawave-monitor"
  if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    info "Copying files to ${INSTALL_DIR}..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/" 2>/dev/null || true
    cp "$SCRIPT_DIR"/.env.example "$INSTALL_DIR/" 2>/dev/null || true
    cp "$SCRIPT_DIR"/.gitignore "$INSTALL_DIR/" 2>/dev/null || true
    success "Files copied"
  fi
else
  INSTALL_DIR="$SCRIPT_DIR"
fi

info "Installation directory: ${BOLD}${INSTALL_DIR}${NC}"

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────
step 1 "Checking prerequisites"

# Check Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    success "Node.js ${NODE_VERSION} found"
  else
    warn "Node.js ${NODE_VERSION} found, but >= 18 is required"
    if ask_yn "Install Node.js 20 via NodeSource?" "y"; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
      success "Node.js $(node --version) installed"
    else
      error "Node.js >= 18 is required. Aborting."
      exit 1
    fi
  fi
else
  warn "Node.js not found"
  if ask_yn "Install Node.js 20 via NodeSource?" "y"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    success "Node.js $(node --version) installed"
  else
    error "Node.js is required. Aborting."
    exit 1
  fi
fi

# Check build tools (needed for better-sqlite3)
if ! command -v make &>/dev/null || ! command -v g++ &>/dev/null; then
  warn "Build tools not found (needed for better-sqlite3)"
  if ask_yn "Install build-essential, python3, make, g++?" "y"; then
    apt-get update -qq
    apt-get install -y build-essential python3 make g++
    success "Build tools installed"
  fi
else
  success "Build tools available"
fi

# ─── Step 2: Configure .env ──────────────────────────────────────────────────
step 2 "Configuring environment"

ENV_FILE="${INSTALL_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
  warn ".env already exists at ${ENV_FILE}"
  if ask_yn "Overwrite existing .env?" "n"; then
    CONFIGURE_ENV=true
  else
    CONFIGURE_ENV=false
    success "Keeping existing .env"
  fi
else
  CONFIGURE_ENV=true
fi

if [ "$CONFIGURE_ENV" = true ]; then
  echo ""
  echo -e "  ${DIM}─── Dashboard Credentials ───${NC}"
  APP_USERNAME=$(ask "Dashboard username" "admin")
  APP_PASSWORD=$(ask_secret "Dashboard password")
  while [ -z "$APP_PASSWORD" ]; do
    warn "Password cannot be empty"
    APP_PASSWORD=$(ask_secret "Dashboard password")
  done

  echo ""
  echo -e "  ${DIM}─── Remnawave Connection ───${NC}"
  REMNAWAVE_BASE_URL=$(ask "Remnawave panel URL (e.g. https://panel.example.com)")
  while [ -z "$REMNAWAVE_BASE_URL" ]; do
    warn "Panel URL is required"
    REMNAWAVE_BASE_URL=$(ask "Remnawave panel URL")
  done
  # Remove trailing slash
  REMNAWAVE_BASE_URL="${REMNAWAVE_BASE_URL%/}"

  REMNAWAVE_API_TOKEN=$(ask_secret "Remnawave API token")
  while [ -z "$REMNAWAVE_API_TOKEN" ]; do
    warn "API token is required"
    REMNAWAVE_API_TOKEN=$(ask_secret "Remnawave API token")
  done

  echo ""
  echo -e "  ${DIM}─── Optional Settings ───${NC}"
  PORT=$(ask "HTTP port" "8787")
  SYNC_INTERVAL=$(ask "Sync interval (seconds)" "60")

  TELEGRAM_BOT_TOKEN=""
  if ask_yn "Configure Telegram bot for user warnings?" "n"; then
    TELEGRAM_BOT_TOKEN=$(ask_secret "Telegram Bot Token")
  fi

  # Generate session secret automatically
  SESSION_SECRET=$(generate_secret)
  info "Session secret generated automatically (48 chars)"

  # Write .env
  cat > "$ENV_FILE" << ENVEOF
PORT=${PORT}

APP_USERNAME=${APP_USERNAME}
APP_PASSWORD=${APP_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}

REMNAWAVE_BASE_URL=${REMNAWAVE_BASE_URL}
REMNAWAVE_API_TOKEN=${REMNAWAVE_API_TOKEN}

REFRESH_INTERVAL_SECONDS=30

DB_PATH=./data/remnawave-monitor.sqlite
SYNC_INTERVAL_SECONDS=${SYNC_INTERVAL}
IP_HISTORY_RETENTION_HOURS=24
IP_STABILITY_WINDOW_MINUTES=15
SYNC_LOG_RETENTION_DAYS=7
HWID_DETAILS_LIMIT=150
HWID_DETAILS_CONCURRENCY=8
IP_GEO_ENABLED=true
IP_GEO_CACHE_TTL_DAYS=7
IP_GEO_SYNC_LIMIT=200
IP_GEO_CONCURRENCY=4

TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
ENVEOF

  chmod 600 "$ENV_FILE"
  success ".env created and secured (chmod 600)"
fi

# ─── Step 3: Install npm dependencies ────────────────────────────────────────
step 3 "Installing dependencies"

cd "$INSTALL_DIR"
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
  info "node_modules exists"
  if ask_yn "Reinstall dependencies?" "n"; then
    rm -rf node_modules
    npm install --omit=dev
    success "Dependencies reinstalled"
  else
    success "Using existing node_modules"
  fi
else
  npm install --omit=dev
  success "Dependencies installed"
fi

# Verify syntax
info "Verifying source files..."
if node --check src/server.js && \
   node --check src/remnawave-sync.js && \
   node --check src/sync-store.js && \
   node --check src/detect.js && \
   node --check src/rules.js && \
   node --check src/ip-check.js; then
  success "All source files are valid"
else
  error "Syntax check failed!"
  exit 1
fi

# ─── Step 4: Create system user ──────────────────────────────────────────────
step 4 "Setting up system user"

SERVICE_USER="remnawave"

if id "$SERVICE_USER" &>/dev/null; then
  success "User '${SERVICE_USER}' already exists"
else
  useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  success "System user '${SERVICE_USER}' created"
fi

# Create data directory
mkdir -p "${INSTALL_DIR}/data"

# Set ownership
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
success "Ownership set to ${SERVICE_USER}:${SERVICE_USER}"

# ─── Step 5: Set up systemd service ──────────────────────────────────────────
step 5 "Configuring systemd service"

SYSTEMD_FILE="/etc/systemd/system/remnawave-monitor.service"

if [ -f "$SYSTEMD_FILE" ]; then
  warn "systemd service already exists"
  SETUP_SERVICE=$(ask_yn "Overwrite systemd service?" "n" && echo true || echo false)
else
  SETUP_SERVICE=$(ask_yn "Install systemd service (auto-start on boot)?" "y" && echo true || echo false)
fi

if [ "$SETUP_SERVICE" = "true" ]; then
  NODE_PATH=$(which node)
  cat > "$SYSTEMD_FILE" << SVCEOF
[Unit]
Description=Remnawave Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${NODE_PATH} ${INSTALL_DIR}/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
SVCEOF

  systemctl daemon-reload
  systemctl enable remnawave-monitor
  success "systemd service installed and enabled"

  if ask_yn "Start Remnawave Monitor now?" "y"; then
    systemctl start remnawave-monitor
    sleep 2
    if systemctl is-active --quiet remnawave-monitor; then
      success "Remnawave Monitor is running!"
    else
      error "Service failed to start. Check logs:"
      echo -e "  ${DIM}journalctl -u remnawave-monitor -n 20 --no-pager${NC}"
    fi
  fi
fi

# ─── Step 6: Caddy reverse proxy ─────────────────────────────────────────────
step 6 "Reverse proxy (Caddy)"

SETUP_CADDY=false
if command -v caddy &>/dev/null; then
  success "Caddy is installed"
  if ask_yn "Configure Caddy reverse proxy for HTTPS?" "y"; then
    SETUP_CADDY=true
  fi
else
  info "Caddy is not installed"
  if ask_yn "Install and configure Caddy?" "n"; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y caddy
    success "Caddy installed"
    SETUP_CADDY=true
  fi
fi

if [ "$SETUP_CADDY" = true ]; then
  DOMAIN=$(ask "Your domain (e.g. monitor.example.com)")
  if [ -n "$DOMAIN" ]; then
    CADDY_FILE="/etc/caddy/Caddyfile"
    # Backup existing Caddyfile
    if [ -f "$CADDY_FILE" ]; then
      cp "$CADDY_FILE" "${CADDY_FILE}.bak.$(date +%s)"
      info "Existing Caddyfile backed up"
    fi

    LISTEN_PORT="${PORT:-8787}"
    cat > "$CADDY_FILE" << CADDYEOF
${DOMAIN} {
    encode zstd gzip

    header {
        Strict-Transport-Security "max-age=31536000"
    }

    reverse_proxy 127.0.0.1:${LISTEN_PORT} {
        header_up X-Forwarded-Proto {scheme}
    }
}
CADDYEOF

    systemctl reload caddy 2>/dev/null || systemctl restart caddy
    success "Caddy configured for ${DOMAIN}"
    info "HTTPS certificate will be obtained automatically"
  fi
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ┌─────────────────────────────────────────────┐"
echo "  │       ✔  Installation Complete!              │"
echo "  └─────────────────────────────────────────────┘"
echo -e "${NC}"

echo -e "  ${BOLD}Installation path:${NC}  ${INSTALL_DIR}"
echo -e "  ${BOLD}Configuration:${NC}      ${INSTALL_DIR}/.env"
echo -e "  ${BOLD}Database:${NC}            ${INSTALL_DIR}/data/remnawave-monitor.sqlite"
echo -e "  ${BOLD}Local URL:${NC}           http://127.0.0.1:${PORT:-8787}"
if [ -n "${DOMAIN:-}" ]; then
  echo -e "  ${BOLD}Public URL:${NC}          https://${DOMAIN}"
fi

echo ""
echo -e "  ${DIM}Useful commands:${NC}"
echo -e "    ${CYAN}systemctl status remnawave-monitor${NC}   — check status"
echo -e "    ${CYAN}systemctl restart remnawave-monitor${NC}  — restart"
echo -e "    ${CYAN}journalctl -u remnawave-monitor -f${NC}   — live logs"
echo ""
echo -e "  ${DIM}The database will be created automatically on first run.${NC}"
echo -e "  ${DIM}Data will start appearing after the first sync cycle (~60s).${NC}"
echo ""
