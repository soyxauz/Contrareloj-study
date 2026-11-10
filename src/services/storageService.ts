import type { DocumentAsset, StudyKit, Flashcard } from '../types';
import { isProtectedStorageKey, isCorruptedStorageKey, purgeOversizedLegacyDataFromLocalStorage } from '../utils/storageKeys';

/**
 * Servicio de persistencia de activos pesados en IndexedDB.
 * Permite almacenar imágenes y gráficos binarios fuera de LocalStorage,
 * evitando cuellos de botella de serialización JSON y bloqueos de cuota.
 */

const DB_NAME = 'TheaStorageDB';
const DB_VERSION = 2;
const ASSET_STORE = 'assets';
const SESSION_STORE = 'persistent_session';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const MAX_ASSET_CACHE_SIZE = 5;
const assetMemoryCache = new Map<string, DocumentAsset>();

function putInAssetMemoryCache(id: string, asset: DocumentAsset): void {
  if (!id || !asset) return;
  if (assetMemoryCache.has(id)) {
    assetMemoryCache.delete(id);
  } else if (assetMemoryCache.size >= MAX_ASSET_CACHE_SIZE) {
    const oldestKey = assetMemoryCache.keys().next().value;
    if (oldestKey !== undefined) {
      assetMemoryCache.delete(oldestKey);
    }
  }
  assetMemoryCache.set(id, asset);
}

/**
 * Libera de forma inmediata todos los activos pesados cacheados en la memoria RAM.
 */
export function purgeAssetMemoryCache(): void {
  assetMemoryCache.clear();
}

/**
 * Inicializa o recupera la conexión a la base de datos IndexedDB.
 */
function getDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (err) => {
        console.warn('[StorageService] Error al inicializar IndexedDB:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('[StorageService] Fallo al abrir IndexedDB:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Solicita al navegador que garantice almacenamiento persistente inmutable.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch (e) {
      console.warn('[StorageService] Error solicitando persistencia de almacenamiento:', e);
      return false;
    }
  }
  return false;
}

/**
 * Guarda un elemento de sesión en IndexedDB para recuperación permanente.
 */
export async function saveSessionItem(key: string, value: any): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SESSION_STORE, 'readwrite');
      const store = tx.objectStore(SESSION_STORE);
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Recupera un elemento de sesión desde IndexedDB.
 */
export async function getSessionItem<T = any>(key: string): Promise<T | null> {
  const db = await getDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SESSION_STORE, 'readonly');
      const store = tx.objectStore(SESSION_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.value !== undefined) {
          resolve(req.result.value as T);
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
 * Recupera todos los elementos de sesión almacenados en IndexedDB para restauración integral.
 */
export async function getAllSessionItems(): Promise<{ key: string; value: any }[]> {
  const db = await getDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SESSION_STORE, 'readonly');
      const store = tx.objectStore(SESSION_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve((req.result as { key: string; value: any }[]) || []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Elimina un elemento de sesión de IndexedDB al cerrar sesión explícitamente.
 */
export async function removeSessionItem(key: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SESSION_STORE, 'readwrite');
      const store = tx.objectStore(SESSION_STORE);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Guarda un lote de activos en IndexedDB sin retenerlos indiscriminadamente en la memoria RAM global.
 * Divide los guardados en transacciones seguras por lotes de 30 para evitar saturación de memoria.
 */
export async function saveAssetsToIndexedDB(assets: DocumentAsset[]): Promise<void> {
  if (!assets || assets.length === 0) return;

  const db = await getDatabase();
  if (!db) return;

  const validAssets = assets.filter(a => a.id && a.dataUrl);
  if (validAssets.length === 0) return;

  const CHUNK_SIZE = 30;
  for (let c = 0; c < validAssets.length; c += CHUNK_SIZE) {
    const chunk = validAssets.slice(c, c + CHUNK_SIZE);
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(ASSET_STORE, 'readwrite');
        const store = tx.objectStore(ASSET_STORE);

        for (let i = 0; i < chunk.length; i++) {
          store.put(chunk[i]);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => {
          console.warn('[StorageService] Error en transacción de guardado de activos:', e);
          resolve();
        };
        tx.onabort = () => resolve();
      } catch (e) {
        console.warn('[StorageService] Excepción al guardar activos:', e);
        resolve();
      }
    });
  }
}

/**
 * Extrae y persiste automáticamente todos los activos pesados de una colección de kits.
 */
export async function saveAssetsFromKits(kits: StudyKit[]): Promise<void> {
  const assetsToSave: DocumentAsset[] = [];

  for (let i = 0; i < kits.length; i++) {
    const kit = kits[i];
    if (kit.assets && kit.assets.length > 0) {
      for (let j = 0; j < kit.assets.length; j++) {
        const a = kit.assets[j];
        if (a.dataUrl) assetsToSave.push(a);
      }
    }
    if (kit.questions && kit.questions.length > 0) {
      for (let j = 0; j < kit.questions.length; j++) {
        const q = kit.questions[j];
        if (q.sourceAsset && q.sourceAsset.dataUrl) {
          assetsToSave.push(q.sourceAsset);
        }
      }
    }
    if (kit.flashcards && kit.flashcards.length > 0) {
      for (let j = 0; j < kit.flashcards.length; j++) {
        const f = kit.flashcards[j];
        if (f.sourceAsset && f.sourceAsset.dataUrl) {
          assetsToSave.push(f.sourceAsset);
        }
      }
    }
  }

  if (assetsToSave.length > 0) {
    await saveAssetsToIndexedDB(assetsToSave);
  }
}

/**
 * Recupera todos los activos almacenados en IndexedDB para sincronización en la nube.
 * No retiene los objetos binarios en la caché en RAM global para proteger la memoria.
 */
export async function getAllStoredAssets(): Promise<DocumentAsset[]> {
  const db = await getDatabase();
  if (!db) {
    return Array.from(assetMemoryCache.values());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const store = tx.objectStore(ASSET_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const assets = (req.result as DocumentAsset[]) || [];
        resolve(assets);
      };

      req.onerror = () => {
        resolve(Array.from(assetMemoryCache.values()));
      };
    } catch {
      resolve(Array.from(assetMemoryCache.values()));
    }
  });
}

/**
 * Recupera únicamente los identificadores (claves) de los activos almacenados en IndexedDB.
 * Es ultra rápido (O(1) memoria) y evita cargar los megabytes de imágenes base64 a la RAM.
 */
export async function getAllStoredAssetKeys(): Promise<string[]> {
  const db = await getDatabase();
  if (!db) {
    return Array.from(assetMemoryCache.keys());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const store = tx.objectStore(ASSET_STORE);
      const req = store.getAllKeys();

      req.onsuccess = () => {
        const keys = ((req.result || []) as (string | number)[]).map(String);
        resolve(keys);
      };

      req.onerror = () => {
        resolve(Array.from(assetMemoryCache.keys()));
      };
    } catch {
      resolve(Array.from(assetMemoryCache.keys()));
    }
  });
}

/**
 * Recupera un activo por su identificador único utilizando un LRU cache ultraligero (máx 10 elementos).
 */
export async function getAssetById(id: string): Promise<DocumentAsset | null> {
  if (assetMemoryCache.has(id)) {
    const item = assetMemoryCache.get(id)!;
    assetMemoryCache.delete(id);
    assetMemoryCache.set(id, item);
    return item;
  }

  const db = await getDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const store = tx.objectStore(ASSET_STORE);
      const req = store.get(id);

      req.onsuccess = () => {
        const result = (req.result as DocumentAsset) || null;
        if (result && result.id) {
          putInAssetMemoryCache(result.id, result);
        }
        resolve(result);
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Obtiene un mapa de activos a partir de un conjunto de IDs con gestión acotada de memoria LRU.
 */
export async function getAssetsMap(ids: string[]): Promise<Map<string, DocumentAsset>> {
  const result = new Map<string, DocumentAsset>();
  const missingIds: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (assetMemoryCache.has(id)) {
      const item = assetMemoryCache.get(id)!;
      assetMemoryCache.delete(id);
      assetMemoryCache.set(id, item);
      result.set(id, item);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length === 0) return result;

  const db = await getDatabase();
  if (!db) return result;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const store = tx.objectStore(ASSET_STORE);

      let pending = missingIds.length;
      for (let i = 0; i < missingIds.length; i++) {
        const id = missingIds[i];
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            const asset = req.result as DocumentAsset;
            putInAssetMemoryCache(id, asset);
            result.set(id, asset);
          }
          pending--;
          if (pending === 0) resolve(result);
        };
        req.onerror = () => {
          pending--;
          if (pending === 0) resolve(result);
        };
      }
    } catch {
      resolve(result);
    }
  });
}

export type DriveAssetDownloader = (assetIds: string[]) => Promise<Map<string, DocumentAsset>>;
let driveAssetDownloader: DriveAssetDownloader | null = null;

export function registerDriveAssetDownloader(downloader: DriveAssetDownloader): void {
  driveAssetDownloader = downloader;
}

/**
 * Hidrata un kit restaurando los dataUrls de los activos desde IndexedDB o descargándolos de Drive si faltan.
 */
export async function hydrateKitAssets(kit: StudyKit): Promise<StudyKit> {
  const assetIds: string[] = [];

  if (kit.assets && kit.assets.length > 0) {
    for (let i = 0; i < kit.assets.length; i++) {
      const a = kit.assets[i];
      if (!a.dataUrl && a.id) assetIds.push(a.id);
    }
  }

  if (kit.questions && kit.questions.length > 0) {
    for (let i = 0; i < kit.questions.length; i++) {
      const q = kit.questions[i];
      if (q.sourceAsset && !q.sourceAsset.dataUrl && q.sourceAsset.id) {
        assetIds.push(q.sourceAsset.id);
      }
    }
  }

  if (assetIds.length === 0) return kit;

  const assetsMap = await getAssetsMap(assetIds);

  // Si algunos activos no se encontraron en IndexedDB, descargarlos prioritariamente de Google Drive
  const stillMissing = assetIds.filter(id => !assetsMap.has(id) || !assetsMap.get(id)?.dataUrl);
  if (stillMissing.length > 0 && driveAssetDownloader) {
    try {
      const driveMap = await driveAssetDownloader(stillMissing);
      if (driveMap && driveMap.size > 0) {
        driveMap.forEach((asset, id) => {
          if (asset && asset.dataUrl) {
            assetsMap.set(id, asset);
            putInAssetMemoryCache(id, asset);
          }
        });
      }
    } catch (err) {
      console.warn('[StorageService] Error descargando activos prioritarios desde Drive:', err);
    }
  }

  const hydratedAssets = kit.assets?.map((a) => {
    if (!a.dataUrl && assetsMap.has(a.id)) {
      return { ...a, dataUrl: assetsMap.get(a.id)!.dataUrl };
    }
    return a;
  });

  const hydratedQuestions = kit.questions?.map((q) => {
    if (q.sourceAsset && !q.sourceAsset.dataUrl && assetsMap.has(q.sourceAsset.id)) {
      return {
        ...q,
        sourceAsset: {
          ...q.sourceAsset,
          dataUrl: assetsMap.get(q.sourceAsset.id)!.dataUrl,
        },
      };
    }
    return q;
  });

  return {
    ...kit,
    assets: hydratedAssets,
    questions: hydratedQuestions,
  };
}

/**
 * Hidrata una colección completa de kits restaurando activos desde IndexedDB.
 */
export async function hydrateKitsAssets(kits: StudyKit[]): Promise<StudyKit[]> {
  const hydrated = await Promise.all(kits.map((k) => hydrateKitAssets(k)));
  return hydrated;
}

/**
 * Elimina las cadenas pesadas de datos base64 para aligerar la persistencia en LocalStorage.
 * Los metadatos de los activos se conservan intactos.
 */
export function stripHeavyAssetsForLocalStorage(kits: StudyKit[]): StudyKit[] {
  return kits.map((kit) => ({
    ...kit,
    // Eliminar sourceText y chunks del almacenamiento en LocalStorage para garantizar que nunca exceda 5MB
    sourceText: undefined,
    chunks: undefined,
    podcast: kit.podcast ? {
      id: kit.podcast.id,
      title: kit.podcast.title,
      duration: kit.podcast.duration,
      hosts: kit.podcast.hosts,
      dialogue: (kit.podcast.dialogue || []).slice(0, 5),
      format: kit.podcast.format,
      durationMode: kit.podcast.durationMode,
      orientation: kit.podcast.orientation,
    } : null,
    sourceMaterials: kit.sourceMaterials?.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      size: m.size,
      rawText: undefined,
    })),
    assets: kit.assets?.map((a) => {
      if (a.dataUrl && a.dataUrl.length > 500) {
        const { dataUrl: _, ...rest } = a;
        return rest;
      }
      return a;
    }),
    questions: kit.questions?.map((q) => {
      if (q.sourceAsset && q.sourceAsset.dataUrl && q.sourceAsset.dataUrl.length > 500) {
        const { dataUrl: _, ...restAsset } = q.sourceAsset;
        return {
          ...q,
          sourceAsset: restAsset,
        };
      }
      return q;
    }),
    flashcards: kit.flashcards?.map((f) => {
      if (f.sourceAsset && f.sourceAsset.dataUrl && f.sourceAsset.dataUrl.length > 500) {
        const { dataUrl: _, ...restAsset } = f.sourceAsset;
        return {
          ...f,
          sourceAsset: restAsset,
        };
      }
      return f;
    }),
  }));
}

/**
 * Aligera un kit individual removiendo las cadenas binarias base64 y el texto fuente masivo
 * de la memoria de React una vez que no se encuentra en visualización activa.
 * Los datos permanecen a salvo de forma permanente en IndexedDB.
 */
export function stripAssetDataUrlsFromKit(kit: StudyKit): StudyKit {
  if (!kit) return kit;
  return {
    ...kit,
    sourceText: kit.sourceText && kit.sourceText.length > 500 ? kit.sourceText.slice(0, 500) : kit.sourceText,
    sourceMaterials: Array.isArray(kit.sourceMaterials)
      ? kit.sourceMaterials.map(m => {
          if (m && m.rawText && m.rawText.length > 500) {
            return { ...m, rawText: m.rawText.slice(0, 500) };
          }
          return m;
        })
      : kit.sourceMaterials,
    assets: kit.assets?.map((a) => {
      if (a.dataUrl && a.dataUrl.length > 500) {
        const { dataUrl: _, ...rest } = a;
        return rest;
      }
      return a;
    }),
    questions: kit.questions?.map((q) => {
      if (q.sourceAsset && q.sourceAsset.dataUrl && q.sourceAsset.dataUrl.length > 500) {
        const { dataUrl: _, ...restAsset } = q.sourceAsset;
        return {
          ...q,
          sourceAsset: restAsset,
        };
      }
      return q;
    }),
    flashcards: kit.flashcards?.map((f) => {
      if (f.sourceAsset && f.sourceAsset.dataUrl && f.sourceAsset.dataUrl.length > 500) {
        const { dataUrl: _, ...restAsset } = f.sourceAsset;
        return {
          ...f,
          sourceAsset: restAsset,
        };
      }
      return f;
    }),
  };
}

/**
 * Valida si un objeto StudyKit es válido y no está corrupto.
 */
export function isCorruptedKit(k: unknown): boolean {
  if (!k || typeof k !== 'object') return true;
  const kit = k as Partial<StudyKit>;
  if (!kit.id || typeof kit.id !== 'string') return true;
  if (!kit.title || typeof kit.title !== 'string') return true;
  if (!Array.isArray(kit.questions)) return true;
  if (kit.id.includes('digitallibrary.un.org') || kit.title.toLowerCase().includes('endstream')) {
    return true;
  }
  return false;
}

/**
 * Estructura liviana del índice de kits en LocalStorage para arranque instantáneo sin saturar cuota.
 */
export interface StudyKitIndexItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  updatedAt: number;
  category?: string;
  questionsCount: number;
  flashcardsCount?: number;
  pendingDriveSync?: boolean;
}

export const RETIRED_TEST_KIT_IDS: readonly string[] = ['bio-respiration', 'cs-algorithms', 'cs-algo'];
const DELETED_KITS_KEY = 'thea_deleted_kit_ids';

/**
 * Obtiene el conjunto de identificadores de kits eliminados explícitamente por el usuario
 * e incluye de forma fija los kits de prueba retirados.
 */
export function getDeletedKitIds(): Set<string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DELETED_KITS_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    const set = new Set<string>(Array.isArray(arr) ? arr : []);
    for (const id of RETIRED_TEST_KIT_IDS) {
      set.add(id);
    }
    return set;
  } catch {
    return new Set<string>(RETIRED_TEST_KIT_IDS);
  }
}

/**
 * Registra un identificador en la lista negra de kits eliminados para evitar resurrección en fusiones.
 */
export function recordDeletedKitId(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedKitIds();
    set.add(id);
    const arr = Array.from(set);
    if (typeof localStorage !== 'undefined') {
      safeLocalStorageSetItem(DELETED_KITS_KEY, JSON.stringify(arr));
    }
    saveSessionItem(DELETED_KITS_KEY, arr).catch(() => {});
  } catch (e) {
    console.warn('[StorageService] Error al registrar kit eliminado:', e);
  }
}

/**
 * Registra múltiples identificadores en la lista negra de kits eliminados.
 */
export function recordDeletedKitIds(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const set = getDeletedKitIds();
    for (const id of ids) {
      if (id) set.add(id);
    }
    const arr = Array.from(set);
    if (typeof localStorage !== 'undefined') {
      safeLocalStorageSetItem(DELETED_KITS_KEY, JSON.stringify(arr));
    }
    saveSessionItem(DELETED_KITS_KEY, arr).catch(() => {});
  } catch (e) {
    console.warn('[StorageService] Error al registrar kits eliminados en lote:', e);
  }
}

/**
 * Guarda kits completos en IndexedDB esperando a que la transacción culmine (cero demoras / sin pérdidas).
 * Protege estrictamente los dataUrls de los activos preservando lo ya almacenado en IndexedDB si la entrada viene aligerada.
 */
export async function saveKitsToIndexedDB(key: string, kits: StudyKit[]): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  const clean = Array.isArray(kits) ? kits.filter(k => !isCorruptedKit(k)) : [];

  let payload = clean;
  try {
    const existingKits = await getKitsFromIndexedDB(key).catch(() => null);
    if (existingKits && existingKits.length > 0) {
      payload = mergeKitsByUpdatedAt(existingKits, clean);
    }
  } catch {}

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SESSION_STORE, 'readwrite');
      const store = tx.objectStore(SESSION_STORE);
      store.put({ key, value: payload, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn('[StorageService] Error en transacción al guardar kits en IndexedDB:', e);
        resolve();
      };
      tx.onabort = () => resolve();
    } catch (err) {
      console.warn('[StorageService] Excepción al guardar kits en IndexedDB:', err);
      resolve();
    }
  });
}

/**
 * Recupera kits completos desde IndexedDB para el usuario actual o invitado.
 */
export async function getKitsFromIndexedDB(key: string): Promise<StudyKit[] | null> {
  const res = await getSessionItem<StudyKit[]>(key);
  if (res && Array.isArray(res) && res.length > 0) {
    const clean = res.filter(k => !isCorruptedKit(k));
    if (clean.length > 0) return clean;
  }
  return null;
}

/**
 * Cache liviano en memoria para evitar escanear y deserializar LocalStorage
 * repetitivamente por cada tarjeta individual durante una fusión.
 */
const fcMasteryCache = new Map<string, { map: Record<string, 'to-learn' | 'known' | 'mastered'>; timestamp: number }>();

/**
 * Consulta la memoria persistente de flashcards para garantizar que las tarjetas
 * marcadas como dominadas o conocidas nunca retrocedan durante una fusion.
 */
function getSavedFlashcardMastery(kitId: string, cardKey: string): ('to-learn' | 'known' | 'mastered') | null {
  if (typeof localStorage === 'undefined' || !kitId || !cardKey) return null;
  try {
    const cleanKey = cardKey.trim();
    const lowerKey = cleanKey.toLowerCase();

    // 1. Revisar si tenemos el mapa de este kit en caché reciente (< 2.5s)
    const cached = fcMasteryCache.get(kitId);
    if (cached && (Date.now() - cached.timestamp < 2500)) {
      const m = cached.map;
      return m[cardKey] || m[cleanKey] || m[lowerKey] || null;
    }

    // 2. Si no está en caché, buscar la clave directamente
    let foundMap: Record<string, any> | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('_fc_mem_') && k.endsWith(`_${kitId}`)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.masteryMap) {
              foundMap = parsed.masteryMap;
              break;
            }
          } catch {}
        }
      }
    }

    if (foundMap) {
      fcMasteryCache.set(kitId, { map: foundMap, timestamp: Date.now() });
      return foundMap[cardKey] || foundMap[cleanKey] || foundMap[lowerKey] || null;
    }
  } catch {}
  return null;
}

/**
 * Fusión acumulativa estricta por ID y marca temporal updatedAt (el más reciente gana).
 * Respeta la lista negra de kits eliminados y PRESERVA SIEMPRE los dataUrls de activos para que nunca se deshidraten.
 */
export function mergeKitsByUpdatedAt(
  listA: StudyKit[],
  listB: StudyKit[],
  deletedIds?: Set<string>
): StudyKit[] {
  const delSet = deletedIds || getDeletedKitIds();
  const map = new Map<string, StudyKit>();

  const addOrMerge = (kit: StudyKit) => {
    if (!kit || isCorruptedKit(kit)) return;
    if (delSet.has(kit.id)) return;

    const existing = map.get(kit.id);
    if (!existing) {
      map.set(kit.id, {
        ...kit,
        updatedAt: kit.updatedAt || Date.now(),
      });
      return;
    }

    const existingTime = existing.updatedAt || 0;
    const incomingTime = kit.updatedAt || 0;

    // Preservar siempre las listas con contenido frente a esquemas vacíos o parciales
    const rawQuestions = (kit.questions && kit.questions.length > 0)
      ? ((existing.questions && existing.questions.length > kit.questions.length && existingTime > incomingTime) ? existing.questions : kit.questions)
      : (existing.questions || []);

    const mergedQuestions = rawQuestions.map(q => {
      if (q.sourceAsset && !q.sourceAsset.dataUrl) {
        const fromExist = existing.questions?.find(eq => eq.id === q.id || eq.question === q.question)?.sourceAsset;
        if (fromExist?.dataUrl) {
          return { ...q, sourceAsset: { ...q.sourceAsset, dataUrl: fromExist.dataUrl } };
        }
      }
      return q;
    });

    const rawFlashcards = (kit.flashcards && kit.flashcards.length > 0)
      ? ((existing.flashcards && existing.flashcards.length > kit.flashcards.length && existingTime > incomingTime) ? existing.flashcards : kit.flashcards)
      : (existing.flashcards || []);

    const existingFlashcardsMap = new Map((existing.flashcards || []).map(f => [f.id || f.term, f]));
    const incomingFlashcardsMap = new Map((kit.flashcards || []).map(f => [f.id || f.term, f]));

    const mergedFlashcards = rawFlashcards.map(f => {
      const fromExist = existingFlashcardsMap.get(f.id || f.term);
      const fromIn = incomingFlashcardsMap.get(f.id || f.term);
      const cardKey = f.id || f.term;
      const dedicatedMastery = getSavedFlashcardMastery(kit.id, cardKey);
      const mastery = dedicatedMastery || (incomingTime >= existingTime
        ? (fromIn?.mastery || f.mastery || fromExist?.mastery || 'to-learn')
        : (fromExist?.mastery || f.mastery || fromIn?.mastery || 'to-learn'));

      let sourceAsset = f.sourceAsset;
      if (sourceAsset && !sourceAsset.dataUrl && fromExist?.sourceAsset?.dataUrl) {
        sourceAsset = { ...sourceAsset, dataUrl: fromExist.sourceAsset.dataUrl };
      } else if (!sourceAsset && fromExist?.sourceAsset) {
        sourceAsset = fromExist.sourceAsset;
      }
      return {
        ...fromExist,
        ...f,
        mastery,
        sourceAsset,
      };
    });

    const existingArchived = existing.archivedFlashcards || [];
    const incomingArchived = kit.archivedFlashcards || [];
    const archivedMap = new Map<string, Flashcard>();
    existingArchived.forEach(c => archivedMap.set(c.id || c.term, c));
    incomingArchived.forEach(c => archivedMap.set(c.id || c.term, c));
    const mergedArchived = Array.from(archivedMap.values());

    // En activos, preservar estrictamente cualquier dataUrl ya cargado o existente para no deshidratar
    const candidateAssets = (kit.assets && kit.assets.length > 0)
      ? ((existing.assets && existing.assets.length > kit.assets.length && existingTime > incomingTime) ? existing.assets : kit.assets)
      : (existing.assets || []);

    const existingAssetsMap = new Map((existing.assets || []).map(a => [a.id, a]));
    const incomingAssetsMap = new Map((kit.assets || []).map(a => [a.id, a]));

    const mergedAssets = candidateAssets.map(a => {
      const fromEx = existingAssetsMap.get(a.id);
      const fromIn = incomingAssetsMap.get(a.id);
      const bestDataUrl = a.dataUrl || fromEx?.dataUrl || fromIn?.dataUrl;
      return {
        ...fromEx,
        ...fromIn,
        ...a,
        dataUrl: bestDataUrl,
      };
    });

    const mergedGuide = (kit.studyGuideMarkdown && kit.studyGuideMarkdown.length > 0)
      ? (incomingTime >= existingTime ? kit.studyGuideMarkdown : (existing.studyGuideMarkdown || kit.studyGuideMarkdown))
      : (existing.studyGuideMarkdown || '');

    const mergedPodcast = (incomingTime >= existingTime && kit.podcast)
      ? kit.podcast
      : (existing.podcast || kit.podcast || null);

    if (incomingTime >= existingTime) {
      map.set(kit.id, {
        ...existing,
        ...kit,
        updatedAt: incomingTime,
        questions: mergedQuestions,
        flashcards: mergedFlashcards,
        archivedFlashcards: mergedArchived,
        assets: mergedAssets,
        studyGuideMarkdown: mergedGuide,
        podcast: mergedPodcast,
      });
    } else {
      map.set(kit.id, {
        ...kit,
        ...existing,
        updatedAt: existingTime,
        questions: mergedQuestions,
        flashcards: mergedFlashcards,
        archivedFlashcards: mergedArchived,
        assets: mergedAssets,
        studyGuideMarkdown: mergedGuide,
        podcast: mergedPodcast,
      });
    }
  };

  if (Array.isArray(listA)) {
    for (const k of listA) addOrMerge(k);
  }
  if (Array.isArray(listB)) {
    for (const k of listB) addOrMerge(k);
  }

  return Array.from(map.values());
}

/**
 * Guarda un elemento en LocalStorage de manera protegida contra QuotaExceededError.
 * Si LocalStorage se satura (5MB):
 * 1. Intenta purgar claves secundarias no críticas (cachés temporales, logs, etc.).
 * 2. Si es una sesión o un kit, poda historiales largos.
 * 3. Si aún así la cuota está llena, asegura la persistencia en IndexedDB sin fallar ni interrumpir al usuario.
 */
export function safeLocalStorageSetItem(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      err?.number === -2147024882 ||
      err?.message?.toLowerCase().includes('quota');

    if (!isQuota) {
      console.warn(`[StorageService] Error inesperado guardando clave '${key}':`, err);
      try {
        saveSessionItem(key, value).catch(() => {});
      } catch {}
      return false;
    }

    console.warn(`[StorageService] Alerta de cuota en LocalStorage al guardar '${key}'. Iniciando purga automática.`);

    // 1. Ejecutar purga de claves corruptas y activos sobredimensionados
    try {
      purgeOversizedLegacyDataFromLocalStorage();
      localStorage.setItem(key, value);
      return true;
    } catch {}

    // 2. Desalojo masivo de sesiones de kits no activos (están 100% preservadas en IndexedDB)
    try {
      const activeKitId = localStorage.getItem('thea_current_kit_id') || localStorage.getItem('thea_currentkit_id') || '';
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;

        if (isCorruptedStorageKey(k)) {
          keysToRemove.push(k);
          continue;
        }

        if (
          (k.startsWith('thea_ss_mem_') || k.startsWith('thea_fc_mem_')) &&
          (!activeKitId || !k.includes(activeKitId))
        ) {
          keysToRemove.push(k);
          continue;
        }

        if (
          k.startsWith('contrareloj_azure_') ||
          k.startsWith('thea_temp_') ||
          k.startsWith('thea_cache_') ||
          k.includes('_log_') ||
          k.includes('disambig')
        ) {
          keysToRemove.push(k);
          continue;
        }
      }

      for (const rk of keysToRemove) {
        try { localStorage.removeItem(rk); } catch {}
      }

      localStorage.setItem(key, value);
      return true;
    } catch {}

    // 3. Purgar kits completos legacy y snapshots secundarios en LocalStorage (preservados 100% en IndexedDB)
    try {
      const keysToEvict: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          (k.startsWith('thea_user_kits_') && !k.startsWith('thea_user_kits_index_')) ||
          k === 'thea_guest_kits' ||
          k === 'thea_study_kits_v2' ||
          (k.startsWith('thea_global_stats_snap_') && k !== 'thea_global_stats_snap_active')
        ) {
          keysToEvict.push(k);
          continue;
        }
        if (!isProtectedStorageKey(k)) {
          const val = localStorage.getItem(k);
          if (val && (val.includes('data:image/') || val.includes('data:application/pdf') || val.length > 5000)) {
            keysToEvict.push(k);
          }
        }
      }
      for (const k of keysToEvict) {
        try { localStorage.removeItem(k); } catch {}
      }

      localStorage.setItem(key, value);
      return true;
    } catch {}

    // 4. Fallback definitivo: Guardar íntegro en IndexedDB sin fallar jamás
    try {
      const parsedVal = JSON.parse(value);
      saveSessionItem(key, parsedVal).catch(() => {});
    } catch {
      saveSessionItem(key, value).catch(() => {});
    }
    console.info(`[StorageService] Clave '${key}' preservada en IndexedDB como salvaguarda ante cuota completa.`);
    return true;
  }
}

/**
 * Garbage Collector de Activos Huérfanos:
 * Inspecciona el almacén de activos en IndexedDB y elimina cualquier imagen o gráfico
 * que pertenezca a kits que ya fueron eliminados, liberando espacio automáticamente.
 */
export async function cleanOrphanAssetsFromIndexedDB(activeKits: StudyKit[]): Promise<{ deletedCount: number }> {
  const db = await getDatabase();
  if (!db || !Array.isArray(activeKits)) return { deletedCount: 0 };

  const validAssetIds = new Set<string>();

  for (const kit of activeKits) {
    if (kit.assets && Array.isArray(kit.assets)) {
      for (const a of kit.assets) {
        if (a && a.id) validAssetIds.add(a.id);
      }
    }
    if (kit.questions && Array.isArray(kit.questions)) {
      for (const q of kit.questions) {
        if (q?.sourceAsset?.id) validAssetIds.add(q.sourceAsset.id);
      }
    }
    if (kit.flashcards && Array.isArray(kit.flashcards)) {
      for (const f of kit.flashcards) {
        if (f?.sourceAsset?.id) validAssetIds.add(f.sourceAsset.id);
      }
    }
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ASSET_STORE, 'readwrite');
      const store = tx.objectStore(ASSET_STORE);
      const req = store.getAllKeys();

      req.onsuccess = () => {
        const allKeys = (req.result as string[]) || [];
        let deletedCount = 0;

        for (const key of allKeys) {
          if (!validAssetIds.has(key)) {
            store.delete(key);
            deletedCount++;
            if (assetMemoryCache.has(key)) {
              assetMemoryCache.delete(key);
            }
          }
        }

        tx.oncomplete = () => {
          if (deletedCount > 0) {
            console.info(`[StorageService Garbage Collector] Se depuraron ${deletedCount} activos huérfanos de IndexedDB.`);
          }
          resolve({ deletedCount });
        };
        tx.onerror = () => resolve({ deletedCount: 0 });
      };

      req.onerror = () => resolve({ deletedCount: 0 });
    } catch (e) {
      console.warn('[StorageService] Error en Garbage Collector de activos:', e);
      resolve({ deletedCount: 0 });
    }
  });
}

/**
 * Consulta la estimación de uso y cuota global del navegador mediante la Storage API.
 */
export async function getStorageUsageEstimate(): Promise<{ usageMB: number; quotaMB: number; percentUsed: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usageMB = Math.round(((estimate.usage || 0) / (1024 * 1024)) * 10) / 10;
      const quotaMB = Math.round(((estimate.quota || 0) / (1024 * 1024)) * 10) / 10;
      const percentUsed = quotaMB > 0 ? Math.round((usageMB / quotaMB) * 1000) / 10 : 0;
      return { usageMB, quotaMB, percentUsed };
    } catch {}
  }
  return { usageMB: 0, quotaMB: 0, percentUsed: 0 };
}

/**
 * Gestiona silenciosamente cuando la cuota de LocalStorage ha sido alcanzada,
 * apoyándose automáticamente en IndexedDB sin interrumpir al usuario en la interfaz.
 */
export function notifyQuotaExceeded(err: unknown): void {
  console.warn('[StorageService] QuotaExceeded gestionada silenciosamente. Los datos permanecen íntegros en IndexedDB:', err);
}

