// src/rules.js — Rule Engine for automated monitoring
// Rules only NOTIFY admin — no auto-actions

function createRuleEngine(db) {
  // Create rules tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      conditions_json TEXT NOT NULL DEFAULT '[]',
      condition_logic TEXT NOT NULL DEFAULT 'AND',
      action_type TEXT NOT NULL DEFAULT 'notify_admin',
      action_message TEXT DEFAULT '',
      cooldown_hours INTEGER DEFAULT 24,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_triggered_at INTEGER,
      trigger_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rule_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT NOT NULL,
      user_key TEXT NOT NULL,
      triggered_at INTEGER NOT NULL,
      conditions_met TEXT NOT NULL DEFAULT '[]',
      action_taken TEXT DEFAULT '',
      acknowledged INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_rule_triggers_rule ON rule_triggers(rule_id);
    CREATE INDEX IF NOT EXISTS idx_rule_triggers_user ON rule_triggers(user_key);
    CREATE INDEX IF NOT EXISTS idx_rule_triggers_ack ON rule_triggers(acknowledged);
  `);

  // ─── CRUD ────────────────────────────────────────────────────────

  function getAllRules() {
    return db.prepare('SELECT * FROM rules ORDER BY created_at DESC').all().map(parseRule);
  }

  function getRule(id) {
    const row = db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
    return row ? parseRule(row) : null;
  }

  function createRule(data) {
    const id = 'rule_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const now = Date.now();
    db.prepare(`
      INSERT INTO rules (id, name, enabled, conditions_json, condition_logic, action_type, action_message, cooldown_hours, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name || 'Новое правило',
      data.enabled !== false ? 1 : 0,
      JSON.stringify(data.conditions || []),
      data.conditionLogic || 'AND',
      data.actionType || 'notify_admin',
      data.actionMessage || '',
      Number(data.cooldownHours || 24),
      now,
      now
    );
    return getRule(id);
  }

  function updateRule(id, data) {
    const existing = getRule(id);
    if (!existing) throw new Error('Rule not found');

    const updates = [];
    const values = [];

    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.enabled !== undefined) { updates.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
    if (data.conditions !== undefined) { updates.push('conditions_json = ?'); values.push(JSON.stringify(data.conditions)); }
    if (data.conditionLogic !== undefined) { updates.push('condition_logic = ?'); values.push(data.conditionLogic); }
    if (data.actionType !== undefined) { updates.push('action_type = ?'); values.push(data.actionType); }
    if (data.actionMessage !== undefined) { updates.push('action_message = ?'); values.push(data.actionMessage); }
    if (data.cooldownHours !== undefined) { updates.push('cooldown_hours = ?'); values.push(Number(data.cooldownHours)); }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getRule(id);
  }

  function deleteRule(id) {
    db.prepare('DELETE FROM rules WHERE id = ?').run(id);
    db.prepare('DELETE FROM rule_triggers WHERE rule_id = ?').run(id);
  }

  // ─── Evaluation ──────────────────────────────────────────────────

  function evaluateRules(stateData) {
    const rules = getAllRules().filter(r => r.enabled);
    if (rules.length === 0) return { triggered: [], total: 0 };

    const users = stateData.users || [];
    const activeIps = stateData.activeIps || {};
    const detection = stateData.detection || {};
    const suspects = detection.suspects || [];
    const proxyData = stateData.proxyData || {};
    const hwidChurn = stateData.hwidChurn || {};

    const suspectMap = {};
    for (const s of suspects) {
      suspectMap[s.key] = s;
    }

    const now = Date.now();
    const triggered = [];

    for (const rule of rules) {
      const cooldownMs = (rule.cooldownHours || 24) * 60 * 60 * 1000;

      for (const user of users) {
        const key = String(user.userUuid || user.uuid || user.id || user.userId || user.username || user.name || '');
        if (!key) continue;

        // Check cooldown — don't trigger same rule for same user within cooldown
        const lastTrigger = db.prepare(
          'SELECT triggered_at FROM rule_triggers WHERE rule_id = ? AND user_key = ? ORDER BY triggered_at DESC LIMIT 1'
        ).get(rule.id, key);
        if (lastTrigger && (now - lastTrigger.triggered_at) < cooldownMs) continue;

        // Build context for this user
        const userIps = activeIps[key] || [];
        const suspect = suspectMap[key] || null;
        const hwidCount = Number(user.activeUserDevices || user.devicesCount || 0);
        const hwidLimit = Number(user.hwidDeviceLimit || user.activeUserDevices || 2);

        // Check which IPs are VPN/Proxy
        let hasVpn = false;
        let hasProxy = false;
        let hasTor = false;
        for (const entry of userIps) {
          const ip = typeof entry === 'string' ? entry : entry && entry.ip;
          if (ip && proxyData[ip]) {
            if (proxyData[ip].isVPN) hasVpn = true;
            if (proxyData[ip].isProxy) hasProxy = true;
            if (proxyData[ip].isTor) hasTor = true;
          }
        }

        const ctx = {
          hwidCount,
          hwidLimit,
          ipCount: userIps.length,
          isVPN: hasVpn,
          isProxy: hasProxy,
          isTor: hasTor,
          riskScore: suspect ? (suspect.riskScore || 0) : 0,
          status: String(user.status || '').toUpperCase(),
          trafficBytes: Number(user.usedTrafficBytes || user.usedTraffic || 0),
          trafficGB: Number(user.usedTrafficBytes || user.usedTraffic || 0) / (1024 * 1024 * 1024),
          hwidChurn: hwidChurn[key] || 0,
          isSuspect: !!suspect,
          daysActive: user.createdAt ? Math.floor((now - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)) : 0,
        };

        // Evaluate conditions
        const condResults = rule.conditions.map(cond => evaluateCondition(cond, ctx));
        const passed = rule.conditionLogic === 'OR'
          ? condResults.some(r => r.met)
          : condResults.every(r => r.met);

        if (passed && condResults.length > 0) {
          // Record trigger
          const metConditions = condResults.filter(r => r.met).map(r => r.description);
          db.prepare(`
            INSERT INTO rule_triggers (rule_id, user_key, triggered_at, conditions_met, action_taken)
            VALUES (?, ?, ?, ?, ?)
          `).run(rule.id, key, now, JSON.stringify(metConditions), rule.actionType);

          // Update rule stats
          db.prepare('UPDATE rules SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?').run(now, rule.id);

          triggered.push({
            ruleId: rule.id,
            ruleName: rule.name,
            userKey: key,
            userName: user.username || user.name || key,
            conditionsMet: metConditions,
            actionType: rule.actionType,
            actionMessage: rule.actionMessage,
          });
        }
      }
    }

    return { triggered, total: triggered.length };
  }

  function evaluateCondition(cond, ctx) {
    const field = cond.field || '';
    const op = cond.operator || '>';
    const rawValue = cond.value;
    const actual = ctx[field];

    if (actual === undefined) return { met: false, description: `${field}: поле не найдено` };

    let target;
    // Support expressions like "hwidLimit * 2"
    if (typeof rawValue === 'string' && rawValue.includes('*')) {
      const parts = rawValue.split('*').map(p => p.trim());
      target = parts.reduce((acc, p) => {
        const ctxVal = ctx[p];
        return acc * (ctxVal !== undefined ? Number(ctxVal) : Number(p));
      }, 1);
    } else if (typeof rawValue === 'string' && ctx[rawValue] !== undefined) {
      target = ctx[rawValue];
    } else {
      target = rawValue;
    }

    let met = false;
    const numActual = Number(actual);
    const numTarget = Number(target);

    switch (op) {
      case '>': met = numActual > numTarget; break;
      case '>=': met = numActual >= numTarget; break;
      case '<': met = numActual < numTarget; break;
      case '<=': met = numActual <= numTarget; break;
      case '==': met = String(actual) === String(target); break;
      case '!=': met = String(actual) !== String(target); break;
      case 'is_true': met = !!actual; break;
      case 'is_false': met = !actual; break;
      default: met = false;
    }

    return {
      met,
      description: `${field} ${op} ${rawValue} (факт: ${actual})`,
    };
  }

  // ─── Triggers management ─────────────────────────────────────────

  function getRecentTriggers(limit = 50) {
    return db.prepare(`
      SELECT rt.*, r.name AS rule_name
      FROM rule_triggers rt
      LEFT JOIN rules r ON r.id = rt.rule_id
      ORDER BY rt.triggered_at DESC
      LIMIT ?
    `).all(limit).map(row => ({
      id: row.id,
      ruleId: row.rule_id,
      ruleName: row.rule_name || '',
      userKey: row.user_key,
      triggeredAt: row.triggered_at,
      conditionsMet: safeJson(row.conditions_met),
      actionTaken: row.action_taken,
      acknowledged: !!row.acknowledged,
    }));
  }

  function acknowledgeTrigger(triggerId) {
    db.prepare('UPDATE rule_triggers SET acknowledged = 1 WHERE id = ?').run(triggerId);
  }

  function getUnacknowledgedCount() {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM rule_triggers WHERE acknowledged = 0').get();
    return row ? row.cnt : 0;
  }

  // Test run — shows which users would be triggered without actually recording
  function testRule(ruleId, stateData) {
    const rule = getRule(ruleId);
    if (!rule) return { error: 'Rule not found', matches: [] };

    const users = stateData.users || [];
    const activeIps = stateData.activeIps || {};
    const detection = stateData.detection || {};
    const suspects = detection.suspects || [];
    const proxyData = stateData.proxyData || {};
    const hwidChurn = stateData.hwidChurn || {};

    const suspectMap = {};
    for (const s of suspects) { suspectMap[s.key] = s; }

    const now = Date.now();
    const matches = [];

    for (const user of users) {
      const key = String(user.userUuid || user.uuid || user.id || '');
      if (!key) continue;

      const userIps = activeIps[key] || [];
      const suspect = suspectMap[key] || null;
      const hwidCount = Number(user.activeUserDevices || user.devicesCount || 0);
      const hwidLimit = Number(user.hwidDeviceLimit || 2);

      let hasVpn = false, hasProxy = false, hasTor = false;
      for (const entry of userIps) {
        const ip = typeof entry === 'string' ? entry : entry && entry.ip;
        if (ip && proxyData[ip]) {
          if (proxyData[ip].isVPN) hasVpn = true;
          if (proxyData[ip].isProxy) hasProxy = true;
          if (proxyData[ip].isTor) hasTor = true;
        }
      }

      const ctx = {
        hwidCount, hwidLimit,
        ipCount: userIps.length,
        isVPN: hasVpn, isProxy: hasProxy, isTor: hasTor,
        riskScore: suspect ? (suspect.riskScore || 0) : 0,
        status: String(user.status || '').toUpperCase(),
        trafficGB: Number(user.usedTrafficBytes || 0) / (1024 * 1024 * 1024),
        hwidChurn: hwidChurn[key] || 0,
        isSuspect: !!suspect,
        daysActive: user.createdAt ? Math.floor((now - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)) : 0,
      };

      const condResults = rule.conditions.map(cond => evaluateCondition(cond, ctx));
      const passed = rule.conditionLogic === 'OR'
        ? condResults.some(r => r.met)
        : condResults.every(r => r.met);

      if (passed && condResults.length > 0) {
        matches.push({
          userKey: key,
          userName: user.username || user.name || key,
          conditionsMet: condResults.filter(r => r.met).map(r => r.description),
        });
      }
    }

    return { matches, total: matches.length, ruleName: rule.name };
  }

  return {
    getAllRules,
    getRule,
    createRule,
    updateRule,
    deleteRule,
    evaluateRules,
    getRecentTriggers,
    acknowledgeTrigger,
    getUnacknowledgedCount,
    testRule,
  };
}

function parseRule(row) {
  return {
    id: row.id,
    name: row.name,
    enabled: !!row.enabled,
    conditions: safeJson(row.conditions_json),
    conditionLogic: row.condition_logic || 'AND',
    actionType: row.action_type || 'notify_admin',
    actionMessage: row.action_message || '',
    cooldownHours: row.cooldown_hours || 24,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTriggeredAt: row.last_triggered_at,
    triggerCount: row.trigger_count || 0,
  };
}

function safeJson(str) {
  try { return JSON.parse(str); }
  catch { return []; }
}

module.exports = { createRuleEngine };
