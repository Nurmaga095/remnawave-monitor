export async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function createApiClient({ onAuthExpired, debugLog = () => {} } = {}) {
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
      body: JSON.stringify(body),
    });
  }

  async function api(path) {
    const res = await apiGet(path);
    if (res.status === 401) {
      if (typeof onAuthExpired === 'function') await onAuthExpired();
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

  return { apiGet, apiPost, api, readJsonSafe };
}
