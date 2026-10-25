import type { FlashcardProgressState } from '../types';
import {
  saveSessionItem,
  getSessionItem,
  removeSessionItem,
  notifyQuotaExceeded,
} from './storageService';
import { kitRepositoryService } from './kitRepositoryService';

const flashcardIdbTimers = new Map<string, any>();

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
                localStorage.setItem(userKey, JSON.stringify(mergedState));
                return mergedState;
              }
            }
            localStorage.setItem(userKey, JSON.stringify(res));
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
  saveFlashcardProgress(userId: string | null, kitId: string, state: FlashcardProgressState): void {
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
        kitId,
        masteryMap: normalizedMap,
        currentIdx: safeIdx,
      };

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(userKey, JSON.stringify(minimalStorageState));
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

      // 3. Sincronizar inmediatamente el kit en kitRepositoryService si vienen tarjetas
      if (state.cards && Array.isArray(state.cards) && state.cards.length > 0) {
        try {
          kitRepositoryService.updateKitFlashcards(userId, kitId, state.cards, state.archivedCards);
        } catch (err) {
          console.warn('[flashcardProgressService] Error actualizando kitRepositoryService:', err);
        }
      }

      // 4. Persistencia diferida hacia IndexedDB y eventos en vivo con debounce de 150ms
      // Previene saturacion del bucle de eventos y de memoria (OOM) ante clics sucesivos ultrarrapidos
      if (flashcardIdbTimers.has(userKey)) {
        clearTimeout(flashcardIdbTimers.get(userKey));
      }
      const timer = setTimeout(() => {
        flashcardIdbTimers.delete(userKey);
        saveSessionItem(userKey, fullStateForIdb).catch(() => {});
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('thea_flashcard_saved', {
            detail: { userId, kitId, state: fullStateForIdb }
          }));
        }
      }, 150);
      flashcardIdbTimers.set(userKey, timer);
    } catch (e) {
      console.warn('[flashcardProgressService] Error al guardar memoria de Flashcards:', e);
    }
  },

  /**
   * Obtiene todos los progresos de flashcards guardados para un usuario.
   */
  getAllFlashcardProgress(userId: string | null): Record<string, FlashcardProgressState> {
    const result: Record<string, FlashcardProgressState> = {};
    if (typeof localStorage === 'undefined') return result;
    const prefix = `thea_fc_mem_${userId || 'guest'}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const kitId = key.substring(prefix.length);
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.masteryMap) {
            result[kitId] = parsed;
          }
        }
      } catch {}
    }
    return result;
  },

  /**
   * Guarda o actualiza un lote completo de progresos de flashcards (ej. descargados de Google Drive).
   */
  saveAllFlashcardProgress(userId: string | null, progressMap: Record<string, FlashcardProgressState>): void {
    if (!progressMap || typeof progressMap !== 'object') return;
    for (const [kitId, state] of Object.entries(progressMap)) {
      if (kitId && state && state.masteryMap) {
        this.saveFlashcardProgress(userId, kitId, state);
      }
    }
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
