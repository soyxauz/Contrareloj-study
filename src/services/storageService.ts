import type { DocumentAsset, StudyKit } from '../types';

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
const assetMemoryCache = new Map<string, DocumentAsset>();

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
 * Guarda un lote de activos en IndexedDB y los sincroniza en la memoria rápida.
 */
export async function saveAssetsToIndexedDB(assets: DocumentAsset[]): Promise<void> {
  if (!assets || assets.length === 0) return;

  // Actualizar memoria inmediata
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (a.id && a.dataUrl) {
      assetMemoryCache.set(a.id, a);
    }
  }

  const db = await getDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ASSET_STORE, 'readwrite');
      const store = tx.objectStore(ASSET_STORE);

      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        if (a.id && a.dataUrl) {
          store.put(a);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('[StorageService] Error en transacción de guardado de activos');
        resolve();
      };
    } catch (e) {
      console.warn('[StorageService] Excepción al guardar activos:', e);
      resolve();
    }
  });
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
        for (let i = 0; i < assets.length; i++) {
          const a = assets[i];
          if (a.id && a.dataUrl) {
            assetMemoryCache.set(a.id, a);
          }
        }
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
 * Recupera un activo por su identificador único.
 */
export async function getAssetById(id: string): Promise<DocumentAsset | null> {
  if (assetMemoryCache.has(id)) {
    return assetMemoryCache.get(id) || null;
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
          assetMemoryCache.set(result.id, result);
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
 * Obtiene un mapa de activos a partir de un conjunto de IDs.
 */
export async function getAssetsMap(ids: string[]): Promise<Map<string, DocumentAsset>> {
  const result = new Map<string, DocumentAsset>();
  const missingIds: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (assetMemoryCache.has(id)) {
      result.set(id, assetMemoryCache.get(id)!);
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
            assetMemoryCache.set(id, asset);
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
            assetMemoryCache.set(id, asset);
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
    sourceMaterials: kit.sourceMaterials?.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      size: m.size,
      rawText: undefined,
    })),
    assets: kit.assets?.map((a) => {
      if (a.dataUrl && a.dataUrl.length > 1000) {
        const { dataUrl: _, ...rest } = a;
        return rest;
      }
      return a;
    }),
    questions: kit.questions?.map((q) => {
      if (q.sourceAsset && q.sourceAsset.dataUrl && q.sourceAsset.dataUrl.length > 1000) {
        const { dataUrl: _, ...restAsset } = q.sourceAsset;
        return {
          ...q,
          sourceAsset: restAsset,
        };
      }
      return q;
    }),
    flashcards: kit.flashcards?.map((f) => {
      if (f.sourceAsset && f.sourceAsset.dataUrl && f.sourceAsset.dataUrl.length > 1000) {
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
  updatedAt: number;
  category?: string;
  questionsCount: number;
  flashcardsCount?: number;
  pendingDriveSync?: boolean;
}

const DELETED_KITS_KEY = 'thea_deleted_kit_ids';

/**
 * Obtiene el conjunto de identificadores de kits eliminados explícitamente por el usuario.
 */
export function getDeletedKitIds(): Set<string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DELETED_KITS_KEY) : null;
    if (!raw) return new Set<string>();
    const arr = JSON.parse(raw);
    return new Set<string>(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set<string>();
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
      localStorage.setItem(DELETED_KITS_KEY, JSON.stringify(arr));
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
      localStorage.setItem(DELETED_KITS_KEY, JSON.stringify(arr));
    }
    saveSessionItem(DELETED_KITS_KEY, arr).catch(() => {});
  } catch (e) {
    console.warn('[StorageService] Error al registrar kits eliminados en lote:', e);
  }
}

/**
 * Guarda kits completos en IndexedDB esperando a que la transacción culmine (cero demoras / sin pérdidas).
 */
export async function saveKitsToIndexedDB(key: string, kits: StudyKit[]): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  const clean = Array.isArray(kits) ? kits.filter(k => !isCorruptedKit(k)) : [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SESSION_STORE, 'readwrite');
      const store = tx.objectStore(SESSION_STORE);
      store.put({ key, value: clean, updatedAt: Date.now() });
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
 * Fusión acumulativa estricta por ID y marca temporal updatedAt (el más reciente gana).
 * Respeta la lista negra de kits eliminados para no reintroducir kits borrados intencionalmente.
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
    const mergedQuestions = (kit.questions && kit.questions.length > 0)
      ? ((existing.questions && existing.questions.length > kit.questions.length && existingTime > incomingTime) ? existing.questions : kit.questions)
      : (existing.questions || []);

    const mergedFlashcards = (kit.flashcards && kit.flashcards.length > 0)
      ? ((existing.flashcards && existing.flashcards.length > kit.flashcards.length && existingTime > incomingTime) ? existing.flashcards : kit.flashcards)
      : (existing.flashcards || []);

    const mergedAssets = (kit.assets && kit.assets.length > 0)
      ? ((existing.assets && existing.assets.length > kit.assets.length && existingTime > incomingTime) ? existing.assets : kit.assets)
      : (existing.assets || []);

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
 * Gestiona silenciosamente cuando la cuota de LocalStorage ha sido alcanzada,
 * apoyándose automáticamente en IndexedDB sin interrumpir al usuario en la interfaz.
 */
export function notifyQuotaExceeded(err: unknown): void {
  console.warn('[StorageService] QuotaExceeded gestionada silenciosamente. Los datos permanecen íntegros en IndexedDB:', err);
}

