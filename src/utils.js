// src/utils.js — Общие утилиты для идентификации пользователей
// Используются в detect.js, rules.js, ai-service.js, sync-store.js, remnawave-sync.js

/**
 * Получить основной ключ пользователя (UUID или имя)
 */
function getUserKey(user) {
  if (!user) return '';
  return String(user.userUuid || user.uuid || user.id || user.userId || user.username || user.name || '');
}

/**
 * Получить все возможные идентификаторы пользователя (для поиска по разным полям)
 */
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

/**
 * Построить карту алиасов: alias → основной ключ пользователя
 */
function buildUserAliasMap(users) {
  const map = new Map();
  for (const user of users || []) {
    const key = getUserKey(user);
    if (!key) continue;
    for (const alias of getUserAliases(user)) {
      if (!map.has(alias)) map.set(alias, key);
    }
  }
  return map;
}

module.exports = { getUserKey, getUserAliases, buildUserAliasMap };
