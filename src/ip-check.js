// src/ip-check.js — VPN/Proxy/Tor detection via proxycheck.io
const https = require('https');

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function createIpChecker(db) {
  // Create cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_proxy_cache (
      ip TEXT PRIMARY KEY,
      is_vpn INTEGER DEFAULT 0,
      is_proxy INTEGER DEFAULT 0,
      is_tor INTEGER DEFAULT 0,
      provider TEXT DEFAULT '',
      risk_score INTEGER DEFAULT 0,
      proxy_type TEXT DEFAULT '',
      raw_json TEXT DEFAULT '{}',
      checked_at INTEGER NOT NULL
    )
  `);

  const getCache = db.prepare('SELECT * FROM ip_proxy_cache WHERE ip = ?');
  const setCache = db.prepare(`
    INSERT INTO ip_proxy_cache (ip, is_vpn, is_proxy, is_tor, provider, risk_score, proxy_type, raw_json, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ip) DO UPDATE SET
      is_vpn = excluded.is_vpn,
      is_proxy = excluded.is_proxy,
      is_tor = excluded.is_tor,
      provider = excluded.provider,
      risk_score = excluded.risk_score,
      proxy_type = excluded.proxy_type,
      raw_json = excluded.raw_json,
      checked_at = excluded.checked_at
  `);

  // Batch check: returns { [ip]: result }
  async function checkIps(ips, apiKey = '') {
    const results = {};
    const toCheck = [];
    const now = Date.now();

    for (const ip of ips) {
      if (!ip || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) continue;

      const cached = getCache.get(ip);
      if (cached && (now - cached.checked_at) < CACHE_TTL) {
        results[ip] = {
          ip,
          isVPN: !!cached.is_vpn,
          isProxy: !!cached.is_proxy,
          isTor: !!cached.is_tor,
          provider: cached.provider || '',
          riskScore: cached.risk_score || 0,
          proxyType: cached.proxy_type || '',
        };
      } else {
        toCheck.push(ip);
      }
    }

    // Check uncached IPs via proxycheck.io (max 100 per request)
    const batches = [];
    for (let i = 0; i < toCheck.length; i += 100) {
      batches.push(toCheck.slice(i, i + 100));
    }

    for (const batch of batches) {
      try {
        const batchResults = await checkBatchProxycheck(batch, apiKey);
        for (const [ip, result] of Object.entries(batchResults)) {
          results[ip] = result;
          setCache.run(
            ip,
            result.isVPN ? 1 : 0,
            result.isProxy ? 1 : 0,
            result.isTor ? 1 : 0,
            result.provider || '',
            result.riskScore || 0,
            result.proxyType || '',
            JSON.stringify(result),
            now
          );
        }
      } catch (err) {
        console.error('[ip-check] batch check error:', err.message);
      }

      // Rate limit: 500ms between batches
      if (batches.length > 1) await sleep(500);
    }

    return results;
  }

  // Get all cached results
  function getAllCached() {
    const now = Date.now();
    const rows = db.prepare('SELECT * FROM ip_proxy_cache WHERE checked_at >= ?').all(now - CACHE_TTL);
    const map = {};
    for (const row of rows) {
      map[row.ip] = {
        ip: row.ip,
        isVPN: !!row.is_vpn,
        isProxy: !!row.is_proxy,
        isTor: !!row.is_tor,
        provider: row.provider || '',
        riskScore: row.risk_score || 0,
        proxyType: row.proxy_type || '',
      };
    }
    return map;
  }

  return { checkIps, getAllCached };
}

// proxycheck.io API (free: 1000/day, no key needed for basic)
function checkBatchProxycheck(ips, apiKey) {
  return new Promise((resolve, reject) => {
    // proxycheck.io supports single IP per request on free tier
    // For batch: check them sequentially with small delays
    const results = {};
    let idx = 0;

    function checkNext() {
      if (idx >= ips.length) return resolve(results);
      const ip = ips[idx++];

      const keyPart = apiKey ? `${apiKey}/` : '';
      const url = `https://proxycheck.io/v2/${keyPart}${ip}?vpn=1&asn=1&risk=1`;

      const req = https.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const ipData = json[ip] || {};
            results[ip] = {
              ip,
              isVPN: ipData.proxy === 'yes' && ipData.type === 'VPN',
              isProxy: ipData.proxy === 'yes' && ipData.type !== 'VPN',
              isTor: ipData.proxy === 'yes' && (ipData.type || '').toLowerCase() === 'tor',
              provider: ipData.provider || ipData.operator?.name || '',
              riskScore: parseInt(ipData.risk || '0', 10),
              proxyType: ipData.type || '',
            };
          } catch (e) {
            results[ip] = { ip, isVPN: false, isProxy: false, isTor: false, provider: '', riskScore: 0, proxyType: '' };
          }
          // Delay between requests to respect rate limits
          setTimeout(checkNext, 150);
        });
      });

      req.on('error', (err) => {
        results[ip] = { ip, isVPN: false, isProxy: false, isTor: false, provider: '', riskScore: 0, proxyType: '' };
        setTimeout(checkNext, 150);
      });

      req.on('timeout', () => {
        req.destroy();
        results[ip] = { ip, isVPN: false, isProxy: false, isTor: false, provider: '', riskScore: 0, proxyType: '' };
        setTimeout(checkNext, 150);
      });
    }

    checkNext();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { createIpChecker };
