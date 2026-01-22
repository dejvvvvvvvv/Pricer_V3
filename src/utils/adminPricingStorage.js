/*
  Admin Pricing (V3) tenant-scoped storage

  - Source of truth lives under: modelpricer:<tenantId>:pricing:v3
  - Includes a small best-effort migration from older demo keys.

  Public API (expected by project prompts):
    - loadPricingConfigV3()
    - savePricingConfigV3(config)
*/

import { getTenantId, readTenantJson, writeTenantJson } from './adminTenantStorage';

const NAMESPACE = 'pricing:v3';

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clampMin0(n) {
  const v = Number(n);
  return Number.isFinite(v) ? (v < 0 ? 0 : v) : 0;
}

function normalizeMaterialKey(key) {
  const k = String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return k;
}

function materialPricesToMaterialsV3(materialPrices) {
  const out = [];
  if (!materialPrices || typeof materialPrices !== 'object') return out;
  for (const [k, v] of Object.entries(materialPrices)) {
    const key = normalizeMaterialKey(k);
    if (!key) continue;
    out.push({
      id: `mat-${key}`,
      key,
      name: String(k).toUpperCase(),
      enabled: true,
      price_per_gram: clampMin0(v),
      colors: [],
    });
  }
  return out;
}

function migrateLegacyPricingConfigIfAny() {
  // IMPORTANT: This is best-effort only. Chat A is the primary owner of full migrations.
  // We migrate only if V3 namespace is empty.
  try {
    if (typeof window === 'undefined') return null;

    const legacyKeys = [
      // AdminPricing.jsx in some earlier versions
      'modelpricer_pricing_config__test-customer-1',
      // pricingService demo reader
      'admin_pricing_demo_v2:test-customer-1',
    ];

    for (const k of legacyKeys) {
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = safeParseJson(raw);
      if (!parsed) continue;

      const materialPrices = parsed.materialPrices || parsed?.config?.materialPrices || null;
      const tenant_pricing = parsed.tenant_pricing || parsed?.config?.tenant_pricing || null;
      const timeRate = parsed.timeRate ?? parsed?.config?.timeRate ?? tenant_pricing?.rate_per_hour ?? null;

      if (!materialPrices && !tenant_pricing) continue;

      return {
        materials: materialPricesToMaterialsV3(materialPrices || {}),
        materialPrices: materialPrices && typeof materialPrices === 'object' ? materialPrices : undefined,
        timeRate: timeRate != null ? clampMin0(timeRate) : undefined,
        tenant_pricing: tenant_pricing && typeof tenant_pricing === 'object' ? tenant_pricing : undefined,
        migrated_from: k,
        migrated_at: new Date().toISOString(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Load pricing config from tenant-scoped V3 storage.
 * If missing, performs a small legacy migration attempt.
 */
export function loadPricingConfigV3() {
  const existing = readTenantJson(NAMESPACE, null);
  if (existing) return existing;

  const migrated = migrateLegacyPricingConfigIfAny();
  if (migrated) {
    writeTenantJson(NAMESPACE, migrated);
    return migrated;
  }

  return null;
}

/**
 * Save pricing config to tenant-scoped V3 storage.
 */
export function savePricingConfigV3(config) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('Missing tenantId');
  writeTenantJson(NAMESPACE, config);
  return config;
}
