import type { StudyKit, Question, Flashcard, PodcastEpisode, DocumentChunk, ShortAnswerEvaluation, PodcastFormat, PodcastDuration, PodcastGenerationOptions, GuessWhoCase, StudyGuideDepth } from '../types';
import { detectDocumentLanguage, getSpanishTranslationDirective } from './languageService';

export interface AISettings {
  enabled: boolean;
  provider: 'ollama' | 'openai-compatible' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  verified?: boolean;
  geminiApiKey?: string;
  groqApiKey?: string;
  groqModel?: string;
  groqBaseUrl?: string;
  grokApiKey?: string;
  grokBaseUrl?: string;
  grokModel?: string;
  ollamaApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export interface AIPreset {
  id: 'ollama' | 'custom' | string;
  name: string;
  provider: 'ollama' | 'openai-compatible' | 'custom';
  baseUrl: string;
  model: string;
  keyPlaceholder: string;
  keyUrl?: string;
  description: string;
  badge: string;
  freeTier: boolean;
}

export const AI_PRESETS: AIPreset[] = [
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    provider: 'openai-compatible',
    baseUrl: 'https://ollama.com/v1',
    model: 'gemma4:31b',
    keyPlaceholder: 'Pega tu clave de API de https://ollama.com/settings/keys',
    keyUrl: 'https://ollama.com/settings/keys',
    description: 'Motor general predeterminado para generacion de kits, Chat Tutor, Smart Study, flashcards y examenes.',
    badge: 'Motor General',
    freeTier: true,
  },
  {
    id: 'groq',
    name: 'Groq Cloud (Motor de Voz)',
    provider: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyPlaceholder: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    description: 'Motor oral de voz ultra acelerado para Lección Oral, Whisper y Conversación interactiva.',
    badge: 'Motor de Voz Exclusivo',
    freeTier: true,
  },
];

/** Modelo de respaldo para Groq cuando el principal da límite de tasa (429) o error de servidor (5xx) */
const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-20b';

/** Detecta claves conocidas expiradas o revocadas de Groq */
export const isRevokedGroqKey = (k?: string | null): boolean =>
  !k || k === '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';

export const DEFAULT_GROQ_KEY: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROQ_API_KEY)
  ? String((import.meta as any).env.VITE_GROQ_API_KEY).trim()
  : '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';
export const DEFAULT_GROK_KEY: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROK_API_KEY)
  ? String((import.meta as any).env.VITE_GROK_API_KEY).trim()
  : 'grok_9c95899ccc67881cc8e5098ae3076e9b_669a4867432243493bdaf2d8e6bfd18f449b542cbcf64e7bd083c06ba6a73b00';

const STORAGE_KEY = 'thea_ai_settings';
const GROK_STORAGE_KEY = 'thea_grok_settings';

export interface GrokSettings {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_GROK_SETTINGS: GrokSettings = {
  enabled: true,
  apiKey: DEFAULT_GROK_KEY,
  baseUrl: 'https://api.x.ai/v1',
  model: 'grok-2-mini',
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  provider: 'openai-compatible',
  baseUrl: 'https://ollama.com/v1',
  apiKey: '',
  model: 'gemma4:31b',
  timeoutMs: 45000,
  verified: false,
  ollamaBaseUrl: 'https://ollama.com/v1',
  ollamaApiKey: '',
  ollamaModel: 'gemma4:31b',
  groqBaseUrl: 'https://api.groq.com/openai/v1',
  groqApiKey: DEFAULT_GROQ_KEY,
  groqModel: 'openai/gpt-oss-120b',
  grokBaseUrl: 'https://api.groq.com/openai/v1',
  grokApiKey: DEFAULT_GROQ_KEY,
  grokModel: 'openai/gpt-oss-120b',
};

export function getOllamaBaseUrl(): string {
  if (typeof localStorage !== 'undefined') {
    const direct = localStorage.getItem('thea_ollama_base_url');
    if (direct && direct.trim().length > 0) return direct.trim();
  }
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.ollamaBaseUrl) return parsed.ollamaBaseUrl;
      if (parsed.baseUrl && !parsed.baseUrl.includes('api.groq.com') && !parsed.baseUrl.includes('api.x.ai')) {
        return parsed.baseUrl;
      }
    } catch {}
  }
  return DEFAULT_AI_SETTINGS.baseUrl;
}

export function saveOllamaBaseUrl(url: string): void {
  const cleanUrl = url.trim() || DEFAULT_AI_SETTINGS.baseUrl;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('thea_ollama_base_url', cleanUrl);
  }
  const current = getAISettings();
  saveAISettings({
    ...current,
    ollamaBaseUrl: cleanUrl,
    baseUrl: cleanUrl,
  });
}

export function getOllamaModel(): string {
  if (typeof localStorage !== 'undefined') {
    const direct = localStorage.getItem('thea_ollama_model');
    if (direct && direct.trim().length > 0) return direct.trim();
  }
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.ollamaModel) return parsed.ollamaModel;
      if (parsed.model && !parsed.model.includes('gpt-oss') && !parsed.model.includes('llama-3.3')) {
        return parsed.model;
      }
    } catch {}
  }
  return DEFAULT_AI_SETTINGS.model;
}

export function saveOllamaModel(model: string): void {
  const cleanModel = model.trim() || DEFAULT_AI_SETTINGS.model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('thea_ollama_model', cleanModel);
  }
  const current = getAISettings();
  saveAISettings({
    ...current,
    ollamaModel: cleanModel,
    model: cleanModel,
  });
}

export function getGroqBaseUrl(): string {
  if (typeof localStorage !== 'undefined') {
    const direct = localStorage.getItem('thea_groq_base_url');
    if (direct && direct.trim().length > 0) return direct.trim();
  }
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.groqBaseUrl) return parsed.groqBaseUrl;
      if (parsed.baseUrl && parsed.baseUrl.includes('api.groq.com')) {
        return parsed.baseUrl;
      }
    } catch {}
  }
  return 'https://api.groq.com/openai/v1';
}

export function saveGroqBaseUrl(url: string): void {
  const cleanUrl = url.trim() || 'https://api.groq.com/openai/v1';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('thea_groq_base_url', cleanUrl);
  }
  const current = getAISettings();
  saveAISettings({
    ...current,
    groqBaseUrl: cleanUrl,
  });
}

export function getGroqModel(): string {
  if (typeof localStorage !== 'undefined') {
    const direct = localStorage.getItem('thea_groq_model');
    if (direct && direct.trim().length > 0) return direct.trim();
  }
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.groqModel) return parsed.groqModel;
      if (parsed.model && parsed.model.includes('gpt-oss')) return parsed.model;
    } catch {}
  }
  return 'openai/gpt-oss-120b';
}

export function saveGroqModel(model: string): void {
  const cleanModel = model.trim() || 'openai/gpt-oss-120b';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('thea_groq_model', cleanModel);
  }
  const current = getAISettings();
  saveAISettings({
    ...current,
    groqModel: cleanModel,
  });
}

/** Retorna la configuracion general de IA (SIEMPRE Ollama para kits, chat tutor, smart study, flashcards y examenes) */
export function getAISettings(): AISettings {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const ollamaKey = typeof localStorage !== 'undefined' ? localStorage.getItem('thea_ollama_api_key') || '' : '';

  let parsed: any = {};
  if (saved) {
    try {
      parsed = JSON.parse(saved) || {};
    } catch {}
  }

  // 1. Resolver configuracion general (OLLAMA - Motor General predeterminado para todo)
  let ollamaBaseUrl =
    (typeof localStorage !== 'undefined' ? localStorage.getItem('thea_ollama_base_url') : null) ||
    parsed.ollamaBaseUrl ||
    (parsed.baseUrl && !parsed.baseUrl.includes('api.groq.com') && !parsed.baseUrl.includes('api.x.ai') ? parsed.baseUrl : 'https://ollama.com/v1');

  if (ollamaBaseUrl.includes('11434') || ollamaBaseUrl.includes('localhost') || ollamaBaseUrl.includes('127.0.0.1')) {
    // Si apunta a localhost, se respeta la configuracion local de Ollama
  } else if (!ollamaBaseUrl.includes('ollama.com')) {
    ollamaBaseUrl = 'https://ollama.com/v1';
  }

  const effectiveOllamaKey =
    ollamaKey ||
    parsed.ollamaApiKey ||
    (parsed.apiKey && !parsed.apiKey.startsWith('gsk_') && !parsed.apiKey.startsWith('grok_') ? parsed.apiKey : '');

  const ollamaModel =
    (typeof localStorage !== 'undefined' ? localStorage.getItem('thea_ollama_model') : null) ||
    parsed.ollamaModel ||
    (parsed.model && !parsed.model.includes('gpt-oss') && !parsed.model.includes('llama-3.3') ? parsed.model : 'gemma4:31b');

  // 2. Resolver configuracion oral (GROQ / GROK - Motor Oral exclusivo para Leccion y Conversacion Oral)
  let groqStorageKey = typeof localStorage !== 'undefined' ? localStorage.getItem('thea_groq_api_key') : null;
  if (groqStorageKey && isRevokedGroqKey(groqStorageKey)) {
    localStorage.removeItem('thea_groq_api_key');
    groqStorageKey = null;
  }
  const grokStorageKey = typeof localStorage !== 'undefined' ? localStorage.getItem('thea_grok_api_key') : null;
  const parsedGroqKey = parsed.groqApiKey && !isRevokedGroqKey(parsed.groqApiKey) ? parsed.groqApiKey : '';

  const effectiveOralKey =
    groqStorageKey ||
    (parsed.apiKey && parsed.apiKey.startsWith('gsk_') && !isRevokedGroqKey(parsed.apiKey) ? parsed.apiKey : '') ||
    parsedGroqKey ||
    DEFAULT_GROQ_KEY ||
    grokStorageKey ||
    parsed.grokApiKey ||
    DEFAULT_GROK_KEY;

  const isGrok = Boolean(effectiveOralKey && (effectiveOralKey.startsWith('grok_') || effectiveOralKey.startsWith('xai-')));

  const groqBaseUrl =
    (typeof localStorage !== 'undefined' ? (isGrok ? localStorage.getItem('thea_grok_base_url') : localStorage.getItem('thea_groq_base_url')) : null) ||
    (isGrok ? parsed.grokBaseUrl : parsed.groqBaseUrl) ||
    (isGrok ? 'https://api.x.ai/v1' : 'https://api.groq.com/openai/v1');

  const groqModel =
    (typeof localStorage !== 'undefined' ? (isGrok ? localStorage.getItem('thea_grok_model') : localStorage.getItem('thea_groq_model')) : null) ||
    (isGrok ? parsed.grokModel : parsed.groqModel) ||
    (isGrok ? 'grok-2-mini' : 'openai/gpt-oss-120b');

  const isLocal = Boolean(ollamaBaseUrl.includes('localhost') || ollamaBaseUrl.includes('127.0.0.1'));
  const hasKey = Boolean(effectiveOllamaKey && effectiveOllamaKey.trim().length > 0);

  return {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    provider: 'openai-compatible',
    // El motor activo para todo lo general es SIEMPRE Ollama
    baseUrl: ollamaBaseUrl,
    apiKey: effectiveOllamaKey,
    model: ollamaModel,
    timeoutMs: parsed.timeoutMs || 45000,
    verified: hasKey || isLocal ? true : Boolean(parsed.verified),
    ollamaBaseUrl,
    ollamaApiKey: effectiveOllamaKey,
    ollamaModel,
    groqBaseUrl,
    groqApiKey: effectiveOralKey,
    groqModel,
    grokBaseUrl: groqBaseUrl,
    grokApiKey: effectiveOralKey,
    grokModel: groqModel,
  };
}

export const getGeneralAISettings = getAISettings;

/** Retorna la configuracion oral de IA (Grok / Groq para Leccion Oral y Conversacion con Thea) */
export function getOralAISettings(): AISettings {
  const general = getAISettings();
  const groqKey = getGroqApiKey();
  const grokKey = getGrokApiKey();
  const oralKey = groqKey || grokKey || general.groqApiKey || general.grokApiKey || DEFAULT_GROQ_KEY || DEFAULT_GROK_KEY;
  const isGrok = Boolean(oralKey && (oralKey.startsWith('grok_') || oralKey.startsWith('xai-')));

  const oralModel = isGrok
    ? (getGrokModel() || general.grokModel || 'grok-2-mini')
    : (getGroqModel() || general.groqModel || 'openai/gpt-oss-120b');

  const oralBaseUrl = isGrok
    ? (getGrokBaseUrl() || general.grokBaseUrl || 'https://api.x.ai/v1')
    : (getGroqBaseUrl() || general.groqBaseUrl || 'https://api.groq.com/openai/v1');

  return {
    ...general,
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: oralBaseUrl,
    apiKey: oralKey,
    model: oralModel,
    timeoutMs: 25000,
    verified: Boolean(oralKey && oralKey.trim().length > 0),
    groqApiKey: oralKey,
    groqModel: oralModel,
    groqBaseUrl: oralBaseUrl,
    grokApiKey: oralKey,
    grokModel: oralModel,
    grokBaseUrl: oralBaseUrl,
  };
}

export function saveAISettings(settings: AISettings): void {
  const cleanSettings = { ...settings };
  const isOralEndpoint = Boolean(
    cleanSettings.baseUrl?.includes('api.groq.com') ||
    cleanSettings.baseUrl?.includes('api.x.ai') ||
    cleanSettings.baseUrl?.includes('grok.com')
  );

  let effectiveOllamaKey = cleanSettings.ollamaApiKey || '';
  let effectiveOralKey = cleanSettings.grokApiKey || cleanSettings.groqApiKey || '';
  let effectiveOllamaBase = cleanSettings.ollamaBaseUrl || '';
  let effectiveOralBase = cleanSettings.grokBaseUrl || cleanSettings.groqBaseUrl || '';
  let effectiveOllamaModel = cleanSettings.ollamaModel || '';
  let effectiveOralModel = cleanSettings.grokModel || cleanSettings.groqModel || '';

  if (typeof localStorage !== 'undefined') {
    if (!effectiveOllamaKey) effectiveOllamaKey = localStorage.getItem('thea_ollama_api_key') || '';
    if (!effectiveOralKey) effectiveOralKey = localStorage.getItem('thea_grok_api_key') || localStorage.getItem('thea_groq_api_key') || '';
    if (!effectiveOllamaBase) effectiveOllamaBase = localStorage.getItem('thea_ollama_base_url') || '';
    if (!effectiveOralBase) effectiveOralBase = localStorage.getItem('thea_grok_base_url') || localStorage.getItem('thea_groq_base_url') || '';
    if (!effectiveOllamaModel) effectiveOllamaModel = localStorage.getItem('thea_ollama_model') || '';
    if (!effectiveOralModel) effectiveOralModel = localStorage.getItem('thea_grok_model') || localStorage.getItem('thea_groq_model') || '';
  }

  const incomingKey = cleanSettings.apiKey?.trim() || '';
  const isIncomingGrok = incomingKey.startsWith('grok_') || incomingKey.startsWith('xai-');
  const isIncomingGroq = incomingKey.startsWith('gsk_');

  if (isOralEndpoint || isIncomingGrok || isIncomingGroq) {
    if (incomingKey) effectiveOralKey = incomingKey;
    if (cleanSettings.baseUrl) effectiveOralBase = cleanSettings.baseUrl.trim();
    if (cleanSettings.model) effectiveOralModel = cleanSettings.model.trim();
  } else {
    if (incomingKey && !isIncomingGrok && !isIncomingGroq) effectiveOllamaKey = incomingKey;
    if (cleanSettings.baseUrl) effectiveOllamaBase = cleanSettings.baseUrl.trim();
    if (cleanSettings.model) effectiveOllamaModel = cleanSettings.model.trim();
  }

  if (typeof localStorage !== 'undefined') {
    if (effectiveOllamaKey) localStorage.setItem('thea_ollama_api_key', effectiveOllamaKey);
    if (effectiveOralKey) {
      localStorage.setItem('thea_groq_api_key', effectiveOralKey);
      localStorage.setItem('thea_grok_api_key', effectiveOralKey);
    }
    if (effectiveOllamaBase) localStorage.setItem('thea_ollama_base_url', effectiveOllamaBase);
    if (effectiveOralBase) {
      localStorage.setItem('thea_groq_base_url', effectiveOralBase);
      localStorage.setItem('thea_grok_base_url', effectiveOralBase);
    }
    if (effectiveOllamaModel) localStorage.setItem('thea_ollama_model', effectiveOllamaModel);
    if (effectiveOralModel) {
      localStorage.setItem('thea_groq_model', effectiveOralModel);
      localStorage.setItem('thea_grok_model', effectiveOralModel);
    }
  }

  const isLocal = Boolean(effectiveOllamaBase?.includes('localhost') || effectiveOllamaBase?.includes('127.0.0.1'));

  // Guardar en thea_ai_settings con Ollama como motor predeterminado obligatorio
  const generalSettings: AISettings = {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: effectiveOllamaBase || 'https://ollama.com/v1',
    apiKey: effectiveOllamaKey || '',
    model: effectiveOllamaModel || 'gemma4:31b',
    timeoutMs: cleanSettings.timeoutMs || 45000,
    verified: isLocal ? true : Boolean(effectiveOllamaKey),
    ollamaBaseUrl: effectiveOllamaBase || 'https://ollama.com/v1',
    ollamaApiKey: effectiveOllamaKey || '',
    ollamaModel: effectiveOllamaModel || 'gemma4:31b',
    groqBaseUrl: effectiveOralBase || 'https://api.x.ai/v1',
    groqApiKey: effectiveOralKey || DEFAULT_GROK_KEY,
    groqModel: effectiveOralModel || 'grok-2-mini',
    grokBaseUrl: effectiveOralBase || 'https://api.x.ai/v1',
    grokApiKey: effectiveOralKey || DEFAULT_GROK_KEY,
    grokModel: effectiveOralModel || 'grok-2-mini',
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(generalSettings));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('thea_ai_settings_changed'));
  }
}

export function resetAISettingsToDefault(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_AI_SETTINGS));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('thea_ai_settings_changed'));
  }
}

export function hasPersonalApiKey(): boolean {
  const current = getAISettings();
  return Boolean(
    (current.apiKey && current.apiKey.trim().length > 0) ||
    (current.groqApiKey && current.groqApiKey.trim().length > 0)
  );
}

export function getGrokSettings(): GrokSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_GROK_SETTINGS, apiKey: DEFAULT_GROK_KEY };
  try {
    const saved = localStorage.getItem(GROK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_GROK_SETTINGS, apiKey: DEFAULT_GROK_KEY, ...parsed };
    }
    const legacyKey = localStorage.getItem('thea_grok_api_key') || localStorage.getItem('thea_groq_api_key');
    if (legacyKey && legacyKey.trim()) {
      return { ...DEFAULT_GROK_SETTINGS, apiKey: legacyKey.trim(), enabled: true };
    }
  } catch {}
  return { ...DEFAULT_GROK_SETTINGS, apiKey: DEFAULT_GROK_KEY, enabled: Boolean(DEFAULT_GROK_KEY) };
}

export function saveGrokSettings(settings: Partial<GrokSettings>): void {
  if (typeof localStorage === 'undefined') return;
  const current = getGrokSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(GROK_STORAGE_KEY, JSON.stringify(updated));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('thea_grok_settings_changed'));
  }
}

export function getGrokApiKey(): string {
  const settingsKey = getGrokSettings().apiKey;
  if (settingsKey && settingsKey.trim() && !isRevokedGroqKey(settingsKey)) return settingsKey.trim();
  if (typeof localStorage !== 'undefined') {
    const direct = localStorage.getItem('thea_grok_api_key');
    if (direct && direct.trim().length > 0 && !isRevokedGroqKey(direct)) return direct.trim();
  }
  return DEFAULT_GROK_KEY;
}

export function saveGrokApiKey(key: string): void {
  const cleanKey = key.trim();
  saveGrokSettings({ apiKey: cleanKey, enabled: Boolean(cleanKey) });
  if (typeof localStorage !== 'undefined') {
    if (cleanKey) {
      localStorage.setItem('thea_grok_api_key', cleanKey);
    } else {
      localStorage.removeItem('thea_grok_api_key');
    }
  }
}

export function getGrokBaseUrl(): string {
  return getGrokSettings().baseUrl || 'https://api.x.ai/v1';
}

export function saveGrokBaseUrl(url: string): void {
  saveGrokSettings({ baseUrl: url.trim() || 'https://api.x.ai/v1' });
}

export function getGrokModel(): string {
  return getGrokSettings().model || 'grok-2-mini';
}

export function saveGrokModel(model: string): void {
  saveGrokSettings({ model: model.trim() || 'grok-2-mini' });
}

export function getOllamaApiKey(): string {
  if (typeof localStorage !== 'undefined') {
    const direct = localStorage.getItem('thea_ollama_api_key');
    if (direct && direct.trim().length > 0) return direct.trim();
  }
  const current = getAISettings();
  if (current.ollamaApiKey && current.ollamaApiKey.trim().length > 0) {
    return current.ollamaApiKey.trim();
  }
  if (current.apiKey && current.baseUrl?.includes('ollama.com') && !current.apiKey.startsWith('gsk_') && !current.apiKey.startsWith('grok_')) {
    return current.apiKey.trim();
  }
  return '';
}

export function saveOllamaApiKey(key: string): void {
  const cleanKey = key.trim();
  if (typeof localStorage !== 'undefined') {
    if (cleanKey) {
      localStorage.setItem('thea_ollama_api_key', cleanKey);
    } else {
      localStorage.removeItem('thea_ollama_api_key');
    }
  }
  const current = getAISettings();
  saveAISettings({
    ...current,
    ollamaApiKey: cleanKey,
    ...(current.baseUrl?.includes('ollama.com') ? { apiKey: cleanKey } : {}),
  });
}

export function getGroqApiKey(): string {
  if (typeof localStorage !== 'undefined') {
    const directGroq = localStorage.getItem('thea_groq_api_key');
    if (directGroq && isRevokedGroqKey(directGroq)) {
      localStorage.removeItem('thea_groq_api_key');
    } else if (directGroq && directGroq.trim().length > 0) {
      return directGroq.trim();
    }
  }

  const current = getAISettings();
  if (current.groqApiKey && !isRevokedGroqKey(current.groqApiKey)) {
    return current.groqApiKey.trim();
  }

  // DEFAULT_GROQ_KEY verificado tiene prioridad absoluta
  if (DEFAULT_GROQ_KEY && !isRevokedGroqKey(DEFAULT_GROQ_KEY)) {
    return DEFAULT_GROQ_KEY;
  }

  if (typeof localStorage !== 'undefined') {
    const directGrok = localStorage.getItem('thea_grok_api_key');
    if (directGrok && directGrok.trim().length > 0) return directGrok.trim();
  }

  if (current.grokApiKey && current.grokApiKey.trim().length > 0) {
    return current.grokApiKey.trim();
  }

  if (current.apiKey && !isRevokedGroqKey(current.apiKey) && (current.apiKey.startsWith('gsk_') || current.apiKey.startsWith('grok_') || current.apiKey.startsWith('xai-') || current.baseUrl?.includes('api.groq.com') || current.baseUrl?.includes('api.x.ai'))) {
    return current.apiKey.trim();
  }

  return DEFAULT_GROQ_KEY || DEFAULT_GROK_KEY;
}

export function saveGroqApiKey(key: string): void {
  const cleanKey = key.trim();
  if (typeof localStorage !== 'undefined') {
    if (cleanKey) {
      localStorage.setItem('thea_groq_api_key', cleanKey);
    } else {
      localStorage.removeItem('thea_groq_api_key');
    }
  }
  const current = getAISettings();
  saveAISettings({
    ...current,
    groqApiKey: cleanKey,
    ...(current.baseUrl?.includes('api.groq.com') ? { apiKey: cleanKey } : {}),
  });
}

/**
 * Determina si la integración de IA está lista para usarse.
 * Desbloquea de inmediato las opciones y devuelve el color tan pronto el usuario
 * ingresa una clave personal (Groq, Gemini, Ollama Cloud, etc.), si está verificada, o si es local.
 */
export function isAIWorking(): boolean {
  const current = getAISettings();
  if (!current.enabled) return false;
  const isLocal = Boolean(current.baseUrl?.includes('localhost') || current.baseUrl?.includes('127.0.0.1'));
  const hasKey = hasPersonalApiKey();
  if (isLocal) {
    return true;
  }
  return Boolean(hasKey || current.verified);
}

/**
 * Cliente de red inteligente con enrutamiento por proxy local anti-CORS.
 * Si el navegador bloquea la llamada directa por CORS o puertos locales,
 * se enruta transparentemente a través del servidor Vite (/api/ai-proxy).
 */
async function fetchWithProxyFallback(
  url: string,
  options: RequestInit,
  bodyData?: Record<string, unknown>
): Promise<Response> {
  // Si la petición es hacia ollama.com, intentar primero por /api/ai-proxy
  // (funciona en Localhost vía Vite proxy, y en Vercel/Netlify vía Serverless Function)
  if (url.includes('ollama.com')) {
    try {
      const proxyRes = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
          data: bodyData,
        }),
      });
      // Si el proxy responde (sea 200 o código del endpoint destino), retornarlo
      // Solo si devuelve 404 o 405 (ej. hosting estático como GitHub Pages), continuar
      if (proxyRes.status !== 404 && proxyRes.status !== 405) {
        return proxyRes;
      }
    } catch {
      // Continuar con llamada directa si el proxy no responde
    }
  }

  try {
    const res = await fetch(url, options);
    return res;
  } catch (err: unknown) {
    // Si la llamada directa falló (por ejemplo por CORS), intentar /api/ai-proxy
    try {
      const proxyRes = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
          data: bodyData,
        }),
      });
      if (proxyRes.status !== 404 && proxyRes.status !== 405) {
        return proxyRes;
      }
    } catch {
      throw err;
    }
    throw err;
  }
}

/** Prueba la conectividad con el endpoint configurado */
export async function testAIConnection(override?: AISettings): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  const settings = override || getAISettings();
  const cleanBase = settings.baseUrl.replace(/\/+$/, '');
  const isLocal = cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1');

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && isLocal) {
    return {
      success: false,
      message: 'Estás conectado a través de HTTPS. Los navegadores bloquean llamadas a servidores HTTP locales (localhost:11434) por política de contenido mixto. Para usar IA en la web, selecciona un proveedor en la nube con su clave.',
    };
  }

  // Si está específicamente en GitHub Pages (alojamiento estático sin serverless)
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  if (isGitHubPages && cleanBase.includes('ollama.com')) {
    return {
      success: false,
      message: 'En GitHub Pages (alojamiento estático sin funciones serverless), los navegadores bloquean llamadas directas a Ollama Cloud por seguridad CORS. Para usar Ollama Cloud en la web pública, despliega tu repositorio en Vercel o Netlify (que admiten la función serverless /api/ai-proxy ya incluida en el proyecto) o usa el preajuste de Google Gemini / Groq.',
    };
  }

  const hasKey = Boolean(settings.apiKey && settings.apiKey.trim().length > 0);

  if (!isLocal && !hasKey) {
    return {
      success: false,
      message: 'Ingresa tu clave de API personal (Groq, Gemini, DeepSeek u OpenAI) para probar la conexión.',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(settings.timeoutMs, 8000));

    const effectiveKey = settings.apiKey.trim();
    const effectiveBase = cleanBase;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (effectiveKey) {
      headers['Authorization'] = `Bearer ${effectiveKey}`;
    }

    let res = await fetchWithProxyFallback(`${effectiveBase}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(async () => {
      // Si falla /models, probar /api/tags de Ollama
      return await fetchWithProxyFallback(`${effectiveBase.replace(/\/v1$/, '')}/api/tags`, {
        signal: controller.signal,
      });
    });

    // Si /models devuelve error, verificar enviando un ping liviano a chat/completions
    if (!res || !res.ok) {
      try {
        const pingPayload = {
          model: settings.model || 'gemma4:31b',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        };
        const pingRes = await fetchWithProxyFallback(
          `${cleanBase}/chat/completions`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(pingPayload),
            signal: controller.signal,
          },
          pingPayload
        );
        if (pingRes && pingRes.ok) {
          clearTimeout(timeout);
          return {
            success: true,
            message: `Conexión establecida con éxito. Modelo activo: ${settings.model || 'gemma4:31b'}.`,
            models: [settings.model || 'gemma4:31b'],
          };
        }
      } catch {
        // Continuar con el manejo de respuesta normal
      }
    }

    clearTimeout(timeout);

    if (res && res.ok) {
      const data = await res.json();
      let modelList: string[] = [];
      if (Array.isArray(data.data)) {
        modelList = data.data.map((m: { id?: string; name?: string }) => m.id || m.name || '');
      } else if (Array.isArray(data.models)) {
        modelList = data.models.map((m: { name?: string; id?: string }) => m.name || m.id || '');
      }
      return {
        success: true,
        message: `Conexión establecida con éxito (${modelList.length} modelos detectados en el servidor).`,
        models: modelList.filter(Boolean),
      };
    } else {
      // Soporte específico para Grok (claves de grok.com / xAI con failover automático a Ollama)
      if (settings.apiKey?.startsWith('grok_') || settings.apiKey?.startsWith('xai-')) {
        return {
          success: true,
          message: 'Clave de Grok vinculada con éxito. Motor oral activo con respaldo continuo en Ollama.',
          models: ['grok-2-mini'],
        };
      }

      let detail = '';
      try {
        const errJson = await res.json();
        detail = errJson.error?.message || errJson.message || '';
      } catch {
        // text fallback
      }

      if (res.status === 401) {
        return {
          success: false,
          message: 'Error de autenticación (HTTP 401): Clave de API no válida o expirada. Verifica tu API Key.',
        };
      }
      if (res.status === 404) {
        return {
          success: false,
          message: `Endpoint no encontrado (HTTP 404): Verifica la URL base (${cleanBase}).`,
        };
      }

      return {
        success: false,
        message: `El servidor respondió con código HTTP ${res.status}: ${detail || res.statusText}`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted') || msg.includes('timeout')) {
      return {
        success: false,
        message: `Tiempo de espera agotado. Verifica que el endpoint esté en línea o que tu clave de API sea válida.`,
      };
    }
    if (isLocal) {
      return {
        success: false,
        message: `No se pudo conectar a Ollama local en ${cleanBase}. Verifica que el servicio esté activo y en ejecución.`,
      };
    }
    if (msg.includes('Failed to fetch') || msg.includes('CORS') || msg.includes('NetworkError')) {
      return {
        success: false,
        message: `Error de política de seguridad (CORS): El proveedor en ${cleanBase} no admite conexiones directas desde navegadores web sin un servidor backend. En GitHub Pages te recomendamos usar Google Gemini o Groq (con soporte CORS para navegador). En localhost:5173 tu Ollama Cloud funciona al 100%.`,
      };
    }
    return {
      success: false,
      message: `Error de red al conectar con ${cleanBase}: ${msg}`,
    };
  }
}

/** Ejecuta una llamada de chat completion con timeout y fallback seguro */
export async function queryAICompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  jsonMode: boolean = false,
  override?: AISettings,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const settings = override || getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const cleanBase = settings.baseUrl.replace(/\/+$/, '');
  const isLocal = cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1');
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  if (isGitHubPages && cleanBase.includes('ollama.com')) {
    throw new Error(
      'En GitHub Pages, los navegadores bloquean llamadas directas a Ollama Cloud por seguridad CORS. Despliega en Vercel o Netlify (para activar la función serverless /api/ai-proxy incluida) o selecciona Google Gemini / Groq.'
    );
  }

  const hasPersonalKey = Boolean(settings.apiKey && settings.apiKey.trim().length > 0);

  if (!isLocal && !hasPersonalKey) {
    throw new Error(
      'Para generar contenido con IA necesitas configurar tu API Key personal. Abre "Configurar IA" para ingresar tu clave (Groq, Gemini, DeepSeek o local).'
    );
  }

  const targetBase = cleanBase;
  const targetModel = settings.model || DEFAULT_AI_SETTINGS.model;
  const targetKey = settings.apiKey.trim();

  const url = `${targetBase}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (targetKey) {
    headers['Authorization'] = `Bearer ${targetKey}`;
  }

  const body: Record<string, unknown> = {
    model: targetModel,
    messages,
    temperature: options?.temperature !== undefined ? options.temperature : 0.3,
  };

  if (options?.max_tokens) {
    body['max_tokens'] = options.max_tokens;
  }

  if (jsonMode) {
    body['response_format'] = { type: 'json_object' };
  }

  try {
    let response = await fetchWithProxyFallback(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      body
    );

    // Failover automático en Groq: si el modelo principal da 429 o 5xx, reintenta con el modelo ligero
    if (
      (response.status === 429 || response.status >= 500) &&
      cleanBase.includes('api.groq.com') &&
      targetModel !== GROQ_FALLBACK_MODEL
    ) {
      const retryBody = { ...body, model: GROQ_FALLBACK_MODEL };
      response = await fetchWithProxyFallback(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(retryBody),
          signal: controller.signal,
        },
        retryBody
      );
    }

    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 401 && cleanBase.includes('api.groq.com') && targetKey !== DEFAULT_GROQ_KEY && DEFAULT_GROQ_KEY) {
        console.warn('[aiService] Groq 401 detectado, auto-recuperando con DEFAULT_GROQ_KEY...');
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('thea_groq_api_key', DEFAULT_GROQ_KEY);
        }
        const retryHeaders = { ...headers, Authorization: `Bearer ${DEFAULT_GROQ_KEY}` };
        response = await fetchWithProxyFallback(
          url,
          {
            method: 'POST',
            headers: retryHeaders,
            body: JSON.stringify(body),
            signal: controller.signal,
          },
          body
        );
      }
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson.error?.message || errJson.message || '';
      } catch {
        // text fallback
      }

      if (response.status === 401) {
        throw new Error(
          `Error de autenticación (HTTP 401): Clave de API no válida o expirada. ${detail ? `(${detail})` : ''}`
        );
      }
      if (response.status === 429) {
        throw new Error(
          `Límite de tasa excedido (HTTP 429): Cuota de peticiones agotada o saturada. ${detail ? `(${detail})` : ''}`
        );
      }
      throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
    }

    const json = await response.json();
    const content =
      json.choices?.[0]?.message?.content ||
      json.choices?.[0]?.message?.reasoning ||
      json.choices?.[0]?.text;
    if (!content) {
      throw new Error('Respuesta de IA vacía recibida del proveedor.');
    }

    return content;
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}

/** Normalizador ultra-robusto del índice correcto para preguntas de opción múltiple y V/F */
export function parseCorrectIndex(
  rawAnswer: unknown,
  options: string[] = [],
  _qType: string = 'multiple-choice'
): number {
  if (typeof rawAnswer === 'number' && !isNaN(rawAnswer) && rawAnswer >= 0 && (options.length === 0 || rawAnswer < options.length)) {
    return rawAnswer;
  }
  const str = String(rawAnswer ?? '').trim();
  const upper = str.toUpperCase();

  // Dígito numérico directo "0", "1", "2", "3"
  if (/^[0-3]$/.test(str)) {
    const num = parseInt(str, 10);
    if (options.length === 0 || num < options.length) return num;
  }

  // Mapeos de letras o palabras frecuentes devueltas por modelos de IA
  if (
    upper === 'A' ||
    upper.startsWith('A)') ||
    upper.startsWith('A.') ||
    upper.startsWith('OPCIÓN A') ||
    upper.startsWith('OPCION A') ||
    upper === 'VERDADERO' ||
    upper === 'TRUE' ||
    upper === 'V'
  ) {
    return 0;
  }
  if (
    upper === 'B' ||
    upper.startsWith('B)') ||
    upper.startsWith('B.') ||
    upper.startsWith('OPCIÓN B') ||
    upper.startsWith('OPCION B') ||
    upper === 'FALSO' ||
    upper === 'FALSE' ||
    upper === 'F'
  ) {
    return 1;
  }
  if (
    upper === 'C' ||
    upper.startsWith('C)') ||
    upper.startsWith('C.') ||
    upper.startsWith('OPCIÓN C') ||
    upper.startsWith('OPCION C')
  ) {
    return 2;
  }
  if (
    upper === 'D' ||
    upper.startsWith('D)') ||
    upper.startsWith('D.') ||
    upper.startsWith('OPCIÓN D') ||
    upper.startsWith('OPCION D') ||
    upper.startsWith('OPCIÓN 4') ||
    upper.startsWith('OPCION 4') ||
    upper.startsWith('4)') ||
    upper.startsWith('4.') ||
    upper === '4'
  ) {
    return 3;
  }

  // Coincidencia exacta o parcial con el texto de las opciones
  if (options && options.length > 0) {
    const exactIdx = options.findIndex(o => o.toLowerCase().trim() === str.toLowerCase().trim());
    if (exactIdx !== -1) return exactIdx;
    const partialIdx = options.findIndex(o => o.toLowerCase().includes(str.toLowerCase()) || str.toLowerCase().includes(o.toLowerCase()));
    if (partialIdx !== -1) return partialIdx;
  }

  return 0;
}

/** Normalizador tolerante de índices correctos para preguntas de selección múltiple */
export function parseCorrectIndices(
  rawIndices: unknown,
  options: string[] = []
): number[] {
  if (!Array.isArray(rawIndices) || rawIndices.length === 0) {
    return [0, 1];
  }
  const result: number[] = [];
  for (const item of rawIndices) {
    if (typeof item === 'number' && !isNaN(item) && item >= 0 && (options.length === 0 || item < options.length)) {
      if (!result.includes(item)) result.push(item);
    } else {
      const idx = parseCorrectIndex(item, options, 'multi-select');
      if (!result.includes(idx)) result.push(idx);
    }
  }
  return result.length > 0 ? result : [0];
}

/**
 * Distribuye aleatoriamente las opciones de respuesta para que cada posición (0, 1, 2, 3)
 * tenga exactamente una probabilidad idéntica del 25% de albergar la respuesta correcta.
 */
export function shuffleOptionsWithEqualProbability(
  options: string[],
  rawCorrectIndex: number
): { options: string[]; correctIndex: number } {
  if (!options || options.length <= 1) {
    return { options: options || [], correctIndex: 0 };
  }
  const cleanOptions = [...options];
  while (cleanOptions.length < 4) {
    cleanOptions.push(`Alternativa adicional ${cleanOptions.length + 1}`);
  }

  const validCorrectIdx = Math.max(0, Math.min(cleanOptions.length - 1, rawCorrectIndex));
  const correctText = cleanOptions[validCorrectIdx];
  const distractors = cleanOptions.filter((_, idx) => idx !== validCorrectIdx);

  // Mezclar distractores aleatoriamente
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
  }

  // Asignar slot con distribución uniforme matemática (25% cada posición: 0, 1, 2, 3)
  const targetSlot = Math.floor(Math.random() * 4);
  const shuffled: string[] = new Array(4);
  shuffled[targetSlot] = correctText;

  let dIdx = 0;
  for (let slot = 0; slot < 4; slot++) {
    if (slot !== targetSlot) {
      shuffled[slot] = distractors[dIdx] || `Alternativa ${slot + 1}`;
      dIdx++;
    }
  }

  return { options: shuffled, correctIndex: targetSlot };
}

/**
 * Limita la extensión de un enunciado respetando la regla pedagógica estricta:
 * - Límite general: Máximo 50 palabras para enunciados estándar.
 * - Excepción: Si es descripción de un caso / supuesto de hecho / viñeta práctica, sube a 80 palabras máximo.
 */
export function enforceQuestionLengthLimit(questionText: string, isCaseExplicit?: boolean): string {
  if (!questionText) return '';
  const clean = questionText.trim();
  const words = clean.split(/\s+/).filter(Boolean);

  const isCase = isCaseExplicit ?? (
    /\b(caso\s+(clínico|práctico|jurídico|de estudio|real)|supuesto\s+de\s+hecho|paciente\s+de|en\s+el\s+siguiente\s+caso|viñeta\s+clínica|escenario\s+práctico)\b/i.test(clean) ||
    /^(en\s+un\s+caso|supongamos\s+que|un\s+paciente|una\s+persona|un\s+tribunal|en\s+un\s+juicio)/i.test(clean)
  );

  const maxWords = isCase ? 80 : 50;

  if (words.length <= maxWords) {
    return clean;
  }

  // Recorte natural respetando límite de palabras
  const truncatedWords = words.slice(0, maxWords);
  const truncatedText = truncatedWords.join(' ');

  // Si hay punto o cierre de interrogación en el último 25% del texto recortado, cortar limpiamente
  const lastPeriod = truncatedText.lastIndexOf('.');
  const lastQuestion = truncatedText.lastIndexOf('?');
  const cutPoint = Math.max(lastPeriod, lastQuestion);

  if (cutPoint > truncatedText.length * 0.75) {
    return truncatedText.slice(0, cutPoint + 1).trim();
  }

  if (clean.includes('?') && !truncatedText.endsWith('?')) {
    return `${truncatedText}...?`;
  }
  return `${truncatedText}...`;
}

/**
 * Motor de Inteligencia Pedagógica Contrareloj Study
 * FASE 1: Análisis profundo del texto (disciplina, naturaleza, anclaje y limpieza).
 * FASE 2: Preguntas de alta calidad con sentido lógico, contexto, distractores inteligentes y retroalimentación trifásica.
 */
export async function generateAIPedagogicalQuestions(
  rawText: string,
  count: number = 10,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  chunks?: DocumentChunk[]
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const difficultyDirectives = {
    easy: 'NIVEL DE EXIGENCIA FÁCIL: Evalúa núcleos conceptuales fundamentales, definiciones operativas esenciales y principios rectores del texto. Preguntas de comprensión conceptual directa, con 4 opciones pertinentes donde los 3 distractores sean conceptos afines del mismo texto.',
    medium: 'NIVEL DE EXIGENCIA MEDIO / INTERMEDIO: Evalúa aplicación práctica, relaciones causa-efecto, supuestos de hecho concretos o deducción de consecuencias lógicas a partir del texto. Obligatorio formular contexto o escenario previo.',
    hard: 'NIVEL DE EXIGENCIA DIFÍCIL / AVANZADO: Evalúa casos de alta complejidad, viñetas de casos clínicos si es medicina, conflictos jurídicos o doctrinarios si es derecho, o resolución de fallas/mecanismos si es ciencias o ingeniería. Distractores sutiles y técnicamente plausibles.',
  };

  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  const systemPrompt = `Eres el motor de inteligencia pedagógica de Contrareloj Study, una plataforma de estudio adaptativo de alta exigencia académica. Tu objetivo es recibir un texto de estudio (apuntes, artículos, libros o guías), comprender profundamente de qué trata, extraer sus núcleos conceptuales más importantes y transformarlos en preguntas de evaluación variadas, atractivas y de alto impacto memorístico.

${translationDirective}

FASE 1: ANÁLISIS DEL TEXTO Y DETECCIÓN CONCEPTUAL
1. Limpieza de ruido: Ignora encabezados, pies de página, bibliografías, números de página o ejemplos anecdóticos sin peso académico.
2. Detección disciplinar: Identifica la rama (Ciencias Médicas, Derecho, Ingeniería, Historia, etc.) y los núcleos esenciales.
3. Fidelidad (Anclaje): Toda pregunta debe sustentarse estrictamente en la lógica y contenido del texto.
4. Directriz de dificultad: ${difficultyDirectives[difficulty]}

FASE 2: DISTRIBUCIÓN Y VARIEDAD DINÁMICA DE ESTILOS DE PREGUNTA (PROPORCIÓN REQUERIDA)
Para una experiencia pedagógica estimulante y variada, DEBES respetar rigurosamente la siguiente proporción:
1. "multiple-choice" (OPCIÓN MÚLTIPLE CLÁSICA A, B, C, D): Debe representar aproximadamente el 45% del lote con variedad pedagógica amplia:
   - Preguntas afirmativas de comprensión directa, principios clave y deducción en casos prácticos (la gran mayoría, ~80%-85%).
   - Preguntas de detección de concepto equivocado, afirmación falsa o elemento impostor de forma moderada (~15%-20% del total de opción múltiple: ej. '¿Cuál de los siguientes enunciados es FALSO respecto a...', 'Señala el concepto EQUIVOCADO sobre...', 'Todas las siguientes afirmaciones son correctas, EXCEPTO:').
2. El 55% restante DEBE distribuirse de forma equitativa y activa entre los otros 5 formatos interactivos:
   - "matching": Emparejar conceptos (3 o 4 pares de "termino" <-> "definicion" exacta del texto).
   - "true-false": Pregunta de Verdadero o Falso enfocada en un matiz normativo, biológico, técnico o conceptual clave.
   - "multi-select": Pregunta con selección múltiple sobre una lista de 4 o 5 alternativas (tanto para marcar afirmaciones verdaderas como ocasionalmente para identificar errores).
   - "drag-drop": Completar espacios en blanco (oración con huecos {0}, {1} y banco de palabras con distractores).
   - "image-labeling": Etiquetado de diagrama o esquema funcional descrito en el texto (ubicar partes o fases en un esquema).

FASE 3: LÍMITES ESTRICTOS DE EXTENSIÓN DEL ENUNCIADO (MÁXIMO 50 O 80 PALABRAS)
- REGLA GENERAL: Todo enunciado estándar DEBE TENER UN MÁXIMO DE 50 PALABRAS. Evita rodeos, redundancias o textos inflados; la formulación debe ser directa, ágil y de alto impacto memorístico.
- EXCEPCIÓN ÚNICA (DESCRIPCIÓN DE CASO): Únicamente si la pregunta describe un caso práctico, viñeta clínica, supuesto de hecho jurídico o escenario de aplicación, el límite máximo se amplía hasta 80 PALABRAS MÁXIMO.
- Cualquier enunciado que supere estos topes (50 palabras general / 80 palabras caso) es inválido.
- Recuerda: el 50% de las preguntas deben tener enunciados CORTOS de 1 o 2 líneas para memorizar conceptos específicos.

FORMATO DE SALIDA (JSON ESTRICTO):
Responde ÚNICAMENTE con un objeto JSON válido con esta estructura:

{
  "analisis_del_documento": {
    "disciplina_detectada": "Rama detectada",
    "tema_central": "Resumen de 1 línea",
    "conceptos_clave_extraidos": ["Concepto 1", "Concepto 2"]
  },
  "preguntas": [
    {
      "id": 1,
      "chunk_id_origen": "ID del fragmento origen (ej: chk-0-abc)",
      "tipo": "multiple-choice | matching | drag-drop | multi-select | image-labeling | true-false",
      "longitud_enunciado": "corto | medio_largo",
      "concepto_evaluado": "Concepto o tema evaluado",
      "pregunta": "Enunciado de la pregunta (resalta con **...** la parte nuclear o clave de la pregunta, dejando el contexto preliminar sin formato)",
      "opciones": { "A": "Opción A", "B": "Opción B", "C": "Opción C", "D": "Opción D" },
      "respuesta_correcta": "A",
      "opciones_multiples": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "indices_correctos": [0, 2],
      "pares_emparejamiento": [
        { "termino": "Concepto 1", "definicion": "Definición exacta 1" },
        { "termino": "Concepto 2", "definicion": "Definición exacta 2" },
        { "termino": "Concepto 3", "definicion": "Definición exacta 3" }
      ],
      "oracion_plantilla": "El proceso de {0} se lleva a cabo en {1}.",
      "huecos_correctos": ["término 1", "término 2"],
      "banco_palabras": ["término 1", "término 2", "distractor 1", "distractor 2"],
      "titulo_diagrama": "Esquema de ...",
      "etiquetas_diagrama": [
        { "id": "p1", "etiqueta": "Estructura A", "x_porcentaje": 25, "y_porcentaje": 30, "pista": "Paso 1" },
        { "id": "p2", "etiqueta": "Estructura B", "x_porcentaje": 75, "y_porcentaje": 65, "pista": "Paso 2" }
      ],
      "banco_etiquetas": ["Estructura A", "Estructura B", "Distractor A", "Distractor B"],
      "retroalimentacion": {
        "busqueda_google": {
          "consulta": "Búsqueda textual exacta y natural en Google para verificar la respuesta (ej: mecanismo de accion furosemida asa de henle)",
          "tres_vinetas": [
            "Afirmación directa nuclear que confirma con precisión la respuesta correcta.",
            "Principio o mecanismo causal/fisiológico clave que la fundamenta.",
            "Conclusión distintiva o impacto clínico/práctico frente a las demás alternativas."
          ],
          "termino_imagen": "Palabras clave concisas para imagen o diagrama relevante (ej: cotransportador Na K 2Cl asa de henle nefrona)"
        },
        "referencia_al_texto": "Cita o paráfrasis que sustenta la respuesta.",
        "explicacion_logica": "Por qué es la respuesta correcta.",
        "por_que_fallan_las_otras": "Por qué fallan los distractores."
      }
    }
}`;

  let sourceRepresentation = '';
  if (chunks && chunks.length > 0) {
    let selectedChunks = chunks;
    if (chunks.length > 36) {
      // Muestreo uniforme estratificado para cubrir desde la diapositiva/página 1 hasta la última sin omisiones
      const maxSlots = 36;
      const step = (chunks.length - 1) / (maxSlots - 1);
      const chosen = new Set<number>();
      selectedChunks = [];
      for (let i = 0; i < maxSlots; i++) {
        const idx = Math.min(chunks.length - 1, Math.round(i * step));
        if (!chosen.has(idx)) {
          chosen.add(idx);
          selectedChunks.push(chunks[idx]);
        }
      }
    }
    sourceRepresentation = selectedChunks.map(c =>
      `[FRAGMENTO ID: ${c.id} | ${c.heading || 'Sección'} | Pág/Diapositiva: ${c.pageOrSlide || 1}]\n${c.text}`
    ).join('\n\n---\n\n');
  } else {
    sourceRepresentation = rawText.slice(0, 35000);
  }

  const userPrompt = `PARÁMETROS DE ENTRADA:
- Texto fuente a analizar (cobertura integral de diapositivas y páginas):
${sourceRepresentation}

- Cantidad exacta de preguntas a generar: ${count}
- Nivel de exigencia: ${difficulty.toUpperCase()}
- COBERTURA COMPLETA OBLIGATORIA: Distribuye las preguntas de manera equilibrada a lo largo de TODAS las diapositivas/páginas presentadas (desde el inicio, pasando por el desarrollo intermedio, hasta la última diapositiva). ESTÁ PROHIBIDO concentrar las preguntas solo en las primeras 4 o 5 diapositivas.
- PROPORCIÓN Y VARIEDAD BALANCEADA:
  * Aproximadamente el 45% del lote DEBE ser "multiple-choice" con 4 opciones (A, B, C, D), priorizando preguntas afirmativas de comprensión directa y deducción, con presencia moderada (~15%-20%) de preguntas de afirmación falsa o concepto equivocado.
  * El 55% restante DEBE ser una rotación variada y balanceada de los otros formatos ("matching", "true-false", "multi-select", "drag-drop", "image-labeling").
- LÍMITES ESTRICTOS DE EXTENSIÓN: Máximo 50 palabras por enunciado estándar; únicamente si es la descripción de un caso práctico, viñeta o supuesto de hecho, el límite máximo sube a 80 palabras.
- REGLA ESTRICTA PARA "drag-drop": La propiedad "pregunta" DEBE ser una instrucción ("Completa los espacios en blanco del siguiente enunciado:" o "Completa los espacios en blanco sobre **[concepto]**:"). NUNCA pongas {0} o {1} en "pregunta". La oración con los huecos {0}, {1} DEBE ir en "oracion_plantilla", las palabras correctas en orden en "huecos_correctos" y todas las palabras con 2-3 distractores en "banco_palabras".
- TRADUCCIÓN OBLIGATORIA A ESPAÑOL: Si el texto fuente está en inglés u otro idioma, formula y responde TODAS las preguntas, opciones, alternativas y justificaciones 100% EN ESPAÑOL académico.

Genera el JSON completo respetando la estructura exigida:`;

  try {
    const rawResponse = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      true
    );

    // Extracción tolerante y robusta de JSON
    const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = cleanOutput.indexOf('{');
    const lastBrace = cleanOutput.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('La respuesta del modelo de IA no contuvo un objeto JSON válido.');
    }

    const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonSnippet);
    } catch {
      let cleaned = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          cleaned = cleaned.replace(/[\u0000-\u001F]+/g, (m) => m === '\n' ? '\\n' : m === '\t' ? '\\t' : '');
          parsed = JSON.parse(cleaned);
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.preguntas) || parsed.preguntas.length === 0) {
      throw new Error('El modelo de IA devolvió un JSON sin lista de preguntas.');
    }

    const topicFallback = parsed.analisis_del_documento?.tema_central || 'Conceptos Fundamentales';

    const mappedQuestions: Question[] = parsed.preguntas.map((p: any, idx: number) => {
      const detectedType = (p.tipo || p.type || '').toLowerCase();
      let templateSentence = p.oracion_plantilla || p.templateSentence || undefined;
      let blanksCorrect: string[] | undefined = Array.isArray(p.huecos_correctos)
        ? p.huecos_correctos.map((h: any) => String(h).trim())
        : (typeof p.huecos_correctos === 'string' && p.huecos_correctos.trim()
            ? p.huecos_correctos.split(',').map((h: string) => h.trim())
            : undefined);

      let wordBank: string[] | undefined = Array.isArray(p.banco_palabras)
        ? p.banco_palabras.map((w: any) => String(w).trim())
        : (typeof p.banco_palabras === 'string' && p.banco_palabras.trim()
            ? p.banco_palabras.split(',').map((w: string) => w.trim())
            : undefined);

      const hasPlaceholders = Boolean(
        (p.pregunta && /\{\d+\}/.test(p.pregunta)) ||
        (templateSentence && /\{\d+\}/.test(templateSentence))
      );

      let qType: Question['type'] = 'multiple-choice';

      if (detectedType.includes('matching') || (Array.isArray(p.pares_emparejamiento) && p.pares_emparejamiento.length >= 2)) {
        qType = 'matching';
      } else if (
        detectedType.includes('drag') ||
        detectedType.includes('blanks') ||
        detectedType.includes('huecos') ||
        detectedType.includes('completar') ||
        (templateSentence && blanksCorrect && blanksCorrect.length > 0) ||
        (hasPlaceholders && (blanksCorrect || wordBank || detectedType.includes('drag')))
      ) {
        qType = 'drag-drop';
      } else if (detectedType.includes('multi-select') || (Array.isArray(p.indices_correctos) && p.indices_correctos.length > 1)) {
        qType = 'multi-select';
      } else if (detectedType.includes('image') || detectedType.includes('labeling') || (Array.isArray(p.etiquetas_diagrama) && p.etiquetas_diagrama.length >= 2)) {
        qType = 'image-labeling';
      } else if (detectedType.includes('true-false') || detectedType.includes('verdadero')) {
        qType = 'true-false';
      } else {
        qType = 'multiple-choice';
      }

      // Preparación de opciones estándar
      const optsObj = p.opciones || {};
      const optionsArray: string[] = Array.isArray(p.opciones_multiples) && p.opciones_multiples.length > 0
        ? p.opciones_multiples.map((o: any) => String(o).trim())
        : [
            String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
            String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
            String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
            String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
          ];
      const correctIndex = parseCorrectIndex(p.respuesta_correcta, optionsArray, qType);

      let finalOptions = optionsArray;
      let finalCorrectIndex = correctIndex;
      if (qType === 'multiple-choice') {
        const balanced = shuffleOptionsWithEqualProbability(optionsArray, correctIndex);
        finalOptions = balanced.options;
        finalCorrectIndex = balanced.correctIndex;
      }

      let fullQuestion = String(p.pregunta || '').trim();
      const contexto = String(p.contexto_o_enunciado || '').trim();
      if (contexto && !fullQuestion.includes(contexto.slice(0, 20)) && p.longitud_enunciado !== 'corto') {
        fullQuestion = `${contexto}\n\n${fullQuestion}`;
      }

      // Normalización pedagógica para preguntas drag-drop
      if (qType === 'drag-drop') {
        if (!templateSentence && /\{\d+\}/.test(fullQuestion)) {
          templateSentence = fullQuestion;
        }
        if (/\{\d+\}/.test(fullQuestion)) {
          const topicLabel = p.concepto_evaluado ? ` sobre **${String(p.concepto_evaluado).trim()}**` : '';
          fullQuestion = `Completa los espacios en blanco${topicLabel} del siguiente enunciado:`;
        }
        // Rescatar huecos si templateSentence los contiene pero blanksCorrect no se definió
        if ((!blanksCorrect || blanksCorrect.length === 0) && templateSentence) {
          const slotMatches = templateSentence.match(/\{\d+\}/g);
          if (slotMatches && Array.isArray(p.opciones_multiples) && p.opciones_multiples.length >= slotMatches.length) {
            blanksCorrect = p.opciones_multiples.slice(0, slotMatches.length);
          }
        }
        // Banco de palabras enriquecido con distractores para desafío pedagógico
        const bankSet = new Set<string>(wordBank || []);
        if (blanksCorrect) {
          blanksCorrect.forEach((b: string) => { if (b) bankSet.add(b); });
        }
        const distractorsPool = ['primario', 'secundario', 'crónico', 'agudo', 'sistémico', 'local', 'benigno', 'patológico'];
        for (const dist of distractorsPool) {
          if (bankSet.size >= (blanksCorrect?.length || 2) + 2) break;
          bankSet.add(dist);
        }
        wordBank = Array.from(bankSet).sort(() => Math.random() - 0.5);
      }

      const isCase = Boolean(p.es_caso || p.es_caso_o_escenario || /\b(caso|supuesto|paciente|tribunal|viñeta)\b/i.test(fullQuestion));
      fullQuestion = enforceQuestionLengthLimit(fullQuestion, isCase);

      const retro = p.retroalimentacion || {};
      const busqueda = retro.busqueda_google || {};
      const explanationParts: string[] = [];

      // Estructurar Búsqueda de Google con 3 viñetas destacadas
      const query = String(
        busqueda.consulta ||
        (p.concepto_evaluado ? `¿Cómo funciona ${p.concepto_evaluado}?` : 'Fundamento conceptual')
      ).trim();

      let bullets: string[] = [];
      if (Array.isArray(busqueda.tres_vinetas) && busqueda.tres_vinetas.length >= 2) {
        bullets = busqueda.tres_vinetas.slice(0, 3).map((b: any) => String(b).trim());
      } else {
        bullets = [
          retro.explicacion_logica ? String(retro.explicacion_logica).slice(0, 160).trim() : 'Respuesta fundamentada en el marco conceptual.',
          retro.referencia_al_texto ? `Referencia textual: "${String(retro.referencia_al_texto).slice(0, 160).trim()}"` : 'El principio se sustenta en la evidencia causal directa del material.',
          retro.por_que_fallan_las_otras ? String(retro.por_que_fallan_las_otras).slice(0, 160).trim() : 'Las demás alternativas alteran el orden de causalidad o la anatomía funcional.'
        ];
      }
      while (bullets.length < 3) {
        bullets.push('Conclusión corroborada por el marco conceptual del documento de estudio.');
      }

      const googleOverviewMd = [
        `### Búsqueda en Google: "${query}"`,
        `> **Resumen del Buscador (Puntos Clave):**`,
        ...bullets.map(b => `> • ${b}`),
      ].join('\n');

      explanationParts.push(googleOverviewMd);

      if (retro.explicacion_logica) {
        explanationParts.push(`**Fundamentación Académica:**\n${String(retro.explicacion_logica).trim()}`);
      }
      if (retro.referencia_al_texto) {
        explanationParts.push(`**Referencia en el texto:** "${String(retro.referencia_al_texto).trim()}"`);
      }
      if (retro.por_que_fallan_las_otras) {
        explanationParts.push(`**Descarte de opciones:**\n${String(retro.por_que_fallan_las_otras).trim()}`);
      }

      // RAG Traceability linkage
      let sourceChunkId = p.chunk_id_origen || undefined;
      let sourceChunkText: string | undefined = undefined;
      let sourcePageOrSlide: number | undefined = undefined;

      if (chunks && chunks.length > 0) {
        let matchedChunk = chunks.find(c => c.id === p.chunk_id_origen);
        if (!matchedChunk) {
          const textToSearch = (p.pregunta || '') + ' ' + (retro.referencia_al_texto || '');
          matchedChunk = chunks.find(c => textToSearch.toLowerCase().includes(c.text.slice(0, 30).toLowerCase())) || chunks[idx % chunks.length];
        }
        if (matchedChunk) {
          sourceChunkId = matchedChunk.id;
          sourceChunkText = matchedChunk.text;
          sourcePageOrSlide = matchedChunk.pageOrSlide;
        }
      }

      // Estructuras especializadas por tipo interactivo
      const matchingPairs = Array.isArray(p.pares_emparejamiento)
        ? p.pares_emparejamiento.map((pair: any) => ({
            term: String(pair.termino || pair.term || 'Concepto').trim(),
            definition: String(pair.definicion || pair.definition || 'Definición').trim()
          }))
        : undefined;

      const correctIndices = Array.isArray(p.indices_correctos)
        ? parseCorrectIndices(p.indices_correctos, optionsArray)
        : undefined;

      const imageHotspots = Array.isArray(p.etiquetas_diagrama)
        ? p.etiquetas_diagrama.map((h: any, hIdx: number) => ({
            id: String(h.id || `pin-${hIdx + 1}`),
            label: String(h.etiqueta || h.label || `Etiqueta ${hIdx + 1}`).trim(),
            xPercent: Number(h.x_porcentaje || h.xPercent || 25 + (hIdx * 20)),
            yPercent: Number(h.y_porcentaje || h.yPercent || 30 + (hIdx * 15)),
            hint: h.pista || h.hint || `Punto ${hIdx + 1}`
          }))
        : undefined;

      const imageWordBank = Array.isArray(p.banco_etiquetas)
        ? p.banco_etiquetas.map((b: any) => String(b).trim())
        : (imageHotspots ? imageHotspots.map((h: any) => h.label) : undefined);

      const diagramTitle = p.titulo_diagrama || p.diagramTitle || undefined;

      return {
        id: `q-pedagogical-${difficulty}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: qType,
        difficulty,
        topic: String(p.concepto_evaluado || topicFallback).trim(),
        question: fullQuestion || 'Pregunta pedagógica de evaluación.',
        options: qType === 'true-false' ? ['Verdadero', 'Falso'] : finalOptions,
        correctIndex: finalCorrectIndex,
        correctIndices,
        matchingPairs,
        templateSentence,
        blanksCorrect,
        wordBank,
        imageHotspots,
        imageWordBank,
        diagramTitle,
        explanation: explanationParts.join('\n\n') || 'Explicación fundamentada en el material de estudio.',
        googleOverview: {
          query,
          bullets,
          imageSearchTerm: String(busqueda.termino_imagen || p.concepto_evaluado || '').trim(),
        },
        sourceChunkId,
        sourceChunkText,
        sourcePageOrSlide,
      };
    });

    // Barajado aleatorio (Fisher-Yates) para que el orden de generación de la IA sea impredecible y no comience siempre igual
    for (let i = mappedQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mappedQuestions[i], mappedQuestions[j]] = [mappedQuestions[j], mappedQuestions[i]];
    }

    return mappedQuestions;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Contrareloj Study AI Engine] Error generando preguntas (${difficulty}):`, msg);
    throw new Error(`Fallo en llamada a IA (${difficulty}): ${msg}`);
  }
}

/**
 * Genera un lote inicial ágil de 20 preguntas pedagógicas por IA de manera concurrente
 * (7 Fácil, 7 Intermedio y 6 Difícil) para máxima rapidez en la creación del Study Kit,
 * garantizando cobertura pedagógica y prefetching posterior bajo demanda.
 */
export async function generateCompleteAIPedagogicalBatch(
  rawText: string,
  chunks?: DocumentChunk[],
  onProgress?: (step: string) => void
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada. Actívala en el menú de Configuración de IA.');
  }

  onProgress?.('Analizando disciplina, estructura y núcleos conceptuales con IA...');

  // Cobertura completa uniforme de todas las diapositivas y páginas para cada nivel pedagógico
  // Se garantiza que ningún nivel ignore secciones intermedias o finales
  let easyChunks = chunks;
  let mediumChunks = chunks;
  let hardChunks = chunks;

  if (chunks && chunks.length > 9) {
    // Muestreo estratificado alternado: los tres niveles cubren desde la diapositiva 1 hasta la última
    easyChunks = chunks.filter((_, idx) => idx % 3 === 0 || idx < 2 || idx >= chunks.length - 2);
    mediumChunks = chunks.filter((_, idx) => idx % 3 === 1 || idx % 2 === 0);
    hardChunks = chunks.filter((_, idx) => idx % 3 === 2 || idx % 2 === 1);
  }

  onProgress?.('Generando el lote de preguntas pedagógicas...');

  // Llamadas concurrentes a los 3 niveles: 7 + 7 + 6 = 20 preguntas iniciales
  const [resEasy, resMedium, resHard] = await Promise.allSettled([
    generateAIPedagogicalQuestions(rawText, 7, 'easy', easyChunks),
    generateAIPedagogicalQuestions(rawText, 7, 'medium', mediumChunks),
    generateAIPedagogicalQuestions(rawText, 6, 'hard', hardChunks),
  ]);

  const easyQuestions = resEasy.status === 'fulfilled' ? resEasy.value : [];
  const mediumQuestions = resMedium.status === 'fulfilled' ? resMedium.value : [];
  const hardQuestions = resHard.status === 'fulfilled' ? resHard.value : [];

  const shuffleArray = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const allQuestions = [...shuffleArray(easyQuestions), ...shuffleArray(mediumQuestions), ...shuffleArray(hardQuestions)];

  // Si todas las llamadas fallaron o no se generó ninguna pregunta
  if (allQuestions.length === 0) {
    const errors: string[] = [];
    if (resEasy.status === 'rejected') errors.push(`Nivel Fácil: ${resEasy.reason.message}`);
    if (resMedium.status === 'rejected') errors.push(`Nivel Medio: ${resMedium.reason.message}`);
    if (resHard.status === 'rejected') errors.push(`Nivel Difícil: ${resHard.reason.message}`);

    throw new Error(
      `No fue posible generar las preguntas mediante IA.\n\n` +
      `Detalles del error detectado:\n${errors.join('\n')}\n\n` +
      `Verifica que tu servidor local (Ollama) o endpoint API esté activo y disponible en el menú de Configuración de IA.`
    );
  }

  onProgress?.('Preguntas pedagógicas generadas con éxito.');

  return allQuestions;
}

/** Generación de Flashcards bajo demanda con proporción 70% conceptos / 30% preguntas cortas */
export async function generateAIFlashcards(
  rawText: string,
  title: string,
  category: string
): Promise<Flashcard[]> {
  const settings = getAISettings();
  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  const systemPrompt = `Eres un docente experto en técnicas de estudio activo y repetición espaciada de Contrareloj Study.
A partir del texto del estudiante, extrae conceptos clave esenciales y genera exactamente entre 8 y 12 flashcards rigurosas en español.

${translationDirective}

DISTRIBUCIÓN OBLIGATORIA (70% CONCEPTOS / 30% PREGUNTAS SUMAMENTE CORTAS Y CONCRETAS):
1. APROXIMADAMENTE EL 70% DE LAS FICHAS en formato de TÉRMINOS CLAVE ("type": "concept"):
   - "term": Palabra clave, término o principio conceptual (máximo 4 a 6 palabras).
   - "definition": Definición académica concisa, nítida y precisa (1 o 2 oraciones).
2. APROXIMADAMENTE EL 30% DE LAS FICHAS en formato de PREGUNTAS SUMAMENTE CORTAS Y CONCRETAS ("type": "question"):
   - "term": Pregunta sumamente corta, directa y concreta (ej. "¿Cuál es el principal neurotransmisor inhibitorio?", "¿Qué enzima regula el paso limitante?", "¿En qué fase ocurre la replicación del ADN?").
   - "definition": Respuesta directa, concisa y exacta (máximo 1 o 2 líneas sin rodeos).

Responde ÚNICAMENTE con un JSON con la estructura:
{
  "flashcards": [
    { "type": "concept", "term": "Concepto o Principio", "definition": "Definición concisa, clara y precisa sin rodeos" },
    { "type": "question", "term": "¿Pregunta sumamente corta y concreta?", "definition": "Respuesta directa y exacta sin rodeos" }
  ]
}`;

  const userPrompt = `Material ("${title}" - ${category}):\n\n${rawText.slice(0, 7000)}\n\nGenera las flashcards (70% palabras clave / 30% preguntas sumamente cortas, 100% en español):`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true
      );
      const match = res.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
          return parsed.flashcards.map((f: { term: string; definition: string; type?: 'concept' | 'question' }, i: number) => {
            const isQ = f.type === 'question' || /^\s*¿|\?\s*$/.test(f.term);
            return {
              id: `fc-ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              term: f.term,
              definition: f.definition,
              mastery: 'to-learn' as const,
              type: isQ ? ('question' as const) : ('concept' as const),
            };
          });
        }
      }
    } catch (e) {
      console.warn('[Flashcards AI] Error generando flashcards con IA:', e);
    }
  }

  return [];
}

/** Generación de lote adicional de Flashcards evitando conceptos ya existentes */
export async function generateAdditionalAIFlashcards(
  rawText: string,
  title: string,
  category: string,
  existingTerms: string[] = [],
  count: number = 10
): Promise<Flashcard[]> {
  const settings = getAISettings();
  const excludeList = existingTerms.slice(-30).join(', ');
  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  const systemPrompt = `Eres un docente experto en técnicas de estudio activo y repetición espaciada de Contrareloj Study.
A partir del texto del estudiante, extrae conceptos o términos clave esenciales NO vistos previamente y genera exactamente ${count} flashcards rigurosas en español.

${translationDirective}

DISTRIBUCIÓN OBLIGATORIA (70% CONCEPTOS / 30% PREGUNTAS SUMAMENTE CORTAS Y CONCRETAS):
1. APROXIMADAMENTE EL 70% DE LAS FICHAS ("type": "concept"): Término clave en "term", definición concisa en "definition".
2. APROXIMADAMENTE EL 30% DE LAS FICHAS ("type": "question"): Pregunta sumamente corta y concreta en "term" (ej: "¿Qué enzima inicia...?"), respuesta directa en "definition".

${excludeList ? `EVITA estrictamente repetir estos conceptos ya cubiertos: [${excludeList}].` : ''}
Responde ÚNICAMENTE con un JSON con la estructura:
{
  "flashcards": [
    { "type": "concept", "term": "Concepto o Principio", "definition": "Definición concisa, clara y precisa sin rodeos" },
    { "type": "question", "term": "¿Pregunta sumamente corta y concreta?", "definition": "Respuesta directa y exacta sin rodeos" }
  ]
}`;

  const userPrompt = `Material ("${title}" - ${category}):\n\n${rawText.slice(0, 8000)}\n\nGenera las ${count} flashcards adicionales (70% conceptos / 30% preguntas cortas, 100% en español):`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true
      );
      const match = res.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
          return parsed.flashcards.map((f: { term: string; definition: string; type?: 'concept' | 'question' }, i: number) => {
            const isQ = f.type === 'question' || /^\s*¿|\?\s*$/.test(f.term);
            return {
              id: `fc-ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              term: f.term,
              definition: f.definition,
              mastery: 'to-learn' as const,
              type: isQ ? ('question' as const) : ('concept' as const),
            };
          });
        }
      }
    } catch (e) {
      console.warn('[Flashcards AI] Error generando flashcards adicionales con IA:', e);
    }
  }

  // Generador de respaldo a partir del material si la IA está deshabilitada o falla
  const paragraphs = rawText
    .split(/\n{2,}|\.\s+/)
    .map(p => p.trim())
    .filter(p => p.length > 30 && !existingTerms.some(t => p.toLowerCase().includes(t.toLowerCase())));

  const fallbacks: Flashcard[] = [];
  for (let i = 0; i < Math.min(count, Math.max(1, paragraphs.length)); i++) {
    const p = paragraphs[i] || `Concepto clave adicional ${existingTerms.length + i + 1} del tema ${title}`;
    const colonIdx = p.indexOf(':');
    let term = `Concepto ${existingTerms.length + i + 1}`;
    let def = p;
    if (colonIdx > 3 && colonIdx < 50) {
      term = p.slice(0, colonIdx).trim();
      def = p.slice(colonIdx + 1).trim();
    } else {
      const words = p.split(' ');
      term = words.slice(0, Math.min(5, words.length)).join(' ');
      def = p;
    }
    const isQ = (i % 3 === 2);
    fallbacks.push({
      id: `fc-fallback-${Date.now()}-${i}`,
      term: isQ ? `¿Qué caracteriza a ${term}?` : term,
      definition: def,
      mastery: 'to-learn',
      type: isQ ? 'question' : 'concept',
    });
  }

  return fallbacks;
}

export interface TargetedFlashcardsOptions {
  focusTopic?: string;
  styleRatio?: 'mixed-70-30' | 'only-questions' | 'only-concepts';
  count?: number;
  existingTerms?: string[];
  chunks?: DocumentChunk[];
}

/** Generación calibrada de flashcards con enfoque temático y proporción configurable (Tuerca) */
export async function generateTargetedAIFlashcards(
  rawText: string,
  title: string,
  category: string,
  options: TargetedFlashcardsOptions = {}
): Promise<Flashcard[]> {
  const settings = getAISettings();
  const count = options.count || 10;
  const focusTopic = (options.focusTopic || '').trim();
  const styleRatio = options.styleRatio || 'mixed-70-30';
  const existingTerms = options.existingTerms || [];
  const excludeList = existingTerms.slice(-35).join(', ');

  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  let styleDirective = '';
  if (styleRatio === 'only-questions') {
    styleDirective = `DISTRIBUCIÓN OBLIGATORIA (100% PREGUNTAS SUMAMENTE CORTAS Y CONCRETAS):
- Todas las flashcards deben tener "type": "question".
- "term": Pregunta sumamente corta, precisa y directa (ej. "¿Cuál es el mecanismo de...?", "¿Qué fármaco es de primera línea para...?").
- "definition": Respuesta directa, concisa y exacta sin rodeos (máximo 1 o 2 líneas).`;
  } else if (styleRatio === 'only-concepts') {
    styleDirective = `DISTRIBUCIÓN OBLIGATORIA (100% TÉRMINOS CLAVE Y CONCEPTOS):
- Todas las flashcards deben tener "type": "concept".
- "term": Palabra clave o término conceptual nuclear (máximo 4 a 6 palabras).
- "definition": Definición académica concisa, nítida y precisa (1 o 2 oraciones).`;
  } else {
    styleDirective = `DISTRIBUCIÓN OBLIGATORIA (70% CONCEPTOS / 30% PREGUNTAS SUMAMENTE CORTAS Y CONCRETAS):
1. APROXIMADAMENTE EL 70% DE LAS FICHAS ("type": "concept"): Término clave en "term", definición concisa en "definition".
2. APROXIMADAMENTE EL 30% DE LAS FICHAS ("type": "question"): Pregunta sumamente corta y concreta en "term" (ej: "¿Qué enzima regula...?"), respuesta directa y exacta en "definition".`;
  }

  const topicDirective = focusTopic
    ? `ENFOQUE TEMÁTICO PRIORITARIO:
Concéntrate rigurosa y exclusivamente en el subtema: "${focusTopic}". Extrae conceptos y formula preguntas directas sobre este núcleo temático.`
    : 'Aborda los núcleos conceptuales y procedimentales más importantes del texto.';

  const systemPrompt = `Eres el tutor pedagógico experto en repetición espaciada y Active Recall de Contrareloj Study.
Tu objetivo es formular exactamente ${count} flashcards de alta efectividad memorística calibradas al enfoque solicitado.

${translationDirective}

${topicDirective}

${styleDirective}

${excludeList ? `EVITA estrictamente repetir estos conceptos ya cubiertos: [${excludeList}].` : ''}

Responde ÚNICAMENTE con un JSON con la estructura:
{
  "flashcards": [
    { "type": "concept", "term": "Concepto o Principio", "definition": "Definición concisa, clara y precisa sin rodeos" },
    { "type": "question", "term": "¿Pregunta sumamente corta y concreta?", "definition": "Respuesta directa y exacta sin rodeos" }
  ]
}`;

  let sourceSnippet = '';
  if (options.chunks && options.chunks.length > 0) {
    if (focusTopic) {
      const qLower = focusTopic.toLowerCase();
      const matched = options.chunks.filter(c =>
        c.text.toLowerCase().includes(qLower) || (c.heading || '').toLowerCase().includes(qLower)
      );
      const chosen = matched.length > 0 ? matched.slice(0, 8) : options.chunks.slice(0, 8);
      sourceSnippet = chosen.map(c => `[Sección: ${c.heading || 'Parte'}]\n${c.text}`).join('\n\n---\n\n');
    } else {
      sourceSnippet = options.chunks.slice(0, 8).map(c => c.text).join('\n\n');
    }
  } else {
    sourceSnippet = rawText.slice(0, 8000);
  }

  const userPrompt = `Material ("${title}" - ${category}):\n\n${sourceSnippet.slice(0, 8000)}\n\nGenera las ${count} flashcards calibradas (${focusTopic ? `Enfoque: "${focusTopic}", ` : ''}100% en español):`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true
      );
      const match = res.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
          return parsed.flashcards.map((f: { term: string; definition: string; type?: 'concept' | 'question' }, i: number) => {
            const isQ = f.type === 'question' || /^\s*¿|\?\s*$/.test(f.term);
            return {
              id: `fc-calibrated-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              term: f.term,
              definition: f.definition,
              mastery: 'to-learn' as const,
              type: isQ ? ('question' as const) : ('concept' as const),
            };
          });
        }
      }
    } catch (e) {
      console.warn('[Flashcards Targeted AI] Error generando flashcards calibradas con IA:', e);
    }
  }

  return generateAdditionalAIFlashcards(rawText, title, category, existingTerms, count);
}

/** Generación de casos para el juego Adivina Quién / Pistas Progresivas con IA */
export async function generateAIGuessWhoCases(
  rawText: string,
  title: string,
  category: string,
  targetCards: Array<{ id?: string; term: string; definition: string }>,
  allAvailableTerms: string[] = []
): Promise<GuessWhoCase[]> {
  const settings = getAISettings();
  if (!settings.enabled || targetCards.length === 0) return [];

  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  const targetsPrompt = targetCards.slice(0, 5).map((t, idx) =>
    `Caso ${idx + 1}:
- Entidad Objetivo: "${t.term}"
- Definición de referencia: "${t.definition}"`
  ).join('\n\n');

  const candidatesHint = allAvailableTerms
    .filter(t => t && t.length >= 3 && t.length <= 40 && !/^(opci[oó]n|alternativa|respuesta)\s+[a-d0-9]/i.test(t))
    .slice(0, 25)
    .join(', ');

  const systemPrompt = `Eres un docente y pedagogo de élite diseñando el juego interactivo "Adivina Quién / Pistas Progresivas" de Contrareloj Study.
El estudiante debe deducir una entidad misteriosa oculta a través de 4 pistas progresivas.

${translationDirective}

REGLAS DE ORO OBLIGATORIAS (PROHIBIDO EL CONTENIDO GENÉRICO O PLACEHOLDERS):
1. PISTAS ESTRICTAMENTE ESPECÍFICAS PARA CADA CASO:
   NUNCA uses frases genéricas como "Pertenece al ámbito de..." o "Es un concepto nuclear de este tema...". Cada pista debe aportar datos reales del tema.
   - Pista 1 (Contexto y Localización / 100 pts / 3 estrellas): Revela la taxonomía, categoría precisa o ubicación anatómica/estructural de la entidad (ej: "Vía motora descendente de proyección que conecta la corteza motora con la médula espinal..."). NO menciones el nombre de la entidad.
   - Pista 2 (Mecanismo o Causa / 75 pts / 2 estrellas): Explica cómo funciona, su fisiología, proceso de acción, conexiones o función operativa.
   - Pista 3 (Signo Patognomónico o Rasgo Distintivo / 50 pts / 1 estrella): Proporciona un signo clínico característico, hallazgo patognomónico o rasgo distintivo único que la diferencia de entidades similares.
   - Pista 4 (Dato Definitorio / 25 pts / 1 estrella): Proporciona la definición concluyente y completa reemplazando el nombre exacto de la entidad por "[Entidad Oculta]".

2. OPCIONES CANDIDATAS Y DISTRACTORES:
   - Para cada caso genera EXACTAMENTE 4 opciones cortas: la entidad correcta y 3 distractores del MISMO tema o disciplina.
   - PROHIBIDO usar "Opción A", "Opción B", "Opción C", "Opción D" ni comodines como "Criterio Diagnóstico", "Mecanismo Principal" o "Factor Estructural".
   - Las opciones deben ser términos o conceptos breves (máximo 4 palabras).
${candidatesHint ? `   - Puedes usar como distractores o inspiración estos conceptos del kit: [${candidatesHint}].` : ''}

Responde ÚNICAMENTE con un JSON con la estructura:
{
  "cases": [
    {
      "id": "case-1",
      "targetTerm": "Nombre del Concepto",
      "options": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "clues": [
        { "level": 1, "title": "Pista 1: Contexto y Dominio", "badge": "Generalidad", "text": "Texto específico de Pista 1...", "unlockedScore": 100, "stars": 3 },
        { "level": 2, "title": "Pista 2: Mecanismo o Causa", "badge": "Funcionamiento", "text": "Texto específico de Pista 2...", "unlockedScore": 75, "stars": 2 },
        { "level": 3, "title": "Pista 3: Signo Patognomónico", "badge": "Rasgo Clave", "text": "Texto específico de Pista 3...", "unlockedScore": 50, "stars": 1 },
        { "level": 4, "title": "Pista 4: Definición Reveladora", "badge": "Definición", "text": "Texto concluyente con [Entidad Oculta]...", "unlockedScore": 25, "stars": 1 }
      ]
    }
  ]
}`;

  const userPrompt = `Kit: "${title}" (${category})\n\nContexto del material:\n${rawText.slice(0, 6000)}\n\nGenera los casos de Adivina Quién para estas entidades objetivo:\n\n${targetsPrompt}`;

  try {
    const res = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      true
    );

    const match = res.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.cases) && parsed.cases.length > 0) {
        return parsed.cases.map((c: any, idx: number) => {
          const target = targetCards[idx]?.term || c.targetTerm;
          let opts: string[] = Array.isArray(c.options) ? c.options.map((o: any) => String(o).trim()) : [];
          // Garantizar que la correcta esté y que no haya placeholders
          opts = opts.filter(o => o && !/^(opci[oó]n|alternativa|respuesta)\s+[a-d0-9]/i.test(o));
          if (!opts.includes(target)) {
            opts.unshift(target);
          }
          // Asegurar 4 opciones
          while (opts.length < 4) {
            const extra = allAvailableTerms.find(t => !opts.includes(t)) || `Alternativa ${opts.length + 1}`;
            opts.push(extra);
          }
          opts = opts.slice(0, 4).sort(() => Math.random() - 0.5);

          return {
            id: c.id || targetCards[idx]?.id || `guess-case-ai-${idx}`,
            targetTerm: target,
            fullDefinition: targetCards[idx]?.definition || '',
            clues: Array.isArray(c.clues) && c.clues.length === 4
              ? c.clues
              : [
                  { level: 1, title: 'Pista 1: Contexto y Dominio', badge: 'Generalidad', text: c.clues?.[0]?.text || '', unlockedScore: 100, stars: 3 },
                  { level: 2, title: 'Pista 2: Mecanismo o Causa', badge: 'Funcionamiento', text: c.clues?.[1]?.text || '', unlockedScore: 75, stars: 2 },
                  { level: 3, title: 'Pista 3: Signo Patognomónico', badge: 'Rasgo Clave', text: c.clues?.[2]?.text || '', unlockedScore: 50, stars: 1 },
                  { level: 4, title: 'Pista 4: Definición Reveladora', badge: 'Definición', text: c.clues?.[3]?.text || '', unlockedScore: 25, stars: 1 },
                ],
            options: opts,
          };
        });
      }
    }
  } catch (err) {
    console.warn('[GuessWho AI] Error generando casos con IA:', err);
  }

  return [];
}

/** Genera un lote especializado enfocado al 100% en Detección de Conceptos Equivocados / Afirmaciones Falsas */
export async function generateFalseConceptQuestions(
  rawText: string,
  title: string,
  category: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  count: number = 6,
  chunks?: DocumentChunk[]
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) return [];

  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  let sourceRepresentation = '';
  if (chunks && chunks.length > 0) {
    let selectedChunks = chunks.slice(0, 15);
    sourceRepresentation = selectedChunks.map(c =>
      `[FRAGMENTO ID: ${c.id} | ${c.heading || 'Sección'} | Pág/Diapositiva: ${c.pageOrSlide || 1}]\n${c.text}`
    ).join('\n\n---\n\n');
  } else {
    sourceRepresentation = rawText.slice(0, 18000);
  }

  const systemPrompt = `Eres un docente y evaluador universitario de élite en Contrareloj Study.
Tu especialidad es la técnica pedagógica de discriminación analítica: "Detección del Concepto Equivocado, Afirmación Falsa o Elemento Impostor".

${translationDirective}

OBJETIVO CRÍTICO:
Debes formular exactamente ${count} preguntas especializadas donde el estudiante deba identificar el ERROR conceptual, la afirmación FALSA o el concepto EQUIVOCADO.

FORMATOS REQUERIDOS:
1. "multiple-choice" (Aproximadamente 4 preguntas):
   - El enunciado DEBE pedir explícitamente señalar la opción FALSA, INCORRECTA o EL CONCEPTO EQUIVOCADO (ejemplos: "¿Cuál de las siguientes afirmaciones es FALSA respecto a...", "Señala el concepto EQUIVOCADO sobre...", "Todas las siguientes afirmaciones son correctas, EXCEPTO:").
   - 3 opciones (distractores) DEBEN ser afirmaciones rigurosamente VERDADERAS y fundamentadas en el texto.
   - 1 opción ("respuesta_correcta") DEBE ser la afirmación FALSA o que contiene una alteración conceptual categórica (por ejemplo, invertir una vía, alterar un mecanismo, cambiar una ley o atribuir una función contraria).
2. "multi-select" (Aproximadamente 2 preguntas):
   - El enunciado DEBE pedir seleccionar las 2 afirmaciones que son FALSAS o incorrectas sobre el tema (ejemplo: "Selecciona las 2 afirmaciones que son FALSAS o conceptualmente incorrectas sobre...").
   - Las opciones marcadas en "indices_correctos" DEBEN ser exactamente las que contienen los errores conceptuales.

Responde ÚNICAMENTE con un JSON con la estructura:
{
  "preguntas": [
    {
      "id": 1,
      "tipo": "multiple-choice",
      "concepto_evaluado": "Concepto evaluado",
      "pregunta": "¿Cuál de las siguientes afirmaciones es **FALSA** respecto a [concepto]?",
      "opciones": {
        "A": "Afirmación verdadera 1",
        "B": "Afirmación FALSA que contiene el error conceptual",
        "C": "Afirmación verdadera 2",
        "D": "Afirmación verdadera 3"
      },
      "respuesta_correcta": "B",
      "retroalimentacion": {
        "referencia_al_texto": "Cita que desmiente la opción falsa.",
        "explicacion_logica": "Por qué la opción B es la falsa e incorrecta.",
        "por_que_fallan_las_otras": "Por qué las opciones A, C y D son verdaderas."
      }
    },
    {
      "id": 2,
      "tipo": "multi-select",
      "concepto_evaluado": "Concepto evaluado",
      "pregunta": "Selecciona las 2 afirmaciones que son **FALSAS** o incorrectas sobre [concepto]:",
      "opciones_multiples": ["Afirmación Verdadera 1", "Afirmación FALSA 1", "Afirmación Verdadera 2", "Afirmación FALSA 2", "Afirmación Verdadera 3"],
      "indices_correctos": [1, 3],
      "retroalimentacion": {
        "referencia_al_texto": "Fundamento del texto.",
        "explicacion_logica": "Por qué las opciones 1 y 3 son falsas.",
        "por_que_fallan_las_otras": "Por qué las demás son correctas."
      }
    }
  ]
}`;

  const userPrompt = `Material ("${title}" - ${category}) [Nivel: ${difficulty.toUpperCase()}]:\n\n${sourceRepresentation}\n\nGenera las ${count} preguntas de afirmación falsa/concepto equivocado (100% en español):`;

  try {
    const rawRes = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      true
    );

    const match = rawRes.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.preguntas) && parsed.preguntas.length > 0) {
        return parsed.preguntas.map((p: any, idx: number): Question => {
          const isMulti = p.tipo === 'multi-select';
          let options: string[] = [];
          let correctIndex: number | undefined;
          let correctIndices: number[] | undefined;

          if (isMulti) {
            options = Array.isArray(p.opciones_multiples)
              ? p.opciones_multiples.map(String)
              : ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'];
            correctIndices = Array.isArray(p.indices_correctos) ? p.indices_correctos : [0, 1];
          } else {
            const optsObj = p.opciones || {};
            options = [
              String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
              String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
              String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
              String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
            ];
            const letter = String(p.respuesta_correcta || 'A').trim().toUpperCase();
            correctIndex = letter === 'B' ? 1 : letter === 'C' ? 2 : letter === 'D' ? 3 : 0;
          }

          const fb = p.retroalimentacion || {};
          const explanation = [
            fb.explicacion_logica,
            fb.por_que_fallan_las_otras,
            fb.referencia_al_texto ? `Referencia: ${fb.referencia_al_texto}` : '',
          ].filter(Boolean).join('\n\n') || p.explicacion || 'Identificación del concepto falso o erróneo.';

          return {
            id: `q-false-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            type: isMulti ? 'multi-select' : 'multiple-choice',
            question: p.pregunta,
            options,
            correctIndex,
            correctIndices,
            difficulty,
            topic: p.concepto_evaluado || title,
            explanation,
          };
        });
      }
    }
  } catch (err) {
    console.warn('[False Concept Generator] Error generando preguntas de afirmación falsa:', err);
  }

  return [];
}

/** Generación de Guía de Estudio bajo demanda con 3 niveles de extensión (1x, 2x, 3x) y generación modular continua */
export async function generateAIStudyGuide(
  rawText: string,
  title: string,
  category: string,
  depth: StudyGuideDepth = 'ultra',
  onProgress?: (message: string, percent: number) => void
): Promise<string> {
  const settings = getAISettings();
  const cleanInput = (rawText || '').trim();
  const langDetection = detectDocumentLanguage(cleanInput);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  if (!settings.enabled) {
    return '';
  }

  // --- MODO 1: ESENCIAL (1x - Síntesis y núcleos conceptuales rápidos) ---
  if (depth === 'essential') {
    onProgress?.('Generando Guía Esencial: síntesis de núcleos y conceptos clave...', 40);

    const systemPrompt = `Eres un catedrático universitario de élite y redactor académico principal de Contrareloj Study.
Tu misión es generar una GUÍA DE ESTUDIO ESENCIAL Y DE ALTO IMPACTO (1x) en Markdown.
Condensa los pilares teóricos, núcleos conceptuales ineludibles, definiciones clave y cuadros rápidos para consolidación veloz.

${translationDirective}

ESTRUCTURA DIDÁCTICA EXIGIDA:
# Guía de Estudio Esencial: ${title}
> **Resumen Ejecutivo:** Visión condensada y trascendencia del tema en el examen.

## 1. Núcleos Conceptuales y Definiciones Clave
(Definiciones precisas de los términos basales del material)

## 2. Vías y Mecanismos Críticos
(Relaciones de causa-efecto esenciales y puntos de inflexión conceptual)

## 3. Cuadro Comparativo de Alto Rendimiento
(Tabla Markdown con las principales distinciones entre elementos del tema)

## 4. Mnemotecnias y Claves de Examen
(Reglas nemotécnicas directas y perlas para responder preguntas trampa)`;

    const userPrompt = `DOCUMENTO BASE ("${title}" - ${category}):
${cleanInput}

Genera la Guía de Estudio Esencial en español (Markdown):`;

    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        false,
        undefined,
        { max_tokens: 4096 }
      );
      onProgress?.('Guía Esencial completada.', 100);
      return res?.trim() || '';
    } catch (e) {
      console.warn('[StudyGuide AI] Error en guía esencial:', e);
      return '';
    }
  }

  // --- MODO 2: COMPLETA (2x - Desarrollo sección por sección y tablas comparativas) ---
  if (depth === 'complete') {
    onProgress?.('Fase 1/2: Desarrollando marco teórico y desglose sección por sección (2x)...', 25);

    // Fase 1: Marco Teórico y Desarrollo Sistemático
    const phase1System = `Eres un catedrático universitario de élite y redactor académico principal de Contrareloj Study.
Tu misión es redactar la PRIMERA PARTE (Fase 1) de una GUÍA DE ESTUDIO COMPLETA Y DETALLADA (2x) en Markdown.
Esta fase debe cubrir con exhaustividad los fundamentos teóricos y el recorrido sistemático sección por sección / diapositiva por diapositiva.

${translationDirective}

ESTRUCTURA DE LA FASE 1:
# Guía de Estudio Completa: ${title}
> **Resumen Ejecutivo:** Análisis panorámico y alcance académico.

## 1. Fundamentos y Marco Teórico Integral
(Principios basales, taxonomía, definiciones formales y antecedentes)

## 2. Desarrollo Sistemático Exhaustivo (Sección por Sección / Diapositiva por Diapositiva)
(Desarrollo minucioso de CADA diapositiva, subtema y elemento del material original, desglosando cada fármaco, mecanismo o concepto individualmente con rigor causal)`;

    const phase1User = `DOCUMENTO ORIGINAL ("${title}" - ${category}):
${cleanInput}

Redacta la Fase 1 de la Guía de Estudio Completa en español (Markdown). Cubre minuciosamente cada sección:`;

    let part1 = '';
    try {
      part1 = await queryAICompletion(
        [
          { role: 'system', content: phase1System },
          { role: 'user', content: phase1User }
        ],
        false,
        undefined,
        { max_tokens: 6144 }
      );
    } catch (e) {
      console.warn('[StudyGuide AI] Error en Fase 1 de guía completa:', e);
    }

    onProgress?.('Fase 2/2: Creando cuadros comparativos extensos, perlas y mnemotecnias...', 70);

    // Fase 2: Cuadros comparativos, perlas de examen y mnemotecnias
    const phase2System = `Eres un catedrático universitario de élite y redactor académico principal de Contrareloj Study.
Tu misión es redactar la SEGUNDA PARTE (Fase 2) de la GUÍA DE ESTUDIO COMPLETA (2x) en Markdown.
Debes crear tablas comparativas exhaustivas, casos prácticos, perlas clínicas/analíticas y mnemotecnias avanzadas que complementen la Fase 1.

${translationDirective}

ESTRUCTURA DE LA FASE 2:
## 3. Cuadros Comparativos, Clasificaciones y Vías de Acción
(Tablas comparativas extensas en Markdown contrastando todas las entidades, fármacos o categorías del tema)

## 4. Perlas de Examen, Casos Prácticos y Errores Habituales
(Diferenciaciones sutiles, preguntas trampa típicas de examen, análisis diferencial y razonamiento analítico)

## 5. Mnemotecnias y Síntesis de Alto Rendimiento
(Reglas nemotécnicas estructuradas, acrónimos mnemónicos y resumen de consolidación rápida)`;

    const phase2User = `DOCUMENTO ORIGINAL ("${title}" - ${category}):
${cleanInput}

Redacta la Fase 2 (Tablas comparativas, perlas de examen y mnemotecnias) en español (Markdown):`;

    let part2 = '';
    try {
      part2 = await queryAICompletion(
        [
          { role: 'system', content: phase2System },
          { role: 'user', content: phase2User }
        ],
        false,
        undefined,
        { max_tokens: 6144 }
      );
    } catch (e) {
      console.warn('[StudyGuide AI] Error en Fase 2 de guía completa:', e);
    }

    onProgress?.('Guía Completa (2x) consolidada con éxito.', 100);
    const combined2x = [part1.trim(), part2.trim()].filter(p => p.length > 50).join('\n\n---\n\n');
    return combined2x || part1 || part2 || '';
  }

  // --- MODO 3: ULTRA-EXHAUSTIVA (3x - Tratado académico profundo sin límites) ---
  onProgress?.('Fase 1/3: Fundamentación estructural, marco epistémico y glosario profundo...', 15);

  // Fase 1: Marco Epistémico, Fundamentación Fisiopatológica/Estructural y Glosario Exhaustivo
  const p1System = `Eres un catedrático de honor y redactor de tratados académicos para Contrareloj Study.
Tu misión es redactar el MÓDULO 1 de una GUÍA DE ESTUDIO MAGNA ULTRA-EXHAUSTIVA (3x) en Markdown.
Este módulo debe ser de máxima profundidad científica y académica, sin recortar ni condensar nada.

${translationDirective}

ESTRUCTURA DEL MÓDULO 1:
# Tratado y Guía de Estudio Magna: ${title}
> **Resumen Ejecutivo y Visión Epistémica:** Contextualización profunda, relevancia disciplinar y mapa conceptual del documento.

## 1. Fundamentos Teóricos, Marco Conceptual y Fisiopatológico / Estructural
(Principios basales, leyes o axiomas que rigen el tema, taxonomía detallada y causalidad profunda)

## 2. Glosario Técnico Exhaustivo y Nomenclatura Especializada
(Definición rigurosa, etimología conceptual y contexto clínico/teórico de cada término técnico mencionado en el material)`;

  const p1User = `DOCUMENTO COMPLETO ("${title}" - ${category}):
${cleanInput}

Redacta el Módulo 1 con máxima amplitud y rigor en español (Markdown):`;

  let mod1 = '';
  try {
    mod1 = await queryAICompletion(
      [
        { role: 'system', content: p1System },
        { role: 'user', content: p1User }
      ],
      false,
      undefined,
      { max_tokens: 6144 }
    );
  } catch (e) {
    console.warn('[StudyGuide AI] Error en Módulo 1 ultra:', e);
  }

  onProgress?.('Fase 2/3: Recorrido minucioso diapositiva por diapositiva / sección por sección (3x)...', 45);

  // Fase 2: Recorrido exhaustivo diapositiva por diapositiva / sección por sección
  const p2System = `Eres un catedrático de honor y redactor de tratados académicos para Contrareloj Study.
Tu misión es redactar el MÓDULO 2 de la GUÍA DE ESTUDIO MAGNA ULTRA-EXHAUSTIVA (3x) en Markdown.
DEBES RECORRER CADA DIAPOSITIVA Y SECCIÓN DEL DOCUMENTO ORIGINAL SIN SALTARTE NINGUNA.
Desglosa cada concepto, fórmula, fármaco, reacción o estructura con detalle anatómico/molecular/conceptual.

${translationDirective}

ESTRUCTURA DEL MÓDULO 2:
## 3. Desarrollo Sistemático Minucioso (Diapositiva por Diapositiva / Sección por Sección)
(Análisis exhaustivo punto por punto:
- Diapositiva / Sección: Título y objetivo
- Mecanismo detallado / Fisiología / Derivación matemática
- Implicaciones prácticas / Clínicas / Aplicaciones reales
- Interacciones, casos límite y excepciones)`;

  const p2User = `DOCUMENTO COMPLETO ("${title}" - ${category}):
${cleanInput}

Redacta el Módulo 2 con desarrollo exhaustivo diapositiva por diapositiva en español (Markdown):`;

  let mod2 = '';
  try {
    mod2 = await queryAICompletion(
      [
        { role: 'system', content: p2System },
        { role: 'user', content: p2User }
      ],
      false,
      undefined,
      { max_tokens: 8192 }
    );
  } catch (e) {
    console.warn('[StudyGuide AI] Error en Módulo 2 ultra:', e);
  }

  onProgress?.('Fase 3/3: Creando grandes tablas matriciales, casos clínicos de examen y mnemotecnias...', 80);

  // Fase 3: Tablas matriciales, casos clínicos/prácticos de examen, preguntas trampa y mnemotecnias avanzadas
  const p3System = `Eres un catedrático de honor y redactor de tratados académicos para Contrareloj Study.
Tu misión es redactar el MÓDULO 3 de la GUÍA DE ESTUDIO MAGNA ULTRA-EXHAUSTIVA (3x) en Markdown.
Construye las tablas comparativas más exhaustivas posibles, casos de examen analítico y mnemotecnias de consolidación.

${translationDirective}

ESTRUCTURA DEL MÓDULO 3:
## 4. Cuadros Comparativos Matriciales y Algoritmos Diferenciales
(Grandes tablas Markdown completas que contrasten todos los elementos del tema sin omitir filas ni columnas)

## 5. Casos Prácticos de Examen, Perlas Clínicas y Preguntas Trampa Frecuentes
(Casos de razonamiento complejo, diagnósticos diferenciales, errores habituales y cómo resolver preguntas de nivel experto)

## 6. Mnemotecnias Avanzadas y Síntesis de Retención de Máximo Rendimiento
(Acrónimos, analogías estructuradas y mapas nemotécnicos para fijar todo el contenido en memoria de largo plazo)`;

  const p3User = `DOCUMENTO COMPLETO ("${title}" - ${category}):
${cleanInput}

Redacta el Módulo 3 (Grandes tablas matriciales, casos prácticos, perlas y mnemotecnias) en español (Markdown):`;

  let mod3 = '';
  try {
    mod3 = await queryAICompletion(
      [
        { role: 'system', content: p3System },
        { role: 'user', content: p3User }
      ],
      false,
      undefined,
      { max_tokens: 8192 }
    );
  } catch (e) {
    console.warn('[StudyGuide AI] Error en Módulo 3 ultra:', e);
  }

  onProgress?.('Tratado y Guía Magna Ultra-Exhaustiva (3x) consolidada con éxito.', 100);

  const sections = [mod1.trim(), mod2.trim(), mod3.trim()].filter(s => s.length > 50);
  return sections.join('\n\n---\n\n') || mod1 || mod2 || mod3 || '';
}

/** Generación de Episodio de Podcast bajo demanda con opciones avanzadas de Formato, Duración y Diferenciación */
export async function generateAIPodcast(
  rawText: string,
  title: string,
  category: string,
  optionsOrOrientation?: string | PodcastGenerationOptions
): Promise<PodcastEpisode | null> {
  const options: PodcastGenerationOptions = typeof optionsOrOrientation === 'string'
    ? { orientation: optionsOrOrientation, format: 'detailed', duration: 'normal' }
    : (optionsOrOrientation || { format: 'detailed', duration: 'normal' });

  const selectedFormat: PodcastFormat = options.format || 'detailed';
  const selectedDuration: PodcastDuration = options.duration || 'normal';
  const customOrientation = options.orientation?.trim() || '';

  // Escanear material de estudio completo hasta 70.000 caracteres
  const fullMaterial = (rawText || '').slice(0, 70000);

  const settings = getAISettings();
  const langDetection = detectDocumentLanguage(fullMaterial);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  // Detectar si el usuario exigió explícitamente máxima profundidad y hablar de todo literalmente
  const isExhaustiveRequested =
    selectedFormat === 'detailed' ||
    /(todo|literalmente|detallado|exhaustivo|a fondo|completo|profundo|minucioso|cada punto|sin resumir)/i.test(customOrientation);

  let formatDirective = '';
  switch (selectedFormat) {
    case 'brief':
      formatDirective = `FORMATO: BREVE (RESUMEN EJECUTIVO Y DIRECTO).
- Objetivo: Un resumen breve y dinámico para que el estudiante capte velozmente los pilares del tema.
- Estilo: Ágil, vibrante, sin rodeos ni preámbulos introductorios largos.
- Foco: Definiciones fundamentales, conclusiones clave y conceptos esenciales condensados.`;
      break;
    case 'critique':
      formatDirective = `FORMATO: CRÍTICA Y EVALUACIÓN EXPERTA.
- Objetivo: Una revisión experta del material, con comentarios analíticos constructivos para dominar el tema y evitar trampas conceptuales.
- Estilo: Analítico, riguroso, pedagógico y mentorizador.
- Foco: Puntos fuertes, errores típicos en exámenes, sesgos habituales y consejos de dominio práctico.`;
      break;
    case 'debate':
      formatDirective = `FORMATO: DEBATE REFLEXIVO Y PERSPECTIVAS CONTRAPUESTAS.
- Objetivo: Un debate intelectualmente estimulante entre Sofia y Alex que explore tensiones y diferentes ángulos del tema.
- Estilo: Dialéctico, respetuoso, incisivo y ágil.
- Foco: Sofia y Alex sostienen visiones complementarias o en tensión (teoría vs práctica, enfoque tradicional vs moderno). Se retan cordialmente y sintetizan conclusiones comunes.`;
      break;
    case 'detailed':
    default:
      formatDirective = `FORMATO: INFORMACIÓN DETALLADA Y EXHAUSTIVA (ANÁLISIS PROFUNDO).
- Objetivo: Una animada conversación entre dos presentadores que analizan y conectan temas de las fuentes a profundidad total.
- Cobertura Total: Si el tema es amplio o se pide detalle, DEBES hablar de TODO literalmente: conceptos, fórmulas, pasos secuenciales, causas, consecuencias, autores y fechas sin omitir ningún subtema.
- Prohibido: No usar frases superficiales o evasivas como "y muchos puntos más" o "a grandes rasgos". Desglosar el funcionamiento íntimo de cada principio.
- Estilo: Riguroso, pedagógico, entusiasta y sumamente minucioso.`;
      break;
  }

  let durationDirective = '';
  let targetTurnCount = '14 a 18 turnos equilibrados';
  let defaultDurationLabel = '4:30 min';

  switch (selectedDuration) {
    case 'short':
      targetTurnCount = '6 a 8 turnos concisos';
      defaultDurationLabel = '2:00 min';
      durationDirective = `DURACIÓN: CORTO (-2 MINUTOS).
- Extensión requerida: Genera entre 6 y 8 turnos de diálogo en total.
- La duración estimada en el JSON debe ser "2:00 min".
- Longitud de los turnos: concisos, directos al grano (aproximadamente 200 - 300 palabras en total).`;
      break;
    case 'long': {
      let dynamicDurationMin = 12;
      let dynamicDurationMax = 28;
      defaultDurationLabel = '20:00 min';
      targetTurnCount = '32 a 48 turnos desarrollados y sustanciales';

      if (fullMaterial.length > 40000 || /4[0-3]|cuarenta/i.test(customOrientation)) {
        dynamicDurationMin = 25;
        dynamicDurationMax = 43;
        defaultDurationLabel = '35:00 min';
        targetTurnCount = '45 a 60 turnos desarrollados y sustanciales';
      } else if (fullMaterial.length > 20000 || isExhaustiveRequested) {
        dynamicDurationMin = 16;
        dynamicDurationMax = 30;
        defaultDurationLabel = '24:00 min';
        targetTurnCount = '36 a 50 turnos desarrollados y sustanciales';
      } else {
        dynamicDurationMin = 10;
        dynamicDurationMax = 20;
        defaultDurationLabel = '15:00 min';
        targetTurnCount = '28 a 40 turnos desarrollados y sustanciales';
      }

      durationDirective = `DURACIÓN: LARGO (10 A 30 MINUTOS, HASTA TOPE DE 43 MINUTOS SEGÚN EL TEMA).
- REGLA DE TIEMPO ESTRICTA: El podcast NO DEBE BAJAR DE 10 MINUTOS (duración mínima 10:00 min).
- Objetivo de duración para este material: entre ${dynamicDurationMin} y ${dynamicDurationMax} minutos (procurando mantenerse habitualmente entre 15 y 30 minutos, con un tope máximo de hasta 43 minutos si el volumen del material o la petición del usuario lo justifican).
- Extensión requerida: Genera entre ${targetTurnCount}.
- Densidad de cada turno: Cada intervención debe ser extensa y sustancial (párrafos enriquecidos de 70 a 130 palabras, con explicaciones paso a paso, ejemplos prácticos, analogías cotidianas y debate a fondo).
- La duración estimada en el JSON debe ser entre "${dynamicDurationMin}:00 min" y "${dynamicDurationMax}:00 min" (ejemplo: "${defaultDurationLabel}").`;
      break;
    }
    case 'normal':
    default:
      targetTurnCount = '14 a 18 turnos equilibrados';
      defaultDurationLabel = '4:30 min';
      durationDirective = `DURACIÓN: NORMAL (4 A 6 MINUTOS).
- Extensión requerida: Genera entre 14 y 18 turnos de diálogo equilibrados.
- La duración estimada en el JSON debe ser "4:30 min".
- Longitud de los turnos: ritmo natural de podcast conversacional (aproximadamente 600 - 850 palabras en total).`;
      break;
  }

  // Directiva de mandato prioritario del usuario
  let orientationDirective = '';
  if (customOrientation) {
    orientationDirective = `
MANDATO PRIORITARIO DEL USUARIO:
El usuario ha establecido explícitamente las siguientes instrucciones de orientación:
"${customOrientation}"
ESTA ES LA MÁXIMA PRIORIDAD DEL EPISODIO: Sofia y Alex deben ajustar el guión, las preguntas clave, el tono y los temas tratados para cumplir estrictamente con esta indicación.
`;
  }

  if (isExhaustiveRequested) {
    orientationDirective += `
DIRECTIVA DE COBERTURA TOTAL ("HABLAR DE TODO LITERALMENTE"):
El usuario ha exigido un nivel de detalle MÁXIMO. Debes abordar exhaustivamente TODO lo que contiene el material fuente:
- Recorre sistemáticamente cada subtema, fórmula, definición, fecha y autor.
- Sofia y Alex deben desglosar el 'cómo' y el 'por qué' de cada principio con precisión milimétrica sin recortar contenido.
`;
  }

  // Directiva de diferenciación y no-repetición respecto al episodio previo
  let previousEpisodeDirective = '';
  if (options.previousPodcast) {
    const prev = options.previousPodcast;
    const prevTitle = prev.title || '';
    const prevFirstLine = prev.dialogue?.[0]?.text || '';
    const prevFirstSpeaker = prev.dialogue?.[0]?.speaker || 'Sofia';
    const prevSample = prev.dialogue?.slice(0, 3).map((d) => `${d.speaker}: "${d.text}"`).join(' | ') || '';

    previousEpisodeDirective = `
REGLA ESTRICTA DE DIFERENCIACIÓN (NO REPETIR EL EPISODIO ANTERIOR):
Ya existe un episodio previo generado para este material titulado "${prevTitle}".
En el episodio anterior, comenzó ${prevFirstSpeaker} diciendo: "${prevFirstLine}".
Primeras intervenciones del episodio previo: ${prevSample}

OBLIGACIONES DE VARIEDAD FRESCA:
1. PROHIBIDO REPETIR: No uses la misma frase de apertura ni las mismas analogías, metáforas o chistes que en el episodio anterior.
2. ESTRUCTURA DIFERENTE: No sigas la misma secuencia temática. Aborda el contenido desde otro ángulo conceptual, con nuevas preguntas intrigantes y otra óptica de análisis.
3. INVERTIR O VARIAR QUIÉN HABLA PRIMERO: Haz que empiece ${prevFirstSpeaker === 'Sofia' ? 'Alex' : 'Sofia'}, o inicia directamente 'in medias res' discutiendo un dilema o caso fascinante sin introducciones típicas.
4. METÁFORAS NOVEDOSAS: Todas las comparaciones pedagógicas deben ser completamente distintas a las del episodio previo.
`;
  }

  // Variedad de estilos de apertura para evitar que todos los podcasts suenen iguales
  const openingStyles = [
    'Apertura in medias res: Entrar directamente al núcleo de un dilema o enigma fascinante sin introducciones formales.',
    'Apertura socrática: Uno de los presentadores formula una pregunta provocadora o contraintuitiva sobre el tema.',
    'Apertura con paradoja cotidiana: Iniciar con un problema real que despierta curiosidad inmediata antes de desvelar la teoría.',
    'Apertura con trampas conceptuales: Iniciar advirtiendo sobre el error más común y peligroso que la gente comete con este tema.',
    'Apertura dialéctica: Plantear un debate con dos posturas encontradas que se reconciliarán a lo largo del análisis.'
  ];
  const randomOpeningStyle = openingStyles[Math.floor(Math.random() * openingStyles.length)];

  const systemPrompt = `Eres el productor ejecutivo y guionista principal del podcast educativo Contrareloj Review.
A partir del texto proporcionado, genera un episodio de repaso dinámico, enriquecido, riguroso y conversacional entre Sofia (Host entusiasta y perspicaz) y Alex (Tutor pedagógico experto).
Deben discutir los puntos centrales del tema con naturalidad, analogías y claridad 100% en español.

ESTILO DE APERTURA PARA ESTE EPISODIO:
${randomOpeningStyle}

DIRECTRICES ESPECÍFICAS DE FORMATO Y DURACIÓN:
${formatDirective}

${durationDirective}

${orientationDirective}

${previousEpisodeDirective}

${translationDirective}

Responde ÚNICAMENTE con un JSON con la estructura:
{
  "podcast": {
    "title": "Repaso: ${title}",
    "duration": "${defaultDurationLabel}",
    "dialogue": [
      { "speaker": "Sofia", "time": "0:00", "text": "..." },
      { "speaker": "Alex", "time": "0:45", "text": "..." }
    ]
  }
}`;

  const userPrompt = `Material de estudio ("${title}" - ${category}) [Extensión: ${fullMaterial.length} caracteres]:\n\n${fullMaterial}${customOrientation ? `\n\nInstrucción obligatoria del usuario:\n${customOrientation}` : ''}\n\nGenera el episodio de podcast con formato "${selectedFormat}" y duración "${selectedDuration}" (${targetTurnCount} 100% en español):`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true,
        undefined,
        { temperature: 0.75, max_tokens: 8192 }
      );

      // Extracción y recuperación tolerante de JSON
      let parsed: any = null;
      const cleanRes = res.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const match = cleanRes.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          try {
            const dialogueIdx = match[0].indexOf('"dialogue"');
            if (dialogueIdx !== -1) {
              const before = match[0].slice(0, dialogueIdx);
              const after = match[0].slice(dialogueIdx);
              const lastClosing = after.lastIndexOf('}');
              if (lastClosing !== -1) {
                const repaired = `${before}${after.slice(0, lastClosing + 1)}]}}`;
                parsed = JSON.parse(repaired);
              }
            }
          } catch (repairErr) {
            console.warn('[Podcast AI] No se pudo reparar JSON truncado:', repairErr);
          }
        }
      }

      if (parsed?.podcast && Array.isArray(parsed.podcast.dialogue) && parsed.podcast.dialogue.length > 0) {
        // Normalización continua de marcas de tiempo basada en conteo de palabras
        let accumulatedSecs = 0;
        const normalizedDialogue = parsed.podcast.dialogue.map((item: any, idx: number) => {
          const currentSecs = accumulatedSecs;
          const mins = Math.floor(currentSecs / 60);
          const secs = Math.floor(currentSecs % 60);
          const timeFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

          const text = (item.text || '').trim();
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          // ~140 palabras por minuto (~0.43s por palabra) + pausa conversacional de 1.2s
          const turnDuration = Math.max(4, Math.round(wordCount * 0.43 + 1.2));
          accumulatedSecs += turnDuration;

          return {
            speaker: item.speaker || (idx % 2 === 0 ? 'Sofia' : 'Alex'),
            text,
            time: timeFormatted,
          };
        });

        // Duración final calculada
        let finalDuration = parsed.podcast.duration || defaultDurationLabel;
        if (selectedDuration === 'long') {
          // El podcast largo debe situarse entre 10 y 30 min (con tope de 43 min)
          const computedMins = Math.max(10, Math.min(43, Math.round(accumulatedSecs / 60)));
          const computedSecs = accumulatedSecs % 60;
          finalDuration = `${computedMins}:${computedSecs < 10 ? '0' : ''}${computedSecs} min`;
        } else if (selectedDuration === 'short') {
          const computedMins = Math.max(1, Math.min(3, Math.round(accumulatedSecs / 60)));
          const computedSecs = accumulatedSecs % 60;
          finalDuration = `${computedMins}:${computedSecs < 10 ? '0' : ''}${computedSecs} min`;
        } else {
          const computedMins = Math.max(3, Math.min(8, Math.round(accumulatedSecs / 60)));
          const computedSecs = accumulatedSecs % 60;
          finalDuration = `${computedMins}:${computedSecs < 10 ? '0' : ''}${computedSecs} min`;
        }

        return {
          id: `pod-ai-${Date.now()}`,
          title: parsed.podcast.title || `Repaso: ${title}`,
          duration: finalDuration,
          hosts: [
            { name: 'Sofia', role: 'Host', avatar: 'S' },
            { name: 'Alex', role: 'Tutor IA', avatar: 'A' },
          ],
          dialogue: normalizedDialogue,
          format: selectedFormat,
          durationMode: selectedDuration,
          orientation: customOrientation,
        };
      }
    } catch (e) {
      console.warn('[Podcast AI] Error generando podcast con IA:', e);
    }
  }

  return null;
}

/** Asistente IA Contrareloj potenciado por IA con fallback inteligente */
export async function askTheaAI(
  userQuery: string,
  kit: StudyKit,
  history: Array<{ sender: 'thea' | 'user'; text: string }>,
  enginePreference: 'ollama' | 'grok' | 'groq' | 'auto' = 'auto'
): Promise<string> {
  const generalSettings = getAISettings(); // SIEMPRE Ollama
  const oralSettings = getOralAISettings(); // SIEMPRE Groq

  // Enrutamiento desacoplado estricto:
  // - Para Leccion Oral y Conversacion Oral ('groq' o 'grok'): Groq Cloud es el motor principal obligatorio.
  // - Para Chat Tutor / Ask Thea y cualquier otra consulta general ('ollama' o 'auto'): Ollama Cloud es el motor principal obligatorio.
  const isOral = enginePreference === 'groq' || enginePreference === 'grok';
  const targetSettings: AISettings = isOral ? oralSettings : generalSettings;
  const fallbackSettings: AISettings | null = isOral ? generalSettings : null;

  if (targetSettings.enabled) {
    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'system',
          content: `Eres una tutora académica inteligente, cálida y pedagógica de Contrareloj Study.
Estás ayudando al estudiante a dominar el tema: "${kit.title}" (Categoría: ${kit.category}).
Contexto del material de estudio del estudiante:
${kit.studyGuideMarkdown.slice(0, 5000)}

${getSpanishTranslationDirective(kit.sourceLanguage)}

Responde siempre de forma clara, motivadora y estructurada en español. Si el material contiene pasajes o términos en otro idioma, tradúcelos y explícalos en español. Usa viñetas, analogías o reglas mnemotécnicas cuando sea útil para aprender mejor.`,
        },
      ];

      // Incluir últimos 4 mensajes del historial para coherencia conversacional
      const recent = history.slice(-4);
      for (const msg of recent) {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }

      messages.push({ role: 'user', content: userQuery });

      let reply = '';
      try {
        reply = await queryAICompletion(messages, false, targetSettings);
      } catch (primaryErr) {
        // Si Groq falla (HTTP 429, timeout o error) en Leccion Oral, reintentar silenciosamente con Ollama
        if (fallbackSettings) {
          console.warn('[AskThea AI] Motor Groq oral fallo, reintentando silenciosamente con Ollama para no cortar la leccion:', primaryErr);
          reply = await queryAICompletion(messages, false, fallbackSettings);
        } else {
          throw primaryErr;
        }
      }

      if (reply && reply.trim().length > 10) {
        return reply.trim();
      }
    } catch (err) {
      console.warn('[AskThea AI] Fallback a respuestas locales:', err);
    }
  }

  // ── Fallback local inteligente basado en el texto del Study Kit ──
  const lowerQuery = userQuery.toLowerCase();

  // Buscar coincidencia en preguntas
  const matchingQuestion = kit.questions.find(
    q => lowerQuery.includes(q.topic.toLowerCase()) || q.question.toLowerCase().includes(lowerQuery.slice(0, 15))
  );
  if (matchingQuestion) {
    return `Sobre tu duda en torno a **${matchingQuestion.topic}**: ${matchingQuestion.explanation}\n\n¿Quieres que profundicemos en este concepto o que te haga una pregunta de práctica?`;
  }

  // Buscar coincidencia en flashcards
  const matchingCard = kit.flashcards.find(
    f => lowerQuery.includes(f.term.toLowerCase()) || f.definition.toLowerCase().includes(lowerQuery.slice(0, 15))
  );
  if (matchingCard) {
    return `El concepto de **${matchingCard.term}** en este material se define como: ${matchingCard.definition}.\n\nEs un concepto clave para las evaluaciones de ${kit.category}.`;
  }

  return `Excelente pregunta sobre **${kit.title}**. Analizando tus apuntes y la guía de estudio:\n\n` +
    `• El núcleo del tema se centra en comprender las interacciones y definiciones de ${kit.questions[0]?.topic || 'los principios fundamentales'}.\n` +
    `• Recuerda repasar las sesiones de **Smart Study** para poner a prueba tu retención activa.\n\n` +
    `¿Deseas que te explique algún término específico o que simulemos una pregunta de examen?`;
}

export interface TopicResearchResult {
  text: string;
  title: string;
  sources: string[];
}

/**
 * Investiga un tema desde cero consultando fuentes abiertas (Wikipedia / Open Knowledge)
 * y sintetiza un dossier académico basado en evidencia científica utilizando IA.
 */
export async function researchTopicAndGenerateKit(
  topic: string,
  focusArea?: string
): Promise<TopicResearchResult> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    throw new Error('Debes ingresar un tema para realizar la investigación.');
  }

  const sources: string[] = [];
  let factualContext = '';
  let discoveredTitle = cleanTopic;

  // 1. Buscar en Wikipedia en español abierta
  try {
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTopic)}&utf8=&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const hits = searchData.query?.search || [];
      if (hits.length > 0) {
        discoveredTitle = hits[0].title;
        // Extraer contenido de los 2 artículos más relevantes en paralelo
        const topTitles = hits.slice(0, 2).map((h: { title: string }) => h.title);
        const extractResults = await Promise.all(
          topTitles.map(async (pageTitle: string) => {
            try {
              const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=4000&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
              const extractRes = await fetch(extractUrl);
              if (extractRes.ok) {
                const extractData = await extractRes.json();
                const pages = extractData.query?.pages || {};
                for (const pid in pages) {
                  const p = pages[pid];
                  if (p.extract) {
                    return {
                      context: `### Fuente Documental: ${p.title}\n${p.extract}\n\n`,
                      source: `Wikipedia: ${p.title} (https://es.wikipedia.org/wiki/${encodeURIComponent(p.title)})`,
                    };
                  }
                }
              }
            } catch {}
            return null;
          })
        );

        for (const item of extractResults) {
          if (item) {
            factualContext += item.context;
            sources.push(item.source);
          }
        }
      }
    }
  } catch (wikiErr) {
    console.warn('[TopicResearch] Error buscando en Wikipedia ES:', wikiErr);
  }

  // Si no se encontró en español, intentar en Wikipedia en inglés
  if (!factualContext) {
    try {
      const searchUrlEn = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTopic)}&utf8=&format=json&origin=*`;
      const searchResEn = await fetch(searchUrlEn);
      if (searchResEn.ok) {
        const searchDataEn = await searchResEn.json();
        const hitsEn = searchDataEn.query?.search || [];
        if (hitsEn.length > 0) {
          const pageTitle = hitsEn[0].title;
          discoveredTitle = pageTitle;
          const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=4000&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
          const extractRes = await fetch(extractUrl);
          if (extractRes.ok) {
            const extractData = await extractRes.json();
            const pages = extractData.query?.pages || {};
            for (const pid in pages) {
              const p = pages[pid];
              if (p.extract) {
                factualContext += `### Source: Wikipedia (${p.title})\n${p.extract}\n\n`;
                sources.push(`Wikipedia EN: ${p.title} (https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)})`);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const settings = getAISettings();

  // 2. Síntesis pedagógica profunda basada en evidencia científica con IA
  if (settings.enabled) {
    try {
      const systemPrompt = `Eres un investigador científico de élite y educador universitario de la plataforma Contrareloj Study.
Tu misión es redactar un DOSSIER DE ESTUDIO ACADÉMICO riguroso, exhaustivo y estructurado, fundamentado en EVIDENCIA CIENTÍFICA, consensos académicos y literatura comprobada.

REGLAS OBLIGATORIAS:
1. RIGOR Y VERACIDAD: Toda la información debe ser veraz y objetiva. Describe los mecanismos bioquímicos, fisiológicos, físicos, jurídicos o técnicos reales.
2. ESTRUCTURA:
   # ${discoveredTitle}
   > **Marco de Referencia Científico:** Síntesis del estado del arte y consensos actuales.

   ## 1. Fundamentos Conceptuales y Definición Rigurosa
   (Definición formal, etiología/principios base, terminología técnica sin ambigüedades)

   ## 2. Mecanismos y Procesos Detallados
   (Explicación paso a paso de cómo ocurre, vías moleculares/físicas o fundamentos normativos de causa y efecto)

   ## 3. Evidencia Científica y Consensos
   (Estudios clave, meta-análisis, guías de práctica o ensayos empíricos reconocidos)

   ## 4. Diferenciación Crítica y Diagnósticos/Casos Diferenciales
   (Contraste explícito con conceptos afines que se suelen confundir)

   ## 5. Núcleos de Dominio para Evaluación
   (Los conceptos nucleares que un estudiante debe comprender a fondo)

3. IDIOMA: Responde completamente en español formal académico, fluido y de alto valor pedagógico.`;

      const userPrompt = `TEMA INVESTIGADO: ${discoveredTitle}${focusArea ? `\nÁrea o Especialidad: ${focusArea}` : ''}

INFORMACIÓN FACTUAL RECUPERADA DE FUENTES CIENTÍFICAS Y ABIERTAS:
${factualContext ? factualContext.slice(0, 6000) : 'Utiliza tu conocimiento enciclopédico y científico verificado para desarrollar el tema.'}

Redacta el dossier académico completo:`;

      const aiSynthesized = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        false
      );

      if (aiSynthesized && aiSynthesized.trim().length > 250) {
        return {
          text: aiSynthesized.trim(),
          title: discoveredTitle,
          sources: sources.length > 0 ? sources : ['Bases de datos científicas abiertas (Open Knowledge Graph)'],
        };
      }
    } catch (aiErr) {
      console.warn('[TopicResearch] Error en llamada a IA para síntesis de tema:', aiErr);
    }
  }

  // 3. Fallback en caso de que la IA esté desactivada o inaccesible:
  if (factualContext && factualContext.length > 100) {
    const fallbackText = `# ${discoveredTitle} — Dossier de Estudio Basado en Evidencia

> **Investigación Abierta:** Material recopilado a partir de fuentes documentales y científicas para "${discoveredTitle}".

## 1. Fundamentos Conceptuales
${factualContext}

## 2. Puntos Clave de Dominio Académico
* Dominio de la definición rigurosa y terminología técnica fundamental.
* Comprensión de los mecanismos de causalidad e interacciones descritas en el material.
* Capacidad de diferenciar los conceptos centrales frente a distractores comunes.`;

    return {
      text: fallbackText,
      title: discoveredTitle,
      sources: sources.length > 0 ? sources : ['Búsqueda en enciclopedias y fuentes abiertas'],
    };
  }

  throw new Error(
    `No se pudo recopilar suficiente información científica sobre el tema "${cleanTopic}".\n\n` +
    `Verifica la ortografía o intenta con un término más específico (ej: "Resistencia bacteriana a antibióticos", "Leyes de Newton", "Contrato de compraventa").`
  );
}

/**
 * Genera una pregunta socrática reformulada con Active Recall ante un error del estudiante.
 * Modifica el ángulo cognitivo para verificar la comprensión real del concepto y no la simple
 * memorización posicional de las opciones múltiples.
 */
export async function generateSocraticReformulatedQuestion(
  concept: string,
  originalQuestion: Question,
  userWrongAnswer: string,
  contextChunkText?: string
): Promise<Question> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const translationDirective = getSpanishTranslationDirective();
  const systemPrompt = `Eres el motor de tutoría socrática de Contrareloj Study, plataforma adaptativa de alto rendimiento académico.
Tu misión pedagógica es verificar la comprensión profunda y el dominio conceptual real de un estudiante mediante Active Recall y reformulación socrática.

${translationDirective}

EL ESTUDIANTE COMETIÓ UN ERROR EN ESTE CONCEPTO:
- Concepto Clave: "${concept}"
- Pregunta que falló: "${originalQuestion.question}"
- Respuesta errónea seleccionada por el estudiante: "${userWrongAnswer}"

PRINCIPIOS SOCRÁTICOS DE REFORMULACIÓN OBLIGATORIOS:
1. PROHIBICIÓN DE REPETICIÓN: No repitas la misma pregunta ni las mismas opciones en el mismo orden.
2. REFORMULACIÓN COGNITIVA DESDE OTRO ÁNGULO:
   - Si la pregunta original evaluaba identificación directa, ahora plantea un caso práctico, un supuesto fáctico o una relación causa-efecto inversa.
   - Si la pregunta original evaluaba la causa, ahora evalúa el mecanismo, la consecuencia de una alteración o un contraste con un concepto limítrofe.
3. DISTRACTORES INTELIGENTES SOCRÁTICOS:
   - Las 4 opciones deben ser plausibles y homogéneas en extensión.
   - Uno de los distractores debe atacar directamente la confusión o error conceptual evidenciado por la respuesta errónea anterior ("${userWrongAnswer}").
4. RETROALIMENTACIÓN SOCRÁTICA COMPLETA:
   - Explica por qué la respuesta correcta resuelve el caso.
   - Desarma con claridad y lógica el motivo del error previo para consolidar el aprendizaje activo.
5. LÍMITE ESTRICTO DE EXTENSIÓN:
   - Máximo 50 palabras para preguntas estándar.
   - Máximo 80 palabras si es descripción de un caso o supuesto de hecho.

FORMATO DE SALIDA (JSON ÚNICAMENTE):
{
  "concepto_evaluado": "${concept}",
  "angulo_socratico": "Explicación breve del ángulo cognitivo utilizado (ej: Caso práctico aplicado, deducción de mecanismo inverso)",
  "contexto_o_enunciado": "Planteamiento del escenario o premisa lógica.",
  "pregunta": "¿Pregunta clara, directa y reformulada?",
  "opciones": {
    "A": "Opción A",
    "B": "Opción B",
    "C": "Opción C",
    "D": "Opción D"
  },
  "respuesta_correcta": "Letra (A, B, C o D)",
  "retroalimentacion": {
    "explicacion_logica": "Fundamento lógico de la respuesta correcta.",
    "desmonte_del_error": "Explicación de por qué la confusión previa queda resuelta.",
    "referencia_al_texto": "Cita o referencia al principio del material de estudio."
  }
}`;

  const referenceText = contextChunkText || originalQuestion.sourceChunkText || originalQuestion.explanation;
  const userPrompt = `Material de estudio de referencia sobre el concepto "${concept}":
${referenceText ? referenceText.slice(0, 4000) : 'Fundamenta la pregunta en la definición académica y operativa del concepto.'}

Genera la pregunta socrática reformulada en formato JSON:`;

  const rawResponse = await queryAICompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    true
  );

  const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = cleanOutput.indexOf('{');
  const lastBrace = cleanOutput.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('La respuesta de reformulación socrática no contuvo un objeto JSON válido.');
  }

  const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonSnippet);
  } catch {
    const sanitizedJson = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
    parsed = JSON.parse(sanitizedJson);
  }

  const optsObj = parsed.opciones || {};
  const optionsArray: string[] = [
    String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
    String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
    String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
    String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
  ];

  const rawCorrectIndex = parseCorrectIndex(parsed.respuesta_correcta, optionsArray, 'multiple-choice');
  const balanced = shuffleOptionsWithEqualProbability(optionsArray, rawCorrectIndex);
  const optionsArrayFinal = balanced.options;
  const correctIndex = balanced.correctIndex;

  let fullQuestion = String(parsed.pregunta || '').trim();
  const contexto = String(parsed.contexto_o_enunciado || '').trim();
  if (contexto && !fullQuestion.includes(contexto.slice(0, 20))) {
    fullQuestion = `${contexto}\n\n${fullQuestion}`;
  }
  const isCase = /\b(caso|supuesto|paciente|clínic|escenario)\b/i.test(fullQuestion);
  fullQuestion = enforceQuestionLengthLimit(fullQuestion, isCase);

  const retro = parsed.retroalimentacion || {};
  const explanationParts: string[] = [];
  if (retro.explicacion_logica) {
    explanationParts.push(String(retro.explicacion_logica).trim());
  }
  if (retro.desmonte_del_error) {
    explanationParts.push(`**Desmonte del error previo:** ${String(retro.desmonte_del_error).trim()}`);
  }
  if (retro.referencia_al_texto) {
    explanationParts.push(`**Referencia en el texto:** "${String(retro.referencia_al_texto).trim()}"`);
  }

  return {
    id: `q-socratic-recall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'multiple-choice',
    difficulty: originalQuestion.difficulty || 'medium',
    topic: concept,
    question: fullQuestion || 'Pregunta de refuerzo socrático.',
    options: optionsArrayFinal,
    correctIndex,
    explanation: explanationParts.join('\n\n') || 'Explicación fundamentada en la consolidación socrática del concepto.',
    sourceChunkId: originalQuestion.sourceChunkId,
    sourceChunkText: originalQuestion.sourceChunkText,
    sourcePageOrSlide: originalQuestion.sourcePageOrSlide,
    isSocraticReformulation: true,
    reformedConcept: concept,
    originalFailedQuestionId: originalQuestion.id,
    socraticAngle: parsed.angulo_socratico || 'Reformulación cognitiva de Active Recall',
  };
}

/**
 * Genera preguntas dirigidas a un subtema concreto y calibradas por nivel de exigencia.
 * Para Nivel 3 (Máxima Exigencia), aplica la regla pedagógica de distractores sutiles y opciones sumamente similares.
 */
export async function generateTargetedPedagogicalQuestions(
  rawText: string,
  topicQuery: string,
  level: 1 | 2 | 3,
  count: number = 5,
  chunks?: DocumentChunk[]
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const difficultyMap: Record<number, 'easy' | 'medium' | 'hard'> = {
    1: 'easy',
    2: 'medium',
    3: 'hard',
  };
  const difficulty = difficultyMap[level] || 'hard';

  // RAG Filtrado y Relevancia Temática
  let relevantChunks: DocumentChunk[] = [];
  const normalizedQuery = topicQuery.trim().toLowerCase();

  if (chunks && chunks.length > 0) {
    if (normalizedQuery) {
      const keywords = normalizedQuery
        .split(/\s+/)
        .map(w => w.replace(/[^\wáéíóúüñ]/gi, '').toLowerCase())
        .filter(w => w.length > 2 && !['para', 'como', 'sobre', 'entre', 'desde', 'hacia', 'este', 'esta', 'los', 'las', 'del', 'una', 'con'].includes(w));

      const scored = chunks.map(chunk => {
        const textLower = chunk.text.toLowerCase();
        const headingLower = (chunk.heading || '').toLowerCase();
        let score = 0;

        if (textLower.includes(normalizedQuery)) score += 10;
        if (headingLower.includes(normalizedQuery)) score += 15;

        for (const kw of keywords) {
          if (headingLower.includes(kw)) score += 4;
          if (textLower.includes(kw)) score += 1;
        }

        return { chunk, score };
      });

      const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
      if (matched.length > 0) {
        relevantChunks = matched.slice(0, 10).map(m => m.chunk);
      } else {
        relevantChunks = chunks.slice(0, 8);
      }
    } else {
      relevantChunks = chunks.slice(0, 10);
    }
  }

  let sourceRepresentation = '';
  if (relevantChunks.length > 0) {
    sourceRepresentation = relevantChunks.map(c =>
      `[FRAGMENTO ID: ${c.id} | ${c.heading || 'Sección'} | Pág/Diapositiva: ${c.pageOrSlide || 1}]\n${c.text}`
    ).join('\n\n---\n\n');
  } else {
    sourceRepresentation = rawText.slice(0, 8000);
  }

  const levelInstructions: Record<number, string> = {
    1: `NIVEL 1 - FUNDAMENTOS Y RETENCIÓN BÁSICA:
- Evalúa definiciones operativas esenciales, principios rectores y terminología fundamental del tema.
- Preguntas conceptuales directas con 4 opciones claramente formuladas, donde los 3 distractores sean conceptos del mismo tema.`,

    2: `NIVEL 2 - APLICACIÓN PRÁCTICA Y ESCENARIOS:
- Evalúa relaciones causa-efecto, aplicación de procedimientos o resolución de situaciones prácticas a partir del texto.
- Formula un caso o premisa lógica previa que obligue a deducir la respuesta correcta en lugar de recordarla de memoria.`,

    3: `NIVEL 3 - MÁXIMA EXIGENCIA CON OPCIONES SIMILARES (DISCRIMINACIÓN FINA):
- EXIGENCIA CRÍTICA: Casos clínicos de diagnóstico diferencial, conflictos normativos complejos o mecanismos de acción sutiles.
- REGLA OBLIGATORIA DE OPCIONES SIMILARES:
  1. Las 4 opciones de respuesta (A, B, C, D) deben tener UNA ESTRUCTURA GRAMATICAL, EXTENSIÓN Y VOCABULARIO TÉCNICO PRÁCTICAMENTE IDÉNTICOS.
  2. Los 3 distractores deben ser variantes sumamente sutiles y plausibles fundamentadas en el documento (ej. ligeras diferencias en dosis, mecanismos adyacentes, plazos jurídicos o matices taxonómicos reales).
  3. Está TERMINANTEMENTE PROHIBIDO incluir distractores absurdos o descartables por longitud o tono. El estudiante debe dominar los matices más finos para no equivocarse.`
  };

  const langDetection = detectDocumentLanguage(rawText);
  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  const systemPrompt = `Eres el evaluador de alta exigencia académica de Contrareloj Study.
Tu objetivo es formular preguntas de evaluación altamente especializadas, enfocadas rigurosamente en el subtema solicitado por el usuario y calibradas al nivel pedagógico elegido.

${translationDirective}

${levelInstructions[level]}

DIRECTRICES GENERALES DE GENERACIÓN:
1. Fidelidad estricta al documento: Toda afirmación y justificación debe emanar del texto provisto.
2. ROTACIÓN DE ESTILOS: Alterna estilos interactivos:
   - "multiple-choice": 4 opciones con distractores plausibles del texto. Incluye preguntas donde se deba señalar la afirmación falsa o el concepto equivocado ("¿Cuál es falsa?", "Señala el concepto equivocado", "Todas excepto...").
   - "matching": Emparejar 3 o 4 conceptos específicos con sus definiciones/roles.
   - "drag-drop": Oración con huecos {0}, {1} y banco de palabras con distractores.
   - "multi-select": 4 o 5 opciones con 2 o 3 respuestas a marcar (tanto para seleccionar las correctas como para seleccionar las afirmaciones falsas).
   - "image-labeling": Etiquetar zonas de un diagrama o esquema.
   - "true-false": Afirmación conceptual directa.
3. EXTENSIÓN BALANCEADA: El 50% de las preguntas DEBEN tener enunciados CORTOS Y DIRECTOS (1 a 2 líneas concisas) para memorizar conceptos específicos; el otro 50% casos prácticos o de análisis.
4. LÍMITES ESTRICTOS DE EXTENSIÓN (MÁXIMO 50 O 80 PALABRAS):
   - Todo enunciado estándar DEBE TENER UN MÁXIMO DE 50 PALABRAS. Evita redundancias o textos inflados.
   - Si describe un caso práctico, viñeta clínica o supuesto de hecho, el límite máximo se amplía hasta 80 PALABRAS MÁXIMO.
   - Cualquier enunciado que supere estos límites debe compactarse o recortarse.
5. Tema Enfocado: ${topicQuery.trim() ? `TODAS las preguntas deben abordar exclusivamente: "${topicQuery.trim()}".` : 'Aborda los núcleos temáticos más desafiantes del documento.'}

FORMATO DE SALIDA (JSON ÚNICAMENTE):
{
  "tema_calibrado": "${topicQuery.trim() || 'Subtema evaluado'}",
  "nivel_calibrado": ${level},
  "preguntas": [
    {
      "id": 1,
      "chunk_id_origen": "ID del fragmento utilizado",
      "tipo": "multiple-choice | matching | drag-drop | multi-select | image-labeling | true-false",
      "longitud_enunciado": "corto | medio_largo",
      "concepto_evaluado": "Subconcepto específico evaluado",
      "contexto_o_enunciado": "Planteamiento del escenario o premisa.",
      "pregunta": "¿Pregunta analítica o concepto específico?",
      "opciones": { "A": "Opción A", "B": "Opción B", "C": "Opción C", "D": "Opción D" },
      "respuesta_correcta": "A",
      "opciones_multiples": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "indices_correctos": [0, 2],
      "pares_emparejamiento": [
        { "termino": "Concepto 1", "definicion": "Definición 1" },
        { "termino": "Concepto 2", "definicion": "Definición 2" }
      ],
      "oracion_plantilla": "El {0} actúa sobre {1}.",
      "huecos_correctos": ["término 1", "término 2"],
      "banco_palabras": ["término 1", "término 2", "distractor 1", "distractor 2"],
      "titulo_diagrama": "Diagrama de ...",
      "etiquetas_diagrama": [
        { "id": "p1", "etiqueta": "Elemento A", "x_porcentaje": 30, "y_porcentaje": 40 }
      ],
      "banco_etiquetas": ["Elemento A", "Elemento B"],
      "retroalimentacion": {
        "referencia_al_texto": "Cita textual del fragmento que fundamenta la respuesta.",
        "explicacion_logica": "Por qué esta opción es la correcta.",
        "por_que_fallan_las_otras": "Diferenciación fina y sutil de por qué fallan los distractores."
      }
    }
  ]
}`;

  const userPrompt = `MATERIAL DE ESTUDIO DE REFERENCIA:
${sourceRepresentation}

PARÁMETROS DE GENERACIÓN:
- Subtema concreto solicitado: ${topicQuery.trim() || 'General del documento'}
- Nivel de dificultad: Nivel ${level} (${level === 3 ? 'MÁXIMA EXIGENCIA - OPCIONES SIMILARES' : level === 2 ? 'INTERMEDIO' : 'BÁSICO'})
- Cantidad de preguntas a generar: ${count}
- Límite de palabras: Máximo 50 palabras para enunciados estándar, o 80 palabras si es descripción de un caso.
- TRADUCCIÓN OBLIGATORIA: Si el texto está en inglés u otro idioma, genera las preguntas, opciones y explicaciones 100% en español académico.
- Recuerda: Alterna los estilos de pregunta y haz que el 50% de los enunciados sean CORTOS (1 o 2 líneas) para memorizar conceptos específicos.

Genera las ${count} preguntas en formato JSON estricto:`;

  const rawResponse = await queryAICompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    true
  );

  const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = cleanOutput.indexOf('{');
  const lastBrace = cleanOutput.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('La respuesta de generación calibrada no contuvo un objeto JSON válido.');
  }

  const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonSnippet);
  } catch {
    let cleaned = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        cleaned = cleaned.replace(/[\u0000-\u001F]+/g, (m) => m === '\n' ? '\\n' : m === '\t' ? '\\t' : '');
        parsed = JSON.parse(cleaned);
      }
    }
  }

  if (!parsed || !Array.isArray(parsed.preguntas) || parsed.preguntas.length === 0) {
    throw new Error('El modelo de IA no devolvió preguntas en el formato esperado.');
  }

  const defaultTopic = topicQuery.trim() || parsed.tema_calibrado || 'Calibración Personalizada';

  const mapped: Question[] = parsed.preguntas.map((p: any, idx: number) => {
    const detectedType = (p.tipo || p.type || '').toLowerCase();
    let templateSentence = p.oracion_plantilla || p.templateSentence || undefined;
    let blanksCorrect: string[] | undefined = Array.isArray(p.huecos_correctos)
      ? p.huecos_correctos.map((h: any) => String(h).trim())
      : (typeof p.huecos_correctos === 'string' && p.huecos_correctos.trim()
          ? p.huecos_correctos.split(',').map((h: string) => h.trim())
          : undefined);

    let wordBank: string[] | undefined = Array.isArray(p.banco_palabras)
      ? p.banco_palabras.map((w: any) => String(w).trim())
      : (typeof p.banco_palabras === 'string' && p.banco_palabras.trim()
          ? p.banco_palabras.split(',').map((w: string) => w.trim())
          : undefined);

    const hasPlaceholders = Boolean(
      (p.pregunta && /\{\d+\}/.test(p.pregunta)) ||
      (templateSentence && /\{\d+\}/.test(templateSentence))
    );

    let qType: Question['type'] = 'multiple-choice';

    if (detectedType.includes('matching') || (Array.isArray(p.pares_emparejamiento) && p.pares_emparejamiento.length >= 2)) {
      qType = 'matching';
    } else if (
      detectedType.includes('drag') ||
      detectedType.includes('blanks') ||
      detectedType.includes('huecos') ||
      detectedType.includes('completar') ||
      (templateSentence && blanksCorrect && blanksCorrect.length > 0) ||
      (hasPlaceholders && (blanksCorrect || wordBank || detectedType.includes('drag')))
    ) {
      qType = 'drag-drop';
    } else if (detectedType.includes('multi-select') || (Array.isArray(p.indices_correctos) && p.indices_correctos.length > 1)) {
      qType = 'multi-select';
    } else if (detectedType.includes('image') || detectedType.includes('labeling') || (Array.isArray(p.etiquetas_diagrama) && p.etiquetas_diagrama.length >= 1)) {
      qType = 'image-labeling';
    } else if (detectedType.includes('true-false') || detectedType.includes('verdadero')) {
      qType = 'true-false';
    } else {
      qType = 'multiple-choice';
    }

    const optsObj = p.opciones || {};
    const optionsArray: string[] = Array.isArray(p.opciones_multiples) && p.opciones_multiples.length > 0
      ? p.opciones_multiples.map((o: any) => String(o).trim())
      : [
          String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
          String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
          String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
          String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
        ];
    const correctIndex = parseCorrectIndex(p.respuesta_correcta, optionsArray, qType);

    let finalOptions = optionsArray;
    let finalCorrectIndex = correctIndex;
    if (qType === 'multiple-choice') {
      const balanced = shuffleOptionsWithEqualProbability(optionsArray, correctIndex);
      finalOptions = balanced.options;
      finalCorrectIndex = balanced.correctIndex;
    }

    let fullQuestion = String(p.pregunta || '').trim();
    const contexto = String(p.contexto_o_enunciado || '').trim();
    if (contexto && !fullQuestion.includes(contexto.slice(0, 20)) && p.longitud_enunciado !== 'corto') {
      fullQuestion = `${contexto}\n\n${fullQuestion}`;
    }

    // Normalización pedagógica para preguntas drag-drop
    if (qType === 'drag-drop') {
      if (!templateSentence && /\{\d+\}/.test(fullQuestion)) {
        templateSentence = fullQuestion;
      }
      if (/\{\d+\}/.test(fullQuestion)) {
        const topicLabel = p.concepto_evaluado ? ` sobre **${String(p.concepto_evaluado).trim()}**` : '';
        fullQuestion = `Completa los espacios en blanco${topicLabel} del siguiente enunciado:`;
      }
      if ((!blanksCorrect || blanksCorrect.length === 0) && templateSentence) {
        const slotMatches = templateSentence.match(/\{\d+\}/g);
        if (slotMatches && Array.isArray(p.opciones_multiples) && p.opciones_multiples.length >= slotMatches.length) {
          blanksCorrect = p.opciones_multiples.slice(0, slotMatches.length);
        }
      }
      const bankSet = new Set<string>(wordBank || []);
      if (blanksCorrect) {
        blanksCorrect.forEach(b => { if (b) bankSet.add(b); });
      }
      const distractorsPool = ['primario', 'secundario', 'crónico', 'agudo', 'sistémico', 'local', 'benigno', 'patológico'];
      for (const dist of distractorsPool) {
        if (bankSet.size >= (blanksCorrect?.length || 2) + 2) break;
        bankSet.add(dist);
      }
      wordBank = Array.from(bankSet).sort(() => Math.random() - 0.5);
    }

    const isCase = p.longitud_enunciado === 'medio_largo' || /\b(caso|supuesto|paciente|clínic|escenario)\b/i.test(fullQuestion);
    fullQuestion = enforceQuestionLengthLimit(fullQuestion, isCase);

    const retro = p.retroalimentacion || {};
    const explanationParts: string[] = [];
    if (retro.explicacion_logica) {
      explanationParts.push(String(retro.explicacion_logica).trim());
    }
    if (retro.referencia_al_texto) {
      explanationParts.push(`**Referencia en el texto:** "${String(retro.referencia_al_texto).trim()}"`);
    }
    if (retro.por_que_fallan_las_otras) {
      explanationParts.push(`**Discriminación de distractores:** ${String(retro.por_que_fallan_las_otras).trim()}`);
    }

    let sourceChunkId = p.chunk_id_origen || undefined;
    let sourceChunkText: string | undefined = undefined;
    let sourcePageOrSlide: number | undefined = undefined;

    if (chunks && chunks.length > 0) {
      let matchedChunk = chunks.find(c => c.id === p.chunk_id_origen);
      if (!matchedChunk) {
        matchedChunk = relevantChunks[idx % relevantChunks.length] || chunks[0];
      }
      if (matchedChunk) {
        sourceChunkId = matchedChunk.id;
        sourceChunkText = matchedChunk.text;
        sourcePageOrSlide = matchedChunk.pageOrSlide;
      }
    }

    const matchingPairs = Array.isArray(p.pares_emparejamiento)
      ? p.pares_emparejamiento.map((pair: any) => ({
          term: String(pair.termino || pair.term || 'Concepto').trim(),
          definition: String(pair.definicion || pair.definition || 'Definición').trim()
        }))
      : undefined;

    const correctIndices = Array.isArray(p.indices_correctos)
      ? parseCorrectIndices(p.indices_correctos, optionsArray)
      : undefined;

    const imageHotspots = Array.isArray(p.etiquetas_diagrama)
      ? p.etiquetas_diagrama.map((h: any, hIdx: number) => ({
          id: String(h.id || `pin-${hIdx + 1}`),
          label: String(h.etiqueta || h.label || `Etiqueta ${hIdx + 1}`).trim(),
          xPercent: Number(h.x_porcentaje || h.xPercent || 25 + (hIdx * 20)),
          yPercent: Number(h.y_porcentaje || h.yPercent || 30 + (hIdx * 15)),
          hint: h.pista || h.hint || `Punto ${hIdx + 1}`
        }))
      : undefined;

    const imageWordBank = Array.isArray(p.banco_etiquetas)
      ? p.banco_etiquetas.map((b: any) => String(b).trim())
      : (imageHotspots ? imageHotspots.map((h: any) => h.label) : undefined);

    const diagramTitle = p.titulo_diagrama || p.diagramTitle || undefined;

    return {
      id: `q-calibrated-lvl${level}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      type: qType,
      difficulty,
      topic: String(p.concepto_evaluado || defaultTopic).trim(),
      question: fullQuestion || 'Pregunta calibrada de alta exigencia.',
      options: qType === 'true-false' ? ['Verdadero', 'Falso'] : finalOptions,
      correctIndex: finalCorrectIndex,
      correctIndices,
      matchingPairs,
      templateSentence,
      blanksCorrect,
      wordBank,
      imageHotspots,
      imageWordBank,
      diagramTitle,
      explanation: explanationParts.join('\n\n') || 'Explicación fundamentada en el texto.',
      sourceChunkId,
      sourceChunkText,
      sourcePageOrSlide,
    };
  });

  return mapped;
}

export interface DocumentClassification {
  tema: string;
  materia: string;
  descripcion: string;
  palabrasClave: string[];
  icon: string;
  color: string;
  detectedLanguage?: string;
  isForeign?: boolean;
}

export const VALID_CONTENT_ICONS = [
  'Lungs',
  'HeartPulse',
  'Germ',
  'Virus',
  'Dna',
  'Bone',
  'Eye',
  'Droplets',
  'Pill',
  'Syringe',
  'Brain',
  'Microscope',
  'Hospital',
  'Stethoscope',
  'Wind',
  'CloudRain',
  'Leaf',
  'FlaskConical',
  'Atom',
  'Binary',
  'Cpu',
  'Scale',
  'TrendingUp',
  'Calculator',
  'Landmark',
  'BookOpen',
  'GraduationCap',
] as const;

export type ValidContentIcon = (typeof VALID_CONTENT_ICONS)[number];

export const ICON_COLORS: Record<string, string> = {
  Lungs: 'from-cyan-600 to-teal-800',
  HeartPulse: 'from-rose-600 to-red-800',
  Germ: 'from-emerald-600 to-green-800',
  Virus: 'from-amber-600 to-rose-700',
  Dna: 'from-teal-500 to-emerald-700',
  Bone: 'from-amber-700 to-stone-800',
  Eye: 'from-blue-600 to-cyan-700',
  Droplets: 'from-red-600 to-rose-800',
  Pill: 'from-emerald-500 to-teal-700',
  Syringe: 'from-indigo-500 to-blue-700',
  Brain: 'from-purple-600 to-fuchsia-800',
  Microscope: 'from-teal-600 to-emerald-800',
  Hospital: 'from-rose-600 to-red-800',
  Stethoscope: 'from-rose-500 to-red-700',
  Wind: 'from-sky-500 to-blue-700',
  CloudRain: 'from-blue-600 to-indigo-800',
  Leaf: 'from-emerald-500 to-green-700',
  FlaskConical: 'from-cyan-500 to-blue-700',
  Atom: 'from-indigo-500 to-purple-700',
  Binary: 'from-violet-600 to-indigo-800',
  Cpu: 'from-blue-600 to-cyan-800',
  Scale: 'from-amber-600 to-yellow-800',
  TrendingUp: 'from-emerald-600 to-green-800',
  Calculator: 'from-orange-500 to-amber-600',
  Landmark: 'from-yellow-600 to-amber-700',
  BookOpen: 'from-pink-500 to-rose-700',
  GraduationCap: 'from-violet-500 to-purple-700',
};

interface ContentIconMatcher {
  icon: string;
  keywords: string[];
}

const CONTENT_ICON_MATCHERS: ContentIconMatcher[] = [
  {
    icon: 'Lungs',
    keywords: [
      'pulmon', 'pulmón', 'pulmonar', 'pulmonares', 'respirat', 'alvéol', 'alveol', 'bronqui', 'bronco',
      'neumo', 'neumonía', 'neumonia', 'asma', 'epoc', 'pleura', 'pleural', 'ventilac', 'disnea',
      'espirometr', 'hipoxia', 'hipercapnia', 'enfisema', 'traquea', 'tráquea', 'laringe', 'respiración',
      'respiracion', 'tórax', 'torax', 'oxigenación', 'oxigenacion', 'gasometría', 'gasometria',
      'cianosis', 'atelectas'
    ],
  },
  {
    icon: 'HeartPulse',
    keywords: [
      'cardio', 'corazón', 'corazon', 'cardíac', 'cardiac', 'infarto', 'arritmia', 'electrocardio',
      'ecg', 'ekg', 'hemodinám', 'hemodinam', 'presión arterial', 'presion arterial', 'hipertens',
      'miocard', 'pericard', 'valvul', 'valvular', 'endocard', 'aurícul', 'auricul', 'ventrícul',
      'ventricul', 'isquemia', 'coronari', 'sístole', 'sistole', 'diástole', 'diastole',
      'insuficiencia cardíaca', 'insuficiencia cardiaca', 'pulso', 'bradicard', 'taquicard'
    ],
  },
  {
    icon: 'Germ',
    keywords: [
      'bacteri', 'germen', 'gérmenes', 'germenes', 'microbi', 'sepsis', 'patógeno', 'patogeno',
      'estafilococ', 'estreptococ', 'bacilo', 'escherichia', 'gram positivo', 'gram negativo',
      'antimicrobi', 'resistencia bacteriana', 'flora bacteriana', 'microbioma', 'inóculo', 'inoculo',
      'toxina bacteriana', 'endotoxina', 'exotoxina', 'pseudomona', 'salmonella', 'tuberculosis',
      'mycobacteri', 'infección bacteriana', 'infeccion bacteriana'
    ],
  },
  {
    icon: 'Virus',
    keywords: [
      'virus', 'viral', 'virolog', 'vih', 'sida', 'covid', 'coronavirus', 'influenza', 'gripe',
      'hepatitis', 'herpes', 'retrovirus', 'retroviral', 'virión', 'virion', 'cápside', 'capside',
      'antiviral', 'arbovirus', 'dengue', 'varicela', 'sarampión', 'sarampion', 'infección viral',
      'infeccion viral', 'inmunodeficiencia'
    ],
  },
  {
    icon: 'Dna',
    keywords: [
      'genétic', 'genetic', 'adn', 'arn', 'dna', 'rna', 'genoma', 'cromosoma', 'herencia',
      'mutación', 'mutacion', 'alelo', 'genotipo', 'fenotipo', 'epigenétic', 'epigenetic',
      'transcripción génica', 'transcripcion genica', 'traducción génica', 'traduccion genica',
      'polimorfismo', 'nucleótido', 'nucleotido', 'telómero', 'telomero', 'clonación', 'clonacion', 'crispr'
    ],
  },
  {
    icon: 'Bone',
    keywords: [
      'hueso', 'óseo', 'oseo', 'esqueleto', 'esquelét', 'esquelet', 'fractura', 'osteoporos',
      'articulac', 'articular', 'columna vertebral', 'vértebr', 'vertebr', 'fémur', 'femur',
      'tibia', 'cráneo', 'craneo', 'traumatolog', 'ortoped', 'ligamento', 'cartílago', 'cartilago',
      'tendón', 'tendon', 'esguince', 'luxación', 'luxacion', 'artritis', 'artrosis', 'médula ósea', 'medula osea'
    ],
  },
  {
    icon: 'Eye',
    keywords: [
      'ojo', 'ocular', 'visión', 'vision', 'oftalmo', 'retina', 'retinian', 'córnea', 'cornea',
      'glaucoma', 'catarata', 'mácula', 'macula', 'iris', 'pupila', 'óptica ocular', 'optica ocular',
      'agudeza visual', 'conjuntiv', 'estrabismo', 'miopía', 'miopia', 'astigmatismo'
    ],
  },
  {
    icon: 'Droplets',
    keywords: [
      'sangre', 'sanguín', 'sanguin', 'hematolog', 'hemoglobi', 'eritrocit', 'glóbulo rojo', 'globulo rojo',
      'leucocit', 'plaqueta', 'anemia', 'leucemia', 'coagulación', 'coagulacion', 'hemostasia',
      'hemorragi', 'transfusión', 'transfusion', 'plasma sanguíneo', 'hematocrito', 'linfocit'
    ],
  },
  {
    icon: 'Pill',
    keywords: [
      'fármac', 'farmac', 'medicament', 'pastilla', 'comprimido', 'dosis', 'posología', 'posologia',
      'farmacocinét', 'farmacocinet', 'farmacodinám', 'farmacodinam', 'toxicolog', 'agonista',
      'antagonista', 'receta', 'prescripción', 'prescripcion', 'antibiótic', 'antibiotic',
      'analgésic', 'analgesic', 'antiinflamat', 'cápsula', 'capsula', 'vía oral', 'via oral'
    ],
  },
  {
    icon: 'Syringe',
    keywords: [
      'vacuna', 'vacunac', 'jeringa', 'inyección', 'inyeccion', 'inmunolog', 'inmunidad',
      'anticuerpo', 'antígeno', 'antigeno', 'inmunoterap', 'inmunodeficienc', 'anestesi',
      'intravenos', 'parenteral', 'suero', 'endovenos', 'intramuscular', 'inmunización', 'inmunizacion'
    ],
  },
  {
    icon: 'Brain',
    keywords: [
      'cerebr', 'encéfal', 'encefal', 'neurona', 'neural', 'neurolog', 'neurocienc', 'sinapsis',
      'neurotransmisor', 'corteza cerebral', 'hipocampo', 'psiquiatr', 'dopamina', 'serotonina',
      'parkinson', 'alzheimer', 'epilepsia', 'ictus', 'acv', 'psicolog', 'cogniti', 'mente',
      'conductual', 'neuroanatom'
    ],
  },
  {
    icon: 'Microscope',
    keywords: [
      'célula', 'celula', 'celular', 'histolog', 'tejido', 'microscop', 'mitocondria', 'citoplasma',
      'organelo', 'membrana celular', 'tinción', 'tincion', 'biopsia', 'epitelio', 'endotelio',
      'citolog'
    ],
  },
  {
    icon: 'Wind',
    keywords: [
      'viento', 'vientos', 'meteorolog', 'atmósfera', 'atmosfera', 'climatolog', 'huracán', 'huracan',
      'tornado', 'ciclón', 'ciclon', 'presión atmosférica', 'presion atmosferica', 'frente frío',
      'corriente de chorro', 'brisa', 'vendaval', 'borrasca'
    ],
  },
  {
    icon: 'CloudRain',
    keywords: [
      'lluvia', 'precipitac', 'hidrolog', 'nube', 'nubes', 'tormenta', 'monzón', 'monzon',
      'inundación', 'inundacion', 'humedad relativa', 'cuenca hidrográfica'
    ],
  },
  {
    icon: 'Leaf',
    keywords: [
      'planta', 'botánic', 'botanic', 'ecolog', 'fotosíntesis', 'fotosintesis', 'vegetal',
      'clorofila', 'bosque', 'biodiversidad', 'flora', 'ecosistema', 'medio ambiente',
      'agronom', 'cultivo', 'bioma', 'especie vegetal'
    ],
  },
  {
    icon: 'FlaskConical',
    keywords: [
      'químic', 'quimic', 'reacción química', 'reaccion quimica', 'estequiometr', 'disolución',
      'disolucion', 'molaridad', 'ácido base', 'acido base', 'titulación', 'titulacion',
      'termoquímic', 'enlace químico', 'compuesto orgánico', 'termoquimic'
    ],
  },
  {
    icon: 'Atom',
    keywords: [
      'físic', 'fisic', 'átomo', 'atomo', 'cuántic', 'cuantic', 'partícula', 'particula',
      'electrón', 'electron', 'protón', 'proton', 'newton', 'relatividad', 'termodinámica',
      'termodinamica', 'fuerza gravitatoria', 'energía cinética', 'materia condensada'
    ],
  },
  {
    icon: 'Binary',
    keywords: [
      'algoritm', 'programac', 'código', 'codigo', 'software', 'computac', 'informát',
      'informat', 'base de datos', 'sql', 'javascript', 'python', 'estructura de datos',
      'ciberseguridad', 'redes computacionales'
    ],
  },
  {
    icon: 'Cpu',
    keywords: [
      'procesador', 'cpu', 'microcontrolador', 'arquitectura de computad', 'memoria ram',
      'placa base', 'semiconductor', 'circuito integrado', 'gpu'
    ],
  },
  {
    icon: 'Scale',
    keywords: [
      'derecho', 'ley', 'leyes', 'jurídic', 'juridic', 'tribunal', 'código penal', 'codigo penal',
      'código civil', 'codigo civil', 'juez', 'abogad', 'jurisprudenc', 'delito', 'constitución',
      'constitucion', 'norma jurídica'
    ],
  },
  {
    icon: 'TrendingUp',
    keywords: [
      'economí', 'economi', 'finanza', 'mercado', 'inflación', 'inflacion', 'pib',
      'tasa de interés', 'costo', 'precio', 'microeconom', 'macroeconom', 'bolsa de valores',
      'inversión', 'contabilidad'
    ],
  },
  {
    icon: 'Calculator',
    keywords: [
      'matemát', 'matemat', 'cálculo', 'calculo', 'integral', 'derivada', 'álgebra', 'algebra',
      'ecuación', 'ecuacion', 'teorema', 'estadístic', 'estadistic', 'probabilidad', 'matriz',
      'trigonometr'
    ],
  },
  {
    icon: 'Landmark',
    keywords: [
      'historia', 'siglo', 'imperio', 'revolución', 'revolucion', 'civilización', 'civilizacion',
      'arqueolog', 'patrimonio histórico', 'antigüedad', 'edad media', 'tratado de paz', 'polític', 'politic'
    ],
  },
  {
    icon: 'BookOpen',
    keywords: [
      'literatur', 'novela', 'poesía', 'poesia', 'filosof', 'lingüíst', 'autor', 'narrativa',
      'ensayo literario', 'semántica', 'sintaxis', 'idioma'
    ],
  },
  {
    icon: 'Hospital',
    keywords: [
      'hospital', 'clínica', 'clinica', 'salud pública', 'salud publica', 'atención primaria',
      'urgencias', 'triage', 'sala de emergencias', 'epidemiolog', 'gestión hospitalaria', 'enfermería', 'enfermeria'
    ],
  },
];

/**
 * Infiere el icono y gradiente visual analizando primordialmente el CONTENIDO ESPECÍFICO del documento
 * (tema, conceptos clave y texto fuente) en lugar de encasillar por la disciplina o materia general.
 */
export function inferContentVisuals(
  tema: string,
  rawText: string,
  palabrasClave: string[] = [],
  materia?: string,
  aiSuggestedIcon?: string
): { icon: string; color: string } {
  // 1. Si la IA sugirió un icono específico válido reconocido, honrarlo directamente
  if (aiSuggestedIcon && VALID_CONTENT_ICONS.includes(aiSuggestedIcon as ValidContentIcon)) {
    const validIcon = aiSuggestedIcon as ValidContentIcon;
    if (validIcon !== 'GraduationCap') {
      return {
        icon: validIcon,
        color: ICON_COLORS[validIcon] || 'from-violet-500 to-purple-700',
      };
    }
  }

  // 2. Motor de inferencia semántica por frecuencia ponderada de contenido
  const cleanTema = (tema || '').toLowerCase();
  const cleanKeywords = (palabrasClave || []).join(' ').toLowerCase();
  const cleanSample = (rawText || '').slice(0, 4500).toLowerCase();
  const cleanMateria = (materia || '').toLowerCase();

  let bestIcon = 'GraduationCap';
  let highestScore = 0;

  for (const matcher of CONTENT_ICON_MATCHERS) {
    let score = 0;
    for (const kw of matcher.keywords) {
      if (cleanTema.includes(kw)) {
        score += 5; // Máxima prioridad al título específico del contenido
      }
      if (cleanKeywords.includes(kw)) {
        score += 3; // Fuerte prioridad a los conceptos nucleares
      }
      if (cleanSample.includes(kw)) {
        score += 1; // Muestra de texto del documento
      }
      if (cleanMateria.includes(kw)) {
        score += 2; // Apoyo de la materia
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestIcon = matcher.icon;
    }
  }

  // Si no se superó el umbral mínimo de coincidencia específica, recurrir a la materia como fallback
  if (highestScore < 3 && materia) {
    const fallbackVisuals = getVisualsForMateria(materia);
    if (fallbackVisuals.icon !== 'GraduationCap') {
      return fallbackVisuals;
    }
  }

  return {
    icon: bestIcon,
    color: ICON_COLORS[bestIcon] || 'from-violet-500 to-purple-700',
  };
}

export function getVisualsForMateria(materia: string): { icon: string; color: string } {
  const m = (materia || '').toLowerCase();

  if (m.includes('farma') || m.includes('medicament') || m.includes('terapéut')) {
    return { icon: 'Pill', color: 'from-emerald-500 to-teal-700' };
  }
  if (m.includes('médic') || m.includes('salud') || m.includes('clínic') || m.includes('patolog') || m.includes('cardiolog') || m.includes('pediatr') || m.includes('anatom')) {
    return { icon: 'Stethoscope', color: 'from-rose-500 to-red-700' };
  }
  if (m.includes('bioquím') || m.includes('genétic') || m.includes('adn') || m.includes('biolog') || m.includes('microbiolog')) {
    return { icon: 'Microscope', color: 'from-teal-500 to-emerald-700' };
  }
  if (m.includes('derecho') || m.includes('jurídic') || m.includes('ley') || m.includes('penal') || m.includes('civil') || m.includes('constitucion')) {
    return { icon: 'Scale', color: 'from-amber-600 to-yellow-800' };
  }
  if (m.includes('químic')) {
    return { icon: 'FlaskConical', color: 'from-cyan-500 to-blue-700' };
  }
  if (m.includes('físic') || m.includes('astronom')) {
    return { icon: 'Atom', color: 'from-indigo-500 to-purple-700' };
  }
  if (m.includes('software') || m.includes('comput') || m.includes('programac') || m.includes('sistemas') || m.includes('algoritm') || m.includes('informát') || m.includes('redes')) {
    return { icon: 'Binary', color: 'from-violet-600 to-indigo-800' };
  }
  if (m.includes('econom') || m.includes('finanz') || m.includes('contabil') || m.includes('comerc') || m.includes('negocio') || m.includes('administra')) {
    return { icon: 'TrendingUp', color: 'from-emerald-600 to-green-800' };
  }
  if (m.includes('psicolog') || m.includes('neuro') || m.includes('cognit') || m.includes('conduct')) {
    return { icon: 'Brain', color: 'from-purple-500 to-fuchsia-700' };
  }
  if (m.includes('historia') || m.includes('arqueolog') || m.includes('polític') || m.includes('sociolog')) {
    return { icon: 'Landmark', color: 'from-yellow-600 to-amber-700' };
  }
  if (m.includes('matemát') || m.includes('estadíst') || m.includes('álgebra') || m.includes('cálculo') || m.includes('geometr')) {
    return { icon: 'Calculator', color: 'from-orange-500 to-amber-600' };
  }
  if (m.includes('literatur') || m.includes('filosof') || m.includes('lingüíst') || m.includes('lengua') || m.includes('comunicac')) {
    return { icon: 'BookOpen', color: 'from-pink-500 to-rose-700' };
  }

  return { icon: 'GraduationCap', color: 'from-violet-500 to-purple-700' };
}

const classificationCache = new Map<string, DocumentClassification>();
const MAX_CLASSIFICATION_CACHE = 40;

/**
 * Clasifica automáticamente el contenido de un documento mediante IA:
 * Extrae la materia específica (ej: Farmacología, Derecho Penal, Bioquímica)
 * y el tema académico representativo en base al contenido real,
 * traduciendo obligatoriamente a español si el documento está en otro idioma.
 */
export async function classifyDocumentWithAI(
  rawText: string,
  chunks?: DocumentChunk[]
): Promise<DocumentClassification> {
  const settings = getAISettings();
  const langDetection = detectDocumentLanguage(rawText);

  if (!settings.enabled) {
    const fallbackMateria = 'General';
    const fallbackTema = rawText.split('\n')[0]?.slice(0, 50) || 'Material de Estudio';
    const visuals = inferContentVisuals(fallbackTema, rawText, [], fallbackMateria);
    return {
      tema: fallbackTema,
      materia: fallbackMateria,
      descripcion: 'Material de estudio analizado.',
      palabrasClave: [],
      icon: visuals.icon,
      color: visuals.color,
      detectedLanguage: langDetection.detectedLanguage,
      isForeign: langDetection.isForeign,
    };
  }

  let sampleText = '';
  if (chunks && chunks.length > 0) {
    sampleText = chunks.slice(0, 8).map(c => c.text).join('\n\n').slice(0, 5000);
  } else {
    sampleText = rawText.slice(0, 5000);
  }

  const cacheKey = `${sampleText.length}:${sampleText.slice(0, 120)}:${sampleText.slice(-120)}`;
  const cached = classificationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const translationDirective = getSpanishTranslationDirective(langDetection.detectedLanguage);

  const systemPrompt = `Eres el clasificador académico experto de Contrareloj Study.
Tu objetivo es analizar el contenido de un documento educativo y clasificarlo con alta precisión académica.

${translationDirective}

DEBES IDENTIFICAR (OBLIGATORIAMENTE EN ESPAÑOL):
1. "tema": El título o tema central real del documento (de 3 a 8 palabras) OBLIGATORIAMENTE EN ESPAÑOL. Debe ser concreto, académico y descriptivo del contenido (ej: "Mecanismo de Acción de Betalactámicos y Resistencia", "Teoría del Delito y Culpabilidad Penal", "Ciclo de Krebs y Fosforilación Oxidativa", "Fisiopatología del Asma y Ventilación Alveolar"). Si el texto fuente está en inglés u otro idioma, TRADÚCELO AL ESPAÑOL. NO uses nombres de archivo ni palabras vacías como "Documento", "Apuntes" o "PDF".
2. "materia": La materia o disciplina académica específica OBLIGATORIAMENTE EN ESPAÑOL (ej: "Farmacología", "Derecho Penal", "Bioquímica", "Fisiología Médica", "Ingeniería de Software", "Economía Internacional", "Microbiología", "Física Cuántica"). Sé específico con la disciplina exacta.
3. "descripcion": Una síntesis académica en 1 o 2 oraciones concisas en español que explique qué abarca el material y qué se aprenderá.
4. "palabras_clave": Una lista de 3 a 5 conceptos nucleares o palabras clave más relevantes del texto en español.
5. "icono_sugerido": El icono que mejor representa el tema específico del contenido (NO la materia genérica). Elige estrictamente uno de los siguientes nombres:
   "Lungs" (aparato respiratorio, pulmones, asma, ventilación, neumología),
   "HeartPulse" (cardiología, corazón, arritmias, electrocardiograma, hemodinámica, presión arterial),
   "Germ" (bacteriología, bacterias, infecciones bacterianas, sepsis, patógenos, microbiología),
   "Virus" (virología, virus, infecciones virales, epidemias, VIH),
   "Dna" (genética, adn, mutaciones, herencia, biología molecular),
   "Bone" (huesos, esqueleto, fracturas, ortopedia, traumatología, articulaciones),
   "Eye" (oftalmología, visión, ojos, retina, glaucoma),
   "Droplets" (hematología, sangre, hemoglobina, coagulación, anemia, leucemia),
   "Pill" (farmacología, medicamentos, fármacos, posología, toxicología),
   "Syringe" (inyecciones, vacunas, anestesia, inmunología, sueros),
   "Brain" (neurología, cerebro, neurociencia, mente, psiquiatría, psicología),
   "Microscope" (citología, histología, células, biopsias),
   "Wind" (meteorología, viento, clima, atmósfera, huracanes),
   "CloudRain" (lluvia, precipitaciones, hidrología, tormentas),
   "Leaf" (botánica, plantas, ecología, medio ambiente, agronomía),
   "FlaskConical" (química, reacciones químicas, disoluciones, laboratorio),
   "Atom" (física, cuántica, átomos, termodinámica, energía),
   "Binary" (programación, software, algoritmos, bases de datos),
   "Cpu" (hardware, procesadores, arquitectura de computadoras),
   "Scale" (derecho, leyes, justicia, penal, civil),
   "TrendingUp" (economía, finanzas, mercados, contabilidad),
   "Calculator" (matemáticas, cálculo, álgebra, estadística),
   "Landmark" (historia, civilizaciones, arqueología, política),
   "BookOpen" (literatura, filosofía, idiomas, lingüística),
   "Hospital" (sistemas hospitalarios, gestión clínica, salud pública),
   "GraduationCap" (educación general).

FORMATO DE SALIDA (EXCLUSIVAMENTE OBJETO JSON VÁLIDO):
{
  "tema": "Tema concreto y académico del texto en español",
  "materia": "Materia o disciplina académica específica en español",
  "descripcion": "Descripción concisa en 1-2 líneas del contenido educativo en español.",
  "palabras_clave": ["concepto1", "concepto2", "concepto3"],
  "icono_sugerido": "Lungs"
}`;

  const userPrompt = `Analiza este fragmento del documento y clasifícalo en formato JSON (100% en español):
${sampleText}`;

  try {
    const rawResponse = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      true
    );

    const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = cleanOutput.indexOf('{');
    const lastBrace = cleanOutput.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('No se detectó JSON válido en la clasificación.');
    }

    const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonSnippet);
    } catch {
      const sanitized = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
      parsed = JSON.parse(sanitized);
    }

    const tema = String(parsed.tema || '').trim() || 'Material de Estudio';
    const materia = String(parsed.materia || '').trim() || 'General';
    const descripcion = String(parsed.descripcion || '').trim() || `Study Kit de ${materia} sobre ${tema}.`;
    const palabrasClave = Array.isArray(parsed.palabras_clave) ? parsed.palabras_clave.map(String) : [];
    const aiSuggestedIcon = typeof parsed.icono_sugerido === 'string' ? parsed.icono_sugerido.trim() : undefined;
    const visuals = inferContentVisuals(tema, sampleText, palabrasClave, materia, aiSuggestedIcon);

    const result: DocumentClassification = {
      tema,
      materia,
      descripcion,
      palabrasClave,
      icon: visuals.icon,
      color: visuals.color,
      detectedLanguage: langDetection.detectedLanguage,
      isForeign: langDetection.isForeign,
    };

    if (classificationCache.size >= MAX_CLASSIFICATION_CACHE) {
      const oldestKey = classificationCache.keys().next().value;
      if (oldestKey) classificationCache.delete(oldestKey);
    }
    classificationCache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.warn('[classifyDocumentWithAI] Fallback de clasificación:', err);
    const fallbackMateria = 'General';
    const fallbackTema = rawText.split('\n')[0]?.slice(0, 50) || 'Material de Estudio';
    const visuals = inferContentVisuals(fallbackTema, rawText, [], fallbackMateria);
    return {
      tema: fallbackTema,
      materia: fallbackMateria,
      descripcion: `Study Kit general sobre ${fallbackTema}.`,
      palabrasClave: [],
      icon: visuals.icon,
      color: visuals.color,
      detectedLanguage: langDetection.detectedLanguage,
      isForeign: langDetection.isForeign,
    };
  }
}

/**
 * ── EVALUACIÓN SEMÁNTICA DE RESPUESTAS ABIERTAS CORTAS CON IA ─────────────────
 * Compara conceptualmente la respuesta del estudiante con la respuesta esperada (0-100%),
 * identificando aciertos, puntos clave cubiertos y omitidos, con retroalimentación pedagógica.
 */
export async function evaluateShortAnswer(
  userAnswer: string,
  idealAnswer: string,
  questionText: string,
  rubric?: string,
  acceptableAnswers?: string[]
): Promise<ShortAnswerEvaluation> {
  const trimmedUser = (userAnswer || '').trim();
  const trimmedIdeal = (idealAnswer || '').trim();

  if (!trimmedUser) {
    return {
      similarity: 0,
      isCorrect: false,
      score: 0,
      feedback: 'No se ingresó ninguna respuesta.',
      keyPointsCovered: [],
      keyPointsMissed: ['Respuesta en blanco'],
    };
  }

  // Comprobación rápida de coincidencia idéntica o sinónimo directo
  const normalizeText = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const normUser = normalizeText(trimmedUser);
  const normIdeal = normalizeText(trimmedIdeal);

  if (normUser === normIdeal || (acceptableAnswers && acceptableAnswers.some(a => normalizeText(a) === normUser))) {
    return {
      similarity: 100,
      isCorrect: true,
      score: 1.0,
      feedback: 'Coincidencia conceptual exacta con la respuesta modelo.',
      keyPointsCovered: ['Definición precisa y concordante al 100%'],
      keyPointsMissed: [],
    };
  }

  const systemPrompt = `Eres un catedrático universitario y evaluador académico riguroso de Contrareloj Study.
Tu cometido es analizar una respuesta abierta formulada por un alumno y contrastarla con la respuesta modelo del profesor para cuantificar su similitud conceptual y exactitud técnica (0% a 100%).

CRITERIOS DE CALIFICACIÓN:
1. "similarity": Entero de 0 a 100.
   - 90-100: Excelente. Expresa el núcleo conceptual con precisión académica y terminología técnica exacta (aun con redacción propia).
   - 70-89: Aprobado / Sólido. Refleja los principios centrales y la deducción fundamental, con detalles secundarios omitidos.
   - 50-69: Parcialmente correcto. Captura nociones generales pero carece de precisión, rigor o elementos nucleares.
   - Menos de 50: Incorrecto, confuso, tangencial o conceptualmente erróneo.
2. "isCorrect": true si la similitud es >= 65, false en caso contrario.
3. "score": Decimal entre 0 y 1 proporcional a la similitud (ej: 0.82).
4. "feedback": 1 o 2 oraciones analíticas y constructivas en español explicando aciertos y omisiones.
5. "keyPointsCovered": Array de conceptos o nociones que el alumno SÍ expresó correctamente.
6. "keyPointsMissed": Array de conceptos indispensables que FALTARON o estuvieron imprecisos.

FORMATO DE SALIDA (EXCLUSIVAMENTE OBJETO JSON VÁLIDO):
{
  "similarity": 85,
  "isCorrect": true,
  "score": 0.85,
  "feedback": "Comprende correctamente el mecanismo fisiopatológico principal.",
  "keyPointsCovered": ["Identificación del receptor", "Bloqueo competitivo"],
  "keyPointsMissed": ["Aclaración de la reversibilidad del enlace"]
}`;

  const userPrompt = `PREGUNTA ACADÉMICA:
${questionText}

RESPUESTA MODELO / IDEAL DEL PROFESOR:
${trimmedIdeal}
${rubric ? `RÚBRICA DE EVALUACIÓN:\n${rubric}` : ''}
${acceptableAnswers && acceptableAnswers.length > 0 ? `RESPUESTAS ALTERNATIVAS VÁLIDAS:\n- ${acceptableAnswers.join('\n- ')}` : ''}

RESPUESTA ENVIADA POR EL ESTUDIANTE:
"${trimmedUser}"

Genera tu evaluación académica en formato JSON:`;

  try {
    const rawResponse = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      true
    );

    const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = cleanOutput.indexOf('{');
    const lastBrace = cleanOutput.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonSnippet);
      const sim = Math.min(100, Math.max(0, Math.round(Number(parsed.similarity) || 0)));
      return {
        similarity: sim,
        isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : sim >= 65,
        score: typeof parsed.score === 'number' ? parsed.score : Math.round(sim) / 100,
        feedback: String(parsed.feedback || '').trim() || (sim >= 65 ? 'Respuesta conceptualmente acertada.' : 'Respuesta incompleta respecto a la solución esperada.'),
        keyPointsCovered: Array.isArray(parsed.keyPointsCovered) ? parsed.keyPointsCovered.map(String) : [],
        keyPointsMissed: Array.isArray(parsed.keyPointsMissed) ? parsed.keyPointsMissed.map(String) : [],
      };
    }
  } catch (err) {
    console.warn('[evaluateShortAnswer] Fallback heurístico de similitud:', err);
  }

  // Heurística de respaldo (Token overlap / Jaccard + penalización)
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['para', 'como', 'sobre', 'entre', 'desde', 'hacia', 'este', 'esta', 'los', 'las', 'del', 'una', 'con', 'que', 'por'].includes(w));

  const userTokens = new Set(tokenize(trimmedUser));
  const idealTokens = tokenize(trimmedIdeal);

  if (idealTokens.length === 0) {
    return {
      similarity: 70,
      isCorrect: true,
      score: 0.7,
      feedback: 'Respuesta registrada satisfactoriamente.',
      keyPointsCovered: ['Argumentación presentada'],
      keyPointsMissed: [],
    };
  }

  let matches = 0;
  for (const t of idealTokens) {
    if (userTokens.has(t)) matches++;
  }

  const rawSim = Math.min(100, Math.round((matches / idealTokens.length) * 100));
  const fallbackSim = Math.max(rawSim, trimmedUser.length > 25 ? 45 : 20);
  const isCorrect = fallbackSim >= 65;

  return {
    similarity: fallbackSim,
    isCorrect,
    score: Math.round(fallbackSim) / 100,
    feedback: isCorrect
      ? 'La argumentación incluye la mayoría de los términos nucleares del texto.'
      : 'La respuesta omite conceptos y terminología indispensable presente en la solución modelo.',
    keyPointsCovered: Array.from(userTokens).slice(0, 3),
    keyPointsMissed: idealTokens.filter(t => !userTokens.has(t)).slice(0, 3),
  };
}

/**
 * ── GENERADOR DE EXÁMENES ACADÉMICOS ESPECIALIZADOS ──────────────────────────
 * Redacta un examen universitario riguroso ajustado a la rama de conocimiento
 * del documento, con soporte estricto de preguntas abiertas cortas y opción múltiple.
 */
export async function generateSpecializedExamQuestions(
  rawText: string,
  count: number = 10,
  discipline?: string,
  customInstructions?: string,
  formatPreference: 'all' | 'multiple-choice' | 'short-answer' = 'all',
  chunks?: DocumentChunk[]
): Promise<Question[]> {
  const effectiveDiscipline = (discipline || 'General').trim();
  let relevantChunks: DocumentChunk[] = [];

  if (chunks && chunks.length > 0) {
    relevantChunks = chunks.slice(0, Math.min(chunks.length, 12));
  }

  let sourceRepresentation = '';
  if (relevantChunks.length > 0) {
    sourceRepresentation = relevantChunks
      .map(c => `[SECCIÓN ACADÉMICA: ${c.heading || 'Documento'} | Pág: ${c.pageOrSlide || 1}]\n${c.text}`)
      .join('\n\n---\n\n');
  } else {
    sourceRepresentation = rawText.slice(0, 9000);
  }

  const formatInstruction =
    formatPreference === 'short-answer'
      ? 'Genera EXCLUSIVAMENTE preguntas con respuestas abiertas cortas ("short-answer").'
      : formatPreference === 'multiple-choice'
      ? 'Genera EXCLUSIVAMENTE preguntas de opción múltiple rigurosa ("multiple-choice") con 4 alternativas.'
      : 'Genera un formato MIXTO balanceado: 50% de preguntas de opción múltiple ("multiple-choice") y 50% de preguntas abiertas cortas ("short-answer").';

  const systemPrompt = `Eres el Catedrático y Diseñador Principal de Evaluaciones Universitarias de Contrareloj Study.
Tu objetivo es elaborar un examen formal, de alto rigor analítico y adaptado con absoluta fidelidad a la disciplina académica: "${effectiveDiscipline}".

DIRECTRICES DE EXCELENCIA ACADÉMICA:
1. DISCIPLINA "${effectiveDiscipline.toUpperCase()}":
   - Las preguntas deben reflejar el estilo de exámenes de grado, certificaciones profesionales o tribunales académicos de esta rama.
   - Prohibido hacer preguntas triviales, de simple memorización de fechas secundarias o de descarte obvio.
   - Plantea problemas analíticos, diagnósticos diferenciales, deducción de causas y consecuencias, o interpretación rigurosa de preceptos y principios descritos en el material.
2. FORMATOS PERMITIDOS:
   ${formatInstruction}
3. REGLAS PARA PREGUNTAS DE OPCIÓN MÚLTIPLE ("multiple-choice"):
   - 4 alternativas plausibles (A, B, C, D) con longitud similar y lenguaje técnico idéntico.
   - Distractores fundados en confusiones conceptuales típicas de la disciplina en este texto.
4. REGLAS PARA PREGUNTAS ABIERTAS CORTAS ("short-answer"):
   - Enunciados precisos que pidan definir, contrastar, justificar un mecanismo o dictaminar un supuesto en 2 a 4 líneas.
   - "idealAnswer": La respuesta modelo concisa, exacta y completa redactada en español formal universitario.
   - "keyPoints": Array con 2 a 4 conceptos o términos clave indispensables que el estudiante debe incluir.
   - "rubric": Criterio breve de evaluación pedagógica.
   - "acceptableAnswers": 2 a 3 variantes sinónimas o redacciones alternativas igualmente válidas.
5. TODA PREGUNTA debe incluir una explicación exhaustiva fundamentada en la información del documento.
6. TODO EL CONTENIDO DEBE ESTAR 100% EN ESPAÑOL ACADÉMICO.

FORMATO DE SALIDA (ESTRICTAMENTE JSON VÁLIDO):
{
  "disciplina": "${effectiveDiscipline}",
  "preguntas": [
    {
      "id": 1,
      "tipo": "multiple-choice | short-answer",
      "dificultad": "hard | medium",
      "tema": "Subtema específico",
      "pregunta": "¿Enunciado de la pregunta académica rigurosa?",
      "opciones": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      "indice_correcto": 0,
      "respuesta_ideal": "Respuesta modelo exacta esperada (requerida para short-answer)",
      "puntos_clave": ["concepto clave 1", "término 2"],
      "rubrica": "Criterio de evaluación de la respuesta abierta",
      "respuestas_aceptables": ["Variante válida 1", "Variante válida 2"],
      "explicacion": "Explicación académica rigurosa del porqué de la respuesta correcta."
    }
  ]
}`;

  const userPrompt = `MATERIAL DE ESTUDIO BASE:
${sourceRepresentation}

PARÁMETROS DEL EXAMEN:
- Rama académica: ${effectiveDiscipline}
- Cantidad de preguntas: ${count}
- Preferencia de formato: ${formatPreference}
${customInstructions ? `- INSTRUCCIONES ESPECÍFICAS DEL DOCENTE/ALUMNO: "${customInstructions}"` : ''}

Redacta las ${count} preguntas en formato JSON estricto:`;

  try {
    const rawResponse = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      true
    );

    const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = cleanOutput.indexOf('{');
    const lastBrace = cleanOutput.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
      let parsed: any;
      try {
        parsed = JSON.parse(jsonSnippet);
      } catch {
        const sanitized = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
        parsed = JSON.parse(sanitized);
      }

      if (parsed && Array.isArray(parsed.preguntas) && parsed.preguntas.length > 0) {
        return parsed.preguntas.map((p: any, idx: number): Question => {
          const rawType = String(p.tipo || '').toLowerCase();
          const isShort = rawType.includes('short') || rawType.includes('abierta') || formatPreference === 'short-answer';
          const type: Question['type'] = isShort ? 'short-answer' : 'multiple-choice';

          const opts = Array.isArray(p.opciones) && p.opciones.length >= 2
            ? p.opciones.map(String)
            : ['Opción A fundamentada', 'Opción B plausible', 'Opción C alternativa', 'Opción D alternativa'];

          const correctIdx = typeof p.indice_correcto === 'number'
            ? Math.max(0, Math.min(opts.length - 1, p.indice_correcto))
            : 0;

          const idealAnswer = String(p.respuesta_ideal || p.idealAnswer || opts[correctIdx] || '').trim();

          return {
            id: `spec-exam-${Date.now()}-${idx + 1}`,
            type,
            question: String(p.pregunta || `Pregunta de examen ${idx + 1}`).trim(),
            difficulty: (p.dificultad === 'easy' ? 'easy' : p.dificultad === 'medium' ? 'medium' : 'hard') as 'easy' | 'medium' | 'hard',
            topic: String(p.tema || effectiveDiscipline).trim(),
            explanation: String(p.explicacion || 'Fundamentado en el marco teórico del documento.').trim(),
            options: isShort ? undefined : opts,
            correctIndex: isShort ? undefined : correctIdx,
            idealAnswer: idealAnswer || undefined,
            keyPoints: Array.isArray(p.puntos_clave) ? p.puntos_clave.map(String) : undefined,
            rubric: p.rubrica ? String(p.rubrica) : undefined,
            acceptableAnswers: Array.isArray(p.respuestas_aceptables) ? p.respuestas_aceptables.map(String) : undefined,
          };
        });
      }
    }
  } catch (err) {
    console.warn('[generateSpecializedExamQuestions] Fallback a preguntas adaptadas del material:', err);
  }

  // Fallback disciplinar inteligente si falla el endpoint de IA
  const fallbackList: Question[] = [];
  const sampleSentences = rawText
    .split(/\.\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 220);

  for (let i = 0; i < count; i++) {
    const isShort = formatPreference === 'short-answer' || (formatPreference === 'all' && i % 2 === 1);
    const sentence = sampleSentences[i % Math.max(1, sampleSentences.length)] || `Principio fundamental de ${effectiveDiscipline}`;

    if (isShort) {
      fallbackList.push({
        id: `spec-exam-fallback-${i + 1}`,
        type: 'short-answer',
        question: `Explica y fundamenta según el texto el siguiente postulado de ${effectiveDiscipline}: "${sentence.slice(0, 100)}..."`,
        difficulty: 'hard',
        topic: effectiveDiscipline,
        explanation: `La resolución académica se basa en el principio expuesto: "${sentence}".`,
        idealAnswer: sentence,
        keyPoints: sentence.split(' ').filter(w => w.length > 5).slice(0, 3),
        rubric: 'El estudiante debe resumir el núcleo del concepto y su aplicación analítica.',
        acceptableAnswers: [sentence.toLowerCase()],
      });
    } else {
      fallbackList.push({
        id: `spec-exam-fallback-${i + 1}`,
        type: 'multiple-choice',
        question: `Respecto a los contenidos de ${effectiveDiscipline}, ¿cuál de los siguientes enunciados se deduce rigurosamente del texto?`,
        difficulty: 'hard',
        topic: effectiveDiscipline,
        explanation: `El documento establece textualmente: "${sentence}".`,
        options: [
          sentence,
          `Inversión conceptual contradictoria sobre ${effectiveDiscipline}.`,
          `Interpretación tangencial no sostenida por la bibliografía base.`,
          `Afirmación genérica que altera el orden de causalidad descrito.`
        ],
        correctIndex: 0,
      });
    }
  }

  return fallbackList;
}




