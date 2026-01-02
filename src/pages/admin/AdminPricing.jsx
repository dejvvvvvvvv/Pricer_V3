// Admin Pricing Configuration Page - Dynamic Materials + Advanced Pricing Rules (Demo-first)
// This file is meant to be a drop-in replacement for the original:
//   src/pages/admin/AdminPricing.jsx
//
// Notes (current phase):
// - Works even without backend: loads/saves full config to localStorage.
// - If backend API is reachable, it also saves basic fields (materials + timeRate) to API for compatibility.
// - Advanced rules are demo/localStorage-only until backend (part 2) is updated.

import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/AppIcon';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../contexts/LanguageContext';

const STORAGE_KEY_PREFIX = 'modelpricer_pricing_config__';

const DEFAULT_RULES = {
  // time
  rate_per_hour: 150,

  // minimum billed time
  min_billed_minutes_enabled: false,
  min_billed_minutes_value: 30,

  // minimum prices
  min_price_per_model_enabled: false,
  min_price_per_model_value: 99,

  min_order_total_enabled: false,
  min_order_total_value: 199,

  // rounding
  rounding_enabled: false,
  rounding_step: 5, // 1/5/10/50
  rounding_mode: 'nearest', // 'nearest' | 'up'
  smart_rounding_enabled: true, // true => round only final total; false => round per-model too

  // markup
  markup_enabled: false,
  markup_mode: 'flat', // 'flat' | 'percent' | 'min_flat'
  markup_value: 20,
};

const DEFAULT_PREVIEW = {
  material_price_per_g: 0.6,
  weight_g: 100,
  time_min: 60,
  quantity: 1,
  fees_total: 0, // simulated "Fees" total per model (Kč) for preview
};

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampMin0(n) {
  const x = safeNum(n, 0);
  return x < 0 ? 0 : x;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildMaterialPrices(materials) {
  const materialPrices = {};
  materials.forEach((mat) => {
    if (mat?.name && mat?.enabled) {
      const key = mat.name.toLowerCase().replace(/\s+/g, '_');
      materialPrices[key] = clampMin0(mat.price);
    }
  });
  return materialPrices;
}

function materialPricesToArray(materialPrices) {
  const arr = [];
  if (materialPrices && typeof materialPrices === 'object') {
    Object.entries(materialPrices).forEach(([key, price]) => {
      arr.push({
        id: key,
        name: key.replace(/_/g, ' ').toUpperCase(),
        price: clampMin0(price),
        enabled: true,
      });
    });
  }
  return arr;
}

function formatCzk(n) {
  const x = safeNum(n, 0);
  // keep simple formatting for UI consistency
  return `${x.toFixed(2)} Kč`;
}

function roundToStep(value, step, mode) {
  const v = safeNum(value, 0);
  const s = Math.max(1, safeNum(step, 1));
  if (mode === 'up') return Math.ceil(v / s) * s;
  return Math.round(v / s) * s;
}

function calcPricingPreview(rules, preview) {
  const r = { ...DEFAULT_RULES, ...rules };
  const p = { ...DEFAULT_PREVIEW, ...preview };

  const material = clampMin0(p.weight_g) * clampMin0(p.material_price_per_g);

  const billedMinutes = r.min_billed_minutes_enabled
    ? Math.max(clampMin0(p.time_min), clampMin0(r.min_billed_minutes_value))
    : clampMin0(p.time_min);

  const time = (billedMinutes / 60) * clampMin0(r.rate_per_hour);

  const fees = clampMin0(p.fees_total);

  // base -> fees
  let perModel = material + time + fees;

  // -> markup
  let markup = 0;
  if (r.markup_enabled) {
    if (r.markup_mode === 'flat') {
      markup = clampMin0(r.markup_value);
      perModel += markup;
    } else if (r.markup_mode === 'percent') {
      markup = (perModel * clampMin0(r.markup_value)) / 100;
      perModel += markup;
    } else if (r.markup_mode === 'min_flat') {
      // "Minimum price after base+fees+time": if perModel is below markup_value, bump it to that value
      const minTarget = clampMin0(r.markup_value);
      if (perModel < minTarget) {
        markup = minTarget - perModel;
        perModel = minTarget;
      }
    }
  }

  // -> minima
  let minPerModelApplied = false;
  if (r.min_price_per_model_enabled) {
    const minModel = clampMin0(r.min_price_per_model_value);
    if (perModel < minModel) {
      perModel = minModel;
      minPerModelApplied = true;
    }
  }

  const qty = Math.max(1, Math.floor(clampMin0(p.quantity)));

  // smart_rounding: if disabled, round per-model BEFORE multiplying by qty
  let perModelRounded = perModel;
  let roundingAppliedPerModel = false;
  if (r.rounding_enabled && !r.smart_rounding_enabled) {
    const rounded = roundToStep(perModel, r.rounding_step, r.rounding_mode);
    roundingAppliedPerModel = rounded !== perModel;
    perModelRounded = rounded;
  }

  let total = perModelRounded * qty;

  // min order (after sum)
  let minOrderApplied = false;
  if (r.min_order_total_enabled) {
    const minOrder = clampMin0(r.min_order_total_value);
    if (total < minOrder) {
      total = minOrder;
      minOrderApplied = true;
    }
  }

  // rounding (final) - always applied at the end if rounding enabled
  let totalRounded = total;
  let roundingAppliedFinal = false;
  if (r.rounding_enabled) {
    const rounded = roundToStep(total, r.rounding_step, r.rounding_mode);
    roundingAppliedFinal = rounded !== total;
    totalRounded = rounded;
  }

  return {
    material,
    time,
    billedMinutes,
    fees,
    basePlusFees: material + time + fees,
    markup,
    perModel,
    perModelRounded,
    qty,
    totalBeforeFinalRounding: total,
    total: totalRounded,
    flags: {
      min_price_per_model_applied: minPerModelApplied,
      min_order_total_applied: minOrderApplied,
      rounding_per_model_applied: roundingAppliedPerModel,
      rounding_final_applied: roundingAppliedFinal,
    },
  };
}

const AdminPricing = () => {
  const { t, language } = useLanguage();

  const customerId = 'test-customer-1'; // TODO: Get from auth/context
  const storageKey = `${STORAGE_KEY_PREFIX}${customerId}`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Materials (existing feature)
  const [materials, setMaterials] = useState([]);
  // Advanced rules + time rate
  const [rules, setRules] = useState(deepClone(DEFAULT_RULES));
  // Preview panel state
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [preview, setPreview] = useState(deepClone(DEFAULT_PREVIEW));

  // UI state
  const [banner, setBanner] = useState(null); // { type: 'info'|'error'|'success', text: string }
  const [savedSnapshot, setSavedSnapshot] = useState(''); // JSON snapshot
  const [touched, setTouched] = useState(false);

  const ui = useMemo(() => {
    const cs = language === 'cs';
    return {
      title: cs ? 'Pricing' : 'Pricing',
      subtitle: cs
        ? 'Nastav cenu času, minima, zaokrouhlování a přirážku. (Demo: pokročilé věci se ukládají lokálně do prohlížeče.)'
        : 'Configure time rate, minimums, rounding and markup. (Demo: advanced settings are saved locally in your browser.)',
      save: cs ? 'Uložit změny' : 'Save changes',
      saved: cs ? 'Uloženo' : 'Saved',
      unsaved: cs ? 'Neuložené změny' : 'Unsaved changes',
      reset: cs ? 'Reset na default' : 'Reset to defaults',
      export: cs ? 'Exportovat JSON' : 'Export JSON',
      import: cs ? 'Importovat JSON' : 'Import JSON',
      copyOk: cs ? 'Zkopírováno do schránky.' : 'Copied to clipboard.',
      copyFail: cs ? 'Nepodařilo se zkopírovat – zkopíruj ručně z dialogu.' : 'Copy failed – copy manually from the dialog.',
      offlineInfo: cs
        ? 'Backend není dostupný – běžíš v offline demo režimu (localStorage).'
        : 'Backend not reachable – running in offline demo mode (localStorage).',
      apiOk: cs ? 'Uloženo (API + localStorage).' : 'Saved (API + localStorage).',
      localOk: cs ? 'Uloženo (localStorage).' : 'Saved (localStorage).',
      invalid: cs ? 'Oprav chyby ve formuláři (hodnoty musí být ≥ 0).' : 'Fix validation errors (values must be ≥ 0).',
      preview: cs ? 'Testovací kalkulace' : 'Pricing sandbox',
      previewToggle: cs ? 'Testovat na příkladu' : 'Test with example',
    };
  }, [language]);

  const setRule = (key, value) => {
    setRules((prev) => ({ ...prev, [key]: value }));
    setTouched(true);
  };

  const setPreviewField = (key, value) => {
    setPreview((prev) => ({ ...prev, [key]: value }));
  };

  const addMaterial = () => {
    setMaterials((prev) => [
      ...prev,
      {
        id: `mat-${Date.now()}`,
        name: '',
        price: 0,
        enabled: true,
      },
    ]);
    setTouched(true);
  };

  const updateMaterial = (index, field, value) => {
    setMaterials((prev) =>
      prev.map((mat, i) => (i === index ? { ...mat, [field]: value } : mat))
    );
    setTouched(true);
  };

  const deleteMaterial = (index) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
    setTouched(true);
  };

  const currentConfigFull = useMemo(() => {
    const materialPrices = buildMaterialPrices(materials);
    // keep compatibility naming for later backend part:
    return {
      materialPrices,
      timeRate: clampMin0(rules.rate_per_hour),
      tenant_pricing: { ...rules },
      // optional helper for future:
      updated_at: new Date().toISOString(),
    };
  }, [materials, rules]);

  const dirty = useMemo(() => {
    if (!savedSnapshot) return touched;
    try {
      const snap = JSON.parse(savedSnapshot);
      const now = currentConfigFull;
      // Compare relevant fields only (ignore updated_at)
      const a = JSON.stringify({ ...snap, updated_at: undefined });
      const b = JSON.stringify({ ...now, updated_at: undefined });
      return a !== b;
    } catch {
      return touched;
    }
  }, [savedSnapshot, currentConfigFull, touched]);

  const validationErrors = useMemo(() => {
    const errs = [];

    const mustBeMin0 = [
      ['rate_per_hour', rules.rate_per_hour],
      ['min_billed_minutes_value', rules.min_billed_minutes_value],
      ['min_price_per_model_value', rules.min_price_per_model_value],
      ['min_order_total_value', rules.min_order_total_value],
      ['markup_value', rules.markup_value],
    ];
    mustBeMin0.forEach(([k, v]) => {
      if (safeNum(v, 0) < 0) errs.push(k);
    });

    if (![1, 5, 10, 50].includes(safeNum(rules.rounding_step, 5))) errs.push('rounding_step');
    if (!['nearest', 'up'].includes(rules.rounding_mode)) errs.push('rounding_mode');
    if (!['flat', 'percent', 'min_flat'].includes(rules.markup_mode)) errs.push('markup_mode');

    return errs;
  }, [rules]);

  const isValid = validationErrors.length === 0;

  const previewResult = useMemo(() => {
    return calcPricingPreview(rules, preview);
  }, [rules, preview]);

  const tryLoadFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return null;
    }
  };

  const saveToLocalStorage = (configFull) => {
    localStorage.setItem(storageKey, JSON.stringify(configFull));
  };

  const handleResetDefaults = () => {
    // Keep materials as-is (often already configured), reset advanced rules + preview.
    setRules(deepClone(DEFAULT_RULES));
    setPreview(deepClone(DEFAULT_PREVIEW));
    setTouched(true);
    setBanner({
      type: 'info',
      text: language === 'cs' ? 'Nastavení bylo resetováno na default.' : 'Settings reset to defaults.',
    });
  };

  const handleExport = async () => {
    try {
      const json = JSON.stringify(currentConfigFull, null, 2);
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setBanner({ type: 'success', text: ui.copyOk });
      } else {
        // fallback
        window.prompt('Zkopíruj JSON:', json);
        setBanner({ type: 'info', text: ui.copyFail });
      }
    } catch (e) {
      const json = JSON.stringify(currentConfigFull, null, 2);
      window.prompt('Zkopíruj JSON:', json);
      setBanner({ type: 'error', text: ui.copyFail });
    }
  };

  const handleImport = () => {
    const cs = language === 'cs';
    const raw = window.prompt(cs ? 'Vlož JSON konfigurace:' : 'Paste JSON configuration:');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);

      // accept both new and older shapes
      const materialPrices = parsed.materialPrices || parsed?.config?.materialPrices || {};
      const timeRate = parsed.timeRate ?? parsed?.config?.timeRate ?? parsed?.tenant_pricing?.rate_per_hour ?? 150;
      const tenantPricing = parsed.tenant_pricing || {};

      setMaterials(materialPricesToArray(materialPrices));
      setRules({
        ...deepClone(DEFAULT_RULES),
        ...tenantPricing,
        rate_per_hour: clampMin0(tenantPricing.rate_per_hour ?? timeRate),
      });
      setTouched(true);
      setBanner({ type: 'success', text: cs ? 'Import dokončen.' : 'Import complete.' });
    } catch (e) {
      setBanner({ type: 'error', text: cs ? 'Neplatný JSON.' : 'Invalid JSON.' });
    }
  };

  const handleSave = async () => {
    if (!isValid) {
      setBanner({ type: 'error', text: ui.invalid });
      return;
    }

    try {
      setSaving(true);
      setBanner(null);

      // Always save full config locally (demo-first)
      saveToLocalStorage(currentConfigFull);

      // Best-effort API save for existing backend compatibility (materials + timeRate only)
      let apiOk = false;
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/pricing/${customerId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            materialPrices: currentConfigFull.materialPrices,
            timeRate: currentConfigFull.timeRate,
            tenant_pricing: currentConfigFull.tenant_pricing,
            updated_by: "admin-demo"
          }),
        });
        apiOk = response.ok;
      } catch {
        apiOk = false;
      }

      const newSnap = JSON.stringify({ ...currentConfigFull, updated_at: undefined });
      setSavedSnapshot(newSnap);
      setTouched(false);

      setBanner({
        type: 'success',
        text: apiOk ? ui.apiOk : ui.localOk,
      });
    } finally {
      setSaving(false);
    }
  };

  // Load initial configuration
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setBanner(null);

      // 1) Prefer localStorage (demo)
      const local = tryLoadFromLocalStorage();
      if (local?.materialPrices || local?.tenant_pricing) {
        if (!isMounted) return;

        const materialPrices = local.materialPrices || {};
        const tenantPricing = local.tenant_pricing || {};
        const timeRate = local.timeRate ?? tenantPricing.rate_per_hour ?? 150;

        setMaterials(materialPricesToArray(materialPrices));
        setRules({
          ...deepClone(DEFAULT_RULES),
          ...tenantPricing,
          rate_per_hour: clampMin0(tenantPricing.rate_per_hour ?? timeRate),
        });

        const snap = JSON.stringify({ ...local, updated_at: undefined });
        setSavedSnapshot(snap);
        setTouched(false);
        setLoading(false);
        return;
      }

      // 2) Fallback to API (older config)
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/pricing/${customerId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const config = await response.json();

        if (!isMounted) return;

        const { materialPrices, timeRate, tenant_pricing } = config;
        setMaterials(materialPricesToArray(materialPrices || {}));
        setRules({
          ...deepClone(DEFAULT_RULES),
          ...(tenant_pricing || {}),
          rate_per_hour: clampMin0((tenant_pricing?.rate_per_hour ?? timeRate) ?? DEFAULT_RULES.rate_per_hour),
        });

        const full = {
          materialPrices: materialPrices || {},
          timeRate: clampMin0(timeRate ?? DEFAULT_RULES.rate_per_hour),
          tenant_pricing: {
          ...deepClone(DEFAULT_RULES),
          ...(tenant_pricing || {}),
          rate_per_hour: clampMin0((tenant_pricing?.rate_per_hour ?? timeRate) ?? DEFAULT_RULES.rate_per_hour),
        },
          updated_at: new Date().toISOString(),
        };

        // Store merged default to local for demo
        saveToLocalStorage(full);
        setSavedSnapshot(JSON.stringify({ ...full, updated_at: undefined }));
        setTouched(false);
        setLoading(false);
      } catch (error) {
        if (!isMounted) return;
        // Offline demo mode
        setMaterials([]);
        setRules(deepClone(DEFAULT_RULES));
        setPreview(deepClone(DEFAULT_PREVIEW));
        setBanner({ type: 'info', text: ui.offlineInfo });
        // IMPORTANT:
        // When API is unreachable we run in offline demo mode.
        // Do NOT reference `tenant_pricing` / `timeRate` from the API branch here,
        // because they are undefined in this scope and would crash the page.
        const full = {
          materialPrices: {},
          timeRate: DEFAULT_RULES.rate_per_hour,
          tenant_pricing: deepClone(DEFAULT_RULES),
          updated_at: new Date().toISOString(),
        };
        saveToLocalStorage(full);
        setSavedSnapshot(JSON.stringify({ ...full, updated_at: undefined }));
        setTouched(false);
        setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Helper: material dropdown for preview
  const enabledMaterials = useMemo(() => {
    return materials.filter((m) => m?.enabled && m?.name?.trim());
  }, [materials]);

  const setPreviewFromMaterial = (materialIndex) => {
    const mat = enabledMaterials[materialIndex];
    if (!mat) return;
    setPreviewField('material_price_per_g', clampMin0(mat.price));
  };

  const ToggleRow = ({ checked, onChange, label, hint }) => {
    return (
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-label">{label}</span>
        {hint ? (
          <span className="hint" title={hint}>
            <Icon name="Info" size={16} />
          </span>
        ) : null}
      </label>
    );
  };

  const FieldError = ({ show }) => {
    if (!show) return null;
    return <div className="field-error">{language === 'cs' ? 'Zadej hodnotu ≥ 0' : 'Enter value ≥ 0'}</div>;
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">{language === 'cs' ? 'Načítám...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>{ui.title}</h1>
          <p className="subtitle">{ui.subtitle}</p>
        </div>

        <div className="header-actions">
          <div className={`status-pill ${dirty ? 'dirty' : 'clean'}`}>
            <Icon name={dirty ? 'AlertCircle' : 'CheckCircle2'} size={16} />
            <span>{dirty ? ui.unsaved : ui.saved}</span>
          </div>

          <button className="btn-secondary" onClick={handleResetDefaults} disabled={saving}>
            <Icon name="RotateCcw" size={18} />
            {ui.reset}
          </button>

          <button className="btn-secondary" onClick={handleExport} disabled={saving}>
            <Icon name="Copy" size={18} />
            {ui.export}
          </button>

          <button className="btn-secondary" onClick={handleImport} disabled={saving}>
            <Icon name="Upload" size={18} />
            {ui.import}
          </button>

          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!dirty || saving || !isValid}
            title={!isValid ? ui.invalid : ''}
          >
            <Icon name="Save" size={18} />
            {saving ? t('common.saving') : ui.save}
          </button>
        </div>
      </div>

      {banner ? (
        <div className={`banner ${banner.type}`}>
          <Icon
            name={banner.type === 'error' ? 'XCircle' : banner.type === 'success' ? 'CheckCircle2' : 'Info'}
            size={18}
          />
          <span>{banner.text}</span>
        </div>
      ) : null}

      <div className="pricing-layout">
        {/* LEFT: Cards */}
        <div className="cards">
          {/* Card: Materials (existing) */}
          <div className="admin-card">
            <div className="card-header">
              <div>
                <h2>{t('admin.pricing.materials')}</h2>
                <p className="card-description">
                  {language === 'cs'
                    ? 'Nastav materiály a cenu za gram (Kč/g).'
                    : 'Configure materials and their price per gram.'}
                </p>
              </div>
              <button className="btn-secondary" onClick={addMaterial}>
                <Icon name="Plus" size={18} />
                {t('admin.pricing.addMaterial')}
              </button>
            </div>

            {materials.length === 0 ? (
              <div className="empty-state">
                <Icon name="Package" size={48} />
                <h3>{language === 'cs' ? 'Žádné materiály nenakonfigurovány' : 'No materials configured'}</h3>
                <p>
                  {language === 'cs'
                    ? 'Klikni na "Přidat materiál" a vytvoř první materiál.'
                    : 'Click "Add Material" to create your first material.'}
                </p>
              </div>
            ) : (
              <div className="materials-grid">
                {materials.map((material, index) => (
                  <div key={material.id} className="material-card">
                    <div className="material-header">
                      <input
                        className="material-name"
                        placeholder={language === 'cs' ? 'Název materiálu (např. PLA, ABS)' : 'Material name (e.g. PLA, ABS)'}
                        value={material.name}
                        onChange={(e) => updateMaterial(index, 'name', e.target.value)}
                      />
                      <button className="icon-btn" onClick={() => deleteMaterial(index)} title={language === 'cs' ? 'Smazat materiál' : 'Delete material'}>
                        <Icon name="Trash2" size={16} />
                      </button>
                    </div>

                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={material.enabled}
                        onChange={(e) => updateMaterial(index, 'enabled', e.target.checked)}
                      />
                      <span>{language === 'cs' ? 'Aktivní' : 'Active'}</span>
                    </label>

                    <div className="field">
                      <label>{language === 'cs' ? 'Cena za gram' : 'Price per gram'}</label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          min="0"
                          className={`input ${material.price < 0 ? 'input-error' : ''}`}
                          value={material.price}
                          onChange={(e) => updateMaterial(index, 'price', safeNum(e.target.value, 0))}
                        />
                        <span className="unit">Kč/g</span>
                      </div>
                      <FieldError show={material.price < 0} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 1: Time rate + min billed minutes */}
          <div className="admin-card">
            <div className="card-header">
              <div>
                <h2>{language === 'cs' ? 'Cena času tisku' : 'Print time rate'}</h2>
                <p className="card-description">
                  {language === 'cs' ? 'Používá se čas z PrusaSliceru.' : 'Uses time reported by PrusaSlicer.'}
                </p>
              </div>
            </div>

            <div className="field">
              <label>{language === 'cs' ? 'Cena za hodinu tisku' : 'Hourly rate'}</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  className={`input ${rules.rate_per_hour < 0 ? 'input-error' : ''}`}
                  value={rules.rate_per_hour}
                  onChange={(e) => setRule('rate_per_hour', safeNum(e.target.value, 0))}
                />
                <span className="unit">Kč/h</span>
              </div>
              <FieldError show={rules.rate_per_hour < 0} />
              <p className="help-text">{language === 'cs' ? 'Tato sazba se aplikuje na čas tisku (minuty → hodiny).' : 'Applied to print time (minutes → hours).'}</p>
            </div>

            <div className="divider" />

            <ToggleRow
              checked={rules.min_billed_minutes_enabled}
              onChange={(v) => setRule('min_billed_minutes_enabled', v)}
              label={language === 'cs' ? 'Minimální účtovaný čas' : 'Minimum billed time'}
              hint={language === 'cs'
                ? 'Použije se jen pro výpočet ceny času, materiál zůstává reálný.'
                : 'Applied only to time cost calculation; material stays real.'}
            />

            {rules.min_billed_minutes_enabled ? (
              <div className="field nested">
                <label>{language === 'cs' ? 'Minimálně účtovat (min)' : 'Minimum billed (min)'}</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    min="0"
                    className={`input ${rules.min_billed_minutes_value < 0 ? 'input-error' : ''}`}
                    value={rules.min_billed_minutes_value}
                    onChange={(e) => setRule('min_billed_minutes_value', safeNum(e.target.value, 0))}
                  />
                  <span className="unit">min</span>
                </div>
                <FieldError show={rules.min_billed_minutes_value < 0} />
              </div>
            ) : null}
          </div>

          {/* Card 2: Minimum prices */}
          <div className="admin-card">
            <div className="card-header">
              <div>
                <h2>{language === 'cs' ? 'Minimální ceny' : 'Minimum prices'}</h2>
                <p className="card-description">
                  {language === 'cs'
                    ? 'Nastav minima, aby se vyplatily malé zakázky.'
                    : 'Set minimums to keep small jobs profitable.'}
                </p>
              </div>

              {/* Mini preview box */}
              <div className="mini-preview">
                <div className="mini-preview-title">{language === 'cs' ? 'Ukázka' : 'Example'}</div>
                <div className="mini-preview-row">
                  <span>{language === 'cs' ? 'Vypočteno' : 'Calculated'}</span>
                  <strong>52 Kč</strong>
                </div>
                <div className="mini-preview-row">
                  <span>{language === 'cs' ? 'Účtováno' : 'Charged'}</span>
                  <strong>99 Kč</strong>
                </div>
              </div>
            </div>

            <ToggleRow
              checked={rules.min_price_per_model_enabled}
              onChange={(v) => setRule('min_price_per_model_enabled', v)}
              label={language === 'cs' ? 'Minimální cena za model' : 'Minimum price per model'}
              hint={language === 'cs'
                ? 'Pokud je vypočtená cena modelu nižší, zvedne se na minimum.'
                : 'If calculated model price is lower, it is bumped to this minimum.'}
            />

            {rules.min_price_per_model_enabled ? (
              <div className="field nested">
                <label>{language === 'cs' ? 'Minimálně účtovat za 1 model (Kč)' : 'Minimum per model (CZK)'}</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    min="0"
                    className={`input ${rules.min_price_per_model_value < 0 ? 'input-error' : ''}`}
                    value={rules.min_price_per_model_value}
                    onChange={(e) => setRule('min_price_per_model_value', safeNum(e.target.value, 0))}
                  />
                  <span className="unit">Kč</span>
                </div>
                <FieldError show={rules.min_price_per_model_value < 0} />
              </div>
            ) : null}

            <div className="divider" />

            <ToggleRow
              checked={rules.min_order_total_enabled}
              onChange={(v) => setRule('min_order_total_enabled', v)}
              label={language === 'cs' ? 'Minimální cena objednávky' : 'Minimum order total'}
              hint={language === 'cs'
                ? 'Aplikuje se po sečtení všech modelů a jednorázových poplatků.'
                : 'Applied after summing all models and one-time fees.'}
            />

            {rules.min_order_total_enabled ? (
              <div className="field nested">
                <label>{language === 'cs' ? 'Minimálně účtovat za objednávku (Kč)' : 'Minimum order total (CZK)'}</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    min="0"
                    className={`input ${rules.min_order_total_value < 0 ? 'input-error' : ''}`}
                    value={rules.min_order_total_value}
                    onChange={(e) => setRule('min_order_total_value', safeNum(e.target.value, 0))}
                  />
                  <span className="unit">Kč</span>
                </div>
                <FieldError show={rules.min_order_total_value < 0} />
              </div>
            ) : null}
          </div>

          {/* Card 3: Rounding */}
          <div className="admin-card">
            <div className="card-header">
              <div>
                <h2>{language === 'cs' ? 'Zaokrouhlování' : 'Rounding'}</h2>
                <p className="card-description">
                  {language === 'cs'
                    ? 'Aby výsledná cena byla „hezčí“ (např. 483,27 → 485).'
                    : 'Make the final price look nicer (e.g., 483.27 → 485).'}
                </p>
              </div>

              <div className="mini-preview">
                <div className="mini-preview-title">{language === 'cs' ? 'Ukázka' : 'Example'}</div>
                <div className="mini-preview-row">
                  <span>483</span>
                  <span className="arrow">→</span>
                  <strong>485</strong>
                </div>
                <div className="mini-preview-note">
                  {language === 'cs' ? 'krok 5, nejbližší' : 'step 5, nearest'}
                </div>
              </div>
            </div>

            <ToggleRow
              checked={rules.rounding_enabled}
              onChange={(v) => setRule('rounding_enabled', v)}
              label={language === 'cs' ? 'Zaokrouhlovat cenu' : 'Enable rounding'}
              hint={language === 'cs'
                ? 'Zaokrouhlení se aplikuje až po minimách (a podle volby i na model).'
                : 'Rounding is applied after minimums (and optionally per model).'}
            />

            {rules.rounding_enabled ? (
              <div className="grid-2 nested">
                <div className="field">
                  <label>{language === 'cs' ? 'Zaokrouhlit na' : 'Round to'}</label>
                  <select
                    className="select"
                    value={rules.rounding_step}
                    onChange={(e) => setRule('rounding_step', safeNum(e.target.value, 5))}
                  >
                    {[1, 5, 10, 50].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>{language === 'cs' ? 'Směr' : 'Mode'}</label>
                  <select
                    className="select"
                    value={rules.rounding_mode}
                    onChange={(e) => setRule('rounding_mode', e.target.value)}
                  >
                    <option value="nearest">{language === 'cs' ? 'Nejbližší' : 'Nearest'}</option>
                    <option value="up">{language === 'cs' ? 'Vždy nahoru' : 'Always up'}</option>
                  </select>
                </div>

                <div className="field full">
                  <ToggleRow
                    checked={rules.smart_rounding_enabled}
                    onChange={(v) => setRule('smart_rounding_enabled', v)}
                    label={language === 'cs' ? 'Zaokrouhlovat jen finální částku' : 'Round only the final total'}
                    hint={language === 'cs'
                      ? 'Zapnuto = round až na konci. Vypnuto = round i na úrovni modelu.'
                      : 'On = round at the end only. Off = also round per model.'}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Card 4: Markup */}
          <div className="admin-card">
            <div className="card-header">
              <div>
                <h2>{language === 'cs' ? 'Automatická přirážka (markup)' : 'Automatic markup'}</h2>
                <p className="card-description">
                  {language === 'cs'
                    ? 'Pricing-level přirážka (není to Fee). Aplikuje se: base → fees → markup → minima → rounding.'
                    : 'Pricing-level markup (not a Fee). Applied: base → fees → markup → minima → rounding.'}
                </p>
              </div>

              <div className="mini-preview">
                <div className="mini-preview-title">{language === 'cs' ? 'Ukázka' : 'Example'}</div>
                <div className="mini-preview-row">
                  <span>120</span>
                  <span className="arrow">+</span>
                  <span>20</span>
                  <span className="arrow">=</span>
                  <strong>140</strong>
                </div>
              </div>
            </div>

            <ToggleRow
              checked={rules.markup_enabled}
              onChange={(v) => setRule('markup_enabled', v)}
              label={language === 'cs' ? 'Automatická přirážka' : 'Enable markup'}
              hint={language === 'cs'
                ? 'Přirážka se aplikuje po přičtení poplatků (fees) a před minimy/zaokrouhlováním.'
                : 'Markup is applied after fees and before minimums/rounding.'}
            />

            {rules.markup_enabled ? (
              <div className="grid-2 nested">
                <div className="field">
                  <label>{language === 'cs' ? 'Režim' : 'Mode'}</label>
                  <div className="radio-group">
                    <label className="radio">
                      <input
                        type="radio"
                        name="markup_mode"
                        checked={rules.markup_mode === 'flat'}
                        onChange={() => setRule('markup_mode', 'flat')}
                      />
                      <span>{language === 'cs' ? 'Fixní (Kč)' : 'Flat (CZK)'}</span>
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="markup_mode"
                        checked={rules.markup_mode === 'percent'}
                        onChange={() => setRule('markup_mode', 'percent')}
                      />
                      <span>{language === 'cs' ? 'Procentní (%)' : 'Percent (%)'}</span>
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="markup_mode"
                        checked={rules.markup_mode === 'min_flat'}
                        onChange={() => setRule('markup_mode', 'min_flat')}
                      />
                      <span>{language === 'cs' ? 'Minimální cena (Kč)' : 'Minimum price (CZK)'}</span>
                    </label>
                  </div>
                </div>

                <div className="field">
                  <label>{language === 'cs' ? 'Hodnota' : 'Value'}</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      min="0"
                      className={`input ${rules.markup_value < 0 ? 'input-error' : ''}`}
                      value={rules.markup_value}
                      onChange={(e) => setRule('markup_value', safeNum(e.target.value, 0))}
                    />
                    <span className="unit">{rules.markup_mode === 'percent' ? '%' : 'Kč'}</span>
                  </div>
                  <FieldError show={rules.markup_value < 0} />
                </div>
              </div>
            ) : null}
          </div>

          {/* Optional future stub (UI-only) */}
          <div className="admin-card future">
            <div className="card-header">
              <div>
                <h2>
                  {language === 'cs' ? 'Více pricing profilů (budoucí)' : 'Multiple pricing profiles (future)'}
                </h2>
                <p className="card-description">
                  {language === 'cs'
                    ? 'Architektura je připravená – přidáme v další fázi (🟪).'
                    : 'UI architecture ready – planned for a later phase (🟪).'}
                </p>
              </div>
              <span className="tag">🟪 later</span>
            </div>

            <label className="toggle">
              <input type="checkbox" disabled />
              <span>{language === 'cs' ? 'Používat více pricing profilů' : 'Enable pricing profiles'}</span>
            </label>

            <p className="help-text">
              {language === 'cs'
                ? 'V další fázi půjde vytvořit více sad pravidel (Standard / Engineering / Bulk) a vybírat je ve widgetu.'
                : 'Later you will create multiple rule sets (Standard / Engineering / Bulk) and select them in the widget.'}
            </p>
          </div>
        </div>

        {/* RIGHT: Preview panel */}
        <div className="preview">
          <div className="preview-card">
            <div className="preview-header">
              <h3>{ui.preview}</h3>
              <label className="toggle mini">
                <input
                  type="checkbox"
                  checked={previewEnabled}
                  onChange={(e) => setPreviewEnabled(e.target.checked)}
                />
                <span>{ui.previewToggle}</span>
              </label>
            </div>

            {previewEnabled ? (
              <>
                <div className="field">
                  <label>{language === 'cs' ? 'Materiál (rychlé nastavení ceny Kč/g)' : 'Material (quick price per g)'}</label>
                  <select
                    className="select"
                    onChange={(e) => setPreviewFromMaterial(safeNum(e.target.value, -1))}
                    value={-1}
                  >
                    <option value={-1}>
                      {enabledMaterials.length > 0
                        ? language === 'cs'
                          ? '— vyber materiál —'
                          : '— select material —'
                        : language === 'cs'
                          ? '— žádné materiály —'
                          : '— no materials —'}
                    </option>
                    {enabledMaterials.map((m, idx) => (
                      <option key={m.id} value={idx}>
                        {m.name} ({clampMin0(m.price)} Kč/g)
                      </option>
                    ))}
                  </select>
                  <p className="help-text">
                    {language === 'cs'
                      ? 'Nebo zadej cenu ručně níže.'
                      : 'Or enter the price manually below.'}
                  </p>
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>{language === 'cs' ? 'Cena materiálu (Kč/g)' : 'Material price (CZK/g)'}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        className="input"
                        value={preview.material_price_per_g}
                        onChange={(e) => setPreviewField('material_price_per_g', safeNum(e.target.value, 0))}
                      />
                      <span className="unit">Kč/g</span>
                    </div>
                  </div>

                  <div className="field">
                    <label>{language === 'cs' ? 'Hmotnost (g)' : 'Weight (g)'}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        className="input"
                        value={preview.weight_g}
                        onChange={(e) => setPreviewField('weight_g', safeNum(e.target.value, 0))}
                      />
                      <span className="unit">g</span>
                    </div>
                  </div>

                  <div className="field">
                    <label>{language === 'cs' ? 'Čas (min)' : 'Time (min)'}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        className="input"
                        value={preview.time_min}
                        onChange={(e) => setPreviewField('time_min', safeNum(e.target.value, 0))}
                      />
                      <span className="unit">min</span>
                    </div>
                  </div>

                  <div className="field">
                    <label>{language === 'cs' ? 'Množství (ks)' : 'Quantity'}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="input"
                        value={preview.quantity}
                        onChange={(e) => setPreviewField('quantity', safeNum(e.target.value, 1))}
                      />
                      <span className="unit">ks</span>
                    </div>
                  </div>

                  <div className="field full">
                    <label>{language === 'cs' ? 'Poplatky (Fees) – simulace / model (Kč)' : 'Fees (simulated) / model (CZK)'}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        className="input"
                        value={preview.fees_total}
                        onChange={(e) => setPreviewField('fees_total', safeNum(e.target.value, 0))}
                      />
                      <span className="unit">Kč</span>
                    </div>
                    <p className="help-text">
                      {language === 'cs'
                        ? 'Tento input je jen pro sandbox (např. lakování apod.).'
                        : 'This input is sandbox-only (e.g., post-processing).' }
                    </p>
                  </div>
                </div>

                <div className="breakdown">
                  <div className="breakdown-row">
                    <span>{language === 'cs' ? 'Materiál' : 'Material'}</span>
                    <strong>{formatCzk(previewResult.material)}</strong>
                  </div>
                  <div className="breakdown-row">
                    <span>
                      {language === 'cs' ? 'Čas' : 'Time'}
                      <span className="muted">
                        {' '}
                        ({previewResult.billedMinutes.toFixed(0)} min)
                      </span>
                    </span>
                    <strong>{formatCzk(previewResult.time)}</strong>
                  </div>
                  <div className="breakdown-row">
                    <span>{language === 'cs' ? 'Poplatky (Fees)' : 'Fees'}</span>
                    <strong>{formatCzk(previewResult.fees)}</strong>
                  </div>
                  <div className="breakdown-row">
                    <span>{language === 'cs' ? 'Markup' : 'Markup'}</span>
                    <strong>{formatCzk(previewResult.markup)}</strong>
                  </div>

                  <div className="divider" />

                  <div className="breakdown-row">
                    <span>{language === 'cs' ? 'Cena / model' : 'Per model'}</span>
                    <strong>{formatCzk(previewResult.perModel)}</strong>
                  </div>

                  {rules.rounding_enabled && !rules.smart_rounding_enabled ? (
                    <div className="breakdown-row">
                      <span className="muted">{language === 'cs' ? 'Zaokrouhleno / model' : 'Rounded / model'}</span>
                      <strong>{formatCzk(previewResult.perModelRounded)}</strong>
                    </div>
                  ) : null}

                  <div className="breakdown-row">
                    <span>{language === 'cs' ? 'Množství' : 'Quantity'}</span>
                    <strong>{previewResult.qty}×</strong>
                  </div>

                  <div className="divider" />

                  <div className="breakdown-row total">
                    <span>{language === 'cs' ? 'Celkem' : 'Total'}</span>
                    <strong>{formatCzk(previewResult.total)}</strong>
                  </div>

                  <div className="flags">
                    {previewResult.flags.min_price_per_model_applied ? (
                      <span className="flag warn">
                        {language === 'cs' ? 'min cena / model aplikována' : 'min per model applied'}
                      </span>
                    ) : null}
                    {previewResult.flags.min_order_total_applied ? (
                      <span className="flag warn">
                        {language === 'cs' ? 'min cena objednávky aplikována' : 'min order applied'}
                      </span>
                    ) : null}
                    {previewResult.flags.rounding_final_applied ? (
                      <span className="flag info">
                        {language === 'cs' ? 'zaokrouhlení aplikováno' : 'rounding applied'}
                      </span>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="help-text">{language === 'cs' ? 'Preview je vypnuté.' : 'Preview is disabled.'}</p>
            )}
          </div>

          {!isValid ? (
            <div className="validation-box">
              <Icon name="AlertTriangle" size={18} />
              <span>{ui.invalid}</span>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .admin-page {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 14px;
        }

        h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .subtitle {
          margin: 4px 0 0 0;
          color: #666;
          font-size: 14px;
          max-width: 740px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          border: 1px solid #e6e6e6;
          background: #fafafa;
          color: #555;
        }

        .status-pill.clean {
          border-color: #d7f0df;
          background: #f3fbf6;
          color: #1f6b3a;
        }

        .status-pill.dirty {
          border-color: #ffe0b2;
          background: #fff7e6;
          color: #8a5a00;
        }

        .banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          margin: 10px 0 16px 0;
          font-size: 14px;
          border: 1px solid #eaeaea;
          background: #fafafa;
          color: #444;
        }

        .banner.info {
          border-color: #d7e7ff;
          background: #f2f7ff;
        }

        .banner.success {
          border-color: #d7f0df;
          background: #f3fbf6;
        }

        .banner.error {
          border-color: #ffd7d7;
          background: #fff2f2;
        }

        .pricing-layout {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 16px;
        }

        @media (max-width: 1024px) {
          .pricing-layout {
            grid-template-columns: 1fr;
          }
        }

        .cards {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .admin-card {
          background: white;
          border-radius: 8px;
          padding: 18px;
          border: 1px solid #eee;
        }

        .admin-card.future {
          border-style: dashed;
          opacity: 0.9;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .card-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .card-description {
          margin: 4px 0 0 0;
          color: #777;
          font-size: 13px;
        }

        .tag {
          font-size: 12px;
          background: #f4f0ff;
          color: #5b3dbb;
          border: 1px solid #e6ddff;
          padding: 4px 8px;
          border-radius: 999px;
          white-space: nowrap;
        }

        .mini-preview {
          border: 1px solid #eee;
          background: #fafafa;
          border-radius: 10px;
          padding: 10px 12px;
          min-width: 170px;
        }

        .mini-preview-title {
          font-size: 12px;
          color: #666;
          margin-bottom: 6px;
        }

        .mini-preview-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #333;
        }

        .mini-preview-row strong {
          font-weight: 700;
        }

        .mini-preview-note {
          margin-top: 4px;
          font-size: 12px;
          color: #777;
        }

        .arrow {
          color: #888;
          font-weight: 600;
          margin: 0 6px;
        }

        .btn-primary,
        .btn-secondary {
          border: none;
          border-radius: 8px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          font-size: 14px;
        }

        .btn-primary {
          background: #1a73e8;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1557b0;
        }

        .btn-secondary {
          background: #f5f5f5;
          color: #333;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e9e9e9;
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .materials-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }

        .material-card {
          border: 1px solid #eee;
          border-radius: 8px;
          padding: 12px;
          background: #fafafa;
        }

        .material-header {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .material-name {
          flex: 1;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
          background: white;
        }

        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          color: #666;
        }

        .icon-btn:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #333;
        }

        .field {
          margin-top: 10px;
        }

        .field label {
          font-size: 13px;
          color: #333;
          display: block;
          margin-bottom: 6px;
          font-weight: 600;
        }

        .nested {
          margin-left: 6px;
          padding-left: 10px;
          border-left: 3px solid #f0f0f0;
          margin-top: 10px;
        }

        .input-with-unit {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .input {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 14px;
          background: white;
        }

        .input-error {
          border-color: #e53935;
          box-shadow: 0 0 0 2px rgba(229, 57, 53, 0.08);
        }

        .unit {
          font-size: 13px;
          color: #666;
          white-space: nowrap;
          min-width: 46px;
          text-align: right;
        }

        .select {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 14px;
          background: white;
        }

        .help-text {
          margin: 6px 0 0 0;
          font-size: 13px;
          color: #777;
        }

        .divider {
          height: 1px;
          background: #eee;
          margin: 12px 0;
        }

        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          font-size: 14px;
          color: #333;
          margin-top: 8px;
        }

        .toggle.mini {
          font-size: 13px;
          color: #555;
          margin-top: 0;
        }

        .toggle input {
          width: 16px;
          height: 16px;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          margin-top: 4px;
        }

        .toggle-row input {
          width: 16px;
          height: 16px;
        }

        .toggle-label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .hint {
          display: inline-flex;
          align-items: center;
          color: #888;
        }

        .hint:hover {
          color: #444;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        .grid-2 .full {
          grid-column: 1 / -1;
        }

        @media (max-width: 680px) {
          .grid-2 {
            grid-template-columns: 1fr;
          }
        }

        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 6px;
        }

        .radio {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #333;
          cursor: pointer;
        }

        .radio input {
          width: 16px;
          height: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 26px 12px;
          color: #666;
          border: 1px dashed #e5e5e5;
          border-radius: 10px;
          background: #fbfbfb;
        }

        .empty-state h3 {
          margin: 10px 0 6px;
          font-size: 16px;
          color: #333;
        }

        .empty-state p {
          margin: 0;
          font-size: 13px;
        }

        .field-error {
          margin-top: 6px;
          font-size: 12px;
          color: #e53935;
        }

        .preview {
          position: relative;
        }

        .preview-card {
          position: sticky;
          top: 16px;
          background: white;
          border: 1px solid #eee;
          border-radius: 8px;
          padding: 16px;
        }

        @media (max-width: 1024px) {
          .preview-card {
            position: static;
          }
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .preview-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #1a1a1a;
        }

        .breakdown {
          margin-top: 12px;
          border: 1px solid #eee;
          background: #fafafa;
          border-radius: 10px;
          padding: 12px;
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
          font-size: 13px;
          color: #333;
          padding: 6px 0;
        }

        .breakdown-row strong {
          font-weight: 800;
        }

        .breakdown-row.total {
          font-size: 14px;
        }

        .muted {
          color: #777;
          font-weight: 500;
          font-size: 12px;
        }

        .flags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .flag {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid #e6e6e6;
          background: white;
          color: #555;
        }

        .flag.warn {
          border-color: #ffe0b2;
          background: #fff7e6;
          color: #8a5a00;
        }

        .flag.info {
          border-color: #d7e7ff;
          background: #f2f7ff;
          color: #1557b0;
        }

        .validation-box {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #ffe0b2;
          background: #fff7e6;
          color: #8a5a00;
          font-size: 13px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default AdminPricing;
