import React, { useState, useEffect } from 'react';
import {
  getAISettings,
  saveAISettings,
  testAIConnection,
  AI_PRESETS,
  type AISettings,
  type AIPreset
} from '../services/aiService';
import {
  Bot,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Radio,
  Server,
  ShieldCheck,
  RefreshCw,
  Cpu,
  ExternalLink,
  Key,
  Cloud,
  Headphones,
  Sparkles
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import { authService } from '../services/authService';
import { savePodcastSettings, getGeminiAudioApiKey } from '../services/geminiAudioService';

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
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    models?: string[];
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('groq');
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    if (isOpen) {
      const current = getAISettings();
      const existingGeminiAudioKey = getGeminiAudioApiKey();
      if (!current.geminiApiKey && existingGeminiAudioKey) {
        current.geminiApiKey = existingGeminiAudioKey;
      }
      setSettings(current);
      setTestResult(null);
      setIsSaved(false);

      // Detect matching preset
      const match = AI_PRESETS.find(p => p.baseUrl === current.baseUrl);
      if (match) {
        setSelectedPresetId(match.id);
      } else {
        setSelectedPresetId('custom');
      }
    }
  }, [isOpen]);

  // Prueba automática de conexión tan pronto se ingresa la clave de API
  useEffect(() => {
    if (!isOpen) return;
    const cleanKey = settings.apiKey?.trim() || '';
    const isLocal = Boolean(settings.baseUrl?.includes('localhost') || settings.baseUrl?.includes('127.0.0.1'));

    if (!cleanKey && !isLocal) {
      if (settings.verified) {
        setSettings(prev => ({ ...prev, verified: false }));
        saveAISettings({ ...settings, verified: false });
      }
      setTestResult(null);
      return;
    }

    // Si tiene una clave con al menos 4 caracteres o es local, probar automáticamente
    if (cleanKey.length >= 4 || isLocal) {
      const timer = setTimeout(async () => {
        setIsTesting(true);
        try {
          const res = await testAIConnection(settings);
          setTestResult(res);
          if (res.success) {
            const updated: AISettings = { ...settings, verified: true };
            if (res.models && res.models.length > 0 && !settings.model) {
              updated.model = res.models[0];
            }
            setSettings(updated);
            saveAISettings(updated);

            const user = authService.getCurrentUser();
            if (user) {
              authService.saveUserAISettings(user.id, updated);
            }
            if (googleDriveService.getValidAccessToken()) {
              googleDriveService.syncAISettingsToDrive(updated).catch(console.warn);
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
  }, [settings.apiKey, settings.baseUrl, settings.model, isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testAIConnection(settings);
      setTestResult(res);
      if (res.success) {
        const updated: AISettings = { ...settings, verified: true };
        if (res.models && res.models.length > 0 && !settings.model) {
          updated.model = res.models[0];
        }
        setSettings(updated);
        saveAISettings(updated);

        const user = authService.getCurrentUser();
        if (user) {
          authService.saveUserAISettings(user.id, updated);
        }
        if (googleDriveService.getValidAccessToken()) {
          googleDriveService.syncAISettingsToDrive().catch(console.warn);
        }
      } else {
        setSettings(prev => ({ ...prev, verified: false }));
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    if (settings.apiKey && settings.apiKey.trim().length > 0) {
      const updated: AISettings = { ...settings, verified: true };
      if (updated.apiKey.startsWith('AIzaSy') || updated.baseUrl?.includes('googleapis')) {
        updated.geminiApiKey = updated.apiKey;
        localStorage.setItem('contrareloj_gemini_api_key', updated.apiKey);
        const podUpdated = savePodcastSettings({ geminiApiKey: updated.apiKey });
        googleDriveService.syncPodcastSettingsToDrive(podUpdated).catch(console.warn);
      }
      saveAISettings(updated);
      const user = authService.getCurrentUser();
      if (user) authService.saveUserAISettings(user.id, updated);
      googleDriveService.syncAISettingsToDrive(updated).catch(console.warn);
    }
    onClose();
  };

  const handleSave = async () => {
    let currentSettings = { ...settings };
    if (currentSettings.apiKey && currentSettings.apiKey.trim().length > 0) {
      currentSettings.verified = true;
      if (currentSettings.apiKey.startsWith('AIzaSy') || currentSettings.baseUrl?.includes('googleapis')) {
        currentSettings.geminiApiKey = currentSettings.apiKey;
        localStorage.setItem('contrareloj_gemini_api_key', currentSettings.apiKey);
        const podUpdated = savePodcastSettings({ geminiApiKey: currentSettings.apiKey });
        googleDriveService.syncPodcastSettingsToDrive(podUpdated).catch(console.warn);
      }
    }

    // Persistir de inmediato para que la interfaz se desbloquee al instante sin esperas
    saveAISettings(currentSettings);
    setSettings(currentSettings);

    // Asociar al usuario autenticado si existe sesión activa
    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, currentSettings);
    }

    // Respaldar la API personal inmediatamente en Google Drive
    googleDriveService.syncAISettingsToDrive(currentSettings).catch(err => {
      console.warn('[AISettingsModal] Error al respaldar API en Google Drive:', err);
    });

    setIsSaved(true);
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 400);

    // Ejecutar verificación en segundo plano para obtener lista de modelos si el servidor lo admite
    testAIConnection(currentSettings).then(res => {
      if (res.success && res.models && res.models.length > 0 && !currentSettings.model) {
        currentSettings.model = res.models[0];
        saveAISettings(currentSettings);
      }
    }).catch(() => {});
  };

  const applyPreset = (preset: AIPreset) => {
    setSelectedPresetId(preset.id);
    setSettings(prev => ({
      ...prev,
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      model: preset.model,
      // Conservar la clave si el usuario ya ingresó una, o dejar vacía si es Ollama local
      apiKey: preset.id === 'ollama' ? '' : prev.apiKey,
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
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Universal API
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Compatible con OpenAI, Google Gemini, DeepSeek, Groq, OpenRouter y Ollama
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
          {/* Master AI Toggle */}
          <div className="p-3.5 rounded-2xl bg-thea-surfaceLight border border-thea-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className={`w-5 h-5 ${settings.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <span className="font-bold text-xs sm:text-sm text-white block">
                  Generación de Preguntas por IA Activa
                </span>
                <span className="text-[11px] text-slate-400">
                  {settings.enabled
                    ? 'Evaluaciones 100% pedagógicas y ancladas generadas por LLM'
                    : 'Modo desactivado'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
                settings.enabled ? 'bg-violet-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  settings.enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Provider Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Selecciona tu Proveedor de IA (Preajustes Rápidos):
              </label>
              <span className={`text-[10px] flex items-center gap-1 font-semibold ${isLocalHost ? 'text-emerald-400' : 'text-cyan-400'}`}>
                <ShieldCheck className="w-3 h-3" />
                {isLocalHost ? 'Proxy Anti-CORS Local Activo' : 'Versión Web (GitHub Pages)'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AI_PRESETS.map(preset => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-violet-500 bg-violet-950/40 text-white ring-1 ring-violet-500/50 shadow-md shadow-violet-900/20'
                        : 'border-thea-border bg-thea-surfaceLight text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold leading-tight text-white block">
                          {preset.name}
                        </span>
                        {preset.freeTier && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                            Gratis
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                    <span className="text-[9px] text-violet-300 mt-2 block font-medium">
                      {preset.model.split('/').pop()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Key acquisition helper banner if cloud provider */}
          {activePreset?.keyUrl && (
            <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-500/30 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Key className="w-4 h-4 text-amber-400 shrink-0" />
                <span>¿No tienes clave de {activePreset.name}? Consíguela gratis:</span>
              </div>
              <a
                href={activePreset.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600 text-violet-200 hover:text-white font-semibold transition-colors shrink-0 text-[11px]"
              >
                <span>Obtener API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Ollama Cloud guidance on static web hosting */}
          {selectedPresetId === 'ollama-cloud' && !isLocalHost && (
            <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 text-xs text-amber-200/90 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 mb-1.5 text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                Compatibilidad en GitHub Pages:
              </div>
              <p className="text-[11px] text-slate-300 mb-2">
                Ollama Cloud no admite peticiones directas desde páginas web estáticas sin backend (bloqueo por política de CORS del navegador).
              </p>
              <p className="text-[11px] text-slate-300 mb-2.5">
                Para generar preguntas en esta versión web de GitHub Pages, te recomendamos activar <strong>Google Gemini</strong> o <strong>Groq Cloud</strong> (ambos son 100% gratuitos y admiten CORS en navegadores).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const groqPreset = AI_PRESETS.find(p => p.id === 'groq');
                    if (groqPreset) applyPreset(groqPreset);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-200 hover:text-white font-semibold text-[11px] transition-colors"
                >
                  Usar Groq Cloud
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const geminiPreset = AI_PRESETS.find(p => p.id === 'gemini');
                    if (geminiPreset) applyPreset(geminiPreset);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600 border border-violet-500/40 text-violet-200 hover:text-white font-semibold text-[11px] transition-colors"
                >
                  Usar Google Gemini
                </button>
              </div>
            </div>
          )}

          {/* Ollama local guidance if selected */}
          {selectedPresetId === 'ollama' && (
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-300">
                <Server className="w-4 h-4 text-amber-400" />
                Instrucciones para Ollama Local en Windows:
              </div>
              <p className="text-[11px] text-slate-300">
                Para permitir llamadas del navegador, inicia Ollama en tu consola ejecutando:
              </p>
              <code className="block bg-black/50 border border-thea-border rounded-lg p-2 font-mono text-[11px] text-amber-300 my-1.5 select-all">
                set OLLAMA_ORIGINS=* && ollama serve
              </code>
              <p className="text-[10px] text-slate-400">
                Asegúrate de haber descargado el modelo con: <code>ollama pull {settings.model || 'llama3.2'}</code>
              </p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-3.5 bg-thea-surfaceLight/60 border border-thea-border/80 rounded-2xl p-4">
            {/* Base URL */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                URL Base del Endpoint API:
              </label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => setSettings(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.groq.com/openai/v1"
                className="w-full px-3 py-2 rounded-xl bg-thea-bg border border-thea-border text-white text-xs font-mono focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300 block">
                  API Key / Token de Acceso:
                </label>
                {activePreset?.id === 'ollama' && (
                  <span className="text-[10px] text-slate-500 italic">No requerida para Ollama local</span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => {
                    const newKey = e.target.value;
                    const updated: AISettings = {
                      ...settings,
                      apiKey: newKey,
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

            {/* API Key de Google Gemini para Podcast */}
            <div className="pt-3 border-t border-thea-border/60">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 text-amber-400" />
                  API Key de Google Gemini para Podcast:
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
                >
                  Obtener clave gratis en AI Studio <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={settings.geminiApiKey || ''}
                  onChange={e => {
                    const newGeminiKey = e.target.value;
                    const updated: AISettings = {
                      ...settings,
                      geminiApiKey: newGeminiKey,
                    };
                    setSettings(updated);
                    saveAISettings(updated);
                    const cleanKey = newGeminiKey.trim();
                    localStorage.setItem('contrareloj_gemini_api_key', cleanKey);
                    const podSettings = savePodcastSettings({ geminiApiKey: cleanKey });
                    const user = authService.getCurrentUser();
                    if (user) {
                      authService.saveUserAISettings(user.id, updated);
                    }
                    if (googleDriveService.getValidAccessToken() || googleDriveService.isLinked()) {
                      googleDriveService.syncAISettingsToDrive(updated).catch(console.warn);
                      googleDriveService.syncPodcastSettingsToDrive(podSettings).catch(console.warn);
                    }
                  }}
                  placeholder="AIzaSy... (Para voces neuronales con emociones Sofía y Mateo)"
                  className="w-full px-3 py-2 pr-10 rounded-xl bg-thea-bg border border-thea-border text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1.5 text-[11px]">
                {settings.geminiApiKey && settings.geminiApiKey.trim().length > 0 ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    Clave de Gemini activa para voces con emociones humanas en el Review Podcast.
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1 text-[10px]">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    Utilizada por Google Gemini Flash Audio TTS para generar locución con prosodia y emociones. 100% gratuita.
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
                onChange={e => setSettings(prev => ({ ...prev, model: e.target.value }))}
                placeholder="llama-3.3-70b-versatile, gemini-1.5-flash, etc."
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
                  {testResult.success ? 'Conexión Exitosa' : 'Fallo de Conexión'}
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          {/* Estado de Respaldo en Google Drive */}
          <div className="pt-1">
            {googleDriveService.getValidAccessToken() ? (
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="leading-snug">
                  Google Drive conectado: Tu API personal y modelo se sincronizan y respaldan automáticamente en la nube.
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-thea-surface border border-thea-border text-slate-400 text-xs flex items-center gap-2.5">
                <Cloud className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="leading-snug">
                  Conecta Google Drive para respaldar tu API personal y sincronizarla en todos tus dispositivos.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 mt-3 border-t border-thea-border shrink-0">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-thea-border bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 text-xs font-semibold text-slate-300 hover:text-white transition-all disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span>Probando conexión...</span>
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
