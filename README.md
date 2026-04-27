<p align="center">
  <img src="docs/banner.png" alt="Remnawave Monitor" width="100%" />
</p>

<h1 align="center">Remnawave Monitor</h1>

<p align="center">
  <strong>Self-hosted monitoring dashboard for <a href="https://github.com/remnawave/backend">Remnawave</a> VPN panel</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-detection-engine">Detection Engine</a> •
  <a href="#-license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/database-SQLite-blue?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/framework-none-lightgrey?style=flat-square" alt="No framework" />
</p>

---

## 📋 Overview

**Remnawave Monitor** is a lightweight, self-hosted web dashboard that connects to your [Remnawave](https://github.com/remnawave/backend) VPN panel and provides:

- **Real-time connection monitoring** — see who's online, from where, and on which devices
- **Abuse detection** — automatically identifies credential sharing via HWID analysis
- **Incident management** — track, warn, and resolve suspicious users
- **Connection map** — visualize active connections on a world map

No external frameworks required. Pure Node.js + vanilla JavaScript. Single dependency: `better-sqlite3`.

---

## ✨ Features

### 🖥 Dashboard
- Live user count, active sessions, HWID devices, and suspect overview
- Country breakdown with real-time statistics
- Interactive connection map powered by [Leaflet](https://leafletjs.com/)
- Sliding time windows: Live / 5min / 15min / 30min

### 👥 Active Sessions
- Full list of currently connected users with IP and geolocation data
- Filters: multi-IP, multi-HWID, by country
- Sortable and searchable

### 🔍 Detection Engine
- **HWID-first approach** — hardware IDs are the only deterministic signal
- Multi-layered risk scoring with 3 signal categories (Deterministic / Strong / Indirect)
- Automatic incident creation when anomalies are detected
- Zero false positives on mobile users (CGNAT-aware)

### 🚨 Incident Management
- Status workflow: `New → Reviewing → Warned → Resolved / Banned`
- Operator notes and audit trail
- Auto-reopen on recurring detection
- Telegram warnings to users

### 🔗 Relation Graph
- IP / ASN / HWID cluster analysis
- Multi-account detection via shared devices
- 30-minute rolling window

### ⚙️ Rule Engine
- Custom detection rules with configurable thresholds
- Automatic Telegram notifications on trigger
- Per-rule cooldowns and enable/disable

### 🎨 UI/UX
- Dark theme with glassmorphism design
- Light theme support
- Responsive layout (mobile-friendly)
- Real-time auto-refresh with countdown

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **Remnawave** panel instance with API access
- *(Optional)* Build tools for `better-sqlite3` compilation: `build-essential`, `python3`

### Automated Installation (recommended)

The interactive installer will guide you through the entire setup:

```bash
git clone https://github.com/Nurmaga095/remnawave-monitor.git
cd remnawave-monitor
sudo chmod +x setup.sh
sudo ./setup.sh
```

The installer will:
- ✅ Check and install Node.js if needed
- ✅ Install build tools for `better-sqlite3`
- ✅ Ask for all required settings (credentials, Remnawave URL, API token)
- ✅ Generate a secure session secret
- ✅ Create `.env` with proper permissions
- ✅ Install npm dependencies
- ✅ Create a system user
- ✅ Set up systemd service (auto-start on boot)
- ✅ Optionally configure Caddy reverse proxy with HTTPS

### Manual Installation

```bash
git clone https://github.com/Nurmaga095/remnawave-monitor.git
cd remnawave-monitor
cp .env.example .env
npm install --omit=dev
```

### Configuration

Edit `.env` with your settings:

```env
# Dashboard credentials
APP_USERNAME=admin
APP_PASSWORD=your-secure-password
SESSION_SECRET=replace-with-at-least-32-random-characters

# Remnawave connection
REMNAWAVE_BASE_URL=https://your-panel.example.com
REMNAWAVE_API_TOKEN=your-remnawave-api-token

# Optional: Telegram warnings
TELEGRAM_BOT_TOKEN=your-bot-token
```

### Run

```bash
npm start
```

Open `http://127.0.0.1:8787` and log in with your credentials.

---

## 🌐 Deployment

### Ubuntu / Debian VPS

#### 1. Install dependencies

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build tools (for better-sqlite3)
sudo apt install -y build-essential python3 make g++

# Caddy (reverse proxy)
sudo apt install -y caddy
```

#### 2. Deploy the application

```bash
sudo git clone https://github.com/Nurmaga095/remnawave-monitor.git /opt/remnawave-monitor
cd /opt/remnawave-monitor
sudo cp .env.example .env
sudo nano .env  # fill in your values
sudo npm install --omit=dev
```

#### 3. Create a system user

```bash
sudo useradd --system --home /opt/remnawave-monitor --shell /usr/sbin/nologin remnawave
sudo chown -R remnawave:remnawave /opt/remnawave-monitor
```

#### 4. Install systemd service

```bash
sudo cp /opt/remnawave-monitor/remnawave-monitor.service.example \
        /etc/systemd/system/remnawave-monitor.service
sudo systemctl daemon-reload
sudo systemctl enable --now remnawave-monitor
```

#### 5. Configure Caddy

```bash
sudo cp /opt/remnawave-monitor/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile  # replace your-domain.example
sudo systemctl reload caddy
```

#### 6. Firewall

Only expose ports `22`, `80`, `443`. Port `8787` should **not** be open externally — Caddy proxies it over HTTPS.

---

## ⚙️ Configuration

All settings are configured via environment variables in `.env`:

### Core

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP listen port | `8787` |
| `APP_USERNAME` | Dashboard login | — |
| `APP_PASSWORD` | Dashboard password | — |
| `SESSION_SECRET` | HMAC secret (≥32 chars) | — |
| `REMNAWAVE_BASE_URL` | Remnawave panel URL | — |
| `REMNAWAVE_API_TOKEN` | Remnawave API token | — |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for warnings | — |

### Sync & Storage

| Variable | Description | Default |
|---|---|---|
| `DB_PATH` | SQLite database path | `./data/remnawave-monitor.sqlite` |
| `SYNC_INTERVAL_SECONDS` | Sync cycle interval | `60` |
| `IP_HISTORY_RETENTION_HOURS` | IP snapshot retention | `24` |
| `SYNC_LOG_RETENTION_DAYS` | Sync log retention | `7` |

### HWID

| Variable | Description | Default |
|---|---|---|
| `HWID_DETAILS_LIMIT` | Max users for HWID details fetch | `150` |
| `HWID_DETAILS_CONCURRENCY` | Parallel HWID requests | `8` |

### IP Geolocation

| Variable | Description | Default |
|---|---|---|
| `IP_GEO_ENABLED` | Enable IP geolocation caching | `true` |
| `IP_GEO_CACHE_TTL_DAYS` | Geo cache TTL | `7` |
| `IP_GEO_SYNC_LIMIT` | Max new IPs per sync for geo enrichment | `200` |
| `IP_GEO_CONCURRENCY` | Parallel geo requests | `4` |

---

## 🔍 Detection Engine

The detection engine analyzes user behavior using a **device-first** approach. HWID (Hardware ID) is the only deterministic signal for identifying abuse.

### Signal Categories

| Category | Description | Can trigger action? |
|---|---|---|
| **DETERMINISTIC** | Objective facts (HWID > limit) | ✅ Auto-escalation |
| **STRONG** | High correlation (HWID churn, 24/7 activity, IP excess) | ✅ In combination |
| **INDIRECT** | Context only (country diversity, traffic) | ❌ Never alone |

### Risk Levels

| Score | Level | Description |
|---|---|---|
| 80+ | 🔴 Critical | HWID over limit or strong signal combo |
| 60–79 | 🟠 High Risk | Deterministic or strong signals |
| 40–59 | 🟡 Suspicious | Strong signals required |
| 20–39 | 🔵 Notice | Any signal |
| <20 | ⚪ Clean | No issues |

### CGNAT Awareness

The engine is specifically designed to **avoid false positives** from mobile users behind CGNAT. IP-based signals alone can never trigger a detection — they only provide context for operator review.

---

## 🏗 Architecture

```
remnawave-monitor/
├── src/
│   ├── server.js            # HTTP server, routing, auth, proxy
│   ├── remnawave-sync.js    # Background sync with Remnawave API
│   ├── sync-store.js        # SQLite data layer
│   ├── detect.js            # Detection engine
│   ├── rules.js             # Rule engine
│   └── ip-check.js          # IP analysis utilities
├── public/
│   ├── index.html           # SPA shell
│   ├── js/app.js            # Frontend application
│   └── css/style.css        # Styles (dark/light theme)
├── setup.sh                 # Interactive installer
├── .env.example             # Configuration template
├── Caddyfile.example        # Caddy reverse proxy config
└── remnawave-monitor.service.example  # systemd unit
```

### How it works

1. **Sync Loop** — The server periodically fetches users, active IPs, and HWID data from Remnawave API
2. **Geo Enrichment** — IP addresses are enriched with country/ASN/network type via [ipwho.is](https://ipwho.is)
3. **Detection** — Each sync cycle runs the detection engine to identify anomalies
4. **Incidents** — Detected anomalies automatically create/update incidents
5. **Dashboard** — The SPA frontend reads cached state from the local API

### Security

- API token is stored server-side only — the browser never receives it
- Authentication via username/password with `HttpOnly` session cookie
- Server listens on `127.0.0.1` by default — use a reverse proxy (Caddy/Nginx) for HTTPS
- `/proxy` endpoint only forwards to the configured Remnawave instance

---

## 📦 Tech Stack

- **Runtime**: Node.js (no frameworks, pure `http` module)
- **Database**: SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Frontend**: Vanilla JavaScript SPA
- **Maps**: [Leaflet](https://leafletjs.com/)
- **Fonts**: [Inter](https://rsms.me/inter/), [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- **Reverse Proxy**: [Caddy](https://caddyserver.com/) (recommended)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ for the Remnawave community
</p>
