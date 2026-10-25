import type { StudyKit } from '../types';
import { DEFAULT_STUDY_KITS } from '../data/defaultKits';
import {
  saveAssetsFromKits,
  stripHeavyAssetsForLocalStorage,
  isCorruptedKit,
  saveKitsToIndexedDB,
  getKitsFromIndexedDB,
  mergeKitsByUpdatedAt,
  getDeletedKitIds,
  notifyQuotaExceeded,
  type StudyKitIndexItem,
} from './storageService';

export const inMemoryKitsCache = new Map<string, StudyKit[]>();

export const kitRepositoryService = {
  /**
   * Obtiene los kits de estudio del usuario actual o de la sesion de invitado de forma inmediata y sincronica.
   */
  getUserKits(userId: string | null): StudyKit[] {
    try {
      const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';

      // 1. Memoria rapida inmediata
      if (inMemoryKitsCache.has(key)) {
        const mem = inMemoryKitsCache.get(key);
        if (mem && Array.isArray(mem) && mem.length > 0) {
          const cleanMem = mem.filter(k => !isCorruptedKit(k));
          if (cleanMem.length > 0) return cleanMem;
        }
      }

      const deletedIds = getDeletedKitIds();

      // 2. Intentar leer kits completos o aligerados de LocalStorage
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (stored !== null) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const clean = parsed.filter(k => !isCorruptedKit(k) && !deletedIds.has(k.id));
            if (clean.length > 0) {
              inMemoryKitsCache.set(key, clean);
              return clean;
            }
          }
        } catch {}
      }

      // 3. Fallback a indice liviano en LocalStorage si los kits completos fueron movidos a IndexedDB
      const indexKey = userId ? `thea_user_kits_index_${userId}` : 'thea_guest_kits_index';
      const storedIndex = typeof localStorage !== 'undefined' ? localStorage.getItem(indexKey) : null;
      if (storedIndex) {
        try {
          const indexItems: StudyKitIndexItem[] = JSON.parse(storedIndex);
          if (Array.isArray(indexItems) && indexItems.length > 0) {
            const cleanIndex = indexItems.filter(item => item && item.id && !deletedIds.has(item.id));
            if (cleanIndex.length > 0) {
              const existingMem = inMemoryKitsCache.get(key);
              if (existingMem && existingMem.some(k => k.questions && k.questions.length > 0)) {
                return existingMem;
              }
              const partialKits: StudyKit[] = cleanIndex.map(item => ({
                id: item.id,
                title: item.title,
                category: item.category || 'General',
                description: item.description || '',
                icon: item.icon || 'BookOpen',
                color: item.color || 'from-blue-500 to-indigo-600',
                questions: [],
                flashcards: [],
                studyGuideMarkdown: '',
                podcast: null,
                updatedAt: item.updatedAt || 0,
              }));
              inMemoryKitsCache.set(key, partialKits);
              return partialKits;
            }
          }
        } catch {}
      }

      // 4. Si es modo invitado y no hay datos previos
      if (!userId) {
        const legacy = typeof localStorage !== 'undefined' ? localStorage.getItem('thea_study_kits_v2') : null;
        if (legacy !== null) {
          try {
            const parsedLegacy = JSON.parse(legacy);
            if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
              const cleanLegacy = parsedLegacy.filter(k => !isCorruptedKit(k) && !deletedIds.has(k.id));
              if (cleanLegacy.length > 0) {
                inMemoryKitsCache.set(key, cleanLegacy);
                return cleanLegacy;
              }
            }
          } catch {}
        }

        const defaultKits = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
        inMemoryKitsCache.set(key, defaultKits);
        return defaultKits;
      }

      // Para usuario registrado sin datos en LocalStorage: no sobreescribir con kits por defecto
      return [];
    } catch (e) {
      console.error('[kitRepositoryService] Error al obtener kits de usuario:', e);
      return [];
    }
  },

  /**
   * Restaura los kits asincronamente desde IndexedDB con tolerancia a fallos.
   * Evita perdidas de datos si LocalStorage fue purgado o se alcanzo la cuota.
   */
  async restoreUserKitsAsync(userId: string | null): Promise<StudyKit[]> {
    try {
      const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';
      const deletedIds = getDeletedKitIds();

      // 1. Intentar leer de IndexedDB primero para recuperar kits integros con sus activos
      let idbKits = await getKitsFromIndexedDB(key);
      if (!idbKits || idbKits.length === 0) {
        idbKits = await getKitsFromIndexedDB('thea_study_kits_v2');
      }

      const memKits = inMemoryKitsCache.get(key) || [];
      let merged: StudyKit[] = [];

      if (idbKits && idbKits.length > 0) {
        // Si memKits tiene elementos completos, fusionar por updatedAt.
        merged = mergeKitsByUpdatedAt(memKits, idbKits, deletedIds);
      } else if (memKits.length > 0) {
        merged = memKits.filter(k => !deletedIds.has(k.id));
      }

      if (merged.length > 0) {
        inMemoryKitsCache.set(key, merged);
        this.writeIndexToLocalStorage(userId, merged, false);
        saveKitsToIndexedDB(key, merged).catch(() => {});
        return merged;
      }

      // 2. Fallback sincrono si IndexedDB aun no tenia datos
      const localKits = this.getUserKits(userId);
      if (localKits && localKits.length > 0) {
        return localKits;
      }

      // 3. Si es sesion de invitado nueva, inicializar de fabrica
      if (!userId) {
        const defaults = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
        this.saveUserKits(null, defaults);
        return defaults;
      }

      return [];
    } catch (e) {
      console.error('[kitRepositoryService] Error al restaurar kits asincronamente:', e);
      return this.getUserKits(userId);
    }
  },

  /**
   * Escribe el indice ligero en LocalStorage para garantizar disponibilidad inmediata tras reinicio.
   */
  writeIndexToLocalStorage(userId: string | null, kits: StudyKit[], pendingDriveSync = true): void {
    if (typeof localStorage === 'undefined') return;
    const indexKey = userId ? `thea_user_kits_index_${userId}` : 'thea_guest_kits_index';
    const index: StudyKitIndexItem[] = kits.map(k => ({
      id: k.id,
      title: k.title,
      description: k.description,
      icon: k.icon,
      color: k.color,
      updatedAt: k.updatedAt || Date.now(),
      category: k.category,
      questionsCount: Array.isArray(k.questions) ? k.questions.length : 0,
      flashcardsCount: Array.isArray(k.flashcards) ? k.flashcards.length : 0,
      pendingDriveSync,
    }));
    try {
      localStorage.setItem(indexKey, JSON.stringify(index));
    } catch (err) {
      notifyQuotaExceeded(err);
    }
  },

  /**
   * Actualiza el indicador de sincronizacion en el indice de kits cuando la subida a Drive culmina.
   */
  markKitsSyncedWithDrive(userId: string | null, kitIds: string[]): void {
    if (typeof localStorage === 'undefined' || !userId) return;
    const indexKey = `thea_user_kits_index_${userId}`;
    try {
      const raw = localStorage.getItem(indexKey);
      if (!raw) return;
      const index: StudyKitIndexItem[] = JSON.parse(raw);
      const syncedSet = new Set(kitIds);
      const updatedIndex = index.map(item => {
        if (syncedSet.has(item.id)) {
          return { ...item, pendingDriveSync: false };
        }
        return item;
      });
      localStorage.setItem(indexKey, JSON.stringify(updatedIndex));
    } catch {}
  },

  /**
   * Vuelca de manera sincrona el estado de kits antes del cierre de pestana (pagehide / visibilitychange).
   */
  flushKitsSync(userId: string | null, kits: StudyKit[]): void {
    try {
      this.saveUserKits(userId, kits);
    } catch (e) {
      console.warn('[kitRepositoryService] Error en flushKitsSync:', e);
    }
  },

  /**
   * Guarda los kits para el usuario actual o invitado de forma asincrona asegurando confirmacion en IndexedDB.
   */
  async saveUserKitsAsync(userId: string | null, kits: StudyKit[]): Promise<void> {
    this.saveUserKits(userId, kits);
    const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';
    await Promise.all([
      saveKitsToIndexedDB(key, kits),
      saveAssetsFromKits(kits),
    ]);
  },

  /**
   * Restablece los kits de estudio iniciales de fabrica para el usuario actual o invitado.
   */
  resetToDefaultKits(userId: string | null): StudyKit[] {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
    this.saveUserKits(userId, defaults);
    return defaults;
  },

  /**
   * Guarda los kits para el usuario actual o invitado.
   * Transfiere automaticamente los activos pesados a IndexedDB y almacena un indice ligero en LocalStorage.
   */
  saveUserKits(userId: string | null, kits: StudyKit[]): void {
    const deletedIds = getDeletedKitIds();
    const cleanKits = Array.isArray(kits)
      ? kits
          .filter(k => !isCorruptedKit(k) && !deletedIds.has(k.id))
          .map(k => ({ ...k, updatedAt: k.updatedAt || Date.now() }))
      : [];

    const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';

    // 1. Memoria de acceso inmediato
    inMemoryKitsCache.set(key, cleanKits);

    // 2. Escribir indice ligero en LocalStorage
    this.writeIndexToLocalStorage(userId, cleanKits, true);

    // 3. Intentar guardar version aligerada en LocalStorage protegiendo la cuota
    // Umbral acotado a 350KB para asegurar que nunca sature la cuota global de LocalStorage (5MB)
    try {
      const lightweight = stripHeavyAssetsForLocalStorage(cleanKits);
      const serialized = JSON.stringify(lightweight);
      if (serialized.length < 350000) {
        localStorage.setItem(key, serialized);
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {
      notifyQuotaExceeded(err);
      try {
        localStorage.removeItem(key);
      } catch {}
    }

    // 4. Guardar inmediatamente en IndexedDB (almacen primario completo)
    saveKitsToIndexedDB(key, cleanKits).catch((err) => {
      console.warn('[kitRepositoryService] Error guardando kits en IndexedDB:', err);
    });

    // 5. Extraer y persistir activos pesados en IndexedDB
    saveAssetsFromKits(cleanKits).catch((err) => {
      console.warn('[kitRepositoryService] Error guardando activos en IndexedDB:', err);
    });
  },
};
