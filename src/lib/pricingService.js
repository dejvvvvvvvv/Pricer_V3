// Pricing service for calculating print costs
// NOTE: This file intentionally contains NO legacy engine references.

/**
 * Default material prices (Kč/g) used as fallback when no Admin pricing is present.
 * AdminPricing stores materialPrices as an object: { [materialKey]: pricePerGram }
 */
export const DEFAULT_MATERIAL_PRICES = {
  pla: 0.5,
  abs: 0.6,
  petg: 0.7,
  tpu: 1.2,
  wood: 0.8,
  carbon: 1.5,
};

// Default time rate (Kč/hour)
export const DEFAULT_RATE_PER_HOUR = 100;

// Simple “fees” used by the demo Model Upload page.
// In the full product, these belong to Admin > Fees.
export const POST_PROCESSING_PRICES = {
  sanding: 50,
  painting: 120,
  assembly: 200,
  drilling: 80,
};

function clampMin0(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v < 0 ? 0 : v;
}

function roundToStep(value, step, mode) {
  const s = step > 0 ? step : 1;
  if (mode === 'up') return Math.ceil(value / s) * s;
  // nearest
  return Math.round(value / s) * s;
}

/**
 * Attempts to read Admin pricing config saved by AdminPricing page (local demo).
 * Safe in browser only; returns null otherwise.
 */
function readAdminPricingFromLocalStorage() {
  try {
    if (typeof window === 'undefined') return null;

    // Keep in sync with AdminPricing.jsx defaults
    const customerId = 'test-customer-1';
    const key = `admin_pricing_demo_v2:${customerId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Normalize shape
    return {
      materialPrices: parsed?.materialPrices || null,
      tenant_pricing: parsed?.tenant_pricing || null,
    };
  } catch {
    return null;
  }
}

/**
 * @typedef {Object} PricingConfig
 * @property {string} material
 * @property {number} materialGrams
 * @property {number} printTimeSeconds
 * @property {number} quantity
 * @property {boolean} expressDelivery
 * @property {string[]} postProcessing
 */

/**
 * @typedef {Object} PricingResult
 * @property {number} total
 * @property {Object[]} breakdown
 * @property {boolean} [min_price_per_model_applied]
 * @property {boolean} [min_order_total_applied]
 */

/**
 * Calculates price using the requested order:
 * base -> fees -> markup -> minima -> rounding
 *
 * @param {PricingConfig} config
 * @param {Object} [overrides] Optional: { materialPrices, tenant_pricing }
 * @returns {PricingResult}
 */
export function calculatePrice(config, overrides = undefined) {
  const qty = Math.max(1, Math.floor(clampMin0(config.quantity) || 1));
  const materialKey = (config.material || 'pla').toLowerCase();

  const local = overrides || readAdminPricingFromLocalStorage() || {};
  const materialPrices = local.materialPrices || DEFAULT_MATERIAL_PRICES;

  const rules = local.tenant_pricing || {};

  const ratePerHour = clampMin0(rules.rate_per_hour ?? DEFAULT_RATE_PER_HOUR);

  // ----- BASE (per model)
  const pricePerGram = clampMin0(materialPrices[materialKey] ?? materialPrices.pla ?? DEFAULT_MATERIAL_PRICES.pla);
  const grams = clampMin0(config.materialGrams);
  const baseMaterial = grams * pricePerGram;

  const timeSeconds = clampMin0(config.printTimeSeconds);
  const timeMinutes = timeSeconds / 60;
  const billedMinutes = rules.min_billed_minutes_enabled
    ? Math.max(timeMinutes, clampMin0(rules.min_billed_minutes_value))
    : timeMinutes;
  const billedHours = billedMinutes / 60;
  const baseTime = billedHours * ratePerHour;

  // ----- FEES (per model) – demo only
  const postProcessingFee = (config.postProcessing || []).reduce((sum, id) => sum + clampMin0(POST_PROCESSING_PRICES[id] || 0), 0);

  // Express: keep previous behaviour (adds +50% of subtotal)
  const subtotalBeforeExpress = baseMaterial + baseTime + postProcessingFee;
  const expressFee = config.expressDelivery ? subtotalBeforeExpress * 0.5 : 0;

  const fees = postProcessingFee + expressFee;

  // ----- MARKUP (per model)
  let markup = 0;
  if (rules.markup_enabled) {
    const mode = rules.markup_mode || 'flat';
    const v = clampMin0(rules.markup_value);
    const basePlusFees = baseMaterial + baseTime + fees;

    if (mode === 'percent') {
      markup = basePlusFees * (v / 100);
    } else if (mode === 'min_flat') {
      // ensure at least v Kč markup
      markup = Math.max(v, 0);
    } else {
      // flat
      markup = v;
    }
  }

  let perModel = baseMaterial + baseTime + fees + markup;

  // ----- MINIMA
  let minPriceApplied = false;
  if (rules.min_price_per_model_enabled) {
    const minModel = clampMin0(rules.min_price_per_model_value);
    if (perModel < minModel) {
      perModel = minModel;
      minPriceApplied = true;
    }
  }

  let total = perModel * qty;

  let minOrderApplied = false;
  if (rules.min_order_total_enabled) {
    const minOrder = clampMin0(rules.min_order_total_value);
    if (total < minOrder) {
      total = minOrder;
      minOrderApplied = true;
    }
  }

  // ----- ROUNDING
  if (rules.rounding_enabled) {
    const step = clampMin0(rules.rounding_step) || 1;
    const mode = rules.rounding_mode === 'up' ? 'up' : 'nearest';

    if (rules.smart_rounding_enabled !== false) {
      total = roundToStep(total, step, mode);
    } else {
      perModel = roundToStep(perModel, step, mode);
      total = perModel * qty;

      if (rules.min_order_total_enabled) {
        const minOrder = clampMin0(rules.min_order_total_value);
        if (total < minOrder) total = minOrder;
      }
    }
  }

  const breakdown = [
    { label: 'Materiál', amount: baseMaterial * qty },
    { label: 'Čas tisku', amount: baseTime * qty },
  ];

  if (postProcessingFee > 0) breakdown.push({ label: 'Dodatečné služby', amount: postProcessingFee * qty });
  if (expressFee > 0) breakdown.push({ label: 'Expres', amount: expressFee * qty });
  if (markup > 0) breakdown.push({ label: 'Přirážka', amount: markup * qty });

  if (minPriceApplied) breakdown.push({ label: 'Minimum za model', amount: 0 });
  if (minOrderApplied) breakdown.push({ label: 'Minimum objednávky', amount: 0 });

  if (rules.rounding_enabled) breakdown.push({ label: 'Zaokrouhlení', amount: 0 });

  return {
    total,
    breakdown,
    min_price_per_model_applied: minPriceApplied,
    min_order_total_applied: minOrderApplied,
  };
}

export function formatPrice(amount) {
  return `${Math.round(clampMin0(amount))} Kč`;
}

export function formatTime(seconds) {
  const s = Math.floor(clampMin0(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}
