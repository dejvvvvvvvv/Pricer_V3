// Admin Fees Configuration Page - Advanced Fee Rules (Demo-first)
// Drop-in replacement for:
//   src/pages/admin/AdminFees.jsx
//
// What this page implements (UI + persistence):
// - Fee types: flat, per_gram, per_minute (internally Kč/min), percent
// - Scope: MODEL / ORDER
// - Required vs selectable (optional) + selected_by_default
// - Category, description, active, duplicate, delete
// - Basic conditions builder (optional) stored as JSON
// - Dirty state + Save all changes (API-first + localStorage fallback)
//
// Persistence:
// - Saves the full advanced fee model to the backend (fees_v2) when available.
// - Also stores a copy in localStorage as a fallback for offline/demo use.

import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/AppIcon';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../contexts/LanguageContext';

const STORAGE_KEY_PREFIX = 'modelpricer_fees_config__';

const DEFAULT_FEE = {
  id: '', // generated
  name: '',
  description: '',
  category: '',
  type: 'flat', // "flat"|"per_gram"|"per_minute"|"percent"
  value: 0, // for per_minute ALWAYS Kč/min
  scope: 'MODEL', // "MODEL"|"ORDER"
  required: false,
  selectable: true,
  selected_by_default: false,
  active: true,
  // Optional conditions (AND list):
  // [{ key: 'material', operator: 'equals', value: 'PETG' }, ...]
  conditions: [],
  updated_at: null,
  updated_by: null,
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(v, fallback = false) {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  return fallback;
}

function parseConditions(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function clampMin0(v) {
  const n = safeNum(v, 0);
  return n < 0 ? 0 : n;
}

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `fee_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeFee(fee) {
  const f = { ...deepClone(DEFAULT_FEE), ...(fee || {}) };
  f.id = f.id || uuid();
  f.value = clampMin0(f.value);

  // required rules
  if (f.required) {
    f.selectable = false;
    f.selected_by_default = true; // conceptually "included"
  } else {
    // if not required, selectable can be true/false
    if (!f.selectable) f.selected_by_default = false;
  }

  // ensure arrays
  if (!Array.isArray(f.conditions)) f.conditions = [];

  // type normalization (backend old values)
  if (f.type === 'fixed') f.type = 'flat';

  return f;
}

// Mapping for OLD backend compatibility
function toLegacyFee(fee) {
  // old schema: {id,name,calculation_type,amount,application_type,enabled}
  // - calculation_type: fixed/per_gram/per_minute/per_hour/per_kwh (string)
  // - application_type: per_model/once_per_order/custom
  const calculation_type = (() => {
    if (fee.type === 'flat') return 'fixed';
    if (fee.type === 'per_gram') return 'per_gram';
    if (fee.type === 'per_minute') return 'per_minute';
    if (fee.type === 'percent') return 'percent';
    return 'fixed';
  })();

  const application_type = fee.scope === 'ORDER' ? 'once_per_order' : 'per_model';

  return {
    id: fee.id,
    name: fee.name,
    calculationType: calculation_type, // for frontend old mapping
    amount: clampMin0(fee.value),
    applicationType: application_type,
    enabled: !!fee.active,
  };
}

function fromLegacyFee(raw) {
  // raw from API (db): snake_case fields
  const calculation = raw?.calculation_type || raw?.calculationType || 'fixed';
  const application = raw?.application_type || raw?.applicationType || 'per_model';

  // Support legacy "per_hour" by converting to Kč/min internally
  if (calculation === 'per_hour') {
    return normalizeFee({
      id: raw.id,
      name: raw.name || '',
      type: 'per_minute',
      value: clampMin0(raw.amount) / 60,
      scope: application === 'once_per_order' ? 'ORDER' : 'MODEL',
      active: raw.enabled === 1 || raw.enabled === true,
    });
  }

  return normalizeFee({
    id: raw.id,
    name: raw.name || '',
    type:
      calculation === 'fixed'
        ? 'flat'
        : calculation === 'per_gram'
          ? 'per_gram'
          : calculation === 'per_minute'
            ? 'per_minute'
            : calculation === 'percent'
              ? 'percent'
              : 'flat',
    value: clampMin0(raw.amount || 0),
    scope: application === 'once_per_order' ? 'ORDER' : 'MODEL',
    active: raw.enabled === 1 || raw.enabled === true,
  });
}

function fromApiFee(raw) {
  // Accept both v2 shape (type/value/scope/required/...) and legacy shape.
  const looksV2 = raw && (raw.type || raw.scope || raw.value !== undefined || raw.required !== undefined);
  if (!looksV2) return fromLegacyFee(raw);

  return normalizeFee({
    id: raw.id,
    name: raw.name || '',
    description: raw.description || '',
    category: raw.category || '',
    type: raw.type || 'flat',
    value: clampMin0(raw.value ?? raw.amount ?? 0),
    scope: (raw.scope || '').toUpperCase() === 'ORDER' ? 'ORDER' : 'MODEL',
    required: parseBool(raw.required, false),
    selectable: parseBool(raw.selectable, true),
    selected_by_default: parseBool(raw.selected_by_default ?? raw.selectedByDefault ?? raw.selected_by_default, false),
    active: parseBool(raw.active ?? raw.enabled, true),
    conditions: parseConditions(raw.conditions),
    updated_at: raw.updated_at || null,
    updated_by: raw.updated_by || null,
  });
}

function fmtCzk(n) {
  const v = safeNum(n, 0);
  // Keep it simple & consistent with project style
  return `${v.toFixed(2)} Kč`;
}

function typeLabel(type, cs) {
  const labels = {
    flat: cs ? 'Fixní částka' : 'Flat',
    per_gram: cs ? 'Podle hmotnosti (Kč/g)' : 'Per gram',
    per_minute: cs ? 'Podle času (Kč/min)' : 'Per minute',
    percent: cs ? 'Procento (%)' : 'Percent',
  };
  return labels[type] || type;
}

function scopeLabel(scope, cs) {
  if (scope === 'ORDER') return cs ? 'Jednorázově (objednávka)' : 'Order (one-time)';
  return cs ? 'Za model' : 'Per model';
}

function operatorLabel(op, cs) {
  const map = {
    equals: cs ? '=' : '=',
    not_equals: cs ? '≠' : '≠',
    gte: cs ? '≥' : '≥',
    lte: cs ? '≤' : '≤',
    contains: cs ? 'obsahuje' : 'contains',
  };
  return map[op] || op;
}

const CONDITIONS_KEYS = [
  { key: 'material', label_cs: 'Materiál', label_en: 'Material', hint_cs: 'např. PETG', hint_en: 'e.g. PETG' },
  { key: 'quality_preset', label_cs: 'Preset kvality', label_en: 'Quality preset', hint_cs: 'např. Pro', hint_en: 'e.g. Pro' },
  { key: 'support_enabled', label_cs: 'Supporty', label_en: 'Supports', hint_cs: 'true/false', hint_en: 'true/false' },
  { key: 'infill_percent', label_cs: 'Infill (%)', label_en: 'Infill (%)', hint_cs: 'např. 30', hint_en: 'e.g. 30' },
];

const OPERATORS = ['equals', 'not_equals', 'gte', 'lte', 'contains'];

const AdminFees = () => {
  const { t, language } = useLanguage();
  const cs = language === 'cs';

  const customerId = 'test-customer-1'; // TODO: Get from auth/context
  const storageKey = `${STORAGE_KEY_PREFIX}${customerId}`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fees, setFees] = useState([]);
  const [activeId, setActiveId] = useState(null); // currently editing fee id
  const [search, setSearch] = useState('');
  const [banner, setBanner] = useState(null); // {type,text}
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [touched, setTouched] = useState(false);

  const ui = useMemo(() => {
    return {
      title: cs ? 'Fees (Poplatky)' : 'Fees',
      subtitle: cs
        ? 'Nadefinuj poplatky (povinné/volitelné), scope (za model / jednorázově) a způsob výpočtu. Změny se projeví v nových kalkulacích.'
        : 'Define fees (required/optional), scope (per model / order) and calculation. Changes apply to new calculations.',
      add: cs ? 'Přidat poplatek' : 'Add fee',
      save: cs ? 'Uložit změny' : 'Save changes',
      reset: cs ? 'Reset' : 'Reset',
      export: cs ? 'Export JSON' : 'Export JSON',
      import: cs ? 'Import JSON' : 'Import JSON',
      saved: cs ? 'Uloženo' : 'Saved',
      unsaved: cs ? 'Neuložené změny' : 'Unsaved changes',
      search: cs ? 'Hledat…' : 'Search…',
      emptyTitle: cs ? 'Zatím nemáš žádné poplatky' : 'No fees yet',
      emptyText: cs ? 'Klikni na „Přidat poplatek“ a vytvoř první.' : 'Click “Add fee” to create the first one.',
      invalid: cs ? 'Oprav chyby: hodnoty musí být ≥ 0 a povinné pole vyplněné.' : 'Fix errors: values must be ≥ 0 and required fields filled.',
      localSaved: cs ? 'Uloženo (API + lokální záloha).' : 'Saved (API + local fallback).',
      localOnly: cs ? 'Uloženo lokálně (API nedostupné).' : 'Saved locally (API unreachable).',
      confirmDelete: cs ? 'Opravdu chceš tento poplatek smazat?' : 'Are you sure you want to delete this fee?',
      duplicated: cs ? 'Poplatek zduplikován.' : 'Fee duplicated.',
    };
  }, [cs]);

  const currentFullConfig = useMemo(() => {
    return {
      fees: fees.map((f) => normalizeFee(f)),
      updated_at: new Date().toISOString(),
    };
  }, [fees]);

  const dirty = useMemo(() => {
    if (!savedSnapshot) return touched;
    try {
      const snap = JSON.parse(savedSnapshot);
      const now = currentFullConfig;
      const a = JSON.stringify({ ...snap, updated_at: undefined });
      const b = JSON.stringify({ ...now, updated_at: undefined });
      return a !== b;
    } catch {
      return touched;
    }
  }, [savedSnapshot, currentFullConfig, touched]);

  const validationErrors = useMemo(() => {
    const errs = [];
    fees.forEach((fee) => {
      const f = normalizeFee(fee);
      if (!f.name?.trim()) errs.push(`${f.id}:name`);
      if (safeNum(f.value, 0) < 0) errs.push(`${f.id}:value`);
      if (f.type === 'percent' && f.value > 100000) errs.push(`${f.id}:percent_value`); // sanity, not strict
      // conditions validation (optional): if key/operator/value missing
      if (Array.isArray(f.conditions) && f.conditions.length > 0) {
        f.conditions.forEach((c, idx) => {
          if (!c?.key || !c?.operator || (c?.value ?? '') === '') errs.push(`${f.id}:cond_${idx}`);
        });
      }
    });
    return errs;
  }, [fees]);

  const isValid = validationErrors.length === 0;

  const filteredFees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fees;
    return fees.filter((f) => {
      const fee = normalizeFee(f);
      return (
        fee.name.toLowerCase().includes(q) ||
        (fee.category || '').toLowerCase().includes(q) ||
        typeLabel(fee.type, true).toLowerCase().includes(q) ||
        scopeLabel(fee.scope, true).toLowerCase().includes(q)
      );
    });
  }, [fees, search]);

  const activeFee = useMemo(() => {
    return fees.find((f) => normalizeFee(f).id === activeId) || null;
  }, [fees, activeId]);

  const setFeeField = (feeId, field, value) => {
    setFees((prev) =>
      prev.map((x) => {
        const fx = normalizeFee(x);
        if (fx.id !== feeId) return x;
        const updated = normalizeFee({ ...fx, [field]: value });

        // enforce required rules
        if (updated.required) {
          updated.selectable = false;
          updated.selected_by_default = true;
        } else {
          if (!updated.selectable) updated.selected_by_default = false;
        }

        // keep internal value non-negative
        if (field === 'value') updated.value = clampMin0(value);

        return updated;
      })
    );
    setTouched(true);
  };

  const addFee = () => {
    const f = normalizeFee({
      ...deepClone(DEFAULT_FEE),
      id: uuid(),
      name: '',
      type: 'flat',
      value: 0,
      scope: 'MODEL',
      required: false,
      selectable: true,
      selected_by_default: false,
      active: true,
      category: '',
      description: '',
      conditions: [],
    });
    setFees((prev) => [f, ...prev]);
    setActiveId(f.id);
    setTouched(true);
  };

  const duplicateFee = (feeId) => {
    const src = fees.find((x) => normalizeFee(x).id === feeId);
    if (!src) return;
    const copy = normalizeFee({
      ...deepClone(src),
      id: uuid(),
      name: `${normalizeFee(src).name || (cs ? 'Poplatek' : 'Fee')} (copy)`,
      updated_at: null,
      updated_by: null,
    });
    setFees((prev) => [copy, ...prev]);
    setActiveId(copy.id);
    setTouched(true);
    setBanner({ type: 'success', text: ui.duplicated });
  };

  const deleteFee = (feeId) => {
    const ok = window.confirm(ui.confirmDelete);
    if (!ok) return;
    setFees((prev) => prev.filter((x) => normalizeFee(x).id !== feeId));
    if (activeId === feeId) setActiveId(null);
    setTouched(true);
  };

  const tryLoadLocal = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.fees) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveLocal = (cfg) => {
    localStorage.setItem(storageKey, JSON.stringify(cfg));
  };

  const handleReset = () => {
    const ok = window.confirm(cs ? 'Resetovat poplatky? (Smaže všechny lokální změny.)' : 'Reset fees? (Clears local changes.)');
    if (!ok) return;
    setFees([]);
    setActiveId(null);
    setTouched(true);
    setBanner({ type: 'info', text: cs ? 'Reset provedeno.' : 'Reset done.' });
  };

  const handleExport = async () => {
    const json = JSON.stringify(currentFullConfig, null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setBanner({ type: 'success', text: cs ? 'Zkopírováno do schránky.' : 'Copied to clipboard.' });
      } else {
        window.prompt(cs ? 'Zkopíruj JSON:' : 'Copy JSON:', json);
      }
    } catch {
      window.prompt(cs ? 'Zkopíruj JSON:' : 'Copy JSON:', json);
    }
  };

  const handleImport = () => {
    const raw = window.prompt(cs ? 'Vlož JSON konfigurace:' : 'Paste JSON configuration:');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const incoming = Array.isArray(parsed?.fees) ? parsed.fees : [];
      setFees(incoming.map((f) => normalizeFee(f)));
      setActiveId(incoming?.[0]?.id || null);
      setTouched(true);
      setBanner({ type: 'success', text: cs ? 'Import dokončen.' : 'Import complete.' });
    } catch {
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

      // 1) Always save full model locally (fallback/offline)
      saveLocal(currentFullConfig);

      // 2) API save (full model). If server is older, fallback to legacy subset.
      let apiOk = false;
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/fees/${customerId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fees: currentFullConfig.fees }),
        });
        apiOk = response.ok;

        if (!apiOk) {
          const legacyFees = currentFullConfig.fees.map(toLegacyFee);
          const response2 = await fetch(`${API_BASE_URL}/api/admin/fees/${customerId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fees: legacyFees }),
          });
          apiOk = response2.ok;
        }
      } catch {
        apiOk = false;
      }

      setSavedSnapshot(JSON.stringify({ ...currentFullConfig, updated_at: undefined }));
      setTouched(false);

      setBanner({ type: 'success', text: apiOk ? ui.localSaved : ui.localOnly });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setBanner(null);

      // 1) Load localStorage quickly (if present), then try API as source of truth
      const local = tryLoadLocal();
      const hasLocal = !!local?.fees;
      if (hasLocal && mounted) {
        const loadedLocal = (local.fees || []).map((f) => normalizeFee(f));
        setFees(loadedLocal);
        setActiveId(loadedLocal[0]?.id || null);
        setSavedSnapshot(JSON.stringify({ ...local, updated_at: undefined }));
        setTouched(false);
      }

      // 2) API (v2 preferred, legacy compatible)
      try {
        const resp = await fetch(`${API_BASE_URL}/api/admin/fees/${customerId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!mounted) return;

        const apiArray = Array.isArray(data?.fees) ? data.fees : Array.isArray(data) ? data : [];
        const loaded = (apiArray || []).map(fromApiFee);
        setFees(loaded);
        setActiveId(loaded[0]?.id || null);

        const full = { fees: loaded, updated_at: new Date().toISOString() };
        saveLocal(full);
        setSavedSnapshot(JSON.stringify({ ...full, updated_at: undefined }));
        setTouched(false);
      } catch (e) {
        if (!mounted) return;
        if (!hasLocal) {
          const full = { fees: [], updated_at: new Date().toISOString() };
          saveLocal(full);
          setFees([]);
          setActiveId(null);
          setSavedSnapshot(JSON.stringify({ ...full, updated_at: undefined }));
          setTouched(false);
        }

        setBanner({
          type: 'info',
          text: cs
            ? 'Backend není dostupný – používám lokální zálohu (localStorage).'
            : 'Backend not reachable – using local fallback (localStorage).',
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const addCondition = (feeId) => {
    const f = normalizeFee(activeFee);
    const next = [...(f.conditions || []), { key: 'material', operator: 'equals', value: '' }];
    setFeeField(feeId, 'conditions', next);
  };

  const updateCondition = (feeId, idx, field, value) => {
    const f = normalizeFee(activeFee);
    const next = (f.conditions || []).map((c, i) => (i === idx ? { ...c, [field]: value } : c));
    setFeeField(feeId, 'conditions', next);
  };

  const deleteCondition = (feeId, idx) => {
    const f = normalizeFee(activeFee);
    const next = (f.conditions || []).filter((_, i) => i !== idx);
    setFeeField(feeId, 'conditions', next);
  };

  const renderValueUnit = (feeType) => {
    if (feeType === 'flat') return 'Kč';
    if (feeType === 'per_gram') return 'Kč/g';
    if (feeType === 'per_minute') return 'Kč/min';
    if (feeType === 'percent') return '%';
    return '';
  };

  const previewText = (fee) => {
    const f = normalizeFee(fee);
    const value = clampMin0(f.value);
    const name = f.name?.trim() || (cs ? 'Poplatek' : 'Fee');
    const base = cs ? 'z (materiál + čas + ne‑% fees)' : 'from (material + time + non‑% fees)';
    if (f.type === 'flat') return cs ? `${name}: fixně ${value} Kč` : `${name}: flat ${value} CZK`;
    if (f.type === 'per_gram') return cs ? `${name}: ${value} Kč / g` : `${name}: ${value} CZK / g`;
    if (f.type === 'per_minute') return cs ? `${name}: ${value} Kč / min` : `${name}: ${value} CZK / min`;
    if (f.type === 'percent') return cs ? `${name}: ${value}% ${base}` : `${name}: ${value}% ${base}`;
    return name;
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">{cs ? 'Načítám…' : 'Loading…'}</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* Header */}
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

          <button className="btn-secondary" onClick={handleExport} disabled={saving}>
            <Icon name="Copy" size={18} />
            {ui.export}
          </button>

          <button className="btn-secondary" onClick={handleImport} disabled={saving}>
            <Icon name="Upload" size={18} />
            {ui.import}
          </button>

          <button className="btn-secondary" onClick={handleReset} disabled={saving}>
            <Icon name="RotateCcw" size={18} />
            {ui.reset}
          </button>

          <button className="btn-secondary" onClick={addFee} disabled={saving}>
            <Icon name="Plus" size={18} />
            {ui.add}
          </button>

          <button className="btn-primary" onClick={handleSave} disabled={!dirty || saving || !isValid}>
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

      {/* Layout */}
      <div className="fees-layout">
        {/* Left list */}
        <div className="fees-list">
          <div className="list-toolbar">
            <div className="search">
              <Icon name="Search" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ui.search}
              />
            </div>
          </div>

          {filteredFees.length === 0 ? (
            <div className="empty-state">
              <Icon name="Receipt" size={48} />
              <h3>{ui.emptyTitle}</h3>
              <p>{ui.emptyText}</p>
            </div>
          ) : (
            <div className="table">
              <div className="thead">
                <div className="th">{cs ? 'Aktivní' : 'Active'}</div>
                <div className="th">{cs ? 'Název' : 'Name'}</div>
                <div className="th">{cs ? 'Typ' : 'Type'}</div>
                <div className="th">{cs ? 'Hodnota' : 'Value'}</div>
                <div className="th">{cs ? 'Scope' : 'Scope'}</div>
                <div className="th">{cs ? 'Volba' : 'Visibility'}</div>
                <div className="th">{cs ? 'Kategorie' : 'Category'}</div>
                <div className="th th-actions">{cs ? 'Akce' : 'Actions'}</div>
              </div>

              {filteredFees.map((fee) => {
                const f = normalizeFee(fee);
                const isActive = activeId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`trow ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveId(f.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="td">
                      <label className="toggle" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={!!f.active}
                          onChange={(e) => setFeeField(f.id, 'active', e.target.checked)}
                        />
                      </label>
                    </div>
                    <div className="td name">
                      <div className="name-main">{f.name?.trim() || (cs ? '(bez názvu)' : '(unnamed)')}</div>
                      {f.description?.trim() ? <div className="name-sub">{f.description}</div> : null}
                    </div>
                    <div className="td">{typeLabel(f.type, cs)}</div>
                    <div className="td">{f.type === 'percent' ? `${clampMin0(f.value)} %` : fmtCzk(clampMin0(f.value))}</div>
                    <div className="td">{scopeLabel(f.scope, cs)}</div>
                    <div className="td">
                      {f.required ? (
                        <span className="pill required">{cs ? 'Povinný' : 'Required'}</span>
                      ) : f.selectable ? (
                        <span className="pill optional">{cs ? 'Volitelný' : 'Optional'}</span>
                      ) : (
                        <span className="pill hidden">{cs ? 'Skrytý' : 'Hidden'}</span>
                      )}
                    </div>
                    <div className="td">{f.category || '—'}</div>
                    <div className="td actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title={cs ? 'Duplikovat' : 'Duplicate'} onClick={() => duplicateFee(f.id)}>
                        <Icon name="CopyPlus" size={16} />
                      </button>
                      <button className="icon-btn" title={cs ? 'Smazat' : 'Delete'} onClick={() => deleteFee(f.id)}>
                        <Icon name="Trash2" size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isValid ? (
            <div className="validation-box">
              <Icon name="AlertTriangle" size={18} />
              <span>{ui.invalid}</span>
            </div>
          ) : null}
        </div>

        {/* Right editor */}
        <div className="editor">
          {activeFee ? (
            <div className="editor-card">
              <div className="editor-header">
                <h3>{cs ? 'Úprava poplatku' : 'Edit fee'}</h3>
                <span className="editor-preview">
                  <Icon name="Info" size={16} />
                  {previewText(activeFee)}
                </span>
              </div>

              <div className="field">
                <label>{cs ? 'Název' : 'Name'}</label>
                <input
                  className="input"
                  type="text"
                  value={normalizeFee(activeFee).name}
                  onChange={(e) => setFeeField(activeId, 'name', e.target.value)}
                  placeholder={cs ? 'např. Lakování, Postprocessing' : 'e.g. Postprocessing'}
                />
              </div>

              <div className="field">
                <label>{cs ? 'Popis (volitelné)' : 'Description (optional)'}</label>
                <input
                  className="input"
                  type="text"
                  value={normalizeFee(activeFee).description}
                  onChange={(e) => setFeeField(activeId, 'description', e.target.value)}
                  placeholder={cs ? 'Co to je a kdy se účtuje' : 'What it is and when it applies'}
                />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>{cs ? 'Kategorie' : 'Category'}</label>
                  <input
                    className="input"
                    type="text"
                    value={normalizeFee(activeFee).category}
                    onChange={(e) => setFeeField(activeId, 'category', e.target.value)}
                    placeholder={cs ? 'např. Postprocessing, Express' : 'e.g. Postprocessing, Express'}
                  />
                </div>

                <div className="field">
                  <label>{cs ? 'Aktivní' : 'Active'}</label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={!!normalizeFee(activeFee).active}
                      onChange={(e) => setFeeField(activeId, 'active', e.target.checked)}
                    />
                    <span className="toggle-label">{normalizeFee(activeFee).active ? (cs ? 'Zapnuto' : 'On') : (cs ? 'Vypnuto' : 'Off')}</span>
                  </label>
                </div>
              </div>

              <div className="divider" />

              <div className="grid-2">
                <div className="field">
                  <label>{cs ? 'Typ poplatku' : 'Fee type'}</label>
                  <select
                    className="select"
                    value={normalizeFee(activeFee).type}
                    onChange={(e) => setFeeField(activeId, 'type', e.target.value)}
                  >
                    <option value="flat">{typeLabel('flat', cs)}</option>
                    <option value="per_gram">{typeLabel('per_gram', cs)}</option>
                    <option value="per_minute">{typeLabel('per_minute', cs)}</option>
                    <option value="percent">{typeLabel('percent', cs)}</option>
                  </select>
                  {normalizeFee(activeFee).type === 'percent' ? (
                    <p className="help-text">
                      {cs
                        ? 'Percent se bude počítat ze subtotalu bez percent poplatků (konzistentní základ).'
                        : 'Percent will be calculated from subtotal excluding percent fees (consistent base).'}
                    </p>
                  ) : null}
                </div>

                <div className="field">
                  <label>{cs ? 'Hodnota' : 'Value'}</label>
                  <div className="input-with-unit">
                    <input
                      className={`input ${safeNum(normalizeFee(activeFee).value, 0) < 0 ? 'input-error' : ''}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={normalizeFee(activeFee).value}
                      onChange={(e) => setFeeField(activeId, 'value', safeNum(e.target.value, 0))}
                    />
                    <span className="unit">{renderValueUnit(normalizeFee(activeFee).type)}</span>
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>{cs ? 'Scope (kdy se aplikuje)' : 'Scope (where it applies)'}</label>
                  <select
                    className="select"
                    value={normalizeFee(activeFee).scope}
                    onChange={(e) => setFeeField(activeId, 'scope', e.target.value)}
                  >
                    <option value="MODEL">{scopeLabel('MODEL', cs)}</option>
                    <option value="ORDER">{scopeLabel('ORDER', cs)}</option>
                  </select>
                  <p className="help-text">
                    {normalizeFee(activeFee).scope === 'MODEL'
                      ? cs
                        ? 'Aplikuje se na každý model (a násobí se množstvím kusů).'
                        : 'Applied per model (and multiplied by quantity).'
                      : cs
                        ? 'Aplikuje se jednou na celou objednávku.'
                        : 'Applied once per order.'}
                  </p>
                </div>

                <div className="field">
                  <label>{cs ? 'Viditelnost ve widgetu' : 'Widget visibility'}</label>
                  <div className="stack">
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={!!normalizeFee(activeFee).required}
                        onChange={(e) => setFeeField(activeId, 'required', e.target.checked)}
                      />
                      <span className="toggle-label">{cs ? 'Povinný (vždy zahrnuto)' : 'Required (always included)'}</span>
                    </label>

                    {!normalizeFee(activeFee).required ? (
                      <>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={!!normalizeFee(activeFee).selectable}
                            onChange={(e) => setFeeField(activeId, 'selectable', e.target.checked)}
                          />
                          <span className="toggle-label">{cs ? 'Volitelný (checkbox ve widgetu)' : 'Selectable (checkbox in widget)'}</span>
                        </label>

                        {normalizeFee(activeFee).selectable ? (
                          <label className="toggle-row nested-row">
                            <input
                              type="checkbox"
                              checked={!!normalizeFee(activeFee).selected_by_default}
                              onChange={(e) => setFeeField(activeId, 'selected_by_default', e.target.checked)}
                            />
                            <span className="toggle-label">{cs ? 'Zaškrtnuto defaultně' : 'Selected by default'}</span>
                          </label>
                        ) : (
                          <p className="help-text">{cs ? 'Skryté: přičte se automaticky, ale zákazník ho nevidí.' : 'Hidden: added automatically but not shown to customer.'}</p>
                        )}
                      </>
                    ) : (
                      <p className="help-text">{cs ? 'Povinný poplatek můžeš ve widgetu zobrazit jako „Zahrnuto“.' : 'Required fees can be shown as “Included”.'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="divider" />

              {/* Conditions builder (optional) */}
              <div className="section">
                <div className="section-header">
                  <div>
                    <h4>{cs ? 'Podmínky (volitelné)' : 'Conditions (optional)'}</h4>
                    <p className="help-text">
                      {cs
                        ? 'Poplatek se použije jen pokud platí všechny podmínky (AND).'
                        : 'Fee applies only if all conditions match (AND).'}
                    </p>
                  </div>
                  <button className="btn-secondary small" onClick={() => addCondition(activeId)}>
                    <Icon name="Plus" size={16} />
                    {cs ? 'Přidat podmínku' : 'Add condition'}
                  </button>
                </div>

                {normalizeFee(activeFee).conditions?.length ? (
                  <div className="conditions">
                    {normalizeFee(activeFee).conditions.map((c, idx) => {
                      const keyMeta = CONDITIONS_KEYS.find((k) => k.key === c.key) || CONDITIONS_KEYS[0];
                      return (
                        <div key={idx} className="condition-row">
                          <select
                            className="select"
                            value={c.key}
                            onChange={(e) => updateCondition(activeId, idx, 'key', e.target.value)}
                          >
                            {CONDITIONS_KEYS.map((k) => (
                              <option key={k.key} value={k.key}>
                                {cs ? k.label_cs : k.label_en}
                              </option>
                            ))}
                          </select>

                          <select
                            className="select"
                            value={c.operator}
                            onChange={(e) => updateCondition(activeId, idx, 'operator', e.target.value)}
                          >
                            {OPERATORS.map((op) => (
                              <option key={op} value={op}>
                                {operatorLabel(op, cs)}
                              </option>
                            ))}
                          </select>

                          <input
                            className="input"
                            type="text"
                            value={c.value}
                            onChange={(e) => updateCondition(activeId, idx, 'value', e.target.value)}
                            placeholder={cs ? keyMeta.hint_cs : keyMeta.hint_en}
                          />

                          <button className="icon-btn" title={cs ? 'Smazat' : 'Delete'} onClick={() => deleteCondition(activeId, idx)}>
                            <Icon name="Trash2" size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="hint-box">
                    <Icon name="Info" size={16} />
                    <span>
                      {cs
                        ? 'Bez podmínek = poplatek se aplikuje vždy (pokud je aktivní a vybraný/povinný).'
                        : 'No conditions = fee applies always (if active and selected/required).'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="editor-card">
              <div className="empty-editor">
                <Icon name="MousePointerClick" size={40} />
                <h3>{cs ? 'Vyber poplatek' : 'Select a fee'}</h3>
                <p>{cs ? 'Klikni vlevo na poplatek, nebo vytvoř nový.' : 'Click a fee on the left, or create a new one.'}</p>
              </div>
            </div>
          )}
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
          max-width: 760px;
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

        .fees-layout {
          display: grid;
          grid-template-columns: 1fr 420px;
          gap: 16px;
        }

        @media (max-width: 1024px) {
          .fees-layout {
            grid-template-columns: 1fr;
          }
        }

        .fees-list {
          background: white;
          border: 1px solid #eee;
          border-radius: 10px;
          overflow: hidden;
        }

        .list-toolbar {
          padding: 12px;
          border-bottom: 1px solid #eee;
          background: #fafafa;
        }

        .search {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 8px 10px;
          background: white;
        }

        .search input {
          border: none;
          outline: none;
          width: 100%;
          font-size: 14px;
        }

        .table {
          display: grid;
        }

        .thead {
          display: grid;
          grid-template-columns: 70px 1.4fr 1fr 0.8fr 1fr 0.9fr 1fr 110px;
          gap: 0;
          padding: 10px 12px;
          border-bottom: 1px solid #eee;
          background: white;
        }

        .th {
          font-size: 12px;
          color: #666;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .th-actions {
          text-align: right;
        }

        .trow {
          display: grid;
          grid-template-columns: 70px 1.4fr 1fr 0.8fr 1fr 0.9fr 1fr 110px;
          padding: 10px 12px;
          border-bottom: 1px solid #f1f1f1;
          cursor: pointer;
          background: white;
        }

        .trow:hover {
          background: #fafafa;
        }

        .trow.active {
          background: #f2f7ff;
          outline: 2px solid rgba(26, 115, 232, 0.15);
        }

        .td {
          font-size: 13px;
          color: #333;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .td.name {
          flex-direction: column;
          align-items: flex-start;
          gap: 3px;
        }

        .name-main {
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        .name-sub {
          font-size: 12px;
          color: #777;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        .td.actions {
          justify-content: flex-end;
          gap: 6px;
        }

        .pill {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid #e6e6e6;
          background: white;
          color: #555;
        }

        .pill.required {
          border-color: #d7f0df;
          background: #f3fbf6;
          color: #1f6b3a;
        }

        .pill.optional {
          border-color: #d7e7ff;
          background: #f2f7ff;
          color: #1557b0;
        }

        .pill.hidden {
          border-color: #eee;
          background: #fafafa;
          color: #777;
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

        .editor {
          position: relative;
        }

        .editor-card {
          position: sticky;
          top: 16px;
          background: white;
          border: 1px solid #eee;
          border-radius: 10px;
          padding: 16px;
        }

        @media (max-width: 1024px) {
          .editor-card {
            position: static;
          }
        }

        .editor-header {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 10px;
        }

        .editor-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #1a1a1a;
        }

        .editor-preview {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #555;
          background: #fafafa;
          border: 1px solid #eee;
          padding: 8px 10px;
          border-radius: 8px;
        }

        .btn-primary,
        .btn-secondary {
          border: none;
          border-radius: 8px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          font-size: 14px;
          background: #f5f5f5;
          color: #333;
        }

        .btn-primary {
          background: #1a73e8;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1557b0;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e9e9e9;
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary.small {
          padding: 8px 10px;
          font-size: 13px;
        }

        .field {
          margin-top: 10px;
        }

        .field label {
          font-size: 13px;
          color: #333;
          display: block;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .input,
        .select {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          background: white;
        }

        .input-error {
          border-color: #e53935;
          box-shadow: 0 0 0 2px rgba(229, 57, 53, 0.08);
        }

        .input-with-unit {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .unit {
          font-size: 13px;
          color: #666;
          white-space: nowrap;
          min-width: 52px;
          text-align: right;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        @media (max-width: 680px) {
          .grid-2 {
            grid-template-columns: 1fr;
          }
        }

        .help-text {
          margin: 6px 0 0 0;
          font-size: 13px;
          color: #777;
        }

        .divider {
          height: 1px;
          background: #eee;
          margin: 14px 0;
        }

        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
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
          margin-top: 0;
        }

        .nested-row {
          margin-left: 22px;
        }

        .toggle-label {
          font-weight: 700;
          color: #333;
          font-size: 13px;
        }

        .stack {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section {
          margin-top: 4px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 8px;
        }

        .section-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 800;
          color: #1a1a1a;
        }

        .conditions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .condition-row {
          display: grid;
          grid-template-columns: 1fr 120px 1fr 40px;
          gap: 8px;
          align-items: center;
        }

        @media (max-width: 680px) {
          .condition-row {
            grid-template-columns: 1fr;
          }
        }

        .hint-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #e6e6e6;
          background: #fafafa;
          color: #555;
          font-size: 13px;
        }

        .empty-state {
          text-align: center;
          padding: 30px 12px;
          color: #666;
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

        .empty-editor {
          text-align: center;
          padding: 22px 10px;
          color: #666;
        }

        .empty-editor h3 {
          margin: 10px 0 6px;
          font-size: 16px;
          color: #333;
        }

        .empty-editor p {
          margin: 0;
          font-size: 13px;
        }

        .validation-box {
          margin: 10px 12px 12px;
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

        @media (max-width: 980px) {
          .thead,
          .trow {
            grid-template-columns: 70px 1.4fr 1fr 0.8fr 1fr 0.9fr 1fr 110px;
          }
        }

        @media (max-width: 860px) {
          /* compact table on smaller screens */
          .thead {
            display: none;
          }

          .trow {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 12px;
          }

          .td {
            justify-content: space-between;
          }

          .td.name {
            align-items: flex-start;
            justify-content: flex-start;
          }

          .td.actions {
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminFees;
