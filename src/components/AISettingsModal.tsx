import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../services/themeService';
import {
  getAISettings,
  saveAISettings,
  resetAISettingsToDefault,
  testAIConnection,
  DEFAULT_AI_SETTINGS,
  type AISettings,
  getGroqKeyRotationStatus,
  clearGroqKeyCooldown,
  clearGroqAuthCooldown,
  GROQ_PRIMARY_MODEL,
  GROQ_KEY_ROTATION_EVENT,
  type GroqRotationSummary,
} from '../services/aiService';
import { validateGroqApiKey } from '../utils/validation';
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
  Mic,
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import { authService } from '../services/authService';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

function buildSnapshot(key1: string, key2: string): string {
  return JSON.stringify({
    apiKey1: key1.trim(),
    apiKey2: key2.trim(),
  });
}

function formatCooldownRemaining(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isKitty = theme === 'kitty';

  const [apiKey1, setApiKey1] = useState<string>(() => (getAISettings().apiKey || '').trim());
  const [apiKey2, setApiKey2] = useState<string>(() => (getAISettings().groqApiKey || '').trim());
  const [showKey1, setShowKey1] = useState(false);
  const [showKey2, setShowKey2] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [rotationSummary, setRotationSummary] = useState<GroqRotationSummary>(() => getGroqKeyRotationStatus());
  const initialFormSnapshotRef = useRef<string>('');
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    if (!isOpen) {
      setApiKey1('');
      setApiKey2('');
      setShowKey1(false);
      setShowKey2(false);
      setTestResult(null);
      setIsSaved(false);
      return;
    }
    setTestResult(null);
    setIsSaved(false);
    setShowKey1(false);
    setShowKey2(false);

    const current = getAISettings();
    const k1 = (current.apiKey || '').trim();
    const k2 = (current.groqApiKey || '').trim();
    setApiKey1(k1);
    setApiKey2(k2);
    initialFormSnapshotRef.current = buildSnapshot(k1, k2);
    setRotationSummary(getGroqKeyRotationStatus());
  }, [isOpen]);

  const hasAnyModelCooldown =
    rotationSummary.general.isInCooldown ||
    rotationSummary.oral.isInCooldown ||
    rotationSummary.general.models.qwen.isInCooldown ||
    rotationSummary.general.models.gptOss120.isInCooldown ||
    rotationSummary.general.models.whisper.isInCooldown ||
    rotationSummary.oral.models.qwen.isInCooldown ||
    rotationSummary.oral.models.gptOss120.isInCooldown ||
    rotationSummary.oral.models.whisper.isInCooldown;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const syncRotation = () => setRotationSummary(getGroqKeyRotationStatus());
    window.addEventListener(GROQ_KEY_ROTATION_EVENT, syncRotation);
    window.addEventListener('thea_ai_settings_changed', syncRotation);
    const timer = hasAnyModelCooldown ? window.setInterval(syncRotation, 1000) : null;
    return () => {
      window.removeEventListener(GROQ_KEY_ROTATION_EVENT, syncRotation);
      window.removeEventListener('thea_ai_settings_changed', syncRotation);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [isOpen, hasAnyModelCooldown]);

  const key1Validation = useMemo(() => validateGroqApiKey(apiKey1, true), [apiKey1]);
  const key2Validation = useMemo(() => validateGroqApiKey(apiKey2, true), [apiKey2]);
  const hasAnyEnteredKey = Boolean(apiKey1.trim() || apiKey2.trim());
  const areKeysIdentical = Boolean(apiKey1.trim() && apiKey2.trim() && apiKey1.trim() === apiKey2.trim());
  const isFormValid = key1Validation.isValid && key2Validation.isValid;

  const persistKeys = (nextKey1: string, nextKey2: string): AISettings => {
    const clean1 = nextKey1.trim();
    const clean2 = nextKey2.trim();
    const prev = getAISettings();

    if (clean1 && clean1 !== (prev.apiKey || '').trim()) {
      clearGroqKeyCooldown(clean1);
    }
    if (clean2 && clean2 !== (prev.groqApiKey || '').trim()) {
      clearGroqKeyCooldown(clean2);
    }

    const updated: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: GROQ_BASE_URL,
      apiKey: clean1,
      model: GROQ_PRIMARY_MODEL,
      groqBaseUrl: GROQ_BASE_URL,
      groqApiKey: clean2,
      groqModel: GROQ_PRIMARY_MODEL,
      grokBaseUrl: GROQ_BASE_URL,
      grokApiKey: clean2,
      grokModel: GROQ_PRIMARY_MODEL,
      verified: Boolean(clean1 || clean2),
      updatedAt: Date.now(),
    };

    saveAISettings(updated, 'both');
    const saved = getAISettings();
    setRotationSummary(getGroqKeyRotationStatus());
    return saved;
  };

  const handleTestConnection = async () => {
    if (!isFormValid) {
      setTestResult({
        success: false,
        message: key1Validation.error || key2Validation.error || 'Revisa el formato de las API keys.',
      });
      return;
    }
    const clean1 = apiKey1.trim();
    const clean2 = apiKey2.trim();
    if (!clean1 && !clean2) {
      setTestResult({
        success: false,
        message: 'Ingresa al menos una API Key de Groq Cloud (gsk_...) para probar la conexión.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const checks: Array<{ label: string; key: string }> = [];
      if (clean1) checks.push({ label: 'API 1', key: clean1 });
      if (clean2) checks.push({ label: 'API 2', key: clean2 });

      const results = await Promise.all(
        checks.map(async (item) => {
          const res = await testAIConnection({
            ...DEFAULT_AI_SETTINGS,
            baseUrl: GROQ_BASE_URL,
            model: GROQ_PRIMARY_MODEL,
            apiKey: item.key,
          });
          if (res.success) {
            clearGroqAuthCooldown(item.key);
          }
          return { ...item, res };
        })
      );

      const allOk = results.every(r => r.res.success);
      const summaryLines = results.map(r =>
        `${r.label}: ${r.res.success ? 'Conectada' : r.res.message}`
      );
      setTestResult({
        success: allOk,
        message: summaryLines.join(' · '),
      });

      if (allOk) {
        const persisted = persistKeys(clean1, clean2);
        initialFormSnapshotRef.current = buildSnapshot(clean1, clean2);
        const user = authService.getCurrentUser();
        if (user) {
          authService.saveUserAISettings(user.id, persisted);
        }
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetDefaults = () => {
    resetAISettingsToDefault();
    setApiKey1('');
    setApiKey2('');
    setTestResult(null);
    setRotationSummary(getGroqKeyRotationStatus());
    initialFormSnapshotRef.current = buildSnapshot('', '');
    const user = authService.getCurrentUser();
    if (user) {
      authService.clearUserAISettings(user.id);
    }
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.syncAISettingsToDrive({
        ...DEFAULT_AI_SETTINGS,
        updatedAt: Date.now(),
      }).catch(console.warn);
    }
    if (onSettingsSaved) onSettingsSaved();
  };

  const syncUserAndDrive = (saved: AISettings) => {
    const user = authService.getCurrentUser();
    if (user) {
      authService.saveUserAISettings(user.id, saved);
    }
    googleDriveService.syncAISettingsToDrive(saved).catch(err => {
      console.warn('[AISettingsModal] Error al respaldar API en Google Drive:', err);
    });
  };

  const handleClose = () => {
    const currentSnapshot = buildSnapshot(apiKey1, apiKey2);
    if (currentSnapshot === initialFormSnapshotRef.current) {
      onClose();
      return;
    }
    if (isFormValid) {
      const saved = persistKeys(apiKey1, apiKey2);
      syncUserAndDrive(saved);
      if (onSettingsSaved) onSettingsSaved();
    }
    onClose();
  };

  const handleSave = () => {
    if (!isFormValid) return;

    const saved = persistKeys(apiKey1, apiKey2);
    initialFormSnapshotRef.current = buildSnapshot(apiKey1, apiKey2);
    syncUserAndDrive(saved);

    setIsSaved(true);
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 350);
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const strongText = isDark ? 'text-white' : 'text-zinc-950';
  const mutedText = isDark ? 'text-zinc-400' : isKitty ? 'text-pink-900/75' : 'text-slate-600';
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

  const role1 = rotationSummary.general;
  const role2 = rotationSummary.oral;

  const renderRoleBadge = (
    role: typeof role1,
    testId: string,
    isApi1: boolean
  ) => {
    const activeGeneral = rotationSummary.activeGeneralStep;
    const isServingStep = Boolean(
      activeGeneral &&
      !activeGeneral.isInCooldown &&
      activeGeneral.role === (isApi1 ? 'general' : 'oral') &&
      activeGeneral.stage > 1
    );

    const statusLabel = !role.hasKey
      ? 'Sin clave'
      : isServingStep && activeGeneral
      ? `En uso (${activeGeneral.modelShortLabel})`
      : role.isInCooldown
      ? `Pausada · ${formatCooldownRemaining(role.cooldownRemainingMs)}`
      : role.isActingAsBackupFor
      ? `En uso (Respaldo)`
      : 'Activa';

    const statusClass = !role.hasKey
      ? isDark
        ? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
        : 'bg-slate-100 text-slate-700 border-slate-200'
      : isServingStep || role.isActingAsBackupFor
      ? isDark
        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
        : 'bg-cyan-50 text-cyan-800 border-cyan-200'
      : role.isInCooldown
      ? isDark
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/35'
        : 'bg-amber-50 text-amber-800 border-amber-200'
      : isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';

    return (
      <span
        data-testid={testId}
        title={role.reason || statusLabel}
        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 tabular-nums ${statusClass}`}
      >
        {statusLabel}
      </span>
    );
  };

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
              <div className="flex items-center gap-2 flex-wrap">
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
                  Groq Cloud Automático
                </span>
              </div>
              <p className={`text-xs ${mutedText}`}>
                Ingresa tus 2 API keys de Groq Cloud; modelos y rotación son 100% automáticos
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
        <div className="flex-1 overflow-y-auto modal-smooth-scroll overscroll-contain space-y-4 pr-1">
          {/* Master AI Status */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${cardSurface}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Cpu className={`w-5 h-5 shrink-0 ${hasAnyEnteredKey ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div className="min-w-0">
                <span className={`font-bold text-xs sm:text-sm block ${strongText}`}>
                  {hasAnyEnteredKey ? 'Sistema Groq Automatizado Listo' : 'Configura tus API Keys para comenzar'}
                </span>
                <span className={`text-[11px] flex items-center gap-1 ${mutedText}`}>
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  <span>{isLocalHost ? 'Localhost · Sincronizado con Google Drive al iniciar sesión' : 'Respaldado automáticamente en tu Google Drive'}</span>
                </span>
              </div>
            </div>

            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold shrink-0 ${
              hasAnyEnteredKey
                ? isDark
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : isDark
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{hasAnyEnteredKey ? 'Activo' : 'Sin claves'}</span>
            </div>
          </div>

          {/* Cascada Automática (Qwen 1->2, GPT-OSS 120B 1->2, Whisper en API 2) */}
          <div className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-2 shadow-sm ${
            isDark
              ? 'bg-violet-950/35 border-violet-500/30 text-zinc-300'
              : isKitty
              ? 'bg-pink-50/70 border-pink-200 text-zinc-800'
              : 'bg-violet-50/70 border-violet-200 text-slate-700'
          }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-violet-300' : 'text-violet-800'}`}>
                <Settings className="w-4 h-4 shrink-0" />
                <span>Cascada automática Qwen → GPT-OSS 120B + Whisper:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {rotationSummary.activeGeneralStep && (
                  <span
                    data-testid="groq-active-cascade-step"
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 tabular-nums ${
                      rotationSummary.activeGeneralStep.isInCooldown
                        ? isDark
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                        : isDark
                        ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/35'
                        : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                    }`}
                  >
                    {rotationSummary.activeGeneralStep.isInCooldown
                      ? 'Todas en pausa'
                      : `Paso ${rotationSummary.activeGeneralStep.stage}/${rotationSummary.activeGeneralStep.totalStages} · ${rotationSummary.activeGeneralStep.modelShortLabel} (${rotationSummary.activeGeneralStep.role === 'general' ? 'API 1' : 'API 2'})`}
                  </span>
                )}
                <span
                  data-testid="groq-rotation-pair-badge"
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    rotationSummary.hasDistinctPair
                      ? isDark
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : isDark
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {rotationSummary.hasDistinctPair ? 'Rotación 2 claves activa' : 'Configura 2 claves distintas'}
                </span>
              </div>
            </div>

            <div className={`text-[11px] leading-relaxed space-y-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
              <p>
                <strong className={strongText}>Toda la IA:</strong> usa <strong className={strongText}>Qwen</strong> en API 1 → API 2 y al agotarse salta automáticamente a <strong className={strongText}>GPT-OSS 120B</strong> en API 1 → API 2.
              </p>
              <p className="flex items-start gap-1.5">
                <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <strong className={strongText}>Lección Oral (Voz):</strong> prioriza siempre <strong className={strongText}>Whisper</strong> desde la <strong className={strongText}>API 2</strong> (usando API 1 únicamente si API 2 falta o agota su cuota).
                </span>
              </p>
            </div>

            {rotationSummary.generalCascade.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
                {rotationSummary.generalCascade.map(step => (
                  <div
                    key={`${step.stage}-${step.role}-${step.model}`}
                    data-testid={`groq-cascade-step-${step.stage}`}
                    title={step.reason || `${step.model} (${step.roleLabel})`}
                    className={`px-2 py-1 rounded-lg border text-[10px] leading-tight flex flex-col gap-0.5 tabular-nums ${
                      step.isActive
                        ? isDark
                          ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                        : step.isInCooldown
                        ? isDark
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300/90'
                          : 'bg-amber-50/90 border-amber-200 text-amber-800'
                        : isDark
                        ? 'bg-white/[0.03] border-white/10 text-zinc-400'
                        : 'bg-white/80 border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="font-bold truncate">
                      {step.stage}. {step.modelShortLabel}
                    </span>
                    <span className="text-[9px] opacity-85 truncate">
                      {step.role === 'general' ? 'API 1' : 'API 2'}
                      {step.isInCooldown
                        ? ` · ${formatCooldownRemaining(step.cooldownRemainingMs)}`
                        : step.isActive
                        ? ' · En uso'
                        : ' · Lista'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API Key 1 */}
          <div className={`space-y-2 border rounded-2xl p-4 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <label htmlFor="groq-api-key-1" className={`text-xs font-bold ${strongText}`}>
                  API Key 1 (Principal)
                </label>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                    : 'bg-violet-100 text-violet-800 border-violet-200'
                }`}>
                  Qwen + GPT-OSS · Prioridad 1
                </span>
                {renderRoleBadge(role1, 'groq-status-groq-general', true)}
              </div>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-0.5 text-[10px] underline ${
                  isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-700 hover:text-violet-900'
                }`}
              >
                <span>console.groq.com/keys</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="relative">
              <input
                id="groq-api-key-1"
                data-testid="groq-api-key-1"
                type={showKey1 ? 'text' : 'password'}
                value={apiKey1}
                onChange={e => {
                  setTestResult(null);
                  setApiKey1(e.target.value);
                }}
                placeholder="gsk_... (vacía por defecto)"
                className={`w-full px-3 py-2.5 pr-10 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(key1Validation.isValid)}`}
              />
              <button
                type="button"
                onClick={() => setShowKey1(s => !s)}
                aria-label={showKey1 ? 'Ocultar API Key 1' : 'Mostrar API Key 1'}
                className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors ${mutedText} hover:opacity-100`}
              >
                {showKey1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {!key1Validation.isValid && (
              <p className="text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{key1Validation.error}</span>
              </p>
            )}

            {role1.hasKey && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {[role1.models.qwen, role1.models.gptOss120].map(m => (
                  <span
                    key={`k1-${m.model}`}
                    title={m.reason || m.model}
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border tabular-nums ${
                      m.isInCooldown
                        ? isDark
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                        : isDark
                        ? 'bg-white/[0.04] text-zinc-300 border-white/10'
                        : 'bg-white/90 text-slate-700 border-slate-200'
                    }`}
                  >
                    {m.shortLabel}: {m.isInCooldown ? formatCooldownRemaining(m.remainingMs) : 'OK'}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* API Key 2 */}
          <div className={`space-y-2 border rounded-2xl p-4 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <label htmlFor="groq-api-key-2" className={`text-xs font-bold ${strongText}`}>
                  API Key 2 (Respaldo & Whisper)
                </label>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}>
                  Whisper + Respaldo
                </span>
                {renderRoleBadge(role2, 'groq-status-groq', false)}
              </div>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-0.5 text-[10px] underline shrink-0 ${
                  isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-700 hover:text-violet-900'
                }`}
              >
                <span>console.groq.com/keys</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="relative">
              <input
                id="groq-api-key-2"
                data-testid="groq-api-key-2"
                type={showKey2 ? 'text' : 'password'}
                value={apiKey2}
                onChange={e => {
                  setTestResult(null);
                  setApiKey2(e.target.value);
                }}
                placeholder="gsk_... (vacía por defecto · voz Whisper + respaldo)"
                className={`w-full px-3 py-2.5 pr-10 rounded-xl border text-xs font-mono focus:outline-none transition-colors ${inputSurface} ${inputBorder(key2Validation.isValid)}`}
              />
              <button
                type="button"
                onClick={() => setShowKey2(s => !s)}
                aria-label={showKey2 ? 'Ocultar API Key 2' : 'Mostrar API Key 2'}
                className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors ${mutedText} hover:opacity-100`}
              >
                {showKey2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {!key2Validation.isValid && (
              <p className="text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{key2Validation.error}</span>
              </p>
            )}

            {areKeysIdentical && (
              <p className={`text-[11px] font-medium flex items-center gap-1.5 ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Usa una clave distinta en API Key 2 para habilitar la rotación de cuota.</span>
              </p>
            )}

            {role2.hasKey && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {[role2.models.whisper, role2.models.qwen, role2.models.gptOss120].map(m => (
                  <span
                    key={`k2-${m.model}`}
                    title={m.reason || m.model}
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border tabular-nums ${
                      m.isInCooldown
                        ? isDark
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                        : isDark
                        ? 'bg-white/[0.04] text-zinc-300 border-white/10'
                        : 'bg-white/90 text-slate-700 border-slate-200'
                    }`}
                  >
                    {m.shortLabel}: {m.isInCooldown ? formatCooldownRemaining(m.remainingMs) : 'OK'}
                  </span>
                ))}
              </div>
            )}
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
                  {testResult.success ? 'Conexión Exitosa con Groq Cloud' : 'Fallo de Conexión con Groq Cloud'}
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className={`flex items-center justify-between gap-2 sm:gap-3 pt-4 mt-3 border-t shrink-0 flex-wrap ${
          isDark ? 'border-white/[0.06]' : isKitty ? 'border-pink-100' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !isFormValid || !hasAnyEnteredKey}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-[transform,background-color,color] duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] ${
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
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-[transform,background-color,color] duration-150 ease-out cursor-pointer active:scale-[0.97] ${
                isDark
                  ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-zinc-300 hover:text-white'
                  : 'border-slate-200 bg-slate-100 hover:bg-slate-200/70 text-slate-800'
              }`}
              title="Vaciar ambas API keys y reiniciar estado de rotación"
            >
              <RefreshCw className="w-3.5 h-3.5 opacity-70" />
              <span>Vaciar Claves</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!isFormValid}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition-[transform,background-color] duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97] ${
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
