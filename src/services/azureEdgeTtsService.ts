/**
 * Servicio de síntesis de voz neuronal de Microsoft Azure (Edge Neural TTS).
 * Voces originales de Azure de alta fidelidad, 100% gratuitas, sin límites ni claves de API.
 * Incluye almacenamiento en caché persistente en IndexedDB y pre-carga fluida.
 */

export interface AzureEdgeVoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  tone: string;
  country: string;
  roleHint?: string;
}

export const AZURE_EDGE_VOICES: AzureEdgeVoiceOption[] = [
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira Neural',
    gender: 'female',
    tone: 'Cálida, conversacional, radiofónica y expresiva',
    country: 'España',
    roleHint: 'Predeterminada para Sofía (Host Principal)',
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Álvaro Neural',
    gender: 'male',
    tone: 'Enérgico, radiofónico y analítico',
    country: 'España',
    roleHint: 'Predeterminada para Mateo (Co-Host Analítico)',
  },
  {
    id: 'es-ES-AbrilNeural',
    name: 'Abril Neural',
    gender: 'female',
    tone: 'Joven, dinámica y muy cercana',
    country: 'España',
    roleHint: 'Alternativa femenina juvenil',
  },
  {
    id: 'es-ES-ArnauNeural',
    name: 'Arnau Neural',
    gender: 'male',
    tone: 'Natural, reflexivo y sereno',
    country: 'España',
    roleHint: 'Alternativa masculina serena',
  },
  {
    id: 'es-MX-DaliaNeural',
    name: 'Dalia Neural',
    gender: 'female',
    tone: 'Fresca, clara y altamente pedagógica',
    country: 'México',
    roleHint: 'Ideal para explicaciones detalladas',
  },
  {
    id: 'es-MX-JorgeNeural',
    name: 'Jorge Neural',
    gender: 'male',
    tone: 'Juvenil, dinámico y ameno',
    country: 'México',
    roleHint: 'Ideal para debates frescos',
  },
  {
    id: 'es-MX-BeatrizNeural',
    name: 'Beatriz Neural',
    gender: 'female',
    tone: 'Reflexiva, periodística y formal',
    country: 'México',
    roleHint: 'Tono documental periodístico',
  },
  {
    id: 'es-CO-SalomeNeural',
    name: 'Salomé Neural',
    gender: 'female',
    tone: 'Dulce, pedagógica, clara y pausada',
    country: 'Colombia',
    roleHint: 'Locución didáctica suave',
  },
  {
    id: 'es-CO-GonzaloNeural',
    name: 'Gonzalo Neural',
    gender: 'male',
    tone: 'Profesional, seguro y analítico',
    country: 'Colombia',
    roleHint: 'Tono profesor / académico',
  },
  {
    id: 'es-US-PalomaNeural',
    name: 'Paloma Neural',
    gender: 'female',
    tone: 'Neutra, contemporánea y fluida',
    country: 'EE.UU. / Neutral',
    roleHint: 'Acento latinoamericano neutro',
  },
  {
    id: 'es-US-AlonsoNeural',
    name: 'Alonso Neural',
    gender: 'male',
    tone: 'Comunicativo, cercano y fluido',
    country: 'EE.UU. / Neutral',
    roleHint: 'Acento neutro radiofónico',
  },
  {
    id: 'es-AR-ElenaNeural',
    name: 'Elena Neural',
    gender: 'female',
    tone: 'Cálida, elegante y expresiva',
    country: 'Argentina',
    roleHint: 'Acento rioplatense femenino',
  },
  {
    id: 'es-AR-TomasNeural',
    name: 'Tomás Neural',
    gender: 'male',
    tone: 'Seguro, dinámico y conversacional',
    country: 'Argentina',
    roleHint: 'Acento rioplatense masculino',
  },
];

const DB_NAME = 'ContrarelojAudioDB';
const DB_VERSION = 2;
const STORE_NAME = 'azure_edge_audio_cache';

const memoryAudioUrlCache = new Map<string, string>();
const ongoingRequests = new Map<string, Promise<string>>();

/**
 * Obtiene la conexión a la base de datos IndexedDB para caché persistente de audios.
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
        if (!db.objectStoreNames.contains('podcast_audio_cache')) {
          db.createObjectStore('podcast_audio_cache', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => {
        console.warn('[AzureEdgeTTS] Error al abrir base de datos IndexedDB:', err);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function computeCacheKey(text: string, voice: string, rate?: string, pitch?: string): string {
  const norm = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return `azure_${voice}_${rate || ''}_${pitch || ''}_${norm}`;
}

async function getCachedAudioBlob(key: string): Promise<Blob | null> {
  const db = await getAudioDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob);
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

async function saveAudioBlobToCache(key: string, blob: Blob): Promise<void> {
  const db = await getAudioDatabase();
  if (!db) return;

  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      key,
      blob,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('[AzureEdgeTTS] No se pudo guardar audio en caché persistente:', err);
  }
}

/**
 * Sintetiza un fragmento de texto con las voces originales de Microsoft Azure Neural.
 * Devuelve una Object URL (blob:...) lista para reproducirse en un elemento HTMLAudioElement.
 */
export async function synthesizeAzureEdgeSpeech(
  text: string,
  voice: string = 'es-ES-ElviraNeural',
  rate?: string,
  pitch?: string
): Promise<string> {
  const clean = text
    .replace(/[*_#`~[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[$]/g, '')
    .trim();

  if (!clean) {
    throw new Error('Texto vacío para síntesis');
  }

  const cacheKey = computeCacheKey(clean, voice, rate, pitch);

  // 1. Memoria RAM instantánea (0ms)
  if (memoryAudioUrlCache.has(cacheKey)) {
    return memoryAudioUrlCache.get(cacheKey)!;
  }

  // 2. Caché persistente en IndexedDB (5-10ms)
  const cachedBlob = await getCachedAudioBlob(cacheKey);
  if (cachedBlob) {
    const url = URL.createObjectURL(cachedBlob);
    memoryAudioUrlCache.set(cacheKey, url);
    return url;
  }

  // 3. Deduplicación de peticiones en vuelo
  if (ongoingRequests.has(cacheKey)) {
    return ongoingRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch('/api/edge-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: clean,
          voice,
          rate,
          pitch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en Azure Neural TTS (${response.status}): ${errorText}`);
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('La síntesis de Azure Neural devolvió un archivo de audio vacío');
      }

      // Persistir en IndexedDB para futuras reproducciones offline y sin latencia
      saveAudioBlobToCache(cacheKey, blob);

      const objectUrl = URL.createObjectURL(blob);
      memoryAudioUrlCache.set(cacheKey, objectUrl);
      return objectUrl;
    } finally {
      ongoingRequests.delete(cacheKey);
    }
  })();

  ongoingRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Pre-carga un fragmento en segundo plano de manera no bloqueante.
 */
export function prefetchAzureEdgeSpeech(text: string, voice: string, rate?: string, pitch?: string): void {
  synthesizeAzureEdgeSpeech(text, voice, rate, pitch).catch((err) => {
    console.warn('[AzureEdgeTTS] Pre-carga no crítica descartada:', err);
  });
}

/**
 * Ventana deslizante de pre-carga para todo el podcast.
 * Pre-sintetiza los siguientes turnos de diálogo para garantizar cero pausas entre Sofía y Mateo.
 */
export function preloadEntireAzurePodcast(
  dialogue: Array<{ speaker: string; text: string }>,
  sofiaVoice: string = 'es-ES-ElviraNeural',
  mateoVoice: string = 'es-ES-AlvaroNeural',
  fromIndex: number = 0,
  windowSize: number = 3
): void {
  if (!dialogue || dialogue.length === 0) return;

  const endIndex = Math.min(dialogue.length, fromIndex + windowSize);
  for (let i = fromIndex; i < endIndex; i++) {
    const item = dialogue[i];
    if (!item || !item.text) continue;
    const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(item.speaker);
    const voice = isFemale ? sofiaVoice : mateoVoice;
    prefetchAzureEdgeSpeech(item.text, voice);
  }
}
