// src/pages/test-kalkulacka/index.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import FileUploadZone from './components/FileUploadZone';
import ModelViewer from './components/ModelViewer';
import PrintConfiguration from './components/PrintConfiguration';
import PricingCalculator from './components/PricingCalculator';
import GenerateButton from './components/GenerateButton';
import ErrorBoundary from './components/ErrorBoundary';
import { sliceModelLocal } from '../../services/slicerApi';

const TestKalkulacka = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [printConfigs, setPrintConfigs] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [sliceAllProcessing, setSliceAllProcessing] = useState(false);

  const selectedFile = selectedFileId
    ? (uploadedFiles.find(f => f.id === selectedFileId) || null)
    : null;

  const updateModelStatus = useCallback((modelId, newProps) => {
    setUploadedFiles(prevFiles =>
      prevFiles.map(file => (file.id === modelId ? { ...file, ...newProps } : file))
    );
  }, []);

  const handleConfigChange = (newConfig) => {
    if (selectedFile) {
      setPrintConfigs(prev => ({ ...prev, [selectedFile.id]: newConfig }));
      updateModelStatus(selectedFile.id, { status: 'pending', result: null, error: null });
    }
  };

  const steps = [
    { id: 1, title: 'Nahrání souborů', icon: 'Upload', description: 'Nahrajte 3D modely' },
    { id: 2, title: 'Konfigurace', icon: 'Settings', description: 'Nastavte parametry tisku' },
    { id: 3, title: 'Kontrola a cena', icon: 'Calculator', description: 'Zkontrolujte objednávku' }
  ];

  useEffect(() => {
    if (uploadedFiles.length === 0) {
      if (selectedFileId !== null) setSelectedFileId(null);
      return;
    }
    // If nothing selected (or selected file was deleted), select the first one.
    const exists = selectedFileId !== null && uploadedFiles.some(f => f.id === selectedFileId);
    if (!exists) setSelectedFileId(uploadedFiles[0].id);
  }, [uploadedFiles, selectedFileId]);

  useEffect(() => {
    if (selectedFile && !printConfigs[selectedFile.id]) {
      const defaultConfig = {
        material: 'pla',
        quality: 'standard',
        infill: 20,
        quantity: 1,
        postProcessing: [],
        expressDelivery: false,
        supports: false,
      };
      handleConfigChange(defaultConfig);
    }
  }, [selectedFile, printConfigs, handleConfigChange]);

  useEffect(() => {
    if (uploadedFiles.length > 0 && currentStep === 1) {
      const t = setTimeout(() => setCurrentStep(2), 1000);
      return () => clearTimeout(t);
    }
  }, [uploadedFiles, currentStep]);

  const handleSliceSelected = useCallback(async () => {
    if (!selectedFile) return;

    const cfg = printConfigs[selectedFile.id] || {};
    if (selectedFile.status === 'processing') return;

    try {
      updateModelStatus(selectedFile.id, { status: 'processing', error: null });

      console.log('[test-kalkulacka] Slicing (local) file:', selectedFile.name, 'config:', cfg);

      const res = await sliceModelLocal(selectedFile.file);
      const ok = (res?.ok ?? res?.success ?? true);
      if (!ok) throw new Error(res?.error || res?.message || 'Slicování selhalo');

      updateModelStatus(selectedFile.id, {
        status: 'completed',
        result: res,
        error: null,
      });

      // After successful slice, it's useful to show the price step.
      if (currentStep < 3) setCurrentStep(3);
    } catch (err) {
      console.error('[test-kalkulacka] Slice failed:', err);
      updateModelStatus(selectedFile.id, {
        status: 'failed',
        error: String(err?.message || err),
      });
    }
  }, [selectedFile, printConfigs, updateModelStatus, currentStep]);

  const handleSliceAll = useCallback(async () => {
    if (uploadedFiles.length === 0) return;
    if (sliceAllProcessing) return;

    // Work on a snapshot to avoid issues if the user clicks around while batching.
    const filesSnapshot = [...uploadedFiles];

    setSliceAllProcessing(true);
    try {
      if (currentStep < 3) setCurrentStep(3);

      for (const fileItem of filesSnapshot) {
        // Skip already sliced models (saves time). You can reslice individually.
        if (fileItem.status === 'completed' && fileItem.result) continue;
        if (!fileItem.file) continue;

        try {
          updateModelStatus(fileItem.id, { status: 'processing', error: null });
          console.log('[test-kalkulacka] Batch slicing (local):', fileItem.name);

          const res = await sliceModelLocal(fileItem.file);
          const ok = (res?.ok ?? res?.success ?? true);
          if (!ok) throw new Error(res?.error || res?.message || 'Slicování selhalo');

          updateModelStatus(fileItem.id, {
            status: 'completed',
            result: res,
            error: null,
          });
        } catch (err) {
          console.error('[test-kalkulacka] Batch slice failed:', fileItem.name, err);
          updateModelStatus(fileItem.id, {
            status: 'failed',
            error: String(err?.message || err),
          });
        }
      }
    } finally {
      setSliceAllProcessing(false);
    }
  }, [uploadedFiles, sliceAllProcessing, printConfigs, updateModelStatus, currentStep]);

  const handleFilesUploaded = (uploadedItem) => {
    const fileToProcess = uploadedItem.file instanceof File ? uploadedItem.file : uploadedItem;
    if (!(fileToProcess instanceof File)) return;

    if (!uploadedFiles.some(file => file.name === fileToProcess.name)) {
      const modelObject = {
        id: Date.now() + Math.random(),
        name: fileToProcess.name,
        size: fileToProcess.size,
        type: fileToProcess.type,
        file: fileToProcess,
        uploadedAt: new Date(),
        status: 'pending',
        result: null,
        error: null,
      };
      setUploadedFiles(prev => [...prev, modelObject]);
    }
  };

  const handleAddModelClick = () => fileInputRef.current?.click();

  const handleResetUpload = () => {
    setUploadedFiles([]);
    setSelectedFileId(null);
    setPrintConfigs({});
    setCurrentStep(1);
  };

  const handleFileDelete = (fileToDelete) => {
    const newUploadedFiles = uploadedFiles.filter(file => file.id !== fileToDelete.id);
    const newPrintConfigs = { ...printConfigs };
    delete newPrintConfigs[fileToDelete.id];

    setUploadedFiles(newUploadedFiles);
    setPrintConfigs(newPrintConfigs);

    if (selectedFileId !== null && selectedFileId === fileToDelete.id) {
      setSelectedFileId(newUploadedFiles.length > 0 ? newUploadedFiles[0].id : null);
    }
    if (newUploadedFiles.length === 0) {
      handleResetUpload();
    }
  };

  const handleNextStep = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handlePrevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleProceedToCheckout = async () => {
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    navigate('/printer-catalog', { state: { uploadedFiles, printConfigs, fromUpload: true } });
  };

  const currentConfig = selectedFile ? (printConfigs[selectedFile.id] || {}) : {};

  const canProceed = () => {
    switch (currentStep) {
      case 1: return uploadedFiles.length > 0;
      case 2: return !!currentConfig && !!selectedFile;
      case 3: return uploadedFiles.every(f => f.status === 'completed');
      default: return false;
    }
  };

  const statusTooltips = {
    pending: 'Čeká na zpracování',
    processing: 'Výpočet...',
    completed: 'Hotovo',
    failed: 'Výpočet se nezdařil'
  };

  return (
    <div className="min-h-screen bg-background">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          files.forEach(file => handleFilesUploaded({ file }));
        }}
        style={{ display: 'none' }}
        multiple
        accept=".stl,.obj,.3mf"
      />

      <div>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
              <button onClick={() => navigate('/customer-dashboard')} className="hover:text-foreground transition-colors">
                Dashboard
              </button>
              <Icon name="ChevronRight" size={16} />
              <span className="text-foreground">Nahrání modelu</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Nahrání 3D modelu</h1>
            <p className="text-muted-foreground">
              Nahrajte své 3D modely a nakonfigurujte parametry tisku.
            </p>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between max-w-2xl">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${currentStep >= step.id
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border text-muted-foreground'
                        }`}
                    >
                      <Icon name={step.icon} size={20} />
                    </div>
                    <div className="mt-2 text-center">
                      <p
                        className={`text-sm font-medium ${currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-24 h-0.5 mx-4 transition-colors ${currentStep > step.id ? 'bg-primary' : 'bg-border'
                        }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {uploadedFiles.length === 0 && currentStep === 1 && (
                <FileUploadZone onFilesUploaded={handleFilesUploaded} />
              )}

              {uploadedFiles.length > 0 && (
                <>
                  {/* CTA: Spočítat cenu (Slice) */}
                  {selectedFile && (
                    <div className="mt-6 flex justify-center">
                      <GenerateButton
                        label="Spočítat cenu"
                        onClick={handleSliceSelected}
                        loading={selectedFile.status === 'processing'}
                        disabled={!selectedFile || selectedFile.status === 'processing'}
                      />
                    </div>
                  )}

                  {/* Keep the left configuration visible even on step 3 (after slicing) */}
                  <div className={selectedFile ? 'block' : 'hidden'}>
                    <PrintConfiguration
                      key={selectedFile ? selectedFile.id : 'empty'}
                      selectedFile={selectedFile}
                      onConfigChange={handleConfigChange}
                      initialConfig={currentConfig}
                      disabled={uploadedFiles.some(f => f.status === 'processing')}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-6">
              <ErrorBoundary>
                <ModelViewer selectedFile={selectedFile} onRemove={handleFileDelete} />
              </ErrorBoundary>
              {/* Metrics + price card (right column) */}
              {uploadedFiles.length > 0 && (
                <PricingCalculator
                  selectedFile={selectedFile}
                  onSlice={handleSliceSelected}
                  totalModels={uploadedFiles.length}
                  onSliceAll={handleSliceAll}
                  sliceAllLoading={sliceAllProcessing}
                />
              )}
              {uploadedFiles.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">Nahrané modely</h3>
                    <Button variant="ghost" size="icon" onClick={handleAddModelClick}>
                      <Icon name="Plus" size={16} />
                      <span className="sr-only">Přidání Modelu</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {uploadedFiles.map((file) => (
                      <Button
                        key={file.id}
                        variant={selectedFile && selectedFile.id === file.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedFileId(file.id)}
                        className="w-full justify-start text-left h-auto py-2 px-3"
                        title={statusTooltips[file.status] || 'Neznámý stav'}
                      >
                        <div className="flex items-center gap-2 w-full">
                          {file.status === 'processing' && (
                            <Icon name="Loader" size={14} className="animate-spin flex-shrink-0" />
                          )}
                          {file.status === 'pending' && <Icon name="Clock" size={14} className="flex-shrink-0" />}
                          {file.status === 'completed' && (
                            <Icon name="CheckCircle" size={14} className="text-green-500 flex-shrink-0" />
                          )}
                          {file.status === 'failed' && (
                            <Icon name="XCircle" size={14} className="text-red-500 flex-shrink-0" />
                          )}
                          <span className="truncate flex-grow text-left">{file.name}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="outline"
              onClick={handlePrevStep}
              disabled={currentStep === 1}
              iconName="ChevronLeft"
              iconPosition="left"
            >
              Zpět
            </Button>
            <div className="flex items-center space-x-4">
              {currentStep < 3 ? (
                <Button
                  variant="default"
                  onClick={handleNextStep}
                  disabled={!canProceed()}
                  iconName="ChevronRight"
                  iconPosition="right"
                >
                  Pokračovat
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={handleProceedToCheckout}
                  disabled={!canProceed() || isProcessing}
                  loading={isProcessing}
                  iconName="ArrowRight"
                  iconPosition="right"
                >
                  {isProcessing ? 'Zpracovávám...' : 'Přejít k výběru tiskárny'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestKalkulacka;
