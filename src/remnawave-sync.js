const https = require('https');
const { URL } = require('url');
const { getUserKey: userKey, getUserAliases: userAliases } = require('./utils');
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

  // Auto-notification settings
  const telegramBotToken = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const autoNotifyEnabled = config.autoNotifyEnabled !== false && !!telegramBotToken;
  const autoNotifyAdminChatId = config.autoNotifyAdminChatId || process.env.TELEGRAM_ADMIN_CHAT_ID || '';
  const autoNotifyCooldownMs = Number(config.autoNotifyCooldownHours || 24) * 60 * 60 * 1000;
  const autoNotifiedUsers = new Map(); // userKey -> lastNotifiedAt

  let timer = null;
  let runningPromise = null;
  let currentRetryDelay = intervalMs;
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

    let wasError = false;
    runningPromise = performSync(reason)
      .then(() => {
        currentRetryDelay = intervalMs; // Reset on success
        for (const cb of syncCallbacks) { try { cb(); } catch (e) { console.error('[sync] callback error:', e.message); } }
      })
      .catch((e) => {
        wasError = true;
        console.error('[sync] failed:', e.message);
      })
      .finally(() => {
        runningPromise = null;
        // Exponential backoff with jitter on error
        if (wasError) {
          currentRetryDelay = Math.min(currentRetryDelay * 2, 300000); // max 5 min
          const jitter = Math.round(Math.random() * 5000);
          console.log(`[sync] retrying in ${Math.round(currentRetryDelay / 1000)}s (backoff)`);
          schedule(currentRetryDelay + jitter);
        } else {
          schedule(intervalMs);
        }
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
      const { activeIps, nodeMap, nodesInfo } = await fetchActiveIps(users, warnings);
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

      const remnawaveExtra = await fetchRemnawaveExtra(warnings);

      store.saveSnapshot({
        ts: Date.now(),
        users,
        activeIps,
        hwidTop,
        hwidDevices,
        proxyData,
        nodeMap,
        nodesInfo,
        remnawaveExtra,
        warnings,
      });

      store.finishSyncRun(runId, 'ok', warnings.length ? warnings.join('\n') : null, nextSyncAt);

      // Серверная детекция подозрительных
      try {
        const fullState = store.getState({ includeDetectionHistory: true, includeNodeDuplicates: true });
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

        // Auto-notify admin about new critical suspects via Telegram
        if (autoNotifyEnabled && autoNotifyAdminChatId) {
          try {
            await sendAutoNotifications(detection);
          } catch (notifyErr) {
            console.error('[auto-notify] error:', notifyErr.message);
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

  async function sendAutoNotifications(detection) {
    if (!autoNotifyEnabled || !autoNotifyAdminChatId) return;

    const now = Date.now();
    const newCriticalSuspects = [];

    for (const suspect of detection.suspects || []) {
      if (!suspect.key) continue;
      // Only notify for critical/high risk
      if (suspect.riskLevel !== 'critical' && suspect.riskLevel !== 'high') continue;
      // Only confirmed or probable verdicts
      if (suspect.verdict && suspect.verdict.level !== 'confirmed' && suspect.verdict.level !== 'probable') continue;

      // Check cooldown
      const lastNotified = autoNotifiedUsers.get(suspect.key);
      if (lastNotified && (now - lastNotified) < autoNotifyCooldownMs) continue;

      newCriticalSuspects.push(suspect);
      autoNotifiedUsers.set(suspect.key, now);
    }

    if (newCriticalSuspects.length === 0) return;

    // Clean up old cooldowns (>48h)
    for (const [key, ts] of autoNotifiedUsers) {
      if (now - ts > autoNotifyCooldownMs * 2) autoNotifiedUsers.delete(key);
    }

    // Build summary message
    const lines = [`🚨 <b>Обнаружены нарушители (${newCriticalSuspects.length})</b>\n`];
    for (const s of newCriticalSuspects.slice(0, 10)) {
      const signals = (s.signals || [])
        .filter(sig => sig.active)
        .map(sig => sig.id)
        .join(', ');
      const verdictLabel = s.verdict ? s.verdict.label || s.verdict.level || '' : '';
      lines.push(
        `👤 <b>${s.name || s.key}</b>`,
        `   Risk: ${s.riskScore} (${s.riskLevel})${verdictLabel ? ` — ${verdictLabel}` : ''}`,
        `   Сигналы: ${signals || 'нет'}`,
        ''
      );
    }
    if (newCriticalSuspects.length > 10) {
      lines.push(`... и ещё ${newCriticalSuspects.length - 10}`);
    }

    const message = lines.join('\n');

    try {
      await sendTelegramMessage(autoNotifyAdminChatId, message);
      console.log(`[auto-notify] Sent alert for ${newCriticalSuspects.length} suspect(s) to admin`);
    } catch (e) {
      console.error(`[auto-notify] Failed to send: ${e.message}`);
    }
  }

  function sendTelegramMessage(chatId, text) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });

      const req = https.request('https://api.telegram.org/bot' + telegramBotToken + '/sendMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Telegram API ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.write(payload);
      req.end();
    });
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
      return { activeIps, nodeMap: {}, nodesInfo: [] };
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
      const canonicalKey = userKey(user);
      for (const rawId of [user.id, user.userId]) {
        const numId = String(rawId || '');
        if (numId && canonicalKey) idToUuid[numId] = canonicalKey;
      }
    }

    // Статистика по нодам: пользователи и IP
    const nodeUserSets = {}; // nodeUuid -> Set<userKey>
    const nodeIpSets = {};   // nodeUuid -> Set<ip>

    for (const node of nodes) {
      const nodeUuid = node.uuid || node.id;
      if (!nodeUuid) continue;
      nodeUserSets[nodeUuid] = new Set();
      nodeIpSets[nodeUuid] = new Set();

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
          nodeUserSets[nodeUuid].add(key);
          for (const entry of ipObjs) {
            nodeIpSets[nodeUuid].add(entry.ip);
          }

          if (!activeIps[key]) activeIps[key] = {};
          for (const entry of ipObjs) {
            const activeKey = `${entry.ip}\n${entry.nodeUuid || ''}`;
            const existing = activeIps[key][activeKey];
            if (!existing || isNewer(entry.lastSeen, existing.lastSeen)) {
              activeIps[key][activeKey] = entry;
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

    // Формируем информацию о нодах
    const nodesInfo = nodes.map(node => {
      const nUuid = node.uuid || node.id;
      return {
        uuid: nUuid,
        name: node.name || node.title || node.hostname || nUuid,
        address: node.address || node.ip || node.host || '',
        port: node.port || null,
        isConnected: node.isConnected ?? node.is_connected ?? null,
        isDisabled: node.isDisabled ?? node.is_disabled ?? false,
        isTrafficTrackingActive: node.isTrafficTrackingActive ?? null,
        trafficLimitBytes: node.trafficLimitBytes ?? node.traffic_limit ?? 0,
        trafficUsedBytes: node.trafficUsedBytes ?? node.traffic_used ?? 0,
        usersOnline: nUuid ? (nodeUserSets[nUuid] ? nodeUserSets[nUuid].size : 0) : 0,
        ipsOnline: nUuid ? (nodeIpSets[nUuid] ? nodeIpSets[nUuid].size : 0) : 0,
        countryCode: node.countryCode || node.country_code || '',
        providerUuid: node.providerUuid ?? node.provider_uuid ?? null,
        activePluginUuid: node.activePluginUuid ?? node.active_plugin_uuid ?? null,
        configProfileUuid: node.configProfileUuid ?? node.config_profile_uuid ?? null,
        tags: Array.isArray(node.tags) ? node.tags : [],
        viewPosition: node.viewPosition ?? node.view_position ?? null,
        raw: node,
        // Расширенные данные
        cpuCount: node.cpuCount ?? node.cpu_count ?? null,
        cpuUsage: node.cpuUsage ?? node.cpu_usage ?? null,
        cpuModel: node.cpuModel ?? node.cpu_model ?? null,
        memoryTotal: node.memoryTotal ?? null,
        memoryUsed: node.memoryUsed ?? null,
        system: node.system ?? null,
        versions: node.versions ?? null,
        uptime: node.uptime ?? null,
        networkDownload: node.networkDownload ?? node.download ?? null,
        networkUpload: node.networkUpload ?? node.upload ?? null,
        networkDownloadSpeed: node.networkDownloadSpeed ?? node.downloadSpeed ?? null,
        networkUploadSpeed: node.networkUploadSpeed ?? node.uploadSpeed ?? null,
        xrayVersion: node.xrayVersion ?? node.xray_version ?? null,
        isNodeOnline: node.isNodeOnline ?? node.isConnected ?? null,
        usersCount: node.usersCount ?? node.users_count ?? null,
        consumptionMultiplier: node.consumptionMultiplier ?? null,
      };
    });

    return { activeIps, nodeMap, nodesInfo };
  }

  async function fetchRemnawaveExtra(warnings) {
    const endpoints = [
      { key: 'systemRecap', path: '/api/system/stats/recap' },
      { key: 'systemStats', path: '/api/system/stats' },
      { key: 'systemHealth', path: '/api/system/health' },
      { key: 'systemStatus', path: '/api/system/status' },
      { key: 'systemMetadata', path: '/api/system/metadata' },
      { key: 'hosts', path: '/api/hosts' },
      { key: 'hostTags', path: '/api/hosts/tags' },
      { key: 'internalSquads', path: '/api/internal-squads' },
      { key: 'externalSquads', path: '/api/external-squads' },
      { key: 'configProfiles', path: '/api/config-profiles' },
      { key: 'inbounds', path: '/api/inbounds' },
      { key: 'subscriptions', path: '/api/subscriptions' },
      { key: 'subscriptionSettings', path: '/api/subscription-settings' },
      { key: 'subscriptionPageConfigs', path: '/api/subscription-page-configs' },
      { key: 'bandwidthNodes', path: '/api/bandwidth-stats/nodes' },
      { key: 'infraProviders', path: '/api/infra-billing/providers' },
      { key: 'infraNodes', path: '/api/infra-billing/nodes' },
      { key: 'infraHistory', path: '/api/infra-billing/history' },
      { key: 'snippets', path: '/api/snippets' },
      { key: 'nodePlugins', path: '/api/node-plugins' },
      { key: 'torrentStats', path: '/api/node-plugins/torrent-blocker/stats' },
    ];

    const result = {
      fetchedAt: Date.now(),
      endpoints: {},
      available: [],
      unavailable: [],
    };

    for (const endpoint of endpoints) {
      try {
        const response = await request('GET', endpoint.path, null, { allow404: true });
        if (response.statusCode === 404) {
          result.unavailable.push({ key: endpoint.key, path: endpoint.path, status: 404 });
          continue;
        }
        result.endpoints[endpoint.key] = {
          path: endpoint.path,
          status: response.statusCode,
          data: response.json || {},
        };
        result.available.push(endpoint.key);
      } catch (e) {
        result.unavailable.push({ key: endpoint.key, path: endpoint.path, error: e.message });
      }
    }

    const failed = result.unavailable.filter((item) => item.status !== 404);
    if (failed.length > 0) {
      warnings.push(`remnawave-extra: ${failed.length} endpoint(s) failed`);
    }

    return result;
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
      const hwidRaw = await api('GET', '/api/hwid/devices/top-users?limit=200');
      return extractArray(hwidRaw, ['users', 'topUsers']);
    } catch (e) {
      warnings.push(`[hwid-top] ${e.message}`);
      return [];
    }
  }

  async function fetchHwidDevices(hwidTop, users, activeIps, warnings) {
    const devicesByUser = {};
    // Пользователи с открытыми инцидентами тоже должны проверяться
    const incidentUsers = [];
    try {
      const incidents = store.getIncidents ? store.getIncidents(500) : [];
      for (const inc of incidents) {
        if (['resolved', 'false_positive', 'banned'].includes(inc.status)) continue;
        const u = users.find(usr => userAliases(usr).includes(inc.userKey));
        if (u) incidentUsers.push(u);
      }
    } catch (e) { /* ignore */ }
    const allCandidates = buildHwidDeviceCandidates(hwidTop, users, activeIps, incidentUsers);
    const mandatory = allCandidates.filter(candidate => candidate.required);
    const optionalLimit = Math.max(0, hwidDetailsLimit - mandatory.length);
    const candidates = [
      ...mandatory,
      ...allCandidates.filter(candidate => !candidate.required).slice(0, optionalLimit),
    ];
    if (mandatory.length > hwidDetailsLimit) {
      warnings.push(`[hwid-devices] mandatory candidates ${mandatory.length} exceed HWID_DETAILS_LIMIT=${hwidDetailsLimit}; fetching all mandatory users`);
    }

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

  function buildHwidDeviceCandidates(hwidTop, users, activeIps, incidentUsers = []) {
    const userLookup = buildUserLookup(users);
    const byUuid = new Map();

    const addCandidate = (source, extraAliases = [], options = {}) => {
      const user = resolveUser(source, userLookup) || source;
      const aliases = new Set([...userAliases(source), ...userAliases(user), ...extraAliases.map(String)]);
      const uuid = firstValue(user.userUuid, user.uuid, source && source.userUuid, source && source.uuid, user.id, source && source.id, user.userId);
      if (!uuid) return;

      const uuidKey = String(uuid);
      const reportedDevices = getReportedHwidCount(source, user);
      const limit = getHwidLimitForUser(user || source);
      const priority = Math.max(
        Number(options.priority || 0),
        reportedDevices >= limit && reportedDevices > 0 ? 85 : 0,
        reportedDevices > 0 ? 40 : 0
      );
      let candidate = byUuid.get(uuidKey);
      if (!candidate) {
        candidate = {
          uuid: uuidKey,
          userKey: userKey(user) || uuidKey,
          aliases: new Set([uuidKey]),
          priority: 0,
          required: false,
          reportedDevices: 0,
          reason: '',
        };
        byUuid.set(uuidKey, candidate);
      }
      if (!candidate.userKey) candidate.userKey = userKey(user) || uuidKey;
      candidate.priority = Math.max(candidate.priority || 0, priority);
      candidate.required = Boolean(candidate.required || options.required || (reportedDevices >= limit && reportedDevices > 0));
      candidate.reportedDevices = Math.max(candidate.reportedDevices || 0, reportedDevices || 0);
      if (options.reason && !candidate.reason) candidate.reason = options.reason;

      for (const alias of aliases) {
        if (alias) candidate.aliases.add(alias);
      }
    };

    // Active users and open incidents are evidence-critical. They must not be
    // pushed out by the top-users endpoint limit.
    for (const user of incidentUsers) {
      addCandidate(user, [], { required: true, priority: 100, reason: 'incident' });
    }

    for (const key of Object.keys(activeIps || {})) {
      const user = userLookup.get(String(key)) || { uuid: key, id: key };
      addCandidate(user, [key], { required: true, priority: 95, reason: 'active' });
    }

    for (const user of users || []) {
      const reportedDevices = getReportedHwidCount(user, user);
      const limit = getHwidLimitForUser(user);
      if (reportedDevices > 0 && reportedDevices >= Math.max(1, limit - 1)) {
        addCandidate(user, [], { priority: 70, required: reportedDevices >= limit, reason: 'reported_hwid' });
      }
    }

    for (const user of hwidTop || []) {
      const resolved = resolveUser(user, userLookup) || user;
      const reportedDevices = getReportedHwidCount(user, resolved);
      const limit = getHwidLimitForUser(resolved);
      addCandidate(user, [], {
        priority: reportedDevices >= limit && reportedDevices > 0 ? 90 : 50,
        required: reportedDevices >= limit && reportedDevices > 0,
        reason: 'hwid_top',
      });
    }

    return Array.from(byUuid.values())
      .map((candidate) => ({
        uuid: candidate.uuid,
        userKey: candidate.userKey || candidate.uuid,
        aliases: Array.from(candidate.aliases).filter(Boolean),
        priority: candidate.priority || 0,
        required: Boolean(candidate.required),
        reportedDevices: candidate.reportedDevices || 0,
        reason: candidate.reason || '',
      }))
      .filter((candidate) => candidate.uuid && candidate.aliases.length > 0)
      .sort((a, b) => b.priority - a.priority || b.reportedDevices - a.reportedDevices || a.userKey.localeCompare(b.userKey));
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

// userAliases импортирована из utils.js

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '');
}

function getReportedHwidCount(...sources) {
  for (const source of sources) {
    if (!source) continue;
    const value = firstValue(
      source.devicesCount,
      source.count,
      source.activeUserDevices,
      source.hwidDevicesCount,
      source.hwid_count,
      source.devices_count
    );
    if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

function getHwidLimitForUser(user) {
  const value = user && firstValue(user.hwidDeviceLimit, user.hwidDevicesLimit);
  if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 2;
}

module.exports = { createRemnawaveSync };
