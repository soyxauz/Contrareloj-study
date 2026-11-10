import type { FlashcardProgressState } from '../types';
import {
  saveSessionItem,
  getSessionItem,
  getSessionItemsByPrefix,
  removeSessionItem,
  notifyQuotaExceeded,
  safeLocalStorageSetItem,
  invalidateFlashcardMasteryCache,
} from './storageService';
import { kitRepositoryService } from './kitRepositoryService';

const flashcardIdbTimers = new Map<string, any>();
const pendingFlashcardIdbPayloads = new Map<string, FlashcardProgressState>();
const inMemoryFlashcardCache = new Map<string, FlashcardProgressState>();

function areFlashcardStatesEquivalent(
  a: FlashcardProgressState | null | undefined,
  b: FlashcardProgressState | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if ((a.currentIdx || 0) !== (b.currentIdx || 0)) return false;
  if ((a.resetAt || 0) !== (b.resetAt || 0)) return false;
  if ((a.cards?.length || 0) !== (b.cards?.length || 0)) return false;
  if ((a.archivedCards?.length || 0) !== (b.archivedCards?.length || 0)) return false;

  const mapA = a.masteryMap || {};
  const mapB = b.masteryMap || {};
  const keysA = Object.keys(mapA);
  const keysB = Object.keys(mapB);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (mapA[k] !== mapB[k]) return false;
  }
  return true;
}

export const flashcardProgressService = {
  /**
   * Obtiene el progreso de flashcards guardado para el usuario y kit especificos (persistencia inmediata y total).
   * Cuenta con fallback a sesion de invitado si no existe sesion para el usuario.
   */
  getFlashcardProgress(userId: string | null, kitId: string): FlashcardProgressState | null {
    if (!kitId) return null;
    try {
      const userKey = `thea_fc_mem_${userId || 'guest'}_${kitId}`;
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(userKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.masteryMap) {
          return parsed as FlashcardProgressState;
        }
      }
      // Fallback a invitado si el usuario aun no tiene progreso registrado
      if (userId) {
        const guestKey = `thea_fc_mem_guest_${kitId}`;
        const guestRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(guestKey) : null;
        if (guestRaw) {
          try {
            const guestParsed = JSON.parse(guestRaw);
            if (guestParsed && typeof guestParsed === 'object' && guestParsed.masteryMap) {
              return guestParsed as FlashcardProgressState;
            }
          } catch {}
        }
      }
      return null;
    } catch (e) {
      console.warn('[flashcardProgressService] Error al leer memoria de Flashcards:', e);
      return null;
    }
  },

  /**
   * Recupera de forma asincrona el progreso de flashcards desde IndexedDB si LocalStorage fue purgado.
   * Nunca sobreescribe si LocalStorage ya posee un estado mas reciente en memoria o almacenamiento.
   */
  async restoreFlashcardProgressAsync(userId: string | null, kitId: string): Promise<FlashcardProgressState | null> {
    if (!kitId) return null;
    try {
      const userKey = `thea_fc_mem_${userId || 'guest'}_${kitId}`;
      const res = await getSessionItem<FlashcardProgressState>(userKey);
      if (res && res.masteryMap) {
        if (typeof localStorage !== 'undefined') {
          try {
            const localRaw = localStorage.getItem(userKey);
            if (localRaw) {
              const localParsed = JSON.parse(localRaw);
              if (localParsed && (localParsed.updatedAt || 0) >= (res.updatedAt || 0)) {
                // Preservar estado local mas nuevo y fusionar mapas
                const mergedMap = { ...(res.masteryMap || {}), ...(localParsed.masteryMap || {}) };
                const mergedState: FlashcardProgressState = {
                  ...localParsed,
                  masteryMap: mergedMap,
                };
                safeLocalStorageSetItem(userKey, JSON.stringify(mergedState));
                return mergedState;
              }
            }
            safeLocalStorageSetItem(userKey, JSON.stringify(res));
          } catch {}
        }
        return res;
      }
      if (userId) {
        const guestKey = `thea_fc_mem_guest_${kitId}`;
        const guestRes = await getSessionItem<FlashcardProgressState>(guestKey);
        if (guestRes && guestRes.masteryMap) {
          return guestRes;
        }
      }
      return null;
    } catch (e) {
      console.warn('[flashcardProgressService] Error al restaurar memoria de Flashcards desde IndexedDB:', e);
      return null;
    }
  },

  /**
   * Guarda de forma atomica el progreso de flashcards en LocalStorage e IndexedDB en tiempo real.
   * Normaliza claves de tarjetas (id, term y term en minusculas) para que ninguna modificacion se pierda.
   */
  saveFlashcardProgress(
    userId: string | null,
    kitId: string,
    state: FlashcardProgressState,
    options?: { source?: 'local' | 'remote_sync' | 'idb_restore' }
  ): void {
    const source = options?.source || 'local';
    if (!kitId || !state) return;
    try {
      const userKey = `thea_fc_mem_${userId || 'guest'}_${kitId}`;
      const rawMap = state.masteryMap || {};
      const normalizedMap: Record<string, 'to-learn' | 'known' | 'mastered'> = { ...rawMap };

      if (state.cards && Array.isArray(state.cards)) {
        state.cards.forEach(c => {
          const m = c.mastery;
          if (m) {
            if (c.id) normalizedMap[c.id] = m;
            if (c.term) {
              const termStr = String(c.term).trim();
              if (termStr) {
                normalizedMap[termStr] = m;
                normalizedMap[termStr.toLowerCase()] = m;
              }
            }
          }
        });
      }

      const safeIdx = typeof state.currentIdx === 'number' && !isNaN(state.currentIdx)
        ? Math.max(0, state.currentIdx)
        : 0;

      // 1. En LocalStorage: guardar EXCLUSIVAMENTE el estado ultra-compacto (< 500 bytes)
      // NUNCA almacenar definiciones ni colecciones enteras de tarjetas aqui.
      // Esto elimina de raiz el QuotaExceededError y la saturacion de memoria (OOM).
      const minimalStorageState: FlashcardProgressState = {
        version: 1,
        updatedAt: state.updatedAt || Date.now(),
        ...(state.resetAt ? { resetAt: state.resetAt } : {}),
        kitId,
        masteryMap: normalizedMap,
        currentIdx: safeIdx,
      };

      inMemoryFlashcardCache.set(userKey, minimalStorageState);
      invalidateFlashcardMasteryCache(kitId);

      if (typeof localStorage !== 'undefined') {
        try {
          safeLocalStorageSetItem(userKey, JSON.stringify(minimalStorageState));
        } catch (err) {
          notifyQuotaExceeded(err);
        }
      }

      // 2. En IndexedDB: guardar la copia completa con tarjetas y archivadas
      const fullStateForIdb: FlashcardProgressState = {
        ...minimalStorageState,
        cards: state.cards,
        archivedCards: state.archivedCards,
      };

      // 3. Sincronizar inmediatamente el kit en kitRepositoryService si hubo cambio local y vienen tarjetas
      if (source === 'local' && state.cards && Array.isArray(state.cards) && state.cards.length > 0) {
        try {
          kitRepositoryService.updateKitFlashcards(userId, kitId, state.cards, state.archivedCards);
        } catch (err) {
          console.warn('[flashcardProgressService] Error actualizando kitRepositoryService:', err);
        }
      }

      // Notificar al bus de eventos indicando el origen real para evitar re-subidas al aplicar sync remoto
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thea_flashcard_saved', {
          detail: { userId, kitId, state: minimalStorageState, source }
        }));
      }

      // 4. Persistencia diferida hacia IndexedDB con debounce de 150ms y flush seguro al ocultar/cerrar
      if (flashcardIdbTimers.has(userKey)) {
        clearTimeout(flashcardIdbTimers.get(userKey));
      }
      pendingFlashcardIdbPayloads.set(userKey, fullStateForIdb);
      const timer = setTimeout(() => {
        flashcardIdbTimers.delete(userKey);
        const payload = pendingFlashcardIdbPayloads.get(userKey) || fullStateForIdb;
        pendingFlashcardIdbPayloads.delete(userKey);
        saveSessionItem(userKey, payload).catch(() => {});
      }, 150);
      flashcardIdbTimers.set(userKey, timer);
    } catch (e) {
      console.warn('[flashcardProgressService] Error al guardar memoria de Flashcards:', e);
    }
  },

  /**
   * Vacía inmediatamente cualquier escritura pendiente en IndexedDB (al salir de la vista u ocultar la pestaña).
   */
  flushPendingSaves(): void {
    for (const [userKey, timer] of flashcardIdbTimers.entries()) {
      clearTimeout(timer);
      flashcardIdbTimers.delete(userKey);
      const payload = pendingFlashcardIdbPayloads.get(userKey);
      pendingFlashcardIdbPayloads.delete(userKey);
      if (payload) {
        saveSessionItem(userKey, payload).catch(() => {});
      }
    }
  },

  /**
   * Obtiene todos los progresos de flashcards en caché/LocalStorage para lectura síncrona.
   */
  getAllFlashcardProgress(userId: string | null): Record<string, FlashcardProgressState> {
    const result: Record<string, FlashcardProgressState> = {};
    const prefix = `thea_fc_mem_${userId || 'guest'}_`;

    for (const [k, cached] of inMemoryFlashcardCache.entries()) {
      if (k.startsWith(prefix) && cached?.masteryMap) {
        const kitId = k.substring(prefix.length);
        if (kitId) result[kitId] = cached;
      }
    }

    if (typeof localStorage === 'undefined') return result;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const kitId = key.substring(prefix.length);
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.masteryMap) {
            const existing = result[kitId];
            if (!existing || (parsed.updatedAt || 0) >= (existing.updatedAt || 0)) {
              result[kitId] = parsed;
            }
          }
        }
      } catch {}
    }
    return result;
  },

  /**
   * Obtiene el progreso completo de flashcards de TODOS los kits combinando RAM, LocalStorage e IndexedDB,
   * garantizando que los kits inactivos desalojados de LocalStorage nunca se omitan al sincronizar con la nube.
   */
  async getAllFlashcardProgressAsync(userId: string | null): Promise<Record<string, FlashcardProgressState>> {
    const combined = this.getAllFlashcardProgress(userId);
    const prefix = `thea_fc_mem_${userId || 'guest'}_`;
    try {
      const idbMap = await getSessionItemsByPrefix<FlashcardProgressState>(prefix);
      for (const [kitId, idbVal] of Object.entries(idbMap)) {
        if (!kitId || !idbVal || !idbVal.masteryMap) continue;
        const compact: FlashcardProgressState = {
          version: 1,
          updatedAt: idbVal.updatedAt || 0,
          ...(idbVal.resetAt ? { resetAt: idbVal.resetAt } : {}),
          kitId,
          masteryMap: idbVal.masteryMap,
          currentIdx: idbVal.currentIdx || 0,
        };
        const existing = combined[kitId];
        if (!existing || (compact.updatedAt || 0) > (existing.updatedAt || 0)) {
          combined[kitId] = compact;
          inMemoryFlashcardCache.set(`${prefix}${kitId}`, compact);
        }
      }
    } catch {}
    return combined;
  },

  /**
   * Guarda o actualiza un lote completo de progresos de flashcards por marca temporal (updatedAt)
   * y respetando reinicios explícitos (resetAt).
   */
  saveAllFlashcardProgress(
    userId: string | null,
    progressMap: Record<string, FlashcardProgressState>,
    options?: { source?: 'local' | 'remote_sync' }
  ): boolean {
    if (!progressMap || typeof progressMap !== 'object') return false;
    const source = options?.source || 'remote_sync';
    let anyChanged = false;

    for (const [kitId, incomingState] of Object.entries(progressMap)) {
      if (!kitId || !incomingState || !incomingState.masteryMap) continue;

      const currentState = this.getFlashcardProgress(userId, kitId);
      if (!currentState) {
        this.saveFlashcardProgress(userId, kitId, incomingState, { source });
        anyChanged = true;
        continue;
      }

      const curResetAt = currentState.resetAt || 0;
      const incResetAt = incomingState.resetAt || 0;
      const curUpdated = currentState.updatedAt || 0;
      const incUpdated = incomingState.updatedAt || 0;

      // Si uno de los dos dispositivos hizo un reset explícito más reciente, prevalece ese estado limpio
      if (incResetAt > curResetAt && incResetAt >= curUpdated) {
        if (!areFlashcardStatesEquivalent(currentState, incomingState)) {
          this.saveFlashcardProgress(userId, kitId, incomingState, { source });
          anyChanged = true;
        }
        continue;
      }
      if (curResetAt > incResetAt && curResetAt >= incUpdated) {
        continue;
      }

      type MasteryLevel = 'to-learn' | 'known' | 'mastered';
      const rank = (lvl: string) => lvl === 'mastered' ? 3 : (lvl === 'known' ? 2 : 1);
      const isIncomingStrictlyNewer = incUpdated > curUpdated + 1000;
      const isLocalStrictlyNewer = curUpdated > incUpdated + 1000;

      const mergedMastery: Record<string, MasteryLevel> = {
        ...(currentState.masteryMap || {}),
      };

      for (const [cardId, incLvl] of Object.entries(incomingState.masteryMap || {})) {
        const curLvl = mergedMastery[cardId];
        if (!curLvl) {
          mergedMastery[cardId] = incLvl as MasteryLevel;
        } else if (isIncomingStrictlyNewer) {
          mergedMastery[cardId] = incLvl as MasteryLevel;
        } else if (isLocalStrictlyNewer) {
          // Mantener valor local más reciente
          mergedMastery[cardId] = curLvl;
        } else if (rank(incLvl) >= rank(curLvl)) {
          mergedMastery[cardId] = incLvl as MasteryLevel;
        }
      }

      const newestIsIncoming = incUpdated >= curUpdated;
      const merged: FlashcardProgressState = {
        ...incomingState,
        masteryMap: mergedMastery,
        currentIdx: newestIsIncoming ? (incomingState.currentIdx ?? currentState.currentIdx ?? 0) : (currentState.currentIdx ?? incomingState.currentIdx ?? 0),
        cards: incomingState.cards || currentState.cards,
        archivedCards: incomingState.archivedCards || currentState.archivedCards,
        updatedAt: Math.max(curUpdated, incUpdated),
        ...(Math.max(curResetAt, incResetAt) > 0 ? { resetAt: Math.max(curResetAt, incResetAt) } : {}),
      };

      if (!areFlashcardStatesEquivalent(currentState, merged)) {
        this.saveFlashcardProgress(userId, kitId, merged, { source });
        anyChanged = true;
      }
    }

    if (anyChanged && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { userId, source } }));
    }
    return anyChanged;
  },

  /**
   * Elimina el progreso de flashcards de un kit.
   */
  removeFlashcardProgress(userId: string | null, kitId: string): void {
    if (!kitId) return;
    const userKey = `thea_fc_mem_${userId || 'guest'}_${kitId}`;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(userKey);
      } catch {}
    }
    removeSessionItem(userKey).catch(() => {});
  },
};
