// ─── Server-side Detection Module v6 — Premium Multi-Signal ────
// 13 сигналов, 4 категории, 4 уровня:
//
// DETERMINISTIC: hwid_over_limit
// STRONG: hwid_churn, temporal_247, multi_city, impossible_travel, velocity_extreme,
//         fingerprint_cluster, simultaneous_distinct_networks, extracted_key_suspected,
//         multi_node_simultaneous
// WEAK: suspicious_travel, velocity_high, fingerprint_match, isp_mix, behavior_shift,
//       multi_platform_sub, multi_device_sub, schedule_pattern
//
// critical (60-100) — HWID > лимит
// high     (40-59)  — 2+ strong сигнала из разных типов доказательств
// warning  (20-39)  — 1 strong или 3+ weak
// clean    (0-19)   — нет угроз

const { getUserKey, getUserAliases } = require('./utils');

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

      const confidence = computeConfidence(signals, context);
      const mitigating = computeMitigatingFactors(u, state, signals, context);

      const entry = {
        key,
        username: u.username || u.name || '',
        reason: signals.filter(s => s.active).map(s => s.id).join(', '),
        hwidCount: hwidCountForUser(u, state),
        hwidLimit: getUserHwidLimit(u),
        ipCount: context.ipCount || 0,
        riskScore: score,
        riskLevel: level,
        confidence,
        mitigating,
        excess: Math.max(0, hwidCountForUser(u, state) - getUserHwidLimit(u)),
        signals: signals.filter(s => s.active).map(s => ({
          id: s.id, category: s.category, points: s.points, reason: s.reason,
          ...(s.linkedAccounts ? { linkedAccounts: s.linkedAccounts } : {}),
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

    // ═══ STRONG: Simultaneous Distinct Networks (#7) ═══
    const simNetSignal = detectSimultaneousNetworks(u, state, keys, hwidLimit);
    if (simNetSignal) signals.push(simNetSignal);

    // ═══ STRONG: Extracted VLESS Key Suspected (#8) ═══
    const extractedSignal = detectExtractedKey(u, state, keys, hwidLimit, hwid);
    if (extractedSignal) signals.push(extractedSignal);

    // ═══ STRONG: Multi-Node Simultaneous (#9) ═══
    const multiNodeSignal = detectMultiNodeSimultaneous(u, state, keys, hwidLimit);
    if (multiNodeSignal) signals.push(multiNodeSignal);

    // ═══ WEAK: Schedule Pattern Detection (#10) ═══
    const scheduleSignal = detectSchedulePattern(u, state, keys, hwidLimit);
    if (scheduleSignal) signals.push(scheduleSignal);

    // ═══ STRONG: Multi-Platform Subscription (#11) ═══
    const subPlatformSignal = detectMultiPlatformSub(u, state, keys, hwidLimit, hwid);
    if (subPlatformSignal) signals.push(subPlatformSignal);

    // ═══ STRONG: Subscription Storm (#12) ═══
    const subStormSignal = detectSubStorm(u, state, keys);
    if (subStormSignal) signals.push(subStormSignal);

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
        const point = getGeoPoint(geo);
        if (!geo || !geo.city || !point) continue;
        // Skip cellular — mobile towers often show different cities
        if (geo.connectionType && geo.connectionType.toLowerCase().includes('cellular')) continue;
        cities.set(geo.city, point);
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
        if (e && e.ip && e.geo) {
          const point = getGeoPoint(e.geo);
          if (point) geoByIp[e.ip] = { ...e.geo, ...point };
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
          const point = getGeoPoint(g);
          if (point) { geo = { ...g, ...point, ip }; break; }
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
  // Matches by unique HWID hash — NOT device model (too many false positives)
  function detectFingerprintCluster(u, state, keys) {
    // Collect this user's unique HWID hashes
    const userHwids = new Set();
    for (const key of keys) {
      const devices = (state.hwidDevices || {})[key];
      if (Array.isArray(devices)) {
        for (const d of devices) {
          // Use HWID hash (unique per device), NOT model name
          const hwid = d && (d.hwid || d.deviceKey || d.key || '');
          if (hwid && hwid.length >= 8) userHwids.add(hwid.toLowerCase());
        }
      }
    }
    if (userHwids.size === 0) return null;

    // Collect this user's current IPs for shared-IP check
    const userIps = new Set();
    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (Array.isArray(ips)) {
        for (const entry of ips) {
          const ip = typeof entry === 'string' ? entry : (entry && entry.ip);
          if (ip) userIps.add(ip);
        }
      }
    }

    // Check other users for same HWID or shared IP
    let hwidLinked = 0, ipLinked = 0;
    const hwidLinkedAccounts = []; // имена совпадающих аккаунтов
    for (const [otherKey, devices] of Object.entries(state.hwidDevices || {})) {
      if (keys.includes(otherKey)) continue;
      if (!Array.isArray(devices)) continue;
      for (const d of devices) {
        const hwid = (d && (d.hwid || d.deviceKey || d.key || '')).toLowerCase();
        if (hwid && hwid.length >= 8 && userHwids.has(hwid)) {
          hwidLinked++;
          // Найти username по ключу
          const linkedUser = (state.users || []).find(u2 => {
            const u2keys = [u2.uuid, u2.id, u2.username, u2.shortUuid].map(String).filter(Boolean);
            return u2keys.includes(otherKey);
          });
          const linkedName = linkedUser ? (linkedUser.username || linkedUser.shortUuid || otherKey) : otherKey;
          hwidLinkedAccounts.push(linkedName);
          break;
        }
      }
    }

    // Shared IP check (same IP used by different accounts)
    for (const [otherKey, ips] of Object.entries(state.activeIps || {})) {
      if (keys.includes(otherKey)) continue;
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        const ip = typeof entry === 'string' ? entry : (entry && entry.ip);
        if (ip && userIps.has(ip)) { ipLinked++; break; }
      }
    }

    // HWID sharing is very strong signal
    if (hwidLinked >= 2) {
      return { id: 'fingerprint_cluster', category: 'strong', active: true, points: 25,
        reason: `HWID совпадает с ${hwidLinked} аккаунтами: ${hwidLinkedAccounts.join(', ')}`,
        linkedAccounts: hwidLinkedAccounts };
    }
    if (hwidLinked === 1) {
      return { id: 'fingerprint_match', category: 'strong', active: true, points: 15,
        reason: `общий HWID с аккаунтом: ${hwidLinkedAccounts[0]}`,
        linkedAccounts: hwidLinkedAccounts };
    }
    // Same IP from different accounts (weaker signal)
    if (ipLinked >= 3) {
      return { id: 'shared_ip_cluster', category: 'weak', active: true, points: 10,
        reason: `общий IP с ${ipLinked} аккаунтами` };
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

  // ─── #7 Simultaneous Distinct Networks ──────────────────────
  // Measures IP overlap across different ASNs/countries over time.
  // Only flags when concurrent ASN count EXCEEDS the user's HWID limit.
  // If user paid for 5 devices, 3 ASNs is normal.
  function detectSimultaneousNetworks(u, state, keys, hwidLimit) {
    const history = state.ipHistory || [];
    if (history.length < 3) return null;
    const geoByIp = state.geoByIp || {};

    // Track ASN sets across recent snapshots to find persistent overlap
    let overlapCount = 0;
    let maxConcurrentAsns = 0;
    let maxConcurrentCountries = 0;
    let maxConcurrentIps = 0;
    let overlapDetail = '';

    // Check recent snapshots (last 12 = ~1 hour at 5-min intervals)
    const recentHistory = history.slice(-12);

    for (const snap of recentHistory) {
      const asns = new Set();
      const countries = new Set();
      let ipCount = 0;
      for (const key of keys) {
        const ips = snap.ips && snap.ips[key];
        if (!Array.isArray(ips)) continue;
        for (const ip of ips) {
          ipCount++;
          const activeEntries = (state.activeIps || {})[key] || [];
          const entry = activeEntries.find(e => e && e.ip === ip);
          const geo = (entry && entry.geo) || geoByIp[ip] || null;
          if (geo) {
            if (geo.asn) asns.add(String(geo.asn));
            if (geo.countryCode) countries.add(geo.countryCode);
          }
        }
      }
      // Only count as overlap if ASN count EXCEEDS the user's device limit
      if (asns.size > hwidLimit) {
        overlapCount++;
        if (asns.size > maxConcurrentAsns) {
          maxConcurrentAsns = asns.size;
          maxConcurrentCountries = countries.size;
          maxConcurrentIps = ipCount;
          overlapDetail = `${asns.size} ASN, ${countries.size} стран, ${ipCount} IP (лимит ${hwidLimit})`;
        }
      }
    }

    // Persistent overlap across multiple countries = strong evidence.
    if (overlapCount >= 3 && maxConcurrentCountries >= 2 && maxConcurrentAsns > hwidLimit) {
      return {
        id: 'simultaneous_distinct_networks', category: 'strong', active: true,
        points: 25,
        reason: `${overlapCount} снимков с ${overlapDetail} одновременно (${overlapCount * 5} мин пересечения)`,
      };
    }
    if (overlapCount >= 2 && maxConcurrentCountries >= 2 && maxConcurrentAsns > hwidLimit) {
      return {
        id: 'simultaneous_distinct_networks', category: 'strong', active: true,
        points: 20,
        reason: `${overlapCount} снимков с ${maxConcurrentAsns} ASN из ${maxConcurrentCountries} стран (лимит ${hwidLimit})`,
      };
    }

    // Same-country ASN churn is common with mobile/home providers. Keep it as
    // a weak hint only when it persists and exceeds the plan by more than one.
    if (overlapCount >= 3 && maxConcurrentCountries <= 1 && maxConcurrentAsns >= hwidLimit + 2 && maxConcurrentIps >= hwidLimit + 2) {
      return {
        id: 'simultaneous_distinct_networks', category: 'weak', active: true,
        points: 15,
        reason: `${overlapCount} снимков с ${maxConcurrentAsns} ASN в одной стране (${maxConcurrentIps} IP, лимит ${hwidLimit})`,
      };
    }
    return null;
  }

  // ─── #8 Extracted VLESS Key Detection ───────────────────────
  // HWID is normal, but UUID simultaneously used from more distinct ASNs
  // than the user's device limit allows. This catches key extraction.
  // If user paid for 5 devices, 3 ASNs is fine — only flag when > limit.
  function detectExtractedKey(u, state, keys, hwidLimit, hwidCount) {
    // Only fire if HWID is NOT over limit (otherwise hwid_over_limit handles it)
    if (hwidCount > hwidLimit) return null;

    // Collect current ASNs + countries for this user
    const asns = new Set();
    const countries = new Set();
    let totalIps = 0;

    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        totalIps++;
        const geo = (typeof entry === 'object') ? (entry && entry.geo) : null;
        if (!geo) continue;
        if (geo.asn) asns.add(String(geo.asn));
        if (geo.countryCode) countries.add(geo.countryCode);
      }
    }

    // Only suspicious if concurrent ASNs EXCEED the device limit
    // AND there are multiple countries (rules out WiFi+mobile+work in same city)
    if (asns.size > hwidLimit && countries.size >= 2 && totalIps > hwidLimit) {
      // Check ipHistory for persistence (not just a momentary blip)
      const history = state.ipHistory || [];
      let multiAsnSnapshots = 0;
      for (const snap of history.slice(-6)) {
        const snapAsns = new Set();
        for (const key of keys) {
          const ips = snap.ips && snap.ips[key];
          if (!Array.isArray(ips)) continue;
          for (const ip of ips) {
            const activeEntries = (state.activeIps || {})[key] || [];
            const entry = activeEntries.find(e => e && e.ip === ip);
            if (entry && entry.geo && entry.geo.asn) snapAsns.add(String(entry.geo.asn));
          }
        }
        if (snapAsns.size > hwidLimit) multiAsnSnapshots++;
      }

      if (multiAsnSnapshots >= 2) {
        return {
          id: 'extracted_key_suspected', category: 'strong', active: true,
          points: 25,
          reason: `HWID ${hwidCount}/${hwidLimit} (норма), но ${asns.size} ASN из ${countries.size} стран > лимит ${hwidLimit} — вероятно ключ извлечён`,
        };
      }

      return {
        id: 'extracted_key_suspected', category: 'strong', active: true,
        points: 15,
        reason: `HWID в норме, но ${asns.size} ASN и ${countries.size} стран > лимит ${hwidLimit}`,
      };
    }

    return null;
  }

  // ─── #9 Multi-Node Simultaneous Detection ──────────────────
  // Same user active on more DIFFERENT nodes than their HWID limit allows.
  // If limit=3 and active on 3 nodes — normal.
  // If limit=2 and active on 4 nodes from different IPs — sharing.
  function detectMultiNodeSimultaneous(u, state, keys, hwidLimit) {
    const nodeIps = new Map(); // nodeUuid -> Set of IPs
    const allIps = new Set();

    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        if (!entry || !entry.nodeUuid || !entry.ip) continue;
        allIps.add(entry.ip);
        if (!nodeIps.has(entry.nodeUuid)) nodeIps.set(entry.nodeUuid, new Set());
        nodeIps.get(entry.nodeUuid).add(entry.ip);
      }
    }

    const nodeCount = nodeIps.size;
    if (nodeCount <= hwidLimit) return null;
    const ipCount = allIps.size;
    if (ipCount <= hwidLimit) return null;

    // Collect country/ASN diversity across nodes
    const nodeCountries = new Set();
    const nodeAsns = new Set();
    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        if (!entry || !entry.geo) continue;
        if (entry.geo.countryCode) nodeCountries.add(entry.geo.countryCode);
        if (entry.geo.asn) nodeAsns.add(String(entry.geo.asn));
      }
    }

    // Different countries from different nodes = very strong
    if (nodeCountries.size >= 2 && nodeCount > hwidLimit && ipCount > hwidLimit) {
      return {
        id: 'multi_node_simultaneous', category: 'strong', active: true,
        points: 30,
        reason: `одновременно на ${nodeCount} нодах (${ipCount} IP, лимит ${hwidLimit}) из ${nodeCountries.size} стран, ${nodeAsns.size} ASN`,
      };
    }

    if (nodeCount > hwidLimit + 1 && ipCount > hwidLimit + 1 && nodeAsns.size > hwidLimit) {
      return {
        id: 'multi_node_simultaneous', category: 'weak', active: true,
        points: 15,
        reason: `одновременно на ${nodeCount} нодах (${ipCount} IP, ${nodeAsns.size} ASN) при лимите ${hwidLimit}`,
      };
    }

    return null;
  }

  // ─── Haversine distance (km) ────────────────────────────────
  function getGeoPoint(geo) {
    if (!geo) return null;
    const lat = Number(geo.lat ?? geo.latitude);
    const lon = Number(geo.lon ?? geo.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

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

    const strongEvidenceTypes = new Set(strong.map(s => getSignalEvidenceType(s.id)).filter(Boolean));

    // Multiple strong signals from independent evidence types → high (40-59).
    // Several network-only signals are correlated and should not stack to high.
    if (strong.length >= 2 && strongEvidenceTypes.size >= 2) {
      const strongPts = sumMaxPointsByEvidenceType(strong);
      const weakPts = weak.reduce((sum, s) => sum + Math.min(s.points, 5), 0);
      const score = Math.min(59, 40 + Math.min(strongPts, 20) + weakPts);
      return { score, level: 'high' };
    }

    // Single strong or multiple weak → warning (20-39)
    if (strong.length > 0 || weak.length >= 3) {
      const pts = sumMaxPointsByEvidenceType(strong) + weak.reduce((sum, s) => sum + s.points, 0);
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

  function sumMaxPointsByEvidenceType(signals) {
    const byType = new Map();
    for (const signal of signals) {
      const type = getSignalEvidenceType(signal.id) || signal.id;
      const points = Number(signal.points || 0);
      byType.set(type, Math.max(byType.get(type) || 0, points));
    }
    return Array.from(byType.values()).reduce((sum, points) => sum + points, 0);
  }

  // ─── Confidence Score ──────────────────────────────────────────
  // Weighted evidence scoring — different evidence types have different weight.
  // Each evidence category is independent (geo, temporal, device, network, behavioral).
  const EVIDENCE_WEIGHTS = {
    device: 30,         // HWID-based: strongest physical evidence
    geographic: 20,     // Multi-city/impossible travel
    network: 20,        // ASN/distinct networks
    temporal: 15,       // 24/7, behavior shift
    identity: 15,       // Fingerprint/HWID sharing
    traffic: 10,        // Volume anomalies
    infrastructure: 10, // VPN/datacenter usage
    subscription: 15,   // Multi-platform sub requests
  };

  function getSignalEvidenceType(id) {
    if (['hwid_over_limit', 'hwid_churn_high', 'hwid_churn_moderate'].includes(id))
      return 'device';
    if (['multi_city_extreme', 'multi_city_suspect', 'impossible_travel', 'suspicious_travel'].includes(id))
      return 'geographic';
    if (['temporal_247', 'behavior_shift', 'schedule_pattern'].includes(id))
      return 'temporal';
    if (['simultaneous_distinct_networks', 'extracted_key_suspected', 'multi_node_simultaneous'].includes(id))
      return 'network';
    if (['velocity_extreme', 'velocity_high'].includes(id))
      return 'traffic';
    if (['fingerprint_cluster', 'fingerprint_match', 'shared_ip_cluster'].includes(id))
      return 'identity';
    if (['isp_datacenter_heavy', 'isp_mix'].includes(id))
      return 'infrastructure';
    if (['multi_platform_sub', 'multi_device_sub', 'sub_storm'].includes(id))
      return 'subscription';
    return null;
  }

  function computeConfidence(signals, context) {
    const active = signals.filter(s => s.active);
    if (active.length === 0) return { score: 0, level: 'none', types: [] };

    const evidenceTypes = new Set();
    for (const s of active) {
      const type = getSignalEvidenceType(s.id);
      if (type) evidenceTypes.add(type);
    }

    const types = Array.from(evidenceTypes);

    // Weighted confidence: sum matched weights / total possible weight
    const matchedWeight = types.reduce((sum, t) => sum + (EVIDENCE_WEIGHTS[t] || 10), 0);
    const maxWeight = Object.values(EVIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    let score = Math.round((matchedWeight / maxWeight) * 100);

    // Boost if deterministic signal present
    if (active.some(s => s.category === 'deterministic')) {
      score = Math.min(99, score + 15);
    }

    // Ensure minimum by type count
    const typeCount = types.length;
    if (typeCount >= 4 && score < 85) score = 85;
    else if (typeCount === 3 && score < 70) score = 70;
    else if (typeCount === 2 && score < 50) score = 50;
    else if (typeCount === 1 && score < 25) score = 25;

    const level = score >= 85 ? 'confirmed'
      : score >= 60 ? 'high'
      : score >= 40 ? 'medium'
      : 'low';

    return { score, level, types };
  }

  // ─── Mitigating Factors (White Explanations) ──────────────────
  // Shows reasons why the signals might be false positives.
  function computeMitigatingFactors(u, state, signals, context) {
    const factors = [];
    const active = signals.filter(s => s.active);
    if (active.length === 0) return factors;

    const keys = getUserAliases(u);

    // Check if IPs are from mobile carriers (normal to change IP)
    let mobileIpCount = 0;
    let totalGeoIps = 0;
    for (const key of keys) {
      const ips = (state.activeIps || {})[key];
      if (!Array.isArray(ips)) continue;
      for (const entry of ips) {
        const geo = entry && entry.geo;
        if (!geo) continue;
        totalGeoIps++;
        if (geo.connectionType && geo.connectionType.toLowerCase().includes('cell')) {
          mobileIpCount++;
        }
      }
    }

    if (mobileIpCount > 0) {
      factors.push({
        id: 'mobile_carrier',
        text: `${mobileIpCount} IP от мобильного оператора — частая смена IP нормальна`,
      });
    }

    // All IPs from same country
    if (context.countryCount === 1 && context.ipCount >= 2) {
      factors.push({
        id: 'same_country',
        text: 'Все IP из одной страны — может быть один человек с несколькими провайдерами',
      });
    }

    // HWID well within limit
    const hwidLimit = getUserHwidLimit(u);
    const hwidCount = hwidCountForUser(u, state);
    if (hwidCount <= 1 && hwidLimit >= 2) {
      factors.push({
        id: 'low_hwid',
        text: `Только ${hwidCount} устройство из ${hwidLimit} — нет признаков мультидевайса`,
      });
    } else if (hwidCount > 1 && hwidCount <= hwidLimit) {
      factors.push({
        id: 'hwid_within_limit',
        text: `${hwidCount} устройств из ${hwidLimit} — в пределах лимита тарифа`,
      });
    }

    // Low traffic might indicate reconnect, not real usage
    const traffic = Number(u.usedTrafficBytes || u.usedTraffic || 0);
    const median = state.trafficMedian || 0;
    if (median > 0 && traffic < median * 0.5) {
      factors.push({
        id: 'low_traffic',
        text: 'Трафик ниже медианы — возможно reconnect, а не реальное использование',
      });
    }

    // Only residential IPs (no datacenter/hosting)
    if (context.hostingIpCount === 0 && context.proxyIpCount === 0 && context.vpnIpCount === 0 && totalGeoIps > 0) {
      factors.push({
        id: 'all_residential',
        text: 'Все IP резидентные (домашние/мобильные) — нет VPN/хостинг признаков',
      });
    }

    // Short reconnect window (IPs might be transitional)
    if (context.ipCount === 2 && context.asnCount <= 2 && context.countryCount === 1) {
      factors.push({
        id: 'possible_reconnect',
        text: '2 IP, 1 страна — может быть обычная смена IP при reconnect',
      });
    }

    return factors;
  }

  // ─── #10 Schedule Pattern Detection ───────────────────────────
  // Detects recurring daily patterns where different ASNs appear at
  // consistent time slots, suggesting multiple people on a schedule.
  function detectSchedulePattern(u, state, keys, hwidLimit) {
    const history = state.ipHistory || [];
    if (history.length < 20) return null; // need decent history

    // Group snapshots by hour-of-day and track which ASNs appear at each hour
    const hourAsns = {}; // hour -> Set of ASNs
    const hourCountries = {}; // hour -> Set of countries

    for (const snap of history) {
      const hour = new Date(snap.ts).getUTCHours();
      if (!hourAsns[hour]) { hourAsns[hour] = new Set(); hourCountries[hour] = new Set(); }

      for (const key of keys) {
        const ips = snap.ips && snap.ips[key];
        if (!Array.isArray(ips) && !(ips && ips.size)) continue;
        const ipList = Array.isArray(ips) ? ips : Array.from(ips);
        for (const ip of ipList) {
          const activeEntries = (state.activeIps || {})[key] || [];
          const entry = activeEntries.find(e => e && e.ip === ip);
          if (entry && entry.geo) {
            if (entry.geo.asn) hourAsns[hour].add(String(entry.geo.asn));
            if (entry.geo.countryCode) hourCountries[hour].add(entry.geo.countryCode);
          }
        }
      }
    }

    // Check if different time blocks have different dominant ASNs
    const blocks = [
      { name: 'утро', hours: [5, 6, 7, 8, 9, 10, 11] },
      { name: 'день', hours: [12, 13, 14, 15, 16, 17] },
      { name: 'вечер', hours: [18, 19, 20, 21, 22, 23] },
      { name: 'ночь', hours: [0, 1, 2, 3, 4] },
    ];

    const blockAsns = [];
    for (const block of blocks) {
      const asns = new Set();
      const countries = new Set();
      for (const h of block.hours) {
        if (hourAsns[h]) hourAsns[h].forEach(a => asns.add(a));
        if (hourCountries[h]) hourCountries[h].forEach(c => countries.add(c));
      }
      if (asns.size > 0) {
        blockAsns.push({ name: block.name, asns, countries });
      }
    }

    if (blockAsns.length < 2) return null;

    // Check if blocks have significantly different ASN sets
    let exclusiveBlocks = 0;
    let differentCountryBlocks = 0;
    const allBlockCountries = new Set();

    for (let i = 0; i < blockAsns.length; i++) {
      for (let j = i + 1; j < blockAsns.length; j++) {
        // Count ASNs that appear in block i but NOT in block j
        let exclusive = 0;
        for (const asn of blockAsns[i].asns) {
          if (!blockAsns[j].asns.has(asn)) exclusive++;
        }
        for (const asn of blockAsns[j].asns) {
          if (!blockAsns[i].asns.has(asn)) exclusive++;
        }
        if (exclusive >= 2) exclusiveBlocks++;
      }
      blockAsns[i].countries.forEach(c => allBlockCountries.add(c));
      if (blockAsns[i].countries.size >= 2) differentCountryBlocks++;
    }

    // Only flag if exclusive ASN count exceeds HWID limit
    const totalExclusiveAsns = new Set();
    for (const b of blockAsns) b.asns.forEach(a => totalExclusiveAsns.add(a));
    if (totalExclusiveAsns.size <= hwidLimit) return null;

    if (exclusiveBlocks >= 2 && allBlockCountries.size >= 2) {
      const blockNames = blockAsns.map(b => b.name).join(', ');
      return {
        id: 'schedule_pattern', category: 'weak', active: true,
        points: 15,
        reason: `разные ASN по расписанию (${blockNames}), ${totalExclusiveAsns.size} ASN из ${allBlockCountries.size} стран > лимит ${hwidLimit}`,
      };
    }

    return null;
  }

  // ─── #11 Multi-Platform Subscription Detection ──────────────
  function detectMultiPlatformSub(u, state, keys, hwidLimit, hwidCount) {
    const subHistory = state.subHistory;
    if (!subHistory) return null;

    // Find sub history for any of user's aliases
    let hist = null;
    for (const key of keys) {
      if (subHistory[key]) { hist = subHistory[key]; break; }
    }
    if (!hist) return null;

    const buildIds = Array.isArray(hist.buildIds) ? hist.buildIds.filter(Boolean) : [];
    const uaVariantCount = buildIds.length || Number(hist.buildIdCount || 0);
    const hasUaVariants = Number.isFinite(uaVariantCount) && uaVariantCount > 0;
    const platforms = hist.platforms || [];
    const platformLimitSuffix = ` (${platforms.length} платформ, лимит ${hwidLimit})`;
    const hwidWithinLimit = hwidCount > 0 && hwidCount <= hwidLimit;

    // Happ's UA suffix looks like a client build/app variant, not a stable
    // device identity. If Remnawave HWID is present and within the paid limit,
    // subscription UA churn must not become an abuse signal by itself.
    if (hwidWithinLimit && platforms.length <= hwidLimit) return null;

    // Check for different OS platforms.
    const MOBILE_PLATFORMS = ['ios', 'android'];
    const mobilePlatforms = platforms.filter(p => MOBILE_PLATFORMS.includes(p));
    const desktopPlatforms = platforms.filter(p => !MOBILE_PLATFORMS.includes(p) && p !== 'happ');

    // Multiple platform families only matter when they exceed the paid device
    // limit. Otherwise iOS+desktop, etc. is normal for multi-device plans.
    if (mobilePlatforms.length >= 2 && platforms.length > hwidLimit) {
      return {
        id: 'multi_platform_sub', category: 'weak', active: true, points: 15,
        reason: `подписка с разных ОС: ${platforms.join(', ')}${platformLimitSuffix}`,
      };
    }

    // Mobile + desktop also needs to exceed the paid platform/device limit.
    if (mobilePlatforms.length >= 1 && desktopPlatforms.length >= 1 && platforms.length > hwidLimit) {
      return {
        id: 'multi_platform_sub', category: 'weak', active: true, points: 15,
        reason: `подписка с мобильной и десктопной ОС: ${platforms.join(', ')}${platformLimitSuffix}`,
      };
    }

    if (!hasUaVariants || hwidWithinLimit) return null;

    // UA build/app variants are not devices. Keep this as a weak hint only
    // when HWID data is missing/stale and the variants greatly exceed the plan.
    const excess = uaVariantCount - hwidLimit;
    if (excess >= 4) {
      return {
        id: 'multi_device_sub', category: 'weak', active: true, points: 15,
        reason: `${uaVariantCount} UA-сборок обновляют подписку > лимит ${hwidLimit}${platforms.length ? ` (${platforms.join(', ')})` : ''}`,
      };
    }

    if (excess >= 2) {
      return {
        id: 'multi_device_sub', category: 'weak', active: true, points: 10,
        reason: `${uaVariantCount} UA-сборок обновляют подписку > лимит ${hwidLimit}`,
      };
    }

    return null;
  }

  // ─── #12 Subscription Storm Detection ────────────────────────
  // Detects rapid subscription key distribution: many unique buildIds
  // requesting the subscription in a short time window.
  function detectSubStorm(u, state, keys) {
    const subHistory = state.subHistory;
    if (!subHistory) return null;

    let hist = null;
    for (const key of keys) {
      if (subHistory[key]) { hist = subHistory[key]; break; }
    }
    if (!hist || !Array.isArray(hist.records) || hist.records.length < 3) return null;

    // Check for burst: many unique buildIds in a 5-minute window
    const STORM_WINDOW_MS = 5 * 60 * 1000;
    const now = Date.now();
    const recentRecords = hist.records.filter(r => r.ts && (now - r.ts) < STORM_WINDOW_MS);

    if (recentRecords.length < 5) {
      // Also check for longer-term storm: 15+ unique buildIds in last hour
      const HOUR_MS = 60 * 60 * 1000;
      const hourRecords = hist.records.filter(r => r.ts && (now - r.ts) < HOUR_MS);
      const hourBuildIds = new Set(hourRecords.map(r => r.buildId).filter(Boolean));

      if (hourBuildIds.size >= 15) {
        return {
          id: 'sub_storm', category: 'strong', active: true, points: 20,
          reason: `${hourBuildIds.size} уникальных устройств запросили подписку за последний час`,
        };
      }

      return null;
    }

    const stormBuildIds = new Set(recentRecords.map(r => r.buildId).filter(Boolean));
    const stormIps = new Set(recentRecords.map(r => r.ip).filter(Boolean));

    if (stormBuildIds.size >= 10) {
      return {
        id: 'sub_storm', category: 'strong', active: true, points: 30,
        reason: `шторм подписки: ${stormBuildIds.size} устройств с ${stormIps.size} IP за 5 минут — ключ активно распространяется`,
      };
    }

    if (stormBuildIds.size >= 5) {
      return {
        id: 'sub_storm', category: 'strong', active: true, points: 20,
        reason: `${stormBuildIds.size} устройств запросили подписку за 5 минут`,
      };
    }

    return null;
  }

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
    if (state && getActiveIpKey(u, state)) return false;
    if (status === 'disabled' || status === 'expired' || status === 'limited') return true;
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

  // getUserKey и getUserAliases импортированы из utils.js

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
