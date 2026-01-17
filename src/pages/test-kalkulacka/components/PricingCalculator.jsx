import React from 'react';
import Icon from '../../../components/AppIcon';
import { BarLoader } from 'react-spinners';
import GenerateButton from './GenerateButton';

// --- Demo pricing constants (orientačně) ---
const PRICE_PER_HOUR = 75; // CZK / hour
const PRICE_PER_GRAM_PLA = 2.0; // CZK / gram

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '-');

const formatHMS = (totalSeconds) => {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const formatCzk = (value) => {
  const n = Number(value) || 0;
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
};

const ellipsizePath = (p) => {
  if (!p || typeof p !== 'string') return '-';
  if (p.length <= 42) return p;
  return `${p.slice(0, 18)}…${p.slice(-18)}`;
};

const PricingCalculator = ({ selectedFile, onSlice }) => {

  // --- Initial State: No file selected ---
  if (!selectedFile) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="Calculator" size={24} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Kalkulace ceny</h3>
        <p className="text-sm text-muted-foreground">
          Vyberte nahraný model pro zobrazení detailů a ceny tisku.
        </p>
      </div>
    );
  }

  const { status, result, error } = selectedFile;

  // --- Loading State: Pending or Processing ---
  if (status === 'processing') {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Icon name="Loader" size={24} className="text-primary mx-auto mb-4 animate-spin" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Probíhá slicování…</h3>
        <p className="text-sm text-muted-foreground mb-6">Zpracovávám váš model. To může trvat několik sekund.</p>
        <BarLoader color="hsl(var(--primary))" width="100%" />
      </div>
    );
  }

  // --- Error State: Slicing Failed ---
  if (status === 'failed') {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-8 text-center">
        <Icon name="XCircle" size={24} className="text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-destructive mb-2">Výpočet se nezdařil</h3>
        <p className="text-sm text-destructive/80 mb-6">{error || "Došlo k neznámé chybě."}</p>
        {typeof onSlice === 'function' && (
          <div className="flex justify-center">
            <GenerateButton label="Spočítat cenu" onClick={onSlice} />
          </div>
        )}
      </div>
    );
  }

  // --- Pending state: show CTA to run slicing ---
  if (status === 'pending') {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">Metriky ze sliceru</h3>
        <p className="text-sm text-muted-foreground mb-6">Zdroj: backend-local (/api/slice) + PrusaSlicer CLI</p>

        <div className="bg-muted/40 border border-border rounded-lg p-4 text-sm text-muted-foreground">
          Klikni na <strong>Spočítat cenu</strong> pro odeslání modelu na lokální backend.
        </div>

        {typeof onSlice === 'function' && (
          <div className="mt-6 flex justify-end">
            <GenerateButton label="Spočítat cenu" onClick={onSlice} />
          </div>
        )}
      </div>
    );
  }

  // --- Success State: slicing completed ---
  if (status === 'completed' && result) {
    const metrics = result.metrics || {};
    const modelInfo = result.modelInfo || {};
    const sizeMm = modelInfo.sizeMm || {};

    const t = Number(metrics.estimatedTimeSeconds) || 0;
    const grams = Number(metrics.filamentGrams) || 0;
    const mm = Number(metrics.filamentMm) || 0;
    const volMm3 = Number(modelInfo.volumeMm3) || 0;
    const volCm3 = volMm3 ? (volMm3 / 1000) : 0;

    const materialCost = grams * PRICE_PER_GRAM_PLA;
    const printingCost = (t / 3600) * PRICE_PER_HOUR;
    const total = materialCost + printingCost;

    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">Metriky ze sliceru</h3>
        <p className="text-sm text-muted-foreground mb-6">Zdroj: backend-local (/api/slice) + PrusaSlicer CLI</p>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center"><Icon name="Clock" className="mr-2" size={14}/>Odhadovaný čas tisku</span>
            <span className="font-semibold text-foreground tabular-nums">{t ? formatHMS(t) : '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center"><Icon name="Database" className="mr-2" size={14}/>Filament</span>
            <span className="font-semibold text-foreground tabular-nums">{grams ? `${grams.toFixed(1)} g` : '-'}{mm ? ` (${Math.round(mm)} mm)` : ''}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center"><Icon name="Ruler" className="mr-2" size={14}/>Rozměry (X/Y/Z)</span>
            <span className="font-semibold text-foreground tabular-nums">{Number.isFinite(sizeMm.x) ? `${fmt(sizeMm.x, 2)} × ${fmt(sizeMm.y, 2)} × ${fmt(sizeMm.z, 2)} mm` : '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center"><Icon name="HelpCircle" className="mr-2" size={14}/>Objem</span>
            <span className="font-semibold text-foreground tabular-nums">{volCm3 ? `${volCm3.toFixed(2)} cm³` : '-'}</span>
          </div>
        </div>

        <div className="border-t border-border my-6" />

        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-[90px_1fr] gap-3 items-center">
            <span className="text-muted-foreground">Job ID</span>
            <span className="font-mono text-foreground truncate" title={result.jobId || ''}>{result.jobId || '-'}</span>
          </div>
          <div className="grid grid-cols-[90px_1fr] gap-3 items-center">
            <span className="text-muted-foreground">out.gcode</span>
            <span className="font-mono text-foreground truncate" title={result.outGcodePath || ''}>{ellipsizePath(result.outGcodePath)}</span>
          </div>
          <div className="grid grid-cols-[90px_1fr] gap-3 items-center">
            <span className="text-muted-foreground">jobDir</span>
            <span className="font-mono text-foreground truncate" title={result.jobDir || ''}>{ellipsizePath(result.jobDir)}</span>
          </div>
        </div>

        <div className="border-t border-border mt-6 pt-6">
          <p className="text-xs text-muted-foreground mb-2">Demo cena (orientačně)</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Materiál</span>
              <span className="text-foreground">{formatCzk(materialCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Čas tiskárny</span>
              <span className="text-foreground">{formatCzk(printingCost)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-foreground">Celkem</span>
              <span className="text-foreground">{formatCzk(total)}</span>
            </div>
          </div>

          {typeof onSlice === 'function' && (
            <div className="mt-6 flex justify-end">
              <GenerateButton label="Spočítat cenu" onClick={onSlice} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Fallback state, should not be reached ---
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">Nastal neočekávaný stav.</p>
    </div>
  );
};

export default PricingCalculator;
