// ─── State ───────────────────────────────────────────────────────
const DEBUG = new URLSearchParams(window.location.search).has('debug') || localStorage.getItem('rwm_debug') === '1';
const debugLog = (...args) => { if (DEBUG) console.log(...args); };

// ─── SVG Icon Library (replaces emoji) ─────────────────────────────
const IC = {
  // Risk level dots (colored via CSS)
  dot: (color) => `<span class="ic-dot" style="background:${color}"></span>`,
  // Lucide-style icons (18x18, stroke-based)
  _s: (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`,
  // Signal icons
  hwid: null, churn: null, clock247: null, globe: null, plane: null, zap: null,
  link: null, server: null, building: null, chart: null, ban: null,
  warn: null, check: null, clipboard: null, shield: null, edit: null,
  trash: null, test: null, bolt: null, timer: null, phone: null,
  plug: null, wifi: null, search: null, refresh: null,
};
// Deferred init to keep const short
(function() {
  const s = IC._s;
  IC.hwid =     s('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>');
  IC.churn =    s('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>');
  IC.clock247 = s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
  IC.globe =    s('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>');
  IC.plane =    s('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-2 2 4-1 4-1 2 2v3l2-2-1-4 3-2 4.2 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.5-.6.4-1.1z"/>');
  IC.zap =      s('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');
  IC.link =     s('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>');
  IC.server =   s('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>');
  IC.building = s('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>');
  IC.chart =    s('<path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>');
  IC.ban =      s('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>');
  IC.warn =     s('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
  IC.check =    s('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>');
  IC.clipboard= s('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>');
  IC.shield =   s('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>');
  IC.edit =     s('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');
  IC.trash =    s('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>');
  IC.test =     s('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/>');
  IC.bolt =     s('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');
  IC.timer =    s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
  IC.phone =    s('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>');
  IC.plug =     s('<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/>');
  IC.wifi =     s('<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>');
  IC.search =   s('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');
  IC.refresh =  s('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>');
  IC.note =     s('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>');
  IC.traffic =  s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
  IC.bell =     s('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>');
  IC.activity = s('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>');
  IC.map =      s('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>');
  IC.users =    s('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
  IC.unban =    s('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>');
  IC.send =     s('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>');
})();

// ─── Theme ────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('rwm_theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  if (isLight) {
    html.removeAttribute('data-theme');
    localStorage.setItem('rwm_theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'light');
    localStorage.setItem('rwm_theme', 'light');
  }
  updateThemeButton();
}

function updateThemeButton() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const label = document.getElementById('theme-label');
  const icon = document.getElementById('theme-icon');
  if (label) label.textContent = isLight ? 'Тёмная тема' : 'Светлая тема';
  if (icon) icon.innerHTML = isLight
    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
}
document.addEventListener('DOMContentLoaded', updateThemeButton);

// ─── Mobile Sidebar ──────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeSidebarIfMobile() {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

let cfg = { interval: 30 };
let state = {
  users: [],
  hwidTop: [],
  hwidDevices: {},
  activeIps: {},       // userKey -> string[] (текущий снапшот)
  activeIpWindows: {}, // live/5/15/30 -> userKey -> ip objects
  onlineWindow: 'live',
  ipHistory: [],       // [{ts, ips: {userKey -> Set<string>}}] — окно стабильности IP
  ipStats: {},         // userKey -> агрегаты IP/ASN/стран за 24 часа
  hwidChurn: {},       // userKey -> количество уникальных HWID за 30 дней
  trafficMedian: 0,    // медианный трафик всех пользователей
  suspectStreak: {},   // userKey -> {hits, total} — сколько раз замечен
  sessionFilter: 'all',
  sessionSort: 'ip-desc',
  searchQuery: '',
  incidentFilter: 'open',
  refreshTimer: null,
  countdown: 0,
  countdownTimer: null,
  loading: false,
  sync: null
};

// ─── Диагностика API ──────────────────────────────────────────────
async function runDiag() {
  const out = document.getElementById('diag-output');
  if (!out) return;
  out.classList.remove('hidden');
  out.textContent = 'Запрашиваю API...\n';

  const endpoints = [
    '/api/users?start=0&size=2',
    '/api/hwid/devices/top-users?limit=3',
  ];

  for (const ep of endpoints) {
    out.textContent += `\n── GET ${ep}\n`;
    try {
      const res = await apiGet(ep);
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      out.textContent += JSON.stringify(parsed, null, 2).slice(0, 800) + '\n';
    } catch(e) {
      out.textContent += `ОШИБКА: ${e.message}\n`;
    }
  }
  out.textContent += '\n── Диагностика завершена ──';
}

// Показать все поля одного пользователя (для отладки)
async function runDiagFull() {
  const out   = document.getElementById('diag-output');
  if (!out) return;
  out.classList.remove('hidden');
  out.textContent = 'Получаю поля пользователя...\n';

  try {
    // 1. Один пользователь — смотрим ВСЕ поля
    const r1 = await apiGet('/api/users?start=0&size=1');
    const d1 = await r1.json();
    const users = extractArray(d1, ['users']);
    if (users[0]) {
      out.textContent += '\n── ПОЛЯ ПОЛЬЗОВАТЕЛЯ:\n';
      out.textContent += Object.entries(users[0])
        .map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join('\n');
    }

    // 2. HWID top — смотрим поля
    const r2 = await apiGet('/api/hwid/devices/top-users?limit=2');
    const d2 = await r2.json();
    const top = extractArray(d2, ['users','topUsers']);
    if (top[0]) {
      out.textContent += '\n\n── ПОЛЯ HWID TOP USER:\n';
      out.textContent += Object.entries(top[0])
        .map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join('\n');

      // 3. Устройства конкретного пользователя
      const uuid = top[0].userUuid || top[0].uuid || top[0].id;
      if (uuid) {
        const r3 = await apiGet(`/api/hwid/devices/${uuid}`);
        const d3 = await r3.json();
        const devs = extractArray(d3, ['devices']);
        out.textContent += `\n\n── HWID УСТРОЙСТВА (${devs.length} шт.):\n`;
        if (devs[0]) {
          out.textContent += Object.entries(devs[0])
            .map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`)
            .join('\n');
        }
      }
    }
  } catch(e) {
    out.textContent += '\nОШИБКА: ' + e.message;
  }
  out.textContent += '\n\n── Готово ──';
}

// ─── Init ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() {
  // Удаляем старый локальный конфиг, где раньше могли храниться URL и API token.
  localStorage.removeItem('rwm_config');
  sessionStorage.removeItem('rwm_config');

  try {
    const session = await getSession();
    if (session.authenticated) {
      applySession(session);
      showApp();
      connectSSE();
      loadAll();
    } else {
      showSetup(session);
    }
  } catch (e) {
    console.warn('[auth] session check failed:', e.message);
    showSetup();
  }
}

function showSetup(session = null) {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  clearTimers();
  const err = document.getElementById('setup-error');
  if (err) {
    err.textContent = session && session.authConfigured === false
      ? 'На сервере не настроены APP_USERNAME, APP_PASSWORD или SESSION_SECRET.'
      : '';
    err.classList.toggle('hidden', !err.textContent);
  }
  setTimeout(() => document.getElementById('login-username')?.focus(), 0);
}

function showApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

// ─── Connection / Setup ──────────────────────────────────────────
async function connect() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('setup-error');
  errEl.classList.add('hidden');

  if (!username || !password) { showSetupError('Введи логин и пароль'); return; }

  setBtnLoading(true);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applySession(data);
    document.getElementById('login-password').value = '';
    showApp();
    connectSSE();
    loadAll();
  } catch (e) {
    showSetupError(`Не удалось войти: ${e.message}`);
  } finally {
    setBtnLoading(false);
  }
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (e) {
    console.warn('[auth] logout failed:', e.message);
  }
  clearTimers();
  disconnectSSE();
  resetData();
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showSetup();
}

function setBtnLoading(on) {
  document.getElementById('connect-text').textContent = on ? 'Вход...' : 'Войти';
  document.getElementById('connect-spinner').classList.toggle('hidden', !on);
  document.getElementById('connect-btn').disabled = on;
}

function showSetupError(msg) {
  const el = document.getElementById('setup-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function toggleTokenVis() {
  const inp = document.getElementById('login-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── API ──────────────────────────────────────────────────────────
async function getSession() {
  const res = await fetch('/api/session', { credentials: 'same-origin' });
  return readJsonSafe(res);
}

function applySession(session) {
  cfg.interval = Number(session.refreshInterval || cfg.interval || 30);
  const countdown = document.getElementById('refresh-countdown');
  if (countdown) countdown.textContent = `обновление через ${cfg.interval}с`;
}

async function apiGet(path) {
  const proxyUrl = `/proxy?path=${encodeURIComponent(path)}`;
  return fetch(proxyUrl, { credentials: 'same-origin' });
}

async function apiPost(path, body = {}) {
  const proxyUrl = `/proxy?path=${encodeURIComponent(path)}&method=POST`;
  return fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  });
}

async function api(path) {
  const res = await apiGet(path);
  if (res.status === 401) {
    await handleAuthExpired();
    throw new Error('Сессия истекла, войди снова');
  }
  if (!res.ok) {
    const data = await readJsonSafe(res);
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const json = await res.json();
  debugLog(`[API] ${path}`, json);
  return json;
}

async function readJsonSafe(res) {
  try { return await res.json(); }
  catch { return {}; }
}

async function handleAuthExpired() {
  clearTimers();
  resetData();
  showSetup();
}

function resetData() {
  state.users = [];
  state.hwidTop = [];
  state.hwidDevices = {};
  state.activeIps = {};
  state.activeIpWindows = {};
  state.ipHistory = [];
  state.ipStats = {};
  state.suspectStreak = {};
  state.hwidChurn = {};
  state.trafficMedian = 0;
  state.sync = null;
  state.loading = false;
}

// Универсальный экстрактор массива из любого формата ответа Remnawave
function extractArray(data, hints = []) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  // Пробуем известные поля
  const fields = [...hints, 'response', 'data', 'items', 'users', 'devices', 'result'];
  for (const f of fields) {
    if (data[f] && Array.isArray(data[f])) return data[f];
    // response.users, response.items и т.д.
    if (data.response && data.response[f] && Array.isArray(data.response[f])) return data.response[f];
  }
  // Если response — объект с total и массивом внутри
  if (data.response && typeof data.response === 'object') {
    const vals = Object.values(data.response).find(v => Array.isArray(v));
    if (vals) return vals;
  }
  return [];
}

// Извлечь total из ответа (null если не найдено)
function extractTotal(data, fallback = null) {
  if (!data) return fallback;
  // Прямые поля
  const direct = data.total ?? data.count ?? data.totalCount ?? data.totalItems ?? null;
  if (direct !== null) return Number(direct);
  // Внутри response
  const r = data.response;
  if (r) {
    const inResp = r.total ?? r.count ?? r.totalCount ?? r.totalItems ?? null;
    if (inResp !== null) return Number(inResp);
    // В meta или pagination внутри response
    const meta = r.meta || r.pagination || r.paginator;
    if (meta) {
      const inMeta = meta.total ?? meta.count ?? meta.totalCount ?? meta.totalItems ?? null;
      if (inMeta !== null) return Number(inMeta);
    }
  }
  // В meta или pagination на верхнем уровне
  const meta = data.meta || data.pagination || data.paginator;
  if (meta) {
    const inMeta = meta.total ?? meta.count ?? meta.totalCount ?? meta.totalItems ?? null;
    if (inMeta !== null) return Number(inMeta);
  }
  return fallback;
}

// ─── Load All Data ────────────────────────────────────────────────
async function loadAll() {
  if (state.loading) return;
  state.loading = true;
  clearTimers();
  setStatus('loading');

  try {
    const snapshot = await fetchCachedState();
    applyCachedState(snapshot);
    setStatus(state.sync && state.sync.isSyncing ? 'loading' : (state.sync && state.sync.status === 'error' ? 'error' : 'ok'));
    renderAll();
    scheduleRefresh();
    updateLastUpdate(state.sync?.lastFinishedAt);

    if (state.sync && state.sync.isSyncing && state.users.length === 0) {
      setTimeout(() => loadAll(), 3000);
    }
  } catch (e) {
    console.error('[loadAll] error:', e);
    setStatus('error');
    toast('Ошибка загрузки данных: ' + e.message, 'error');
    scheduleRefresh();
  } finally {
    state.loading = false;
  }
}

async function fetchCachedState() {
  const res = await fetch('/api/state', { credentials: 'same-origin' });
  if (res.status === 401) {
    await handleAuthExpired();
    throw new Error('Сессия истекла, войди снова');
  }
  const data = await readJsonSafe(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function applyCachedState(snapshot) {
  state.users = Array.isArray(snapshot.users) ? snapshot.users : [];
  state.hwidTop = Array.isArray(snapshot.hwidTop) ? snapshot.hwidTop : [];
  state.hwidDevices = snapshot.hwidDevices || {};
  state.activeIps = snapshot.activeIps || {};
  state.activeIpWindows = snapshot.activeIpWindows || { live: state.activeIps };
  state.activeIpWindows.live = state.activeIps;
  state.ipStats = snapshot.ipStats || {};
  state.hwidChurn = snapshot.hwidChurn || {};
  state.trafficMedian = Number(snapshot.trafficMedian || 0);
  state.detection = snapshot.detection || null;
  state.sync = snapshot.sync || null;
  state.data = {
    whitelist: Array.isArray(snapshot.whitelist) ? snapshot.whitelist : [],
    userNotes: snapshot.userNotes || {},
    bannedUsers: snapshot.bannedUsers || {},
    activityHistory: Array.isArray(snapshot.activityHistory) ? snapshot.activityHistory : [],
    periodComparison: snapshot.periodComparison || null,
    incidents: Array.isArray(snapshot.incidents) ? snapshot.incidents : [],
    incidentStats: snapshot.incidentStats || {},
    relations: snapshot.relations || null,
    nodeMap: snapshot.nodeMap || {},
  };
  state.ipHistory = (Array.isArray(snapshot.ipHistory) ? snapshot.ipHistory : []).map((snap) => {
    const ips = {};
    for (const [key, values] of Object.entries(snap.ips || {})) {
      ips[key] = new Set(Array.isArray(values) ? values : []);
    }
    return { ts: snap.ts, ips };
  });
}


// ─── Active IPs (IP-Control) ──────────────────────────────────────
// Формат ответа Remnawave:
// POST job → {response: {jobId: 149}}
// GET result → {response: {isCompleted: true, isFailed: false, result: {
//   success: true, nodeUuid: "...",
//   users: [{userId: "102", ips: [{ip: "85.26.189.206", lastSeen: "..."}]}]
// }}}
async function fetchActiveIps() {
  state.activeIps = {};

  const nodesRaw = await api('/api/nodes');
  const nodes = extractArray(nodesRaw, ['nodes']);
  debugLog('[IP-control] нод:', nodes.length);
  if (nodes.length === 0) return;

  // IP-control показывает клиентские IP (пользователей), а не IP нод.
  // Ноды не записывают сами себя в access log — фильтрация не нужна.
  // Оставляем Set на случай если нода указана числовым IP (редкий случай).
  const nodeIps = new Set(
    nodes
      .map(n => n.address || n.ip || n.host || n.ipAddress || n.addr)
      .filter(addr => addr && /^\d+\.\d+\.\d+\.\d+$/.test(addr.split(':')[0]))
      .map(addr => addr.split(':')[0])
  );

  // Строим быстрый индекс: числовой id → uuid пользователя
  const idToUuid = {};
  for (const u of state.users) {
    const numId = String(u.id || u.userId || '');
    const uuid  = u.uuid || u.id;
    if (numId && uuid) idToUuid[numId] = uuid;
  }

  for (const node of nodes) {
    const nodeUuid = node.uuid || node.id;
    if (!nodeUuid) continue;
    try {
      // Создаём job
      const r = await apiPost(`/api/ip-control/fetch-users-ips/${nodeUuid}`);
      if (r.status === 401) {
        await handleAuthExpired();
        throw new Error('Сессия истекла, войди снова');
      }
      if (!r.ok) {
        const err = await readJsonSafe(r);
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const jobData = await r.json();
      const jobId = jobData.response?.jobId ?? jobData.jobId ?? jobData.id;
      if (!jobId) { console.warn('[IP-control] нет jobId:', jobData); continue; }

      // Polling — ждём isCompleted: true
      const nodeResult = await pollJob(`/api/ip-control/fetch-users-ips/result/${jobId}`);
      if (!nodeResult) continue;

      // nodeResult = {success: true, nodeUuid: "...", users: [{userId, ips: [{ip, lastSeen}]}]}
      const usersList = Array.isArray(nodeResult.users) ? nodeResult.users : [];
      debugLog(`[IP-control] нода ${nodeUuid.slice(0,8)}: ${usersList.length} пользователей`);

      for (const u of usersList) {
        const numId = String(u.userId || u.id || '');
        // Храним объекты {ip, lastSeen}, исключая IP самих нод
        const ipObjs = (Array.isArray(u.ips) ? u.ips : [])
          .map(entry => typeof entry === 'string'
            ? { ip: entry, lastSeen: null }
            : { ip: entry?.ip, lastSeen: entry?.lastSeen || null })
          .filter(e => e.ip && !nodeIps.has(e.ip)); // ← фильтруем IP нод

        if (!numId || ipObjs.length === 0) continue;

        const key = idToUuid[numId] || numId;
        if (!state.activeIps[key]) state.activeIps[key] = {};
        // Мержим: если IP уже есть — берём свежий lastSeen
        for (const obj of ipObjs) {
          const existing = state.activeIps[key][obj.ip];
          if (!existing || new Date(obj.lastSeen) > new Date(existing.lastSeen)) {
            state.activeIps[key][obj.ip] = obj;
          }
        }
      }
    } catch (e) {
      console.error(`[IP-control] ошибка ноды ${nodeUuid}:`, e.message);
    }
  }

  // Конвертируем map → array объектов {ip, lastSeen}
  for (const k in state.activeIps) {
    state.activeIps[k] = Object.values(state.activeIps[k]);
  }
  const total = Object.keys(state.activeIps).length;
  debugLog(`[IP-control] итого: ${total} пользователей онлайн`);

  // Сохраняем снапшот в историю
  saveSnapshot(state.activeIps);
}

// ─── IP History ──────────────────────────────────────────────────
const HISTORY_WINDOW_MS = 15 * 60 * 1000;
const MIN_SNAPSHOT_HITS = 3;
const FRESH_IP_WINDOW_MS = 10 * 60 * 1000;
const IP_CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;
const IP_GRACE_EXTRA_COUNT = 1;

function saveSnapshot(activeIps) {
  const ts = Date.now();
  const snap = { ts, ips: {} };
  for (const [key, ipObjs] of Object.entries(activeIps)) {
    // В снапшоте храним только строки IP (для подсчёта стабильности)
    snap.ips[key] = new Set(ipObjs.map(o => typeof o === 'string' ? o : o.ip));
  }
  state.ipHistory.push(snap);
  state.ipHistory = state.ipHistory.filter(s => ts - s.ts < HISTORY_WINDOW_MS);
  debugLog(`[History] снапшотов в окне: ${state.ipHistory.length}`);
}

// Возвращает только "стабильные" IP — те что присутствуют в большинстве снапшотов
// Это фильтрует случайные IP от смены сети
function getStableIps(userKey) {
  const snaps = state.ipHistory;
  if (snaps.length === 0) {
    // Нет истории — не называем IP стабильными заранее.
    return [];
  }

  // Считаем сколько раз каждый IP встречался в снапшотах
  const ipCounts = {};
  for (const snap of snaps) {
    const ips = snap.ips[userKey];
    if (!ips) continue;
    for (const ip of ips) {
      ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    }
  }

  // IP считается стабильным только если он повторялся заметную часть окна.
  const threshold = Math.max(MIN_SNAPSHOT_HITS, Math.ceil(snaps.length * 0.6));
  const stable = Object.entries(ipCounts)
    .filter(([, count]) => count >= threshold)
    .map(([ip]) => ip);

  debugLog(`[StableIPs] ${userKey}: всего IP=${Object.keys(ipCounts).length}, стабильных=${stable.length} (порог: ${threshold}/${snaps.length} снапшотов)`);
  return stable;
}

function getFreshStableIpDetails(u) {
  return getIpDetails(u).filter(d => d.stable && d.fresh);
}

function getHardIpThreshold(hwidLimit) {
  return getIpThreshold(hwidLimit) + IP_GRACE_EXTRA_COUNT;
}

function getIpSignal(u) {
  const hwidLimit = getUserHwidLimit(u);
  const softThreshold = getIpThreshold(hwidLimit);
  const hardThreshold = getHardIpThreshold(hwidLimit);
  const freshStableIps = getFreshStableIpDetails(u);
  const evidence = getIpExcessEvidence(u, hardThreshold);
  const overSoft = freshStableIps.length > softThreshold;
  const overHard = freshStableIps.length > hardThreshold;

  return {
    count: freshStableIps.length,
    softThreshold,
    hardThreshold,
    overSoft,
    overHard,
    confirmed: overHard && evidence.durationMs >= IP_CONFIRMATION_WINDOW_MS,
    durationMs: evidence.durationMs,
    snapshots: evidence.snapshots,
  };
}

function getIpExcessEvidence(u, threshold) {
  const key = getActiveIpKey(u);
  if (!key) return { durationMs: 0, snapshots: 0 };

  const snaps = state.ipHistory
    .filter(snap => snap.ips && snap.ips[key] && snap.ips[key].size > threshold)
    .sort((a, b) => a.ts - b.ts);

  if (snaps.length === 0) return { durationMs: 0, snapshots: 0 };

  let streakStart = snaps[snaps.length - 1].ts;
  let previousTs = snaps[snaps.length - 1].ts;
  const maxGapMs = Math.max(90 * 1000, Number(cfg.interval || 30) * 2500);

  for (let i = snaps.length - 2; i >= 0; i--) {
    const snap = snaps[i];
    if (previousTs - snap.ts > maxGapMs) break;
    streakStart = snap.ts;
    previousTs = snap.ts;
  }

  const durationMs = Math.max(0, Date.now() - streakStart);
  return { durationMs, snapshots: snaps.length };
}

function getIpStatsForUser(u) {
  for (const key of getUserAliases(u)) {
    if (state.ipStats[key]) return state.ipStats[key];
  }
  return {
    uniqueIps24h: 0,
    uniqueNetworks24h: 0,
    countries24h: [],
    asns24h: [],
    orgs24h: [],
    hostingIpCount: 0,
    proxyIpCount: 0,
    vpnIpCount: 0,
    recentCountryCount30m: 0,
    concurrentDiffCountryPairs: 0,
  };
}

function getHwidChurnForUser(u) {
  const keys = getUserAliases(u);
  for (const key of keys) {
    if (state.hwidChurn[key]) return state.hwidChurn[key];
  }
  return 0;
}

// Device-first: только HWID-метрики для risk scoring
// IP/ASN/страны/трафик — только для информационного отображения
function getKeyLeakRisk(u) {
  const hwidLimit = getUserHwidLimit(u);
  const hwid = hwidCountForUser(u);
  const churn30d = getHwidChurnForUser(u);
  const reasons = [];
  let score = 0;

  // ─── HWID churn (ротация устройств) ────────────────────────
  if (churn30d > hwidLimit * 3) {
    score += 30;
    reasons.push(`ротация HWID: ${churn30d} устройств за 30д при лимите ${hwidLimit}`);
  } else if (churn30d > hwidLimit * 2) {
    score += 20;
    reasons.push(`повышенная ротация HWID: ${churn30d} устройств за 30д при лимите ${hwidLimit}`);
  }

  score = Math.min(50, score);
  const level = score >= 25 ? 'warning' : 'none';
  const label = level === 'warning' ? 'внимание'
    : 'признаков нет';

  return {
    score,
    level,
    label,
    reasons,
    context: {
      hwidLimit,
      hwid,
      hwidChurn30d: churn30d,
    },
  };
}

// Обновляет счётчик streak — сколько раз подряд замечен подозрительным
function updateSuspectStreak(suspects) {
  // Увеличиваем счётчик для текущих подозрительных
  const currentKeys = new Set(suspects.map(u => u.uuid || u.id || String(u.id)));
  for (const [key, data] of Object.entries(state.suspectStreak)) {
    if (currentKeys.has(key)) {
      data.hits++;
      data.total++;
    } else {
      // Не в подозрительных в этот раз — уменьшаем hits но не total
      data.hits = Math.max(0, data.hits - 1);
      data.total++;
    }
  }
  // Добавляем новых
  for (const u of suspects) {
    const key = u.uuid || u.id || String(u.id);
    if (key && !state.suspectStreak[key]) {
      state.suspectStreak[key] = { hits: 1, total: 1 };
    }
  }
}

async function pollJob(path, timeoutMs = 15000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt++;
    try {
      const res = await api(path);
      const inner = res.response || res;

      if (inner.isCompleted === true) {
        // Успех — возвращаем result внутри (содержит users[])
        return inner.result ?? inner;
      }
      if (inner.isFailed === true) {
        console.warn('[pollJob] job завершился с ошибкой');
        return null;
      }
      // isCompleted: false — ещё обрабатывается, ждём
    } catch (e) {
      console.warn(`[pollJob] попытка ${attempt} ошибка:`, e.message);
      return null;
    }
    await new Promise(r => setTimeout(r, 600));
  }
  console.warn('[pollJob] таймаут');
  return null;
}

async function fetchAllUsers() {
  const size = 100;
  let start = 0;
  let all = [];
  while (true) {
    const path = `/api/users?start=${start}&size=${size}`;
    const res = await apiGet(path);
    if (res.status === 401) {
      await handleAuthExpired();
      throw new Error('Сессия истекла, войди снова');
    }
    if (res.status === 404 && all.length > 0) {
      debugLog(`[fetchAllUsers] ${path}: 404 после ${all.length} пользователей, останавливаю пагинацию`);
      break;
    }
    if (!res.ok) {
      const err = await readJsonSafe(res);
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (start === 0) {
      const respKeys = data?.response ? Object.keys(data.response) : Object.keys(data||{});
      debugLog('[fetchAllUsers] ключи ответа:', respKeys);
    }
    const list = extractArray(data, ['users']);
    if (list.length === 0) break;
    all = all.concat(list);

    const total = extractTotal(data, null);
    debugLog(`[fetchAllUsers] start=${start}: +${list.length} (итого ${all.length}${total ? '/' + total : ''})`);

    if (list.length < size) break;
    if (total !== null && all.length >= total) break;
    if (total !== null && start + size >= total) break;
    start += size;
    if (start > 10000) break;
  }
  debugLog(`[fetchAllUsers] итого загружено: ${all.length} пользователей`);
  // Дедупликация по uuid/id
  const seen = new Set();
  return all.filter(u => {
    const key = u.uuid || u.id || u.username;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Timers ───────────────────────────────────────────────────────
function scheduleRefresh() {
  clearTimers();
  state.countdown = cfg.interval;
  updateCountdown();
  state.countdownTimer = setInterval(() => {
    state.countdown--;
    updateCountdown();
    if (state.countdown <= 0) {
      clearTimers();
      loadAll();
    }
  }, 1000);
}

function clearTimers() {
  if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
}

function updateCountdown() {
  const el = document.getElementById('refresh-countdown');
  if (el) el.textContent = `обновление через ${state.countdown}с`;
}

async function manualRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    const res = await fetch('/api/refresh', {
      method: 'POST',
      credentials: 'same-origin'
    });
    if (res.status === 401) {
      await handleAuthExpired();
      throw new Error('Сессия истекла, войди снова');
    }
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.sync = data;
    setStatus('loading');
    toast('Обновление запущено', 'success');
    setTimeout(() => loadAll(), 1500);
  } catch (e) {
    toast('Не удалось запустить обновление: ' + e.message, 'error');
  } finally {
    setTimeout(() => btn.classList.remove('spinning'), 800);
  }
}

function updateLastUpdate(ts = Date.now()) {
  const el = document.getElementById('last-update');
  if (!el) return;
  if (!ts) {
    el.textContent = 'Ожидание синхронизации';
    return;
  }
  el.textContent = 'Снимок: ' + new Date(ts).toLocaleTimeString('ru');
}

// ─── Status ───────────────────────────────────────────────────────
function setStatus(s) {
  const dot = document.querySelector('.status-dot');
  const txt = document.getElementById('status-text');
  if (!dot) return;
  if (s === 'ok') { dot.className = 'status-dot'; txt.textContent = 'Подключено'; }
  else if (s === 'error') { dot.className = 'status-dot error'; txt.textContent = 'Ошибка'; }
  else { dot.className = 'status-dot'; txt.textContent = 'Загрузка...'; }
}

// ─── Render All ───────────────────────────────────────────────────
let _cachedSuspects = null;
function renderAll() {
  updateOnlineWindowButtons();
  _cachedSuspects = getSuspects(); // кэш на весь рендер-цикл
  renderDashboard();
  renderSessions();
  renderSuspects();
  renderIncidents();
  renderRelations();
  checkSoundAlerts();
  _cachedSuspects = null;
}

// ─── API: Ban / Whitelist / Notes ─────────────────────────────────
function toggleBan(userKey, currentlyBanned) {
  const user = findUserByAnyKey(userKey);
  const name = user ? (user.username || user.name || userKey) : userKey;

  if (currentlyBanned) {
    showConfirmDialog({
      title: 'Разбанить пользователя',
      icon: 'shield',
      message: `<div class="confirm-user-name">${esc(name)}</div>`,
      warning: 'Пользователь снова будет отслеживаться системой детекции.',
      confirmText: 'Да, разбанить',
      confirmClass: 'confirm-btn-green',
      onConfirm: () => executeBan(userKey, 'unban'),
    });
  } else {
    showConfirmDialog({
      title: 'Заблокировать пользователя',
      icon: 'ban',
      message: `<div class="confirm-user-name">${esc(name)}</div>`,
      warning: 'Подписка пользователя будет ОТКЛЮЧЕНА через Remnawave API. Пользователь потеряет доступ к VPN.',
      confirmText: 'Да, заблокировать',
      confirmClass: 'confirm-btn-yes',
      onConfirm: () => executeBan(userKey, 'ban'),
    });
  }
}

async function executeBan(userKey, action) {
  try {
    const r = await fetch('/api/ban', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userKey, action }) });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    toast(action === 'unban' ? 'Пользователь разбанен' : 'Пользователь заблокирован', 'ok');
    // Small delay to let server-side state settle before reloading
    await new Promise(r => setTimeout(r, 500));
    await loadAll();
    openUserCard(userKey);
  } catch (e) { toast(`Ошибка: ${e.message}`, 'error'); }
}

async function toggleWhitelist(userKey, currentlyWL) {
  try {
    const r = await fetch('/api/whitelist', {
      method: currentlyWL ? 'DELETE' : 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ userKey })
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    toast(currentlyWL ? 'Убран из белого списка' : 'Добавлен в белый список', 'ok');
    await loadAll();
    openUserCard(userKey);
  } catch (e) { toast(`Ошибка: ${e.message}`, 'error'); }
}

let _noteSaveTimer = null;
function saveNote(userKey, text) {
  clearTimeout(_noteSaveTimer);
  _noteSaveTimer = setTimeout(async () => {
    try {
      await fetch('/api/user-note', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userKey, note: text }) });
      if (state.data && state.data.userNotes) {
        if (text.trim()) state.data.userNotes[userKey] = { note: text.trim(), updatedAt: Date.now() };
        else delete state.data.userNotes[userKey];
      }
    } catch (e) { toast(`Ошибка заметки: ${e.message}`, 'error'); }
  }, 500);
}

// ─── Notify User (Telegram Warning) ──────────────────────────────
function buildWarningMessage(user) {
  const serverResult = getServerDetectionForUser(user);
  const hwidLimit = getUserHwidLimit(user);
  const hwidCount = hwidCountForUser(user);
  const leakRisk = getKeyLeakRisk(user);
  const ipSignal = getIpSignal(user);

  let reason = '';
  let details = '';
  let tips = [];

  // ─── 1. Серверные сигналы детекции (самый точный источник) ───
  if (serverResult && serverResult.signals && serverResult.signals.length > 0) {
    const deterministicSignals = serverResult.signals.filter(s => s.category === 'deterministic');
    const strongSignals = serverResult.signals.filter(s => s.category === 'strong');

    if (deterministicSignals.length > 0) {
      const sig = deterministicSignals[0];
      const reason_text = (sig.reason || '').toLowerCase();
      if (sig.id === 'hwid_over_limit' || reason_text.includes('hwid') && reason_text.includes('лимит')) {
        reason = `Превышен лимит подключённых устройств`;
        details = `К вашему аккаунту подключено больше устройств, чем допускается по вашему тарифному плану. Пожалуйста, удалите лишние устройства.`;
        tips = ['Откройте настройки подписки и удалите устройства, которыми не пользуетесь', 'Если вам нужно больше устройств — обновите тарифный план'];
      } else if (reason_text.includes('concurrent') || reason_text.includes('одновремен')) {
        reason = 'Зафиксированы одновременные подключения из разных стран';
        details = 'Наша система определила, что ваш аккаунт одновременно используется из нескольких географических точек. Это запрещено правилами.';
        tips = ['Не передавайте свой ключ подключения другим людям', 'Убедитесь, что никто не использует ваш аккаунт без вашего ведома'];
      } else if (reason_text.includes('impossible_travel')) {
        reason = 'Обнаружена невозможная скорость перемещения между странами';
        details = 'Ваш аккаунт подключается из разных стран с невозможной для физического перемещения скоростью. Это указывает на передачу доступа третьим лицам.';
        tips = ['Не делитесь данными подключения', 'Используйте сервис только на своих устройствах'];
      } else {
        reason = 'Обнаружено серьёзное нарушение правил использования';
        details = 'Наша система безопасности зафиксировала подтверждённое нарушение на вашем аккаунте.';
      }
    } else if (strongSignals.length > 0) {
      const sig = strongSignals[0];
      if ((sig.reason || '').includes('IP') || (sig.reason || '').includes('ASN')) {
        reason = 'Обнаружено подключение с подозрительно большого числа сетей';
        details = 'Ваш аккаунт подключается из множества разных сетей и провайдеров, что нетипично для личного использования.';
        tips = ['Проверьте, не передавали ли вы свой ключ кому-либо', 'Удалите лишние устройства из подписки'];
      } else {
        reason = 'Обнаружена подозрительная активность на вашем аккаунте';
        details = 'Наша система обнаружила сильные признаки, указывающие на возможную передачу доступа другим людям.';
      }
    } else {
      reason = 'Обнаружена необычная активность на вашем аккаунте';
      details = 'Мы заметили нетипичные паттерны использования, которые требуют вашего внимания.';
    }

  // ─── 2. Превышение HWID ───
  } else if (hwidCount > hwidLimit) {
    const excess = hwidCount - hwidLimit;
    reason = `Превышен лимит подключённых устройств`;
    details = `К вашему аккаунту подключено ${hwidCount} устройств, а по вашему тарифу допускается максимум ${hwidLimit}. Пожалуйста, удалите ${excess} лишн${excess === 1 ? 'ее устройство' : 'их устройства'}.`;
    tips = ['Откройте настройки подписки и удалите устройства, которыми не пользуетесь', 'Если вам нужно больше устройств — обновите тарифный план'];

  // ─── 3. IP-превышение ───
  } else if (ipSignal && ipSignal.overHard) {
    reason = 'Обнаружено подключение с большого числа IP-адресов одновременно';
    details = `Ваш аккаунт подключён одновременно с ${ipSignal.count} различных адресов, что превышает допустимый лимит. Это может указывать на передачу доступа.`;
    tips = ['Убедитесь, что только ваши устройства используют подписку', 'Не передавайте ключ подключения посторонним'];

  // ─── 4. Анализ утечки ключа (leakRisk) ───
  } else if (leakRisk && leakRisk.score >= 40 && leakRisk.reasons.length > 0) {
    // Выбираем причину на понятном языке
    const reasons = leakRisk.reasons;
    if (reasons.some(r => r.includes('одновременн') || r.includes('стран'))) {
      reason = 'Обнаружены подключения из нескольких стран';
      details = 'Ваш аккаунт используется из разных географических регионов, что нетипично для одного пользователя.';
    } else if (reasons.some(r => r.includes('сет') || r.includes('ASN') || r.includes('провайдер'))) {
      reason = 'Подключения с множества различных сетей';
      details = 'Ваш аккаунт подключается через необычно большое число разных интернет-провайдеров.';
    } else if (reasons.some(r => r.includes('VPS') || r.includes('proxy') || r.includes('VPN'))) {
      reason = 'Обнаружены подключения через VPS/прокси серверы';
      details = 'Ваш аккаунт используется через серверные IP-адреса, что может указывать на перепродажу или раздачу доступа.';
    } else if (reasons.some(r => r.includes('ротация') || r.includes('HWID'))) {
      reason = 'Обнаружена частая смена устройств';
      details = 'За последнее время на вашем аккаунте зафиксировано значительно больше устройств, чем допускает ваш тарифный план.';
    } else if (reasons.some(r => r.includes('трафик'))) {
      reason = 'Аномально высокий объём трафика';
      details = 'Ваш аккаунт потребляет значительно больше трафика, чем средний пользователь. Это может указывать на совместное использование.';
    } else {
      reason = 'Необычная активность на вашем аккаунте';
      details = 'Наша система мониторинга обнаружила паттерны использования, которые могут указывать на нарушение правил.';
    }
    tips = ['Проверьте список своих устройств в подписке', 'Убедитесь, что никто не пользуется вашим ключом'];

  // ─── 5. Мягкое предупреждение ───
  } else if (leakRisk && leakRisk.score >= 20) {
    reason = 'Замечена необычная активность на вашем аккаунте';
    details = 'Мы зафиксировали незначительные отклонения в использовании, которые хотим довести до вашего сведения.';
    tips = ['Убедитесь, что подписку используете только вы', 'Удалите неиспользуемые устройства'];

  // ─── 6. Фоллбэк ───
  } else {
    reason = 'Информационное уведомление';
    details = 'Это напоминание о правилах использования сервиса.';
  }

  // Формируем сообщение
  const defaultTips = [
    'Вы не передаёте данные для подключения другим людям',
    'К вашему аккаунту подключены только ваши личные устройства',
    'У вас нет лишних устройств в подписке',
  ];
  const finalTips = tips.length > 0 ? tips : defaultTips;

  return `⚠️ <b>Предупреждение</b>\n\n` +
    `Уважаемый пользователь,\n\n` +
    `${reason}.\n\n` +
    `${details}\n\n` +
    `🔹 Пожалуйста, убедитесь, что:\n` +
    finalTips.map(t => `• ${t}`).join('\n') + `\n\n` +
    `⏰ <b>Просим устранить нарушение в ближайшее время.</b>\n` +
    `Если ситуация не изменится, доступ к сервису может быть ограничен.\n\n` +
    `Если вы считаете, что произошла ошибка — напишите в поддержку.`;
}

function notifyUser(userKey) {
  const user = findUserByAnyKey(userKey);
  if (!user) { toast('Пользователь не найден', 'error'); return; }

  const name = user.username || user.name || userKey;
  const telegramId = user.telegramId || '';
  const defaultMessage = buildWarningMessage(user);

  // Проверяем наличие telegram_id
  let tgIdDisplay = telegramId;
  if (!tgIdDisplay) {
    const match = (name || '').match(/^user_(\d+)$/);
    if (match) tgIdDisplay = match[1];
  }

  document.getElementById('confirm-dialog-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'confirm-dialog-backdrop';
  backdrop.className = 'confirm-backdrop';
  backdrop.innerHTML = `
    <div class="confirm-dialog" style="width: min(560px, calc(100vw - 32px))">
      <div class="confirm-icon confirm-icon-warn">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="confirm-title">Отправить предупреждение</div>
      <div class="confirm-message">
        <div class="confirm-user-name">${esc(name)}</div>
        ${tgIdDisplay ? `<div style="font-size:12px; color:var(--text3); margin-top:6px">Telegram ID: <code style="background:var(--bg3); padding:2px 6px; border-radius:4px; font-family:'JetBrains Mono',monospace; font-size:11px">${esc(tgIdDisplay)}</code></div>` : ''}
      </div>
      <div style="margin-bottom:16px">
        <label style="display:block; font-size:12px; font-weight:600; color:var(--text2); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">Текст предупреждения</label>
        <textarea id="notify-message-text" class="notify-textarea" rows="10">${esc(defaultMessage)}</textarea>
      </div>
      ${!tgIdDisplay ? '<div class="confirm-warning">⚠️ Telegram ID не определён. Сообщение не может быть доставлено.</div>' : ''}
      <div class="confirm-buttons">
        <button class="confirm-btn confirm-btn-cancel" id="notify-cancel">Отмена</button>
        <button class="confirm-btn confirm-btn-warn" id="notify-send" ${!tgIdDisplay ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Отправить
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.querySelector('#notify-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#notify-send').onclick = () => {
    const msg = document.getElementById('notify-message-text').value.trim();
    if (!msg) { toast('Сообщение не может быть пустым', 'warning'); return; }
    close();
    executeNotify(userKey, msg);
  };
}

async function executeNotify(userKey, message) {
  try {
    const res = await fetch('/api/notify-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userKey, message }),
    });
    const data = await readJsonSafe(res);
    if (res.status === 401) { await handleAuthExpired(); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    toast(`Предупреждение отправлено (tg:${data.telegramId || '?'})`, 'ok');
  } catch (e) {
    toast(`Ошибка отправки: ${e.message}`, 'error');
  }
}

async function loadNotificationHistory(userKey) {
  const container = document.getElementById('notification-history-content');
  const btn = document.getElementById('btn-load-notifications');
  if (!container) return;

  container.innerHTML = '<div class="loading-state" style="padding:16px"><div class="spinner-large"></div></div>';
  if (btn) btn.style.display = 'none';

  try {
    const res = await fetch(`/api/user-notifications?userKey=${encodeURIComponent(userKey)}`, {
      credentials: 'same-origin',
    });
    if (res.status === 401) { await handleAuthExpired(); return; }
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const items = data.notifications || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state sm"><p>Предупреждения не отправлялись</p></div>';
      return;
    }

    container.innerHTML = items.map(n => {
      const date = new Date(n.sentAt);
      const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const isOk = n.status === 'sent';
      const statusIcon = isOk ? '✅' : '❌';
      const statusClass = isOk ? 'notif-ok' : 'notif-err';
      // Извлекаем первую строку как заголовок
      const msgPreview = (n.message || '').replace(/<[^>]*>/g, '').substring(0, 80);

      return `<div class="notif-row ${statusClass}">
        <div class="notif-time">
          <span class="notif-date">${dateStr}</span>
          <span class="notif-clock">${timeStr}</span>
        </div>
        <div class="notif-body">
          <div class="notif-preview">${statusIcon} ${esc(msgPreview)}${n.message.length > 80 ? '…' : ''}</div>
          ${n.status !== 'sent' ? `<div class="notif-status-err">${esc(n.status)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div class="empty-state sm"><p>Ошибка: ${esc(e.message)}</p></div>`;
  }
}

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

// ─── Activity Chart (SVG) ─────────────────────────────────────────
function renderActivityChart() {
  const el = document.getElementById('activity-chart');
  if (!el || !state.data || !state.data.activityHistory) return;
  const history = state.data.activityHistory;
  if (history.length < 2) {
    el.innerHTML = '<div class="chart-empty">Недостаточно данных для графика</div>';
    return;
  }

  const mode = state.chartMode || '24h';
  const cutoff = Date.now() - (mode === '7d' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
  const points = history.filter(p => p.ts >= cutoff);
  if (points.length < 2) {
    el.innerHTML = '<div class="chart-empty">Недостаточно данных</div>';
    return;
  }

  const W = el.clientWidth || 600;
  const H = 140;
  const PAD = { t: 10, r: 10, b: 24, l: 36 };
  const maxY = Math.max(1, ...points.map(p => p.online));
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const rangeTs = maxTs - minTs || 1;

  const x = (ts) => PAD.l + (ts - minTs) / rangeTs * (W - PAD.l - PAD.r);
  const y = (val) => PAD.t + (1 - val / maxY) * (H - PAD.t - PAD.b);

  // Path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ts).toFixed(1)},${y(p.online).toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${x(points[points.length - 1].ts).toFixed(1)},${H - PAD.b} L${x(points[0].ts).toFixed(1)},${H - PAD.b} Z`;

  // Y labels
  const yLabels = [0, Math.round(maxY / 2), maxY].map(v =>
    `<text x="${PAD.l - 6}" y="${y(v) + 4}" class="chart-label" text-anchor="end">${v}</text>`
  ).join('');

  // X labels (5 ticks)
  const xLabels = Array.from({ length: 5 }, (_, i) => {
    const t = minTs + rangeTs * i / 4;
    const d = new Date(t);
    const label = mode === '7d'
      ? `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
      : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<text x="${x(t)}" y="${H - 4}" class="chart-label" text-anchor="middle">${label}</text>`;
  }).join('');

  el.innerHTML = `
    <div class="chart-header">
      <span class="chart-title">Онлайн пользователей</span>
      <div class="chart-toggle">
        <button class="${mode === '24h' ? 'active' : ''}" onclick="state.chartMode='24h';renderActivityChart()">24ч</button>
        <button class="${mode === '7d' ? 'active' : ''}" onclick="state.chartMode='7d';renderActivityChart()">7д</button>
      </div>
    </div>
    <svg width="${W}" height="${H}" class="chart-svg">
      <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>
      ${yLabels}${xLabels}
      <line x1="${PAD.l}" y1="${H - PAD.b}" x2="${W - PAD.r}" y2="${H - PAD.b}" stroke="var(--border)" stroke-width="1"/>
      <path d="${areaD}" fill="url(#chartGrad)"/>
      <path d="${pathD}" fill="none" stroke="#818cf8" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
}

// ─── Delta Badges ─────────────────────────────────────────────────
function deltaHtml(current, previous) {
  if (!previous || previous === 0) return '';
  const diff = current - previous;
  const pct = Math.round(Math.abs(diff) / previous * 100);
  if (pct === 0) return '';
  const cls = diff > 0 ? 'delta-up' : 'delta-down';
  const arrow = diff > 0 ? '↑' : '↓';
  return `<span class="delta-badge ${cls}">${arrow} ${pct}%</span>`;
}

const ONLINE_WINDOW_LABELS = {
  live: 'Сейчас',
  '5': '5 мин',
  '15': '15 мин',
  '30': '30 мин',
};

function getActiveIpsSource() {
  const windows = state.activeIpWindows || {};
  if (state.onlineWindow && state.onlineWindow !== 'live' && windows[state.onlineWindow]) {
    return windows[state.onlineWindow];
  }
  return state.activeIps || {};
}

function onlineWindowLabel() {
  return ONLINE_WINDOW_LABELS[state.onlineWindow || 'live'] || 'Сейчас';
}

function setOnlineWindow(value) {
  state.onlineWindow = value || 'live';
  updateOnlineWindowButtons();
  renderAll();
}

function updateOnlineWindowButtons() {
  document.querySelectorAll('[data-online-window]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.onlineWindow === (state.onlineWindow || 'live'));
  });
  document.querySelectorAll('[data-online-window-label]').forEach((el) => {
    el.textContent = onlineWindowLabel();
  });
}

// ─── Connection Map (Leaflet) ────────────────────────────────────
let _leafletMap = null;
let _mapMarkers = null;

function renderConnectionMap() {
  const mapEl = document.getElementById('connection-map');
  const countEl = document.getElementById('map-ip-count');
  if (!mapEl) return;
  if (typeof L === 'undefined') {
    mapEl.innerHTML = '<div class="empty-state sm"><p>Leaflet не загружен</p></div>';
    return;
  }

  // Collect points
  const suspects = _cachedSuspects || getSuspects();
  const suspectKeys = new Set(suspects.flatMap(s => getUserAliases(s)));
  const points = [];
  const seen = new Set();

  for (const [userKey, ips] of Object.entries(getActiveIpsSource())) {
    for (const entry of (Array.isArray(ips) ? ips : [])) {
      const geo = entry.geo || {};
      if (geo.latitude == null || geo.longitude == null) continue;
      if (seen.has(entry.ip)) continue;
      seen.add(entry.ip);

      const isSuspect = suspectKeys.has(userKey);
      const connType = geo.connectionType || '';
      // Find user name
      const user = findUserByAnyKey(userKey);
      const userName = user ? (user.username || user.name || userKey) : userKey;

      points.push({
        ip: entry.ip,
        lat: Number(geo.latitude),
        lon: Number(geo.longitude),
        country: geo.countryCode || '',
        city: geo.city || '',
        isp: geo.isp || geo.org || '',
        isSuspect,
        connType,
        userKey,
        userName,
      });
    }
  }

  if (countEl) countEl.textContent = points.length;

  if (points.length === 0) {
    if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }
    mapEl.innerHTML = '<div class="empty-state sm"><p>Нет гео-данных для отображения</p></div>';
    return;
  }

  // Initialize or reuse map
  if (!_leafletMap) {
    mapEl.innerHTML = '';
    mapEl.style.height = '360px';
    _leafletMap = L.map(mapEl, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
    }).setView([30, 50], 3);

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(_leafletMap);

    // Custom attribution
    L.control.attribution({ prefix: false, position: 'bottomright' })
      .addAttribution('© <a href="https://carto.com" target="_blank" style="color:var(--text3)">CARTO</a>')
      .addTo(_leafletMap);
  }

  // Clear old markers
  if (_mapMarkers) {
    _mapMarkers.clearLayers();
  } else {
    _mapMarkers = L.layerGroup().addTo(_leafletMap);
  }

  // Add markers
  const bounds = [];
  for (const p of points) {
    const color = p.isSuspect ? '#ef4444' : '#6366f1';
    const glowColor = p.isSuspect ? 'rgba(239,68,68,0.35)' : 'rgba(99,102,241,0.3)';
    const size = p.isSuspect ? 10 : 8;

    const icon = L.divIcon({
      className: 'map-marker',
      html: `<div class="map-marker-dot" style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 8px ${glowColor},0 0 20px ${glowColor}"></div>`,
      iconSize: [size + 8, size + 8],
      iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    });

    const connLabel = p.connType ? `<div class="map-popup-row"><span class="map-popup-label">Тип:</span> <span class="map-popup-val">${esc(p.connType)}</span></div>` : '';
    const popupHtml = `<div class="map-popup">
      <div class="map-popup-name">${esc(p.userName)}</div>
      <div class="map-popup-row"><span class="map-popup-label">IP:</span> <code class="map-popup-ip">${esc(p.ip)}</code></div>
      <div class="map-popup-row"><span class="map-popup-label">Локация:</span> <span class="map-popup-val">${esc(p.country)} ${esc(p.city)}</span></div>
      ${p.isp ? `<div class="map-popup-row"><span class="map-popup-label">ISP:</span> <span class="map-popup-val">${esc(p.isp)}</span></div>` : ''}
      ${connLabel}
      ${p.isSuspect ? '<div class="map-popup-suspect">⚠️ Подозрительный</div>' : ''}
      <button class="map-popup-btn" onclick="openUserCard('${escAttr(p.userKey)}')">Открыть карточку →</button>
    </div>`;

    const marker = L.marker([p.lat, p.lon], { icon })
      .bindPopup(popupHtml, { className: 'map-popup-container', maxWidth: 280 });

    _mapMarkers.addLayer(marker);
    bounds.push([p.lat, p.lon]);
  }

  // Fit to bounds
  if (bounds.length > 0) {
    try {
      _leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
    } catch (e) { /* ignore */ }
  }

  // Legend
  let legendEl = mapEl.parentElement.querySelector('.map-legend');
  if (!legendEl) {
    legendEl = document.createElement('div');
    legendEl.className = 'map-legend';
    legendEl.innerHTML = `
      <span class="map-legend-item"><span class="map-legend-dot" style="background:#6366f1"></span>Нормальный</span>
      <span class="map-legend-item"><span class="map-legend-dot" style="background:#ef4444"></span>Подозрительный</span>
      <span class="map-legend-item map-legend-count"></span>
    `;
    mapEl.parentElement.appendChild(legendEl);
  }
  const countLegend = legendEl.querySelector('.map-legend-count');
  if (countLegend) countLegend.textContent = `${points.length} точек`;
}

// ─── Dashboard ────────────────────────────────────────────────────
function renderDashboard() {
  const users = state.users;
  const suspects = _cachedSuspects || getSuspects();
  const totalHwid = state.hwidTop.reduce((s, u) => s + (u.devicesCount || u.count || 0), 0);
  const activeSource = getActiveIpsSource();
  const onlineCount = Object.keys(activeSource).length;
  const comparison = state.data && state.data.periodComparison;

  setVal('total-users', users.length);
  setVal('active-sessions', onlineCount);
  setVal('total-hwid', totalHwid);
  setVal('suspects-count', suspects.length);

  // Delta badges
  if (comparison) {
    const addDelta = (id, cur, prev) => {
      const el = document.getElementById(id);
      if (!el) return;
      const existing = el.querySelector('.delta-badge');
      if (existing) existing.remove();
      const d = deltaHtml(cur, prev);
      if (d) el.insertAdjacentHTML('beforeend', d);
    };
    addDelta('stat-active-sessions', onlineCount, comparison.onlineAvgYesterday);
    addDelta('stat-suspects', suspects.length, comparison.suspectsMaxYesterday);
  }

  // Badge
  const badge = document.getElementById('suspects-badge');
  if (suspects.length > 0) {
    badge.textContent = suspects.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Country stats widget
  const countryEl = document.getElementById('country-stats');
  if (countryEl) {
    const countryCounts = {};
    for (const [, ips] of Object.entries(activeSource)) {
      for (const entry of (Array.isArray(ips) ? ips : [])) {
        const geo = entry.geo || {};
        const cc = geo.countryCode || '';
        if (cc) countryCounts[cc] = (countryCounts[cc] || 0) + 1;
      }
    }
    const sorted = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxC = sorted.length ? sorted[0][1] : 1;
    document.getElementById('country-count').textContent = sorted.length;
    if (sorted.length === 0) {
      countryEl.innerHTML = '<div class="empty-state sm"><p>Нет гео-данных</p></div>';
    } else {
      countryEl.innerHTML = sorted.map(([cc, cnt]) => {
        const pct = (cnt / maxC * 100).toFixed(0);
        return `<div class="cstat-row">
          <span class="cstat-cc">${esc(cc)}</span>
          <div class="cstat-bar-bg"><div class="cstat-bar-fill" style="width:${pct}%"></div></div>
          <span class="cstat-cnt">${cnt}</span>
        </div>`;
      }).join('');
    }
  }

  // Management widget
  const mgmtEl = document.getElementById('mgmt-stats');
  if (mgmtEl) {
    const d = state.data || {};
    const bannedCount = Object.keys(d.bannedUsers || {}).length;
    const wlCount = (d.whitelist || []).length;
    const notesCount = Object.keys(d.userNotes || {}).length;
    const openIncidents = Number(d.incidentStats && d.incidentStats.open || 0);
    const totalTraffic = state.users.reduce((s, u) => s + Number(u.usedTrafficBytes || u.usedTraffic || (u.userTraffic && u.userTraffic.usedTrafficBytes) || 0), 0);
    mgmtEl.innerHTML = `
      <div class="mgmt-row"><span class="mgmt-icon">${IC.clipboard}</span><span class="mgmt-label">Открытые инциденты</span><span class="mgmt-val ${openIncidents > 0 ? 'mgmt-red' : ''}">${openIncidents}</span></div>
      <div class="mgmt-row"><span class="mgmt-icon">${IC.ban}</span><span class="mgmt-label">Заблокировано</span><span class="mgmt-val ${bannedCount > 0 ? 'mgmt-red' : ''}">${bannedCount}</span></div>
      <div class="mgmt-row"><span class="mgmt-icon">${IC.shield}</span><span class="mgmt-label">В белом списке</span><span class="mgmt-val ${wlCount > 0 ? 'mgmt-green' : ''}">${wlCount}</span></div>
      <div class="mgmt-row"><span class="mgmt-icon">${IC.note}</span><span class="mgmt-label">С заметками</span><span class="mgmt-val">${notesCount}</span></div>
      <div class="mgmt-row"><span class="mgmt-icon">${IC.chart}</span><span class="mgmt-label">Общий трафик</span><span class="mgmt-val">${fmtBytes(totalTraffic)}</span></div>
    `;
  }

  // Anomalies preview
  const anomEl = document.getElementById('anomalies-list');
  if (suspects.length === 0) {
    anomEl.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg><p>Аномалий не обнаружено</p></div>`;
  } else {
    anomEl.innerHTML = `<div class="sus-grid">${suspects.slice(0, 6).map(s => suspectCardHtml(s)).join('')}</div>`;
  }

  // Connection map
  renderConnectionMap();

  // Activity chart
  renderActivityChart();
}

// ─── Sessions ─────────────────────────────────────────────────────
function renderSessions() {
  let users = getFilteredUsers();

  // Вторичная сортировка (внутри групп)
  const secondarySort = (a, b) => {
    if (state.sessionSort === 'ip-desc') return ipCount(b) - ipCount(a);
    if (state.sessionSort === 'ip-asc') return ipCount(a) - ipCount(b);
    return (a.username||'').localeCompare(b.username||'');
  };

  // Приоритетная сортировка: подозрительные → наблюдатели → остальные
  users.sort((a, b) => {
    const pa = isSuspicious(a) ? 0 : isUnderObservation(a) ? 1 : 2;
    const pb = isSuspicious(b) ? 0 : isUnderObservation(b) ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return secondarySort(a, b);
  });

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    users = users.filter(u => {
      // Match username
      if ((u.username||'').toLowerCase().includes(q)) return true;
      // Match IP
      const ips = getIpDetails(u);
      if (ips.some(d => d.ip && d.ip.includes(q))) return true;
      // Match country
      if (ips.some(d => d.geo && ((d.geo.countryCode||'').toLowerCase().includes(q) || (d.geo.country||'').toLowerCase().includes(q)))) return true;
      // Match ASN / org
      if (ips.some(d => d.geo && ((d.geo.asn ? String(d.geo.asn) : '').includes(q) || (d.geo.org||'').toLowerCase().includes(q) || (d.geo.isp||'').toLowerCase().includes(q)))) return true;
      // Match HWID
      const userKey = getUserKey(u);
      const devices = (state.hwidDevices && state.hwidDevices[userKey]) || [];
      if (devices.some(d => (d.hwid||'').toLowerCase().includes(q) || (d.deviceModel||d.model||'').toLowerCase().includes(q))) return true;
      return false;
    });
  }

  // Country filter
  if (state.countryFilter && state.countryFilter !== 'all') {
    users = users.filter(u => {
      const ips = getIpDetails(u);
      return ips.some(d => d.geo && (d.geo.countryCode === state.countryFilter || d.geo.country === state.countryFilter));
    });
  }

  // Populate country select
  const countrySelect = document.getElementById('country-filter');
  if (countrySelect) {
    const countries = new Set();
    state.users.forEach(u => {
      getIpDetails(u).forEach(d => {
        if (d.geo && d.geo.countryCode) countries.add(d.geo.countryCode);
      });
    });
    const sorted = Array.from(countries).sort();
    const current = state.countryFilter || 'all';
    countrySelect.innerHTML = `<option value="all">🌐 Все страны</option>${sorted.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('')}`;
  }

  const el = document.getElementById('sessions-list');
  if (users.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>Нет данных / пусто</p></div>';
    return;
  }
  el.innerHTML = users.map(u => sessionCardHtml(u)).join('');
}

function filterByCountry(value) {
  state.countryFilter = value;
  renderSessions();
}

function getFilteredUsers() {
  // Показываем только пользователей с активными IP (реальные сессии)
  const users = state.users.filter(u => ipCount(u) > 0);
  if (state.sessionFilter === 'multi-ip') return users.filter(u => ipCount(u) >= 3);
  if (state.sessionFilter === 'multi-hwid') return users.filter(u => hwidCount(u) >= 3);
  return users;
}

function sessionCardHtml(u) {
  const name = u.username || u.name || 'Unknown';
  const ipDetails = getIpDetails(u);
  const hwid = hwidCountForUser(u);
  const isSusp = isSuspicious(u);
  const isWatch = !isSusp && isUnderObservation(u);
  const initials = name.substring(0, 2).toUpperCase();
  const userKey = getUserKey(u);
  const hwidLimit = getUserHwidLimit(u);
  const hwidOver = hwid > hwidLimit;
  const serverResult = getServerDetectionForUser(u);
  const riskScore = serverResult ? (serverResult.riskScore || 0) : 0;

  const cardCls = isSusp ? 'sc suspicious' : isWatch ? 'sc observation' : 'sc';

  // Top 3 IPs with geo + VPN badge
  const topIps = ipDetails.slice(0, 3).map(d => {
    const geo = d.geo || {};
    const geoCode = geo.countryCode || '';
    const connType = geo.connectionType || '';
    const connIcon = connType.toLowerCase().includes('cell') ? '📱' : connType.toLowerCase().includes('broad') || connType.toLowerCase().includes('cable') || connType.toLowerCase().includes('dsl') ? '🏠' : connType.toLowerCase().includes('host') ? '☁️' : '';
    const vpnBadge = getProxyBadge(d.ip);
    return `<span class="sc-ip">${esc(d.ip)} ${geoCode ? `<span class="sc-geo">${esc(geoCode)}</span>` : ''}${connIcon ? `<span class="sc-conn-type" title="${esc(connType)}">${connIcon}</span>` : ''}${vpnBadge}</span>`;
  }).join('');
  const moreCount = ipDetails.length > 3 ? `<span class="sc-ip sc-ip-more">+${ipDetails.length - 3}</span>` : '';

  // Status line
  let statusHtml = '';
  if (isSusp) {
    const reason = hwidOver ? `HWID ${hwid}/${hwidLimit}` : (serverResult ? 'Детекция' : 'Подозрит.');
    statusHtml = `<div class="sc-status sc-status-danger">⚠ ${reason}</div>`;
  } else if (isWatch) {
    statusHtml = `<div class="sc-status sc-status-warn">👁 Наблюдение</div>`;
  }
  // Indicators for ban/whitelist/note
  const isBanned = !!(state.data && state.data.bannedUsers && state.data.bannedUsers[userKey]);
  const isWL = !!(state.data && state.data.whitelist && state.data.whitelist.find(w => w.userKey === userKey));
  const hasNote = !!(state.data && state.data.userNotes && state.data.userNotes[userKey]);
  const indicators = [
    isBanned ? '<span class="sc-indicator sc-ind-ban" title="Заблокирован">🚫</span>' : '',
    isWL ? '<span class="sc-indicator sc-ind-wl" title="Белый список">🛡️</span>' : '',
    hasNote ? '<span class="sc-indicator sc-ind-note" title="Есть заметка">📝</span>' : '',
  ].filter(Boolean).join('');

  return `<div class="${cardCls}" onclick="openUserCard('${escAttr(userKey)}')">
    <div class="sc-top">
      <div class="sc-avatar ${isSusp ? 'danger-avatar' : isWatch ? 'warning-avatar' : ''}">${initials}</div>
      <div class="sc-info">
        <div class="sc-name">${indicators}${esc(name)}</div>
        <div class="sc-sub">${esc(u.status || '')}</div>
      </div>
      <div class="sc-badges">
        <div class="sc-badge ${ipDetails.length >= 5 ? 'sc-badge-warn' : ''}"><b>${ipDetails.length}</b> IP</div>
        <div class="sc-badge ${hwidOver ? 'sc-badge-danger' : ''}"><b>${hwid}</b>/${hwidLimit}</div>
        ${riskScore > 0 ? `<div class="sc-badge ${riskScore >= 40 ? 'sc-badge-danger' : riskScore >= 20 ? 'sc-badge-warn' : ''}"><b>${riskScore}</b>⚡</div>` : ''}
      </div>
    </div>
    ${ipDetails.length > 0 ? `<div class="sc-ips">${topIps}${moreCount}</div>` : ''}
    ${statusHtml}
  </div>`;
}

function toggleExpand(id) {
  const body = document.getElementById(id);
  const arrow = document.getElementById('arrow-' + id);
  body.classList.toggle('open');
  arrow.classList.toggle('open');
}

function switchUcTab(tabName) {
  document.querySelectorAll('.uc-tab').forEach(t => t.classList.toggle('active', t.dataset.uctab === tabName));
  document.querySelectorAll('.uc-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.uctabPanel === tabName));
}

function openUserCard(key) {
  const user = findUserByAnyKey(key);
  const modal = document.getElementById('user-modal');
  const content = document.getElementById('user-modal-content');
  if (!modal || !content) return;
  if (!user) {
    toast('Пользователь не найден в текущем снимке', 'warning');
    return;
  }
  content.innerHTML = userCardHtml(user);
  modal.classList.remove('hidden');
  // Auto-load all tab data
  loadUserHistory(key);
  loadNotificationHistory(key);
}

function closeUserModal(event) {
  if (event && event.target && event.currentTarget && event.target !== event.currentTarget) return;
  document.getElementById('user-modal')?.classList.add('hidden');
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeUserModal();
});

// ─── Reset User UUID ──────────────────────────────────────────────
function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function showConfirmDialog({ title, message, detail, warning, onConfirm, onCancel, confirmText, confirmClass, icon }) {
  // Удаляем предыдущий, если есть
  document.getElementById('confirm-dialog-backdrop')?.remove();

  const iconSvg = icon === 'ban'
    ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
    : icon === 'shield'
    ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

  const btnClass = confirmClass || 'confirm-btn-yes';

  const backdrop = document.createElement('div');
  backdrop.id = 'confirm-dialog-backdrop';
  backdrop.className = 'confirm-backdrop';
  backdrop.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-icon ${icon === 'ban' ? 'confirm-icon-red' : icon === 'shield' ? 'confirm-icon-green' : ''}">
        ${iconSvg}
      </div>
      <div class="confirm-title">${title || 'Подтверждение'}</div>
      ${message ? `<div class="confirm-message">${message}</div>` : ''}
      ${detail ? `<div class="confirm-detail">${detail}</div>` : ''}
      ${warning ? `<div class="confirm-warning">${IC.warn} ${warning}</div>` : ''}
      <div class="confirm-buttons">
        <button class="confirm-btn confirm-btn-cancel" id="confirm-no">Отмена</button>
        <button class="confirm-btn ${btnClass}" id="confirm-yes">${confirmText || 'Подтвердить'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.querySelector('#confirm-yes').onclick = () => { close(); onConfirm && onConfirm(); };
  backdrop.querySelector('#confirm-no').onclick = () => { close(); onCancel && onCancel(); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { close(); onCancel && onCancel(); } });
}

async function resetUserUuid(userUuid) {
  if (!userUuid) { toast('UUID пользователя не найден', 'error'); return; }

  const newUuid = generateUUIDv4();

  showConfirmDialog({
    title: 'Сменить UUID',
    detail: `<div class="confirm-uuid-row"><span class="confirm-uuid-label">Старый</span><code>${userUuid}</code></div>`
          + `<div class="confirm-uuid-row"><span class="confirm-uuid-label">Новый</span><code class="confirm-uuid-new">${newUuid}</code></div>`,
    warning: 'Это сбросит ключ подписки. Пользователю нужно будет получить новый ключ.',
    confirmText: 'Да, сменить',
    onConfirm: () => executeUuidReset(userUuid, newUuid),
  });
}

async function executeUuidReset(userUuid, newUuid) {
  const btn = document.getElementById('btn-reset-uuid');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Смена...'; }

  try {
    const res = await fetch(`/proxy?path=${encodeURIComponent('/api/users')}&method=PATCH`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userUuid, uuid: newUuid }),
    });
    if (res.status === 401) { await handleAuthExpired(); return; }
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    toast(`UUID изменён на ${newUuid}`, 'ok');
    closeUserModal();
    setTimeout(() => loadAll(), 2000);
  } catch (e) {
    toast(`Ошибка смены UUID: ${e.message}`, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = IC.churn + ' Сменить UUID'; }
  }
}

// ─── Connection History ──────────────────────────────────────────
async function loadUserHistory(userKey, hours = 24) {
  const container = document.getElementById('user-history-content');
  if (!container) return;

  container.innerHTML = '<div class="loading-state" style="padding:24px"><div class="spinner-large"></div><p>Загрузка истории…</p></div>';

  try {
    const res = await fetch(`/api/user-history?userKey=${encodeURIComponent(userKey)}&hours=${hours}`, {
      credentials: 'same-origin',
    });
    if (res.status === 401) { await handleAuthExpired(); return; }
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    container.innerHTML = renderHistoryTimeline(data, userKey, hours);
    // Populate investigation tab separately
    const investContainer = document.getElementById('user-investigation-content');
    if (investContainer) {
      investContainer.innerHTML = renderInvestigationTab(data, userKey);
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state sm"><p style="color:var(--red)">Ошибка: ${esc(e.message)}</p></div>`;
  }
}

function renderHistoryTimeline(data, userKey, currentHours) {
  if (!data.timeline || data.timeline.length === 0) {
    return `<div class="htl-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <p>Нет IP-снимков за ${data.hours || currentHours}ч</p>
      ${data.hwidHistory && data.hwidHistory.length > 0 ? `<span class="htl-empty-sub">HWID за всё время: ${data.hwidHistory.length} устройств</span>` : ''}
    </div>`;
  }

  // Period selector
  const periods = [
    { h: 1, label: '1ч' }, { h: 6, label: '6ч' }, { h: 24, label: '24ч' },
    { h: 72, label: '3д' }, { h: 168, label: '7д' },
  ];
  const periodHtml = `<div class="htl-periods">${periods.map(p =>
    `<button class="htl-period ${p.h === currentHours ? 'active' : ''}" onclick="loadUserHistory('${escAttr(userKey)}', ${p.h})">${p.label}</button>`
  ).join('')}</div>`;

  // Summary stats — improved visual cards
  const summaryHtml = `<div class="htl-summary">
    <div class="htl-stat-card"><div class="htl-stat-num">${data.uniqueIps}</div><div class="htl-stat-label">Уник. IP</div></div>
    <div class="htl-stat-card"><div class="htl-stat-num">${data.timeline.length}</div><div class="htl-stat-label">Окна</div></div>
    <div class="htl-stat-card"><div class="htl-stat-num">${data.totalSnapshots}</div><div class="htl-stat-label">Записей</div></div>
    <div class="htl-stat-card"><div class="htl-stat-num">${(data.hwidHistory || []).length}</div><div class="htl-stat-label">HWID</div></div>
  </div>`;

  // Timeline — improved cards
  const maxIps = Math.max(1, ...data.timeline.map(t => t.ips.length));
  const timelineHtml = data.timeline.slice(-50).map((entry, idx) => {
    const time = new Date(entry.ts);
    const timeStr = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const dateStr = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const barPct = (entry.ips.length / maxIps * 100).toFixed(0);
    const severity = entry.ips.length > 5 ? 'danger' : entry.ips.length > 3 ? 'warn' : 'normal';
    const barColor = severity === 'danger' ? 'var(--red)' : severity === 'warn' ? 'var(--yellow)' : 'var(--accent)';

    const ipsPreview = entry.ips.slice(0, 5).map(i => {
      const geo = i.geo ? (i.geo.countryCode || '') : '';
      const city = i.geo ? (i.geo.city || '') : '';
      return `<span class="htl-ip2">${esc(i.ip)}${geo ? `<span class="htl-ip2-geo">${esc(geo)}${city ? ' ' + esc(city) : ''}</span>` : ''}</span>`;
    }).join('');
    const more = entry.ips.length > 5 ? `<span class="htl-ip2-more">+${entry.ips.length - 5}</span>` : '';

    return `<div class="htl-entry htl-entry-${severity}">
      <div class="htl-entry-header">
        <div class="htl-entry-time">
          <span class="htl-entry-clock">${timeStr}</span>
          <span class="htl-entry-date">${dateStr}</span>
        </div>
        <div class="htl-entry-bar-wrap">
          <div class="htl-entry-bar"><div class="htl-entry-bar-fill" style="width:${barPct}%;background:${barColor}"></div></div>
        </div>
        <div class="htl-entry-count" style="color:${barColor}">${entry.ips.length} <small>IP</small></div>
      </div>
      <div class="htl-entry-ips">${ipsPreview}${more}</div>
    </div>`;
  }).join('');

  return `${periodHtml}${summaryHtml}<div class="htl-timeline2">${timelineHtml}</div>`;
}

// ─── Investigation Tab ───────────────────────────────────────────
function renderInvestigationTab(data, userKey) {
  const parts = [];

  // Events section
  if (data.events && data.events.length > 0) {
    parts.push(renderInvestigationEvents(data.events));
  }

  // Linked accounts
  if (data.linkedAccounts && Object.keys(data.linkedAccounts).length > 0) {
    const rows = [];
    for (const [hwid, accounts] of Object.entries(data.linkedAccounts)) {
      for (const acc of accounts) {
        rows.push(`<div class="inv-linked-row">
          <div class="inv-linked-hwid-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <code>${esc(hwid.slice(0, 16))}…</code>
          </div>
          <span class="signal-linked-user" onclick="openUserCard('${escAttr(acc.userKey)}')">${esc(acc.userKey)}</span>
          <span class="inv-linked-date">${new Date(acc.lastSeen).toLocaleDateString('ru-RU')}</span>
        </div>`);
      }
    }
    parts.push(`<div class="inv-section">
      <div class="inv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M8.6 7.5l6.8 0"/><path d="M7.5 8.6l3 6.8"/><path d="M16.5 8.6l-3 6.8"/></svg> Общие HWID с другими аккаунтами</div>
      <div class="inv-linked-list">${rows.join('')}</div>
    </div>`);
  }

  // Audit log
  if (data.auditLog && data.auditLog.length > 0) {
    parts.push(renderAuditLog(data.auditLog));
  }

  if (parts.length === 0) {
    return `<div class="htl-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <p>Событий расследования нет</p>
    </div>`;
  }

  return parts.join('');
}

function renderAuditLog(entries) {
  if (!entries || entries.length === 0) return '';
  const rows = entries.slice(0, 15).map(e => {
    const date = new Date(e.ts);
    const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const levelCls = e.riskLevel === 'critical' ? 'audit-red' : e.riskLevel === 'high' ? 'audit-orange' : e.riskLevel === 'warning' ? 'audit-yellow' : 'audit-green';
    const levelColor = e.riskLevel === 'critical' ? 'var(--red)' : e.riskLevel === 'high' ? '#f97316' : e.riskLevel === 'warning' ? 'var(--yellow)' : 'var(--green)';
    const levelIcon = IC.dot(levelColor);
    return `<div class="inv-audit-row">
      <span class="inv-audit-time">${dateStr} ${timeStr}</span>
      <span class="inv-audit-level ${levelCls}">${levelIcon} ${esc(e.riskLevel)}</span>
      <span class="inv-audit-score">${e.riskScore}<small>/100</small></span>
    </div>`;
  }).join('');
  return `<div class="inv-section">
    <div class="inv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Лог детекции</div>
    <div class="inv-audit-list">${rows}</div>
  </div>`;
}

function renderInvestigationEvents(events) {
  // Signal ID → human-readable name
  const signalNames = {
    hwid_over_limit: '🔴 HWID превышает лимит',
    hwid_churn_high: '🔄 Высокая ротация HWID',
    hwid_churn_moderate: '🔄 Повышенная ротация HWID',
    temporal_247: '⏰ Активность 24/7',
    multi_city_extreme: '🌍 Мультигород (3+)',
    multi_city_suspect: '🌍 Мультигород (2)',
    impossible_travel: '✈️ Невозможное перемещение',
    suspicious_travel: '✈️ Подозрительное перемещение',
    velocity_extreme: '⚡ Экстремальный трафик',
    velocity_high: '⚡ Высокий трафик',
    fingerprint_cluster: '🔗 Кластер HWID',
    fingerprint_match: '🔗 Совпадение HWID',
    shared_ip_cluster: '🌐 Общий IP кластер',
    isp_datacenter_heavy: '🏢 Datacenter IP',
    isp_mix: '🏢 Микс ISP типов',
    behavior_shift: '📊 Смена поведения',
  };
  const categoryLabels = {
    deterministic: 'крит.',
    strong: 'сильный',
    weak: 'слабый',
    info: 'инфо',
  };
  const categoryCls = {
    deterministic: 'inv-sig-crit',
    strong: 'inv-sig-strong',
    weak: 'inv-sig-weak',
    info: 'inv-sig-info',
  };

  // Group consecutive events with same title+type into one row with count
  const grouped = [];
  for (const event of events) {
    const key = (event.title || event.type || '') + '|' + (event.detail || '');
    const last = grouped[grouped.length - 1];
    if (last && last.key === key) {
      last.count++;
      last.firstTs = event.ts; // oldest
    } else {
      grouped.push({ ...event, key, count: 1, firstTs: event.ts, lastTs: event.ts });
    }
  }

  const rows = grouped.slice(0, 20).map((event) => {
    const date = new Date(event.lastTs);
    const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const cls = event.type && event.type.includes('ban') ? 'danger'
      : event.type && (event.type.includes('notification') || event.type.includes('warn')) ? 'warn'
      : event.type && event.type.includes('resolved') ? 'ok'
      : 'info';
    const icon = cls === 'danger' ? IC.ban : cls === 'warn' ? IC.warn : cls === 'ok' ? IC.check : IC.clipboard;
    const meta = event.meta || {};
    const metaBits = [
      meta.country, meta.asn ? `AS${meta.asn}` : '', meta.org, meta.status,
    ].filter(Boolean).slice(0, 3);
    const countBadge = event.count > 1 ? `<span class="inv-event-count">×${event.count}</span>` : '';
    const rangeStr = event.count > 1
      ? `${new Date(event.firstTs).toLocaleDateString('ru-RU', {day:'2-digit',month:'2-digit'})} — ${dateStr}`
      : `${dateStr} ${timeStr}`;

    // Build signal detail for detection events
    let signalHtml = '';
    const signals = meta.signals || (meta.detection && meta.detection.signals) || [];
    if (signals.length > 0) {
      signalHtml = `<div class="inv-signals">${signals.map(s => {
        const name = signalNames[s.id] || s.id;
        const cat = categoryLabels[s.category] || s.category;
        const catCls = categoryCls[s.category] || 'inv-sig-info';
        return `<div class="inv-signal-row">
          <span class="inv-signal-cat ${catCls}">${esc(cat)}</span>
          <span class="inv-signal-name">${esc(name)}</span>
          <span class="inv-signal-reason">${esc(s.reason || '')}</span>
          <span class="inv-signal-pts">+${s.points || 0}</span>
        </div>`;
      }).join('')}</div>`;
    }

    // Enhanced detail for risk_updated events
    let detailHtml = '';
    if (event.detail) {
      detailHtml = `<div class="inv-event-detail">${esc(event.detail)}</div>`;
    }
    if (meta.riskLevel && meta.riskScore !== undefined && !event.detail) {
      const lvlColor = meta.riskLevel === 'critical' ? 'var(--red)' : meta.riskLevel === 'high' ? '#f97316' : meta.riskLevel === 'warning' ? 'var(--yellow)' : 'var(--green)';
      detailHtml = `<div class="inv-event-detail">${IC.dot(lvlColor)} ${esc(meta.riskLevel)} · ${meta.riskScore}/100${meta.previousScore !== undefined ? ` (было: ${meta.previousScore})` : ''}</div>`;
    }

    return `<div class="inv-event inv-event-${cls}">
      <div class="inv-event-icon">${icon}</div>
      <div class="inv-event-content">
        <div class="inv-event-head">
          <span class="inv-event-title">${esc(event.title || event.type || 'Событие')}${countBadge}</span>
          <span class="inv-event-time">${rangeStr}</span>
        </div>
        ${detailHtml}
        ${signalHtml}
        ${metaBits.length ? `<div class="inv-event-meta">${metaBits.map(b => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="inv-section">
    <div class="inv-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg> Лента событий</div>
    <div class="inv-events-list">${rows}</div>
  </div>`;
}

function userCardHtml(u) {
  const name = u.username || u.name || 'Неизвестно';
  const initials = name.substring(0, 2).toUpperCase();
  const key = getUserKey(u);
  const ipDetails = getIpDetails(u);
  const freshIps = ipDetails.filter(d => d.fresh);
  const freshStableIps = ipDetails.filter(d => d.stable && d.fresh);
  const historicalIps = ipDetails.filter(d => !d.fresh);
  const devices = getDevicesForUser(u);
  const hwidLimit = getUserHwidLimit(u);
  const hwidCount = hwidCountForUser(u);
  const traffic = getTrafficInfo(u);
  const subscription = getSubscriptionInfo(u);
  const suspect = isSuspicious(u);
  const observation = isUnderObservation(u);
  const ipSignal = getIpSignal(u);
  const leakRisk = getKeyLeakRisk(u);
  const rawFields = getDisplayUserFields(u);
  const uuid = u.uuid || u.userUuid || u.id || '';
  const serverResult = getServerDetectionForUser(u);
  const churn30d = getHwidChurnForUser(u);
  const expireDate = fmtDate(u.expireAt || u.subscriptionExpireAt || u.expiresAt || u.validUntil) || '—';

  // Ban / Whitelist / Notes state
  const isBanned = !!(state.data && state.data.bannedUsers && state.data.bannedUsers[key]);
  const isWL = !!(state.data && state.data.whitelist && state.data.whitelist.find(w => w.userKey === key));
  const noteData = state.data && state.data.userNotes && state.data.userNotes[key];
  const noteText = noteData ? noteData.note : '';
  // Traffic progress
  const trafficBytes = Number(u.usedTrafficBytes || u.usedTraffic || (u.userTraffic && u.userTraffic.usedTrafficBytes) || 0);
  const trafficLimit = Number(u.trafficLimitBytes || u.trafficLimit || (u.userTraffic && u.userTraffic.trafficLimitBytes) || 0);
  const trafficPct = trafficLimit > 0 ? Math.min(100, Math.round(trafficBytes / trafficLimit * 100)) : 0;
  const trafficColor = trafficPct > 90 ? 'var(--red)' : trafficPct > 70 ? 'var(--yellow)' : 'var(--green)';

  // Status banner removed — информация о нарушениях уже отображается в метриках
  let bannerHtml = '';

  // Server signals chips
  let signalsHtml = '';
  if (serverResult && serverResult.signals && serverResult.signals.length > 0) {
    const chips = serverResult.signals.map(s => {
      const cat = s.category === 'deterministic' ? 'det' : s.category === 'strong' ? 'str' : s.category === 'weak' ? 'wk' : 'ind';
      const catLabel = s.category === 'deterministic' ? 'крит.' : s.category === 'strong' ? 'сильный' : s.category === 'weak' ? 'слабый' : 'инфо';

      // Map signal IDs to human-readable names
      const signalTitles = {
        hwid_over_limit: 'HWID превышает лимит',
        hwid_churn_high: 'Высокая ротация HWID',
        hwid_churn_moderate: 'Повышенная ротация HWID',
        temporal_247: 'Активность 24/7',
        multi_city_extreme: 'Одновременно из 3+ городов',
        multi_city_suspect: 'Одновременно из 2 городов',
        impossible_travel: 'Невозможное перемещение',
        suspicious_travel: 'Подозрительное перемещение',
        velocity_extreme: 'Экстремальный трафик',
        velocity_high: 'Высокий трафик',
        fingerprint_cluster: 'Кластер HWID (мульти-акк)',
        fingerprint_match: 'Совпадение HWID',
        shared_ip_cluster: 'Общий IP кластер',
        isp_datacenter_heavy: 'Множество VPN/Proxy IP',
        isp_mix: 'Микс типов ISP',
        behavior_shift: 'Резкая смена поведения',
        simultaneous_distinct_networks: 'Одновременные разные сети',
        extracted_key_suspected: 'Подозрение: ключ извлечён',
        multi_node_simultaneous: 'Мульти-нодовое использование',
        schedule_pattern: 'Паттерн по расписанию',
      };

      const titleText = signalTitles[s.id] || s.reason || s.id;
      const detailText = s.reason || '';

      return `<div class="signal-card signal-card-${cat}">
        <div class="signal-card-head">
          <span class="signal-cat">${catLabel}</span>
          <span class="signal-card-title">${esc(titleText)}</span>
          ${s.points > 0 ? `<span class="signal-pts">+${s.points}</span>` : ''}
        </div>
        ${detailText && detailText !== titleText ? `<div class="signal-card-detail">${esc(detailText)}</div>` : ''}
      </div>`;
    }).join('');
    signalsHtml = `<div class="uc-section">
      <div class="uc-section-head"><span>Сигналы детекции</span><span class="uc-badge">${serverResult.signals.length}</span></div>
      <div class="signal-cards">${chips}</div>
    </div>`;

    // Confidence badge
    const conf = serverResult.confidence;
    if (conf && conf.score > 0) {
      const confColor = conf.level === 'confirmed' ? 'var(--red)'
        : conf.level === 'high' ? '#f97316'
        : conf.level === 'medium' ? 'var(--yellow)'
        : 'var(--text3)';
      const confLabel = conf.level === 'confirmed' ? 'подтверждено'
        : conf.level === 'high' ? 'высокая'
        : conf.level === 'medium' ? 'средняя'
        : 'низкая';
      const typeLabels = {
        device: 'устройство', geographic: 'гео', temporal: 'время',
        network: 'сеть', traffic: 'трафик', identity: 'идентификация',
        infrastructure: 'инфраструктура',
      };
      const typeChips = (conf.types || []).map(t => `<span class="conf-type">${esc(typeLabels[t] || t)}</span>`).join('');
      signalsHtml += `<div class="uc-section">
        <div class="uc-section-head"><span>Уверенность</span><span class="uc-badge" style="background:${confColor};color:#fff">${conf.score}%</span></div>
        <div class="confidence-row">
          <span class="conf-level" style="color:${confColor}">${confLabel}</span>
          <span class="conf-desc">${conf.types.length} независимых типов доказательств</span>
        </div>
        <div class="conf-types">${typeChips}</div>
      </div>`;
    }

    // Mitigating factors (white explanations)
    const mitigating = serverResult.mitigating;
    if (Array.isArray(mitigating) && mitigating.length > 0) {
      const mItems = mitigating.map(m => `<div class="mitigating-item">
        ${IC._s('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', 14)}
        <span>${esc(m.text)}</span>
      </div>`).join('');
      signalsHtml += `<div class="uc-section">
        <div class="uc-section-head"><span>Что может быть нормой</span></div>
        <div class="mitigating-list">${mItems}</div>
      </div>`;
    }
  }

  // Risk score
  const riskScore = serverResult ? (serverResult.riskScore || 0) : leakRisk.score;
  const riskLevel = serverResult ? (serverResult.riskLevel || 'clean') : leakRisk.level;
  const riskColor = riskLevel === 'critical' ? 'var(--red)'
    : riskLevel === 'high' ? '#f97316'
    : riskLevel === 'warning' ? 'var(--yellow)'
    : 'var(--green)';

  // IP table rows
  const ipRowsHtml = freshIps.slice(0, 12).map(d => {
    const geo = d.geo || {};
    const country = geo.countryCode || geo.country || '';
    const city = geo.city || '';
    const asn = geo.asn ? `AS${geo.asn}` : '';
    const org = geo.org || geo.isp || '';
    const ls = fmtLastSeen(d.lastSeen);
    const stableClass = d.stable ? 'ip-pill-stable' : 'ip-pill-new';
    const stableText = d.stable ? 'стабильный' : 'новый';
    const connType = geo.connectionType || '';
    const connBadge = connType
      ? `<span class="conn-type conn-type-${connType.toLowerCase().includes('cell') ? 'cell' : connType.toLowerCase().includes('cable') || connType.toLowerCase().includes('dsl') ? 'cable' : connType.toLowerCase().includes('corp') ? 'corp' : 'other'}">${esc(connType)}</span>`
      : '';
    const nodeMap = (state.data && state.data.nodeMap) || {};
    const nodeName = d.nodeUuid ? (nodeMap[d.nodeUuid] || d.nodeUuid.slice(0, 8)) : '';
    return `<div class="ip-row">
      <code class="ip-row-addr">${esc(d.ip)}</code>
      ${ls ? `<span class="lastseen lastseen-${ls.level}">${ls.text}</span>` : ''}
      ${nodeName ? `<span class="ip-node-badge" title="${escAttr(d.nodeUuid)}">${esc(nodeName)}</span>` : ''}
      ${connBadge}
      ${country ? `<span class="ip-row-geo">${esc(country)}${city ? ' ' + esc(city) : ''}</span>` : ''}
      ${asn ? `<span class="ip-row-asn">${esc(asn)}${org ? ' · ' + esc(org) : ''}</span>` : ''}
      <span class="ip-pill ${stableClass}">${stableText}</span>
    </div>`;
  }).join('');
  const moreIps = freshIps.length > 12 ? `<div class="ip-row ip-row-more">+${freshIps.length - 12} ещё</div>` : '';

  return `<div class="user-card">
    <div class="uc-header">
      <div class="uc-header-left">
        <div class="user-avatar uc-avatar ${suspect ? 'danger-avatar' : (observation ? 'warning-avatar' : '')}">${esc(initials)}</div>
        <div class="uc-header-info">
          <div class="uc-name">${esc(name)}</div>
          <div class="uc-meta">
            ${userStatusBadge(u.status)}
            <code class="uc-uuid">${esc(uuid)}</code>
          </div>
        </div>
      </div>
      <div class="uc-header-right">
        <button class="modal-close" onclick="closeUserModal()" title="Закрыть">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    ${bannerHtml}

    <div class="uc-body">
      <div class="uc-tabs-section" style="border:none;background:none">
        <div class="uc-tabs-nav">
          <button class="uc-tab active" data-uctab="overview" onclick="switchUcTab('overview')">
            ${IC._s('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 14)}
            Обзор
          </button>
          <button class="uc-tab" data-uctab="signals" onclick="switchUcTab('signals')">
            ${IC._s('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 14)}
            Сигналы${serverResult && serverResult.signals && serverResult.signals.length ? ` <span class="uc-tab-count">${serverResult.signals.length}</span>` : ''}
          </button>
          <button class="uc-tab" data-uctab="history" onclick="switchUcTab('history')">
            ${IC._s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 14)}
            История
          </button>
          <button class="uc-tab" data-uctab="devices" onclick="switchUcTab('devices')">
            ${IC._s('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 14)}
            Устройства <span class="uc-tab-count">${hwidCount}</span>
          </button>
          <button class="uc-tab" data-uctab="actions" onclick="switchUcTab('actions')">
            ${IC._s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 14)}
            Действия
          </button>
        </div>

        <!-- TAB: Обзор -->
        <div class="uc-tab-panel active" data-uctab-panel="overview">
          <div style="padding:18px;display:flex;flex-direction:column;gap:16px">
            <div class="uc-metrics">
              <div class="uc-metric ${hwidCount > hwidLimit ? 'uc-metric-danger' : ''}">
                <div class="uc-metric-icon">${IC.hwid}</div>
                <div><div class="uc-metric-val">${hwidCount}<span class="uc-metric-dim">/${hwidLimit}</span></div><div class="uc-metric-lbl">Устройства</div></div>
              </div>
              <div class="uc-metric">
                <div class="uc-metric-icon uc-metric-icon-blue">${IC.globe}</div>
                <div><div class="uc-metric-val">${freshIps.length}<span class="uc-metric-dim"> / ${freshStableIps.length} стаб.</span></div><div class="uc-metric-lbl">IP адреса</div></div>
              </div>
              <div class="uc-metric">
                <div class="uc-metric-icon uc-metric-icon-yellow">${IC.shield}</div>
                <div>
                  <div class="uc-metric-val">${riskScore}<span class="uc-metric-dim">/100</span></div>
                  <div class="uc-risk-bar"><div class="uc-risk-fill" style="width:${Math.min(100, riskScore)}%;background:${riskColor}"></div></div>
                </div>
              </div>
              <div class="uc-metric">
                <div class="uc-metric-icon uc-metric-icon-green">${IC.activity}</div>
                <div><div class="uc-metric-val">${esc(traffic)}</div><div class="uc-metric-lbl">Трафик</div></div>
              </div>
            </div>

            <div class="uc-info-row">
              <div class="uc-info-item"><span>Подписка</span><b>${esc(subscription)}</b></div>
              <div class="uc-info-item"><span>Активен до</span><b>${esc(expireDate)}</b></div>
              <div class="uc-info-item"><span>HWID за 30д</span><b>${churn30d || '—'}</b></div>
              <div class="uc-info-item"><span>Историч. IP</span><b>${historicalIps.length}</b></div>
            </div>

            <div class="uc-section" style="margin:0;border:none;border-radius:0">
              <div class="uc-section-head"><span>Трафик</span>${trafficLimit > 0 ? `<span class="uc-badge">${trafficPct}%</span>` : ''}</div>
              <div class="traffic-info">
                <div class="traffic-bar"><div class="traffic-fill" style="width:${trafficPct}%;background:${trafficColor}"></div></div>
                <div class="traffic-text">${esc(fmtBytes(trafficBytes))}${trafficLimit > 0 ? ` / ${esc(fmtBytes(trafficLimit))}` : ''}</div>
              </div>
            </div>

            ${rawFields.length > 0 ? `<div>${userRawFieldsSection(rawFields)}</div>` : ''}
          </div>
        </div>

        <!-- TAB: Сигналы -->
        <div class="uc-tab-panel" data-uctab-panel="signals">
          <div style="padding:18px;display:flex;flex-direction:column;gap:14px">
            ${signalsHtml || '<div class="empty-state sm"><p>Сигналов детекции нет</p></div>'}
          </div>
        </div>

        <!-- TAB: История -->
        <div class="uc-tab-panel" data-uctab-panel="history">
          <div id="user-history-content" class="history-content">
            <div class="loading-state" style="padding:24px"><div class="spinner-large"></div><p>Загрузка истории…</p></div>
          </div>
          <div id="user-investigation-content">
            <div class="loading-state" style="padding:24px"><div class="spinner-large"></div><p>Загрузка…</p></div>
          </div>
          <div id="notification-history-content" class="notification-history">
            <div class="loading-state" style="padding:16px"><div class="spinner-large"></div></div>
          </div>
        </div>

        <!-- TAB: Устройства -->
        <div class="uc-tab-panel" data-uctab-panel="devices">
          <div style="padding:18px;display:flex;flex-direction:column;gap:14px">
            ${freshIps.length > 0 ? `<div class="uc-section" style="margin:0">
              <div class="uc-section-head"><span>IP-адреса</span><span class="uc-badge">${freshIps.length}</span></div>
              <div class="ip-rows">${ipRowsHtml}${moreIps}</div>
            </div>` : ''}

            ${devices.length > 0 ? `<div class="uc-section" style="margin:0">
              <div class="uc-section-head"><span>Устройства</span><span class="uc-badge">${devices.length}</span></div>
              <div class="dev-rows">${devices.map(deviceDetailHtml).join('')}</div>
            </div>` : '<div class="empty-state sm"><p>Нет данных устройств</p></div>'}
          </div>
        </div>

        <!-- TAB: Действия -->
        <div class="uc-tab-panel" data-uctab-panel="actions">
          <div style="padding:18px;display:flex;flex-direction:column;gap:16px">
            <div class="uc-actions-grid">
              <button class="uc-action-card ${isWL ? 'uc-action-active' : ''}" onclick="toggleWhitelist('${escAttr(key)}', ${isWL})">
                <div class="uc-action-icon">${IC.shield}</div>
                <div class="uc-action-label">${isWL ? 'Убрать из WL' : 'В белый список'}</div>
                <div class="uc-action-desc">${isWL ? 'Пользователь в белом списке' : 'Исключить из детекции'}</div>
              </button>
              <button class="uc-action-card uc-action-warn" onclick="notifyUser('${escAttr(key)}')">
                <div class="uc-action-icon">${IC.send}</div>
                <div class="uc-action-label">Предупредить</div>
                <div class="uc-action-desc">Отправить уведомление в Telegram</div>
              </button>
              <button class="uc-action-card ${isBanned ? 'uc-action-success' : 'uc-action-danger'}" onclick="toggleBan('${escAttr(key)}', ${isBanned})">
                <div class="uc-action-icon">${isBanned ? IC.unban : IC.ban}</div>
                <div class="uc-action-label">${isBanned ? 'Разбанить' : 'Заблокировать'}</div>
                <div class="uc-action-desc">${isBanned ? 'Снять блокировку доступа' : 'Заблокировать доступ к VPN'}</div>
              </button>
              <button class="uc-action-card" onclick="resetUserUuid('${escAttr(uuid)}')">
                <div class="uc-action-icon">${IC.churn}</div>
                <div class="uc-action-label">Сменить UUID</div>
                <div class="uc-action-desc">Генерация нового UUID подписки</div>
              </button>
            </div>

            <div class="uc-section" style="margin:0">
              <div class="uc-section-head"><span>Заметка</span></div>
              <textarea class="uc-note" placeholder="Добавить заметку…" onblur="saveNote('${escAttr(key)}', this.value)">${esc(noteText)}</textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`
}

function detailTile(label, value, tone = '') {
  return `<div class="detail-tile ${tone ? 'detail-' + tone : ''}">
    <div class="detail-label">${esc(label)}</div>
    <div class="detail-value">${esc(String(value ?? '—'))}</div>
  </div>`;
}

function userIpSection(title, ips, emptyText) {
  return `<div class="detail-section">
    <div class="detail-section-title">${esc(title)} <span>${ips.length}</span></div>
    ${ips.length ? `<div class="ip-tags">${ips.map(ipDetailTag).join('')}</div>` : `<div class="detail-empty">${esc(emptyText)}</div>`}
  </div>`;
}

function ipDetailTag(d) {
  const ls = fmtLastSeen(d.lastSeen);
  const geo = ipGeoLabel(d.geo);
  const vpnBadge = getProxyBadge(d.ip);
  const classes = ['ip-tag'];
  if (!d.stable) classes.push('ip-unstable');
  if (d.stable && !d.fresh) classes.push('ip-stale');
  if (d.stable && d.fresh) classes.push('ip-fresh');
  return `<span class="${classes.join(' ')}">
    ${esc(d.ip)}
    ${ls ? `<span class="lastseen lastseen-${ls.level}">${ls.text}</span>` : ''}
    ${geo ? `<span class="mini-pill">${esc(geo)}</span>` : ''}
    ${vpnBadge}
    ${d.stable ? '<span class="mini-pill">стабильный</span>' : '<span class="mini-pill">новый</span>'}
  </span>`;
}

function userDevicesSection(devices) {
  return `<div class="detail-section">
    <div class="detail-section-title">Устройства и HWID <span>${devices.length}</span></div>
    ${devices.length ? `<div class="device-detail-grid">${devices.map(deviceDetailHtml).join('')}</div>` : '<div class="detail-empty">Нет данных устройств</div>'}
  </div>`;
}

function keyLeakRiskSection(risk) {
  const stats = risk.stats || {};
  const context = risk.context || {};
  const countries = (stats.countries24h || []).slice(0, 4).map(c => `${c.code || ''} ${c.name || ''}`.trim()).filter(Boolean);
  const asns = (stats.asns24h || []).slice(0, 4).map(a => `${a.asn ? 'AS' + a.asn : ''} ${a.org || ''}`.trim()).filter(Boolean);
  const reasons = risk.reasons.length
    ? risk.reasons
    : ['нет устойчивых признаков, что ключ используют вне владельца'];

  return `<div class="detail-section leak-risk leak-risk-${escAttr(risk.level)}">
    <div class="detail-section-title">Риск утечки VLESS-ключа <span>${risk.score}/100</span></div>
    <div class="risk-meter">
      <div class="risk-meter-fill" style="width:${Math.min(100, Math.max(0, risk.score))}%"></div>
    </div>
    <div class="risk-summary">
      <div><span>Устройства / лимит</span><b>${context.hwid ?? '—'} / ${context.hwidLimit ?? '—'}</b></div>
      <div><span>IP сверх устройств</span><b>${context.freshIpExcess || 0}</b></div>
      <div><span>Уникальных IP за 24ч</span><b>${stats.uniqueIps24h || 0}</b></div>
      <div><span>Разных сетей /24</span><b>${stats.uniqueNetworks24h || 0}</b></div>
      <div><span>Стран за 24ч</span><b>${(stats.countries24h || []).length}</b></div>
      <div><span>ASN/провайдеров</span><b>${(stats.asns24h || []).length}</b></div>
      <div><span>VPS/proxy/VPN IP</span><b>${(stats.hostingIpCount || 0) + (stats.proxyIpCount || 0) + (stats.vpnIpCount || 0)}</b></div>
      <div><span>Одноврем. из разных стран</span><b>${context.concurrentPairs || 0}</b></div>
      <div><span>HWID за 30 дней</span><b>${context.hwidChurn30d || '—'}</b></div>
    </div>
    <div class="risk-reasons">
      ${reasons.map(reason => `<span>${esc(reason)}</span>`).join('')}
    </div>
    <div class="risk-muted">Учитывается лимит: до ${context.allowedDevices || 0} устройств/IP считается нормой, сети получают запас до ${context.networkGrace || 0} диапазонов.</div>
    ${countries.length ? `<div class="risk-muted">Страны: ${esc(countries.join(', '))}</div>` : ''}
    ${asns.length ? `<div class="risk-muted">Провайдеры: ${esc(asns.join(', '))}</div>` : ''}
  </div>`;
}

function deviceDetailHtml(d) {
  const info = getDeviceInfo(d);
  return `<div class="dev-row">
    <div class="dev-row-icon dev-icon-${escAttr(info.kind)}">${deviceIconSvg(info.kind)}</div>
    <span class="dev-row-name">${esc(info.title)}</span>
    ${info.subtitle ? `<span class="dev-row-model">${esc(info.subtitle)}</span>` : ''}
    ${info.hwid ? `<code class="dev-row-hwid">${esc(info.hwid)}</code>` : ''}
    ${info.date ? `<span class="dev-row-date">${esc(fmtDate(info.date) || info.date)}</span>` : ''}
  </div>`;
}

function userRawFieldsSection(fields) {
  if (!fields.length) return '';
  return `<div class="detail-section">
    <div class="detail-section-title">Данные профиля <span>${fields.length}</span></div>
    <div class="raw-fields">
      ${fields.map(({ label, value }) => `<div><span>${esc(label)}</span><code>${esc(String(value))}</code></div>`).join('')}
    </div>
  </div>`;
}

function userStatusBadge(status) {
  const text = localizeStatus(status);
  const cls = String(status || '').toLowerCase() === 'active' ? 'status-ok' : 'status-muted';
  return `<span class="profile-status ${cls}">${esc(text)}</span>`;
}

function localizeStatus(status) {
  const raw = String(status || '').toLowerCase();
  const map = {
    active: 'Активен',
    disabled: 'Отключен',
    expired: 'Истек',
    limited: 'Ограничен',
    on_hold: 'Пауза'
  };
  return map[raw] || status || 'Статус неизвестен';
}

function getDeviceInfo(d) {
  const model = cleanDeviceValue(firstDeviceValue(d, [
    'deviceModel', 'model', 'deviceName', 'name', 'title', 'device', 'hardwareModel'
  ]));
  const osRaw = cleanDeviceValue(firstDeviceValue(d, [
    'deviceOs', 'os', 'platform', 'devicePlatform', 'operatingSystem', 'operatingSystemName', 'systemName', 'deviceType', 'type'
  ]));
  const brand = cleanDeviceValue(firstDeviceValue(d, [
    'brand', 'deviceBrand', 'manufacturer', 'vendor'
  ]));
  const hwid = cleanDeviceValue(firstDeviceValue(d, [
    'hwid', 'deviceId', 'deviceHwid', 'hardwareId', 'fingerprint', 'identifier', 'id'
  ]));
  const date = cleanDeviceValue(firstDeviceValue(d, [
    'createdAt', 'created_at', 'linkedAt', 'lastSeen', 'lastSeenAt', 'updatedAt', 'updated_at'
  ]));

  const os = localizeDeviceOs(osRaw, model);
  const title = model || os || (hwid ? `Устройство ${shortToken(hwid)}` : 'Устройство');
  const subtitle = [model && os ? os : '', brand && !String(model).toLowerCase().includes(String(brand).toLowerCase()) ? brand : '']
    .filter(Boolean)
    .join(' · ');

  return {
    title,
    subtitle,
    hwid,
    date,
    kind: getDeviceKind(`${model} ${osRaw} ${os}`),
  };
}

function firstDeviceValue(device, keys) {
  for (const key of keys) {
    const value = device && device[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '';
}

function cleanDeviceValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function shortToken(value) {
  const text = String(value || '');
  return text.length > 10 ? text.slice(0, 10) : text;
}

function localizeDeviceOs(os, modelHint = '') {
  const source = `${os || ''} ${modelHint || ''}`;
  const raw = source.toLowerCase();
  if (raw.includes('iphone')) return 'iOS';
  if (raw.includes('ipad')) return 'iPadOS';
  if (raw.includes('ios')) return 'iOS';
  if (raw.includes('android')) return 'Android';
  if (raw.includes('windows')) return 'Windows';
  if (raw.includes('mac')) return 'macOS';
  if (raw.includes('linux')) return 'Linux';
  if (os && os !== '?') return os;
  return '';
}

function getDeviceKind(text) {
  const raw = String(text || '').toLowerCase();
  if (raw.includes('iphone') || raw.includes('android') || raw.includes('phone') || raw.includes('mobile')) return 'phone';
  if (raw.includes('ipad') || raw.includes('tablet')) return 'tablet';
  if (raw.includes('windows') || raw.includes('mac') || raw.includes('linux') || raw.includes('desktop') || raw.includes('pc')) return 'desktop';
  return 'unknown';
}

function deviceIconSvg(kind) {
  if (kind === 'desktop') {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="12" rx="2"></rect>
      <path d="M8 20h8"></path>
      <path d="M12 16v4"></path>
    </svg>`;
  }

  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="7" y="2" width="10" height="20" rx="2"></rect>
    <path d="M11 18h2"></path>
  </svg>`;
}

function getDisplayUserFields(u) {
  const candidates = [
    ['UUID', u.uuid],
    ['ID', u.id],
    ['Короткий ID', u.shortUuid],
    ['Статус', localizeStatus(u.status)],
    ['Описание', u.description],
    ['Email', u.email],
    ['Telegram ID', u.telegramId],
    ['Тег', u.tag],
    ['Лимит трафика', formatMaybeBytes(u.trafficLimitBytes ?? u.trafficLimit)],
    ['Использовано трафика', formatMaybeBytes(u.usedTrafficBytes ?? u.usedTraffic ?? u.userTraffic?.usedTrafficBytes)],
    ['Дата создания', fmtDateTime(u.createdAt)],
    ['Обновлён', fmtDateTime(u.updatedAt)],
    ['Последний онлайн', fmtDateTime(u.onlineAt || u.lastSeen || u.lastConnectedAt)],
    ['Последняя нода', u.lastConnectedNodeUuid],
    ['Ссылка подписки', u.subscriptionUrl],
  ];

  // Пропускаем только ключи, уже показанные в candidates (чтобы не дублировать)
  const skipKeys = new Set([
    'uuid', 'id', 'shortUuid', 'shortUserUuid', 'username', 'name',
    'status', 'email', 'description', 'tag', 'telegramId',
    'createdAt', 'updatedAt', 'onlineAt', 'lastSeen', 'lastConnectedAt',
    'lastConnectedNodeUuid', 'subscriptionUrl',
    'trafficLimitBytes', 'trafficLimit', 'usedTrafficBytes', 'usedTraffic',
  ]);

  const used = new Set(candidates.map(([label]) => label));
  const fields = candidates
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => ({ label, value }));

  for (const [key, value] of Object.entries(u)) {
    if (fields.length >= 28) break;
    if (key.startsWith('_') || value === null || value === undefined || typeof value === 'object') continue;
    if (skipKeys.has(key)) continue;
    const label = localizeFieldName(key);
    if (used.has(label)) continue;
    used.add(label);
    fields.push({ label, value });
  }

  return fields;
}

function localizeFieldName(key) {
  const map = {
    username: 'Имя пользователя',
    name: 'Имя',
    status: 'Статус',
    expireAt: 'Активен до',
    subscriptionExpireAt: 'Подписка до',
    createdAt: 'Дата создания',
    updatedAt: 'Обновлен',
    hwidDeviceLimit: 'Лимит устройств',
    hwidDevicesLimit: 'Лимит устройств',
    trafficLimitBytes: 'Лимит трафика',
    usedTrafficBytes: 'Использовано трафика',
    lastTrafficResetAt: 'Последний сброс трафика',
    telegramId: 'Telegram ID',
    description: 'Описание',
    tag: 'Тег'
  };
  return map[key] || key;
}

function findUserByAnyKey(key) {
  const wanted = String(key || '');
  if (!wanted) return null;
  return state.users.find(u => getUserAliases(u).includes(wanted)) || null;
}

function getDevicesForUser(u) {
  const keys = getUserAliases(u);
  const direct = findDevicesByAliases(keys);
  if (direct) return direct;

  const top = state.hwidTop.find(t => {
    const topKeys = getUserAliases(t);
    return topKeys.some(key => keys.includes(key)) || (t.username && u.username && t.username === u.username);
  });

  if (top) {
    const topDevices = findDevicesByAliases(getUserAliases(top));
    if (topDevices) return topDevices;
  }

  return [];
}

function findDevicesByAliases(keys) {
  let emptyHit = null;
  for (const key of keys) {
    const devices = state.hwidDevices[key];
    if (!Array.isArray(devices)) continue;
    if (devices.length > 0) return devices;
    if (!emptyHit) emptyHit = devices;
  }
  return emptyHit;
}

function getTrafficInfo(u) {
  const used = Number(
    u.usedTrafficBytes ??
    u.usedTraffic ??
    u.trafficUsed ??
    u.userTraffic?.usedTrafficBytes ??
    u.userTraffic?.usedBytes ??
    0
  );
  const limit = Number(u.trafficLimitBytes ?? u.trafficLimit ?? u.userTraffic?.trafficLimitBytes ?? 0);
  if (!used && !limit) return '—';
  return `${formatBytes(used)}${limit ? ' / ' + formatBytes(limit) : ''}`;
}

function getSubscriptionInfo(u) {
  const expire = u.expireAt || u.subscriptionExpireAt || u.expiresAt || u.validUntil;
  if (!expire) return '—';
  const time = new Date(expire).getTime();
  if (!Number.isFinite(time)) return fmtDate(expire) || String(expire);
  const days = Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'истекла';
  return `${days} дн.`;
}

function fmtDateTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('ru', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return d;
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }
  if (minutes > 0) return `${minutes} мин ${seconds} сек`;
  return `${seconds} сек`;
}

function ipGeoLabel(geo) {
  if (!geo) return '';
  const location = [geo.countryCode, geo.city].filter(Boolean).join(' ');
  const network = geo.asn ? `AS${geo.asn}` : (geo.org || geo.isp || '');
  return [location, network].filter(Boolean).join(' · ');
}

function getProxyBadge(ip) {
  if (!ip || !state.data || !state.data.proxyData) return '';
  const info = state.data.proxyData[ip];
  if (!info) return '';
  if (info.isTor) return '<span class="proxy-badge proxy-tor" title="Tor">🧅 Tor</span>';
  if (info.isProxy) return '<span class="proxy-badge proxy-proxy" title="Proxy">🔀 Proxy</span>';
  if (info.isVPN) return `<span class="proxy-badge proxy-vpn" title="${esc(info.provider || 'VPN')}">🛡 VPN</span>`;
  return '';
}

function formatMaybeBytes(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return formatBytes(num);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// ─── HWID Tab ─────────────────────────────────────────────────────
function renderHwid() {
  const users = state.hwidTop;
  const el = document.getElementById('hwid-list');
  if (users.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>Нет данных HWID</p></div>';
    return;
  }
  el.innerHTML = users.map(u => hwidUserCardHtml(u)).join('');
}

function hwidUserCardHtml(u) {
  const name = u.username || u.name || 'Unknown';
  const uuid = u.userUuid || u.uuid || u.id;
  const fullUser = findUserByAnyKey(uuid) || u;
  const devices = getDevicesForUser(fullUser);
  const count = u.devicesCount || u.count || devices.length;
  const id = 'hwid-' + uuid;
  const initials = name.substring(0,2).toUpperCase();
  const cardKey = getUserKey(fullUser) || uuid;

  const devicesHtml = devices.length > 0 ? `<div class="hwid-devices-grid">${devices.map(d => deviceCardHtml(d)).join('')}</div>` :
    `<p style="padding:0 18px 14px;font-size:12px;color:var(--text3)">Нет данных устройств</p>`;

  return `<div class="hwid-user-card">
    <div class="hwid-user-header" onclick="toggleExpand('${id}')">
      <div class="session-user">
        <div class="user-avatar">${initials}</div>
        <div class="user-meta">
          <div class="user-username">${esc(name)}</div>
          <div class="user-sub">${count} устройств</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="hwid-count-badge ${count>=5?'danger':count>=3?'warn':''}">${count}</span>
        <button class="btn-icon" onclick="event.stopPropagation(); openUserCard('${escAttr(cardKey)}')" title="Карточка пользователя">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>
        <svg class="expand-arrow" id="arrow-${id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>
    <div class="session-body" id="${id}">${devicesHtml}</div>
  </div>`;
}

function deviceCardHtml(d) {
  const info = getDeviceInfo(d);
  return `<div class="device-card">
    <div class="device-head">
      <div class="device-kind device-kind-${escAttr(info.kind)}">${deviceIconSvg(info.kind)}</div>
      <div class="device-main">
        <div class="device-os">${esc(info.title)}</div>
        ${info.subtitle ? `<div class="device-model">${esc(info.subtitle)}</div>` : ''}
      </div>
    </div>
    ${info.hwid ? `<div class="device-hwid">${esc(info.hwid)}</div>` : ''}
    ${info.date ? `<div class="device-date">Добавлено: ${esc(fmtDate(info.date) || info.date)}</div>` : ''}
  </div>`;
}

// ─── Suspects ─────────────────────────────────────────────────────

// Глобальный дефолт — меняй если у тебя другой HWID_FALLBACK_DEVICE_LIMIT
const GLOBAL_HWID_FALLBACK = 2;

// Базовый порог IP = HWID лимит пользователя.
// Первый лишний IP считаем наблюдением, а не нарушением.
function getIpThreshold(hwidLimit) {
  return hwidLimit;
}

// Официальное поле Remnawave: hwidDeviceLimit (number | null)
// null = лимит не задан индивидуально → используем глобальный дефолт
function getUserHwidLimit(u) {
  const val = u.hwidDeviceLimit ?? u.hwidDevicesLimit ?? null;
  if (val !== null && val !== undefined && !isNaN(Number(val))) return Number(val);
  return GLOBAL_HWID_FALLBACK;
}

// Пользователь считается неактивным если у него неактивный статус
// И он не был онлайн более 7 дней.
const INACTIVE_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;
function isUserInactive(u) {
  const status = String(u.status || '').toLowerCase();
  if (status === 'disabled' || status === 'expired' || status === 'limited') {
    return true;
  }
  // Если у пользователя есть активные IP — он точно активен
  if (getActiveIpKey(u)) return false;
  const lastOnline = u.onlineAt || u.lastSeen || u.lastConnectedAt || u.updatedAt;
  if (lastOnline) {
    const time = new Date(lastOnline).getTime();
    if (Number.isFinite(time) && Date.now() - time > INACTIVE_OFFLINE_MS) {
      return true;
    }
  }
  return false;
}

function getSuspects() {
  const seen   = new Set();
  const result = [];

  // 1. HWID: устройств больше чем лимит
  for (const topUser of state.hwidTop) {
    const key  = topUser.userUuid || topUser.uuid || topUser.id || topUser.username;
    if (!key || seen.has(key)) continue;

    const full = state.users.find(u =>
      (u.uuid || u.id) === (topUser.userUuid || topUser.uuid || topUser.id) ||
      u.username === topUser.username
    ) || topUser;

    if (isUserInactive(full)) continue;

    const limit = getUserHwidLimit(full);
    // Используем реальное количество из hwidDevices (а не stale из top-users API)
    const devicesCount = hwidCountForUser(full) || topUser.devicesCount || topUser.count || 0;

    // 🔍 ДИАГНОСТИКА: показываем лимит каждого пользователя из top
    debugLog(`[HWID-check] ${full.username || key}: устройств=${devicesCount}, лимит=${limit}, hwidDeviceLimit=${full.hwidDeviceLimit}, hwidDevicesLimit=${full.hwidDevicesLimit}, подозрит=${devicesCount > limit}`);

    if (devicesCount > limit) {
      debugLog(`[Suspect] ${full.username || key}: HWID=${devicesCount} > лимит=${limit}`);
      seen.add(key);
      result.push({
        ...full,
        _hwidCount: devicesCount,
        _hwidLimit: limit,
        _excess: devicesCount - limit,
        _riskScore: Math.min(100, 60 + (devicesCount - limit) * 10),
        _reason: 'hwid_over_limit'
      });
    }
  }

  // Дополнительно: проверяем ВСЕХ активных пользователей с hwidDevices
  for (const u of state.users) {
    const key = u.uuid || u.id || u.username;
    if (!key || seen.has(key) || isUserInactive(u)) continue;

    const devicesCount = hwidCountForUser(u);
    if (devicesCount <= 0) continue;
    const limit = getUserHwidLimit(u);
    if (devicesCount > limit) {
      debugLog(`[Suspect-extra] ${u.username || key}: HWID=${devicesCount} > лимит=${limit}`);
      seen.add(key);
      result.push({
        ...u,
        _hwidCount: devicesCount,
        _hwidLimit: limit,
        _excess: devicesCount - limit,
        _riskScore: Math.min(100, 60 + (devicesCount - limit) * 10),
        _reason: 'hwid_over_limit'
      });
    }
  }

  // 2. Серверная детекция: если сервер пометил как suspect, а фронтенд не поймал
  if (state.detection && Array.isArray(state.detection.suspects)) {
    for (const serverSuspect of state.detection.suspects) {
      const sKey = serverSuspect.key;
      if (!sKey || seen.has(sKey)) continue;
      const u = state.users.find(usr => getUserAliases(usr).includes(sKey));
      if (!u || isUserInactive(u)) continue;
      seen.add(sKey);
      result.push({
        ...u,
        _riskScore: serverSuspect.riskScore || 0,
        _reason: serverSuspect.reason || 'server_detection',
        _serverLevel: serverSuspect.riskLevel,
        _serverSignals: serverSuspect.signals,
      });
    }
  }

  // Сортируем по превышению (самые злостные — наверху)
  return result.sort((a, b) => (b._riskScore || b._excess || b._ipCount || 0) - (a._riskScore || a._excess || a._ipCount || 0));
}

function isSuspicious(u) {
  const devicesCount = u._hwidCount || hwidCountForUser(u);
  const hwidLimit    = getUserHwidLimit(u);
  // Единственный критерий: HWID over limit (deterministic)
  if (devicesCount > hwidLimit) return true;
  // Серверная детекция: critical
  const serverResult = getServerDetectionForUser(u);
  if (serverResult && serverResult.riskLevel === 'critical') return true;
  return false;
}

function isUnderObservation(u) {
  const devicesCount = u._hwidCount || hwidCountForUser(u);
  const hwidLimit = getUserHwidLimit(u);
  if (devicesCount > hwidLimit) return false;
  // Серверная детекция: warning (churn, 24/7)
  const serverResult = getServerDetectionForUser(u);
  if (serverResult && serverResult.riskLevel === 'warning') return true;
  // Фронтенд fallback: HWID churn
  const leakRisk = getKeyLeakRisk(u);
  return leakRisk.level === 'warning';
}

// Ищет пользователя в серверных результатах детекции
function getServerDetectionForUser(u) {
  if (!state.detection) return null;
  const aliases = getUserAliases(u);
  const lists = [...(state.detection.suspects || []), ...(state.detection.observed || [])];
  return lists.find(s => aliases.includes(s.key)) || null;
}

function renderSuspects() {
  const suspects = _cachedSuspects || getSuspects();
  updateSuspectStreak(suspects); // Обновляем историю
  const el = document.getElementById('suspects-list');
  if (suspects.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg><p>Подозрительных пользователей не обнаружено</p></div>`;
  } else {
    // Build pattern clusters from relations data
    const clusters = buildSuspectClusters(suspects);
    let html = '';

    if (clusters.length > 0) {
      html += `<div class="clusters-header">${IC.link} <span>Кластеры нарушений</span><span class="section-badge">${clusters.length}</span></div>`;
      html += clusters.map(cl => clusterGroupHtml(cl)).join('');
    }

    // Unclustered suspects
    const clusteredKeys = new Set(clusters.flatMap(c => c.members.map(m => getUserKey(m))));
    const unclustered = suspects.filter(s => !clusteredKeys.has(getUserKey(s)));
    if (unclustered.length > 0) {
      if (clusters.length > 0) {
        html += `<div class="clusters-header" style="margin-top:20px">${IC.users} <span>Остальные подозрительные</span><span class="section-badge">${unclustered.length}</span></div>`;
      }
      html += `<div class="sus-grid">${unclustered.map(u => suspectCardHtml(u)).join('')}</div>`;
    }

    el.innerHTML = html;
  }
}

// Build clusters: group suspects who share HWID/IP patterns
function buildSuspectClusters(suspects) {
  const graph = state.data && state.data.relations;
  if (!graph) return [];

  const suspectKeys = new Set(suspects.map(s => getUserKey(s)));
  const clusters = [];

  // HWID clusters (most important — same device)
  for (const cl of (graph.hwidClusters || [])) {
    const members = (cl.users || [])
      .filter(u => {
        const found = suspects.find(s => getUserAliases(s).includes(u.key));
        return !!found;
      })
      .map(u => suspects.find(s => getUserAliases(s).includes(u.key)))
      .filter(Boolean);

    if (members.length >= 2) {
      clusters.push({
        type: 'hwid',
        label: `Общее устройство: ${shortToken(cl.hwid || '')}`,
        detail: cl.deviceInfo ? [cl.deviceInfo.os, cl.deviceInfo.model].filter(Boolean).join(' · ') : '',
        severity: 'critical',
        members,
        raw: cl,
      });
    }
  }

  // IP clusters
  for (const cl of (graph.ipClusters || [])) {
    const members = (cl.users || [])
      .filter(u => {
        const found = suspects.find(s => getUserAliases(s).includes(u.key));
        return !!found;
      })
      .map(u => suspects.find(s => getUserAliases(s).includes(u.key)))
      .filter(Boolean);

    if (members.length >= 2) {
      // Skip if these members already appear together in an HWID cluster
      const memberKeys = new Set(members.map(m => getUserKey(m)));
      const alreadyClustered = clusters.some(c =>
        c.type === 'hwid' && c.members.every(m => memberKeys.has(getUserKey(m)))
      );
      if (alreadyClustered) continue;

      const geo = cl.geo || {};
      clusters.push({
        type: 'ip',
        label: `Общий IP: ${cl.ip}`,
        detail: [geo.countryCode, geo.org || geo.isp, geo.asn ? `AS${geo.asn}` : ''].filter(Boolean).join(' · '),
        severity: 'high',
        members,
        raw: cl,
      });
    }
  }

  return clusters;
}

function clusterGroupHtml(cluster) {
  const severityCls = cluster.severity === 'critical' ? 'cluster-group-critical' : 'cluster-group-high';
  const typeIcon = cluster.type === 'hwid' ? IC.hwid : IC.globe;

  return `<div class="cluster-group ${severityCls}">
    <div class="cluster-group-header">
      <div class="cluster-group-title">
        <span class="cluster-group-icon">${typeIcon}</span>
        <span>${esc(cluster.label)}</span>
        <span class="cluster-group-count">${cluster.members.length} акк.</span>
      </div>
      ${cluster.detail ? `<div class="cluster-group-detail">${esc(cluster.detail)}</div>` : ''}
    </div>
    <div class="sus-grid">${cluster.members.map(u => suspectCardHtml(u)).join('')}</div>
  </div>`;
}

function suspectCardHtml(u) {
  const name = u.username || u.name || 'Unknown';
  const initials = name.substring(0, 2).toUpperCase();
  const ipDetails = getIpDetails(u);
  const hwid = u._hwidCount || hwidCountForUser(u);
  const limit = u._hwidLimit || getUserHwidLimit(u);
  const cardKey = getUserKey(u);
  const serverResult = getServerDetectionForUser(u);
  const riskScore = serverResult ? (serverResult.riskScore || 0) : (u._riskScore || 0);
  const hwidOver = hwid > limit;
  const riskLevel = serverResult ? (serverResult.riskLevel || 'clean') : (hwidOver ? 'critical' : 'clean');

  // Reasons (short chips)
  const reasons = [];
  if (hwidOver) reasons.push({text: `HWID ${hwid} > ${limit}`, cls: 'red'});
  if (serverResult && serverResult.signals) {
    serverResult.signals.slice(0, 3).forEach(s => {
      const cls = s.category === 'deterministic' ? 'red' : s.category === 'strong' ? 'yellow' : 'gray';
      const text = (s.reason || s.id || '').length > 30 ? (s.reason || s.id).substring(0, 27) + '…' : (s.reason || s.id);
      reasons.push({text, cls});
    });
  }

  // IPs (max 3)
  const ipsHtml = ipDetails.slice(0, 3).map(d => {
    const geo = d.geo ? (d.geo.countryCode || '') : '';
    return `<span class="susc-ip">${esc(d.ip)}${geo ? ` <em>${esc(geo)}</em>` : ''}</span>`;
  }).join('');
  const moreIps = ipDetails.length > 3 ? `<span class="susc-ip susc-more">+${ipDetails.length - 3}</span>` : '';

  const riskCls = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'mid' : 'low';

  return `<div class="susc" onclick="openUserCard('${escAttr(cardKey)}')">
    <div class="susc-accent"></div>
    <div class="susc-head">
      <div class="sc-avatar danger-avatar">${initials}</div>
      <div class="susc-user">
        <div class="susc-name">${esc(name)}</div>
        <span class="susc-badge">${esc(u.status || 'ACTIVE')}</span>
      </div>
    </div>
    <div class="susc-stats">
      <span class="${hwidOver ? 'susc-stat-over' : ''}"><b>${hwid}</b>/${limit} HWID</span>
      <span><b>${ipDetails.length}</b> IP</span>
      <span class="${riskScore >= 50 ? 'susc-stat-over' : ''}"><b>${riskScore}</b> риск</span>
    </div>
    <div class="susc-bar"><div class="susc-bar-fill susc-bar-${riskCls}" style="width:${Math.min(100, riskScore)}%"></div></div>
    ${reasons.length > 0 ? `<div class="susc-chips">${reasons.map(r => `<span class="susc-chip susc-chip-${r.cls}">${esc(r.text)}</span>`).join('')}</div>` : ''}
    ${ipDetails.length > 0 ? `<div class="susc-ips">${ipsHtml}${moreIps}</div>` : ''}
  </div>`;
}

// ─── Incident Center ───────────────────────────────────────────────
const INCIDENT_STATUS_LABELS = {
  new: 'Новый',
  reviewing: 'В работе',
  warned: 'Предупреждён',
  resolved: 'Закрыт',
  false_positive: 'Ложное',
  banned: 'Бан',
};

const INCIDENT_REASON_LABELS = {
  hwid_over_limit: 'Превышен лимит HWID-устройств',
  hwid_churn_high: 'Частая ротация устройств',
  hwid_churn_moderate: 'Повышенная ротация устройств',
  temporal_247: 'Активность почти 24/7',
  server_detection: 'Сработала серверная детекция',
  simultaneous_distinct_networks: 'Одновременные разные сети (IP overlap)',
  extracted_key_suspected: 'Подозрение на извлечённый ключ',
  multi_node_simultaneous: 'Мульти-нодовое использование (сверх лимита)',
  schedule_pattern: 'Паттерн по расписанию (разные ASN по времени суток)',
};

function incidentRiskLabel(score) {
  const risk = Number(score || 0);
  if (risk >= 60) return 'критический';
  if (risk >= 20) return 'внимание';
  return 'чисто';
}

function incidentReasonItems(reason) {
  const raw = String(reason || '').trim();
  if (!raw) return [{ label: 'Причина не указана', detail: '' }];
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => ({
      label: humanIncidentReason(item),
      detail: item,
    }));
}

function humanIncidentReason(value) {
  const key = String(value || '').trim();
  if (INCIDENT_REASON_LABELS[key]) return INCIDENT_REASON_LABELS[key];
  const normalized = key.toLowerCase();
  if (normalized.includes('hwid') && normalized.includes('лимит')) return 'Превышен лимит HWID-устройств';
  if (normalized.includes('hwid')) return 'Подозрительная активность устройств';
  if (normalized.includes('network') || normalized.includes('сет')) return 'Необычно много разных сетей';
  if (normalized.includes('asn') || normalized.includes('провайдер')) return 'Необычно много провайдеров/ASN';
  if (normalized.includes('country') || normalized.includes('стран')) return 'Необычная география подключений';
  if (normalized.includes('traffic') || normalized.includes('трафик')) return 'Аномальный трафик';
  if (normalized.includes('ip')) return 'Подозрительная IP-активность';
  return key.replace(/_/g, ' ');
}

function filterIncidents(filter, btn) {
  state.incidentFilter = filter || 'open';
  document.querySelectorAll('[data-incident-filter]').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderIncidents();
}

function renderIncidents() {
  const el = document.getElementById('incidents-list');
  if (!el) return;
  const incidents = ((state.data && state.data.incidents) || []).filter(incidentMatchesFilter);
  const stats = (state.data && state.data.incidentStats) || {};
  const badge = document.getElementById('incidents-badge');
  const openCount = Number(stats.open || 0);
  if (badge) {
    if (openCount > 0) {
      badge.textContent = openCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  const statsEl = document.getElementById('incident-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span><b>${stats.open || 0}</b> открытых</span>
      <span><b>${stats.new || 0}</b> новых</span>
      <span><b>${stats.warned || 0}</b> предупреждены</span>
    `;
  }

  if (incidents.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>Инцидентов в выбранном фильтре нет</p></div>';
    return;
  }
  el.innerHTML = `<div class="incident-table-wrap">
    <table class="incident-table">
      <thead><tr>
        <th>Пользователь</th>
        <th>Причина</th>
        <th>Риск</th>
        <th>Статус</th>
        <th>Последнее</th>
        <th>Действие</th>
      </tr></thead>
      <tbody>${incidents.map(incidentRowHtml).join('')}</tbody>
    </table>
  </div>`;
}

function incidentMatchesFilter(item) {
  const filter = state.incidentFilter || 'open';
  if (filter === 'all') return true;
  if (filter === 'open') return !['resolved', 'false_positive', 'banned'].includes(item.status);
  if (filter === 'closed') return ['resolved', 'false_positive', 'banned'].includes(item.status);
  return item.status === filter;
}

function incidentRowHtml(item) {
  const user = findUserByAnyKey(item.userKey);
  const name = item.username || (user && (user.username || user.name)) || item.userKey;
  const risk = Number(item.riskScore || 0);
  const riskCls = risk >= 80 ? 'risk-critical' : risk >= 60 ? 'risk-high' : risk >= 40 ? 'risk-warn' : 'risk-info';
  const status = item.status || 'new';
  const statusLabel = INCIDENT_STATUS_LABELS[status] || status;
  const lastSeen = item.lastSeen ? fmtDateTime(item.lastSeen) : '—';
  const reasonItems = incidentReasonItems(item.reason);
  const comment = item.operatorComment || '';
  const initials = name.substring(0, 2).toUpperCase();

  return `<tr class="incident-row incident-row-${escAttr(status)}" data-userkey="${escAttr(item.userKey)}">
    <td class="incident-td-user">
      <div class="incident-user-cell">
        <div class="sc-avatar ${risk >= 60 ? 'danger-avatar' : risk >= 30 ? 'warning-avatar' : ''}" style="width:30px;height:30px;font-size:11px;border-radius:8px">${esc(initials)}</div>
        <div>
          <div class="incident-cell-name" onclick="openUserCard('${escAttr(item.userKey)}')">${esc(name)}</div>
          <code class="incident-cell-key">${esc(item.userKey.slice(0, 12))}…</code>
        </div>
      </div>
    </td>
    <td class="incident-td-reason">
      <div class="incident-reason-chips">${reasonItems.map(r => `<span class="incident-reason-chip" title="${escAttr(r.detail)}">${esc(r.label)}</span>`).join('')}</div>
    </td>
    <td class="incident-td-risk">
      <div class="incident-risk-cell ${riskCls}">
        <span class="incident-risk-num">${risk}</span>
        <div class="incident-risk-bar"><div class="incident-risk-fill" style="width:${Math.min(100, risk)}%"></div></div>
      </div>
    </td>
    <td><span class="incident-status incident-status-${escAttr(status)}">${esc(statusLabel)}</span></td>
    <td class="incident-td-time">${esc(lastSeen)}</td>
    <td class="incident-td-actions">
      <select class="incident-select" onchange="updateIncidentStatus('${escAttr(item.userKey)}', this.value)">
        ${Object.entries(INCIDENT_STATUS_LABELS).map(([value, label]) =>
          `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
      <button class="btn-sm" onclick="openUserCard('${escAttr(item.userKey)}')">${IC._s('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 14)}</button>
    </td>
  </tr>
  ${comment ? `<tr class="incident-comment-row"><td colspan="6"><div class="incident-comment-preview">${esc(comment.slice(0, 80))}${comment.length > 80 ? '…' : ''}</div></td></tr>` : ''}`;
}

async function updateIncidentStatus(userKey, status) {
  const resolutionReason = ['resolved', 'false_positive', 'banned'].includes(status)
    ? (INCIDENT_STATUS_LABELS[status] || status)
    : '';
  try {
    const res = await fetch('/api/incident', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ userKey, status, resolutionReason }),
    });
    const data = await readJsonSafe(res);
    if (res.status === 401) { await handleAuthExpired(); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    toast('Статус инцидента обновлён', 'success');
    await loadAll();
  } catch (e) {
    toast(`Ошибка инцидента: ${e.message}`, 'error');
  }
}

let _incidentCommentTimer = null;
function saveIncidentComment(userKey, text) {
  clearTimeout(_incidentCommentTimer);
  _incidentCommentTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/incident', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ userKey, operatorComment: text }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (state.data && Array.isArray(state.data.incidents)) {
        const item = state.data.incidents.find(i => i.userKey === userKey);
        if (item) item.operatorComment = text;
      }
    } catch (e) {
      toast(`Ошибка комментария: ${e.message}`, 'error');
    }
  }, 400);
}

// ─── Relation Graph ────────────────────────────────────────────────
function renderRelations() {
  const el = document.getElementById('relations-content');
  if (!el) return;
  const graph = state.data && state.data.relations;
  const summary = graph && graph.summary || {};
  const summaryEl = document.getElementById('relations-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span><b>${summary.sharedIps || 0}</b> IP</span>
      <span><b>${summary.sharedAsns || 0}</b> ASN</span>
      <span><b>${summary.sharedHwids || 0}</b> HWID</span>
    `;
  }
  if (!graph || (!graph.ipClusters?.length && !graph.asnClusters?.length && !graph.hwidClusters?.length)) {
    el.innerHTML = '<div class="empty-state"><p>Пересечений за 30 минут не найдено</p></div>';
    return;
  }

  el.innerHTML = `
    ${relationSectionHtml('Общие IP', graph.ipClusters || [], 'ip')}
    ${relationSectionHtml('Общие ASN', graph.asnClusters || [], 'asn')}
    ${relationSectionHtml('Общие HWID', graph.hwidClusters || [], 'hwid')}
  `;
}

function relationSectionHtml(title, items, type) {
  if (!items.length) return '';
  return `<div class="relation-section">
    <div class="section-header"><h3>${esc(title)}</h3><span class="section-badge">${items.length}</span></div>
    <div class="relation-grid">${items.map(item => relationCardHtml(item, type)).join('')}</div>
  </div>`;
}

function relationCardHtml(item, type) {
  let title = '';
  let meta = '';
  let deviceBadge = '';
  if (type === 'ip') {
    const geo = item.geo || {};
    title = item.ip;
    meta = [geo.countryCode || geo.country || '', geo.asn ? `AS${geo.asn}` : '', geo.org || geo.isp || ''].filter(Boolean).join(' · ');
  } else if (type === 'asn') {
    title = item.asn ? `AS${item.asn}` : 'ASN';
    meta = [item.org, `${item.ipCount || 0} IP`, item.country].filter(Boolean).join(' · ');
  } else {
    title = shortToken(item.hwid || '');
    const di = item.deviceInfo;
    if (di && (di.os || di.model)) {
      const parts = [di.os, di.model].filter(Boolean);
      deviceBadge = `<div class="cluster-device-info">${deviceIconSvg(getDeviceKind(parts.join(' ')))} <span>${esc(parts.join(' · '))}</span></div>`;
    }
    meta = item.lastSeen ? `последний раз ${fmtDateTime(item.lastSeen)}` : '';
  }

  const users = (item.users || []).map(user => {
    const limitInfo = type === 'hwid' && user.hwidLimit ? ` <span class="cluster-user-limit">лимит ${user.hwidLimit}</span>` : '';
    return `<button class="relation-user" onclick="openUserCard('${escAttr(user.key)}')">${esc(user.name || user.key)}${limitInfo}</button>`;
  }).join('');

  const ips = type === 'asn' && item.ips && item.ips.length
    ? `<div class="relation-ips">${item.ips.slice(0, 8).map(ip => `<code>${esc(ip)}</code>`).join('')}</div>`
    : '';

  const clusterWarn = type === 'hwid' && item.userCount >= 2
    ? `<div class="cluster-warning">${IC._s('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 14)} ${item.userCount} аккаунта — одно устройство</div>`
    : '';

  return `<div class="relation-card relation-${type}${type === 'hwid' ? ' cluster-card' : ''}">
    <div class="relation-card-head">
      <code>${esc(title)}</code>
      <span>${item.userCount || (item.users || []).length} акк.</span>
    </div>
    ${deviceBadge}
    ${meta ? `<div class="relation-meta">${esc(meta)}</div>` : ''}
    ${clusterWarn}
    <div class="relation-users">${users}</div>
    ${ips}
  </div>`;
}


// ─── Filters & Sort ───────────────────────────────────────────────
function filterSessions(f, btn) {
  state.sessionFilter = f;
  document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderSessions();
}

function sortSessions(v) {
  state.sessionSort = v;
  renderSessions();
}

function filterHwid(q) {
  const cards = document.querySelectorAll('.hwid-user-card');
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q.toLowerCase()) ? '' : 'none';
  });
}

function onSearch(q) {
  state.searchQuery = q;
  renderSessions();
}

// ─── Tab Switching ────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  const titles = {
    dashboard: 'Дашборд',
    sessions: 'Активные сессии',
    suspects: 'Подозрительные пользователи',
    incidents: 'Центр инцидентов',
    relations: 'Граф связей',
    rules: 'Движок правил',
  };
  document.getElementById('page-title').textContent = titles[name] || name;
  closeSidebarIfMobile();
  if (name === 'rules') loadRulesTab();
}

// ─── Helpers ─────────────────────────────────────────────────────

// Возвращает строки IP (для подсчёта и сравнения с лимитом)
function getIps(u) {
  return getIpDetails(u).map(d => d.ip);
}

function getUserKey(u) {
  if (!u) return '';
  return String(u.userUuid || u.uuid || u.id || u.userId || u.username || u.name || '');
}

function getUserAliases(u) {
  if (!u) return [];
  return Array.from(new Set([
    getUserKey(u),
    u.userUuid,
    u.uuid,
    u.id,
    u.userId,
    u.shortUuid,
    u.shortUserUuid,
    u.username,
    u.name
  ]
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(String)));
}

function getActiveIpKey(u) {
  const activeIps = getActiveIpsSource();
  return getUserAliases(u).find(k => activeIps[k] && activeIps[k].length > 0) || '';
}

// Возвращает [{ip, lastSeen, stable}] — для отображения
function getIpDetails(u) {
  const keys = getUserAliases(u);
  const activeIps = getActiveIpsSource();

  for (const k of keys) {
    const objs = activeIps[k];
    if (objs && objs.length > 0) {
      // Получаем стабильные IP из истории
      const stableIps = getStableIps(k);
      const stableSet = new Set(stableIps);
      const hasHistory = state.ipHistory.some(snap => snap.ips && snap.ips[k]);
      return objs.map(o => ({
        ip:       typeof o === 'string' ? o : o.ip,
        lastSeen: typeof o === 'string' ? null : o.lastSeen,
        geo:      typeof o === 'string' ? null : o.geo || null,
        nodeUuid: typeof o === 'string' ? null : o.nodeUuid || null,
        stable:   hasHistory ? stableSet.has(typeof o === 'string' ? o : o.ip) : false,
        fresh:    isFreshLastSeen(typeof o === 'string' ? null : o.lastSeen)
      }));
    }
  }
  return [];
}

function isFreshLastSeen(lastSeen) {
  if (!lastSeen) return true;
  const time = new Date(lastSeen).getTime();
  if (!Number.isFinite(time)) return false;
  const selectedWindow = state.onlineWindow && state.onlineWindow !== 'live' ? Number(state.onlineWindow) : 0;
  const windowMs = selectedWindow > 0 ? selectedWindow * 60 * 1000 + 90 * 1000 : FRESH_IP_WINDOW_MS;
  return Date.now() - time <= windowMs;
}

// Форматирует lastSeen как "X сек назад" / "X мин назад"
function fmtLastSeen(lastSeen) {
  if (!lastSeen) return null;
  const diff = Math.floor((Date.now() - new Date(lastSeen)) / 1000);
  if (diff < 60)  return { text: `${diff} сек назад`, level: 'hot' };    // < 1 мин
  if (diff < 300) return { text: `${Math.floor(diff/60)} мин назад`, level: 'warm' }; // < 5 мин
  if (diff < 1800) return { text: `${Math.floor(diff/60)} мин назад`, level: 'cold' }; // < 30 мин
  return { text: `${Math.floor(diff/60)} мин назад`, level: 'dead' };
}

function ipCount(u) { return getIps(u).length; }

function hwidCountForUser(u) {
  const devices = getDevicesForUser(u);
  if (devices.length > 0) return devices.length;

  const keys = getUserAliases(u);
  const top = state.hwidTop.find(t => {
    const topKeys = getUserAliases(t);
    return topKeys.some(key => keys.includes(key)) || (t.username && u.username && t.username === u.username);
  });
  if (top) return top.devicesCount || top.count || 0;
  return u.hwidDevicesCount || u.hwid_count || 0;
}

function hwidCount(u) { return hwidCountForUser(u); }

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(str) {
  return esc(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ru', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch { return d; }
}

function toast(msg, type = 'success') {
  const toastType = type === 'ok' ? 'success' : type;
  const el = document.createElement('div');
  el.className = `toast ${toastType}`;
  const icons = { success:'✅', error:'❌', warning:'⚠️' };
  el.innerHTML = `<span>${icons[toastType]||''}</span><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── Rule Engine UI ──────────────────────────────────────────────

const RULE_FIELDS = [
  { value: 'hwidCount', label: 'HWID (текущие)', type: 'number' },
  { value: 'hwidLimit', label: 'HWID лимит', type: 'number' },
  { value: 'ipCount', label: 'Кол-во IP', type: 'number' },
  { value: 'riskScore', label: 'Risk Score', type: 'number' },
  { value: 'trafficGB', label: 'Трафик (GB)', type: 'number' },
  { value: 'hwidChurn', label: 'HWID ротация (30д)', type: 'number' },
  { value: 'daysActive', label: 'Дней активен', type: 'number' },
  { value: 'isVPN', label: 'Есть VPN', type: 'boolean' },
  { value: 'isProxy', label: 'Есть Proxy', type: 'boolean' },
  { value: 'isTor', label: 'Есть Tor', type: 'boolean' },
  { value: 'isSuspect', label: 'Подозрительный', type: 'boolean' },
];

const RULE_OPS = {
  number: [
    { value: '>', label: '>' },
    { value: '>=', label: '≥' },
    { value: '<', label: '<' },
    { value: '<=', label: '≤' },
    { value: '==', label: '=' },
    { value: '!=', label: '≠' },
  ],
  boolean: [
    { value: 'is_true', label: 'Да' },
    { value: 'is_false', label: 'Нет' },
  ],
};

let _rulesCache = [];

async function loadRulesTab() {
  try {
    const res = await fetch('/api/rules', { credentials: 'same-origin' });
    const data = await res.json();
    _rulesCache = data.rules || [];
    renderRulesList(_rulesCache);

    // Badge
    const badge = document.getElementById('rules-badge');
    if (badge) {
      if (data.unacknowledgedCount > 0) {
        badge.textContent = data.unacknowledgedCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Load triggers
    const trigRes = await fetch('/api/rule/triggers', { credentials: 'same-origin' });
    const trigData = await trigRes.json();
    renderTriggersList(trigData.triggers || []);
  } catch (e) {
    console.error('[rules] load error:', e);
  }
}

function renderRulesList(rules) {
  const el = document.getElementById('rules-list');
  if (!el) return;
  if (rules.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>Правила не созданы. Нажмите «+ Новое правило» для начала.</p></div>';
    return;
  }

  el.innerHTML = rules.map(r => {
    const condText = r.conditions.map(c => {
      const field = RULE_FIELDS.find(f => f.value === c.field);
      const fieldLabel = field ? field.label : c.field;
      if (c.operator === 'is_true') return `${fieldLabel} = Да`;
      if (c.operator === 'is_false') return `${fieldLabel} = Нет`;
      return `${fieldLabel} ${c.operator} ${c.value}`;
    }).join(r.conditionLogic === 'OR' ? ' ИЛИ ' : ' И ');

    const lastTrigger = r.lastTriggeredAt ? fmtTimeAgo(r.lastTriggeredAt) : 'никогда';

    return `<div class="rule-card ${r.enabled ? '' : 'rule-disabled'}">
      <div class="rule-card-top">
        <div class="rule-card-info">
          <div class="rule-name">${esc(r.name)}</div>
          <div class="rule-conditions">${esc(condText) || 'Нет условий'}</div>
        </div>
        <div class="rule-card-actions">
          <label class="rule-toggle" title="${r.enabled ? 'Выключить' : 'Включить'}">
            <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="toggleRule('${esc(r.id)}', this.checked)">
            <span class="rule-toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="rule-card-bottom">
        <span class="rule-stat">${IC._s('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 12)} ${r.triggerCount} сраб.</span>
        <span class="rule-stat">${IC._s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 12)} ${lastTrigger}</span>
        <span class="rule-stat">${IC._s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 12)} ${r.cooldownHours}ч cooldown</span>
        <div class="rule-card-btns">
          <button class="btn-xs" onclick="testRule('${esc(r.id)}')">${IC._s('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>', 12)} Тест</button>
          <button class="btn-xs" onclick="openRuleEditor('${esc(r.id)}')">${IC._s('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 12)}</button>
          <button class="btn-xs btn-danger-xs" onclick="deleteRule('${esc(r.id)}')">${IC._s('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 12)}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderTriggersList(triggers) {
  const el = document.getElementById('rules-triggers-list');
  const countEl = document.getElementById('rules-triggers-count');
  if (!el) return;

  const unack = triggers.filter(t => !t.acknowledged);
  if (countEl) countEl.textContent = unack.length;

  if (triggers.length === 0) {
    el.innerHTML = '<div class="empty-state sm"><p>Нет срабатываний</p></div>';
    return;
  }

  el.innerHTML = triggers.slice(0, 20).map(t => {
    const time = fmtTimeAgo(t.triggeredAt);
    const conditions = (Array.isArray(t.conditionsMet) ? t.conditionsMet : []).join(', ');
    return `<div class="trigger-row ${t.acknowledged ? 'trigger-ack' : ''}">
      <div class="trigger-info">
        <span class="trigger-rule">${esc(t.ruleName)}</span>
        <span class="trigger-user" onclick="openUserCard('${escAttr(t.userKey)}')">${esc(t.userKey.slice(0, 8))}…</span>
        <span class="trigger-time">${time}</span>
      </div>
      <div class="trigger-conds">${esc(conditions)}</div>
      ${!t.acknowledged ? `<button class="btn-xs" onclick="ackTrigger(${t.id})">✓ OK</button>` : '<span class="trigger-ack-label">✓</span>'}
    </div>`;
  }).join('');
}

function fmtTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}м назад`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}ч назад`;
  return `${Math.floor(diff / 86400000)}д назад`;
}

async function toggleRule(ruleId, enabled) {
  try {
    await fetch('/api/rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: ruleId, enabled }),
    });
    loadRulesTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
}

async function deleteRule(ruleId) {
  if (!confirm('Удалить правило?')) return;
  try {
    await fetch('/api/rule', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: ruleId }),
    });
    toast('Правило удалено');
    loadRulesTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
}

async function testRule(ruleId) {
  try {
    const res = await fetch('/api/rule/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ruleId }),
    });
    const data = await res.json();
    if (data.total === 0) {
      toast(`Правило "${data.ruleName}": 0 совпадений`, 'warning');
    } else {
      const names = data.matches.slice(0, 5).map(m => m.userName).join(', ');
      toast(`Правило "${data.ruleName}": ${data.total} совпадений (${names}${data.total > 5 ? '…' : ''})`, 'success');
    }
  } catch (e) { toast('Ошибка теста: ' + e.message, 'error'); }
}

async function ackTrigger(triggerId) {
  try {
    await fetch('/api/rule/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ triggerId }),
    });
    loadRulesTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
}

function openRuleEditor(ruleId) {
  const existing = ruleId ? _rulesCache.find(r => r.id === ruleId) : null;
  const conditions = existing ? [...existing.conditions] : [{ field: 'hwidCount', operator: '>', value: '2' }];
  const name = existing ? existing.name : '';
  const logic = existing ? existing.conditionLogic : 'AND';
  const cooldown = existing ? existing.cooldownHours : 24;

  const conditionsHtml = () => conditions.map((c, i) => {
    const fieldType = (RULE_FIELDS.find(f => f.value === c.field) || {}).type || 'number';
    const ops = RULE_OPS[fieldType] || RULE_OPS.number;
    return `<div class="rule-cond-row" data-idx="${i}">
      <select class="rule-field" onchange="ruleCondFieldChanged(this, ${i})">
        ${RULE_FIELDS.map(f => `<option value="${f.value}" ${f.value === c.field ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
      <select class="rule-op" data-idx="${i}">
        ${ops.map(o => `<option value="${o.value}" ${o.value === c.operator ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
      ${fieldType === 'boolean' ? '' : `<input class="rule-val" type="text" value="${esc(String(c.value || ''))}" placeholder="значение" data-idx="${i}">`}
      <button class="btn-xs btn-danger-xs" onclick="removeRuleCond(${i})">✕</button>
    </div>`;
  }).join('');

  const modalHtml = `<div class="rule-editor-overlay" id="rule-editor-overlay" onclick="closeRuleEditor(event)">
    <div class="rule-editor" onclick="event.stopPropagation()">
      <h3>${existing ? 'Редактирование' : 'Новое правило'}</h3>
      <div class="rule-editor-field">
        <label>Название</label>
        <input type="text" id="rule-name" value="${esc(name)}" placeholder="Название правила">
      </div>
      <div class="rule-editor-field">
        <label>Условия <small>(${logic === 'OR' ? 'любое' : 'все'})</small></label>
        <div class="rule-logic-toggle">
          <button class="btn-xs ${logic === 'AND' ? 'active' : ''}" onclick="setRuleLogic('AND')">Все (AND)</button>
          <button class="btn-xs ${logic === 'OR' ? 'active' : ''}" onclick="setRuleLogic('OR')">Любое (OR)</button>
        </div>
        <div id="rule-conditions">${conditionsHtml()}</div>
        <button class="btn-xs" onclick="addRuleCond()">+ Условие</button>
      </div>
      <div class="rule-editor-field">
        <label>Cooldown (часов)</label>
        <input type="number" id="rule-cooldown" value="${cooldown}" min="1" max="720">
      </div>
      <div class="rule-editor-actions">
        <button class="btn-secondary" onclick="closeRuleEditor()">Отмена</button>
        <button class="btn-primary" onclick="saveRule('${ruleId || ''}')">${existing ? 'Сохранить' : 'Создать'}</button>
      </div>
    </div>
  </div>`;

  // Remove existing overlay
  const old = document.getElementById('rule-editor-overlay');
  if (old) old.remove();

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Store conditions in window for manipulation
  window._ruleEditorConditions = conditions;
  window._ruleEditorLogic = logic;
}

function setRuleLogic(logic) {
  window._ruleEditorLogic = logic;
  document.querySelectorAll('.rule-logic-toggle .btn-xs').forEach(b => {
    b.classList.toggle('active', b.textContent.includes(logic));
  });
}

function addRuleCond() {
  window._ruleEditorConditions.push({ field: 'hwidCount', operator: '>', value: '2' });
  refreshRuleConditions();
}

function removeRuleCond(idx) {
  window._ruleEditorConditions.splice(idx, 1);
  refreshRuleConditions();
}

function ruleCondFieldChanged(select, idx) {
  const field = RULE_FIELDS.find(f => f.value === select.value);
  if (field && field.type === 'boolean') {
    window._ruleEditorConditions[idx].operator = 'is_true';
    window._ruleEditorConditions[idx].value = '';
  } else {
    window._ruleEditorConditions[idx].operator = '>';
    window._ruleEditorConditions[idx].value = '0';
  }
  window._ruleEditorConditions[idx].field = select.value;
  refreshRuleConditions();
}

function refreshRuleConditions() {
  const container = document.getElementById('rule-conditions');
  if (!container) return;
  const conds = window._ruleEditorConditions;
  container.innerHTML = conds.map((c, i) => {
    const fieldType = (RULE_FIELDS.find(f => f.value === c.field) || {}).type || 'number';
    const ops = RULE_OPS[fieldType] || RULE_OPS.number;
    return `<div class="rule-cond-row" data-idx="${i}">
      <select class="rule-field" onchange="ruleCondFieldChanged(this, ${i})">
        ${RULE_FIELDS.map(f => `<option value="${f.value}" ${f.value === c.field ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
      <select class="rule-op" data-idx="${i}">
        ${ops.map(o => `<option value="${o.value}" ${o.value === c.operator ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
      ${fieldType === 'boolean' ? '' : `<input class="rule-val" type="text" value="${esc(String(c.value || ''))}" placeholder="значение" data-idx="${i}">`}
      <button class="btn-xs btn-danger-xs" onclick="removeRuleCond(${i})">✕</button>
    </div>`;
  }).join('');
}

function closeRuleEditor(e) {
  if (e && e.target !== e.currentTarget) return;
  const overlay = document.getElementById('rule-editor-overlay');
  if (overlay) overlay.remove();
}

async function saveRule(ruleId) {
  // Read current state from DOM
  const name = document.getElementById('rule-name').value.trim();
  const cooldown = Number(document.getElementById('rule-cooldown').value || 24);
  const logic = window._ruleEditorLogic || 'AND';

  // Read conditions from DOM selects/inputs
  const condRows = document.querySelectorAll('.rule-cond-row');
  const conditions = [];
  condRows.forEach(row => {
    const idx = Number(row.dataset.idx);
    const field = row.querySelector('.rule-field').value;
    const op = row.querySelector('.rule-op').value;
    const valInput = row.querySelector('.rule-val');
    const value = valInput ? valInput.value : '';
    conditions.push({ field, operator: op, value });
  });

  if (!name) { toast('Введите название правила', 'warning'); return; }
  if (conditions.length === 0) { toast('Добавьте хотя бы одно условие', 'warning'); return; }

  const payload = { name, conditions, conditionLogic: logic, cooldownHours: cooldown };
  if (ruleId) payload.id = ruleId;

  try {
    const url = ruleId ? '/api/rule' : '/api/rules';
    const method = ruleId ? 'POST' : 'POST';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    closeRuleEditor();
    toast(ruleId ? 'Правило обновлено' : 'Правило создано');
    loadRulesTab();
  } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
}

// ─── SSE (Server-Sent Events) — real-time updates ────────────────
let _sseSource = null;
let _sseReconnectTimer = null;

function connectSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch(e) {} }
  if (_sseReconnectTimer) { clearTimeout(_sseReconnectTimer); _sseReconnectTimer = null; }

  try {
    _sseSource = new EventSource('/api/events');

    _sseSource.addEventListener('sync_complete', (e) => {
      // Server finished a sync cycle — reload data immediately
      if (!state.loading) {
        console.log('[sse] sync_complete received, reloading data');
        loadAll();
      }
    });

    _sseSource.onerror = () => {
      _sseSource.close();
      _sseSource = null;
      // Reconnect after 10 seconds
      _sseReconnectTimer = setTimeout(connectSSE, 10000);
    };
  } catch (e) {
    console.warn('[sse] failed to connect:', e.message);
  }
}

function disconnectSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch(e) {} _sseSource = null; }
  if (_sseReconnectTimer) { clearTimeout(_sseReconnectTimer); _sseReconnectTimer = null; }
}

// ─── Activity Chart (Canvas) ──────────────────────────────────────
let _chartRange = '6h';
let _chartHoverIdx = -1;

function setChartRange(range, btn) {
  _chartRange = range;
  if (btn) {
    btn.closest('.window-switch').querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderActivityChart();
}

function renderActivityChart() {
  const canvas = document.getElementById('activity-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = 200;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const isDark = !document.documentElement.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme') !== 'light';
  const history = (state.data && state.data.activityHistory) || [];

  // Empty state
  if (history.length < 2) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Ожидание данных активности...', w / 2, h / 2 - 10);
    ctx.font = '400 11px Inter, sans-serif';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    ctx.fillText('Данные появятся после нескольких циклов синхронизации', w / 2, h / 2 + 10);
    return;
  }

  const now = Date.now();
  const rangeMs = _chartRange === '7d' ? 7*24*60*60*1000 : _chartRange === '24h' ? 24*60*60*1000 : 6*60*60*1000;
  const cutoff = now - rangeMs;
  const data = history.filter(p => p.ts >= cutoff);

  // Update data count badge
  const countBadge = document.getElementById('chart-data-count');
  if (countBadge) countBadge.textContent = `${data.length} точек`;
  if (data.length < 2) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных за выбранный период', w / 2, h / 2);
    return;
  }

  // Layout
  const padL = 48, padR = 20, padT = 20, padB = 44;
  const cW = w - padL - padR;
  const cH = h - padT - padB;

  const maxOnline = Math.max(1, ...data.map(p => p.online || 0));
  const maxSuspect = Math.max(0, ...data.map(p => p.suspects || 0));
  const avgOnline = Math.round(data.reduce((s, p) => s + (p.online || 0), 0) / data.length);
  const maxYOnline = Math.ceil(maxOnline * 1.15); // 15% headroom

  // Colors
  const onlineStroke = isDark ? '#818cf8' : '#6366f1';
  const onlineGlow = isDark ? 'rgba(129,140,248,0.35)' : 'rgba(99,102,241,0.25)';
  const suspectStroke = isDark ? '#f87171' : '#ef4444';
  const suspectGlow = isDark ? 'rgba(248,113,113,0.3)' : 'rgba(239,68,68,0.2)';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
  const avgColor = isDark ? 'rgba(129,140,248,0.2)' : 'rgba(99,102,241,0.15)';

  ctx.clearRect(0, 0, w, h);

  // Helper: x/y from data index
  const xAt = (i) => padL + (i / (data.length - 1)) * cW;
  const yOnline = (v) => padT + cH - (v / maxYOnline) * cH;
  const ySuspect = (v) => maxSuspect > 0 ? padT + cH - (v / Math.max(1, maxSuspect) * 0.4) * cH : padT + cH;

  // ── Grid ──
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padT + (cH / gridSteps) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Average line ──
  const avgY = yOnline(avgOnline);
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = avgColor;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, avgY); ctx.lineTo(w - padR, avgY); ctx.stroke();
  ctx.setLineDash([]);
  // AVG label
  ctx.fillStyle = isDark ? 'rgba(129,140,248,0.4)' : 'rgba(99,102,241,0.5)';
  ctx.font = '600 9px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`avg ${avgOnline}`, padL + 4, avgY - 4);

  // ── Y-axis labels ──
  ctx.font = '500 10px JetBrains Mono, monospace';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridSteps; i++) {
    const y = padT + (cH / gridSteps) * i;
    const val = Math.round(maxYOnline * (1 - i / gridSteps));
    ctx.fillText(val, padL - 8, y + 3);
  }

  // ── X-axis labels ──
  ctx.textAlign = 'center';
  const labelCount = Math.min(7, data.length);
  const labelStep = Math.max(1, Math.floor(data.length / labelCount));
  for (let i = 0; i < data.length; i += labelStep) {
    const x = xAt(i);
    const d = new Date(data[i].ts);
    const label = _chartRange === '7d'
      ? `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`
      : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    ctx.fillText(label, x, h - padB + 16);
  }

  // ── Build smooth bezier path ──
  function buildPath(points) {
    const path = new Path2D();
    if (points.length < 2) return path;
    path.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i];
      const [px, py] = points[i - 1];
      const cpx = (px + x) / 2;
      path.bezierCurveTo(cpx, py, cpx, y, x, y);
    }
    return path;
  }

  // ── Online area ──
  const onlinePoints = data.map((p, i) => [xAt(i), yOnline(p.online || 0)]);
  const onlinePath = buildPath(onlinePoints);

  // Gradient fill
  const onlineGrad = ctx.createLinearGradient(0, padT, 0, padT + cH);
  onlineGrad.addColorStop(0, isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.15)');
  onlineGrad.addColorStop(0.6, isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)');
  onlineGrad.addColorStop(1, 'rgba(99,102,241,0)');

  // Fill area
  const areaPath = new Path2D();
  areaPath.moveTo(onlinePoints[0][0], padT + cH);
  areaPath.lineTo(onlinePoints[0][0], onlinePoints[0][1]);
  for (let i = 1; i < onlinePoints.length; i++) {
    const [x, y] = onlinePoints[i];
    const [px, py] = onlinePoints[i - 1];
    const cpx = (px + x) / 2;
    areaPath.bezierCurveTo(cpx, py, cpx, y, x, y);
  }
  areaPath.lineTo(onlinePoints[onlinePoints.length - 1][0], padT + cH);
  areaPath.closePath();
  ctx.fillStyle = onlineGrad;
  ctx.fill(areaPath);

  // Line glow
  ctx.save();
  ctx.shadowColor = onlineGlow;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = onlineStroke;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke(onlinePath);
  ctx.restore();

  // Line crisp
  ctx.strokeStyle = onlineStroke;
  ctx.lineWidth = 2;
  ctx.stroke(onlinePath);

  // ── Suspect area (if any) ──
  if (maxSuspect > 0) {
    const suspectPoints = data.map((p, i) => [xAt(i), ySuspect(p.suspects || 0)]);
    const suspPath = buildPath(suspectPoints);

    // Gradient fill
    const suspGrad = ctx.createLinearGradient(0, padT, 0, padT + cH);
    suspGrad.addColorStop(0, isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.1)');
    suspGrad.addColorStop(1, 'rgba(239,68,68,0)');

    const suspArea = new Path2D();
    suspArea.moveTo(suspectPoints[0][0], padT + cH);
    suspArea.lineTo(suspectPoints[0][0], suspectPoints[0][1]);
    for (let i = 1; i < suspectPoints.length; i++) {
      const [x, y] = suspectPoints[i];
      const [px, py] = suspectPoints[i - 1];
      const cpx = (px + x) / 2;
      suspArea.bezierCurveTo(cpx, py, cpx, y, x, y);
    }
    suspArea.lineTo(suspectPoints[suspectPoints.length - 1][0], padT + cH);
    suspArea.closePath();
    ctx.fillStyle = suspGrad;
    ctx.fill(suspArea);

    ctx.save();
    ctx.shadowColor = suspectGlow;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = suspectStroke;
    ctx.lineWidth = 2;
    ctx.stroke(suspPath);
    ctx.restore();
    ctx.strokeStyle = suspectStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke(suspPath);

    // Current suspect dot
    const lastSusp = suspectPoints[suspectPoints.length - 1];
    if (data[data.length - 1].suspects > 0) {
      ctx.beginPath();
      ctx.arc(lastSusp[0], lastSusp[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = suspectStroke;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lastSusp[0], lastSusp[1], 7, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? 'rgba(248,113,113,0.3)' : 'rgba(239,68,68,0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ── Current value dot (online) ──
  const lastPt = onlinePoints[onlinePoints.length - 1];
  // Outer ring (glow)
  ctx.beginPath();
  ctx.arc(lastPt[0], lastPt[1], 8, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? 'rgba(129,140,248,0.15)' : 'rgba(99,102,241,0.12)';
  ctx.fill();
  // Inner ring
  ctx.beginPath();
  ctx.arc(lastPt[0], lastPt[1], 4.5, 0, Math.PI * 2);
  ctx.fillStyle = onlineStroke;
  ctx.fill();
  // White core
  ctx.beginPath();
  ctx.arc(lastPt[0], lastPt[1], 2, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? '#fff' : '#fff';
  ctx.fill();

  // ── Stats bar at bottom ──
  const statsY = h - 10;
  ctx.font = '600 10px Inter, sans-serif';
  const lastVal = data[data.length - 1].online || 0;
  const statsItems = [
    { label: 'Сейчас', value: lastVal, color: onlineStroke },
    { label: 'Max', value: maxOnline, color: isDark ? 'rgba(52,211,153,0.8)' : '#059669' },
    { label: 'Avg', value: avgOnline, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' },
  ];
  if (maxSuspect > 0) {
    statsItems.push({ label: '⚠ Max', value: maxSuspect, color: suspectStroke });
  }
  ctx.textAlign = 'center';
  const statsW = cW / statsItems.length;
  statsItems.forEach((item, i) => {
    const sx = padL + statsW * i + statsW / 2;
    ctx.fillStyle = item.color;
    ctx.font = '800 11px JetBrains Mono, monospace';
    ctx.fillText(item.value, sx, statsY - 1);
    ctx.fillStyle = textColor;
    ctx.font = '500 9px Inter, sans-serif';
    ctx.fillText(item.label, sx, statsY + 10);
  });

  // ── Hover tooltip ──
  if (!canvas._hasHover) {
    canvas._hasHover = true;
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      if (mx < padL || mx > w - padR) { _chartHoverIdx = -1; renderActivityChart(); return; }
      const ratio = (mx - padL) / cW;
      const idx = Math.round(ratio * (data.length - 1));
      if (idx >= 0 && idx < data.length && idx !== _chartHoverIdx) {
        _chartHoverIdx = idx;
        renderActivityChart();
      }
    });
    canvas.addEventListener('mouseleave', () => {
      _chartHoverIdx = -1;
      renderActivityChart();
    });
  }

  // Draw hover crosshair + tooltip
  if (_chartHoverIdx >= 0 && _chartHoverIdx < data.length) {
    const hx = xAt(_chartHoverIdx);
    const hp = data[_chartHoverIdx];
    const hy = yOnline(hp.online || 0);

    // Vertical line
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + cH); ctx.stroke();
    ctx.setLineDash([]);

    // Dot on line
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = onlineStroke;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Tooltip
    const d = new Date(hp.ts);
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const dateStr = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}`;
    const tipLines = [`${dateStr}  ${timeStr}`, `Онлайн: ${hp.online || 0}`];
    if ((hp.suspects || 0) > 0) tipLines.push(`Подозр: ${hp.suspects}`);
    if ((hp.ips || 0) > 0) tipLines.push(`IP: ${hp.ips}`);

    const tipFont = '600 11px Inter, sans-serif';
    ctx.font = tipFont;
    const tipW = Math.max(...tipLines.map(l => ctx.measureText(l).width)) + 20;
    const tipH = tipLines.length * 17 + 12;
    let tipX = hx + 12;
    if (tipX + tipW > w - 10) tipX = hx - tipW - 12;
    let tipY = hy - tipH / 2;
    if (tipY < padT) tipY = padT;
    if (tipY + tipH > padT + cH) tipY = padT + cH - tipH;

    // Tooltip bg
    ctx.fillStyle = isDark ? 'rgba(20,22,40,0.92)' : 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = isDark ? 'rgba(129,140,248,0.3)' : 'rgba(99,102,241,0.2)';
    ctx.lineWidth = 1;
    const tipR = 8;
    ctx.beginPath();
    ctx.roundRect(tipX, tipY, tipW, tipH, tipR);
    ctx.fill();
    ctx.stroke();

    // Tooltip text
    ctx.textAlign = 'left';
    tipLines.forEach((line, li) => {
      ctx.fillStyle = li === 0 ? textColor : (line.includes('Подозр') ? suspectStroke : (isDark ? '#e2e8f0' : '#1e293b'));
      ctx.font = li === 0 ? '500 10px Inter, sans-serif' : tipFont;
      ctx.fillText(line, tipX + 10, tipY + 16 + li * 17);
    });
  }
}

// ─── Sound Notifications ──────────────────────────────────────────
let _soundEnabled = localStorage.getItem('rwm_sound') === '1';
let _prevSuspectsCount = -1;
let _prevIncidentCount = -1;

function toggleAlertSound() {
  _soundEnabled = !_soundEnabled;
  localStorage.setItem('rwm_sound', _soundEnabled ? '1' : '0');
  updateSoundButton();
  if (_soundEnabled) {
    playAlertSound(true); // test beep
    toast('Звуковые уведомления включены', 'ok');
  } else {
    toast('Звуковые уведомления выключены', 'ok');
  }
}

function updateSoundButton() {
  const label = document.getElementById('sound-label');
  const icon = document.getElementById('sound-icon');
  if (label) label.textContent = _soundEnabled ? 'Звук: вкл' : 'Звук: выкл';
  if (icon) icon.innerHTML = _soundEnabled
    ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>'
    : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
}

function playAlertSound(quiet) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(quiet ? 600 : 880, audioCtx.currentTime);
    gain.gain.setValueAtTime(quiet ? 0.08 : 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (quiet ? 0.15 : 0.4));
    osc.start();
    osc.stop(audioCtx.currentTime + (quiet ? 0.15 : 0.4));
    if (!quiet) {
      // Second beep for urgency
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.3);
      }, 200);
    }
  } catch (e) {
    debugLog('[sound] failed:', e.message);
  }
}

function checkSoundAlerts() {
  if (!_soundEnabled) return;

  const suspects = _cachedSuspects || [];
  const incidentStats = (state.data && state.data.incidentStats) || {};
  const currentSuspects = suspects.length;
  const currentIncidents = Number(incidentStats.new || 0);

  if (_prevSuspectsCount >= 0 && currentSuspects > _prevSuspectsCount) {
    playAlertSound(false);
    toast(`⚠️ Новый подозрительный: +${currentSuspects - _prevSuspectsCount}`, 'error');
  } else if (_prevIncidentCount >= 0 && currentIncidents > _prevIncidentCount) {
    playAlertSound(false);
    toast(`🚨 Новый инцидент: +${currentIncidents - _prevIncidentCount}`, 'error');
  }

  _prevSuspectsCount = currentSuspects;
  _prevIncidentCount = currentIncidents;
}

document.addEventListener('DOMContentLoaded', updateSoundButton);

// ─── Export Data ──────────────────────────────────────────────────
function toggleExportMenu() {
  const menu = document.getElementById('export-menu');
  if (!menu) return;
  menu.classList.toggle('open');
  // Close on outside click
  if (menu.classList.contains('open')) {
    setTimeout(() => {
      document.addEventListener('click', closeExportMenuOutside, { once: true });
    }, 0);
  }
}

function closeExportMenuOutside(e) {
  const dropdown = document.getElementById('export-dropdown');
  const menu = document.getElementById('export-menu');
  if (dropdown && !dropdown.contains(e.target) && menu) {
    menu.classList.remove('open');
  }
}

function exportData(type, format) {
  const menu = document.getElementById('export-menu');
  if (menu) menu.classList.remove('open');
  const url = `/api/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`;
  // Use a hidden link to trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = `remnawave-${type}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast(`Экспорт ${type} (${format.toUpperCase()}) начат`, 'ok');
}
