const DEFAULT_SYSTEM_PROMPT = [
  'Ты аналитик анти-абьюза VPN-сервиса.',
  'Работай только с агрегированными признаками, не требуй персональные данные.',
  'Не называй пользователя нарушителем без доказательств: используй формулировки риска.',
  'Не предлагай автоматический бан. Для high/critical рекомендуй ручную проверку.',
  'Возвращай только JSON без markdown.',
].join(' ');

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-haiku-latest',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    kind: 'google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-1.5-flash',
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    kind: 'openai-compatible',
    defaultBaseUrl: '',
    defaultModel: '',
  },
};

const DEFAULT_SETTINGS = {
  enabled: false,
  provider: 'openai',
  model: PROVIDERS.openai.defaultModel,
  baseUrl: PROVIDERS.openai.defaultBaseUrl,
  apiKey: '',
  temperature: 0.2,
  maxTokens: 3000,
  timeoutSeconds: 30,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

function createAiService({ store }) {
  function getSettings() {
    const saved = store.getAiSettings ? store.getAiSettings() : {};
    return normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...saved,
    }, { keepUnknownKey: true });
  }

  function getPublicSettings() {
    const settings = getSettings();
    return publicSettings(settings);
  }

  function getProviderList() {
    return Object.values(PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      defaultBaseUrl: provider.defaultBaseUrl,
      defaultModel: provider.defaultModel,
    }));
  }

  function saveSettings(input = {}) {
    const current = getSettings();
    const next = normalizeSettings({
      ...current,
      ...input,
      apiKey: resolveIncomingApiKey(input, current),
    }, { keepUnknownKey: true });

    if (store.setAiSettings) store.setAiSettings(next);
    return publicSettings(next);
  }

  async function testConnection() {
    const settings = requireUsableSettings(getSettings());
    const result = await callModel(settings, [
      { role: 'system', content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: 'Верни JSON {"ok":true,"summary":"ИИ подключен"} без дополнительного текста.',
      },
    ]);
    return {
      ok: true,
      provider: settings.provider,
      model: settings.model,
      response: parseJsonFromText(result.text) || { summary: result.text.slice(0, 500) },
      usage: result.usage || null,
    };
  }

  async function analyzeUser(state, userKey) {
    const settings = requireUsableSettings(getSettings());
    const payload = buildUserPayload(state, userKey);
    payload.history = getSafeUserHistory(payload.user.key, userKey);
    const result = await analyzePayload(settings, {
      type: 'single_user',
      payload,
    });
    return {
      ok: true,
      provider: settings.provider,
      model: settings.model,
      userKey: payload.user.key,
      analysis: result.analysis,
      usage: result.usage || null,
    };
  }

  async function analyzeSuspects(state, limit = 8) {
    const settings = requireUsableSettings(getSettings());
    const payload = buildSuspectsPayload(state, limit);
    const result = await analyzePayload(settings, {
      type: 'suspects_batch',
      payload,
    });
    return {
      ok: true,
      provider: settings.provider,
      model: settings.model,
      analyzedUsers: payload.users.length,
      analysis: result.analysis,
      usage: result.usage || null,
    };
  }

  return {
    getSettings,
    getPublicSettings,
    getProviderList,
    saveSettings,
    testConnection,
    analyzeUser,
    analyzeSuspects,
  };

  function getSafeUserHistory(primaryKey, fallbackKey) {
    if (!store.getUserHistory) return null;
    const keys = Array.from(new Set([primaryKey, fallbackKey].filter(Boolean).map(String)));
    for (const key of keys) {
      try {
        const history = store.getUserHistory(key, 168);
        if (history && hasUsefulHistory(history)) return summarizeUserHistory(history);
      } catch {
        // История может отсутствовать для алиаса; пробуем следующий ключ.
      }
    }
    return null;
  }
}

function normalizeSettings(input = {}, options = {}) {
  const provider = PROVIDERS[input.provider] ? input.provider : DEFAULT_SETTINGS.provider;
  const providerDef = PROVIDERS[provider];
  const model = String(input.model || providerDef.defaultModel || '').trim();
  const baseUrl = String(input.baseUrl || providerDef.defaultBaseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = options.keepUnknownKey ? String(input.apiKey || '') : '';
  const temperature = clamp(Number(input.temperature ?? DEFAULT_SETTINGS.temperature), 0, 2);
  const maxTokens = Math.round(clamp(Number(input.maxTokens || DEFAULT_SETTINGS.maxTokens), 128, 16000));
  const timeoutSeconds = Math.round(clamp(Number(input.timeoutSeconds || DEFAULT_SETTINGS.timeoutSeconds), 5, 120));
  const systemPrompt = String(input.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim().slice(0, 4000);

  return {
    enabled: input.enabled === true || input.enabled === 'true' || input.enabled === 1,
    provider,
    model,
    baseUrl,
    apiKey,
    temperature,
    maxTokens,
    timeoutSeconds,
    systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
  };
}

function resolveIncomingApiKey(input, current) {
  if (!Object.prototype.hasOwnProperty.call(input, 'apiKey')) return current.apiKey || '';
  const value = String(input.apiKey || '').trim();
  if (value === '') return current.apiKey || '';
  if (value === '__clear__') return '';
  return value;
}

function publicSettings(settings) {
  return {
    enabled: Boolean(settings.enabled),
    provider: settings.provider,
    model: settings.model || '',
    baseUrl: settings.baseUrl || '',
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    timeoutSeconds: settings.timeoutSeconds,
    systemPrompt: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    apiKeySet: Boolean(settings.apiKey),
    apiKeyPreview: maskSecret(settings.apiKey),
  };
}

function requireUsableSettings(settings) {
  if (!settings.enabled) throw new Error('ИИ выключен в настройках');
  const provider = PROVIDERS[settings.provider];
  if (!provider) throw new Error('Неизвестный провайдер ИИ');
  if (!settings.apiKey) throw new Error('Не задан API-ключ ИИ');
  if (!settings.model) throw new Error('Не указана модель ИИ');
  if (!settings.baseUrl) throw new Error('Не указан Base URL провайдера');
  return settings;
}

async function analyzePayload(settings, data) {
  const schemaHint = {
    riskLevel: 'clean | watch | medium | high | critical',
    riskScore: '0-100',
    confidence: '0-100',
    summary: 'короткий вывод на русском',
    evidence: ['конкретный агрегированный признак риска'],
    counterEvidence: ['что может быть нормальным объяснением'],
    recommendedAction: 'observe | manual_review | warn_user | restrict_after_review',
    operatorNote: '1-2 предложения для оператора',
  };

  const messages = [
    { role: 'system', content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        'Проанализируй агрегированные данные мониторинга VPN на риск передачи подписки другим людям.',
        'Учитывай текущий срез и весь доступный локальный контекст в агрегированном виде: историю IP/ASN/стран, HWID, подписки, связи, инциденты и аудит.',
        'Верни строгий JSON по схеме:',
        JSON.stringify(schemaHint),
        'Не добавляй markdown. Не используй сырые IP/HWID: их нет в данных намеренно.',
        'Данные:',
        JSON.stringify(data),
      ].join('\n'),
    },
  ];

  const result = await callModel(settings, messages);
  const parsed = parseJsonFromText(result.text);
  return {
    analysis: sanitizeAnalysis(parsed, result.text),
    usage: result.usage || null,
  };
}

async function callModel(settings, messages) {
  const provider = PROVIDERS[settings.provider];
  if (!provider) throw new Error('Неизвестный провайдер ИИ');
  if (provider.kind === 'anthropic') return callAnthropic(settings, messages);
  if (provider.kind === 'google') return callGoogle(settings, messages);
  return callOpenAiCompatible(settings, messages, provider);
}

async function callOpenAiCompatible(settings, messages, provider) {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`,
  };
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://remnawave-monitor.local';
    headers['X-Title'] = 'Remnawave Monitor';
  }
  const body = {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
  };
  const json = await postJson(url, headers, body, settings.timeoutSeconds);
  const choice = json.choices && json.choices[0] ? json.choices[0] : null;
  const message = choice && choice.message ? choice.message : {};
  const text = extractProviderText(message.content) ||
    extractProviderText(choice && choice.text) ||
    extractProviderText(json.output_text);
  const refusal = extractProviderText(message.refusal);
  if (!text && refusal) {
    throw providerEmptyResponseError('Провайдер отказался отвечать', summarizeOpenAiResponse(json));
  }
  if (!text) throw providerEmptyResponseError('Провайдер вернул пустой ответ', summarizeOpenAiResponse(json));
  return { text, usage: json.usage || null };
}

async function callAnthropic(settings, messages) {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const system = messages.find((m) => m.role === 'system');
  const body = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
    system: system ? system.content : DEFAULT_SYSTEM_PROMPT,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  };
  const json = await postJson(url, {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-api-key': settings.apiKey,
    'anthropic-version': '2023-06-01',
  }, body, settings.timeoutSeconds);
  const text = extractProviderText(json.content);
  if (!text) throw providerEmptyResponseError('Провайдер вернул пустой ответ', summarizeAnthropicResponse(json));
  return { text, usage: json.usage || null };
}

async function callGoogle(settings, messages) {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const text = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n');
  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: settings.temperature,
      maxOutputTokens: settings.maxTokens,
    },
  };
  const json = await postJson(url, {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }, body, settings.timeoutSeconds);
  const parts = json.candidates && json.candidates[0] && json.candidates[0].content
    ? json.candidates[0].content.parts || []
    : [];
  const resultText = extractProviderText(parts);
  if (!resultText) throw providerEmptyResponseError('Провайдер вернул пустой ответ', summarizeGoogleResponse(json));
  return { text: resultText, usage: json.usageMetadata || null };
}

function extractProviderText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(extractProviderText).filter(Boolean).join('\n').trim();
  if (typeof value !== 'object') return '';

  return extractProviderText(value.text) ||
    extractProviderText(value.output_text) ||
    extractProviderText(value.content) ||
    extractProviderText(value.value) ||
    extractProviderText(value.message);
}

function providerEmptyResponseError(message, debug) {
  if (debug && debug.finishReason === 'length') {
    return new Error([
      'Провайдер оборвал ответ по лимиту токенов до JSON.',
      'Увеличьте Max tokens в настройках ИИ или выберите модель без reasoning/thinking.',
      formatProviderDebug(debug),
    ].filter(Boolean).join(' '));
  }
  const suffix = formatProviderDebug(debug);
  const error = new Error(suffix ? `${message}: ${suffix}` : message);
  error.providerDebug = debug;
  return error;
}

function formatProviderDebug(debug) {
  if (!debug || typeof debug !== 'object') return '';
  return Object.entries(debug)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(', ')
    .slice(0, 500);
}

function summarizeOpenAiResponse(json) {
  const choice = json && json.choices && json.choices[0] ? json.choices[0] : null;
  const message = choice && choice.message ? choice.message : {};
  return {
    format: 'chat.completions',
    choices: Array.isArray(json && json.choices) ? json.choices.length : 0,
    finishReason: choice && (choice.finish_reason || choice.finishReason),
    messageKeys: message && typeof message === 'object' ? Object.keys(message).slice(0, 10) : [],
    refusal: extractProviderText(message.refusal).slice(0, 120),
  };
}

function summarizeAnthropicResponse(json) {
  return {
    format: 'anthropic.messages',
    stopReason: json && json.stop_reason,
    contentTypes: Array.isArray(json && json.content)
      ? json.content.map((part) => part && part.type).filter(Boolean).slice(0, 10)
      : [],
  };
}

function summarizeGoogleResponse(json) {
  const candidate = json && json.candidates && json.candidates[0] ? json.candidates[0] : null;
  return {
    format: 'google.generateContent',
    candidates: Array.isArray(json && json.candidates) ? json.candidates.length : 0,
    finishReason: candidate && candidate.finishReason,
    blockReason: json && json.promptFeedback && json.promptFeedback.blockReason,
    partCount: candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts.length : 0,
  };
}

async function postJson(url, headers, body, timeoutSeconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutSeconds || 30) * 1000);
  let response;
  let text = '';
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Таймаут запроса к ИИ');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let json = {};
  try { json = text ? JSON.parse(text) : {}; }
  catch { json = { raw: text }; }

  if (!response.ok) {
    const message = json.error && (json.error.message || json.error)
      ? (json.error.message || json.error)
      : text.slice(0, 500);
    throw new Error(`AI API ${response.status}: ${message}`);
  }

  return json;
}

function buildUserPayload(state, rawUserKey) {
  const user = findUserByAnyKey(state, rawUserKey);
  if (!user) throw new Error('Пользователь не найден в текущем снимке');

  const key = getUserKey(user);
  const aliases = getUserAliases(user);
  const detection = findDetectionForUser(state, aliases);
  const activeEntries = getActiveEntriesForUser(state, aliases);
  const geo = summarizeGeo(activeEntries);
  const proxy = summarizeProxy(activeEntries, state.proxyData || {});
  const sub = findSubHistoryForUser(state, aliases);
  const relations = summarizeRelations(state, aliases);
  const incident = findIncidentForUser(state, aliases);
  const trafficBytes = getTrafficBytes(user);
  const trafficMedian = Number(state.trafficMedian || 0);
  const hwidLimit = getHwidLimit(user);
  const hwidCount = getHwidCount(state, user, aliases);

  return {
    generatedAt: Date.now(),
    user: {
      key,
      status: user.status || null,
      accountAgeDays: daysSince(user.createdAt || user.created_at),
      expiresInDays: daysUntil(user.expireAt || user.subscriptionExpireAt || user.expiresAt || user.validUntil),
    },
    devices: {
      hwidCount,
      hwidLimit,
      overLimitBy: Math.max(0, hwidCount - hwidLimit),
      churn30d: getHwidChurn(state, aliases),
    },
    network: {
      activeIpCount: activeEntries.length,
      uniqueCountries: geo.countries,
      uniqueAsns: geo.asns,
      cities: geo.cities,
      connectionTypes: geo.connectionTypes,
      proxyFlags: proxy,
    },
    traffic: {
      usedGb: roundGb(trafficBytes),
      limitGb: roundGb(getTrafficLimitBytes(user)),
      medianRatio: trafficMedian > 0 ? round(trafficBytes / trafficMedian, 2) : null,
    },
    subscriptionRequests: sub,
    existingDetection: detection,
    incident,
    relations,
  };
}

function hasUsefulHistory(history) {
  return Number(history.totalSnapshots || 0) > 0 ||
    Number(history.uniqueIps || 0) > 0 ||
    (Array.isArray(history.hwidHistory) && history.hwidHistory.length > 0) ||
    (Array.isArray(history.auditLog) && history.auditLog.length > 0) ||
    (Array.isArray(history.events) && history.events.length > 0);
}

function summarizeUserHistory(history) {
  const events = Array.isArray(history.events) ? history.events : [];
  const auditLog = Array.isArray(history.auditLog) ? history.auditLog : [];
  const hwidHistory = Array.isArray(history.hwidHistory) ? history.hwidHistory : [];
  const linkedAccounts = history.linkedAccounts && typeof history.linkedAccounts === 'object' ? history.linkedAccounts : {};
  const timelineSummary = summarizeHistoryTimeline(history.timeline);
  const eventTypes = countBy(events, (event) => event.type || 'unknown');
  const linkedUserCount = new Set(Object.values(linkedAccounts)
    .flat()
    .map((item) => item && item.userKey)
    .filter(Boolean)
    .map(String)).size;
  const now = Date.now();
  const last7d = now - 7 * 24 * 60 * 60 * 1000;

  return {
    hours: Number(history.hours || 0),
    totalSnapshots: Number(history.totalSnapshots || 0),
    uniqueIpCount: Number(history.uniqueIps || 0),
    timeline: timelineSummary,
    hwid: {
      totalSeen: hwidHistory.length,
      addedLast7d: hwidHistory.filter((item) => Number(item.first_seen || item.firstSeen || 0) >= last7d).length,
      linkedAccountClusters: Object.keys(linkedAccounts).length,
      linkedAccountCount: linkedUserCount,
    },
    audit: {
      checks: auditLog.length,
      maxRiskScore: auditLog.reduce((max, item) => Math.max(max, Number(item.riskScore || 0)), 0),
      latestRiskLevel: auditLog[0] ? auditLog[0].riskLevel || null : null,
      latestSignals: auditLog[0] && Array.isArray(auditLog[0].signals)
        ? auditLog[0].signals.map(sanitizeSignal).slice(0, 12)
        : [],
    },
    eventTypes,
    recentEvents: events.slice(0, 24).map(sanitizeHistoryEvent),
  };
}

function summarizeHistoryTimeline(timeline) {
  const points = Array.isArray(timeline) ? timeline : [];
  const countries = new Set();
  const asns = new Set();
  const cities = new Set();
  const connectionTypes = new Set();
  let maxConcurrentIps = 0;

  for (const point of points) {
    const ips = Array.isArray(point.ips) ? point.ips : [];
    maxConcurrentIps = Math.max(maxConcurrentIps, ips.length);
    for (const item of ips) {
      const geo = item && item.geo || {};
      const country = geo.countryCode || geo.country || '';
      const asn = geo.asn ? `AS${geo.asn}` : '';
      if (country) countries.add(country);
      if (asn) asns.add(asn);
      if (geo.city) cities.add(geo.city);
      if (geo.connectionType) connectionTypes.add(geo.connectionType);
    }
  }

  return {
    windows: points.length,
    maxConcurrentIps,
    countries: Array.from(countries).slice(0, 20),
    asns: Array.from(asns).slice(0, 20),
    cities: Array.from(cities).slice(0, 20),
    connectionTypes: Array.from(connectionTypes).slice(0, 12),
  };
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = String(getKey(item) || 'unknown');
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function sanitizeHistoryEvent(event) {
  const type = String(event && event.type || 'unknown');
  const result = {
    ts: Number(event && event.ts || 0),
    type,
    title: String(event && event.title || '').slice(0, 120),
    detail: safeEventDetail(event),
  };
  if (event && event.meta && type === 'detection') {
    result.riskLevel = event.meta.riskLevel || null;
    result.riskScore = Number(event.meta.riskScore || 0);
    result.signals = Array.isArray(event.meta.signals) ? event.meta.signals.map(sanitizeSignal).slice(0, 8) : [];
  }
  if (event && event.meta && type === 'country_changed') {
    result.countries = normalizeStringArray(event.meta.countries, 10);
  }
  if (event && event.meta && type === 'asn_changed') {
    result.asns = normalizeStringArray(event.meta.asns, 10).map((asn) => asn.startsWith('AS') ? asn : `AS${asn}`);
  }
  if (event && event.meta && type === 'ip_first_seen') {
    result.country = event.meta.country || '';
    result.asn = event.meta.asn ? `AS${event.meta.asn}` : '';
    result.org = String(event.meta.org || '').slice(0, 80);
  }
  return result;
}

function safeEventDetail(event) {
  const type = String(event && event.type || '');
  if (type === 'ip_first_seen') return 'new_ip_seen';
  if (type === 'hwid_added') return 'new_hwid_seen';
  if (type === 'notification_sent') return 'notification_sent';
  if (type === 'notification_failed') return 'notification_failed';
  return redactSensitiveTokens(String(event && event.detail || '').slice(0, 180));
}

function sanitizeSignal(signal) {
  if (!signal || typeof signal !== 'object') return {};
  return {
    id: String(signal.id || '').slice(0, 80),
    category: String(signal.category || '').slice(0, 40),
    points: Number(signal.points || 0),
    reason: redactSensitiveTokens(String(signal.reason || signal.text || '').slice(0, 220)),
  };
}

function redactSensitiveTokens(text) {
  return String(text || '')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/\b[0-9a-f]{16,}\b/gi, '[id]');
}

function buildSuspectsPayload(state, limit) {
  const detection = state.detection || {};
  const entries = [
    ...(Array.isArray(detection.suspects) ? detection.suspects : []),
    ...(Array.isArray(detection.observed) ? detection.observed : []),
  ]
    .sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0))
    .slice(0, Math.max(1, Math.min(20, Number(limit || 8))));

  const users = entries.map((entry) => {
    try { return buildUserPayload(state, entry.key || entry.userKey); }
    catch { return null; }
  }).filter(Boolean);

  return {
    generatedAt: Date.now(),
    totals: {
      users: Array.isArray(state.users) ? state.users.length : 0,
      suspects: Array.isArray(detection.suspects) ? detection.suspects.length : 0,
      observed: Array.isArray(detection.observed) ? detection.observed.length : 0,
    },
    users,
  };
}

function findUserByAnyKey(state, rawKey) {
  const target = String(rawKey || '');
  return (state.users || []).find((user) => getUserAliases(user).includes(target)) || null;
}

function getUserKey(user) {
  if (!user) return '';
  return String(user.userUuid || user.uuid || user.id || user.userId || user.username || user.name || '');
}

function getUserAliases(user) {
  if (!user) return [];
  return Array.from(new Set([
    getUserKey(user),
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
    .map(String)));
}

function findDetectionForUser(state, aliases) {
  const detection = state.detection || {};
  for (const listName of ['suspects', 'observed']) {
    const list = Array.isArray(detection[listName]) ? detection[listName] : [];
    const match = list.find((entry) => aliases.includes(String(entry.key || entry.userKey || '')));
    if (!match) continue;
    return {
      list: listName,
      riskLevel: match.riskLevel || null,
      riskScore: Number(match.riskScore || 0),
      confidence: match.confidence || null,
      signals: Array.isArray(match.signals) ? match.signals.map((signal) => ({
        id: signal.id,
        category: signal.category,
        points: signal.points,
        reason: signal.reason,
      })) : [],
      mitigating: Array.isArray(match.mitigating) ? match.mitigating.map((item) => item.text || item.id).filter(Boolean) : [],
    };
  }
  return null;
}

function getActiveEntriesForUser(state, aliases) {
  const result = [];
  const seen = new Set();
  for (const alias of aliases) {
    const entries = state.activeIps && state.activeIps[alias];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const ip = typeof entry === 'string' ? entry : entry && entry.ip;
      if (!ip || seen.has(ip)) continue;
      seen.add(ip);
      result.push(typeof entry === 'string' ? { ip } : entry);
    }
  }
  return result;
}

function summarizeGeo(entries) {
  const countries = new Set();
  const asns = new Set();
  const cities = new Set();
  const connectionTypes = new Set();
  for (const entry of entries) {
    const geo = entry && entry.geo || {};
    if (geo.countryCode || geo.country) countries.add(geo.countryCode || geo.country);
    if (geo.asn) asns.add(`AS${geo.asn}`);
    if (geo.city) cities.add(geo.city);
    if (geo.connectionType) connectionTypes.add(geo.connectionType);
  }
  return {
    countries: Array.from(countries).slice(0, 10),
    asns: Array.from(asns).slice(0, 12),
    cities: Array.from(cities).slice(0, 12),
    connectionTypes: Array.from(connectionTypes).slice(0, 8),
  };
}

function summarizeProxy(entries, proxyData) {
  const result = { vpn: 0, proxy: 0, tor: 0, hosting: 0 };
  for (const entry of entries) {
    const ip = entry && entry.ip;
    const info = ip && proxyData[ip];
    if (!info) continue;
    if (info.isVPN) result.vpn++;
    if (info.isProxy) result.proxy++;
    if (info.isTor) result.tor++;
    if (info.isHosting || info.isDatacenter) result.hosting++;
  }
  return result;
}

function findSubHistoryForUser(state, aliases) {
  const subHistory = state.subHistory || {};
  let item = null;
  for (const alias of aliases) {
    if (subHistory[alias]) { item = subHistory[alias]; break; }
  }
  if (!item) return null;
  return {
    platformCount: Number(item.platformCount || 0),
    platforms: Array.isArray(item.platforms) ? item.platforms.slice(0, 8) : [],
    appVersionCount: Number(item.appVersionCount || 0),
    buildIdCount: Number(item.buildIdCount || 0),
    ipCount: Number(item.ipCount || 0),
    requestCount: Number(item.requestCount || 0),
  };
}

function summarizeRelations(state, aliases) {
  const graph = state.relations || {};
  const result = { sharedHwidClusters: 0, sharedIpClusters: 0, sharedAsnClusters: 0 };
  const hasAlias = (users) => (users || []).some((user) => aliases.includes(String(user.key || user.userKey || '')));
  for (const cluster of graph.hwidClusters || []) if (hasAlias(cluster.users)) result.sharedHwidClusters++;
  for (const cluster of graph.ipClusters || []) if (hasAlias(cluster.users)) result.sharedIpClusters++;
  for (const cluster of graph.asnClusters || []) if (hasAlias(cluster.users)) result.sharedAsnClusters++;
  return result;
}

function findIncidentForUser(state, aliases) {
  const incident = (state.incidents || []).find((item) => aliases.includes(String(item.userKey || '')));
  if (!incident) return null;
  return {
    status: incident.status || null,
    riskLevel: incident.riskLevel || null,
    riskScore: Number(incident.riskScore || 0),
    reason: incident.reason || null,
    eventCount: Number(incident.eventCount || 0),
  };
}

function getHwidCount(state, user, aliases) {
  for (const alias of aliases) {
    const devices = state.hwidDevices && state.hwidDevices[alias];
    if (Array.isArray(devices) && devices.length > 0) return devices.length;
  }
  const topEntry = (state.hwidTop || []).find((item) => {
    const itemAliases = getUserAliases(item);
    return itemAliases.some((alias) => aliases.includes(alias)) ||
      (item.username && user.username && item.username === user.username);
  });
  if (topEntry) return Number(topEntry.devicesCount || topEntry.count || 0);
  return Number(user.hwidDevicesCount || user.hwid_count || 0);
}

function getHwidLimit(user) {
  const value = user.hwidDeviceLimit != null ? user.hwidDeviceLimit
    : (user.hwidDevicesLimit != null ? user.hwidDevicesLimit : null);
  if (value !== null && !Number.isNaN(Number(value))) return Number(value);
  return 2;
}

function getHwidChurn(state, aliases) {
  for (const alias of aliases) {
    if (state.hwidChurn && Object.prototype.hasOwnProperty.call(state.hwidChurn, alias)) {
      return Number(state.hwidChurn[alias] || 0);
    }
  }
  return 0;
}

function getTrafficBytes(user) {
  return Number(user.usedTrafficBytes || user.usedTraffic || (user.userTraffic && user.userTraffic.usedTrafficBytes) || 0);
}

function getTrafficLimitBytes(user) {
  return Number(user.trafficLimitBytes || user.trafficLimit || (user.userTraffic && user.userTraffic.trafficLimitBytes) || 0);
}

function daysSince(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function daysUntil(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* try extract */ }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* try object */ }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

function sanitizeAnalysis(parsed, rawText) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const riskScore = clamp(Number(source.riskScore ?? source.score ?? 0), 0, 100);
  const riskLevel = normalizeRiskLevel(source.riskLevel || source.level, riskScore);
  return {
    riskLevel,
    riskScore: Math.round(riskScore),
    confidence: Math.round(clamp(Number(source.confidence ?? 50), 0, 100)),
    summary: String(source.summary || source.operatorNote || rawText || '').trim().slice(0, 1200),
    evidence: normalizeStringArray(source.evidence || source.reasons || source.signals, 8),
    counterEvidence: normalizeStringArray(source.counterEvidence || source.mitigating || source.falsePositiveRisks, 6),
    recommendedAction: normalizeAction(source.recommendedAction || source.action, riskLevel),
    operatorNote: String(source.operatorNote || '').trim().slice(0, 800),
    rawText: parsed ? undefined : String(rawText || '').slice(0, 2000),
  };
}

function normalizeRiskLevel(level, score) {
  const value = String(level || '').toLowerCase();
  if (['clean', 'watch', 'medium', 'high', 'critical'].includes(value)) return value;
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'watch';
  return 'clean';
}

function normalizeAction(action, riskLevel) {
  const value = String(action || '').toLowerCase();
  const allowed = new Set(['observe', 'manual_review', 'warn_user', 'restrict_after_review']);
  if (allowed.has(value)) return value;
  if (riskLevel === 'critical' || riskLevel === 'high') return 'manual_review';
  if (riskLevel === 'medium') return 'observe';
  return 'observe';
}

function normalizeStringArray(value, limit) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.reason || item.text || item.id || JSON.stringify(item);
      return '';
    })
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => String(item).slice(0, 300));
}

function maskSecret(value) {
  const secret = String(value || '');
  if (!secret) return '';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundGb(bytes) {
  const value = Number(bytes || 0);
  if (value <= 0) return 0;
  return round(value / 1073741824, 2);
}

module.exports = {
  createAiService,
  PROVIDERS,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
};
