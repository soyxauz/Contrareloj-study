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
  savePresetApiKey,
  getGroqApiKey,
  saveGroqApiKey,
  saveGroqBaseUrl,
  getGroqModel,
  saveGroqModel,
  saveGrokApiKey,
  saveGrokBaseUrl,
  getGrokModel,
  saveGrokModel,
  getOralAISettings,
  normalizeOpenAIBaseUrl,
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

function loadGeneralState(): AISettings {
  const current = getAISettings();
  return {
    ...current,
    baseUrl: normalizeOpenAIBaseUrl(current.baseUrl || '') || 'https://api.groq.com/openai/v1',
    model: (current.model || '').trim() || 'openai/gpt-oss-120b',
    apiKey: (current.apiKey || '').trim(),
    verified: Boolean(current.apiKey && current.apiKey.trim().length > 0),
  };
}

function buildSnapshot(presetId: string, s: AISettings): string {
  return JSON.stringify({
    presetId,
    apiKey: s.apiKey || '',
    baseUrl: normalizeOpenAIBaseUrl(s.baseUrl || ''),
    model: (s.model || '').trim(),
  });
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isKitty = theme === 'kitty';

  const [settings, setSettings] = useState<AISettings>(getAISettings);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    models?: string[];
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('groq-general');
  const initialFormSnapshotRef = useRef<string>('');
  const latestSettingsRef = useRef<AISettings>(settings);
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;
    setTestResult(null);
    setIsSaved(false);
    setShowKey(false);

    const presetId = 'groq-general';
    setSelectedPresetId(presetId);
    const nextSettings = loadGeneralState();
    setSettings(nextSettings);
    initialFormSnapshotRef.current = buildSnapshot(presetId, nextSettings);
  }, [isOpen]);

  const isOral = selectedPresetId === 'groq';

  const urlValidation = useMemo(() => {
    return validateBaseUrl(settings.baseUrl || '');
  }, [settings.baseUrl]);

  const keyValidation = useMemo(() => {
    const cleanKey = settings.apiKey?.trim() || '';
    if (isOral || settings.baseUrl?.includes('api.groq.com')) {
      return validateOralApiKey(cleanKey, false);
    }
    const isLocal = Boolean(settings.baseUrl?.includes('localhost') || settings.baseUrl?.includes('127.0.0.1'));
    if (!isLocal && !cleanKey) {
      return { isValid: false, error: 'Se requiere una API Key para conectar con el motor de IA.' };
    }
    return { isValid: true };
  }, [isOral, settings.baseUrl, settings.apiKey]);

  const modelValidation = useMemo(() => {
    if (!settings.model || !settings.model.trim()) {
      return { isValid: false, error: 'El nombre del modelo LLM no puede estar vacío.' };
    }
    return { isValid: true };
  }, [settings.model]);

  const isFormValid = urlValidation.isValid && keyValidation.isValid && modelValidation.isValid;

  const persistSelectedPreset = (targetSettings: AISettings, presetId: string) => {
    const cleanKey = (targetSettings.apiKey || '').trim();
    const cleanUrl = normalizeOpenAIBaseUrl(targetSettings.baseUrl || '') || 'https://api.groq.com/openai/v1';
    const cleanModel = (targetSettings.model || '').trim() || 'openai/gpt-oss-120b';

    if (presetId === 'groq') {
      if (cleanKey.startsWith('gsk_')) {
        saveGroqApiKey(cleanKey);
        saveGroqBaseUrl(cleanUrl || 'https://api.groq.com/openai/v1');
        saveGroqModel(cleanModel);
      } else {
        saveGrokApiKey(cleanKey);
        saveGroqApiKey(cleanKey);
        saveGrokBaseUrl(cleanUrl || 'https://api.x.ai/v1');
        saveGrokModel(cleanModel);
      }
      saveAISettings({ ...targetSettings, baseUrl: cleanUrl, apiKey: cleanKey, model: cleanModel }, 'oral');
    } else {
      savePresetApiKey('groq-general', cleanKey);
      saveAISettings(
        {
          ...targetSettings,
          baseUrl: cleanUrl,
          apiKey: cleanKey,
          model: cleanModel,
          updatedAt: Date.now(),
          provider: cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1') ? 'ollama' : 'openai-compatible',
        },
        'general'
      );
    }
  };

  // Auto-prueba silenciosa de conexión cuando la configuración ingresada es válida
  useEffect(() => {
    if (!isOpen || !isFormValid) return;

    const cleanKey = settings.apiKey?.trim() || '';
    const isLocal = Boolean(settings.baseUrl?.includes('localhost') || settings.baseUrl?.includes('127.0.0.1'));
    if (!cleanKey && !isLocal) return;
    if (cleanKey.length < 4 && !isLocal) return;

    let cancelled = false;
    const testedApiKey = settings.apiKey;
    const testedBaseUrl = settings.baseUrl;
    const targetPreset = selectedPresetId;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setIsTesting(true);
      try {
        const snapshotAtRun = latestSettingsRef.current;
        const res = await testAIConnection({
          ...snapshotAtRun,
          apiKey: testedApiKey,
          baseUrl: testedBaseUrl,
        });
        if (cancelled) return;
        setTestResult(res);
        if (res.success) {
          const currentLatest = latestSettingsRef.current;
          const verifiedSettings: AISettings = { ...currentLatest, verified: true };
          setSettings(prev => ({ ...prev, verified: true }));
          persistSelectedPreset(verifiedSettings, targetPreset);
          // Solo actualizar el snapshot base si la selección del usuario no cambió respecto al inicio
          if (buildSnapshot(targetPreset, verifiedSettings) === initialFormSnapshotRef.current) {
            initialFormSnapshotRef.current = buildSnapshot(targetPreset, verifiedSettings);
          }
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
  }, [settings.apiKey, settings.baseUrl, isOpen, selectedPresetId, isFormValid]);

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
        const verifiedSettings = { ...settings, verified: true };
        setSettings(verifiedSettings);
        persistSelectedPreset(verifiedSettings, selectedPresetId);
        initialFormSnapshotRef.current = buildSnapshot(selectedPresetId, verifiedSettings);
      } else {
        setSettings(prev => ({ ...prev, verified: false }));
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetDefaults = () => {
    resetAISettingsToDefault();
    const restored = loadGeneralState();
    setSettings(restored);
    setSelectedPresetId('groq-general');
    setTestResult(null);
    initialFormSnapshotRef.current = buildSnapshot('groq-general', restored);
    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, restored);
    }
    if (onSettingsSaved) onSettingsSaved();
  };

  const handleClose = () => {
    const currentSnapshot = buildSnapshot(selectedPresetId, settings);
    if (currentSnapshot === initialFormSnapshotRef.current) {
      onClose();
      return;
    }
    if (isFormValid) {
      persistSelectedPreset(settings, selectedPresetId);
      const currentGeneral = getAISettings();
      const user = authService.getCurrentUser();
      if (user) authService.saveUserAISettings(user.id, currentGeneral);
      googleDriveService.syncAISettingsToDrive(currentGeneral).catch(console.warn);
      if (onSettingsSaved) onSettingsSaved();
    }
    onClose();
  };

  const handleSave = () => {
    if (!isFormValid) return;

    persistSelectedPreset(settings, selectedPresetId);
    const currentGeneral = getAISettings();
    initialFormSnapshotRef.current = buildSnapshot(selectedPresetId, settings);

    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, currentGeneral);
    }

    googleDriveService.syncAISettingsToDrive(currentGeneral).catch(err => {
      console.warn('[AISettingsModal] Error al respaldar API en Google Drive:', err);
    });

    setIsSaved(true);
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 350);
  };

  const applyPreset = (preset: AIPreset) => {
    if (preset.id === selectedPresetId) return;

    if (settings.apiKey?.trim() && isFormValid) {
      persistSelectedPreset(settings, selectedPresetId);
    }

    setSelectedPresetId(preset.id);

    if (preset.id === 'groq') {
      const oral = getOralAISettings();
      setSettings(oral);
      initialFormSnapshotRef.current = buildSnapshot('groq', oral);
    } else {
      const nextGeneral = loadGeneralState();
      setSettings(nextGeneral);
      initialFormSnapshotRef.current = buildSnapshot('groq-general', nextGeneral);
    }
    setTestResult(null);
  };

  const activePreset = AI_PRESETS.find(p => p.id === selectedPresetId);
  const modelChips = useMemo(() => {
    const merged = [
      ...(activePreset?.suggestedModels || []),
      ...(testResult?.models || []),
    ]
      .map(m => m.trim())
      .filter(Boolean)
      .filter(m => !/whisper|prompt-guard|safeguard|orpheus|tts|embed/i.test(m));
    return Array.from(new Set(merged)).slice(0, 6);
  }, [activePreset, testResult]);

  if (!isOpen || typeof document === 'undefined') return null;

  const strongText = isDark ? 'text-white' : 'text-zinc-950';
  const mutedText = isDark ? 'text-zinc-400' : isKitty ? 'text-pink-900/70' : 'text-slate-500';
  const labelText = isDark ? 'text-zinc-300' : 'text-slate-700';
  const cardSurface = isDark
    ? 'bg-white/[0.03] border-white/[0.08]'
    : isKitty
    ? 'bg-pink-50/40 border-pink-200/80'
    : 'bg-slate-50/80 border-slate-200';
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

  const savedGeneralSnapshot = getAISettings();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-modal-backdrop">
      <div className={`border rounded-2xl sm:rounded-3xl max-w-xl w-full p-4 sm:p-7 shadow-2xl relative overflow-hidden max-h-[88vh] sm:max-h-[92vh] flex flex-col animate-modal-card ${
        isDark
          ? 'bg-[#0e0b16] border-white/10 text-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'thea-glass-modal text-zinc-950'
      }`}>

        {/* Modal Header */}
        <div className={`flex items-center justify-between mb-5 pb-3 border-b shrink-0 ${
          isDark ? 'border-white/[0.06]' : isKitty ? 'border-pink-100' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              isKitty
                ? 'bg-pink-100 border-pink-200 text-pink-600'
                : !isDark
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-white/[0.04] border-white/10 text-zinc-300'
            }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base sm:text-lg font-bold tracking-tight ${strongText}`}>
                  Motor de Inteligencia Artificial
                </h2>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-white/[0.05] text-zinc-300 border-white/10'
                    : isKitty
                    ? 'bg-pink-50 text-pink-800 border-pink-200'
                    : 'bg-slate-100 text-slate-800 border-slate-200'
                }`}>
                  {isOral ? 'Groq Voz' : 'Groq Cloud'}
                </span>
              </div>
              <p className={`text-xs ${mutedText}`}>
                Inferencia ultra rápida en Groq Cloud con API Key de console.groq.com/keys
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar configuración de IA"
            className={`p-2 rounded-xl transition-[background-color,color,transform] duration-150 cursor-pointer active:scale-95 ${
              isDark
                ? 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                : 'text-slate-500 hover:text-zinc-950 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto modal-smooth-scroll overscroll-contain space-y-5 pr-1">
          {/* Master AI Status */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${cardSurface}`}>
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className={`font-bold text-xs sm:text-sm block ${strongText}`}>
                  Generación de Preguntas por IA Activa
                </span>
                <span className={`text-[11px] ${mutedText}`}>
                  Evaluaciones pedagógicas, podcasts y Smart Study impulsados por Groq Cloud
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Siempre Activo</span>
            </div>
          </div>

          {/* Asignacion Fija de Motores por Area */}
          <div className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-1.5 shadow-sm ${
            isDark
              ? 'bg-violet-950/35 border-violet-500/30 text-zinc-300'
              : isKitty
              ? 'bg-pink-50/70 border-pink-200 text-zinc-800'
              : 'bg-violet-50/70 border-violet-200 text-slate-700'
          }`}>
            <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-violet-300' : 'text-violet-700'}`}>
              <Settings className="w-4 h-4 shrink-0" />
              <span>Asignación dedicada por clave de Groq:</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              <strong className={strongText}>Groq Cloud (Motor General)</strong> procesa todo el estudio general (kits, Chat Tutor, Smart Study, Podcasts y exámenes). <strong className={strongText}>Groq Cloud (Motor de Voz)</strong> conserva su clave independiente exclusivamente para Lección Oral y Conversación.
            </p>
          </div>

          {/* Provider Presets (Groq General + Groq Voz) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-[11px] font-bold uppercase tracking-wider block ${labelText}`}>
                Selecciona el motor que deseas configurar:
              </label>
              <span className={`text-[10px] flex items-center gap-1 font-semibold ${isLocalHost ? 'text-emerald-400' : 'text-cyan-400'}`}>
                <ShieldCheck className="w-3 h-3" />
                {isLocalHost ? 'Servidor Local Detectado' : 'Versión Web'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {AI_PRESETS.map(preset => {
                const isSelected = selectedPresetId === preset.id;
                const isGeneral = preset.id === 'groq-general';
                const badgeModel = isSelected
                  ? (settings.model?.trim() || preset.model)
                  : isGeneral
                  ? savedGeneralSnapshot.model || preset.model
                  : (getGroqApiKey().startsWith('gsk_') ? getGroqModel() : getGrokModel());
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`p-3.5 rounded-2xl border text-left relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-[transform,background-color,border-color,color] duration-150 cursor-pointer active:scale-[0.985] ${
                      isSelected
                        ? isDark
                          ? 'border-violet-400/80 bg-violet-950/50 text-white ring-1 ring-violet-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                          : isKitty
                          ? 'border-pink-400 bg-pink-50 text-zinc-950 ring-1 ring-pink-300 shadow-sm'
                          : 'border-violet-500 bg-violet-50 text-zinc-950 ring-1 ring-violet-200 shadow-sm'
                        : isDark
                        ? 'border-white/10 bg-white/[0.025] text-zinc-300 hover:bg-white/[0.05] hover:border-white/20'
                        : isKitty
                        ? 'thea-glass-pill thea-glass-pill-hover text-zinc-800'
                        : 'thea-glass-pill thea-glass-pill-hover text-slate-700'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs sm:text-sm font-bold block ${strongText}`}>
                          {preset.name}
                        </span>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${
                          isGeneral
                            ? isDark
                              ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                              : 'bg-violet-100 text-violet-800 border-violet-200'
                            : isDark
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          {preset.badge}
                        </span>
                        {isSelected && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            isDark
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                              : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                          }`}>
                            Editando esta clave
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] leading-snug ${mutedText}`}>
                        {preset.description}
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-center gap-1.5 shrink-0">
                      <span className={`text-xs font-mono font-medium px-2.5 py-1 rounded-lg border ${
                        isDark
                          ? 'text-violet-300 bg-violet-900/40 border-violet-500/30'
                          : 'text-violet-800 bg-white border-violet-200'
                      }`}>
                        Modelo: {badgeModel}
                      </span>
                      <span className={`text-[10px] font-medium ${mutedText}`}>
                        {isGeneral ? 'Aplica a todo el estudio general' : 'Aplica solo a Lección Oral'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Fields */}
          <div className={`space-y-3.5 border rounded-2xl p-4 ${cardSurface}`}>
            <div className={`flex items-center justify-between pb-2 border-b ${
              isDark ? 'border-white/[0.06]' : isKitty ? 'border-pink-100' : 'border-slate-200'
            }`}>
              <span className={`text-xs font-bold flex items-center gap-1.5 ${strongText}`}>
                <span>Configurando credenciales de:</span>
                <span className={isDark ? 'text-violet-400 font-extrabold' : 'text-violet-700 font-extrabold'}>
                  {isOral ? 'Groq Cloud (Motor Oral)' : 'Groq Cloud (Motor General)'}
                </span>
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                isDark
                  ? 'bg-white/[0.05] text-zinc-300 border-white/10'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}>
                {isOral ? 'Lección Oral y Voz' : 'Kits, Study, Podcast y Tutor'}
              </span>
            </div>

            {/* Base URL */}
            <div>
              <label className={`text-[11px] font-semibold block mb-1 ${labelText}`}>
                URL Base del Endpoint API:
              </label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => {
                  const newUrl = e.target.value;
                  setTestResult(null);
                  setSettings(prev => ({ ...prev, baseUrl: newUrl }));
                }}
                placeholder="https://api.groq.com/openai/v1"
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
              <div className="flex items-center justify-between mb-1">
                <label className={`text-[11px] font-semibold block ${labelText}`}>
                  API Key / Token de Acceso:
                </label>
                {activePreset?.keyUrl && (
                  <a
                    href={activePreset.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-0.5 text-[10px] underline ${
                      isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-700 hover:text-violet-800'
                    }`}
                  >
                    <span>{activePreset.keyUrl.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => {
                    const newKey = e.target.value;
                    setTestResult(null);
                    setSettings(prev => ({
                      ...prev,
                      apiKey: newKey,
                      verified: newKey.trim().length > 0,
                      ...(isOral ? { groqApiKey: newKey, grokApiKey: newKey } : {}),
                    }));
                  }}
                  placeholder={activePreset?.keyPlaceholder || 'gsk_...'}
                  className={`w-full px-3 py-2 pr-10 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(keyValidation.isValid)}`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
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
                    <span className="text-violet-400 flex items-center gap-1.5 font-medium animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      Probando conexión con Groq Cloud...
                    </span>
                  ) : settings.verified && settings.apiKey ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Clave lista y activa. Presiona &quot;Guardar y Aplicar&quot; para confirmar.
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Clave ingresada sin verificar. Presiona &quot;Probar Conexión&quot; o guarda directamente.
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
                placeholder="openai/gpt-oss-120b"
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(modelValidation.isValid)}`}
              />
              {!modelValidation.isValid && (
                <p className="mt-1.5 text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span>{modelValidation.error}</span>
                </p>
              )}

              {modelChips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className={`text-[10px] ${mutedText}`}>Modelos disponibles:</span>
                  {modelChips.map(m => (
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
                    ? `Conexión Exitosa con ${isOral ? 'Groq Cloud (Motor Oral)' : 'Groq Cloud (Motor General)'}`
                    : `Fallo de Conexión con Groq Cloud`}
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className={`flex items-center justify-between gap-3 pt-4 mt-3 border-t shrink-0 ${
          isDark ? 'border-white/[0.06]' : isKitty ? 'border-pink-100' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !isFormValid}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-[transform,background-color,color] duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95 ${
                isDark
                  ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-zinc-300 hover:text-white'
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
                  ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-zinc-300 hover:text-white'
                  : 'border-slate-200 bg-slate-100 hover:bg-slate-200/70 text-slate-800'
              }`}
              title="Restablecer a valores oficiales de Groq Cloud (https://api.groq.com/openai/v1, openai/gpt-oss-120b)"
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
