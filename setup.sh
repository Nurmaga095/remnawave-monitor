#!/usr/bin/env bash
#
# Remnawave Monitor — интерактивный установщик
# Автоматически устанавливает зависимости, настраивает .env и при необходимости
# добавляет systemd-сервис и обратный прокси через Caddy.
#
# Использование:
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
  echo "  │       Установка Remnawave Monitor            │"
  echo "  │       v1.0.0 • интерактивный режим           │"
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
  local hint="Д/н"
  [ "$default" = "n" ] && hint="д/Н"
  echo -ne "  ${GREEN}?${NC}  ${prompt} ${DIM}(${hint})${NC}: " >&2
  local result=""
  read -r result
  result="${result:-$default}"
  [[ "$result" =~ ^[YyДд] ]]
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

normalize_domain() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  if [[ "$value" =~ https?:// ]]; then
    value="$(printf '%s' "$value" | sed -E 's#.*https?://##')"
  fi
  value="$(printf '%s' "$value" | sed -E 's#/.*$##; s/^[[:space:]]+|[[:space:]]+$//g')"
  echo "$value"
}

TOTAL_STEPS=6

# ─── Main ─────────────────────────────────────────────────────────────────────
banner

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  error "Скрипт нужно запускать от root (через sudo)"
  echo -e "  Запустите: ${BOLD}sudo ./setup.sh${NC}"
  exit 1
fi

# Detect install directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR=""

echo ""
info "Расположение скрипта: ${BOLD}${SCRIPT_DIR}${NC}"

if ask_yn "Установить в /opt/remnawave-monitor?" "y"; then
  INSTALL_DIR="/opt/remnawave-monitor"
  if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    info "Копирую файлы в ${INSTALL_DIR}..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/" 2>/dev/null || true
    cp "$SCRIPT_DIR"/.env.example "$INSTALL_DIR/" 2>/dev/null || true
    cp "$SCRIPT_DIR"/.gitignore "$INSTALL_DIR/" 2>/dev/null || true
    success "Файлы скопированы"
  fi
else
  INSTALL_DIR="$SCRIPT_DIR"
fi

info "Каталог установки: ${BOLD}${INSTALL_DIR}${NC}"

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────
step 1 "Проверка зависимостей"

# Check Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    success "Node.js ${NODE_VERSION} найден"
  else
    warn "Найден Node.js ${NODE_VERSION}, но требуется версия >= 18"
    if ask_yn "Установить Node.js 20 через NodeSource?" "y"; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
      success "Node.js $(node --version) установлен"
    else
      error "Требуется Node.js >= 18. Установка остановлена."
      exit 1
    fi
  fi
else
  warn "Node.js не найден"
  if ask_yn "Установить Node.js 20 через NodeSource?" "y"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    success "Node.js $(node --version) установлен"
  else
    error "Node.js обязателен для работы. Установка остановлена."
    exit 1
  fi
fi

# Check build tools (needed for better-sqlite3)
if ! command -v make &>/dev/null || ! command -v g++ &>/dev/null; then
  warn "Инструменты сборки не найдены (нужны для better-sqlite3)"
  if ask_yn "Установить build-essential, python3, make, g++?" "y"; then
    apt-get update -qq
    apt-get install -y build-essential python3 make g++
    success "Инструменты сборки установлены"
  fi
else
  success "Инструменты сборки найдены"
fi

# ─── Step 2: Configure .env ──────────────────────────────────────────────────
step 2 "Настройка окружения"

ENV_FILE="${INSTALL_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
  warn ".env уже существует: ${ENV_FILE}"
  if ask_yn "Перезаписать существующий .env?" "n"; then
    CONFIGURE_ENV=true
  else
    CONFIGURE_ENV=false
    success "Оставляю существующий .env"
  fi
else
  CONFIGURE_ENV=true
fi

if [ "$CONFIGURE_ENV" = true ]; then
  echo ""
  echo -e "  ${DIM}─── Доступ к панели ───${NC}"
  APP_USERNAME=$(ask "Имя пользователя панели" "admin")
  APP_PASSWORD=$(ask_secret "Пароль панели")
  while [ -z "$APP_PASSWORD" ]; do
    warn "Пароль не может быть пустым"
    APP_PASSWORD=$(ask_secret "Пароль панели")
  done

  echo ""
  echo -e "  ${DIM}─── Подключение к Remnawave ───${NC}"
  REMNAWAVE_BASE_URL=$(ask "URL панели Remnawave (например https://panel.example.com)")
  while [ -z "$REMNAWAVE_BASE_URL" ]; do
    warn "URL панели обязателен"
    REMNAWAVE_BASE_URL=$(ask "URL панели Remnawave")
  done
  # Remove trailing slash
  REMNAWAVE_BASE_URL="${REMNAWAVE_BASE_URL%/}"

  REMNAWAVE_API_TOKEN=$(ask_secret "API-токен Remnawave")
  while [ -z "$REMNAWAVE_API_TOKEN" ]; do
    warn "API-токен обязателен"
    REMNAWAVE_API_TOKEN=$(ask_secret "API-токен Remnawave")
  done

  echo ""
  echo -e "  ${DIM}─── Дополнительные настройки ───${NC}"
  PORT=$(ask "HTTP-порт" "8787")
  SYNC_INTERVAL=$(ask "Интервал синхронизации (секунды)" "60")

  TELEGRAM_BOT_TOKEN=""
  if ask_yn "Настроить Telegram-бота для предупреждений пользователям?" "n"; then
    TELEGRAM_BOT_TOKEN=$(ask_secret "Токен Telegram-бота")
  fi

  # Generate session secret automatically
  SESSION_SECRET=$(generate_secret)
  info "SESSION_SECRET сгенерирован автоматически (48 символов)"

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
  success ".env создан и защищен (chmod 600)"
fi

# ─── Step 3: Install npm dependencies ────────────────────────────────────────
step 3 "Установка зависимостей"

cd "$INSTALL_DIR"
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
  info "node_modules уже существует"
  if ask_yn "Переустановить зависимости?" "n"; then
    rm -rf node_modules
    npm install --omit=dev
    success "Зависимости переустановлены"
  else
    success "Использую существующий node_modules"
  fi
else
  npm install --omit=dev
  success "Зависимости установлены"
fi

# Verify syntax
info "Проверяю исходные файлы..."
if node --check src/server.js && \
   node --check src/remnawave-sync.js && \
   node --check src/sync-store.js && \
   node --check src/detect.js && \
   node --check src/rules.js && \
   node --check src/ip-check.js && \
   node --check src/ai-service.js && \
   node --check src/utils.js; then
  success "Синтаксис исходных файлов корректен"
else
  error "Проверка синтаксиса не пройдена!"
  exit 1
fi

# ─── Step 4: Create system user ──────────────────────────────────────────────
step 4 "Настройка системного пользователя"

SERVICE_USER="remnawave"

if id "$SERVICE_USER" &>/dev/null; then
  success "Пользователь '${SERVICE_USER}' уже существует"
else
  useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  success "Системный пользователь '${SERVICE_USER}' создан"
fi

# Create data directory
mkdir -p "${INSTALL_DIR}/data"

# Set ownership
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
success "Права владельца установлены: ${SERVICE_USER}:${SERVICE_USER}"

# ─── Step 5: Set up systemd service ──────────────────────────────────────────
step 5 "Настройка systemd-сервиса"

SYSTEMD_FILE="/etc/systemd/system/remnawave-monitor.service"

if [ -f "$SYSTEMD_FILE" ]; then
  warn "systemd-сервис уже существует"
  SETUP_SERVICE=$(ask_yn "Перезаписать systemd-сервис?" "n" && echo true || echo false)
else
  SETUP_SERVICE=$(ask_yn "Установить systemd-сервис (автозапуск при старте)?" "y" && echo true || echo false)
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
  success "systemd-сервис установлен и включен"

  if ask_yn "Запустить Remnawave Monitor сейчас?" "y"; then
    systemctl start remnawave-monitor
    sleep 2
    if systemctl is-active --quiet remnawave-monitor; then
      success "Remnawave Monitor запущен!"
    else
      error "Сервис не запустился. Проверьте логи:"
      echo -e "  ${DIM}journalctl -u remnawave-monitor -n 20 --no-pager${NC}"
    fi
  fi
fi

# ─── Step 6: Caddy reverse proxy ─────────────────────────────────────────────
step 6 "Обратный прокси (Caddy)"

SETUP_CADDY=false
if command -v caddy &>/dev/null; then
  success "Caddy установлен"
  if ask_yn "Настроить обратный прокси Caddy для HTTPS?" "y"; then
    SETUP_CADDY=true
  fi
else
  info "Caddy не установлен"
  if ask_yn "Установить и настроить Caddy?" "n"; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y caddy
    success "Caddy установлен"
    SETUP_CADDY=true
  fi
fi

if [ "$SETUP_CADDY" = true ]; then
  DOMAIN=$(ask "Ваш домен (например monitor.example.com)")
  DOMAIN=$(normalize_domain "$DOMAIN")
  if [ -n "$DOMAIN" ]; then
    info "Будет использован домен: ${BOLD}${DOMAIN}${NC}"
    CADDY_FILE="/etc/caddy/Caddyfile"
    # Backup existing Caddyfile
    if [ -f "$CADDY_FILE" ]; then
      cp "$CADDY_FILE" "${CADDY_FILE}.bak.$(date +%s)"
      info "Существующий Caddyfile сохранен в резервную копию"
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
    success "Caddy настроен для ${DOMAIN}"
    info "HTTPS-сертификат будет получен автоматически"
  fi
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ┌─────────────────────────────────────────────┐"
echo "  │       ✔  Установка завершена!                │"
echo "  └─────────────────────────────────────────────┘"
echo -e "${NC}"

echo -e "  ${BOLD}Каталог установки:${NC}  ${INSTALL_DIR}"
echo -e "  ${BOLD}Конфигурация:${NC}       ${INSTALL_DIR}/.env"
echo -e "  ${BOLD}База данных:${NC}        ${INSTALL_DIR}/data/remnawave-monitor.sqlite"
echo -e "  ${BOLD}Локальный URL:${NC}      http://127.0.0.1:${PORT:-8787}"
if [ -n "${DOMAIN:-}" ]; then
  echo -e "  ${BOLD}Публичный URL:${NC}      https://${DOMAIN}"
fi

echo ""
echo -e "  ${DIM}Полезные команды:${NC}"
echo -e "    ${CYAN}systemctl status remnawave-monitor${NC}   — проверить статус"
echo -e "    ${CYAN}systemctl restart remnawave-monitor${NC}  — перезапустить"
echo -e "    ${CYAN}journalctl -u remnawave-monitor -f${NC}   — смотреть логи"
echo ""
echo -e "  ${DIM}База данных будет создана автоматически при первом запуске.${NC}"
echo -e "  ${DIM}Данные появятся после первого цикла синхронизации (~60 секунд).${NC}"
echo ""
