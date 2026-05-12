const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const dns = require('dns').promises;
const crypto = require('crypto');
const { createStore } = require('./sync-store');
const { createRemnawaveSync } = require('./remnawave-sync');
const { createAiService } = require('./ai-service');

const PROJECT_ROOT = path.join(__dirname, '..');
loadEnvFile(path.join(PROJECT_ROOT, '.env'));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const APP_USERNAME = process.env.APP_USERNAME || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const REMNAWAVE_BASE_URL = (process.env.REMNAWAVE_BASE_URL || '').replace(/\/+$/, '');
const REMNAWAVE_API_TOKEN = process.env.REMNAWAVE_API_TOKEN || '';
const REFRESH_INTERVAL_SECONDS = Number(process.env.REFRESH_INTERVAL_SECONDS || 30);
const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_SECONDS || 12 * 60 * 60);
const SYNC_INTERVAL_SECONDS = Number(process.env.SYNC_INTERVAL_SECONDS || REFRESH_INTERVAL_SECONDS || 60);
const DB_PATH = process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'remnawave-monitor.sqlite');
const IP_HISTORY_RETENTION_HOURS = Number(process.env.IP_HISTORY_RETENTION_HOURS || 24);
const IP_STABILITY_WINDOW_MINUTES = Number(process.env.IP_STABILITY_WINDOW_MINUTES || 15);
const SYNC_LOG_RETENTION_DAYS = Number(process.env.SYNC_LOG_RETENTION_DAYS || 7);
const HWID_DETAILS_LIMIT = Number(process.env.HWID_DETAILS_LIMIT || 150);
const HWID_DETAILS_CONCURRENCY = Number(process.env.HWID_DETAILS_CONCURRENCY || 8);
const IP_GEO_ENABLED = process.env.IP_GEO_ENABLED !== 'false';
const IP_GEO_CACHE_TTL_DAYS = Number(process.env.IP_GEO_CACHE_TTL_DAYS || 7);
const IP_GEO_SYNC_LIMIT = Number(process.env.IP_GEO_SYNC_LIMIT || 200);
const IP_GEO_CONCURRENCY = Number(process.env.IP_GEO_CONCURRENCY || 4);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const HWID_HISTORY_RETENTION_DAYS = Number(process.env.HWID_HISTORY_RETENTION_DAYS || 30);
const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS || 14);
const ACTIVITY_HISTORY_RETENTION_DAYS = Number(process.env.ACTIVITY_HISTORY_RETENTION_DAYS || 7);

const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const PUBLIC_FILES = new Set([
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/api.js',
  'js/charts.js',
  'js/state.js',
  'js/ui.js',
  'favicon.ico',
  'favicon.svg',
]);
const COOKIE_NAME = 'rwm_session';
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const sessions = new Map();

// ─── Rate Limiting (login) ─────────────────────────────────────
const loginAttempts = new Map();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MS = 60 * 1000;
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_RATE_WINDOW_MS) {
    loginAttempts.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > LOGIN_RATE_LIMIT) return false;
  return true;
}

// ─── Rate Limiting (actions — ban, notify, whitelist, etc.) ────
const actionAttempts = new Map();
const ACTION_RATE_LIMIT = 30;
const ACTION_RATE_WINDOW_MS = 60 * 1000;
function checkActionRateLimit(sessionId) {
  const now = Date.now();
  const entry = actionAttempts.get(sessionId);
  if (!entry || now - entry.windowStart > ACTION_RATE_WINDOW_MS) {
    actionAttempts.set(sessionId, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > ACTION_RATE_LIMIT) return false;
  return true;
}
function requireActionRateLimit(req, res) {
  const session = getSession(req);
  if (!session) return true; // auth will handle it
  if (!checkActionRateLimit(session.id)) {
    sendJson(res, 429, { error: 'Слишком много действий. Подождите минуту.' });
    return false;
  }
  return true;
}

// ─── State version tracking (ETag) ─────────────────────────────
let stateVersion = 0;
let stateETag = '"0"';
let cachedStateJson = null;
function invalidateStateCache() {
  stateVersion++;
  stateETag = `"v${stateVersion}-${Date.now().toString(36)}"`;
  cachedStateJson = null;
}
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

const store = createStore({
  dbPath: DB_PATH,
  ipHistoryRetentionMs: IP_HISTORY_RETENTION_HOURS * 60 * 60 * 1000,
  syncLogRetentionMs: SYNC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  stateHistoryWindowMs: IP_STABILITY_WINDOW_MINUTES * 60 * 1000,
  ipGeoCacheTtlMs: IP_GEO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
  hwidHistoryRetentionDays: HWID_HISTORY_RETENTION_DAYS,
  auditLogRetentionDays: AUDIT_LOG_RETENTION_DAYS,
  activityHistoryRetentionDays: ACTIVITY_HISTORY_RETENTION_DAYS,
});

// Restore persisted sessions from DB
try {
  const restored = store.loadAllSessions();
  for (const row of restored) {
    sessions.set(row.session_id, {
      username: row.username,
      expiresAt: row.expires_at,
    });
  }
  if (restored.length > 0) console.log(`[session] restored ${restored.length} session(s) from DB`);
} catch (e) {
  console.error('[session] restore error:', e.message);
}

const dataSync = createRemnawaveSync({
  store,
  config: {
    baseUrl: REMNAWAVE_BASE_URL,
    token: REMNAWAVE_API_TOKEN,
    syncIntervalSeconds: SYNC_INTERVAL_SECONDS,
    hwidDetailsLimit: HWID_DETAILS_LIMIT,
    hwidDetailsConcurrency: HWID_DETAILS_CONCURRENCY,
    ipGeoEnabled: IP_GEO_ENABLED,
    ipGeoCacheTtlDays: IP_GEO_CACHE_TTL_DAYS,
    ipGeoSyncLimit: IP_GEO_SYNC_LIMIT,
    ipGeoConcurrency: IP_GEO_CONCURRENCY,
  },
});

const aiService = createAiService({ store });

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' });
      res.end();
      return;
    }

    if (pathname === '/health') {
      handleHealth(req, res);
      return;
    }

    if (pathname === '/api/login') {
      await handleLogin(req, res);
      return;
    }

    if (pathname === '/api/logout') {
      await handleLogout(req, res);
      return;
    }

    if (pathname === '/api/session') {
      await handleSession(req, res);
      return;
    }

    if (pathname === '/api/state') {
      await handleState(req, res);
      return;
    }

    if (pathname === '/api/sync-status') {
      await handleSyncStatus(req, res);
      return;
    }

    if (pathname === '/api/refresh') {
      await handleRefresh(req, res);
      return;
    }

    if (pathname === '/resolve-hosts') {
      await handleResolveHosts(req, res);
      return;
    }

    if (pathname === '/proxy') {
      await handleProxy(req, res, parsedUrl);
      return;
    }

    if (pathname === '/api/ban') {
      await handleBan(req, res);
      return;
    }

    if (pathname === '/api/whitelist') {
      await handleWhitelist(req, res);
      return;
    }

    if (pathname === '/api/user-note') {
      await handleUserNote(req, res);
      return;
    }

    if (pathname === '/api/user-history') {
      await handleUserHistory(req, res);
      return;
    }

    if (pathname === '/api/sub-history') {
      await handleSubHistory(req, res);
      return;
    }

    if (pathname === '/api/notify-user') {
      await handleNotifyUser(req, res);
      return;
    }

    if (pathname === '/api/user-notifications') {
      await handleUserNotifications(req, res);
      return;
    }

    if (pathname === '/api/incidents') {
      await handleIncidents(req, res);
      return;
    }

    if (pathname === '/api/incident') {
      await handleIncident(req, res);
      return;
    }

    if (pathname === '/api/events') {
      handleSSE(req, res);
      return;
    }

    if (pathname === '/api/rules') {
      await handleRules(req, res);
      return;
    }

    if (pathname === '/api/rule') {
      await handleRule(req, res);
      return;
    }

    if (pathname === '/api/rule/test') {
      await handleRuleTest(req, res);
      return;
    }

    if (pathname === '/api/rule/triggers') {
      await handleRuleTriggers(req, res);
      return;
    }

    if (pathname === '/api/rule/acknowledge') {
      await handleRuleAcknowledge(req, res);
      return;
    }

    if (pathname === '/api/ai/settings') {
      await handleAiSettings(req, res);
      return;
    }

    if (pathname === '/api/ai/test') {
      await handleAiTest(req, res);
      return;
    }

    if (pathname === '/api/ai/analyze-user') {
      await handleAiAnalyzeUser(req, res);
      return;
    }

    if (pathname === '/api/ai/analyze-suspects') {
      await handleAiAnalyzeSuspects(req, res);
      return;
    }

    if (pathname === '/api/export') {
      await handleExport(req, res, parsedUrl);
      return;
    }

    if (pathname === '/api/audit-log') {
      await handleAuditLog(req, res);
      return;
    }

    if (pathname === '/api/hwid-devices') {
      await handleHwidDevices(req, res, parsedUrl);
      return;
    }

    if (pathname === '/api/user-bandwidth') {
      await handleUserBandwidth(req, res, parsedUrl);
      return;
    }

    if (pathname === '/api/fetch-user-ips') {
      await handleFetchUserIps(req, res, parsedUrl);
      return;
    }

    if (pathname === '/api/hwid-device-delete') {
      await handleHwidDeviceDelete(req, res);
      return;
    }

    if (pathname === '/api/bulk-action') {
      await handleBulkAction(req, res);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (e) {
    console.error('[server] unexpected error:', e);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
}

function isAuthConfigured() {
  return Boolean(APP_USERNAME && APP_PASSWORD && SESSION_SECRET && SESSION_SECRET.length >= 32);
}

function isRemnawaveConfigured() {
  return Boolean(REMNAWAVE_BASE_URL && REMNAWAVE_API_TOKEN);
}

function handleHealth(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }
  const syncStatus = dataSync.getStatus();
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  const dbStats = store.getHealthData ? store.getHealthData() : {};
  sendJson(res, 200, {
    status: 'ok',
    version: '2.1.0',
    uptime: Math.round(uptime),
    uptimeHuman: uptime >= 3600 ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m` : `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    sync: {
      status: syncStatus.status,
      lastFinishedAt: syncStatus.lastFinishedAt,
      nextSyncAt: syncStatus.nextSyncAt,
      isSyncing: syncStatus.isSyncing,
      intervalSeconds: Math.round(Number(SYNC_INTERVAL_SECONDS)),
    },
    remnawaveConfigured: isRemnawaveConfigured(),
    sseClients: sseClients.size,
    sessions: sessions.size,
    stateVersion,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    db: dbStats,
    nodeVersion: process.version,
  });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }

  const clientIp = getClientIp(req);
  if (!checkLoginRateLimit(clientIp)) {
    sendJson(res, 429, { error: 'Слишком много попыток входа. Подождите минуту.' });
    return;
  }

  if (!isAuthConfigured()) {
    sendJson(res, 500, {
      error: 'Application auth is not configured. Set APP_USERNAME, APP_PASSWORD and SESSION_SECRET.',
    });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const username = String(body.username || '');
  const password = String(body.password || '');
  const ok = safeEqual(username, APP_USERNAME) && safeEqual(password, APP_PASSWORD);

  if (!ok) {
    await delay(300);
    console.log(`[auth] failed login attempt from ${clientIp}`);
    sendJson(res, 401, { error: 'Invalid username or password' });
    return;
  }

  const sessionId = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  sessions.set(sessionId, {
    username: APP_USERNAME,
    expiresAt,
  });

  // Persist session to DB
  try { store.saveSession(sessionId, APP_USERNAME, expiresAt); } catch { /* ignore */ }

  res.setHeader('Set-Cookie', buildSessionCookie(req, sessionId));
  sendJson(res, 200, {
    authenticated: true,
    username: APP_USERNAME,
    refreshInterval: REFRESH_INTERVAL_SECONDS,
    syncInterval: SYNC_INTERVAL_SECONDS,
    remnawaveConfigured: isRemnawaveConfigured(),
    sync: dataSync.getStatus(),
  });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }

  const session = getSession(req);
  if (session) {
    sessions.delete(session.id);
    try { store.deleteDbSession(session.id); } catch { /* ignore */ }
  }
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  sendJson(res, 200, { authenticated: false });
}

async function handleSession(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    sendJson(res, 200, {
      authenticated: false,
      authConfigured: isAuthConfigured(),
      remnawaveConfigured: isRemnawaveConfigured(),
    });
    return;
  }

  sendJson(res, 200, {
    authenticated: true,
    username: session.data.username,
    refreshInterval: REFRESH_INTERVAL_SECONDS,
    syncInterval: SYNC_INTERVAL_SECONDS,
    remnawaveConfigured: isRemnawaveConfigured(),
    sync: dataSync.getStatus(),
  });
}

async function handleState(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  // ETag / 304 support — avoid resending unchanged state
  const clientETag = req.headers['if-none-match'];
  if (clientETag && clientETag === stateETag) {
    res.writeHead(304, { 'ETag': stateETag });
    res.end();
    return;
  }

  if (!cachedStateJson) {
    cachedStateJson = JSON.stringify(store.getState());
  }

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'ETag': stateETag,
    'Cache-Control': 'no-store',
  });
  res.end(cachedStateJson);
}

async function handleSyncStatus(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  sendJson(res, 200, dataSync.getStatus());
}

async function handleRefresh(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }

  if (!isRemnawaveConfigured()) {
    sendJson(res, 500, { error: 'Remnawave API is not configured on the server.' });
    return;
  }

  dataSync.trigger('manual');
  sendJson(res, 202, dataSync.getStatus());
}
async function handleBan(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKey = String(body.userKey || '');
  const action = String(body.action || '');
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }
  if (action !== 'ban' && action !== 'unban') {
    sendJson(res, 400, { error: 'action must be "ban" or "unban"' });
    return;
  }

  // Вызываем Remnawave API для реальной блокировки/разблокировки
  if (!isRemnawaveConfigured()) {
    sendJson(res, 500, { error: 'Remnawave API is not configured' });
    return;
  }

  const apiAction = action === 'ban' ? 'disable' : 'enable';
  const apiPath = `/api/users/${encodeURIComponent(userKey)}/actions/${apiAction}`;

  try {
    const baseUrl = new URL(REMNAWAVE_BASE_URL);
    const targetUrl = new URL(apiPath, baseUrl);

    const result = await new Promise((resolve, reject) => {
      const options = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: targetUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REMNAWAVE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'RemnawaveMonitor/1.0',
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          try {
            resolve({ status: proxyRes.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: proxyRes.statusCode, body: { raw: data } });
          }
        });
      });
      proxyReq.on('error', reject);
      proxyReq.end();
    });

    if (result.status >= 200 && result.status < 300) {
      // Сохраняем локальный флаг тоже
      if (action === 'ban') store.banUser(userKey, body.reason || null);
      else store.unbanUser(userKey);
      store.recordAudit(APP_USERNAME, getClientIp(req), action, userKey, { reason: body.reason || null, apiStatus: result.status });
      invalidateStateCache();
      console.log(`[ban] ${action} user ${userKey}: OK (API ${result.status})`);
      sendJson(res, 200, { ok: true, banned: action === 'ban', apiResponse: result.body });
    } else {
      console.error(`[ban] ${action} user ${userKey}: API error ${result.status}`, result.body);
      sendJson(res, result.status || 500, { error: `Remnawave API error: ${result.status}`, detail: result.body });
    }
  } catch (e) {
    console.error(`[ban] ${action} user ${userKey}: error`, e.message);
    sendJson(res, 500, { error: `Ошибка вызова API: ${e.message}` });
  }
}

async function handleWhitelist(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKey = String(body.userKey || '');
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }

  if (req.method === 'POST') {
    store.addToWhitelist(userKey, body.note || null);
    store.recordAudit(APP_USERNAME, getClientIp(req), 'whitelist_add', userKey, { note: body.note || null });
    invalidateStateCache();
    sendJson(res, 200, { ok: true, whitelisted: true });
  } else if (req.method === 'DELETE') {
    store.removeFromWhitelist(userKey);
    store.recordAudit(APP_USERNAME, getClientIp(req), 'whitelist_remove', userKey, null);
    invalidateStateCache();
    sendJson(res, 200, { ok: true, whitelisted: false });
  } else {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST, DELETE' });
  }
}

async function handleUserNote(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKey = String(body.userKey || '');
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }
  store.setUserNote(userKey, body.note || '');
  sendJson(res, 200, { ok: true });
}

async function handleUserHistory(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userKey = url.searchParams.get('userKey') || '';
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours') || 24)));
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }
  try {
    const history = store.getUserHistory(userKey, hours);
    sendJson(res, 200, history);
  } catch (e) {
    console.error('[history] error:', e.message);
    sendJson(res, 500, { error: 'Failed to load history' });
  }
}

async function handleSubHistory(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userKey = url.searchParams.get('userKey') || '';
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }
  try {
    const records = store.getSubHistoryForUser(userKey);
    sendJson(res, 200, { records });
  } catch (e) {
    console.error('[sub-history] error:', e.message);
    sendJson(res, 500, { error: 'Failed to load subscription history' });
  }
}

// ─── Remnawave API Proxy Helper ─────────────────────────────────
function remnawaveApi(method, apiPath, body = null, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const base = new URL(REMNAWAVE_BASE_URL);
    const proto = base.protocol === 'https:' ? https : require('http');
    const opts = {
      hostname: base.hostname,
      port: base.port || (base.protocol === 'https:' ? 443 : 80),
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${REMNAWAVE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs);
    const req = proto.request(opts, (resp) => {
      // Reject redirects to prevent SSRF
      if (resp.statusCode >= 300 && resp.statusCode < 400) {
        clearTimeout(timer);
        reject(new Error(`Redirect ${resp.statusCode} not followed (SSRF prevention)`));
        return;
      }
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        clearTimeout(timer);
        try {
          const text = Buffer.concat(chunks).toString();
          resolve({ statusCode: resp.statusCode, json: JSON.parse(text) });
        } catch (e) { reject(new Error('Invalid JSON from Remnawave')); }
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Bulk Actions ───────────────────────────────────────────────
async function handleBulkAction(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKeys = Array.isArray(body.userKeys) ? body.userKeys.map(String).filter(Boolean) : [];
  const action = String(body.action || '');

  if (userKeys.length === 0) { sendJson(res, 400, { error: 'userKeys array is required' }); return; }
  if (userKeys.length > 50) { sendJson(res, 400, { error: 'Maximum 50 users per bulk action' }); return; }

  const validActions = ['ban', 'unban', 'whitelist_add', 'whitelist_remove'];
  if (!validActions.includes(action)) {
    sendJson(res, 400, { error: `action must be one of: ${validActions.join(', ')}` });
    return;
  }

  if (!isRemnawaveConfigured() && (action === 'ban' || action === 'unban')) {
    sendJson(res, 500, { error: 'Remnawave API is not configured' });
    return;
  }

  const results = { success: [], failed: [] };
  const clientIp = getClientIp(req);

  for (const userKey of userKeys) {
    try {
      if (action === 'ban' || action === 'unban') {
        const apiAction = action === 'ban' ? 'disable' : 'enable';
        const apiPath = `/api/users/${encodeURIComponent(userKey)}/actions/${apiAction}`;
        const result = await remnawaveApi('POST', apiPath);
        if (result.statusCode >= 200 && result.statusCode < 300) {
          if (action === 'ban') store.banUser(userKey, body.reason || null);
          else store.unbanUser(userKey);
          store.recordAudit(APP_USERNAME, clientIp, `bulk_${action}`, userKey, { reason: body.reason || null });
          results.success.push(userKey);
        } else {
          results.failed.push({ userKey, error: `API ${result.statusCode}` });
        }
      } else if (action === 'whitelist_add') {
        store.addToWhitelist(userKey, body.note || null);
        store.recordAudit(APP_USERNAME, clientIp, 'bulk_whitelist_add', userKey, { note: body.note || null });
        results.success.push(userKey);
      } else if (action === 'whitelist_remove') {
        store.removeFromWhitelist(userKey);
        store.recordAudit(APP_USERNAME, clientIp, 'bulk_whitelist_remove', userKey, null);
        results.success.push(userKey);
      }
    } catch (e) {
      results.failed.push({ userKey, error: e.message });
    }
  }

  invalidateStateCache();
  console.log(`[bulk] ${action}: ${results.success.length} ok, ${results.failed.length} failed`);
  sendJson(res, 200, { ok: true, action, ...results });
}

// ─── HWID Devices ───────────────────────────────────────────────
async function handleHwidDevices(req, res, parsedUrl) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const uuid = parsedUrl.searchParams.get('uuid') || '';
  if (!uuid) { sendJson(res, 400, { error: 'uuid is required' }); return; }
  try {
    const resp = await remnawaveApi('GET', `/api/hwid/devices/${uuid}`);
    sendJson(res, 200, resp.json?.response || {});
  } catch (e) {
    console.error('[hwid-devices] error:', e.message);
    sendJson(res, 500, { error: e.message });
  }
}

// ─── Delete HWID Device(s) ──────────────────────────────────────
async function handleHwidDeviceDelete(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userUuid = String(body.userUuid || '');
  if (!userUuid) { sendJson(res, 400, { error: 'userUuid is required' }); return; }
  try {
    if (body.deleteAll) {
      // Delete all devices for user
      const resp = await remnawaveApi('POST', '/api/hwid/devices/delete-all', { userUuid });
      console.log(`[hwid] deleted ALL devices for ${userUuid}`);
      sendJson(res, 200, { ok: true, deleted: 'all' });
    } else {
      const hwid = String(body.hwid || '');
      if (!hwid) { sendJson(res, 400, { error: 'hwid is required' }); return; }
      const resp = await remnawaveApi('POST', '/api/hwid/devices/delete', { userUuid, hwid });
      console.log(`[hwid] deleted device ${hwid} for ${userUuid}`);
      sendJson(res, 200, { ok: true, deleted: hwid });
    }
  } catch (e) {
    console.error('[hwid-delete] error:', e.message);
    sendJson(res, 500, { error: e.message });
  }
}

// ─── User Bandwidth ─────────────────────────────────────────────
async function handleUserBandwidth(req, res, parsedUrl) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const uuid = parsedUrl.searchParams.get('uuid') || '';
  if (!uuid) { sendJson(res, 400, { error: 'uuid is required' }); return; }
  const days = Math.min(30, Math.max(1, parseInt(parsedUrl.searchParams.get('days') || '7', 10)));
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  try {
    const resp = await remnawaveApi('GET', `/api/bandwidth-stats/users/${uuid}?start=${startStr}&end=${endStr}`);
    sendJson(res, 200, resp.json?.response || {});
  } catch (e) {
    console.error('[user-bandwidth] error:', e.message);
    sendJson(res, 500, { error: e.message });
  }
}

// ─── Fetch User IPs (IP Control) ───────────────────────────────
async function handleFetchUserIps(req, res, parsedUrl) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const uuid = parsedUrl.searchParams.get('uuid') || '';
  if (!uuid) { sendJson(res, 400, { error: 'uuid is required' }); return; }
  try {
    // Step 1: Submit job
    const jobResp = await remnawaveApi('POST', `/api/ip-control/fetch-ips/${uuid}`, {});
    const jobId = jobResp.json?.response?.jobId;
    if (!jobId) { sendJson(res, 500, { error: 'No jobId returned' }); return; }

    // Step 2: Poll for result (max 15s)
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
      const result = await remnawaveApi('GET', `/api/ip-control/fetch-ips/result/${jobId}`);
      const data = result.json?.response;
      if (data?.isCompleted) {
        if (data.isFailed) { sendJson(res, 500, { error: 'Job failed' }); return; }
        sendJson(res, 200, data.result || {});
        return;
      }
    }
    sendJson(res, 504, { error: 'IP fetch timeout' });
  } catch (e) {
    console.error('[fetch-user-ips] error:', e.message);
    sendJson(res, 500, { error: e.message });
  }
}


async function handleNotifyUser(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    sendJson(res, 500, { error: 'Не настроен TELEGRAM_BOT_TOKEN в .env' });
    return;
  }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKey = String(body.userKey || '');
  const message = String(body.message || '').trim();
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }
  if (!message) { sendJson(res, 400, { error: 'message is required' }); return; }

  // Находим telegram_id
  let telegramId = '';

  // 1. Пробуем из поля telegramId пользователя
  const stateData = store.getState();
  const user = stateData.users.find(u => {
    const key = String(u.userUuid || u.uuid || u.id || u.userId || u.username || '');
    return key === userKey;
  });
  if (user && user.telegramId) {
    telegramId = String(user.telegramId);
  }

  // 2. Извлекаем из username по шаблону user_{telegram_id}
  if (!telegramId && user) {
    const username = user.username || user.name || '';
    const match = username.match(/^user_(\d+)$/);
    if (match) telegramId = match[1];
  }

  // 3. Если сам userKey — числовой ID
  if (!telegramId && /^\d+$/.test(userKey)) {
    telegramId = userKey;
  }

  if (!telegramId) {
    store.saveNotification(userKey, null, message, 'error_no_tg_id');
    sendJson(res, 400, { error: 'Не удалось определить Telegram ID пользователя' });
    return;
  }

  // Отправляем через Telegram Bot API
  try {
    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = JSON.stringify({
      chat_id: telegramId,
      text: message,
      parse_mode: 'HTML',
    });

    const result = await new Promise((resolve, reject) => {
      const tgReq = https.request(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (tgRes) => {
        let data = '';
        tgRes.on('data', chunk => data += chunk);
        tgRes.on('end', () => {
          try {
            resolve({ status: tgRes.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: tgRes.statusCode, body: { raw: data } });
          }
        });
      });
      tgReq.on('error', reject);
      tgReq.write(payload);
      tgReq.end();
    });

    if (result.status >= 200 && result.status < 300 && result.body.ok) {
      store.saveNotification(userKey, telegramId, message, 'sent');
      console.log(`[notify] Уведомление отправлено: ${userKey} (tg:${telegramId})`);
      sendJson(res, 200, { ok: true, telegramId });
    } else {
      const errMsg = result.body.description || `Telegram API error: ${result.status}`;
      store.saveNotification(userKey, telegramId, message, `error: ${errMsg}`);
      console.error(`[notify] Ошибка отправки: ${userKey}`, result.body);
      sendJson(res, result.status || 500, { error: errMsg });
    }
  } catch (e) {
    store.saveNotification(userKey, telegramId, message, `error: ${e.message}`);
    console.error(`[notify] Ошибка сети: ${userKey}`, e.message);
    sendJson(res, 500, { error: `Ошибка отправки: ${e.message}` });
  }
}

async function handleUserNotifications(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userKey = url.searchParams.get('userKey') || '';
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }
  try {
    const notifications = store.getNotifications(userKey);
    sendJson(res, 200, { notifications });
  } catch (e) {
    console.error('[notifications] error:', e.message);
    sendJson(res, 500, { error: 'Failed to load notifications' });
  }
}

async function handleIncidents(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  try {
    sendJson(res, 200, {
      incidents: store.getIncidents ? store.getIncidents() : [],
      stats: store.getIncidentStats ? store.getIncidentStats() : {},
    });
  } catch (e) {
    console.error('[incidents] error:', e.message);
    sendJson(res, 500, { error: 'Failed to load incidents' });
  }
}

async function handleIncident(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST, PATCH' });
    return;
  }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKey = String(body.userKey || '');
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }

  try {
    const incident = store.updateIncident(userKey, {
      status: body.status,
      operatorComment: body.operatorComment,
      resolutionReason: body.resolutionReason,
    });
    store.recordAudit(APP_USERNAME, getClientIp(req), 'incident_update', userKey, {
      status: body.status,
      resolutionReason: body.resolutionReason || null,
    });
    sendJson(res, 200, { ok: true, incident });
  } catch (e) {
    console.error('[incident] update error:', e.message);
    sendJson(res, 400, { error: e.message || 'Failed to update incident' });
  }
}

async function handleExport(req, res, parsedUrl) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  const type = parsedUrl.searchParams.get('type') || 'suspects';
  const format = parsedUrl.searchParams.get('format') || 'json';
  const validTypes = ['suspects', 'incidents', 'users', 'audit'];
  if (!validTypes.includes(type)) {
    sendJson(res, 400, { error: `Invalid type. Use: ${validTypes.join(', ')}` });
    return;
  }

  try {
    const data = store.getExportData(type);
    store.recordAudit(APP_USERNAME, getClientIp(req), 'export', null, { type, format, count: data.length });

    if (format === 'csv') {
      const csv = arrayToCsv(data);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="remnawave-${type}-${new Date().toISOString().slice(0,10)}.csv"`,
      });
      res.end(csv);
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="remnawave-${type}-${new Date().toISOString().slice(0,10)}.json"`,
      });
      res.end(JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error('[export] error:', e.message);
    sendJson(res, 500, { error: 'Export failed: ' + e.message });
  }
}

function arrayToCsv(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  // Collect all keys from all objects
  const keysSet = new Set();
  for (const obj of arr) {
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) keysSet.add(k);
    }
  }
  const keys = [...keysSet];
  // Filter out complex objects/arrays, stringify them
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val).replace(/"/g, '""');
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.map(k => escape(k)).join(',');
  const rows = arr.map(obj => {
    if (!obj || typeof obj !== 'object') return keys.map(() => '').join(',');
    return keys.map(k => escape(obj[k])).join(',');
  });
  return header + '\n' + rows.join('\n');
}

async function handleAuditLog(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  try {
    const logs = store.getAuditLog(500);
    sendJson(res, 200, { logs });
  } catch (e) {
    console.error('[audit-log] error:', e.message);
    sendJson(res, 500, { error: 'Failed to load audit log' });
  }
}

async function handleResolveHosts(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const hosts = Array.isArray(body.hosts) ? body.hosts.slice(0, 100) : [];
  const results = {};

  await Promise.allSettled(hosts.map(async (rawHost) => {
    const host = String(rawHost || '').trim();
    if (!host) return;
    try {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        results[host] = [host];
      } else {
        results[host] = await dns.resolve4(host);
      }
    } catch {
      results[host] = [];
    }
  }));

  sendJson(res, 200, { results });
}

async function handleProxy(req, res, parsedUrl) {
  if (!requireAuth(req, res)) return;

  if (parsedUrl.searchParams.has('target')) {
    sendJson(res, 400, { error: 'The target parameter is disabled. Configure REMNAWAVE_BASE_URL on the server.' });
    return;
  }

  if (!isRemnawaveConfigured()) {
    sendJson(res, 500, { error: 'Remnawave API is not configured on the server.' });
    return;
  }

  let baseUrl;
  try {
    baseUrl = new URL(REMNAWAVE_BASE_URL);
  } catch {
    sendJson(res, 500, { error: 'REMNAWAVE_BASE_URL is invalid.' });
    return;
  }

  if (baseUrl.protocol !== 'https:') {
    sendJson(res, 500, { error: 'REMNAWAVE_BASE_URL must use HTTPS.' });
    return;
  }

  const method = (parsedUrl.searchParams.get('method') || req.method || 'GET').toUpperCase();
  if (!ALLOWED_PROXY_METHODS.has(method)) {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: Array.from(ALLOWED_PROXY_METHODS).join(', ') });
    return;
  }

  const apiPath = parsedUrl.searchParams.get('path') || '';
  if (!apiPath.startsWith('/api/') && apiPath !== '/api') {
    sendJson(res, 403, { error: 'Only /api paths are allowed.' });
    return;
  }

  const targetUrl = new URL(apiPath, baseUrl);
  const headers = {
    Authorization: `Bearer ${REMNAWAVE_API_TOKEN}`,
    'Content-Type': req.headers['content-type'] || 'application/json',
    Accept: req.headers.accept || 'application/json',
    'User-Agent': 'RemnawaveMonitor/1.0',
    'X-Forwarded-For': '127.0.0.1',
    'X-Forwarded-Proto': 'https',
  };

  if (req.headers['content-length'] && method !== 'GET') {
    headers['Content-Length'] = req.headers['content-length'];
  }

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    method,
    headers,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const responseHeaders = {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
    };
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('[proxy] request failed:', e.message);
    if (!res.headersSent) {
      sendJson(res, 502, { error: e.message });
    } else {
      res.end();
    }
  });

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' });
    return;
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    sendJson(res, 400, { error: 'Invalid path' });
    return;
  }

  if (requestedPath.includes('\0')) {
    sendJson(res, 400, { error: 'Invalid path' });
    return;
  }

  const relativePath = requestedPath.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  const root = path.resolve(PUBLIC_DIR);

  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  const publicName = path.relative(root, filePath).replace(/\\/g, '/');
  if (!PUBLIC_FILES.has(publicName)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        sendJson(res, 500, { error: 'Failed to read file' });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
  });
}

function requireAuth(req, res) {
  if (getSession(req)) return true;
  sendJson(res, 401, { error: 'Unauthorized' });
  return false;
}

function getSession(req) {
  cleanupSessions();
  const cookies = parseCookies(req.headers.cookie || '');
  const value = cookies[COOKIE_NAME];
  if (!value) return null;

  const [sessionId, signature] = value.split('.');
  if (!sessionId || !signature) return null;

  const expected = sign(sessionId);
  if (!safeEqual(signature, expected)) return null;

  const data = sessions.get(sessionId);
  if (!data || data.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return { id: sessionId, data };
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, data] of sessions.entries()) {
    if (data.expiresAt <= now) sessions.delete(id);
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function buildSessionCookie(req, sessionId) {
  const value = `${sessionId}.${sign(sessionId)}`;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function isSecureRequest(req) {
  return req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET || 'missing-secret').update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body || '{}'));
    req.on('error', reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Remnawave Monitor started');
  console.log(`  Local URL: http://${HOST}:${PORT}`);
  console.log(`  Health check: http://${HOST}:${PORT}/health`);
  console.log('');

  if (!isAuthConfigured()) {
    console.warn('  Warning: APP_USERNAME, APP_PASSWORD or SESSION_SECRET is not configured.');
  }
  if (!isRemnawaveConfigured()) {
    console.warn('  Warning: REMNAWAVE_BASE_URL or REMNAWAVE_API_TOKEN is not configured.');
  } else {
    dataSync.start();
    dataSync.onSync(() => {
      invalidateStateCache();
      broadcastSSE('sync_complete', { ts: Date.now(), stateVersion });
    });
    console.log(`  SQLite cache: ${store.dbPath}`);
    console.log(`  Sync interval: ${SYNC_INTERVAL_SECONDS}s`);
  }

  // Auto-backup: daily at 03:00
  function scheduleBackup() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;
    setTimeout(() => {
      store.createBackup();
      setInterval(() => store.createBackup(), 24 * 60 * 60 * 1000);
    }, delay);
    console.log(`  Auto-backup: next at ${next.toISOString().slice(0, 16)}`);
  }
  scheduleBackup();
});

// ─── Graceful Shutdown ────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

  // Close SSE connections
  for (const client of sseClients) {
    try { client.res.end(); } catch { /* ignore */ }
  }
  sseClients.clear();

  // Stop accepting new connections
  server.close(() => {
    console.log('[shutdown] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Rule Engine Handlers ────────────────────────────────────────

async function handleRules(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const rules = store.ruleEngine.getAllRules();
      const unack = store.ruleEngine.getUnacknowledgedCount();
      sendJson(res, 200, { rules, unacknowledgedCount: unack });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
    try {
      const rule = store.ruleEngine.createRule(body);
      sendJson(res, 201, { ok: true, rule });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleRule(req, res) {
  if (!requireAuth(req, res)) return;

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const ruleId = String(body.id || body.ruleId || '');
  if (!ruleId) { sendJson(res, 400, { error: 'ruleId is required' }); return; }

  if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'POST') {
    try {
      const rule = store.ruleEngine.updateRule(ruleId, body);
      sendJson(res, 200, { ok: true, rule });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      store.ruleEngine.deleteRule(ruleId);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleRuleTest(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const ruleId = String(body.ruleId || '');
  if (!ruleId) { sendJson(res, 400, { error: 'ruleId is required' }); return; }

  try {
    const stateData = store.getState();
    const result = store.ruleEngine.testRule(ruleId, stateData);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleRuleTriggers(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

  try {
    const triggers = store.ruleEngine.getRecentTriggers(100);
    sendJson(res, 200, { triggers });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleRuleAcknowledge(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const triggerId = Number(body.triggerId || 0);
  if (!triggerId) { sendJson(res, 400, { error: 'triggerId is required' }); return; }

  try {
    store.ruleEngine.acknowledgeTrigger(triggerId);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 400, { error: e.message });
  }
}

// ─── AI Settings / Analysis Handlers ─────────────────────────────

async function handleAiSettings(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    sendJson(res, 200, {
      settings: aiService.getPublicSettings(),
      providers: aiService.getProviderList(),
    });
    return;
  }

  if (req.method === 'POST') {
    if (!requireActionRateLimit(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
    try {
      const settings = aiService.saveSettings(body || {});
      store.recordAudit(APP_USERNAME, getClientIp(req), 'ai_settings_update', null, {
        enabled: settings.enabled,
        provider: settings.provider,
        model: settings.model,
        apiKeySet: settings.apiKeySet,
      });
      sendJson(res, 200, { ok: true, settings });
    } catch (e) {
      sendJson(res, 400, { error: e.message || 'Failed to save AI settings' });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
}

async function handleAiTest(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' }); return; }

  try {
    const result = await aiService.testConnection();
    store.recordAudit(APP_USERNAME, getClientIp(req), 'ai_test', null, {
      provider: result.provider,
      model: result.model,
    });
    sendJson(res, 200, result);
  } catch (e) {
    console.error('[ai] test error:', e.message);
    sendJson(res, 400, { error: e.message || 'AI test failed' });
  }
}

async function handleAiAnalyzeUser(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' }); return; }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
  const userKey = String(body.userKey || '');
  if (!userKey) { sendJson(res, 400, { error: 'userKey is required' }); return; }

  try {
    const result = await aiService.analyzeUser(store.getState(), userKey);
    store.recordAudit(APP_USERNAME, getClientIp(req), 'ai_analyze_user', result.userKey, {
      provider: result.provider,
      model: result.model,
      riskLevel: result.analysis && result.analysis.riskLevel,
      riskScore: result.analysis && result.analysis.riskScore,
    });
    sendJson(res, 200, result);
  } catch (e) {
    console.error('[ai] analyze user error:', e.message);
    sendJson(res, 400, { error: e.message || 'AI analysis failed' });
  }
}

async function handleAiAnalyzeSuspects(req, res) {
  if (!requireAuth(req, res)) return;
  if (!requireActionRateLimit(req, res)) return;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' }); return; }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
  const limit = Math.min(20, Math.max(1, Number(body.limit || 8)));

  try {
    const result = await aiService.analyzeSuspects(store.getState(), limit);
    store.recordAudit(APP_USERNAME, getClientIp(req), 'ai_analyze_suspects', null, {
      provider: result.provider,
      model: result.model,
      analyzedUsers: result.analyzedUsers,
      riskLevel: result.analysis && result.analysis.riskLevel,
      riskScore: result.analysis && result.analysis.riskScore,
    });
    sendJson(res, 200, result);
  } catch (e) {
    console.error('[ai] analyze suspects error:', e.message);
    sendJson(res, 400, { error: e.message || 'AI analysis failed' });
  }
}

// ─── SSE (Server-Sent Events) ────────────────────────────────────
const sseClients = new Set();

function handleSSE(req, res) {
  if (!requireAuth(req, res)) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n'); // comment to keep alive

  const client = { res };
  sseClients.add(client);
  console.log(`[sse] client connected (${sseClients.size} total)`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* ignore */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
    console.log(`[sse] client disconnected (${sseClients.size} total)`);
  });
}

function broadcastSSE(event, data) {
  if (sseClients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { sseClients.delete(client); }
  }
}
