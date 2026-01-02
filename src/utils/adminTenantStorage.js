/*
  Very small localStorage-based persistence used by Admin UI.
  This keeps the front-end fully functional for demos without requiring backend.
*/

export function getTenantId() {
  // Keep it simple for now. Later this should come from auth/tenant context.
  return localStorage.getItem('modelpricer:tenant_id') || 'demo-tenant';
}

function buildKey(tenantId, namespace) {
  return `modelpricer:${tenantId}:${namespace}`;
}

export function readTenantJson(namespace, fallback) {
  const tenantId = getTenantId();
  const storageKey = buildKey(tenantId, namespace);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[adminTenantStorage] Failed to read/parse', storageKey, e);
    return fallback;
  }
}

export function writeTenantJson(namespace, value) {
  const tenantId = getTenantId();
  const storageKey = buildKey(tenantId, namespace);
  localStorage.setItem(storageKey, JSON.stringify(value));
}

export function appendTenantLog(namespace, entry, maxItems = 100) {
  const list = readTenantJson(namespace, []);
  const next = [entry, ...list].slice(0, maxItems);
  writeTenantJson(namespace, next);
  return next;
}
