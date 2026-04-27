// ─── Server-side Detection Module v4 — Premium Multi-Signal ────
// 9 сигналов, 4 категории, 4 уровня:
//
// DETERMINISTIC: hwid_over_limit
// STRONG: hwid_churn, temporal_247, multi_city, impossible_travel, velocity_extreme, fingerprint_cluster
// WEAK: suspicious_travel, velocity_high, fingerprint_match, isp_mix, behavior_shift
//
// 🔴 critical (60-100) — HWID > лимит
// 🟠 high     (40-59)  — 2+ strong сигнала
// 🟡 warning  (20-39)  — 1 strong или 3+ weak
// 🟢 clean    (0-19)   — нет угроз

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

      if (level === 'critical' || level === 'high') {
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
      highCount: suspects.filter(s => s.riskLevel === 'high').length,
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
    const keys = getUserAliases(u);

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

    // ═══ STRONG: Паттерн 24/7 ═══
    const activity = activityMap[userKey];
    if (activity && activity.activeHours >= 22 && hwid >= hwidLimit) {
      signals.push({
        id: 'temporal_247', category: 'strong', active: true, points: 20,
        reason: `активность ${activity.activeHours}/24 часов, все слоты заняты`,
      });
    }

    // ═══ STRONG: Concurrent Multi-City Sessions (#4) ═══
    const citySignal = detectMultiCity(u, state, keys);
    if (citySignal) signals.push(citySignal);

    // ═══ STRONG: Impossible Travel (#1) ═══
    const travelSignal = detectImpossibleTravel(u, state, keys);
    if (travelSignal) signals.push(travelSignal);

    // ═══ STRONG: Velocity Abuse (#2) ═══
    const velocitySignal = detectVelocityAbuse(u, state);
    if (velocitySignal) signals.push(velocitySignal);

    // ═══ WEAK: Fingerprint Clusters (#3) ═══
    const fpSignal = detectFingerprintCluster(u, state, keys);
    if (fpSignal) signals.push(fpSignal);

    // ═══ WEAK: ISP Anomalies (#5) ═══
    const ispSignal = detectIspAnomaly(u, state, keys);
    if (ispSignal) signals.push(ispSignal);

    // ═══ WEAK: Behavioral Shift (#6) ═══
    const behaviorSignal = detectBehavioralShift(u, state, activityMap, keys);
    if (behaviorSignal) signals.push(behaviorSignal);

    const context = buildContext(u, state);
    return { signals, context };
  }

  // ─── #4 Multi-City Detection ────────────────────────────────
  function detectMultiCity(u, state, keys) {
    const cities = new Map(); // city -> {lat,lon}
    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        const geo = (typeof entry === 'object') ? (entry && entry.geo) : null;
        if (!geo || !geo.city || !geo.lat || !geo.lon) continue;
        // Skip cellular — mobile towers often show different cities
        if (geo.connectionType && geo.connectionType.toLowerCase().includes('cellular')) continue;
        cities.set(geo.city, { lat: geo.lat, lon: geo.lon });
      }
    }
    if (cities.size >= 3) {
      return { id: 'multi_city_extreme', category: 'strong', active: true, points: 25,
        reason: `одновременно из ${cities.size} городов: ${[...cities.keys()].join(', ')}` };
    }
    if (cities.size === 2) {
      const [c1, c2] = [...cities.values()];
      const dist = haversine(c1.lat, c1.lon, c2.lat, c2.lon);
      if (dist > 100) {
        return { id: 'multi_city_suspect', category: 'strong', active: true, points: 15,
          reason: `2 города одновременно (${Math.round(dist)} км): ${[...cities.keys()].join(', ')}` };
      }
    }
    return null;
  }

  // ─── #1 Impossible Travel Detection ─────────────────────────
  function detectImpossibleTravel(u, state, keys) {
    const history = state.ipHistory || [];
    if (history.length < 2) return null;
    const geoByIp = {};
    // Build geo map from activeIps
    for (const entries of Object.values(state.activeIps || {})) {
      for (const e of entries || []) {
        if (e && e.ip && e.geo && e.geo.lat && e.geo.lon) {
          geoByIp[e.ip] = e.geo;
        }
      }
    }
    // Check sequential snapshots for this user
    let prevGeo = null, prevTs = 0;
    let maxSpeed = 0, maxDetail = '';
    for (const snap of history) {
      for (const key of keys) {
        const ips = snap.ips && snap.ips[key];
        if (!ips || ips.length === 0) continue;
        // Get geo from first IP that has geo data
        let geo = null;
        for (const ip of ips) {
          const g = geoByIp[ip];
          if (g && g.lat && g.lon) { geo = { ...g, ip }; break; }
        }
        if (!geo) continue;
        if (prevGeo && snap.ts > prevTs) {
          const dist = haversine(prevGeo.lat, prevGeo.lon, geo.lat, geo.lon);
          const hours = (snap.ts - prevTs) / 3600000;
          if (hours > 0 && dist > 50) {
            const speed = dist / hours;
            if (speed > maxSpeed) {
              maxSpeed = speed;
              maxDetail = `${prevGeo.city || prevGeo.ip} → ${geo.city || geo.ip} (${Math.round(dist)} км / ${Math.round(hours * 60)} мин)`;
            }
          }
        }
        prevGeo = geo;
        prevTs = snap.ts;
        break;
      }
    }
    if (maxSpeed > 900) {
      const crossCountry = maxDetail.length > 0;
      return { id: 'impossible_travel', category: 'strong', active: true,
        points: crossCountry ? 25 : 15,
        reason: `невозможное перемещение ${Math.round(maxSpeed)} км/ч: ${maxDetail}` };
    }
    if (maxSpeed > 500) {
      return { id: 'suspicious_travel', category: 'weak', active: true, points: 10,
        reason: `подозрительное перемещение ${Math.round(maxSpeed)} км/ч: ${maxDetail}` };
    }
    return null;
  }

  // ─── #2 Velocity Abuse Detection ────────────────────────────
  function detectVelocityAbuse(u, state) {
    const traffic = Number(u.usedTrafficBytes || u.usedTraffic || 0);
    const median = state.trafficMedian || 0;
    if (median <= 0 || traffic <= 0) return null;
    const ratio = traffic / median;
    if (ratio > 10) {
      return { id: 'velocity_extreme', category: 'strong', active: true, points: 20,
        reason: `трафик ${(traffic / 1073741824).toFixed(1)} GB — ${ratio.toFixed(0)}x от медианы` };
    }
    if (ratio > 5) {
      return { id: 'velocity_high', category: 'weak', active: true, points: 10,
        reason: `трафик ${(traffic / 1073741824).toFixed(1)} GB — ${ratio.toFixed(0)}x от медианы` };
    }
    return null;
  }

  // ─── #3 Fingerprint Cluster Detection ───────────────────────
  function detectFingerprintCluster(u, state, keys) {
    const userDevices = [];
    for (const key of keys) {
      const devices = (state.hwidDevices || {})[key];
      if (Array.isArray(devices)) {
        for (const d of devices) {
          if (d && (d.deviceModel || d.model || d.hwid)) {
            userDevices.push(String(d.deviceModel || d.model || d.hwid || '').toLowerCase());
          }
        }
      }
    }
    if (userDevices.length === 0) return null;
    // Check other users for same device models
    let linkedCount = 0;
    const linkedUsers = [];
    for (const [otherKey, devices] of Object.entries(state.hwidDevices || {})) {
      if (keys.includes(otherKey)) continue;
      if (!Array.isArray(devices)) continue;
      for (const d of devices) {
        const model = String(d.deviceModel || d.model || d.hwid || '').toLowerCase();
        if (model && userDevices.includes(model)) {
          linkedCount++;
          linkedUsers.push(otherKey);
          break;
        }
      }
    }
    if (linkedCount >= 3) {
      return { id: 'fingerprint_cluster', category: 'strong', active: true, points: 25,
        reason: `устройство совпадает с ${linkedCount} аккаунтами` };
    }
    if (linkedCount >= 1) {
      return { id: 'fingerprint_match', category: 'weak', active: true, points: 10,
        reason: `общее устройство с ${linkedCount} аккаунтом(ами)` };
    }
    return null;
  }

  // ─── #5 ISP Anomaly Detection ───────────────────────────────
  function detectIspAnomaly(u, state, keys) {
    const proxyData = state.proxyData || {};
    let residential = 0, datacenter = 0;
    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        const ip = typeof entry === 'string' ? entry : (entry && entry.ip);
        if (!ip) continue;
        const pd = proxyData[ip];
        if (pd && (pd.isVPN || pd.isProxy || pd.isTor)) {
          datacenter++;
        } else {
          residential++;
        }
      }
    }
    if (datacenter >= 2) {
      return { id: 'isp_datacenter_heavy', category: 'weak', active: true, points: 15,
        reason: `${datacenter} IP через VPN/Proxy/Datacenter` };
    }
    if (datacenter > 0 && residential > 0) {
      return { id: 'isp_mix', category: 'weak', active: true, points: 10,
        reason: `микс residential (${residential}) + VPN/Proxy (${datacenter})` };
    }
    return null;
  }

  // ─── #6 Behavioral Shift Detection ──────────────────────────
  function detectBehavioralShift(u, state, activityMap, keys) {
    const userKey = getUserKey(u);
    const history = state.ipHistory || [];
    if (history.length < 6) return null;
    // Count active hours in first and second half
    const mid = Math.floor(history.length / 2);
    const firstHalf = new Set(), secondHalf = new Set();
    for (let i = 0; i < history.length; i++) {
      for (const key of keys) {
        if (history[i].ips && history[i].ips[key] && history[i].ips[key].length > 0) {
          const hour = new Date(history[i].ts).getUTCHours();
          if (i < mid) firstHalf.add(hour);
          else secondHalf.add(hour);
          break;
        }
      }
    }
    if (firstHalf.size > 0 && secondHalf.size > 0) {
      const ratio = secondHalf.size / firstHalf.size;
      if (ratio >= 3 && secondHalf.size >= 12) {
        return { id: 'behavior_shift', category: 'weak', active: true, points: 15,
          reason: `рост активных часов: ${firstHalf.size}ч → ${secondHalf.size}ч (${ratio.toFixed(1)}x)` };
      }
    }
    return null;
  }

  // ─── Haversine distance (km) ────────────────────────────────
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Risk Score Computation (4 levels) ─────────────────────
  function computeRiskScore(signals) {
    const active = signals.filter(s => s.active);
    const deterministic = active.filter(s => s.category === 'deterministic');
    const strong = active.filter(s => s.category === 'strong');
    const weak = active.filter(s => s.category === 'weak');

    // HWID over limit → critical (60-100)
    if (deterministic.length > 0) {
      const detPoints = deterministic.reduce((sum, s) => sum + s.points, 0);
      const strongExtra = strong.reduce((sum, s) => sum + s.points, 0);
      const weakExtra = weak.reduce((sum, s) => sum + Math.min(s.points, 5), 0);
      const score = Math.min(100, 60 + detPoints + strongExtra + weakExtra);
      return { score, level: 'critical' };
    }

    // Multiple strong signals → high (40-59)
    if (strong.length >= 2) {
      const strongPts = strong.reduce((sum, s) => sum + s.points, 0);
      const weakPts = weak.reduce((sum, s) => sum + Math.min(s.points, 5), 0);
      const score = Math.min(59, 40 + Math.min(strongPts, 20) + weakPts);
      return { score, level: 'high' };
    }

    // Single strong or multiple weak → warning (20-39)
    if (strong.length > 0 || weak.length >= 3) {
      const pts = strong.reduce((sum, s) => sum + s.points, 0) + weak.reduce((sum, s) => sum + s.points, 0);
      const score = Math.min(39, Math.max(20, pts));
      return { score, level: score >= 20 ? 'warning' : 'clean' };
    }

    // Only weak signals
    if (weak.length > 0) {
      const pts = weak.reduce((sum, s) => sum + s.points, 0);
      if (pts >= 20) return { score: Math.min(39, pts), level: 'warning' };
    }

    return { score: 0, level: 'clean' };
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
