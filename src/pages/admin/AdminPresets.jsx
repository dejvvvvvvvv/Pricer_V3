import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import { useLanguage } from '../../contexts/LanguageContext';
import { PRUSA_PARAMETER_CATALOG } from '../../data/prusaParameterCatalog';
import { readTenantJson, writeTenantJson } from '../../utils/adminTenantStorage';
import { coerceIniValue, parseIniToKeyValue } from '../../utils/ini';

// =============================
// Presets (Admin) — Variant A (front-end demo)
// - Import .ini (PrusaSlicer) and map keys to Parameter catalog
// - Store preset metadata + values in localStorage
// - Show Diff vs Admin defaults
// =============================

const STORAGE_PRESETS = 'presets:v1';
const STORAGE_PARAMS = 'parameters:v1';

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return `p_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function safeJsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getLabel(def, language) {
  if (!def?.label) return def?.key || '';
  return def.label[language] || def.label.cs || def.label.en || def.key;
}

function getCatalogMap() {
  const map = {};
  for (const d of PRUSA_PARAMETER_CATALOG) map[d.key] = d;
  return map;
}

function buildAdminDefaultMap() {
  const persisted = readTenantJson(STORAGE_PARAMS, null);
  const byKey = getCatalogMap();
  const out = {};

  for (const def of PRUSA_PARAMETER_CATALOG) {
    const row = persisted?.parameters?.[def.key];
    const override = row?.default_value_override;
    out[def.key] = override == null ? def.defaultValue : override;
  }

  // Include unknown definitions if present in storage (for forward compatibility)
  if (persisted?.parameters) {
    for (const [k, v] of Object.entries(persisted.parameters)) {
      if (!(k in out) && v && 'default_value_override' in v) {
        out[k] = v.default_value_override;
      }
    }
  }

  return { defaults: out, defsByKey: byKey };
}

function readPresets() {
  const list = readTenantJson(STORAGE_PRESETS, []);
  if (!Array.isArray(list)) return [];
  return list;
}

function writePresets(list) {
  writeTenantJson(STORAGE_PRESETS, list);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sortByOrderThenName(a, b) {
  const oa = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
  const ob = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
  if (oa !== ob) return oa - ob;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function computeDiffCount(preset, adminDefaults) {
  const values = preset?.values || {};
  let n = 0;
  for (const [k, v] of Object.entries(values)) {
    if (!safeJsonEqual(v, adminDefaults[k])) n += 1;
  }
  return n;
}

export default function AdminPresets() {
  return (
    <div>
      <Routes>
        <Route index element={<PresetsList />} />
        <Route path=":presetId" element={<PresetDetail />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </div>
  );
}

function PresetsList() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const { defaults: adminDefaults, defsByKey } = useMemo(() => buildAdminDefaultMap(), []);

  const [presets, setPresets] = useState(() => readPresets());
  const [importState, setImportState] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setPresets(readPresets());
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...presets].sort(sortByOrderThenName);
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p.name || ''} ${p.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [presets, search]);

  const onPickIniFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const kv = parseIniToKeyValue(text);

    const mapped = {};
    const unknown = [];
    for (const [k, raw] of Object.entries(kv)) {
      const def = defsByKey[k];
      if (!def) {
        unknown.push(k);
        continue;
      }
      mapped[k] = coerceIniValue(raw, def.dataType);
    }

    // Keep ALL parsed keys for future exact slicing. Keys not present in our catalog
    // are stored as unknown_* and are still preserved in raw_ini/raw_values.
    const unknown_values = {};
    for (const k of unknown) unknown_values[k] = kv[k];
    setImportState({
      filename: file.name,
      raw_ini: text,
      all: kv,
      mapped,
      unknown,
      unknown_values,
      meta: {
        name: file.name.replace(/\.ini$/i, ''),
        description: '',
        visible_in_widget: false,
        order: 10,
        is_default_selected: false,
      },
    });
  };

  const doImport = () => {
    if (!importState) return;
    const p = {
      id: uid(),
      name: importState.meta.name || 'New preset',
      description: importState.meta.description || '',
      visible_in_widget: Boolean(importState.meta.visible_in_widget),
      order: Number(importState.meta.order) || 10,
      is_default_selected: Boolean(importState.meta.is_default_selected),
      values: importState.mapped,
      raw_values: importState.all,
      raw_ini: importState.raw_ini,
      unknown_keys: importState.unknown,
      unknown_values: importState.unknown_values,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    let next = [...presets];
    if (p.is_default_selected) {
      next = next.map((x) => ({ ...x, is_default_selected: false }));
    }
    next.push(p);
    writePresets(next);
    setPresets(next);
    setImportState(null);
  };

  const deletePreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    const ok = window.confirm(`Smazat preset "${p.name}"?`);
    if (!ok) return;
    const next = presets.filter((x) => x.id !== id);
    writePresets(next);
    setPresets(next);
  };

  const duplicatePreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    const copy = {
      ...p,
      id: uid(),
      name: `${p.name} (copy)`,
      is_default_selected: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const next = [...presets, copy];
    writePresets(next);
    setPresets(next);
  };

  const setDefaultPreset = (id) => {
    const next = presets.map((p) => ({ ...p, is_default_selected: p.id === id }));
    writePresets(next);
    setPresets(next);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="title">Presets</h1>
          <p className="subtitle">
            Importuj .ini z PrusaSliceru, nastav viditelnost ve widgetu a zkontroluj rozdíly (Diff) oproti Admin defaultům.
          </p>
        </div>

        <div className="right">
          <label className="btn btn-primary">
            <Icon name="Upload" size={16} />
            <span>Import .ini</span>
            <input
              type="file"
              accept=".ini,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => onPickIniFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="Search" size={16} />
          <input
            placeholder="Hledat preset…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>Zatím nemáš žádné presety.</p>
          <p className="muted">Klikni na „Import .ini“ a nahraj export z PrusaSliceru.</p>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((p) => {
            const diffCount = computeDiffCount(p, adminDefaults);
            return (
              <div key={p.id} className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      {p.name}
                      {p.is_default_selected && <span className="badge badge-green">Default</span>}
                      {p.visible_in_widget && <span className="badge badge-blue">Visible</span>}
                    </div>
                    {p.description ? <div className="card-desc">{p.description}</div> : null}
                  </div>
                  <div className="meta">
                    <div className="meta-line">
                      <span className="muted">Changes:</span> <b>{diffCount}</b>
                    </div>
                    <div className="meta-line">
                      <span className="muted">Order:</span> <b>{Number.isFinite(Number(p.order)) ? p.order : '—'}</b>
                    </div>
                  </div>
                </div>

                <div className="card-actions">
                  <button className="btn" onClick={() => navigate(`/admin/presets/${p.id}`)}>
                    <Icon name="Pencil" size={16} />
                    Upravit
                  </button>
                  <button className="btn" onClick={() => duplicatePreset(p.id)}>
                    <Icon name="Copy" size={16} />
                    Duplikovat
                  </button>
                  <button
                    className="btn"
                    onClick={() => downloadTextFile(`${p.name || 'preset'}.ini`, p.raw_ini || '')}
                  >
                    <Icon name="Download" size={16} />
                    Stáhnout ini
                  </button>
                </div>

                <div className="card-actions second">
                  <button className="btn" onClick={() => setDefaultPreset(p.id)}>
                    <Icon name="Star" size={16} />
                    Nastavit jako default
                  </button>
                  <button className="btn btn-danger" onClick={() => deletePreset(p.id)}>
                    <Icon name="Trash2" size={16} />
                    Smazat
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importState && (
        <ImportModal
          language={language}
          state={importState}
          onClose={() => setImportState(null)}
          onChange={(next) => setImportState(next)}
          onImport={doImport}
        />
      )}

      <style>{css}</style>
    </div>
  );
}

function PresetDetail() {
  const { presetId } = useParams();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const { defaults: adminDefaults, defsByKey } = useMemo(() => buildAdminDefaultMap(), []);
  const [presets, setPresets] = useState(() => readPresets());
  const preset = presets.find((p) => p.id === presetId);

  const [tab, setTab] = useState('diff');
  const [draft, setDraft] = useState(() => (preset ? JSON.parse(JSON.stringify(preset)) : null));

const rawAll = useMemo(() => {
  if (!draft) return {};
  if (draft.raw_values && typeof draft.raw_values === 'object') return draft.raw_values;
  if (draft.raw_ini && typeof draft.raw_ini === 'string') return parseIniToKeyValue(draft.raw_ini);
  return draft.values || {};
}, [draft]);

const unknownPairs = useMemo(() => {
  if (!draft) return {};
  if (draft.unknown_values && typeof draft.unknown_values === 'object') return draft.unknown_values;
  if (draft.unknown_keys && Array.isArray(draft.unknown_keys)) {
    const o = {};
    for (const k of draft.unknown_keys) o[k] = rawAll?.[k];
    return o;
  }
  return {};
}, [draft, rawAll]);


  useEffect(() => {
    setPresets(readPresets());
  }, [presetId]);

  useEffect(() => {
    setDraft(preset ? JSON.parse(JSON.stringify(preset)) : null);
  }, [presetId, preset]);

  if (!preset || !draft) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="title">Preset nenalezen</h1>
            <p className="subtitle">Tento preset neexistuje nebo byl smazán.</p>
          </div>
          <div className="right">
            <button className="btn" onClick={() => navigate('/admin/presets')}>
              <Icon name="ArrowLeft" size={16} />
              Zpět
            </button>
          </div>
        </div>
        <style>{css}</style>
      </div>
    );
  }

  const dirty = !safeJsonEqual(draft, preset);
  const diffList = computeDiffList(draft, adminDefaults, defsByKey, language);

  const save = () => {
    const next = presets.map((p) => {
      if (p.id !== presetId) return p;
      return { ...draft, updated_at: nowIso() };
    });

    // only one default
    if (draft.is_default_selected) {
      for (let i = 0; i < next.length; i += 1) {
        if (next[i].id !== presetId && next[i].is_default_selected) {
          next[i] = { ...next[i], is_default_selected: false };
        }
      }
    }

    writePresets(next);
    setPresets(next);
    navigate(`/admin/presets/${presetId}`, { replace: true });
  };

  const del = () => {
    const ok = window.confirm(`Smazat preset "${preset.name}"?`);
    if (!ok) return;
    const next = presets.filter((p) => p.id !== presetId);
    writePresets(next);
    setPresets(next);
    navigate('/admin/presets');
  };

  const downloadRaw = () => downloadTextFile(`${draft.name || 'preset'}.ini`, draft.raw_ini || '');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="title">{draft.name}</h1>
          <p className="subtitle">Uprav metadata presetu a zkontroluj změny (Diff) oproti Admin defaultům.</p>
        </div>

        <div className="right">
          <button className="btn" onClick={() => navigate('/admin/presets')}>
            <Icon name="ArrowLeft" size={16} />
            Zpět
          </button>
          <button className="btn" onClick={downloadRaw}>
            <Icon name="Download" size={16} />
            Stáhnout ini
          </button>
          <button className="btn btn-danger" onClick={del}>
            <Icon name="Trash2" size={16} />
            Smazat
          </button>
          <button className={`btn btn-primary ${dirty ? '' : 'disabled'}`} disabled={!dirty} onClick={save}>
            <Icon name="Save" size={16} />
            Uložit
          </button>
        </div>
      </div>

      <div className="layout">
        <div className="left">
          <div className="card">
            <div className="card-title">Metadata</div>

            <div className="form">
              <div className="field">
                <label>Název</label>
                <input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <div className="field">
                <label>Popis</label>
                <textarea
                  rows={3}
                  value={draft.description || ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>

              <div className="row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.visible_in_widget)}
                    onChange={(e) => setDraft({ ...draft, visible_in_widget: e.target.checked })}
                  />
                  <span>Visible in widget</span>
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.is_default_selected)}
                    onChange={(e) => setDraft({ ...draft, is_default_selected: e.target.checked })}
                  />
                  <span>Default selected</span>
                </label>
              </div>

              <div className="field small">
                <label>Pořadí ve widgetu</label>
                <input
                  type="number"
                  min={0}
                  value={Number.isFinite(Number(draft.order)) ? draft.order : 0}
                  onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })}
                />
              </div>

              <div className="hint">
                <div className="muted">Changes:</div>
                <b>{diffList.length}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="rightCol">
          <div className="tabs">
            <button className={`tab ${tab === 'diff' ? 'active' : ''}`} onClick={() => setTab('diff')}>
              Diff
            </button>
            <button className={`tab ${tab === 'raw' ? 'active' : ''}`} onClick={() => setTab('raw')}>
              Raw values
            </button>
            <button className={`tab ${tab === 'unknown' ? 'active' : ''}`} onClick={() => setTab('unknown')}>
              Unknown keys
            </button>
          </div>

          {tab === 'diff' && (
            <div className="card">
              <div className="card-title">Diff vs Admin defaults</div>
              {diffList.length === 0 ? (
                <div className="empty">
                  <p>Preset nemění žádné parametry oproti Admin defaultům.</p>
                </div>
              ) : (
                <div className="diff">
                  {diffList.map((row) => (
                    <div key={row.key} className="diff-row">
                      <div className="diff-key">
                        <div className="diff-label">{row.label}</div>
                        <div className="diff-sub">{row.key}</div>
                      </div>
                      <div className="diff-val">
                        <div className="before">
                          <span className="muted">Default:</span> <b>{String(row.before)}</b>
                        </div>
                        <div className="after">
                          <span className="muted">Preset:</span> <b>{String(row.after)}</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'raw' && (
            <div className="card">
              <div className="card-title">Raw values (mapped)</div>
              <div className="raw">
                {Object.keys(draft.values || {}).length === 0 ? (
                  <div className="empty">
                    <p>Preset neobsahuje žádné mapované parametry.</p>
                  </div>
                ) : (
                  <pre>{JSON.stringify(draft.values, null, 2)}</pre>
                )}
              </div>
            </div>
          )}

          {tab === 'unknown' && (
            <div className="card">
              <div className="card-title">Unknown keys</div>
              {draft.unknown_keys?.length ? (
                <div className="unknown">
                  <p className="muted">Tyto klíče z .ini nejsou v katalogu parametrů (zatím).</p>
                  <pre>{Object.entries(unknownPairs)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => `${k}=${v ?? ''}`)
                    .join('\n')}</pre>
                </div>
              ) : (
                <div className="empty">
                  <p>Žádné neznámé klíče 🎉</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

function computeDiffList(preset, adminDefaults, defsByKey, language) {
  const values = preset?.values || {};
  const list = [];
  for (const [k, v] of Object.entries(values)) {
    const before = adminDefaults[k];
    if (safeJsonEqual(v, before)) continue;
    const def = defsByKey[k];
    list.push({
      key: k,
      label: def ? getLabel(def, language) : k,
      before: before,
      after: v,
    });
  }
  // stable ordering
  list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  return list;
}

function ImportModal({ state, onClose, onChange, onImport }) {
  const mappedCount = Object.keys(state.mapped || {}).length;
  const unknownCount = state.unknown?.length || 0;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Import preset</div>
            <div className="modalSub">{state.filename}</div>
          </div>
          <button className="btn" onClick={onClose}>
            <Icon name="X" size={16} />
          </button>
        </div>

        <div className="modalBody">
          <div className="summary">
            <div className="pill">
              <span className="muted">Mapped</span> <b>{mappedCount}</b>
            </div>
            <div className="pill">
              <span className="muted">Unknown</span> <b>{unknownCount}</b>
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>Název</label>
              <input
                value={state.meta.name}
                onChange={(e) => onChange({ ...state, meta: { ...state.meta, name: e.target.value } })}
              />
            </div>
            <div className="field">
              <label>Pořadí</label>
              <input
                type="number"
                min={0}
                value={state.meta.order}
                onChange={(e) => onChange({ ...state, meta: { ...state.meta, order: Number(e.target.value) } })}
              />
            </div>
          </div>

          <div className="field">
            <label>Popis (volitelné)</label>
            <textarea
              rows={3}
              value={state.meta.description}
              onChange={(e) => onChange({ ...state, meta: { ...state.meta, description: e.target.value } })}
            />
          </div>

          <div className="row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={Boolean(state.meta.visible_in_widget)}
                onChange={(e) => onChange({ ...state, meta: { ...state.meta, visible_in_widget: e.target.checked } })}
              />
              <span>Visible in widget</span>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={Boolean(state.meta.is_default_selected)}
                onChange={(e) => onChange({ ...state, meta: { ...state.meta, is_default_selected: e.target.checked } })}
              />
              <span>Default selected</span>
            </label>
          </div>

          {unknownCount > 0 && (
            <div className="unknownBox">
              <div className="unknownTitle">Unknown keys (saved in RAW preset; not editable yet)</div>
              <div className="unknownList">
                {state.unknown.slice(0, 20).join(', ')}{state.unknown.length > 20 ? '…' : ''}
              </div>
            </div>
          )}
        </div>

        <div className="modalFooter">
          <button className="btn" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn btn-primary" onClick={onImport}>
            <Icon name="Save" size={16} />
            Importovat
          </button>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.page{display:flex;flex-direction:column;gap:16px}
.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.title{margin:0;font-size:28px;font-weight:700;color:#111}
.subtitle{margin:6px 0 0;color:#666;max-width:900px}
.right{display:flex;gap:10px;align-items:center;flex-wrap:wrap}

.toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between}
.search{display:flex;align-items:center;gap:8px;border:1px solid #e0e0e0;background:#fff;padding:10px 12px;border-radius:10px;min-width:320px}
.search input{border:none;outline:none;width:100%;font-size:14px}

.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:#fff;border:1px solid #e0e0e0;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.card-header{display:flex;justify-content:space-between;gap:12px}
.card-title{display:flex;align-items:center;gap:8px;font-weight:700;color:#111}
.card-desc{color:#666;font-size:13px;margin-top:6px}
.meta{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.meta-line{font-size:12px;color:#333}
.muted{color:#777}
.badge{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid transparent}
.badge-green{background:#e7f6ed;border-color:#b7e1c5;color:#166534}
.badge-blue{background:#e8f1ff;border-color:#c7dbff;color:#1e40af}

.card-actions{display:flex;gap:10px;flex-wrap:wrap}
.card-actions.second{margin-top:-4px}

.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;font-weight:600;color:#222}
.btn:hover{background:#f7f7f7}
.btn-primary{background:#1976d2;border-color:#1976d2;color:#fff}
.btn-primary:hover{background:#1565c0}
.btn-danger{background:#fff;border-color:#ef4444;color:#ef4444}
.btn-danger:hover{background:#fff5f5}
.disabled{opacity:.6;cursor:not-allowed}

.empty{background:#fff;border:1px dashed #d0d0d0;border-radius:14px;padding:20px}

.layout{display:grid;grid-template-columns:360px 1fr;gap:16px;align-items:start}
.left{position:sticky;top:84px}
.rightCol{display:flex;flex-direction:column;gap:12px}
.tabs{display:flex;gap:8px;flex-wrap:wrap}
.tab{padding:10px 12px;border-radius:10px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;font-weight:700}
.tab.active{background:#e3f2fd;border-color:#bbdefb;color:#1976d2}

.form{display:flex;flex-direction:column;gap:12px}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:12px;color:#555;font-weight:700}
.field input,.field textarea{border:1px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:14px}
.field.small{max-width:200px}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.toggle{display:flex;gap:10px;align-items:center;font-weight:700;color:#333}
.hint{display:flex;gap:10px;align-items:center;background:#f7f7f7;border:1px solid #eee;padding:10px 12px;border-radius:10px}

.diff{display:flex;flex-direction:column}
.diff-row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #f1f1f1}
.diff-row:first-child{border-top:none}
.diff-label{font-weight:800;color:#111}
.diff-sub{font-size:12px;color:#777;margin-top:4px}
.diff-val{display:flex;flex-direction:column;gap:4px;align-items:flex-end}

.raw pre,.unknown pre{white-space:pre-wrap;word-break:break-word;margin:0;background:#0b1020;color:#e6e9f2;padding:12px;border-radius:12px;border:1px solid #111}

.modalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px;z-index:999}
.modal{background:#fff;border-radius:14px;border:1px solid #e0e0e0;max-width:760px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.15)}
.modalHeader{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eee}
.modalTitle{font-size:18px;font-weight:800;color:#111}
.modalSub{font-size:12px;color:#666;margin-top:4px}
.modalBody{padding:16px;display:flex;flex-direction:column;gap:12px}
.modalFooter{padding:14px 16px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:10px}
.summary{display:flex;gap:10px;flex-wrap:wrap}
.pill{background:#f7f7f7;border:1px solid #eee;border-radius:999px;padding:6px 10px;font-size:12px}
.grid2{display:grid;grid-template-columns:1fr 180px;gap:12px}
.unknownBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px}
.unknownTitle{font-weight:900;color:#7c2d12}
.unknownList{color:#7c2d12;margin-top:6px;font-size:13px}

@media (max-width: 900px){
  .layout{grid-template-columns:1fr}
  .left{position:static}
  .search{min-width:0;width:100%}
}
`;