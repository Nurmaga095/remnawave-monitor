// ─── Server-side Detection Module v3 — "Device-first" ─────────────
// Принцип: HWID — единственный 100% надёжный идентификатор.
// IP/ASN/Country/Traffic — ТОЛЬКО информация для администратора, НЕ scoring.
//
// 3 уровня:
//   🔴 critical — HWID > лимит (автодействие)
//   🟡 warning  — ротация HWID / 24/7 паттерн (внимание админа)
//   🟢 clean    — ничего подозрительного
//
// IP-сигналы сохраняются как context (не влияют на score).

const GLOBAL_HWID_FALLBACK = 2;
const INACTIVE_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;

function createDetector(options = {}) {
  const hwidFallback = Number(options.hwidFallback || GLOBAL_HWID_FALLBACK);

  // ─── Main Entry ─────────────────────────────────────────────
  function analyze(state) {
    const startedAt = Date.now();
    const activityMap = buildActivityMap(state);
    const suspects = [];
    const observed = [];
    const seen = new Set();

    const whitelistSet = new Set((state.whitelist || []).map(w => w.userKey));

    for (const u of state.users || []) {
      const key = getUserKey(u);
      if (!key || seen.has(key) || isUserInactive(u, state)) continue;
      if (whitelistSet.has(key)) continue;
      seen.add(key);

      const { signals, context } = collectSignals(u, state, activityMap);
      const { score, level } = computeRiskScore(signals);

      if (level === 'clean') continue;

      const entry = {
        key,
        username: u.username || u.name || '',
        reason: signals.filter(s => s.active).map(s => s.id).join(', '),
        hwidCount: hwidCountForUser(u, state),
        hwidLimit: getUserHwidLimit(u),
        ipCount: context.ipCount || 0,
        riskScore: score,
        riskLevel: level,
        excess: Math.max(0, hwidCountForUser(u, state) - getUserHwidLimit(u)),
        signals: signals.filter(s => s.active).map(s => ({
          id: s.id, category: s.category, points: s.points, reason: s.reason,
        })),
        context,
      };

      if (level === 'critical') {
        suspects.push(entry);
      } else {
        observed.push(entry);
      }
    }

    suspects.sort((a, b) => b.riskScore - a.riskScore);
    observed.sort((a, b) => b.riskScore - a.riskScore);

    return {
      analyzedAt: startedAt,
      durationMs: Date.now() - startedAt,
      totalUsers: (state.users || []).length,
      activeUsers: Object.keys(state.activeIps || {}).length,
      suspectsCount: suspects.length,
      observedCount: observed.length,
      suspects,
      observed,
    };
  }

  // ─── Signal Collection ──────────────────────────────────────
  function collectSignals(u, state, activityMap) {
    const signals = [];
    const hwidLimit = getUserHwidLimit(u);
    const hwid = hwidCountForUser(u, state);
    const churn30d = getHwidChurnForUser(u, state);
    const userKey = getUserKey(u);

    // ═══ DETERMINISTIC: HWID превышает лимит ═══
    if (hwid > hwidLimit) {
      const excess = hwid - hwidLimit;
      signals.push({
        id: 'hwid_over_limit', category: 'deterministic', active: true,
        points: Math.min(40, excess * 15),
        reason: `HWID ${hwid} > лимит ${hwidLimit}`,
      });
    }

    // ═══ STRONG: Ротация HWID (обход лимита) ═══
    // Пользователь удаляет старые HWID и добавляет новые, оставаясь в лимите
    if (churn30d > hwidLimit * 3) {
      signals.push({
        id: 'hwid_churn_high', category: 'strong', active: true, points: 30,
        reason: `ротация HWID: ${churn30d} за 30д при лимите ${hwidLimit}`,
      });
    } else if (churn30d > hwidLimit * 2) {
      signals.push({
        id: 'hwid_churn_moderate', category: 'strong', active: true, points: 20,
        reason: `повышенная ротация HWID: ${churn30d} за 30д`,
      });
    }

    // ═══ STRONG: Паттерн 24/7 (нет перерыва на сон) ═══
    // Значимый сигнал только если у пользователя HWID == лимит
    const activity = activityMap[userKey];
    if (activity && activity.activeHours >= 22 && hwid >= hwidLimit) {
      signals.push({
        id: 'temporal_247', category: 'strong', active: true, points: 20,
        reason: `активность ${activity.activeHours}/24 часов, все слоты заняты`,
      });
    }

    // ═══ INFORMATIONAL CONTEXT (не влияет на score) ═══
    const context = buildContext(u, state);

    return { signals, context };
  }

  // ─── Build informational context ───────────────────────────
  function buildContext(u, state) {
    const keys = getUserAliases(u);
    let ipCount = 0;
    const countries = new Set();
    const asns = new Set();
    const connectionTypes = new Set();

    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      ipCount = Math.max(ipCount, ips.length);

      for (const entry of ips) {
        const geo = (typeof entry === 'string') ? null : (entry && entry.geo);
        if (!geo) continue;
        if (geo.countryCode) countries.add(geo.countryCode);
        if (geo.asn) asns.add(String(geo.asn));
        if (geo.connectionType) connectionTypes.add(geo.connectionType);
      }
    }

    // IP stats from stored data
    const stats = getIpStatsForUser(u, state);

    return {
      ipCount,
      countries: Array.from(countries),
      countryCount: countries.size || (stats.countries24h || []).length,
      asns: Array.from(asns),
      asnCount: asns.size || (stats.asns24h || []).length,
      connectionTypes: Array.from(connectionTypes),
      uniqueIps24h: stats.uniqueIps24h || 0,
      uniqueNetworks24h: stats.uniqueNetworks24h || 0,
      hostingIpCount: stats.hostingIpCount || 0,
      proxyIpCount: stats.proxyIpCount || 0,
      vpnIpCount: stats.vpnIpCount || 0,
    };
  }

  // ─── Risk Score Computation ─────────────────────────────────
  function computeRiskScore(signals) {
    const active = signals.filter(s => s.active);
    const deterministic = active.filter(s => s.category === 'deterministic');
    const strong = active.filter(s => s.category === 'strong');

    // HWID over limit → critical (60-100)
    if (deterministic.length > 0) {
      const detPoints = deterministic.reduce((sum, s) => sum + s.points, 0);
      const strongExtra = strong.reduce((sum, s) => sum + s.points, 0);
      const score = Math.min(100, 60 + detPoints + strongExtra);
      return { score, level: 'critical' };
    }

    // HWID churn / 24/7 → warning (20-50)
    if (strong.length > 0) {
      const score = Math.min(50, strong.reduce((sum, s) => sum + s.points, 0));
      return { score, level: score >= 20 ? 'warning' : 'clean' };
    }

    // Nothing → clean
    return { score: 0, level: 'clean' };
  }

  // ─── Activity Map (temporal 24/7 detection) ─────────────────
  function buildActivityMap(state) {
    const map = {};
    const history = state.ipHistory || [];
    if (history.length < 3) return map;

    const userHours = {};
    for (const snap of history) {
      if (!snap.ips) continue;
      const hour = new Date(snap.ts).getUTCHours();
      for (const userKey of Object.keys(snap.ips)) {
        const ips = snap.ips[userKey];
        const count = Array.isArray(ips) ? ips.length : (ips && ips.size ? ips.size : 0);
        if (count === 0) continue;
        if (!userHours[userKey]) userHours[userKey] = new Set();
        userHours[userKey].add(hour);
      }
    }

    for (const [userKey, hours] of Object.entries(userHours)) {
      map[userKey] = { activeHours: hours.size };
    }

    return map;
  }

  // ─── Helpers ────────────────────────────────────────────────

  function isUserInactive(u, state) {
    const status = String(u.status || '').toLowerCase();
    if (status === 'disabled' || status === 'expired' || status === 'limited') return true;
    if (state && getActiveIpKey(u, state)) return false;
    const lastOnline = u.onlineAt || u.lastSeen || u.lastConnectedAt || u.updatedAt;
    if (lastOnline) {
      const time = new Date(lastOnline).getTime();
      if (Number.isFinite(time) && Date.now() - time > INACTIVE_OFFLINE_MS) return true;
    }
    return false;
  }

  function getUserHwidLimit(u) {
    const val = u.hwidDeviceLimit != null ? u.hwidDeviceLimit
      : (u.hwidDevicesLimit != null ? u.hwidDevicesLimit : null);
    if (val !== null && !isNaN(Number(val))) return Number(val);
    return hwidFallback;
  }

  function getUserKey(u) {
    if (!u) return '';
    return String(u.userUuid || u.uuid || u.id || u.userId || u.username || u.name || '');
  }

  function getUserAliases(u) {
    if (!u) return [];
    return Array.from(new Set(
      [getUserKey(u), u.userUuid, u.uuid, u.id, u.userId, u.shortUuid, u.shortUserUuid, u.username, u.name]
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(String)
    ));
  }

  function getActiveIpKey(u, state) {
    return getUserAliases(u).find(k =>
      state.activeIps && state.activeIps[k] && state.activeIps[k].length > 0
    ) || '';
  }

  function getIpStatsForUser(u, state) {
    const keys = getUserAliases(u);
    for (const key of keys) {
      if (state.ipStats && state.ipStats[key]) return state.ipStats[key];
    }
    return {
      uniqueIps24h: 0, uniqueNetworks24h: 0,
      countries24h: [], asns24h: [], orgs24h: [],
      hostingIpCount: 0, proxyIpCount: 0, vpnIpCount: 0,
      recentCountryCount30m: 0, concurrentDiffCountryPairs: 0,
    };
  }

  function getHwidChurnForUser(u, state) {
    const keys = getUserAliases(u);
    for (const key of keys) {
      if (state.hwidChurn && state.hwidChurn[key]) return state.hwidChurn[key];
    }
    return 0;
  }

  function hwidCountForUser(u, state) {
    const keys = getUserAliases(u);
    for (const key of keys) {
      const devices = state.hwidDevices && state.hwidDevices[key];
      if (Array.isArray(devices) && devices.length > 0) return devices.length;
    }
    const topEntry = (state.hwidTop || []).find(t => {
      const tKeys = getUserAliases(t);
      return tKeys.some(k => keys.includes(k)) ||
        (t.username && u.username && t.username === u.username);
    });
    if (topEntry) return topEntry.devicesCount || topEntry.count || 0;
    return u.hwidDevicesCount || u.hwid_count || 0;
  }

  return { analyze };
}

module.exports = { createDetector };
