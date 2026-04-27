const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createIpChecker } = require('./ip-check');
const { createRuleEngine } = require('./rules');

function createStore(options = {}) {
  const dbPath = options.dbPath || path.join(__dirname, 'data', 'remnawave-monitor.sqlite');
  const ipHistoryRetentionMs = Number(options.ipHistoryRetentionMs || 24 * 60 * 60 * 1000);
  const syncLogRetentionMs = Number(options.syncLogRetentionMs || 7 * 24 * 60 * 60 * 1000);
  const stateHistoryWindowMs = Number(options.stateHistoryWindowMs || 5 * 60 * 1000);
  const ipGeoCacheTtlMs = Number(options.ipGeoCacheTtlMs || 7 * 24 * 60 * 60 * 1000);

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      user_key TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_ips (
      user_key TEXT NOT NULL,
      ip TEXT NOT NULL,
      last_seen TEXT,
      node_uuid TEXT,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (user_key, ip)
    );

    CREATE TABLE IF NOT EXISTS ip_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ip_snapshot_ips (
      snapshot_id INTEGER NOT NULL,
      user_key TEXT NOT NULL,
      ip TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, user_key, ip),
      FOREIGN KEY (snapshot_id) REFERENCES ip_snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ip_geo_cache (
      ip TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hwid_top (
      user_key TEXT PRIMARY KEY,
      username TEXT,
      devices_count INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hwid_devices (
      user_key TEXT NOT NULL,
      device_key TEXT NOT NULL,
      hwid TEXT,
      raw_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_key, device_key)
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      reason TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS hwid_history (
      user_key TEXT NOT NULL,
      hwid TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (user_key, hwid)
    );

    CREATE TABLE IF NOT EXISTS device_account_links (
      hwid TEXT NOT NULL,
      user_key TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (hwid, user_key)
    );

    CREATE TABLE IF NOT EXISTS detection_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      ts INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      signals_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      user_key TEXT PRIMARY KEY,
      note TEXT,
      added_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_notes (
      user_key TEXT PRIMARY KEY,
      note TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banned_users (
      user_key TEXT PRIMARY KEY,
      reason TEXT,
      banned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_history (
      ts INTEGER PRIMARY KEY,
      online_count INTEGER NOT NULL DEFAULT 0,
      total_ips INTEGER NOT NULL DEFAULT 0,
      suspect_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      telegram_id TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'new',
      risk_level TEXT,
      risk_score INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolution_reason TEXT,
      operator_comment TEXT
    );

    CREATE TABLE IF NOT EXISTS incident_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER,
      user_key TEXT NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      message TEXT,
      payload_json TEXT,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_active_ips_user ON active_ips(user_key);
    CREATE INDEX IF NOT EXISTS idx_ip_snapshots_ts ON ip_snapshots(ts);
    CREATE INDEX IF NOT EXISTS idx_ip_snapshot_ips_user ON ip_snapshot_ips(user_key);
    CREATE INDEX IF NOT EXISTS idx_ip_geo_cache_updated ON ip_geo_cache(updated_at);
    CREATE INDEX IF NOT EXISTS idx_hwid_devices_user ON hwid_devices(user_key);
    CREATE INDEX IF NOT EXISTS idx_hwid_history_user ON hwid_history(user_key);
    CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_device_account_links_user ON device_account_links(user_key);
    CREATE INDEX IF NOT EXISTS idx_device_account_links_hwid ON device_account_links(hwid);
    CREATE INDEX IF NOT EXISTS idx_detection_audit_ts ON detection_audit_log(ts);
    CREATE INDEX IF NOT EXISTS idx_activity_history_ts ON activity_history(ts);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_key);
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_user ON incidents(user_key);
    CREATE INDEX IF NOT EXISTS idx_incident_events_user_ts ON incident_events(user_key, ts);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      operator TEXT,
      client_ip TEXT,
      action TEXT NOT NULL,
      target_user TEXT,
      details_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
  `);

  const setMetaStmt = db.prepare(`
    INSERT INTO meta (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  function setMeta(key, value) {
    setMetaStmt.run({
      key,
      value: JSON.stringify(value),
      updated_at: Date.now(),
    });
  }

  function getMeta(key, fallback = null) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); }
    catch { return fallback; }
  }

  const saveSnapshotTx = db.transaction((snapshot) => {
    const ts = Number(snapshot.ts || Date.now());
    const users = Array.isArray(snapshot.users) ? snapshot.users : [];
    const activeIps = snapshot.activeIps || {};
    const hwidTop = Array.isArray(snapshot.hwidTop) ? snapshot.hwidTop : [];
    const hwidDevices = snapshot.hwidDevices || {};

    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM active_ips').run();
    db.prepare('DELETE FROM hwid_top').run();
    db.prepare('DELETE FROM hwid_devices').run();

    const insertUser = db.prepare('INSERT INTO users (user_key, raw_json, updated_at) VALUES (?, ?, ?)');
    for (const user of users) {
      const key = userKey(user);
      if (!key) continue;
      insertUser.run(key, JSON.stringify(user), ts);
    }

    const insertActiveIp = db.prepare(`
      INSERT INTO active_ips (user_key, ip, last_seen, node_uuid, seen_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_key, ip) DO UPDATE SET
        last_seen = excluded.last_seen,
        node_uuid = excluded.node_uuid,
        seen_at = excluded.seen_at
    `);
    for (const [key, ips] of Object.entries(activeIps)) {
      if (!key || !Array.isArray(ips)) continue;
      for (const entry of ips) {
        const ip = typeof entry === 'string' ? entry : entry && entry.ip;
        if (!ip) continue;
        insertActiveIp.run(
          key,
          ip,
          typeof entry === 'string' ? null : entry.lastSeen || null,
          typeof entry === 'string' ? null : entry.nodeUuid || null,
          ts
        );
      }
    }

    const snapshotId = db.prepare('INSERT INTO ip_snapshots (ts) VALUES (?)').run(ts).lastInsertRowid;
    const insertSnapshotIp = db.prepare('INSERT OR IGNORE INTO ip_snapshot_ips (snapshot_id, user_key, ip) VALUES (?, ?, ?)');
    for (const [key, ips] of Object.entries(activeIps)) {
      if (!key || !Array.isArray(ips)) continue;
      for (const entry of ips) {
        const ip = typeof entry === 'string' ? entry : entry && entry.ip;
        if (ip) insertSnapshotIp.run(snapshotId, key, ip);
      }
    }

    const insertHwidTop = db.prepare(`
      INSERT INTO hwid_top (user_key, username, devices_count, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of hwidTop) {
      const key = userKey(item);
      if (!key) continue;
      insertHwidTop.run(
        key,
        item.username || item.name || null,
        Number(item.devicesCount || item.count || 0),
        JSON.stringify(item),
        ts
      );
    }

    const insertDevice = db.prepare(`
      INSERT INTO hwid_devices (user_key, device_key, hwid, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const [key, devices] of Object.entries(hwidDevices)) {
      if (!key || !Array.isArray(devices)) continue;
      devices.forEach((device, index) => {
        const hwid = device.hwid || device.deviceId || device.id || null;
        const deviceKey = String(hwid || `device-${index}`);
        insertDevice.run(key, deviceKey, hwid, JSON.stringify(device), ts);
      });
    }

    // Обновляем историю HWID для отслеживания ротации устройств
    const upsertHwidHistory = db.prepare(`
      INSERT INTO hwid_history (user_key, hwid, first_seen, last_seen)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_key, hwid) DO UPDATE SET last_seen = excluded.last_seen
    `);
    // Обновляем граф связей устройство↔аккаунт для обнаружения мультиаккаунтов
    const upsertDeviceLink = db.prepare(`
      INSERT INTO device_account_links (hwid, user_key, first_seen, last_seen)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(hwid, user_key) DO UPDATE SET last_seen = excluded.last_seen
    `);
    for (const [key, devices] of Object.entries(hwidDevices)) {
      if (!key || !Array.isArray(devices)) continue;
      for (const device of devices) {
        const hwid = device.hwid || device.deviceId || device.id || null;
        if (hwid) {
          upsertHwidHistory.run(key, String(hwid), ts, ts);
          upsertDeviceLink.run(String(hwid), key, ts, ts);
        }
      }
    }

    cleanupOldData(ts);
    setMeta('last_snapshot', {
      ts,
      userCount: users.length,
      activeUserCount: Object.keys(activeIps).length,
      hwidTopCount: hwidTop.length,
      warningCount: Array.isArray(snapshot.warnings) ? snapshot.warnings.length : 0,
      warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings.slice(0, 20) : [],
    });
  });

  function cleanupOldData(now = Date.now()) {
    const snapshotCutoff = now - ipHistoryRetentionMs;
    db.prepare('DELETE FROM ip_snapshots WHERE ts < ?').run(snapshotCutoff);

    const geoCutoff = now - ipGeoCacheTtlMs;
    db.prepare('DELETE FROM ip_geo_cache WHERE updated_at < ?').run(geoCutoff);

    const syncCutoff = now - syncLogRetentionMs;
    db.prepare('DELETE FROM sync_runs WHERE started_at < ?').run(syncCutoff);

    // Удаляем HWID-историю старше 30 дней
    const hwidCutoff = now - 30 * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM hwid_history WHERE last_seen < ?').run(hwidCutoff);
    db.prepare('DELETE FROM device_account_links WHERE last_seen < ?').run(hwidCutoff);

    // Удаляем аудит-лог старше 14 дней
    const auditCutoff = now - 14 * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM detection_audit_log WHERE ts < ?').run(auditCutoff);
  }

  function getState() {
    const users = db.prepare('SELECT raw_json FROM users ORDER BY updated_at DESC').all()
      .map((row) => parseJson(row.raw_json))
      .filter(Boolean);

    const geoByIp = getAllIpGeoCache();
    const activeIps = {};
    for (const row of db.prepare('SELECT user_key, ip, last_seen, node_uuid FROM active_ips ORDER BY user_key, ip').all()) {
      if (!activeIps[row.user_key]) activeIps[row.user_key] = [];
      activeIps[row.user_key].push({
        ip: row.ip,
        lastSeen: row.last_seen,
        nodeUuid: row.node_uuid,
        geo: geoByIp[row.ip] || null,
      });
    }
    const activeIpWindows = {
      live: activeIps,
      '5': buildAccumulatedActiveIps(geoByIp, activeIps, 5),
      '15': buildAccumulatedActiveIps(geoByIp, activeIps, 15),
      '30': buildAccumulatedActiveIps(geoByIp, activeIps, 30),
    };

    const hwidTop = db.prepare('SELECT raw_json FROM hwid_top ORDER BY devices_count DESC, username ASC').all()
      .map((row) => parseJson(row.raw_json))
      .filter(Boolean);

    const hwidDevices = {};
    for (const row of db.prepare('SELECT user_key, raw_json FROM hwid_devices ORDER BY user_key, device_key').all()) {
      if (!hwidDevices[row.user_key]) hwidDevices[row.user_key] = [];
      const device = parseJson(row.raw_json);
      if (device) hwidDevices[row.user_key].push(device);
    }

    const cutoff = Date.now() - stateHistoryWindowMs;
    const snapshots = db.prepare('SELECT id, ts FROM ip_snapshots WHERE ts >= ? ORDER BY ts ASC').all(cutoff);
    const ipHistory = snapshots.map((snapshot) => {
      const ips = {};
      const rows = db.prepare('SELECT user_key, ip FROM ip_snapshot_ips WHERE snapshot_id = ? ORDER BY user_key, ip').all(snapshot.id);
      for (const row of rows) {
        if (!ips[row.user_key]) ips[row.user_key] = [];
        ips[row.user_key].push(row.ip);
      }
      return { ts: snapshot.ts, ips };
    });

    // HWID churn: сколько уникальных HWID у пользователя за 30 дней
    const hwidChurn = {};
    const churnCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const row of db.prepare('SELECT user_key, COUNT(*) as cnt FROM hwid_history WHERE last_seen >= ? GROUP BY user_key').all(churnCutoff)) {
      hwidChurn[row.user_key] = row.cnt;
    }

    // Медианный трафик для определения аномалий
    const trafficValues = users
      .map((u) => Number(u.usedTrafficBytes || u.usedTraffic || (u.userTraffic && u.userTraffic.usedTrafficBytes) || 0))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const trafficMedian = trafficValues.length > 0
      ? trafficValues[Math.floor(trafficValues.length / 2)]
      : 0;

    return {
      users,
      activeIps,
      activeIpWindows,
      hwidTop,
      hwidDevices,
      ipHistory,
      ipStats: buildIpStats(geoByIp, activeIps),
      hwidChurn,
      trafficMedian,
      detection: getDetectionResult(),
      sync: getSyncStatus(),
      whitelist: getWhitelist(),
      userNotes: getAllNotes(),
      bannedUsers: getBannedUsers(),
      activityHistory: getActivityHistory(),
      periodComparison: getPeriodComparison(),
      incidents: getIncidents(),
      incidentStats: getIncidentStats(),
      relations: buildRelationGraph(users, geoByIp, activeIpWindows['30']),
      proxyData: ipChecker.getAllCached(),
    };
  }

  function getAllIpGeoCache() {
    const result = {};
    for (const row of db.prepare('SELECT ip, raw_json FROM ip_geo_cache').all()) {
      const geo = parseJson(row.raw_json);
      if (geo) result[row.ip] = geo;
    }
    return result;
  }

  function getIpGeoCache(ips, maxAgeMs) {
    const result = {};
    const list = Array.from(new Set((ips || []).filter(Boolean).map(String)));
    if (list.length === 0) return result;

    const cutoff = Date.now() - Number(maxAgeMs || ipGeoCacheTtlMs);
    const select = db.prepare('SELECT ip, raw_json FROM ip_geo_cache WHERE ip = ? AND updated_at >= ?');
    for (const ip of list) {
      const row = select.get(ip, cutoff);
      if (!row) continue;
      const geo = parseJson(row.raw_json);
      if (geo) result[ip] = geo;
    }

    return result;
  }

  function buildAccumulatedActiveIps(geoByIp, liveActiveIps, minutes) {
    const cutoff = Date.now() - Number(minutes || 15) * 60 * 1000;
    const rows = db.prepare(`
      SELECT s.ts, i.user_key, i.ip
      FROM ip_snapshot_ips i
      JOIN ip_snapshots s ON s.id = i.snapshot_id
      WHERE s.ts >= ?
      ORDER BY s.ts ASC
    `).all(cutoff);

    const liveIndex = new Map();
    for (const [key, entries] of Object.entries(liveActiveIps || {})) {
      for (const entry of entries || []) {
        const ip = typeof entry === 'string' ? entry : entry && entry.ip;
        if (!ip) continue;
        liveIndex.set(`${key}\n${ip}`, typeof entry === 'string' ? { ip } : entry);
      }
    }

    const byUser = {};
    const touch = (user, ip, ts, currentEntry = null) => {
      if (!user || !ip) return;
      if (!byUser[user]) byUser[user] = {};
      const current = byUser[user][ip] || {
        ip,
        firstSeenAt: ts,
        lastSeenAt: ts,
        seenCount: 0,
        current: false,
      };
      current.firstSeenAt = Math.min(current.firstSeenAt, ts);
      current.lastSeenAt = Math.max(current.lastSeenAt, ts);
      current.seenCount += 1;
      if (currentEntry) {
        current.current = true;
        current.nodeUuid = currentEntry.nodeUuid || currentEntry.node_uuid || current.nodeUuid || null;
        current.lastSeen = currentEntry.lastSeen || currentEntry.last_seen || new Date(ts).toISOString();
      }
      byUser[user][ip] = current;
    };

    for (const row of rows) {
      touch(row.user_key, row.ip, Number(row.ts || Date.now()), liveIndex.get(`${row.user_key}\n${row.ip}`) || null);
    }

    for (const [key, entries] of Object.entries(liveActiveIps || {})) {
      for (const entry of entries || []) {
        const ip = typeof entry === 'string' ? entry : entry && entry.ip;
        if (!ip) continue;
        touch(key, ip, Date.now(), typeof entry === 'string' ? { ip } : entry);
      }
    }

    const result = {};
    for (const [key, ipMap] of Object.entries(byUser)) {
      result[key] = Object.values(ipMap)
        .map((entry) => ({
          ip: entry.ip,
          lastSeen: entry.lastSeen || new Date(entry.lastSeenAt).toISOString(),
          firstSeenAt: entry.firstSeenAt,
          lastSeenAt: entry.lastSeenAt,
          seenCount: entry.seenCount,
          current: Boolean(entry.current),
          nodeUuid: entry.nodeUuid || null,
          geo: geoByIp[entry.ip] || null,
        }))
        .sort((a, b) => {
          if (a.current !== b.current) return a.current ? -1 : 1;
          return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
        });
    }
    return result;
  }

  function buildRelationGraph(users, geoByIp, activeWindowIps) {
    const userNames = {};
    for (const user of users || []) {
      const key = userKey(user);
      if (key) userNames[key] = user.username || user.name || key;
    }

    const userRef = (key) => ({
      key,
      name: userNames[key] || key,
    });

    const ipMap = new Map();
    const asnMap = new Map();
    for (const [key, entries] of Object.entries(activeWindowIps || {})) {
      for (const entry of entries || []) {
        const ip = typeof entry === 'string' ? entry : entry && entry.ip;
        if (!ip) continue;
        const geo = geoByIp[ip] || entry.geo || null;
        const lastSeenAt = Number(entry.lastSeenAt || Date.now());

        if (!ipMap.has(ip)) {
          ipMap.set(ip, { ip, geo, users: new Map(), lastSeenAt: 0 });
        }
        const ipItem = ipMap.get(ip);
        ipItem.users.set(key, userRef(key));
        ipItem.lastSeenAt = Math.max(ipItem.lastSeenAt, lastSeenAt);

        const asnKey = geo && geo.asn ? String(geo.asn) : '';
        if (asnKey) {
          if (!asnMap.has(asnKey)) {
            asnMap.set(asnKey, {
              asn: geo.asn,
              org: geo.org || geo.isp || '',
              country: geo.countryCode || geo.country || '',
              users: new Map(),
              ips: new Set(),
            });
          }
          const asnItem = asnMap.get(asnKey);
          asnItem.users.set(key, userRef(key));
          asnItem.ips.add(ip);
        }
      }
    }

    const ipClusters = Array.from(ipMap.values())
      .filter((item) => item.users.size >= 2)
      .map((item) => ({
        ip: item.ip,
        geo: item.geo || null,
        users: Array.from(item.users.values()).slice(0, 20),
        userCount: item.users.size,
        lastSeenAt: item.lastSeenAt,
      }))
      .sort((a, b) => b.userCount - a.userCount || b.lastSeenAt - a.lastSeenAt)
      .slice(0, 30);

    const asnClusters = Array.from(asnMap.values())
      .filter((item) => item.users.size >= 2)
      .map((item) => ({
        asn: item.asn,
        org: item.org,
        country: item.country,
        users: Array.from(item.users.values()).slice(0, 30),
        ips: Array.from(item.ips).slice(0, 20),
        userCount: item.users.size,
        ipCount: item.ips.size,
      }))
      .sort((a, b) => b.userCount - a.userCount || b.ipCount - a.ipCount)
      .slice(0, 25);

    const hwidCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const hwidRows = db.prepare(`
      SELECT dal.hwid, dal.user_key, dal.first_seen, dal.last_seen,
             hd.raw_json AS device_json
      FROM device_account_links dal
      LEFT JOIN hwid_devices hd ON hd.hwid = dal.hwid
      WHERE dal.last_seen >= ?
      ORDER BY dal.last_seen DESC
    `).all(hwidCutoff);

    // Build user limits map
    const userLimits = {};
    for (const u of users || []) {
      const key = userKey(u);
      if (key) {
        userLimits[key] = Number(u.hwidDeviceLimit || u.activeUserDevices || u.deviceLimit || 2);
      }
    }

    const userRefWithLimit = (key) => ({
      key,
      name: userNames[key] || key,
      hwidLimit: userLimits[key] || 2,
    });

    const hwidMap = new Map();
    for (const row of hwidRows) {
      if (!row.hwid || !row.user_key) continue;
      if (!hwidMap.has(row.hwid)) {
        // Parse device info from raw_json
        let deviceInfo = null;
        try {
          if (row.device_json) {
            const raw = JSON.parse(row.device_json);
            deviceInfo = {
              os: raw.os || raw.platform || '',
              model: raw.model || raw.deviceModel || raw.device || '',
              appVersion: raw.appVersion || raw.version || '',
            };
          }
        } catch (e) { /* ignore */ }

        hwidMap.set(row.hwid, {
          hwid: row.hwid,
          users: new Map(),
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          deviceInfo,
        });
      }
      const item = hwidMap.get(row.hwid);
      item.users.set(row.user_key, userRefWithLimit(row.user_key));
      item.firstSeen = Math.min(item.firstSeen, row.first_seen);
      item.lastSeen = Math.max(item.lastSeen, row.last_seen);
    }

    const hwidClusters = Array.from(hwidMap.values())
      .filter((item) => item.users.size >= 2)
      .map((item) => ({
        hwid: item.hwid,
        users: Array.from(item.users.values()).slice(0, 20),
        userCount: item.users.size,
        firstSeen: item.firstSeen,
        lastSeen: item.lastSeen,
        deviceInfo: item.deviceInfo,
      }))
      .sort((a, b) => b.userCount - a.userCount || b.lastSeen - a.lastSeen)
      .slice(0, 30);

    return {
      generatedAt: Date.now(),
      summary: {
        sharedIps: ipClusters.length,
        sharedAsns: asnClusters.length,
        sharedHwids: hwidClusters.length,
      },
      ipClusters,
      asnClusters,
      hwidClusters,
    };
  }

  const saveIpGeoCacheTx = db.transaction((items) => {
    const now = Date.now();
    const insert = db.prepare(`
      INSERT INTO ip_geo_cache (ip, raw_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    for (const [ip, geo] of Object.entries(items || {})) {
      if (!ip || !geo) continue;
      insert.run(ip, JSON.stringify(geo), now);
    }
  });

  function buildIpStats(geoByIp, activeIps) {
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const cutoff30m = Date.now() - 30 * 60 * 1000;
    const rows = db.prepare(`
      SELECT s.ts, i.user_key, i.ip
      FROM ip_snapshot_ips i
      JOIN ip_snapshots s ON s.id = i.snapshot_id
      WHERE s.ts >= ?
      ORDER BY i.user_key, s.ts ASC
    `).all(cutoff24h);

    const work = {};

    for (const row of rows) {
      if (!work[row.user_key]) {
        work[row.user_key] = {
          ips: new Set(),
          networks: new Set(),
          countries: new Map(),
          asns: new Map(),
          orgs: new Map(),
          recentCountries: new Set(),
          hostingIps: new Set(),
          proxyIps: new Set(),
          vpnIps: new Set(),
        };
      }

      const item = work[row.user_key];
      item.ips.add(row.ip);
      item.networks.add(ipNetworkKey(row.ip));

      const geo = geoByIp[row.ip];
      if (!geo) continue;

      const countryKey = geo.countryCode || geo.country || '';
      if (countryKey) {
        addMapCount(item.countries, countryKey, {
          code: geo.countryCode || '',
          name: geo.country || geo.countryCode || '',
        });
        if (row.ts >= cutoff30m) item.recentCountries.add(countryKey);
      }

      const asnKey = geo.asn ? String(geo.asn) : '';
      if (asnKey) {
        addMapCount(item.asns, asnKey, {
          asn: geo.asn,
          org: geo.org || geo.isp || '',
        });
      }

      const orgKey = geo.org || geo.isp || '';
      if (orgKey) addMapCount(item.orgs, orgKey, { org: orgKey });

      if (geo.hosting) item.hostingIps.add(row.ip);
      if (geo.proxy) item.proxyIps.add(row.ip);
      if (geo.vpn) item.vpnIps.add(row.ip);
    }

    // Подсчёт одновременных подключений из разных стран
    // Проверяем activeIps: если у пользователя есть IP с lastSeen < 120с
    // из разных стран — это сильнейший сигнал шаринга
    const concurrentByUser = {};
    const CONCURRENT_WINDOW_MS = 120 * 1000; // 2 минуты
    for (const [userKey, ipEntries] of Object.entries(activeIps || {})) {
      if (!Array.isArray(ipEntries) || ipEntries.length < 2) continue;
      const now = Date.now();
      const freshEntries = ipEntries
        .filter((e) => {
          if (!e || !e.ip) return false;
          if (!e.lastSeen) return true; // нет времени — считаем свежим
          const ts = new Date(e.lastSeen).getTime();
          return Number.isFinite(ts) && now - ts <= CONCURRENT_WINDOW_MS;
        })
        .map((e) => {
          const geo = geoByIp[e.ip];
          return { ip: e.ip, lastSeen: e.lastSeen, country: geo && (geo.countryCode || geo.country) || '' };
        })
        .filter((e) => e.country);

      let pairs = 0;
      for (let i = 0; i < freshEntries.length; i++) {
        for (let j = i + 1; j < freshEntries.length; j++) {
          if (freshEntries[i].country !== freshEntries[j].country) pairs++;
        }
      }
      if (pairs > 0) concurrentByUser[userKey] = pairs;
    }

    const result = {};
    for (const [key, item] of Object.entries(work)) {
      result[key] = {
        uniqueIps24h: item.ips.size,
        uniqueNetworks24h: item.networks.size,
        countries24h: mapValues(item.countries),
        asns24h: mapValues(item.asns),
        orgs24h: mapValues(item.orgs).slice(0, 8),
        hostingIpCount: item.hostingIps.size,
        proxyIpCount: item.proxyIps.size,
        vpnIpCount: item.vpnIps.size,
        recentCountryCount30m: item.recentCountries.size,
        concurrentDiffCountryPairs: concurrentByUser[key] || 0,
      };
    }

    // Добавляем concurrent данные для пользователей без истории IP
    for (const [key, pairs] of Object.entries(concurrentByUser)) {
      if (!result[key]) {
        result[key] = {
          uniqueIps24h: 0, uniqueNetworks24h: 0,
          countries24h: [], asns24h: [], orgs24h: [],
          hostingIpCount: 0, proxyIpCount: 0, vpnIpCount: 0,
          recentCountryCount30m: 0,
          concurrentDiffCountryPairs: pairs,
        };
      }
    }

    return result;
  }

  function startSyncRun(reason) {
    const startedAt = Date.now();
    const runId = db.prepare('INSERT INTO sync_runs (started_at, status, reason) VALUES (?, ?, ?)').run(startedAt, 'running', reason || null).lastInsertRowid;
    setMeta('sync_status', {
      isSyncing: true,
      status: 'running',
      reason: reason || null,
      lastStartedAt: startedAt,
      lastFinishedAt: getSyncStatus().lastFinishedAt || null,
      nextSyncAt: null,
      error: null,
    });
    return runId;
  }

  function finishSyncRun(runId, status, error, nextSyncAt) {
    const finishedAt = Date.now();
    db.prepare('UPDATE sync_runs SET finished_at = ?, status = ?, error = ? WHERE id = ?')
      .run(finishedAt, status, error ? String(error).slice(0, 2000) : null, runId);
    const previous = getSyncStatus();
    setMeta('sync_status', {
      isSyncing: false,
      status,
      reason: previous.reason || null,
      lastStartedAt: previous.lastStartedAt || null,
      lastFinishedAt: finishedAt,
      nextSyncAt: nextSyncAt || null,
      error: error ? String(error).slice(0, 2000) : null,
    });
    cleanupOldData(finishedAt);
  }

  function markNextSync(nextSyncAt) {
    const previous = getSyncStatus();
    setMeta('sync_status', {
      ...previous,
      nextSyncAt: nextSyncAt || null,
    });
  }

  function getSyncStatus() {
    const status = getMeta('sync_status', null);
    const snapshot = getMeta('last_snapshot', null);
    return {
      isSyncing: Boolean(status && status.isSyncing),
      status: status ? status.status : 'idle',
      reason: status ? status.reason : null,
      lastStartedAt: status ? status.lastStartedAt : null,
      lastFinishedAt: status ? status.lastFinishedAt : null,
      nextSyncAt: status ? status.nextSyncAt : null,
      error: status ? status.error : null,
      snapshot,
    };
  }

  function saveDetectionResult(result) {
    setMeta('detection_result', result);
  }

  function getDetectionResult() {
    return getMeta('detection_result', null);
  }

  function saveAuditEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const now = Date.now();
    const insert = db.prepare(`
      INSERT INTO detection_audit_log (user_key, ts, risk_level, risk_score, signals_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
      for (const entry of entries) {
        if (!entry.userKey) continue;
        insert.run(
          entry.userKey,
          now,
          entry.level || 'clean',
          entry.score || 0,
          JSON.stringify(entry.signals || [])
        );
      }
    });
    tx();
  }

  const INCIDENT_STATUSES = new Set(['new', 'reviewing', 'warned', 'resolved', 'false_positive', 'banned']);
  const CLOSED_INCIDENT_STATUSES = new Set(['resolved', 'false_positive', 'banned']);

  function normalizeIncidentStatus(status, fallback = 'new') {
    const value = String(status || '').trim();
    return INCIDENT_STATUSES.has(value) ? value : fallback;
  }

  function getIncidentRow(userKeyValue) {
    if (!userKeyValue) return null;
    return db.prepare('SELECT * FROM incidents WHERE user_key = ?').get(userKeyValue) || null;
  }

  function insertIncidentEvent(incidentId, userKeyValue, type, message, payload, status) {
    db.prepare(`
      INSERT INTO incident_events (incident_id, user_key, ts, type, status, message, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      incidentId || null,
      userKeyValue,
      Date.now(),
      type,
      status || null,
      message || null,
      payload ? JSON.stringify(payload) : null
    );
  }

  function createIncident(userKeyValue, seed = {}) {
    const now = Date.now();
    const status = normalizeIncidentStatus(seed.status || 'new');
    const result = db.prepare(`
      INSERT INTO incidents (
        user_key, status, risk_level, risk_score, reason,
        first_seen, last_seen, updated_at, resolved_at, resolution_reason, operator_comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userKeyValue,
      status,
      seed.riskLevel || null,
      Number(seed.riskScore || 0),
      seed.reason || null,
      seed.firstSeen || now,
      seed.lastSeen || now,
      now,
      CLOSED_INCIDENT_STATUSES.has(status) ? now : null,
      seed.resolutionReason || null,
      seed.operatorComment || null
    );
    return result.lastInsertRowid;
  }

  function syncIncidentsFromDetection(detection) {
    if (!detection) return;
    const entries = [
      ...(Array.isArray(detection.suspects) ? detection.suspects : []),
      ...(Array.isArray(detection.observed) ? detection.observed : []),
    ];
    if (entries.length === 0) return;

    const now = Date.now();
    const update = db.prepare(`
      UPDATE incidents
      SET status = ?, risk_level = ?, risk_score = ?, reason = ?, last_seen = ?, updated_at = ?,
          resolved_at = ?, resolution_reason = ?
      WHERE id = ?
    `);

    const tx = db.transaction(() => {
      for (const entry of entries) {
        const key = String(entry.key || entry.userKey || '');
        if (!key) continue;

        const incoming = {
          riskLevel: entry.riskLevel || 'notice',
          riskScore: Number(entry.riskScore || 0),
          reason: entry.reason || (Array.isArray(entry.signals) ? entry.signals.map(s => s.id || s.reason).filter(Boolean).join(', ') : null),
          signals: Array.isArray(entry.signals) ? entry.signals.map(s => ({
            id: s.id, reason: s.reason, points: s.points, category: s.category,
          })) : [],
        };
        const existing = getIncidentRow(key);

        if (!existing) {
          const id = createIncident(key, {
            status: 'new',
            riskLevel: incoming.riskLevel,
            riskScore: incoming.riskScore,
            reason: incoming.reason,
            firstSeen: now,
            lastSeen: now,
          });
          insertIncidentEvent(id, key, 'incident_opened', 'Инцидент создан системой детекции', { detection: incoming, signals: incoming.signals }, 'new');
          continue;
        }

        let nextStatus = existing.status;
        let resolvedAt = existing.resolved_at;
        let resolutionReason = existing.resolution_reason;
        if (CLOSED_INCIDENT_STATUSES.has(existing.status) && existing.status !== 'banned') {
          nextStatus = 'new';
          resolvedAt = null;
          resolutionReason = null;
          insertIncidentEvent(existing.id, key, 'incident_reopened', 'Инцидент снова активен по данным детекции', { previousStatus: existing.status, detection: incoming }, nextStatus);
        }

        update.run(
          nextStatus,
          incoming.riskLevel,
          incoming.riskScore,
          incoming.reason,
          now,
          now,
          resolvedAt,
          resolutionReason,
          existing.id
        );

        if (existing.risk_level !== incoming.riskLevel || Number(existing.risk_score || 0) !== incoming.riskScore) {
          insertIncidentEvent(existing.id, key, 'risk_updated', 'Обновлена оценка риска', {
            previousLevel: existing.risk_level,
            previousScore: existing.risk_score,
            riskLevel: incoming.riskLevel,
            riskScore: incoming.riskScore,
            signals: incoming.signals,
          }, nextStatus);
        }
      }
    });
    tx();
  }

  function getIncidents(limit = 200) {
    const usersByKey = {};
    for (const row of db.prepare('SELECT user_key, raw_json FROM users').all()) {
      const user = parseJson(row.raw_json);
      if (user) usersByKey[row.user_key] = user;
    }

    return db.prepare(`
      SELECT i.*,
        (SELECT MAX(ts) FROM incident_events e WHERE e.incident_id = i.id) AS last_event_at,
        (SELECT COUNT(*) FROM incident_events e WHERE e.incident_id = i.id) AS event_count
      FROM incidents i
      ORDER BY
        CASE i.status
          WHEN 'new' THEN 0
          WHEN 'reviewing' THEN 1
          WHEN 'warned' THEN 2
          WHEN 'banned' THEN 3
          WHEN 'resolved' THEN 4
          WHEN 'false_positive' THEN 5
          ELSE 6
        END,
        i.risk_score DESC,
        i.last_seen DESC
      LIMIT ?
    `).all(Number(limit || 200)).map((row) => {
      const user = usersByKey[row.user_key] || null;
      return {
        id: row.id,
        userKey: row.user_key,
        username: user ? (user.username || user.name || row.user_key) : row.user_key,
        status: row.status,
        riskLevel: row.risk_level,
        riskScore: row.risk_score,
        reason: row.reason,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        updatedAt: row.updated_at,
        resolvedAt: row.resolved_at,
        resolutionReason: row.resolution_reason,
        operatorComment: row.operator_comment,
        lastEventAt: row.last_event_at,
        eventCount: row.event_count,
      };
    });
  }

  function getIncidentStats() {
    const result = {
      new: 0,
      reviewing: 0,
      warned: 0,
      resolved: 0,
      false_positive: 0,
      banned: 0,
      open: 0,
      total: 0,
    };
    for (const row of db.prepare('SELECT status, COUNT(*) AS cnt FROM incidents GROUP BY status').all()) {
      const status = normalizeIncidentStatus(row.status, row.status);
      result[status] = row.cnt;
      result.total += row.cnt;
      if (!CLOSED_INCIDENT_STATUSES.has(status)) result.open += row.cnt;
    }
    return result;
  }

  function updateIncident(userKeyValue, patch = {}) {
    const key = String(userKeyValue || '');
    if (!key) throw new Error('userKey is required');

    const existing = getIncidentRow(key);
    const now = Date.now();
    const status = patch.status !== undefined
      ? normalizeIncidentStatus(patch.status, existing ? existing.status : 'reviewing')
      : (existing ? existing.status : 'reviewing');
    const operatorComment = Object.prototype.hasOwnProperty.call(patch, 'operatorComment')
      ? String(patch.operatorComment || '').trim()
      : (existing ? existing.operator_comment : null);
    const resolutionReason = Object.prototype.hasOwnProperty.call(patch, 'resolutionReason')
      ? String(patch.resolutionReason || '').trim()
      : (existing ? existing.resolution_reason : null);
    const resolvedAt = CLOSED_INCIDENT_STATUSES.has(status)
      ? (existing && existing.resolved_at ? existing.resolved_at : now)
      : null;

    let id = existing && existing.id;
    if (!id) {
      id = createIncident(key, {
        status,
        firstSeen: now,
        lastSeen: now,
        resolutionReason,
        operatorComment,
      });
      insertIncidentEvent(id, key, 'incident_created', 'Инцидент создан оператором', patch, status);
    } else {
      db.prepare(`
        UPDATE incidents
        SET status = ?, updated_at = ?, resolved_at = ?, resolution_reason = ?, operator_comment = ?
        WHERE id = ?
      `).run(status, now, resolvedAt, resolutionReason || null, operatorComment || null, id);
    }

    if (!existing || existing.status !== status) {
      insertIncidentEvent(id, key, 'status_changed', `Статус изменён на ${status}`, { previousStatus: existing && existing.status, status }, status);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'operatorComment')) {
      insertIncidentEvent(id, key, 'comment_updated', operatorComment ? 'Обновлён комментарий оператора' : 'Комментарий оператора очищен', { operatorComment }, status);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'resolutionReason') && resolutionReason) {
      insertIncidentEvent(id, key, 'resolution_reason', resolutionReason, { resolutionReason }, status);
    }

    return getIncidentRow(key);
  }

  function recordIncidentEvent(userKeyValue, type, message, payload = null, options = {}) {
    const key = String(userKeyValue || '');
    if (!key) return;
    let incident = getIncidentRow(key);
    let incidentId = incident && incident.id;
    const status = options.status ? normalizeIncidentStatus(options.status, incident ? incident.status : 'reviewing') : (incident && incident.status);

    if (!incidentId && options.create) {
      incidentId = createIncident(key, {
        status: status || 'reviewing',
        reason: message || null,
      });
      incident = getIncidentRow(key);
    }

    if (incidentId && options.status && incident && incident.status !== status) {
      const resolvedAt = CLOSED_INCIDENT_STATUSES.has(status) ? Date.now() : null;
      db.prepare('UPDATE incidents SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?')
        .run(status, Date.now(), resolvedAt, incidentId);
    }

    insertIncidentEvent(incidentId || null, key, type, message, payload, status || null);
  }

  // ── Whitelist ──
  function addToWhitelist(userKey, note) {
    db.prepare('INSERT OR REPLACE INTO whitelist (user_key, note, added_at) VALUES (?, ?, ?)').run(userKey, note || null, Date.now());
    recordIncidentEvent(userKey, 'whitelist_added', 'Пользователь добавлен в белый список', { note: note || null }, { create: false });
  }
  function removeFromWhitelist(userKey) {
    db.prepare('DELETE FROM whitelist WHERE user_key = ?').run(userKey);
    recordIncidentEvent(userKey, 'whitelist_removed', 'Пользователь удалён из белого списка', null, { create: false });
  }
  function getWhitelist() {
    return db.prepare('SELECT user_key, note, added_at FROM whitelist ORDER BY added_at DESC').all()
      .map(r => ({ userKey: r.user_key, note: r.note, addedAt: r.added_at }));
  }
  function isWhitelisted(userKey) {
    return !!db.prepare('SELECT 1 FROM whitelist WHERE user_key = ?').get(userKey);
  }

  // ── User Notes ──
  function setUserNote(userKey, note) {
    if (!note || !note.trim()) {
      db.prepare('DELETE FROM user_notes WHERE user_key = ?').run(userKey);
      return;
    }
    db.prepare('INSERT OR REPLACE INTO user_notes (user_key, note, updated_at) VALUES (?, ?, ?)').run(userKey, note.trim(), Date.now());
  }
  function getAllNotes() {
    const result = {};
    for (const r of db.prepare('SELECT user_key, note, updated_at FROM user_notes').all()) {
      result[r.user_key] = { note: r.note, updatedAt: r.updated_at };
    }
    return result;
  }

  // ── Banned Users (local flag) ──
  function banUser(userKey, reason) {
    db.prepare('INSERT OR REPLACE INTO banned_users (user_key, reason, banned_at) VALUES (?, ?, ?)').run(userKey, reason || null, Date.now());
    recordIncidentEvent(userKey, 'user_banned', reason || 'Пользователь заблокирован', { reason: reason || null }, { create: true, status: 'banned' });
  }
  function unbanUser(userKey) {
    db.prepare('DELETE FROM banned_users WHERE user_key = ?').run(userKey);
    recordIncidentEvent(userKey, 'user_unbanned', 'Пользователь разблокирован', null, { create: true, status: 'reviewing' });
  }
  function getBannedUsers() {
    const result = {};
    for (const r of db.prepare('SELECT user_key, reason, banned_at FROM banned_users').all()) {
      result[r.user_key] = { reason: r.reason, bannedAt: r.banned_at };
    }
    return result;
  }

  // ── Activity History ──
  function recordActivity(onlineCount, totalIps, suspectCount) {
    const ts = Math.floor(Date.now() / 60000) * 60000; // округление до минуты
    db.prepare('INSERT OR REPLACE INTO activity_history (ts, online_count, total_ips, suspect_count) VALUES (?, ?, ?, ?)').run(ts, onlineCount, totalIps, suspectCount);
    // Удаляем старше 7 дней
    db.prepare('DELETE FROM activity_history WHERE ts < ?').run(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }
  function getActivityHistory() {
    return db.prepare('SELECT ts, online_count, total_ips, suspect_count FROM activity_history ORDER BY ts ASC').all()
      .map(r => ({ ts: r.ts, online: r.online_count, ips: r.total_ips, suspects: r.suspect_count }));
  }

  // ── User Notifications ──
  function saveNotification(userKey, telegramId, message, status) {
    db.prepare('INSERT INTO user_notifications (user_key, telegram_id, message, status, sent_at) VALUES (?, ?, ?, ?, ?)').run(
      userKey, telegramId || null, message, status || 'sent', Date.now()
    );
    recordIncidentEvent(
      userKey,
      status === 'sent' ? 'notification_sent' : 'notification_failed',
      status === 'sent' ? 'Отправлено предупреждение пользователю' : `Ошибка отправки предупреждения: ${status || 'unknown'}`,
      { telegramId: telegramId || null, status: status || 'sent', preview: String(message || '').replace(/<[^>]*>/g, '').slice(0, 180) },
      { create: status === 'sent', status: status === 'sent' ? 'warned' : null }
    );
  }
  function getNotifications(userKey) {
    return db.prepare('SELECT id, user_key, telegram_id, message, status, sent_at FROM user_notifications WHERE user_key = ? ORDER BY sent_at DESC LIMIT 20').all(userKey)
      .map(r => ({ id: r.id, userKey: r.user_key, telegramId: r.telegram_id, message: r.message, status: r.status, sentAt: r.sent_at }));
  }
  function getAllNotificationCounts() {
    const result = {};
    for (const r of db.prepare('SELECT user_key, COUNT(*) as cnt FROM user_notifications GROUP BY user_key').all()) {
      result[r.user_key] = r.cnt;
    }
    return result;
  }

  // ── Period Comparison ──
  function getPeriodComparison() {
    const now = Date.now();
    const h24ago = now - 24 * 60 * 60 * 1000;
    const h48ago = now - 48 * 60 * 60 * 1000;

    const todayRows = db.prepare('SELECT online_count, suspect_count FROM activity_history WHERE ts >= ?').all(h24ago);
    const yesterdayRows = db.prepare('SELECT online_count, suspect_count FROM activity_history WHERE ts >= ? AND ts < ?').all(h48ago, h24ago);

    const avg = (rows, field) => rows.length ? rows.reduce((s, r) => s + r[field], 0) / rows.length : 0;
    const max = (rows, field) => rows.length ? Math.max(...rows.map(r => r[field])) : 0;

    return {
      onlineAvgToday: Math.round(avg(todayRows, 'online_count')),
      onlineAvgYesterday: Math.round(avg(yesterdayRows, 'online_count')),
      onlineMaxToday: max(todayRows, 'online_count'),
      onlineMaxYesterday: max(yesterdayRows, 'online_count'),
      suspectsMaxToday: max(todayRows, 'suspect_count'),
      suspectsMaxYesterday: max(yesterdayRows, 'suspect_count'),
    };
  }

  // ── User Connection History ──
  function getUserHistory(userKey, hours = 24) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    // IP connection events from snapshots
    const ipEvents = db.prepare(`
      SELECT s.ts, i.ip
      FROM ip_snapshot_ips i
      JOIN ip_snapshots s ON s.id = i.snapshot_id
      WHERE i.user_key = ? AND s.ts >= ?
      ORDER BY s.ts ASC
    `).all(userKey, cutoff);

    // Enrich with geo
    const uniqueIps = [...new Set(ipEvents.map(e => e.ip))];
    const geoMap = {};
    if (uniqueIps.length > 0) {
      const select = db.prepare('SELECT ip, raw_json FROM ip_geo_cache WHERE ip = ?');
      for (const ip of uniqueIps) {
        const row = select.get(ip);
        if (row) geoMap[ip] = parseJson(row.raw_json);
      }
    }

    // Build timeline: group events by 5-minute windows
    const WINDOW_MS = 5 * 60 * 1000;
    const windows = new Map();
    for (const event of ipEvents) {
      const windowTs = Math.floor(event.ts / WINDOW_MS) * WINDOW_MS;
      if (!windows.has(windowTs)) windows.set(windowTs, new Set());
      windows.get(windowTs).add(event.ip);
    }

    const timeline = [];
    for (const [ts, ips] of windows) {
      const ipList = [...ips].map(ip => ({
        ip,
        geo: geoMap[ip] || null,
      }));
      timeline.push({ ts, ips: ipList });
    }

    // HWID history
    const hwidEvents = db.prepare(`
      SELECT hwid, first_seen, last_seen
      FROM hwid_history
      WHERE user_key = ?
      ORDER BY first_seen ASC
    `).all(userKey);

    // Device account links (who else used same HWIDs)
    const linkedAccounts = {};
    if (hwidEvents.length > 0) {
      const selectLinks = db.prepare('SELECT hwid, user_key, first_seen, last_seen FROM device_account_links WHERE hwid = ? AND user_key != ?');
      for (const h of hwidEvents) {
        const links = selectLinks.all(h.hwid, userKey);
        if (links.length > 0) linkedAccounts[h.hwid] = links.map(l => ({ userKey: l.user_key, firstSeen: l.first_seen, lastSeen: l.last_seen }));
      }
    }

    // Detection audit log
    const auditLog = db.prepare(`
      SELECT ts, risk_level, risk_score, signals_json
      FROM detection_audit_log
      WHERE user_key = ?
      ORDER BY ts DESC
      LIMIT 20
    `).all(userKey).map(r => ({
      ts: r.ts,
      riskLevel: r.risk_level,
      riskScore: r.risk_score,
      signals: parseJson(r.signals_json) || [],
    }));

    const events = [];

    const firstIpSeen = new Map();
    for (const event of ipEvents) {
      if (!firstIpSeen.has(event.ip)) firstIpSeen.set(event.ip, event.ts);
    }
    for (const [ip, ts] of firstIpSeen.entries()) {
      const geo = geoMap[ip] || null;
      events.push({
        ts,
        type: 'ip_first_seen',
        title: 'Новый IP в окне истории',
        detail: ip,
        meta: {
          ip,
          country: geo && (geo.countryCode || geo.country) || '',
          asn: geo && geo.asn || '',
          org: geo && (geo.org || geo.isp) || '',
        },
      });
    }

    let previousCountries = new Set();
    let previousAsns = new Set();
    for (const point of timeline) {
      const countries = new Set();
      const asns = new Set();
      for (const item of point.ips || []) {
        const geo = item.geo || {};
        const country = geo.countryCode || geo.country || '';
        const asn = geo.asn ? String(geo.asn) : '';
        if (country) countries.add(country);
        if (asn) asns.add(asn);
      }
      const newCountries = Array.from(countries).filter((country) => !previousCountries.has(country));
      const newAsns = Array.from(asns).filter((asn) => !previousAsns.has(asn));
      if (previousCountries.size > 0 && newCountries.length > 0) {
        events.push({
          ts: point.ts,
          type: 'country_changed',
          title: 'Появилась новая страна',
          detail: newCountries.join(', '),
          meta: { countries: newCountries },
        });
      }
      if (previousAsns.size > 0 && newAsns.length > 0) {
        events.push({
          ts: point.ts,
          type: 'asn_changed',
          title: 'Появился новый ASN',
          detail: newAsns.map((asn) => `AS${asn}`).join(', '),
          meta: { asns: newAsns },
        });
      }
      if (countries.size > 0) previousCountries = countries;
      if (asns.size > 0) previousAsns = asns;
    }

    for (const h of hwidEvents) {
      if (Number(h.first_seen || 0) >= cutoff) {
        events.push({
          ts: h.first_seen,
          type: 'hwid_added',
          title: 'Добавлен HWID',
          detail: String(h.hwid || '').slice(0, 24),
          meta: { hwid: h.hwid },
        });
      }
    }

    for (const row of auditLog) {
      events.push({
        ts: row.ts,
        type: 'detection',
        title: 'Сработала детекция',
        detail: `${row.riskLevel} · ${row.riskScore}/100`,
        meta: { riskLevel: row.riskLevel, riskScore: row.riskScore, signals: row.signals },
      });
    }

    const notificationEvents = db.prepare(`
      SELECT telegram_id, message, status, sent_at
      FROM user_notifications
      WHERE user_key = ? AND sent_at >= ?
      ORDER BY sent_at DESC
      LIMIT 30
    `).all(userKey, cutoff);
    for (const row of notificationEvents) {
      events.push({
        ts: row.sent_at,
        type: row.status === 'sent' ? 'notification_sent' : 'notification_failed',
        title: row.status === 'sent' ? 'Отправлено предупреждение' : 'Ошибка уведомления',
        detail: String(row.message || '').replace(/<[^>]*>/g, '').slice(0, 140),
        meta: { telegramId: row.telegram_id, status: row.status },
      });
    }

    const incidentEvents = db.prepare(`
      SELECT ts, type, status, message, payload_json
      FROM incident_events
      WHERE user_key = ? AND ts >= ?
      ORDER BY ts DESC
      LIMIT 50
    `).all(userKey, cutoff);
    for (const row of incidentEvents) {
      events.push({
        ts: row.ts,
        type: row.type,
        title: incidentEventTitle(row.type),
        detail: row.message || row.status || '',
        meta: parseJson(row.payload_json) || {},
      });
    }

    events.sort((a, b) => b.ts - a.ts);

    return {
      userKey,
      hours,
      timeline,
      totalSnapshots: ipEvents.length,
      uniqueIps: uniqueIps.length,
      hwidHistory: hwidEvents,
      linkedAccounts,
      auditLog,
      events: dedupeInvestigationEvents(events).slice(0, 120),
    };
  }

  // ── Audit Log ──
  function recordAudit(operator, clientIp, action, targetUser, details) {
    db.prepare('INSERT INTO audit_log (ts, operator, client_ip, action, target_user, details_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(Date.now(), operator || null, clientIp || null, action, targetUser || null, details ? JSON.stringify(details) : null);
  }
  function getAuditLog(limit = 200) {
    return db.prepare('SELECT id, ts, operator, client_ip, action, target_user, details_json FROM audit_log ORDER BY ts DESC LIMIT ?').all(Number(limit || 200))
      .map(r => ({
        id: r.id,
        ts: r.ts,
        operator: r.operator,
        clientIp: r.client_ip,
        action: r.action,
        targetUser: r.target_user,
        details: parseJson(r.details_json),
      }));
  }

  // ── Export Data ──
  function getExportData(type) {
    if (type === 'suspects') {
      const detection = getDetectionResult();
      if (!detection) return [];
      return [...(detection.suspects || []), ...(detection.observed || [])];
    }
    if (type === 'incidents') {
      return getIncidents(1000);
    }
    if (type === 'users') {
      return db.prepare('SELECT raw_json FROM users ORDER BY updated_at DESC').all()
        .map(r => parseJson(r.raw_json)).filter(Boolean);
    }
    if (type === 'audit') {
      return getAuditLog(1000);
    }
    return [];
  }

  // ── DB Backup ──
  function createBackup() {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const backupPath = path.join(backupDir, `monitor-${date}.sqlite`);
    db.backup(backupPath).then(() => {
      console.log(`[backup] saved: ${backupPath}`);
      // Rotate: keep only last 7
      try {
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('monitor-') && f.endsWith('.sqlite'))
          .sort();
        while (files.length > 7) {
          const old = files.shift();
          fs.unlinkSync(path.join(backupDir, old));
          console.log(`[backup] rotated: ${old}`);
        }
      } catch (e) {
        console.error('[backup] rotation error:', e.message);
      }
    }).catch(err => {
      console.error('[backup] error:', err.message);
    });
  }

  // VPN/Proxy detection
  const ipChecker = createIpChecker(db);

  // Rule Engine
  const ruleEngine = createRuleEngine(db);

  return {
    dbPath,
    db,
    saveSnapshot: saveSnapshotTx,
    saveIpGeoCache: saveIpGeoCacheTx,
    getIpGeoCache,
    getState,
    getSyncStatus,
    startSyncRun,
    finishSyncRun,
    markNextSync,
    saveDetectionResult,
    getDetectionResult,
    saveAuditEntries,
    syncIncidentsFromDetection,
    getIncidents,
    getIncidentStats,
    updateIncident,
    recordIncidentEvent,
    addToWhitelist,
    removeFromWhitelist,
    getWhitelist,
    isWhitelisted,
    setUserNote,
    banUser,
    unbanUser,
    getBannedUsers,
    recordActivity,
    getUserHistory,
    saveNotification,
    getNotifications,
    getAllNotificationCounts,
    recordAudit,
    getAuditLog,
    getExportData,
    createBackup,
    ipChecker,
    ruleEngine,
  };
}

function userKey(user) {
  if (!user) return '';
  return String(user.userUuid || user.uuid || user.id || user.userId || user.username || user.name || '');
}

function addMapCount(map, key, base) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(key, { ...base, count: 1 });
}

function mapValues(map) {
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function ipNetworkKey(ip) {
  const value = String(ip || '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const parts = value.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (value.includes(':')) {
    return `${value.split(':').slice(0, 3).join(':')}::/48`;
  }

  return value;
}

function parseJson(value) {
  try { return JSON.parse(value); }
  catch { return null; }
}

function incidentEventTitle(type) {
  const map = {
    incident_opened: 'Инцидент открыт',
    incident_reopened: 'Инцидент переоткрыт',
    incident_created: 'Инцидент создан',
    status_changed: 'Изменён статус',
    comment_updated: 'Комментарий оператора',
    resolution_reason: 'Причина закрытия',
    risk_updated: 'Обновлён риск',
    user_banned: 'Пользователь заблокирован',
    user_unbanned: 'Пользователь разблокирован',
    notification_sent: 'Отправлено предупреждение',
    notification_failed: 'Ошибка предупреждения',
    whitelist_added: 'Добавлен whitelist',
    whitelist_removed: 'Удалён whitelist',
  };
  return map[type] || String(type || 'Событие');
}

function dedupeInvestigationEvents(events) {
  const seen = new Set();
  const result = [];
  for (const event of events || []) {
    const key = `${event.ts}|${event.type}|${event.detail || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

module.exports = { createStore, userKey };
