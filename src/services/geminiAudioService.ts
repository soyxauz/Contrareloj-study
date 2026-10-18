import { getAISettings, saveAISettings } from './aiService';
import type { PodcastSettings } from '../types';
import { authService } from './authService';

export type { PodcastSettings };

/**
 * Servicio de síntesis de voz neuronal con emociones impulsado por Google Gemini Flash Audio.
 * Permite generar locución con prosodia, inflexión y expresividad humana para el Review Podcast.
 */

export interface GeminiVoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  tone: string;
  roleHint: string;
}

export const GEMINI_VOICES: GeminiVoiceOption[] = [
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'female',
    tone: 'Cálida, conversacional y expresiva',
    roleHint: 'Predeterminada para Sofía (Host principal)',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    tone: 'Juvenil, enérgico y dinámico',
    roleHint: 'Predeterminada para Mateo (Co-host analítico)',
  },
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    tone: 'Pedagógica, calmada y académica',
    roleHint: 'Alternativa femenina serena',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    tone: 'Asertivo, profundo y estilo radio/debate',
    roleHint: 'Alternativa masculina con carácter',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    tone: 'Reflexivo, pausado y documental',
    roleHint: 'Alternativa masculina documental',
  },
];

const DB_NAME = 'ContrarelojAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'podcast_audio_cache';

const memoryAudioUrlCache = new Map<string, string>();
const ongoingRequests = new Map<string, Promise<string>>();

/**
 * Acceso a la base de datos IndexedDB para caché persistente de audios.
 */
function getAudioDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => {
        console.warn('[GeminiAudio] Error al abrir base de datos de audio:', err);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export interface EdgeVoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  tone: string;
  country: string;
}

export const EDGE_VOICES: EdgeVoiceOption[] = [
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira Neural',
    gender: 'female',
    tone: 'Cálida, conversacional y expresiva',
    country: 'España',
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Álvaro Neural',
    gender: 'male',
    tone: 'Enérgico, radiofónico y analítico',
    country: 'España',
  },
  {
    id: 'es-MX-DaliaNeural',
    name: 'Dalia Neural',
    gender: 'female',
    tone: 'Fresca, clara y didáctica',
    country: 'México',
  },
  {
    id: 'es-MX-JorgeNeural',
    name: 'Jorge Neural',
    gender: 'male',
    tone: 'Juvenil, dinámico y ameno',
    country: 'México',
  },
  {
    id: 'es-CO-SalomeNeural',
    name: 'Salomé Neural',
    gender: 'female',
    tone: 'Dulce, pedagógica y serena',
    country: 'Colombia',
  },
  {
    id: 'es-CO-GonzaloNeural',
    name: 'Gonzalo Neural',
    gender: 'male',
    tone: 'Profesional, seguro y reflexivo',
    country: 'Colombia',
  },
  {
    id: 'es-US-PalomaNeural',
    name: 'Paloma Neural',
    gender: 'female',
    tone: 'Neutra, contemporánea y fluida',
    country: 'EE.UU. / Latam',
  },
  {
    id: 'es-US-AlonsoNeural',
    name: 'Alonso Neural',
    gender: 'male',
    tone: 'Comunicativo, cercano y fluido',
    country: 'EE.UU. / Latam',
  },
];

export const DEFAULT_PODCAST_SETTINGS: PodcastSettings = {
  voiceEngine: 'edge',
  sofiaVoice: 'Aoede',
  mateoVoice: 'Puck',
  edgeSofiaVoice: 'es-ES-ElviraNeural',
  edgeMateoVoice: 'es-ES-AlvaroNeural',
  localSofiaVoice: '',
  localMateoVoice: '',
  playbackSpeed: 1,
  geminiApiKey: '',
  orientation: '',
};

const PODCAST_SETTINGS_KEY = 'contrareloj_podcast_settings';
const PODCAST_SETTINGS_LEGACY_KEY = 'thea_podcast_settings';

/**
 * Obtiene la configuración de Podcast persistida (local y compatible con multicuenta).
 */
export function getPodcastSettings(): PodcastSettings {
  let settings: PodcastSettings = { ...DEFAULT_PODCAST_SETTINGS };
  try {
    const raw = typeof localStorage !== 'undefined'
      ? (localStorage.getItem(PODCAST_SETTINGS_KEY) || localStorage.getItem(PODCAST_SETTINGS_LEGACY_KEY))
      : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      settings = { ...settings, ...parsed };
    }
  } catch (e) {
    console.warn('[GeminiAudio] Error al leer ajustes de podcast locales:', e);
  }

  // Si el ajuste almacenado era 'gemini', migrar automáticamente a 'edge' (Azure Neural)
  if (settings.voiceEngine === 'gemini') {
    settings.voiceEngine = 'edge';
  }

  // Si no tiene apiKey pero existe en AISettings o standalone, integrarla
  const currentKey = getGeminiAudioApiKey();
  if (!settings.geminiApiKey && currentKey) {
    settings.geminiApiKey = currentKey;
  }
  return settings;
}

/**
 * Guarda la configuración de Podcast de forma reactiva y multicuenta.
 */
export function savePodcastSettings(partial: Partial<PodcastSettings>): PodcastSettings {
  const current = getPodcastSettings();
  const updated: PodcastSettings = {
    ...current,
    ...partial,
  };

  try {
    localStorage.setItem(PODCAST_SETTINGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[GeminiAudio] Error al guardar ajustes de podcast en localStorage:', e);
  }

  // Si se actualizó la clave de Gemini
  if (partial.geminiApiKey !== undefined) {
    const cleanKey = partial.geminiApiKey.trim();
    localStorage.setItem('contrareloj_gemini_api_key', cleanKey);
    const ai = getAISettings();
    saveAISettings({
      ...ai,
      geminiApiKey: cleanKey,
    });
  }

  // Asociar al usuario autenticado activo si existe
  const currentUser = authService.getCurrentUser();
  if (currentUser) {
    authService.saveUserPodcastSettings(currentUser.id, updated);
  }

  // Emitir evento reactivo para refrescar la interfaz en tiempo real
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contrareloj_podcast_settings_changed', { detail: updated }));
  }

  return updated;
}

/**
 * Obtiene la API Key activa para Gemini Audio.
 */
export function getGeminiAudioApiKey(): string {
  const settings = getAISettings();
  if (settings.geminiApiKey?.trim()) {
    return settings.geminiApiKey.trim();
  }
  if (settings.apiKey?.trim().startsWith('AIzaSy') || settings.baseUrl?.includes('googleapis')) {
    return settings.apiKey.trim();
  }

  // Verificar en ajustes de podcast guardados
  try {
    const rawPod = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('contrareloj_podcast_settings') || localStorage.getItem('thea_podcast_settings'))
      : null;
    if (rawPod) {
      const parsed = JSON.parse(rawPod);
      if (parsed.geminiApiKey?.trim()) {
        return parsed.geminiApiKey.trim();
      }
    }
  } catch {}

  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    return (import.meta.env.VITE_GEMINI_API_KEY as string).trim();
  }

  const standalone =
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem('contrareloj_gemini_api_key') || localStorage.getItem('thea_gemini_api_key'))
      : null;
  if (standalone?.trim()) {
    return standalone.trim();
  }
  return '';
}

/**
 * Guarda la API Key dedicada para Gemini Audio y actualiza la configuración global del podcast.
 */
export function setGeminiAudioApiKey(key: string): void {
  const clean = key.trim();
  localStorage.setItem('contrareloj_gemini_api_key', clean);
  const settings = getAISettings();
  saveAISettings({
    ...settings,
    geminiApiKey: clean,
  });
  savePodcastSettings({ geminiApiKey: clean });
}

/**
 * Genera una clave hash única para el caché.
 */
function computeCacheKey(voice: string, text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `v3_${voice}_${Math.abs(hash)}_${text.length}`;
}

/**
 * Recupera un audio previamente generado de IndexedDB.
 */
async function getCachedAudioUrl(cacheKey: string): Promise<string | null> {
  if (memoryAudioUrlCache.has(cacheKey)) {
    return memoryAudioUrlCache.get(cacheKey)!;
  }

  const db = await getAudioDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);

      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          const url = URL.createObjectURL(req.result.blob);
          memoryAudioUrlCache.set(cacheKey, url);
          resolve(url);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Guarda un blob de audio en IndexedDB.
 */
async function saveAudioBlobToCache(cacheKey: string, blob: Blob): Promise<void> {
  const db = await getAudioDatabase();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      key: cacheKey,
      blob,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('[GeminiAudio] No se pudo guardar en caché IndexedDB:', err);
  }
}

/**
 * Convierte un búfer PCM lineal crudo (16 bits mono) a un Blob de archivo WAV con cabecera estándar de 44 bytes.
 */
export function pcmToWavBlob(
  pcmData: Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitDepth = 16
): Blob {
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Divide un texto largo en fragmentos naturales de habla delimitados por puntuación,
 * garantizando que ningún fragmento exceda ~36-40 palabras para evitar cualquier truncamiento
 * o límite temporal por turno de la API de Gemini Flash Audio.
 */
function splitTextIntoSpeechChunks(text: string, maxWordsPerChunk = 120): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const allWords = clean.split(/\s+/).filter(Boolean);
  if (allWords.length <= maxWordsPerChunk) {
    return [clean];
  }

  // Separar respetando signos de puntuación (. ! ? ; : \n)
  const sentenceRegex = /[^.!?;\n]+[.!?;\n]*/g;
  const rawSentences = clean.match(sentenceRegex) || [clean];

  const chunks: string[] = [];
  let currentChunk = '';

  for (const rawSentence of rawSentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    const candidateWordCount = candidate.split(/\s+/).filter(Boolean).length;

    if (candidateWordCount <= maxWordsPerChunk) {
      currentChunk = candidate;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // Si una sola oración supera maxWordsPerChunk, dividirla por comas
      const sentenceWordCount = sentence.split(/\s+/).filter(Boolean).length;
      if (sentenceWordCount > maxWordsPerChunk) {
        const clauses = sentence.split(/,\s*/);
        let subChunk = '';
        for (let i = 0; i < clauses.length; i++) {
          const clause = clauses[i];
          const hasComma = i < clauses.length - 1 ? ',' : '';
          const candidateClause = subChunk ? `${subChunk} ${clause}${hasComma}` : `${clause}${hasComma}`;
          const clauseWords = candidateClause.split(/\s+/).filter(Boolean).length;

          if (clauseWords <= maxWordsPerChunk) {
            subChunk = candidateClause;
          } else {
            if (subChunk) chunks.push(subChunk.trim());
            subChunk = `${clause}${hasComma}`;
          }
        }
        if (subChunk.trim()) {
          chunks.push(subChunk.trim());
        }
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [clean];
}

interface AudioChunkResult {
  rawBytes: Uint8Array;
  pcmBytes: Uint8Array;
  sampleRate: number;
  isWav: boolean;
}

/**
 * Realiza la petición a Gemini Flash Audio TTS para sintetizar un fragmento individual de voz.
 */
async function fetchGeminiAudioPcmChunk(
  chunkText: string,
  voiceName: string,
  apiKey: string
): Promise<AudioChunkResult> {
  const modelsToTry = [
    'gemini-3.8-flash-tts',
    'gemini-3.8-flash-lite-tts',
    'gemini-3.1-flash-tts-preview',
  ];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [{ text: chunkText }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    };

    // Reintentar máximo 1 vez si Google responde con 429
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let response: Response;

        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch {
          // Fallback proxy serverless
          response = await fetch('/api/ai-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: endpoint,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              data: payload,
            }),
          });
        }

        if (response.status === 403) {
          const errBody = await response.text();
          const isBlocked = errBody.includes('API_KEY_SERVICE_BLOCKED') || errBody.includes('blocked') || errBody.includes('PERMISSION_DENIED');
          const message = isBlocked
            ? 'API_KEY_SERVICE_BLOCKED: La API Generative Language está deshabilitada o restringida en Google Cloud para esta clave.'
            : `HTTP 403 en ${model}: Acceso denegado a la API de Gemini.`;
          console.warn(`[GeminiAudio] Error de permisos en ${model}:`, message);
          throw new Error(message);
        }

        if (response.status === 429 || response.status === 503 || response.status === 500) {
          const errBody = await response.text();
          if (attempt === 0) {
            console.warn(`[GeminiAudio] Cuota temporal (${response.status}) en ${model}. Esperando 3000ms antes de reintentar...`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          } else {
            console.warn(`[GeminiAudio] Cuota agotada en ${model}: ${errBody.slice(0, 300)}.`);
            break;
          }
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`HTTP ${response.status} en modelo ${model}: ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const part = candidate?.content?.parts?.find(
          (p: any) => p.inlineData?.data || p.inline_data?.data || p.audio?.data
        );

        if (!part) {
          console.warn(`[GeminiAudio] Respuesta de ${model} recibida sin audio:`, JSON.stringify(candidate || data).slice(0, 300));
          throw new Error(`Respuesta de ${model} no contiene datos de audio.`);
        }

        const inlineObj = part.inlineData || part.inline_data || part.audio;
        const base64Audio = inlineObj.data;
        const mimeType = inlineObj.mimeType || inlineObj.mime_type || 'audio/wav';

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        let isWav = false;
        let sampleRate = 24000;

        if (
          bytes.length >= 44 &&
          bytes[0] === 0x52 && // 'R'
          bytes[1] === 0x49 && // 'I'
          bytes[2] === 0x46 && // 'F'
          bytes[3] === 0x46    // 'F'
        ) {
          isWav = true;
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          sampleRate = view.getUint32(24, true);
        } else {
          const rateMatch = mimeType.match(/rate=(\d+)/i);
          if (rateMatch) {
            sampleRate = parseInt(rateMatch[1], 10);
          }
        }

        const pcmBytes = isWav ? bytes.slice(44) : bytes;

        return {
          rawBytes: bytes,
          pcmBytes,
          sampleRate,
          isWav,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[GeminiAudio] Fallo al generar fragmento con ${model}:`, lastError.message);
        if (lastError.message.includes('API_KEY_SERVICE_BLOCKED')) {
          throw lastError;
        }
        break;
      }
    }
  }

  throw lastError || new Error('No se pudo generar el fragmento de audio con los modelos disponibles.');
}

/**
 * Ejecuta la síntesis de un texto completo, dividiendo en fragmentos solo si es estrictamente necesario.
 */
async function executeSingleSynthesis(
  cleanText: string,
  voiceName: string,
  apiKey: string
): Promise<string> {
  const chunks = splitTextIntoSpeechChunks(cleanText, 300);

  let finalBlob: Blob;

  if (chunks.length === 1) {
    const result = await fetchGeminiAudioPcmChunk(chunks[0], voiceName, apiKey);
    if (result.isWav) {
      finalBlob = new Blob([result.rawBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    } else {
      finalBlob = pcmToWavBlob(result.pcmBytes, result.sampleRate);
    }
  } else {
    const chunkResults: AudioChunkResult[] = [];
    for (const chunk of chunks) {
      const res = await fetchGeminiAudioPcmChunk(chunk, voiceName, apiKey);
      chunkResults.push(res);
    }

    const totalPcmLength = chunkResults.reduce((acc, r) => acc + r.pcmBytes.length, 0);
    const mergedPcm = new Uint8Array(totalPcmLength);
    let offset = 0;
    for (const r of chunkResults) {
      mergedPcm.set(r.pcmBytes, offset);
      offset += r.pcmBytes.length;
    }

    const sampleRate = chunkResults[0]?.sampleRate || 24000;
    finalBlob = pcmToWavBlob(mergedPcm, sampleRate);
  }

  const cacheKey = computeCacheKey(voiceName, cleanText);
  const objectUrl = URL.createObjectURL(finalBlob);
  memoryAudioUrlCache.set(cacheKey, objectUrl);
  await saveAudioBlobToCache(cacheKey, finalBlob);
  return objectUrl;
}

interface QueueItem {
  cleanText: string;
  voiceName: string;
  apiKey: string;
  priority: 'high' | 'normal';
  resolve: (url: string) => void;
  reject: (err: any) => void;
}

/**
 * Gestor de cola secuencial para síntesis de audio Gemini TTS.
 * Garantiza cero peticiones concurrentes simultáneas (evita 429), espaciado prudente
 * y priorización instantánea para el parlamento en reproducción activa.
 */
class AudioSynthesisQueueManager {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private lastRequestTime = 0;

  public enqueue(
    cleanText: string,
    voiceName: string,
    apiKey: string,
    priority: 'high' | 'normal' = 'normal'
  ): Promise<string> {
    const cacheKey = computeCacheKey(voiceName, cleanText);

    if (memoryAudioUrlCache.has(cacheKey)) {
      return Promise.resolve(memoryAudioUrlCache.get(cacheKey)!);
    }

    // Si ya está en la cola pero ahora se solicita con prioridad 'high', elevarlo al frente inmediatamente
    const existingIndex = this.queue.findIndex(
      q => computeCacheKey(q.voiceName, q.cleanText) === cacheKey
    );
    if (existingIndex !== -1 && priority === 'high') {
      const [item] = this.queue.splice(existingIndex, 1);
      item.priority = 'high';
      this.queue.unshift(item);
    }

    if (ongoingRequests.has(cacheKey)) {
      return ongoingRequests.get(cacheKey)!;
    }

    const promise = new Promise<string>((resolve, reject) => {
      getCachedAudioUrl(cacheKey).then(cached => {
        if (cached) {
          resolve(cached);
          return;
        }

        const item: QueueItem = { cleanText, voiceName, apiKey, priority, resolve, reject };
        if (priority === 'high') {
          // El parlamento activo salta al frente absoluto de la cola
          this.queue.unshift(item);
        } else {
          this.queue.push(item);
        }
        this.processNext();
      }).catch(() => {
        const item: QueueItem = { cleanText, voiceName, apiKey, priority, resolve, reject };
        if (priority === 'high') {
          this.queue.unshift(item);
        } else {
          this.queue.push(item);
        }
        this.processNext();
      });
    });

    ongoingRequests.set(cacheKey, promise);
    promise.finally(() => {
      ongoingRequests.delete(cacheKey);
    });

    return promise;
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      const cacheKey = computeCacheKey(item.voiceName, item.cleanText);

      if (memoryAudioUrlCache.has(cacheKey)) {
        item.resolve(memoryAudioUrlCache.get(cacheKey)!);
        continue;
      }

      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      // Para reproducción activa prioritaria (high), espaciado de 800ms.
      // Para precarga pasiva de fondo (normal), espaciado seguro de 3500ms para no saturar el límite de 15 RPM de Google AI Studio.
      const minInterval = item.priority === 'high' ? 800 : 3500;
      if (elapsed < minInterval) {
        await new Promise(r => setTimeout(r, minInterval - elapsed));
      }

      try {
        const url = await executeSingleSynthesis(item.cleanText, item.voiceName, item.apiKey);
        this.lastRequestTime = Date.now();
        item.resolve(url);
      } catch (err) {
        this.lastRequestTime = Date.now();
        item.reject(err);
      }
    }

    this.isProcessing = false;
  }
}

const audioQueue = new AudioSynthesisQueueManager();

/**
 * Sintetiza un parlamento completo usando Gemini Flash Audio TTS con emociones contextuales.
 * Permite especificar prioridad ('high' para reproducción actual, 'normal' para pre-síntesis).
 */
export async function synthesizeGeminiSpeech(
  text: string,
  voiceName: string = 'Aoede',
  apiKeyOrPriority?: string | 'high' | 'normal',
  priority: 'high' | 'normal' = 'high'
): Promise<string> {
  let resolvedApiKey = '';
  let resolvedPriority: 'high' | 'normal' = priority;

  if (apiKeyOrPriority === 'high' || apiKeyOrPriority === 'normal') {
    resolvedPriority = apiKeyOrPriority;
  } else if (typeof apiKeyOrPriority === 'string' && apiKeyOrPriority.trim()) {
    resolvedApiKey = apiKeyOrPriority.trim();
  }

  const cleanText = text
    .replace(/[*_#`~[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[$]/g, '')
    .trim();

  if (!cleanText) {
    throw new Error('El texto proporcionado está vacío.');
  }

  const apiKey = resolvedApiKey || getGeminiAudioApiKey();
  if (!apiKey) {
    throw new Error('No se ha configurado una API Key de Google Gemini para voz con emociones.');
  }

  return audioQueue.enqueue(cleanText, voiceName, apiKey, resolvedPriority);
}

/**
 * Pre-carga un turno de diálogo en segundo plano sin bloquear.
 */
export function prefetchGeminiSpeech(
  text: string,
  voiceName: string = 'Aoede',
  apiKeyOverride?: string,
  priority: 'high' | 'normal' = 'normal'
): void {
  const cleanText = text
    .replace(/[*_#`~[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[$]/g, '')
    .trim();

  if (!cleanText) return;
  const apiKey = apiKeyOverride?.trim() || getGeminiAudioApiKey();
  if (!apiKey) return;

  audioQueue.enqueue(cleanText, voiceName, apiKey, priority).catch(() => {});
}

/**
 * Pre-sintetiza progresivamente el turno inmediatamente posterior (startIndex + 1)
 * de forma secuencial y espaciada para evitar agotar la cuota de Google AI Studio (15 RPM).
 */
export function preloadEntirePodcast(
  dialogue: Array<{ text: string; speaker: string }>,
  sofiaVoice: string = 'Aoede',
  mateoVoice: string = 'Puck',
  startIndex: number = 0
): void {
  if (!dialogue || dialogue.length === 0) return;
  const apiKey = getGeminiAudioApiKey();
  if (!apiKey) return;

  const nextIndex = startIndex + 1;
  if (dialogue[nextIndex]) {
    const item = dialogue[nextIndex];
    const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(item.speaker);
    const voice = isFemale ? sofiaVoice : mateoVoice;
    prefetchGeminiSpeech(item.text, voice, apiKey, 'normal');
  }
}
