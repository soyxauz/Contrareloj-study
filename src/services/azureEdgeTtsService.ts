/**
 * Servicio de síntesis de voz neuronal de Microsoft Azure (Edge Neural TTS).
 * Voces originales de Azure de alta fidelidad, sin límites ni claves de API.
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

const MAX_ACTIVE_AUDIO_URLS = 4;
const memoryAudioUrlCache = new Map<string, string>();
const audioDurationCache = new Map<string, number>();
const ongoingRequests = new Map<string, Promise<string>>();
const ongoingDurationRequests = new Map<string, Promise<number>>();
const ongoingBlobFetches = new Map<string, Promise<Blob>>();

function cleanTtsText(text: string): string {
  return (text || '')
    .replace(/[*_#`~[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[$]/g, '')
    .trim();
}

/** Mide la duración exacta en segundos de un Blob de audio y libera el ObjectURL de inmediato. */
function measureAudioBlobDuration(blob: Blob): Promise<number> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || !blob || blob.size === 0) {
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    let settled = false;
    const cleanup = (secs: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.onerror = null;
      try {
        audio.src = '';
        audio.load();
      } catch {}
      try {
        URL.revokeObjectURL(tempUrl);
      } catch {}
      resolve(Number.isFinite(secs) && secs > 0 ? secs : 0);
    };

    const timeoutId = setTimeout(() => cleanup(0), 4000);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        cleanup(audio.duration);
      }
    };
    audio.ondurationchange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        cleanup(audio.duration);
      }
    };
    audio.onerror = () => cleanup(0);
    audio.src = tempUrl;
  });
}

/**
 * Registra un Object URL en la caché acotada en memoria y revoca inmediatamente
 * cualquier URL antigua que sea desalojada, evitando fugas de memoria por Blobs de audio.
 */
function registerAudioUrl(cacheKey: string, url: string): void {
  if (memoryAudioUrlCache.has(cacheKey)) {
    const prevUrl = memoryAudioUrlCache.get(cacheKey);
    if (prevUrl && prevUrl !== url) {
      try {
        URL.revokeObjectURL(prevUrl);
      } catch {}
    }
    memoryAudioUrlCache.delete(cacheKey);
  } else if (memoryAudioUrlCache.size >= MAX_ACTIVE_AUDIO_URLS) {
    const oldestKey = memoryAudioUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      const evictedUrl = memoryAudioUrlCache.get(oldestKey);
      if (evictedUrl) {
        try {
          URL.revokeObjectURL(evictedUrl);
        } catch {}
      }
      memoryAudioUrlCache.delete(oldestKey);
    }
  }
  memoryAudioUrlCache.set(cacheKey, url);
}

/**
 * Revoca y libera inmediatamente todos los Object URLs de audio activos en la memoria RAM.
 */
export function revokeAllAzureAudioUrls(): void {
  for (const url of memoryAudioUrlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  memoryAudioUrlCache.clear();
}

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

interface CachedAudioRecord {
  blob: Blob;
  durationSec?: number;
}

async function getCachedAudioRecord(key: string): Promise<CachedAudioRecord | null> {
  const db = await getAudioDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve({
            blob: req.result.blob,
            durationSec: typeof req.result.durationSec === 'number' ? req.result.durationSec : undefined,
          });
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

let isPruningAudio = false;

/**
 * Poda automática LRU para evitar que la base de datos de audio crezca sin control.
 * Mantiene un límite de 120 audios y elimina audios de más de 14 días.
 */
export async function pruneAudioCacheIfNeeded(maxEntries = 120, maxAgeDays = 14): Promise<void> {
  if (isPruningAudio) return;
  isPruningAudio = true;

  try {
    const db = await getAudioDatabase();
    if (!db) return;

    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const records = (req.result as { key: string; blob: Blob; timestamp?: number }[]) || [];
      if (records.length <= maxEntries) {
        return;
      }

      const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      records.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const toDelete: string[] = [];
      for (const rec of records) {
        if (rec.timestamp && rec.timestamp < cutoffTime) {
          toDelete.push(rec.key);
        }
      }

      const remainingCount = records.length - toDelete.length;
      if (remainingCount > maxEntries) {
        const excess = remainingCount - maxEntries;
        const remainingRecords = records.filter(r => !toDelete.includes(r.key));
        for (let i = 0; i < excess; i++) {
          toDelete.push(remainingRecords[i].key);
        }
      }

      for (const k of toDelete) {
        store.delete(k);
      }
    };
  } catch (err) {
    console.warn('[AzureEdgeTTS] Error podando caché de audio:', err);
  } finally {
    isPruningAudio = false;
  }
}

async function saveAudioBlobToCache(key: string, blob: Blob, durationSec?: number): Promise<void> {
  const db = await getAudioDatabase();
  if (!db) return;

  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      key,
      blob,
      ...(typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0 ? { durationSec } : {}),
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('[AzureEdgeTTS] No se pudo guardar audio en caché persistente:', err);
  }

  // Ejecución silenciosa y en background de la poda LRU
  pruneAudioCacheIfNeeded().catch(() => {});
}

async function fetchAzureAudioBlob(
  clean: string,
  voice: string,
  rate?: string,
  pitch?: string
): Promise<Blob> {
  const fetchKey = computeCacheKey(clean, voice, rate, pitch);
  if (ongoingBlobFetches.has(fetchKey)) {
    return ongoingBlobFetches.get(fetchKey)!;
  }

  const promise = (async () => {
    let lastErr: Error | null = null;
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 16000);

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
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error en Azure Neural TTS (${response.status}): ${errorText}`);
          }

          const blob = await response.blob();
          if (!blob || blob.size === 0) {
            throw new Error('La síntesis de Azure Neural devolvió un archivo de audio vacío');
          }

          return blob;
        } catch (attemptErr: unknown) {
          lastErr = attemptErr instanceof Error ? attemptErr : new Error(String(attemptErr));
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 450));
          }
        }
      }
      throw lastErr || new Error('No se pudo sintetizar voz tras 3 intentos');
    } finally {
      ongoingBlobFetches.delete(fetchKey);
    }
  })();

  ongoingBlobFetches.set(fetchKey, promise);
  return promise;
}

/** Devuelve sincrónicamente la duración en segundos si ya fue medida en memoria para este fragmento. */
export function getCachedAudioDuration(
  text: string,
  voice: string = 'es-ES-ElviraNeural',
  rate?: string,
  pitch?: string
): number | null {
  const clean = cleanTtsText(text);
  if (!clean) return 0;
  const cacheKey = computeCacheKey(clean, voice, rate, pitch);
  return audioDurationCache.get(cacheKey) ?? null;
}

/**
 * Obtiene y mide la duración real del audio (en segundos) guardándolo en IndexedDB sin retener ObjectURLs en RAM.
 */
export async function measureAzureSpeechDuration(
  text: string,
  voice: string = 'es-ES-ElviraNeural',
  rate?: string,
  pitch?: string
): Promise<number> {
  const clean = cleanTtsText(text);
  if (!clean) return 0;

  const cacheKey = computeCacheKey(clean, voice, rate, pitch);
  const memDur = audioDurationCache.get(cacheKey);
  if (typeof memDur === 'number' && memDur > 0) {
    return memDur;
  }

  if (ongoingDurationRequests.has(cacheKey)) {
    return ongoingDurationRequests.get(cacheKey)!;
  }

  const measurePromise = (async () => {
    try {
      const cached = await getCachedAudioRecord(cacheKey);
      if (cached) {
        if (typeof cached.durationSec === 'number' && cached.durationSec > 0) {
          audioDurationCache.set(cacheKey, cached.durationSec);
          return cached.durationSec;
        }
        const measuredCached = await measureAudioBlobDuration(cached.blob);
        if (measuredCached > 0) {
          audioDurationCache.set(cacheKey, measuredCached);
          saveAudioBlobToCache(cacheKey, cached.blob, measuredCached).catch(() => {});
          return measuredCached;
        }
      }

      const blob = await fetchAzureAudioBlob(clean, voice, rate, pitch);
      const measured = await measureAudioBlobDuration(blob);
      if (measured > 0) {
        audioDurationCache.set(cacheKey, measured);
      }
      saveAudioBlobToCache(cacheKey, blob, measured > 0 ? measured : undefined).catch(() => {});
      return measured;
    } finally {
      ongoingDurationRequests.delete(cacheKey);
    }
  })();

  ongoingDurationRequests.set(cacheKey, measurePromise);
  return measurePromise;
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
  const clean = cleanTtsText(text);

  if (!clean) {
    throw new Error('Texto vacío para síntesis');
  }

  const cacheKey = computeCacheKey(clean, voice, rate, pitch);

  // 1. Memoria RAM instantánea (0ms)
  if (memoryAudioUrlCache.has(cacheKey)) {
    return memoryAudioUrlCache.get(cacheKey)!;
  }

  // 2. Caché persistente en IndexedDB (5-10ms)
  const cached = await getCachedAudioRecord(cacheKey);
  if (cached) {
    if (typeof cached.durationSec === 'number' && cached.durationSec > 0) {
      audioDurationCache.set(cacheKey, cached.durationSec);
    }
    const url = URL.createObjectURL(cached.blob);
    registerAudioUrl(cacheKey, url);
    return url;
  }

  // 3. Deduplicación de peticiones en vuelo
  if (ongoingRequests.has(cacheKey)) {
    return ongoingRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const blob = await fetchAzureAudioBlob(clean, voice, rate, pitch);

      // Persistir en IndexedDB para futuras reproducciones offline y sin latencia
      const measured = await measureAudioBlobDuration(blob);
      if (measured > 0) {
        audioDurationCache.set(cacheKey, measured);
      }
      saveAudioBlobToCache(cacheKey, blob, measured > 0 ? measured : undefined);

      const objectUrl = URL.createObjectURL(blob);
      registerAudioUrl(cacheKey, objectUrl);
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

/**
 * Limpia la memoria y la base de datos de audio cacheado.
 */
export async function clearAzureAudioCache(): Promise<void> {
  revokeAllAzureAudioUrls();
  audioDurationCache.clear();
  const db = await getAudioDatabase();
  if (!db) return;
  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (_) {}
}
