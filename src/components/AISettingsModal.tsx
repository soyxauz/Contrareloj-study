import React, { useState, useEffect } from 'react';
import {
  getAISettings,
  saveAISettings,
  resetAISettingsToDefault,
  testAIConnection,
  AI_PRESETS,
  type AISettings,
  type AIPreset,
  getOllamaApiKey,
  saveOllamaApiKey,
  getOllamaBaseUrl,
  saveOllamaBaseUrl,
  getOllamaModel,
  saveOllamaModel,
  getGroqApiKey,
  saveGroqApiKey,
  getGroqBaseUrl,
  saveGroqBaseUrl,
  getGroqModel,
  saveGroqModel,
  getOralAISettings,
} from '../services/aiService';
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
  Sparkles,
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import { authService } from '../services/authService';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved
}) => {
  const [settings, setSettings] = useState<AISettings>(getAISettings);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    models?: string[];
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ollama-cloud');
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      setIsSaved(false);

      const presetId = selectedPresetId === 'groq' ? 'groq' : 'ollama-cloud';
      setSelectedPresetId(presetId);

      if (presetId === 'ollama-cloud') {
        const ollamaKey = getOllamaApiKey();
        const ollamaBase = getOllamaBaseUrl();
        const ollamaModel = getOllamaModel();
        setSettings({
          ...getAISettings(),
          baseUrl: ollamaBase,
          model: ollamaModel,
          apiKey: ollamaKey,
        });
      } else {
        const groqKey = getGroqApiKey();
        const groqBase = getGroqBaseUrl();
        const groqModel = getGroqModel();
        setSettings({
          ...getOralAISettings(),
          baseUrl: groqBase,
          model: groqModel,
          apiKey: groqKey,
        });
      }
    }
  }, [isOpen]);

  // Prueba automatica de conexion tan pronto se ingresa la clave de API
  useEffect(() => {
    if (!isOpen) return;
    const cleanKey = settings.apiKey?.trim() || '';
    const isLocal = Boolean(settings.baseUrl?.includes('localhost') || settings.baseUrl?.includes('127.0.0.1'));

    if (!cleanKey && !isLocal) {
      if (settings.verified) {
        setSettings(prev => ({ ...prev, verified: false }));
      }
      setTestResult(null);
      return;
    }

    // Si tiene una clave con al menos 4 caracteres o es local, probar automaticamente
    if (cleanKey.length >= 4 || isLocal) {
      const timer = setTimeout(async () => {
        setIsTesting(true);
        try {
          const res = await testAIConnection(settings);
          setTestResult(res);
          if (res.success) {
            setSettings(prev => ({ ...prev, verified: true }));
            if (selectedPresetId === 'ollama-cloud') {
              saveOllamaApiKey(cleanKey);
              saveOllamaBaseUrl(settings.baseUrl);
              if (settings.model) saveOllamaModel(settings.model);
            } else if (selectedPresetId === 'groq') {
              saveGroqApiKey(cleanKey);
              saveGroqBaseUrl(settings.baseUrl);
              if (settings.model) saveGroqModel(settings.model);
            }
          } else {
            setSettings(prev => ({ ...prev, verified: false }));
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error al conectar con el proveedor.';
          setTestResult({
            success: false,
            message: msg,
          });
          setSettings(prev => ({ ...prev, verified: false }));
        } finally {
          setIsTesting(false);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [settings.apiKey, settings.baseUrl, settings.model, isOpen, selectedPresetId]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testAIConnection(settings);
      setTestResult(res);
      if (res.success) {
        setSettings(prev => ({ ...prev, verified: true }));
        if (selectedPresetId === 'ollama-cloud') {
          saveOllamaApiKey(settings.apiKey || '');
          saveOllamaBaseUrl(settings.baseUrl);
          if (settings.model) saveOllamaModel(settings.model);
        } else if (selectedPresetId === 'groq') {
          saveGroqApiKey(settings.apiKey || '');
          saveGroqBaseUrl(settings.baseUrl);
          if (settings.model) saveGroqModel(settings.model);
        }
      } else {
        setSettings(prev => ({ ...prev, verified: false }));
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetOllamaCloud = () => {
    resetAISettingsToDefault();
    const defaults = getAISettings();
    const ollamaKey = getOllamaApiKey();
    const restored: AISettings = {
      ...defaults,
      baseUrl: 'https://ollama.com/v1',
      model: 'gemma4:31b',
      provider: 'openai-compatible',
      apiKey: ollamaKey,
      verified: Boolean(ollamaKey),
    };
    saveAISettings(restored);
    setSettings(restored);
    setSelectedPresetId('ollama-cloud');
    setTestResult(null);
    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, restored);
    }
    if (onSettingsSaved) onSettingsSaved();
  };

  const handleClose = () => {
    if (selectedPresetId === 'ollama-cloud') {
      if (settings.apiKey) saveOllamaApiKey(settings.apiKey);
      if (settings.baseUrl) saveOllamaBaseUrl(settings.baseUrl);
      if (settings.model) saveOllamaModel(settings.model);
    } else if (selectedPresetId === 'groq') {
      if (settings.apiKey) saveGroqApiKey(settings.apiKey);
      if (settings.baseUrl) saveGroqBaseUrl(settings.baseUrl);
      if (settings.model) saveGroqModel(settings.model);
    }
    const currentGeneral = getAISettings();
    const user = authService.getCurrentUser();
    if (user) authService.saveUserAISettings(user.id, currentGeneral);
    googleDriveService.syncAISettingsToDrive(currentGeneral).catch(console.warn);
    onClose();
  };

  const handleSave = async () => {
    if (selectedPresetId === 'ollama-cloud') {
      if (settings.apiKey !== undefined) saveOllamaApiKey(settings.apiKey);
      if (settings.baseUrl) saveOllamaBaseUrl(settings.baseUrl);
      if (settings.model) saveOllamaModel(settings.model);
    } else if (selectedPresetId === 'groq') {
      if (settings.apiKey !== undefined) saveGroqApiKey(settings.apiKey);
      if (settings.baseUrl) saveGroqBaseUrl(settings.baseUrl);
      if (settings.model) saveGroqModel(settings.model);
    }

    const currentGeneral = getAISettings();
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
    }, 400);
  };

  const applyPreset = (preset: AIPreset) => {
    // Si estabamos en otro preset, guardar lo que el usuario tenia escrito para no perderlo
    if (selectedPresetId === 'ollama-cloud' && preset.id === 'groq') {
      if (settings.apiKey !== undefined) saveOllamaApiKey(settings.apiKey);
      if (settings.baseUrl) saveOllamaBaseUrl(settings.baseUrl);
      if (settings.model) saveOllamaModel(settings.model);
    } else if (selectedPresetId === 'groq' && preset.id === 'ollama-cloud') {
      if (settings.apiKey !== undefined) saveGroqApiKey(settings.apiKey);
      if (settings.baseUrl) saveGroqBaseUrl(settings.baseUrl);
      if (settings.model) saveGroqModel(settings.model);
    }

    setSelectedPresetId(preset.id);

    let providerKey = '';
    let providerBaseUrl = preset.baseUrl;
    let providerModel = preset.model;

    if (preset.id === 'ollama-cloud') {
      providerKey = getOllamaApiKey();
      providerBaseUrl = getOllamaBaseUrl();
      providerModel = getOllamaModel();
    } else if (preset.id === 'groq') {
      providerKey = getGroqApiKey();
      providerBaseUrl = getGroqBaseUrl();
      providerModel = getGroqModel();
    }

    setSettings(prev => ({
      ...prev,
      baseUrl: providerBaseUrl,
      model: providerModel,
      apiKey: providerKey,
      verified: Boolean(providerKey && providerKey.trim().length > 0),
    }));
    setTestResult(null);
  };

  const activePreset = AI_PRESETS.find(p => p.id === selectedPresetId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-thea-surface border-t sm:border border-thea-border rounded-t-3xl sm:rounded-3xl max-w-xl w-full p-4 sm:p-7 shadow-2xl relative overflow-hidden max-h-[88vh] sm:max-h-[92vh] flex flex-col">
        {/* Mobile Pull Handle */}
        <div className="w-12 h-1.5 bg-slate-600/70 rounded-full mx-auto mb-2 sm:hidden shrink-0" />

        {/* Decorative Top Accent */}
        <div className="hidden sm:block absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-amber-400" />

        {/* Modal Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-thea-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Motor de Inteligencia Artificial
                </h2>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {settings.baseUrl?.includes('ollama.com') ? 'Ollama Cloud' : settings.baseUrl?.includes('localhost') ? 'Ollama Local' : 'IA Configurada'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {settings.baseUrl?.includes('ollama.com')
                  ? 'Servicio oficial de Ollama en la nube con API Key de ollama.com/settings/keys'
                  : 'Configuración de motor de IA para generación inteligente de kits y exámenes'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Master AI Status - Siempre Activo */}
          <div className="p-3.5 rounded-2xl bg-thea-surfaceLight border border-thea-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="font-bold text-xs sm:text-sm text-white block">
                  Generación de Preguntas por IA Activa
                </span>
                <span className="text-[11px] text-slate-400">
                  Evaluaciones 100% pedagógicas y ancladas generadas localmente por Ollama
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Siempre Activo</span>
            </div>
          </div>

          {/* Asignacion Fija de Motores por Area */}
          <div className="p-3.5 rounded-2xl bg-violet-950/40 border border-violet-500/30 text-xs text-slate-300 flex flex-col gap-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 font-bold text-violet-300">
              <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
              <span>Asignacion fija y obligatoria de motores:</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              <strong className="text-white">Ollama Cloud</strong> procesa siempre todo el estudio general (kits, Chat Tutor, Smart Study y examenes). <strong className="text-white">Groq Cloud</strong> procesa exclusivamente la Leccion Oral y Conversacion con voz. La seleccion de cada tarjeta es unicamente para ver y configurar su API Key.
            </p>
          </div>

          {/* Provider Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Selecciona el motor que deseas configurar:
              </label>
              <span className={`text-[10px] flex items-center gap-1 font-semibold ${isLocalHost ? 'text-emerald-400' : 'text-cyan-400'}`}>
                <ShieldCheck className="w-3 h-3" />
                {isLocalHost ? 'Servidor Local Detectado' : 'Version Web'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {AI_PRESETS.map(preset => {
                const isSelected = selectedPresetId === preset.id;
                const isOllama = preset.id === 'ollama-cloud';
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`p-3.5 rounded-2xl border text-left relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-violet-500 bg-violet-950/50 text-white ring-2 ring-violet-500/50 shadow-lg shadow-violet-950/40'
                        : 'border-thea-border bg-thea-surfaceLight text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs sm:text-sm font-bold text-white block">
                          {preset.name}
                        </span>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${
                          isOllama
                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {preset.badge}
                        </span>
                        {isSelected && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                            Editando esta clave
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-center gap-1.5 shrink-0">
                      <span className="text-xs text-violet-300 font-mono font-medium bg-violet-900/40 px-2.5 py-1 rounded-lg border border-violet-500/30">
                        Modelo: {preset.id === 'ollama-cloud' ? getOllamaModel() : getGroqModel()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {isOllama ? 'Aplica a todo el estudio general' : 'Aplica solo a Leccion Oral'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3.5 bg-thea-surfaceLight/60 border border-thea-border/80 rounded-2xl p-4">
            <div className="flex items-center justify-between pb-2 border-b border-thea-border/60">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Configurando credenciales de:</span>
                <span className="text-violet-400 font-extrabold">
                  {selectedPresetId === 'groq' ? 'Groq Cloud (Motor Oral Exclusivo)' : 'Ollama Cloud (Motor General)'}
                </span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {selectedPresetId === 'groq' ? 'Leccion Oral y Conversacion' : 'Predeterminado para todo'}
              </span>
            </div>
            {/* Base URL */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                URL Base del Endpoint API:
              </label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => {
                  const newUrl = e.target.value;
                  setSettings(prev => ({ ...prev, baseUrl: newUrl }));
                  if (selectedPresetId === 'ollama-cloud') {
                    saveOllamaBaseUrl(newUrl);
                  } else if (selectedPresetId === 'groq') {
                    saveGroqBaseUrl(newUrl);
                  }
                }}
                placeholder={selectedPresetId === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://ollama.com/v1'}
                className="w-full px-3 py-2 rounded-xl bg-thea-bg border border-thea-border text-white text-xs font-mono focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300 block">
                  API Key / Token de Acceso:
                </label>
                {settings.baseUrl?.includes('ollama.com') && (
                  <a
                    href="https://ollama.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 flex items-center gap-0.5 text-[10px] underline"
                  >
                    <span>ollama.com/settings/keys</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                {settings.baseUrl?.includes('api.groq.com') && (
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 flex items-center gap-0.5 text-[10px] underline"
                  >
                    <span>console.groq.com/keys</span>
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
                    const isOllama = selectedPresetId === 'ollama-cloud' || settings.baseUrl?.includes('ollama.com');
                    const isGroq = selectedPresetId === 'groq' || settings.baseUrl?.includes('api.groq.com');

                    if (isOllama) {
                      saveOllamaApiKey(newKey);
                    } else if (isGroq) {
                      saveGroqApiKey(newKey);
                    }

                    const updated: AISettings = {
                      ...settings,
                      apiKey: newKey,
                      ...(isOllama ? { ollamaApiKey: newKey } : {}),
                      ...(isGroq ? { groqApiKey: newKey } : {}),
                      verified: newKey.trim().length > 0 ? true : false,
                    };
                    setSettings(updated);
                    saveAISettings(updated);
                    const user = authService.getCurrentUser();
                    if (user) {
                      authService.saveUserAISettings(user.id, updated);
                    }
                  }}
                  placeholder={activePreset?.keyPlaceholder || 'Ingresa tu API Key'}
                  className="w-full px-3 py-2 pr-10 rounded-xl bg-thea-bg border border-thea-border text-white text-xs font-mono focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1.5 text-[11px]">
                {isTesting ? (
                  <span className="text-violet-300 flex items-center gap-1.5 font-medium animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400 shrink-0" />
                    Probando automáticamente clave de API (200 OK)...
                  </span>
                ) : settings.verified ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    API verificada y activa (200 OK). ¡Todo desbloqueado y a todo color!
                  </span>
                ) : settings.apiKey && settings.apiKey.trim().length > 0 ? (
                  <span className="text-amber-400 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    Clave ingresada no verificada. Espera la prueba automática o presiona &quot;Probar Conexión&quot;.
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    Sin clave API: Ingresa tu clave para que se pruebe automáticamente.
                  </span>
                )}
              </div>
            </div>



            {/* Model Name */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Nombre del Modelo (LLM):
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={e => {
                  const newModel = e.target.value;
                  setSettings(prev => ({ ...prev, model: newModel }));
                  if (selectedPresetId === 'ollama-cloud') {
                    saveOllamaModel(newModel);
                  } else if (selectedPresetId === 'groq') {
                    saveGroqModel(newModel);
                  }
                }}
                placeholder={selectedPresetId === 'groq' ? 'openai/gpt-oss-120b' : 'gemma4:31b'}
                className="w-full px-3 py-2 rounded-xl bg-thea-bg border border-thea-border text-white text-xs font-mono focus:outline-none focus:border-violet-500"
              />

              {/* Detected models chips if test succeeded */}
              {testResult?.models && testResult.models.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-slate-400">Detectados en tu servidor:</span>
                  {testResult.models.slice(0, 6).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, model: m }))}
                      className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${
                        settings.model === m
                          ? 'bg-violet-600 text-white border-violet-500 font-bold'
                          : 'bg-thea-surfaceLight text-slate-300 border-thea-border hover:border-violet-400'
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
                  ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
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
                    ? `Conexión Exitosa con ${selectedPresetId === 'groq' ? 'Groq Cloud (Motor Oral)' : 'Ollama Cloud (Motor General)'}`
                    : `Fallo de Conexión con ${selectedPresetId === 'groq' ? 'Groq Cloud' : 'Ollama Cloud'}`}
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 mt-3 border-t border-thea-border shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-thea-border bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 text-xs font-semibold text-slate-300 hover:text-white transition-all disabled:opacity-50"
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
              onClick={handleResetOllamaCloud}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-thea-border bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Restablecer a valores oficiales de Ollama Cloud (https://ollama.com/v1, gemma4:31b)"
            >
              <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
              <span>Restablecer Ollama Cloud</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-violet-900/30 transition-all"
          >
            {isSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Guardado Correctamente</span>
              </>
            ) : (
              <span>Guardar y Aplicar</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
