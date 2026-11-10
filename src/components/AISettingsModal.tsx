import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../services/themeService';
import {
  getAISettings,
  saveAISettings,
  resetAISettingsToDefault,
  testAIConnection,
  AI_PRESETS,
  type AISettings,
  type AIPreset,
  getOllamaApiKey,
  getPresetApiKey,
  savePresetApiKey,
  normalizeOpenAIBaseUrl,
  getOralAISettings,
} from '../services/aiService';
import { validateBaseUrl, validateOralApiKey } from '../utils/validation';
import {
  Bot,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Radio,
  ShieldCheck,
  RefreshCw,
  Cpu,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import { authService } from '../services/authService';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

type ConfigArea = 'general' | 'oral';

function isLocalUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function detectGeneralPresetId(baseUrl?: string): string {
  const clean = normalizeOpenAIBaseUrl(baseUrl || '').toLowerCase();
  if (!clean || clean.includes('ollama.com')) return 'ollama-cloud';
  if (isLocalUrl(clean) || clean.includes(':11434')) return 'ollama-local';
  if (clean.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (clean.includes('api.cerebras.ai')) return 'cerebras';
  if (clean.includes('api.mistral.ai')) return 'mistral';
  if (clean.includes('api.groq.com')) return 'groq-general';
  if (clean.includes('openrouter.ai')) return 'openrouter';
  return 'custom';
}

function buildFormSnapshot(area: ConfigArea, presetId: string, s: AISettings): string {
  return JSON.stringify({
    area,
    presetId,
    apiKey: s.apiKey || '',
    baseUrl: normalizeOpenAIBaseUrl(s.baseUrl || ''),
    model: (s.model || '').trim(),
  });
}

function resolvePresetSavedKey(preset: AIPreset, savedGeneral: AISettings): string {
  if (preset.role === 'oral') {
    return getOralAISettings().apiKey || '';
  }
  const perPresetKey = getPresetApiKey(preset.id);
  if (perPresetKey) return perPresetKey;

  if (
    normalizeOpenAIBaseUrl(savedGeneral.baseUrl) === normalizeOpenAIBaseUrl(preset.baseUrl) &&
    savedGeneral.apiKey
  ) {
    return savedGeneral.apiKey;
  }

  if (preset.id === 'ollama-cloud') {
    return getOllamaApiKey() || '';
  }

  return '';
}

function getProviderDisplayName(presetId: string, baseUrl: string, area: ConfigArea): string {
  if (area === 'oral') {
    if (baseUrl.includes('x.ai') || baseUrl.includes('grok.com')) return 'xAI Grok (Motor Oral)';
    return 'Groq Cloud (Motor Oral)';
  }
  const preset = AI_PRESETS.find(p => p.id === presetId);
  if (preset) return preset.name;
  return 'Proveedor OpenAI-Compatible';
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isKitty = theme === 'kitty';

  const [configArea, setConfigArea] = useState<ConfigArea>('general');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('gemini');
  const [settings, setSettings] = useState<AISettings>(getAISettings);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    models?: string[];
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const initialFormSnapshotRef = useRef<string>('');
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const generalPresets = useMemo(
    () => AI_PRESETS.filter(p => (p.role || 'general') === 'general'),
    []
  );
  const oralPreset = useMemo(
    () => AI_PRESETS.find(p => p.role === 'oral') || AI_PRESETS[AI_PRESETS.length - 1],
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    setTestResult(null);
    setIsSaved(false);
    setShowKey(false);

    const currentGeneral = getAISettings();
    const detectedId = detectGeneralPresetId(currentGeneral.baseUrl);
    if (currentGeneral.apiKey && detectedId !== 'custom') {
      savePresetApiKey(detectedId, currentGeneral.apiKey);
    }

    setConfigArea('general');
    setSelectedPresetId(detectedId);
    setSettings(currentGeneral);
    initialFormSnapshotRef.current = buildFormSnapshot('general', detectedId, currentGeneral);
  }, [isOpen]);

  const isLocalProvider = useMemo(
    () => configArea === 'general' && isLocalUrl(settings.baseUrl),
    [configArea, settings.baseUrl]
  );

  const urlValidation = useMemo(
    () => validateBaseUrl(settings.baseUrl || ''),
    [settings.baseUrl]
  );

  const keyValidation = useMemo(() => {
    const cleanKey = settings.apiKey?.trim() || '';
    if (configArea === 'oral') {
      return validateOralApiKey(cleanKey, false);
    }
    if (!isLocalProvider && !cleanKey) {
      return { isValid: false, error: 'Ingresa tu API Key para conectar con este proveedor.' };
    }
    return { isValid: true };
  }, [configArea, isLocalProvider, settings.apiKey]);

  const modelValidation = useMemo(() => {
    if (!settings.model || !settings.model.trim()) {
      return { isValid: false, error: 'El nombre del modelo LLM no puede estar vacío.' };
    }
    return { isValid: true };
  }, [settings.model]);

  const isFormValid = urlValidation.isValid && keyValidation.isValid && modelValidation.isValid;

  const persistProviderConfiguration = (nextSettings: AISettings, area: ConfigArea, presetId: string): AISettings => {
    const normalizedSettings: AISettings = {
      ...nextSettings,
      baseUrl: normalizeOpenAIBaseUrl(nextSettings.baseUrl || ''),
      apiKey: (nextSettings.apiKey || '').trim(),
      model: (nextSettings.model || '').trim(),
      provider: isLocalUrl(nextSettings.baseUrl) ? 'ollama' : 'openai-compatible',
    };

    if (presetId !== 'custom') {
      savePresetApiKey(presetId, normalizedSettings.apiKey);
    }
    saveAISettings(normalizedSettings, area);

    const refreshedGeneral = getAISettings();
    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, refreshedGeneral);
    }
    return refreshedGeneral;
  };

  // Auto-prueba silenciosa tras ingresar credenciales válidas
  useEffect(() => {
    if (!isOpen || !isFormValid) return;

    const cleanKey = settings.apiKey?.trim() || '';
    if (!cleanKey && !isLocalProvider) {
      return;
    }

    if (cleanKey.length < 4 && !isLocalProvider) {
      return;
    }

    let cancelled = false;
    const targetSettings = { ...settings };
    const targetArea = configArea;
    const targetPreset = selectedPresetId;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setIsTesting(true);
      try {
        const res = await testAIConnection(targetSettings);
        if (cancelled) return;
        setTestResult(res);
        if (res.success) {
          const verifiedSettings: AISettings = { ...targetSettings, verified: true };
          setSettings(verifiedSettings);
          persistProviderConfiguration(verifiedSettings, targetArea, targetPreset);
          initialFormSnapshotRef.current = buildFormSnapshot(targetArea, targetPreset, verifiedSettings);
        } else {
          setSettings(prev => ({ ...prev, verified: false }));
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Error al conectar con el proveedor.';
        setTestResult({ success: false, message: msg });
        setSettings(prev => ({ ...prev, verified: false }));
      } finally {
        if (!cancelled) setIsTesting(false);
      }
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isOpen,
    configArea,
    selectedPresetId,
    settings.apiKey,
    settings.baseUrl,
    settings.model,
    isLocalProvider,
    isFormValid,
  ]);

  const handleTestConnection = async () => {
    if (!urlValidation.isValid) {
      setTestResult({ success: false, message: urlValidation.error || 'URL inválida.' });
      return;
    }
    if (!keyValidation.isValid) {
      setTestResult({ success: false, message: keyValidation.error || 'API Key inválida.' });
      return;
    }
    if (!modelValidation.isValid) {
      setTestResult({ success: false, message: modelValidation.error || 'Nombre de modelo requerido.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testAIConnection(settings);
      setTestResult(res);
      if (res.success) {
        const verifiedSettings: AISettings = { ...settings, verified: true };
        setSettings(verifiedSettings);
        persistProviderConfiguration(verifiedSettings, configArea, selectedPresetId);
        initialFormSnapshotRef.current = buildFormSnapshot(configArea, selectedPresetId, verifiedSettings);
      } else {
        setSettings(prev => ({ ...prev, verified: false }));
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetDefaults = () => {
    resetAISettingsToDefault();
    const defaults = getAISettings();
    const detected = detectGeneralPresetId(defaults.baseUrl);
    setConfigArea('general');
    setSelectedPresetId(detected);
    setSettings(defaults);
    setTestResult(null);
    initialFormSnapshotRef.current = buildFormSnapshot('general', detected, defaults);
    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, defaults);
    }
    if (onSettingsSaved) onSettingsSaved();
  };

  const handleClose = () => {
    const currentSnapshot = buildFormSnapshot(configArea, selectedPresetId, settings);
    if (currentSnapshot !== initialFormSnapshotRef.current && isFormValid) {
      const updatedGeneral = persistProviderConfiguration(settings, configArea, selectedPresetId);
      googleDriveService.syncAISettingsToDrive(updatedGeneral).catch(console.warn);
      if (onSettingsSaved) onSettingsSaved();
    }
    onClose();
  };

  const handleSave = () => {
    if (!isFormValid) return;

    const updatedGeneral = persistProviderConfiguration(settings, configArea, selectedPresetId);
    initialFormSnapshotRef.current = buildFormSnapshot(configArea, selectedPresetId, settings);

    googleDriveService.syncAISettingsToDrive(updatedGeneral).catch(err => {
      console.warn('[AISettingsModal] Error al respaldar IA en Google Drive:', err);
    });

    setIsSaved(true);
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 350);
  };

  const switchConfigArea = (nextArea: ConfigArea) => {
    if (nextArea === configArea) return;
    if (selectedPresetId !== 'custom' && settings.apiKey?.trim()) {
      savePresetApiKey(selectedPresetId, settings.apiKey);
    }

    setTestResult(null);
    if (nextArea === 'oral') {
      const oral = getOralAISettings();
      setConfigArea('oral');
      setSelectedPresetId('groq');
      setSettings(oral);
      initialFormSnapshotRef.current = buildFormSnapshot('oral', 'groq', oral);
      return;
    }

    const general = getAISettings();
    const detected = detectGeneralPresetId(general.baseUrl);
    setConfigArea('general');
    setSelectedPresetId(detected);
    setSettings(general);
    initialFormSnapshotRef.current = buildFormSnapshot('general', detected, general);
  };

  const applyPreset = (preset: AIPreset) => {
    if (selectedPresetId !== 'custom' && settings.apiKey !== undefined) {
      savePresetApiKey(selectedPresetId, settings.apiKey);
    }

    const savedGeneral = getAISettings();
    const savedKey = resolvePresetSavedKey(preset, savedGeneral);
    const sameBaseAsSaved =
      preset.role !== 'oral' &&
      normalizeOpenAIBaseUrl(savedGeneral.baseUrl) === normalizeOpenAIBaseUrl(preset.baseUrl);

    const nextModel = sameBaseAsSaved && savedGeneral.model
      ? savedGeneral.model
      : preset.model;

    setConfigArea(preset.role === 'oral' ? 'oral' : 'general');
    setSelectedPresetId(preset.id);
    setSettings(prev => ({
      ...prev,
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      model: nextModel,
      apiKey: savedKey,
      verified: Boolean(savedKey.trim().length > 0 || isLocalUrl(preset.baseUrl)),
    }));
    setTestResult(null);
  };

  const activePreset = AI_PRESETS.find(p => p.id === selectedPresetId);
  const providerDisplayName = getProviderDisplayName(selectedPresetId, settings.baseUrl || '', configArea);

  const modelChoices = useMemo(() => {
    const combined = [
      ...(activePreset?.suggestedModels || []),
      ...(testResult?.models || []),
    ].map(m => m.trim()).filter(Boolean);
    return Array.from(new Set(combined)).slice(0, 8);
  }, [activePreset, testResult]);

  if (!isOpen || typeof document === 'undefined') return null;

  const mutedText = isDark ? 'text-zinc-400' : isKitty ? 'text-pink-900/70' : 'text-slate-500';
  const strongText = isDark ? 'text-white' : 'text-zinc-950';
  const labelText = isDark ? 'text-zinc-300' : 'text-slate-700';
  const inputSurface = isDark
    ? 'bg-black/40 text-white placeholder:text-zinc-500'
    : isKitty
    ? 'bg-white text-zinc-950 placeholder:text-pink-300'
    : 'bg-white text-zinc-950 placeholder:text-slate-400';
  const inputBorder = (valid: boolean) => !valid
    ? 'border-rose-500 focus:border-rose-500'
    : isDark
    ? 'border-white/10 focus:border-violet-400'
    : isKitty
    ? 'border-pink-200 focus:border-pink-500'
    : 'border-slate-300 focus:border-violet-600';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-modal-backdrop">
      <div className={`border rounded-2xl sm:rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col animate-modal-card ${
        isDark
          ? 'bg-[#0e0b16] border-white/10 text-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : isKitty
          ? 'bg-white border-pink-200 text-zinc-950 shadow-pink-200/40'
          : 'bg-white border-slate-200 text-zinc-950 shadow-slate-300/60'
      }`}>

        {/* Header */}
        <div className={`flex items-center justify-between mb-4 pb-3 border-b shrink-0 ${
          isDark ? 'border-white/[0.07]' : isKitty ? 'border-pink-100' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isKitty
                ? 'bg-pink-100 border-pink-200 text-pink-600'
                : !isDark
                ? 'bg-violet-50 border-violet-200 text-violet-600'
                : 'bg-white/[0.04] border-white/10 text-zinc-200'
            }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`text-base sm:text-lg font-bold tracking-tight ${strongText}`}>
                  Motor de Inteligencia Artificial
                </h2>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-white/[0.05] text-zinc-200 border-white/10'
                    : isKitty
                    ? 'bg-pink-50 text-pink-800 border-pink-200'
                    : 'bg-slate-100 text-slate-800 border-slate-200'
                }`}>
                  {providerDisplayName}
                </span>
              </div>
              <p className={`text-xs truncate ${mutedText}`}>
                Elige un proveedor gratuito con mayor límite diario o ejecuta Ollama Local sin límite de tokens
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar configuración de IA"
            className={`p-2 rounded-xl transition-[background-color,color,transform] duration-150 cursor-pointer active:scale-95 ${
              isDark
                ? 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                : 'text-slate-500 hover:text-zinc-950 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Area Tabs */}
        <div className={`grid grid-cols-2 gap-2 p-1 rounded-2xl border mb-4 shrink-0 ${
          isDark
            ? 'bg-white/[0.03] border-white/[0.08]'
            : isKitty
            ? 'bg-pink-50/70 border-pink-200/70'
            : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => switchConfigArea('general')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-[transform,background-color,color,box-shadow] duration-150 cursor-pointer active:scale-[0.985] flex items-center justify-center gap-2 ${
              configArea === 'general'
                ? isDark
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : isKitty
                  ? 'bg-pink-600 text-white shadow-sm'
                  : 'bg-white text-zinc-950 shadow-sm'
                : `${mutedText} hover:opacity-90`
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Motor General (Kits, Podcast y Study)</span>
          </button>
          <button
            type="button"
            onClick={() => switchConfigArea('oral')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-[transform,background-color,color,box-shadow] duration-150 cursor-pointer active:scale-[0.985] flex items-center justify-center gap-2 ${
              configArea === 'oral'
                ? isDark
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : isKitty
                  ? 'bg-pink-600 text-white shadow-sm'
                  : 'bg-white text-zinc-950 shadow-sm'
                : `${mutedText} hover:opacity-90`
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Motor Oral y Respaldo 402</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto modal-smooth-scroll overscroll-contain space-y-4 pr-1">
          {/* Explicacion clara sobre limites / tokens */}
          <div className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-1.5 ${
            isDark
              ? 'bg-white/[0.03] border-white/[0.08] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : isKitty
              ? 'bg-pink-50/70 border-pink-200 text-zinc-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className={`flex items-center gap-1.5 font-bold ${strongText}`}>
              <Settings className="w-4 h-4 shrink-0 text-violet-400" />
              <span>
                {configArea === 'general'
                  ? 'Por qué Ollama Cloud pide créditos (HTTP 402) y cómo tener mayor cuota gratis:'
                  : 'Motor Oral exclusivo + Respaldo automático ante HTTP 402:'}
              </span>
            </div>
            {configArea === 'general' ? (
              <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                <strong className={strongText}>Ollama en tu PC</strong> es 100% ilimitado porque usa tu propio hardware, pero <strong className={strongText}>Ollama Cloud (ollama.com)</strong> cobra créditos tras agotar la cuota gratuita (error <code className="font-mono">HTTP 402</code>). Elige abajo proveedores con cuotas gratuitas mucho más altas sin tarjeta (<strong className={strongText}>Google Gemini</strong>, <strong className={strongText}>Cerebras</strong>, <strong className={strongText}>Mistral</strong>, <strong className={strongText}>Groq</strong> o <strong className={strongText}>Ollama Local</strong>).
              </p>
            ) : (
              <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                Este motor impulsa la Lección Oral y la Conversación de voz en tiempo real. Además, si tienes una clave <code className="font-mono">gsk_...</code> de Groq configurada aquí y tu proveedor principal devuelve <code className="font-mono">HTTP 402</code>, Thea+ conmutará automáticamente a Groq para no interrumpir tu estudio.
              </p>
            )}
          </div>

          {/* Provider Presets */}
          {configArea === 'general' ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-[11px] font-bold uppercase tracking-wider ${labelText}`}>
                  Proveedores compatibles para Motor General:
                </label>
                <span className={`text-[10px] flex items-center gap-1 font-semibold ${isLocalHost ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  <ShieldCheck className="w-3 h-3" />
                  {isLocalHost ? 'Proxy Local Vite Activo' : 'Proxy Serverless CORS'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {generalPresets.map(preset => {
                  const isSelected = selectedPresetId === preset.id;
                  const savedPresetKey = getPresetApiKey(preset.id);
                  const isConfigured = Boolean(savedPresetKey) || preset.id === 'ollama-local';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-2 transition-[transform,background-color,border-color,color] duration-150 cursor-pointer active:scale-[0.985] ${
                        isSelected
                          ? isDark
                            ? 'border-violet-400/75 bg-violet-500/15 text-white ring-1 ring-violet-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                            : isKitty
                            ? 'border-pink-500 bg-pink-50 text-zinc-950 ring-1 ring-pink-300 shadow-sm'
                            : 'border-violet-600 bg-violet-50 text-zinc-950 ring-1 ring-violet-200 shadow-sm'
                          : isDark
                          ? 'border-white/10 bg-white/[0.025] text-zinc-300 hover:bg-white/[0.05] hover:border-white/20'
                          : isKitty
                          ? 'border-pink-200/80 bg-white text-zinc-800 hover:bg-pink-50/50 hover:border-pink-300'
                          : 'border-slate-200 bg-slate-50/80 text-slate-800 hover:bg-slate-100/80 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className={`text-xs font-bold tracking-tight ${strongText}`}>
                            {preset.name}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            preset.freeTier
                              ? isDark
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isDark
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {preset.badge}
                          </span>
                        </div>
                        <p className={`text-[11px] leading-snug ${mutedText}`}>
                          {preset.description}
                        </p>
                      </div>

                      <div className={`pt-2 border-t flex items-center justify-between gap-2 text-[10px] ${
                        isDark ? 'border-white/[0.06]' : isKitty ? 'border-pink-100' : 'border-slate-200/80'
                      }`}>
                        <span className={`truncate font-medium ${isDark ? 'text-violet-300' : 'text-violet-700'}`}>
                          {preset.limitSummary || preset.model}
                        </span>
                        {isConfigured && preset.id !== 'ollama-local' && (
                          <span className="text-emerald-400 font-semibold shrink-0">Clave lista</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => applyPreset(oralPreset)}
                className={`w-full p-3.5 rounded-2xl border text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 transition-[transform,background-color,border-color] duration-150 cursor-pointer active:scale-[0.985] ${
                  isDark
                    ? 'border-violet-400/70 bg-violet-500/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                    : isKitty
                    ? 'border-pink-400 bg-pink-50 text-zinc-950'
                    : 'border-violet-500 bg-violet-50 text-zinc-950'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs sm:text-sm font-bold ${strongText}`}>{oralPreset.name}</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {oralPreset.badge}
                    </span>
                  </div>
                  <p className={`text-[11px] ${mutedText}`}>{oralPreset.description}</p>
                </div>
                <span className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border shrink-0 ${
                  isDark ? 'bg-black/30 border-white/10 text-violet-300' : 'bg-white border-slate-200 text-violet-700'
                }`}>
                  {oralPreset.limitSummary}
                </span>
              </button>
            </div>
          )}

          {/* Form Fields */}
          <div className={`space-y-3.5 border rounded-2xl p-4 ${
            isDark
              ? 'bg-white/[0.025] border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : isKitty
              ? 'bg-pink-50/40 border-pink-200/80'
              : 'bg-slate-50/70 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between pb-2 border-b ${
              isDark ? 'border-white/[0.07]' : isKitty ? 'border-pink-100' : 'border-slate-200'
            }`}>
              <span className={`text-xs font-bold flex items-center gap-1.5 ${strongText}`}>
                <span>Configurando:</span>
                <span className={isDark ? 'text-violet-300' : 'text-violet-700'}>{providerDisplayName}</span>
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                isDark
                  ? 'bg-white/[0.05] text-zinc-300 border-white/10'
                  : isKitty
                  ? 'bg-white text-pink-800 border-pink-200'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}>
                {configArea === 'oral' ? 'Lección Oral y Voz' : 'Kits, Smart Study y Podcasts'}
              </span>
            </div>

            {/* Base URL */}
            <div>
              <label className={`text-[11px] font-semibold block mb-1 ${labelText}`}>
                URL Base del Endpoint OpenAI-Compatible:
              </label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => {
                  const newUrl = e.target.value;
                  setSettings(prev => ({ ...prev, baseUrl: newUrl, verified: false }));
                  setTestResult(null);
                  if (configArea === 'general') {
                    setSelectedPresetId(detectGeneralPresetId(newUrl));
                  }
                }}
                placeholder={activePreset?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai'}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(urlValidation.isValid)}`}
              />
              {!urlValidation.isValid && (
                <p className="mt-1.5 text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span>{urlValidation.error}</span>
                </p>
              )}
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <label className={`text-[11px] font-semibold block ${labelText}`}>
                  API Key / Token de Acceso:
                </label>
                {activePreset?.keyUrl && (
                  <a
                    href={activePreset.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1 text-[10px] underline font-medium ${
                      isDark ? 'text-violet-300 hover:text-violet-200' : 'text-violet-700 hover:text-violet-800'
                    }`}
                  >
                    <span>Obtener clave en {activePreset.keyUrl.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                )}
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => {
                    const newKey = e.target.value;
                    if (selectedPresetId !== 'custom') {
                      savePresetApiKey(selectedPresetId, newKey);
                    }
                    setTestResult(null);
                    setSettings(prev => ({
                      ...prev,
                      apiKey: newKey,
                      verified: isLocalUrl(prev.baseUrl) ? true : false,
                      ...(configArea === 'oral'
                        ? { groqApiKey: newKey, grokApiKey: newKey }
                        : {}),
                    }));
                  }}
                  placeholder={activePreset?.keyPlaceholder || 'Ingresa tu API Key'}
                  className={`w-full px-3 py-2 pr-10 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(keyValidation.isValid)}`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(prev => !prev)}
                  aria-label={showKey ? 'Ocultar clave API' : 'Mostrar clave API'}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors ${mutedText} hover:opacity-100`}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {!keyValidation.isValid ? (
                <p className="mt-1.5 text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span>{keyValidation.error}</span>
                </p>
              ) : (
                <div className="mt-1.5 text-[11px]">
                  {isTesting ? (
                    <span className="text-violet-400 flex items-center gap-1.5 font-medium">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      Probando conexión con el proveedor...
                    </span>
                  ) : testResult?.success ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Conexión verificada correctamente (200 OK).
                    </span>
                  ) : isLocalProvider ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Ollama Local no requiere clave API en localhost.
                    </span>
                  ) : settings.verified && settings.apiKey ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Clave lista. Haz clic en &quot;Guardar y Aplicar&quot; para confirmar cambios.
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Clave ingresada sin verificar aún; puedes probar conexión o guardar directo.
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Model Name */}
            <div>
              <label className={`text-[11px] font-semibold block mb-1 ${labelText}`}>
                Nombre del Modelo (LLM):
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={e => {
                  const newModel = e.target.value;
                  setSettings(prev => ({ ...prev, model: newModel }));
                }}
                placeholder={activePreset?.model || 'gemini-2.5-flash'}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(modelValidation.isValid)}`}
              />
              {!modelValidation.isValid && (
                <p className="mt-1.5 text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span>{modelValidation.error}</span>
                </p>
              )}

              {modelChoices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className={`text-[10px] ${mutedText}`}>Modelos recomendados / detectados:</span>
                  {modelChoices.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, model: m }))}
                      className={`text-[10px] px-2 py-0.5 rounded-md border font-mono cursor-pointer active:scale-95 transition-[transform,background-color,border-color,color] duration-150 ${
                        settings.model === m
                          ? isKitty
                            ? 'bg-pink-600 text-white border-pink-600 font-bold'
                            : 'bg-violet-600 text-white border-violet-500 font-bold'
                          : isDark
                          ? 'bg-white/[0.04] text-zinc-300 border-white/10 hover:border-violet-400'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-violet-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn ${
                testResult.success
                  ? isDark
                    ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : isDark
                  ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <div className="leading-relaxed">
                <span className="font-bold block mb-0.5">
                  {testResult.success
                    ? `Conexión Exitosa con ${providerDisplayName}`
                    : `Fallo de Conexión con ${providerDisplayName}`}
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`flex flex-wrap items-center justify-between gap-2.5 pt-4 mt-3 border-t shrink-0 ${
          isDark ? 'border-white/[0.07]' : isKitty ? 'border-pink-100' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !isFormValid}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-[transform,background-color,color] duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95 ${
                isDark
                  ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 hover:text-white'
                  : 'border-slate-200 bg-slate-100 hover:bg-slate-200/70 text-slate-800'
              }`}
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
                  <span>Probando...</span>
                </>
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5 text-violet-400" />
                  <span>Probar Conexión</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-[transform,background-color,color] duration-150 cursor-pointer active:scale-95 ${
                isDark
                  ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 hover:text-white'
                  : 'border-slate-200 bg-slate-100 hover:bg-slate-200/70 text-slate-800'
              }`}
              title="Restablecer configuración predeterminada de IA"
            >
              <RefreshCw className="w-3.5 h-3.5 opacity-70" />
              <span>Restablecer</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!isFormValid}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition-[transform,background-color] duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95 ${
              isDark
                ? 'bg-white hover:bg-zinc-200 text-zinc-950'
                : isKitty
                ? 'bg-pink-600 hover:bg-pink-700 text-white'
                : 'bg-zinc-950 hover:bg-zinc-800 text-white'
            }`}
          >
            {isSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Guardado</span>
              </>
            ) : (
              <span>Guardar y Aplicar</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
