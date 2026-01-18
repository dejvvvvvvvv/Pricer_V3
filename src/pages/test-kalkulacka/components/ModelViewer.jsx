import React, { useEffect, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import ErrorBoundary from './ErrorBoundary';

function STLModel({ url }) {
  const geometry = useLoader(STLLoader, url);

  // Center geometry (cheap & safe) – prevents model being out of view.
  useMemo(() => {
    if (!geometry) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#1E90FF" metalness={0.1} roughness={0.5} />
    </mesh>
  );
}

function STLCanvas({ file }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    };
  }, [url]);

  return (
    <div className="w-full h-full bg-muted/30 rounded-xl overflow-hidden">
      <Canvas camera={{ position: [0, 0, 100], fov: 50 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} />
        <STLModel url={url} />
        <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}

function formatDuration(totalSeconds) {
  const s = Number(totalSeconds);
  if (!Number.isFinite(s) || s <= 0) return '-';
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  let out = '';
  if (hours > 0) out += `${hours}h `;
  out += `${minutes}m`;
  return out.trim();
}

/**
 * Stabilnější (lehčí) 3D viewer pro /test-kalkulacka.
 * - žádné výpočty objemu v prohlížeči (to dělá backend slicer)
 * - guard na velké soubory + nepodporované formáty
 * - ErrorBoundary kolem Canvas, aby stránka nespadla (white-screen)
 */
const ModelViewer = ({ selectedFile, onRemove }) => {
  if (!selectedFile) {
    return (
      <div className="bg-card border border-border rounded-xl aspect-square flex flex-col items-center justify-center p-4 text-center">
        <div className="space-y-4">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Icon name="Scan" size={40} className="text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground">Náhled modelu</h3>
          <p className="text-sm text-muted-foreground">
            Po nahrání souboru se zde zobrazí náhled a metriky ze sliceru.
          </p>
        </div>
      </div>
    );
  }

  const fileObj = selectedFile.file instanceof File ? selectedFile.file : null;
  const ext = String(selectedFile?.name || '').split('.').pop()?.toLowerCase();
  const sizeMb = (selectedFile?.size || fileObj?.size || 0) / (1024 * 1024);

  // Safety thresholds (stability > fancy preview)
  const tooLargeForPreview = sizeMb > 12;
  const previewSupported = ext === 'stl';

  const metrics = selectedFile?.result?.metrics;
  const modelInfo = selectedFile?.result?.modelInfo;

  const dims = modelInfo?.sizeMm;
  const volumeMm3 = modelInfo?.volumeMm3;
  const volumeCm3 = typeof volumeMm3 === 'number' ? volumeMm3 / 1000 : null;

  return (
    <div className="relative bg-card border border-border rounded-xl aspect-square flex flex-col p-2">
      <div className="absolute top-2 right-2 z-10 flex space-x-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove?.(selectedFile)}
          aria-label="Odstranit model"
        >
          <Icon name="X" size={16} />
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <ErrorBoundary>
          {(!fileObj || !previewSupported) ? (
            <div className="w-full h-full bg-muted/30 rounded-xl flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
              Náhled je dostupný jen pro STL soubory.
              <br />
              Pro data použijte „Metriky ze sliceru“.
            </div>
          ) : tooLargeForPreview ? (
            <div className="w-full h-full bg-muted/30 rounded-xl flex items-center justify-center p-4 text-sm text-muted-foreground text-center">
              Náhled je vypnutý (velký soubor ~{sizeMb.toFixed(1)} MB).
              <br />
              Pro data použijte „Metriky ze sliceru“.
            </div>
          ) : (
            <STLCanvas file={fileObj} />
          )}
        </ErrorBoundary>
      </div>

      <div className="mt-2 p-3 bg-card/80 backdrop-blur-sm rounded-xl border border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-foreground truncate" title={selectedFile.name}>
            {selectedFile.name}
          </p>
          <p className="text-xs text-muted-foreground whitespace-nowrap pl-2">
            {sizeMb > 0 ? `${sizeMb.toFixed(2)} MB` : ''}
          </p>
        </div>

        {/* Backend metrics */}
        {(dims?.x || dims?.y || dims?.z || volumeCm3 != null || metrics) && (
          <div className="space-y-2">
            {(dims?.x || dims?.y || dims?.z || volumeCm3 != null) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="text-muted-foreground">Rozměry:</div>
                <div className="text-foreground">
                  {Number(dims?.x || 0).toFixed(2)} × {Number(dims?.y || 0).toFixed(2)} × {Number(dims?.z || 0).toFixed(2)} mm
                </div>
                {volumeCm3 != null && (
                  <>
                    <div className="text-muted-foreground">Objem:</div>
                    <div className="text-foreground">{volumeCm3.toFixed(2)} cm³</div>
                  </>
                )}
              </div>
            )}

            {metrics && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="font-bold text-foreground">{formatDuration(metrics?.estimatedTimeSeconds)}</p>
                  <p className="text-muted-foreground">Čas tisku</p>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="font-bold text-foreground">
                    {Number.isFinite(Number(metrics?.filamentGrams)) ? `${Number(metrics.filamentGrams).toFixed(1)} g` : '-'}
                  </p>
                  <p className="text-muted-foreground">Materiál</p>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedFile?.status === 'failed' && selectedFile?.error && (
          <div className="mt-2 text-xs text-destructive">
            {selectedFile.error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelViewer;
