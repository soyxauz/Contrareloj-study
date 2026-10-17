import { getAISettings, saveAISettings } from './aiService';

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
  const standalone =
    localStorage.getItem('contrareloj_gemini_api_key') ||
    localStorage.getItem('thea_gemini_api_key');
  if (standalone?.trim()) {
    return standalone.trim();
  }
  return '';
}

/**
 * Guarda la API Key dedicada para Gemini Audio.
 */
export function setGeminiAudioApiKey(key: string): void {
  const clean = key.trim();
  localStorage.setItem('contrareloj_gemini_api_key', clean);
  const settings = getAISettings();
  saveAISettings({
    ...settings,
    geminiApiKey: clean,
  });
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
  return `${voice}_${Math.abs(hash)}_${text.length}`;
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
 * Sintetiza un fragmento de texto usando Gemini 2.0 Flash Audio TTS con emociones contextuales.
 * Devuelve un Object URL de audio listo para reproducirse inmediatamente.
 */
export async function synthesizeGeminiSpeech(
  text: string,
  voiceName: string = 'Aoede',
  apiKeyOverride?: string
): Promise<string> {
  const cleanText = text
    .replace(/[*_#`~[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[$]/g, '')
    .trim();

  if (!cleanText) {
    throw new Error('El texto proporcionado está vacío.');
  }

  const cacheKey = computeCacheKey(voiceName, cleanText);

  // 1. Verificar si ya está en caché de memoria o IndexedDB
  const cached = await getCachedAudioUrl(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Si ya hay una petición en curso para este mismo texto, reusar su promesa
  if (ongoingRequests.has(cacheKey)) {
    return ongoingRequests.get(cacheKey)!;
  }

  const apiKey = apiKeyOverride?.trim() || getGeminiAudioApiKey();
  if (!apiKey) {
    throw new Error('No se ha configurado una API Key de Google Gemini para voz con emociones.');
  }

  const requestPromise = (async () => {
    const modelsToTry = ['gemini-2.0-flash', 'gemini-2.5-flash'];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Instrucción de locución: Actúa como un locutor profesional de podcast en español. Lee el siguiente diálogo con entonación natural, humana, expresiva, cálida y con inflexión emocional acorde al contenido:\n\n"${cleanText}"`,
              },
            ],
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

      try {
        let response: Response;

        // Intentar llamada directa primero
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
        } catch {
          // Si hay restricción CORS en el navegador, usar el proxy serverless local / Vercel
          response = await fetch('/api/ai-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: endpoint,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              data: payload,
            }),
          });
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`HTTP ${response.status} en modelo ${model}: ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const part = candidate?.content?.parts?.[0];

        if (!part?.inlineData?.data) {
          throw new Error(`Respuesta de ${model} no contiene datos de audio.`);
        }

        const base64Audio = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'audio/pcm;rate=24000';

        // Decodificar Base64 a Uint8Array
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        let blob: Blob;
        if (mimeType.toLowerCase().includes('wav')) {
          blob = new Blob([bytes], { type: 'audio/wav' });
        } else {
          let sampleRate = 24000;
          const rateMatch = mimeType.match(/rate=(\d+)/i);
          if (rateMatch) {
            sampleRate = parseInt(rateMatch[1], 10);
          }
          blob = pcmToWavBlob(bytes, sampleRate);
        }

        const objectUrl = URL.createObjectURL(blob);
        memoryAudioUrlCache.set(cacheKey, objectUrl);
        await saveAudioBlobToCache(cacheKey, blob);
        return objectUrl;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[GeminiAudio] Fallo al generar con ${model}, probando siguiente:`, lastError.message);
      }
    }

    throw lastError || new Error('No se pudo generar el audio con los modelos disponibles.');
  })();

  ongoingRequests.set(cacheKey, requestPromise);

  try {
    const resultUrl = await requestPromise;
    return resultUrl;
  } finally {
    ongoingRequests.delete(cacheKey);
  }
}

/**
 * Pre-carga un turno de diálogo en segundo plano sin bloquear.
 */
export function prefetchGeminiSpeech(
  text: string,
  voiceName: string = 'Aoede',
  apiKeyOverride?: string
): void {
  const cleanText = text
    .replace(/[*_#`~[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[$]/g, '')
    .trim();

  if (!cleanText) return;
  const cacheKey = computeCacheKey(voiceName, cleanText);
  if (memoryAudioUrlCache.has(cacheKey) || ongoingRequests.has(cacheKey)) return;

  synthesizeGeminiSpeech(cleanText, voiceName, apiKeyOverride).catch((err) => {
    // Silencioso en pre-carga para no interrumpir
    console.debug('[GeminiAudio Prefetch] No se pudo pre-cargar:', err.message);
  });
}
