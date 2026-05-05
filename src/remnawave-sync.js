const https = require('https');
const { URL } = require('url');
const { userKey } = require('./sync-store');
const { createDetector } = require('./detect');

function createRemnawaveSync(options) {
  const store = options.store;
  const config = options.config;
  const intervalMs = Math.max(10, Number(config.syncIntervalSeconds || 60)) * 1000;
  const hwidDetailsLimit = Number(config.hwidDetailsLimit || 150);
  const hwidDetailsConcurrency = Math.max(1, Number(config.hwidDetailsConcurrency || 8));
  const ipGeoEnabled = config.ipGeoEnabled !== false;
  const ipGeoCacheTtlMs = Number(config.ipGeoCacheTtlDays || 7) * 24 * 60 * 60 * 1000;
  const ipGeoSyncLimit = Number(config.ipGeoSyncLimit || 200);
  const ipGeoConcurrency = Math.max(1, Number(config.ipGeoConcurrency || 4));
  const pageSize = Number(config.userPageSize || 100);
  const jobTimeoutMs = Number(config.jobTimeoutMs || 15000);
  const detector = createDetector({ hwidFallback: Number(config.hwidFallback || 2) });

  let timer = null;
  let runningPromise = null;
  const syncCallbacks = [];

  function start() {
    schedule(1000);
  }

  function schedule(delayMs = intervalMs) {
    if (timer) clearTimeout(timer);
    const nextSyncAt = Date.now() + delayMs;
    store.markNextSync(nextSyncAt);
    timer = setTimeout(() => {
      run('timer').catch((e) => console.error('[sync] timer failed:', e.message));
    }, delayMs);
  }

  function trigger(reason = 'manual') {
    run(reason).catch((e) => console.error('[sync] manual failed:', e.message));
    return getStatus();
  }

  function getStatus() {
    return {
      ...store.getSyncStatus(),
      intervalSeconds: Math.round(intervalMs / 1000),
    };
  }

  async function run(reason) {
    if (runningPromise) return runningPromise;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    runningPromise = performSync(reason)
      .then(() => {
        for (const cb of syncCallbacks) { try { cb(); } catch (e) { console.error('[sync] callback error:', e.message); } }
      })
      .catch((e) => {
        console.error('[sync] failed:', e.message);
      })
      .finally(() => {
        runningPromise = null;
        schedule(intervalMs);
      });

    return runningPromise;
  }

  function onSync(cb) {
    if (typeof cb === 'function') syncCallbacks.push(cb);
  }

  async function performSync(reason) {
    const runId = store.startSyncRun(reason);
    const nextSyncAt = Date.now() + intervalMs;
    const startedAt = Date.now();
    const warnings = [];

    try {
      if (!config.baseUrl || !config.token) {
        throw new Error('REMNAWAVE_BASE_URL or REMNAWAVE_API_TOKEN is not configured');
      }

      const users = await fetchAllUsers();
      const { activeIps, nodeMap } = await fetchActiveIps(users, warnings);
      await enrichActiveIpGeo(activeIps, warnings);
      const hwidTop = await fetchHwidTop(warnings);
      const hwidDevices = await fetchHwidDevices(hwidTop, users, activeIps, warnings);

      // VPN/Proxy detection on unique IPs
      let proxyData = {};
      try {
        if (store.ipChecker) {
          const allIps = new Set();
          for (const entries of Object.values(activeIps || {})) {
            for (const entry of entries || []) {
              const ip = typeof entry === 'string' ? entry : entry && entry.ip;
              if (ip) allIps.add(ip);
            }
          }
          if (allIps.size > 0) {
            proxyData = await store.ipChecker.checkIps([...allIps]);
            const vpnCount = Object.values(proxyData).filter(r => r.isVPN || r.isProxy || r.isTor).length;
            if (vpnCount > 0) console.log(`[ip-check] ${vpnCount}/${allIps.size} IPs flagged as VPN/Proxy/Tor`);
          }
        }
      } catch (ipCheckErr) {
        warnings.push(`ip-check error: ${ipCheckErr.message}`);
        console.error('[ip-check] error:', ipCheckErr.message);
      }

      // Fetch subscription request history for User-Agent analysis
      try {
        if (store.saveSubHistory) {
          const subRecords = await fetchSubRequestHistory(warnings);
          if (subRecords.length > 0) {
            const inserted = store.saveSubHistory(subRecords);
            if (inserted > 0) console.log(`[sub-history] saved ${inserted} new subscription requests`);
          }
        }
      } catch (subErr) {
        warnings.push(`sub-history error: ${subErr.message}`);
        console.error('[sub-history] error:', subErr.message);
      }

      store.saveSnapshot({
        ts: Date.now(),
        users,
        activeIps,
        hwidTop,
        hwidDevices,
        proxyData,
        nodeMap,
        warnings,
      });

      store.finishSyncRun(runId, 'ok', warnings.length ? warnings.join('\n') : null, nextSyncAt);

      // Серверная детекция подозрительных
      try {
        const fullState = store.getState();
        const detection = detector.analyze(fullState);
        store.saveDetectionResult(detection);

        // Сохраняем аудит-лог для suspects и observed
        if (store.saveAuditEntries) {
          const auditEntries = [];
          for (const s of detection.suspects || []) {
            auditEntries.push({ userKey: s.key, level: s.riskLevel, score: s.riskScore, signals: s.signals });
          }
          for (const o of detection.observed || []) {
            auditEntries.push({ userKey: o.key, level: o.riskLevel, score: o.riskScore, signals: o.signals });
          }
          if (auditEntries.length > 0) store.saveAuditEntries(auditEntries);
        }

        if (store.syncIncidentsFromDetection) {
          store.syncIncidentsFromDetection(detection);
        }

        console.log(`[detect] suspects=${detection.suspectsCount}, observed=${detection.observedCount}, in ${detection.durationMs}ms`);

        // Записываем историю активности
        if (store.recordActivity) {
          store.recordActivity(
            Object.keys(activeIps).length,
            Object.values(activeIps).reduce((s, arr) => s + arr.length, 0),
            detection.suspectsCount || 0
          );
        }

        // Evaluate rules
        if (store.ruleEngine) {
          try {
            const ruleResult = store.ruleEngine.evaluateRules(fullState);
            if (ruleResult.total > 0) {
              console.log(`[rules] ${ruleResult.total} rule(s) triggered`);
            }
          } catch (ruleErr) {
            console.error('[rules] evaluation error:', ruleErr.message);
          }
        }
      } catch (detectErr) {
        console.error('[detect] error:', detectErr.message);
      }

      console.log(`[sync] ok in ${Date.now() - startedAt}ms: users=${users.length}, active=${Object.keys(activeIps).length}, hwidTop=${hwidTop.length}, warnings=${warnings.length}`);
    } catch (e) {
      store.finishSyncRun(runId, 'error', e.message, nextSyncAt);
      throw e;
    }
  }
  async function fetchSubRequestHistory(warnings) {
    try {
      const response = await request('GET', '/api/subscription-request-history', null, { allow404: true });
      if (response.statusCode === 404) return [];
      const data = response.json;
      const records = (data && data.response && Array.isArray(data.response.records))
        ? data.response.records
        : extractArray(data, ['records']);
      return records;
    } catch (e) {
      warnings.push(`sub-history fetch: ${e.message}`);
      return [];
    }
  }

  async function fetchAllUsers() {
    let start = 0;
    const all = [];

    while (true) {
      const path = `/api/users?start=${start}&size=${pageSize}`;
      const response = await request('GET', path, null, { allow404: all.length > 0 });
      if (response.statusCode === 404 && all.length > 0) break;

      const list = extractArray(response.json, ['users']);
      if (list.length === 0) break;
      all.push(...list);

      const total = extractTotal(response.json, null);
      if (list.length < pageSize) break;
      if (total !== null && all.length >= total) break;
      if (total !== null && start + pageSize >= total) break;
      start += pageSize;
      if (start > 10000) break;
    }

    const seen = new Set();
    return all.filter((user) => {
      const key = userKey(user);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchActiveIps(users, warnings) {
    const activeIps = {};
    let nodes = [];

    try {
      const nodesRaw = await api('GET', '/api/nodes');
      nodes = extractArray(nodesRaw, ['nodes']);
    } catch (e) {
      warnings.push(`[nodes] ${e.message}`);
      return { activeIps, nodeMap: {} };
    }

    // Build nodeUuid -> name mapping
    const nodeMap = {};
    for (const node of nodes) {
      const nUuid = node.uuid || node.id;
      const nName = node.name || node.title || node.hostname || nUuid;
      if (nUuid) nodeMap[String(nUuid)] = String(nName);
    }

    const nodeIps = new Set(
      nodes
        .map((node) => node.address || node.ip || node.host || node.ipAddress || node.addr)
        .filter((addr) => addr && /^\d+\.\d+\.\d+\.\d+$/.test(String(addr).split(':')[0]))
        .map((addr) => String(addr).split(':')[0])
    );

    const idToUuid = {};
    for (const user of users) {
      const numId = String(user.id || user.userId || '');
      const uuid = user.uuid || user.id;
      if (numId && uuid) idToUuid[numId] = String(uuid);
    }

    for (const node of nodes) {
      const nodeUuid = node.uuid || node.id;
      if (!nodeUuid) continue;

      try {
        const jobData = await api('POST', `/api/ip-control/fetch-users-ips/${nodeUuid}`, {});
        const jobId = jobData.response && jobData.response.jobId ? jobData.response.jobId : jobData.jobId || jobData.id;
        if (!jobId) {
          warnings.push(`[ip-control] no jobId for node ${nodeUuid}`);
          continue;
        }

        const nodeResult = await pollJob(`/api/ip-control/fetch-users-ips/result/${jobId}`);
        if (!nodeResult) continue;

        const usersList = Array.isArray(nodeResult.users) ? nodeResult.users : [];
        for (const user of usersList) {
          const numId = String(user.userId || user.id || '');
          const ipObjs = (Array.isArray(user.ips) ? user.ips : [])
            .map((entry) => typeof entry === 'string'
              ? { ip: entry, lastSeen: null, nodeUuid: String(nodeUuid) }
              : { ip: entry && entry.ip, lastSeen: entry && entry.lastSeen || null, nodeUuid: String(nodeUuid) })
            .filter((entry) => entry.ip && !nodeIps.has(entry.ip));

          if (!numId || ipObjs.length === 0) continue;

          const key = idToUuid[numId] || numId;
          if (!activeIps[key]) activeIps[key] = {};
          for (const entry of ipObjs) {
            const existing = activeIps[key][entry.ip];
            if (!existing || isNewer(entry.lastSeen, existing.lastSeen)) {
              activeIps[key][entry.ip] = entry;
            }
          }
        }
      } catch (e) {
        warnings.push(`[ip-control:${nodeUuid}] ${e.message}`);
      }
    }

    for (const key of Object.keys(activeIps)) {
      activeIps[key] = Object.values(activeIps[key]);
    }

    return { activeIps, nodeMap };
  }

  async function enrichActiveIpGeo(activeIps, warnings) {
    if (!ipGeoEnabled || !store.getIpGeoCache || !store.saveIpGeoCache) return;

    const uniqueIps = Array.from(new Set(
      Object.values(activeIps || {})
        .flat()
        .map((entry) => entry && entry.ip)
        .filter(isPublicIp)
    ));

    if (uniqueIps.length === 0) return;

    const cached = store.getIpGeoCache(uniqueIps, ipGeoCacheTtlMs);
    const missing = uniqueIps
      .filter((ip) => !cached[ip])
      .slice(0, ipGeoSyncLimit);

    const fetched = {};
    await runLimited(missing, ipGeoConcurrency, async (ip) => {
      try {
        const geo = await fetchIpGeo(ip);
        if (geo) fetched[ip] = geo;
      } catch (e) {
        warnings.push(`[ip-geo:${ip}] ${e.message}`);
      }
    });

    if (Object.keys(fetched).length > 0) {
      store.saveIpGeoCache(fetched);
    }

    const geoMap = { ...cached, ...fetched };
    for (const ips of Object.values(activeIps || {})) {
      for (const entry of ips || []) {
        if (entry && entry.ip && geoMap[entry.ip]) {
          entry.geo = geoMap[entry.ip];
        }
      }
    }
  }

  async function fetchHwidTop(warnings) {
    try {
      const hwidRaw = await api('GET', '/api/hwid/devices/top-users?limit=50');
      return extractArray(hwidRaw, ['users', 'topUsers']);
    } catch (e) {
      warnings.push(`[hwid-top] ${e.message}`);
      return [];
    }
  }

  async function fetchHwidDevices(hwidTop, users, activeIps, warnings) {
    const devicesByUser = {};
    const candidates = buildHwidDeviceCandidates(hwidTop, users, activeIps)
      .slice(0, hwidDetailsLimit);

    await runLimited(candidates, hwidDetailsConcurrency, async (candidate) => {
      if (!candidate.uuid) return;

      try {
        const raw = await api('GET', `/api/hwid/devices/${encodeURIComponent(candidate.uuid)}`);
        const devices = extractArray(raw, ['devices']);
        devicesByUser[candidate.userKey || candidate.uuid] = devices;
      } catch (e) {
        warnings.push(`[hwid-devices:${candidate.uuid}] ${e.message}`);
        devicesByUser[candidate.userKey || candidate.uuid] = [];
      }
    });

    return devicesByUser;
  }

  function buildHwidDeviceCandidates(hwidTop, users, activeIps) {
    const userLookup = buildUserLookup(users);
    const byUuid = new Map();

    const addCandidate = (source, extraAliases = []) => {
      const user = resolveUser(source, userLookup) || source;
      const aliases = new Set([...userAliases(source), ...userAliases(user), ...extraAliases.map(String)]);
      const uuid = firstValue(user.userUuid, user.uuid, source && source.userUuid, source && source.uuid, user.id, source && source.id, user.userId);
      if (!uuid) return;

      const uuidKey = String(uuid);
      let candidate = byUuid.get(uuidKey);
      if (!candidate) {
        candidate = { uuid: uuidKey, userKey: userKey(user) || uuidKey, aliases: new Set([uuidKey]) };
        byUuid.set(uuidKey, candidate);
      }
      if (!candidate.userKey) candidate.userKey = userKey(user) || uuidKey;

      for (const alias of aliases) {
        if (alias) candidate.aliases.add(alias);
      }
    };

    for (const user of hwidTop || []) {
      addCandidate(user);
    }

    for (const key of Object.keys(activeIps || {})) {
      const user = userLookup.get(String(key)) || { uuid: key, id: key };
      addCandidate(user, [key]);
    }

    return Array.from(byUuid.values())
      .map((candidate) => ({
        uuid: candidate.uuid,
        userKey: candidate.userKey || candidate.uuid,
        aliases: Array.from(candidate.aliases).filter(Boolean),
      }))
      .filter((candidate) => candidate.uuid && candidate.aliases.length > 0);
  }

  async function pollJob(path) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < jobTimeoutMs) {
      const result = await api('GET', path);
      const inner = result.response || result;

      if (inner.isCompleted === true) {
        return inner.result || inner;
      }
      if (inner.isFailed === true) {
        return null;
      }

      await delay(600);
    }

    return null;
  }

  async function api(method, apiPath, body = null) {
    const response = await request(method, apiPath, body);
    return response.json;
  }

  function request(method, apiPath, body = null, opts = {}) {
    return new Promise((resolve, reject) => {
      let baseUrl;
      try {
        baseUrl = new URL(config.baseUrl);
      } catch {
        reject(new Error('REMNAWAVE_BASE_URL is invalid'));
        return;
      }

      const targetUrl = new URL(apiPath, baseUrl);
      const payload = body === null || body === undefined ? null : JSON.stringify(body);
      const headers = {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        'User-Agent': 'RemnawaveMonitor/1.0',
      };

      if (payload !== null) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = https.request({
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method,
        headers,
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          const json = parseJson(data);

          if (statusCode === 404 && opts.allow404) {
            resolve({ statusCode, json: json || {}, body: data });
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP ${statusCode}: ${shortBody(data)}`));
            return;
          }

          resolve({ statusCode, json: json || {}, body: data });
        });
      });

      req.on('error', reject);
      if (payload !== null) req.write(payload);
      req.end();
    });
  }

  return {
    start,
    trigger,
    run,
    getStatus,
    onSync,
  };
}

function extractArray(data, hints = []) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const fields = [...hints, 'response', 'data', 'items', 'users', 'devices', 'result'];
  for (const field of fields) {
    if (data[field] && Array.isArray(data[field])) return data[field];
    if (data.response && data.response[field] && Array.isArray(data.response[field])) return data.response[field];
  }
  if (data.response && typeof data.response === 'object') {
    const nested = Object.values(data.response).find((value) => Array.isArray(value));
    if (nested) return nested;
  }
  return [];
}

function extractTotal(data, fallback = null) {
  if (!data) return fallback;
  const direct = data.total ?? data.count ?? data.totalCount ?? data.totalItems ?? null;
  if (direct !== null) return Number(direct);

  const response = data.response;
  if (response) {
    const inResponse = response.total ?? response.count ?? response.totalCount ?? response.totalItems ?? null;
    if (inResponse !== null) return Number(inResponse);
    const meta = response.meta || response.pagination || response.paginator;
    if (meta) {
      const inMeta = meta.total ?? meta.count ?? meta.totalCount ?? meta.totalItems ?? null;
      if (inMeta !== null) return Number(inMeta);
    }
  }

  const meta = data.meta || data.pagination || data.paginator;
  if (meta) {
    const inMeta = meta.total ?? meta.count ?? meta.totalCount ?? meta.totalItems ?? null;
    if (inMeta !== null) return Number(inMeta);
  }

  return fallback;
}

function parseJson(data) {
  try { return JSON.parse(data); }
  catch { return null; }
}

function shortBody(data) {
  return String(data || '').replace(/\s+/g, ' ').slice(0, 240) || 'empty response';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchIpGeo(ip) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://ipwho.is/${encodeURIComponent(ip)}`);
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RemnawaveMonitor/1.0',
      },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          reject(new Error(`HTTP ${res.statusCode || 0}`));
          return;
        }

        const json = parseJson(data);
        if (!json || json.success === false) {
          resolve(null);
          return;
        }

        resolve(normalizeIpGeo(ip, json));
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function normalizeIpGeo(ip, data) {
  const connection = data.connection || {};
  const security = data.security || {};
  return {
    ip,
    country: data.country || '',
    countryCode: data.country_code || '',
    region: data.region || '',
    city: data.city || '',
    latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
    longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
    asn: connection.asn || '',
    org: connection.org || '',
    isp: connection.isp || '',
    domain: connection.domain || '',
    connectionType: connection.type || '',
    hosting: Boolean(security.hosting),
    proxy: Boolean(security.proxy || security.anonymous),
    vpn: Boolean(security.vpn),
    tor: Boolean(security.tor),
  };
}

function isPublicIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return false;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return false;
    if (parts[0] === 10) return false;
    if (parts[0] === 127) return false;
    if (parts[0] === 0) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
    return true;
  }

  if (value === '::1' || value.toLowerCase().startsWith('fc') || value.toLowerCase().startsWith('fd') || value.toLowerCase().startsWith('fe80:')) {
    return false;
  }

  return value.includes(':');
}

async function runLimited(items, limit, worker) {
  let index = 0;
  const workerCount = Math.min(limit, items.length);

  const tasks = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });

  await Promise.all(tasks);
}

function isNewer(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() > new Date(current).getTime();
}

function buildUserLookup(users) {
  const lookup = new Map();
  for (const user of users || []) {
    for (const alias of userAliases(user)) {
      if (!lookup.has(alias)) lookup.set(alias, user);
    }
  }
  return lookup;
}

function resolveUser(source, lookup) {
  for (const alias of userAliases(source)) {
    const user = lookup.get(alias);
    if (user) return user;
  }
  return null;
}

function userAliases(user) {
  if (!user) return [];
  return [
    userKey(user),
    user.userUuid,
    user.uuid,
    user.id,
    user.userId,
    user.shortUuid,
    user.shortUserUuid,
    user.username,
    user.name,
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(String);
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '');
}

module.exports = { createRemnawaveSync };
