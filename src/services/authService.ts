import { extractCleanKitId, isCorruptedStorageKey } from '../utils/storageKeys';
import type { User, StudyKit, SmartStudySessionState, PodcastSettings, FlashcardProgressState } from '../types';
import type { AISettings } from './aiService';
import {
  saveSessionItem,
  getSessionItem,
  getAllSessionItems,
  getSessionItemsByPrefix,
  removeSessionItem,
  requestPersistentStorage,
  safeLocalStorageSetItem,
} from './storageService';
import { kitRepositoryService, inMemoryKitsCache } from './kitRepositoryService';
import { flashcardProgressService } from './flashcardProgressService';

export { inMemoryKitsCache, kitRepositoryService, flashcardProgressService };

interface StoredUserRecord extends User {
  passwordHash: string;
  aiSettings?: AISettings;
  podcastSettings?: PodcastSettings;
}

const STORAGE_USERS_KEY = 'thea_auth_users';
const STORAGE_CURRENT_SESSION_KEY = 'thea_auth_session';

function setSessionCookie(key: string, value: string, maxAgeDays = 365): void {
  if (typeof document === 'undefined') return;
  try {
    const maxAge = maxAgeDays * 24 * 60 * 60;
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch (e) {
    console.warn('[authService] Error guardando cookie de sesión:', e);
  }
}

function getSessionCookie(key: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const cookies = document.cookie.split('; ');
    const encodedKey = encodeURIComponent(key);
    for (const c of cookies) {
      const parts = c.split('=');
      if (parts[0] === encodedKey) {
        return decodeURIComponent(parts.slice(1).join('='));
      }
    }
  } catch (e) {
    console.warn('[authService] Error leyendo cookie de sesión:', e);
  }
  return null;
}

function removeSessionCookie(key: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; SameSite=Lax`;
  } catch (e) {
    console.warn('[authService] Error eliminando cookie de sesión:', e);
  }
}

function persistSessionRecord(userId: string): void {
  try {
    safeLocalStorageSetItem(STORAGE_CURRENT_SESSION_KEY, userId);
    setSessionCookie(STORAGE_CURRENT_SESSION_KEY, userId, 365);
    saveSessionItem(STORAGE_CURRENT_SESSION_KEY, userId).catch(() => {});
    requestPersistentStorage().catch(() => {});
  } catch (e) {
    console.warn('[authService] Error al persistir sesión extendida:', e);
  }
}

function clearPersistedSessionRecord(): void {
  try {
    localStorage.removeItem(STORAGE_CURRENT_SESSION_KEY);
    removeSessionCookie(STORAGE_CURRENT_SESSION_KEY);
    removeSessionItem(STORAGE_CURRENT_SESSION_KEY).catch(() => {});
  } catch (e) {
    console.warn('[authService] Error al limpiar sesión extendida:', e);
  }
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers(): StoredUserRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredUserRecord[];
  } catch (e) {
    console.error('Error al leer usuarios de localStorage', e);
    return [];
  }
}

function saveStoredUsers(users: StoredUserRecord[]): void {
  try {
    safeLocalStorageSetItem(STORAGE_USERS_KEY, JSON.stringify(users));
    saveSessionItem(STORAGE_USERS_KEY, users).catch(() => {});
  } catch (e) {
    console.error('Error al guardar usuarios en localStorage', e);
  }
}

const inMemorySessionCache = new Map<string, SmartStudySessionState>();

function getSessionProgressRank(s: SmartStudySessionState): number {
  const ansCount = Array.isArray((s as any).answeredQuestionIds) ? (s as any).answeredQuestionIds.length : 0;
  const histCount = Array.isArray(s.history) ? s.history.length : 0;
  return (s.level || 1) * 1000 + (s.levelCorrectCount || 0) * 10 + ansCount + histCount + (s.currentIndex || 0);
}

/**
 * Compara dos instantáneas de sesión para determinar si `candidate` debe prevalecer sobre `baseline`.
 * Evita que copias antiguas de IndexedDB o caché en memoria sobreescriban progreso local más reciente.
 */
function isSessionNewerOrBetter(
  candidate: SmartStudySessionState,
  baseline: SmartStudySessionState | null | undefined
): boolean {
  if (!baseline) return true;
  const candReset = (candidate as any).resetAt || 0;
  const baseReset = (baseline as any).resetAt || 0;
  const candUpdated = candidate.lastUpdated || 0;
  const baseUpdated = baseline.lastUpdated || 0;

  if (candReset > baseReset && candReset >= baseUpdated) return true;
  if (baseReset > candReset && baseReset >= candUpdated) return false;
  if (candUpdated !== baseUpdated) return candUpdated > baseUpdated;

  return getSessionProgressRank(candidate) > getSessionProgressRank(baseline);
}

function readLocalStorageSmartStudySession(key: string): SmartStudySessionState | null {
  if (typeof localStorage === 'undefined' || !key || isCorruptedStorageKey(key)) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return sanitizeSmartStudySession(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Valida y calibra la sesión de Smart Study para garantizar que siempre refleje el nivel real y exacto.
 * Invariante pedagógico de Smart Study:
 * - Nivel 1: Retención & Fundamentos (hasta 25 aciertos).
 * - Nivel 2: Aplicación y Relaciones (requiere haber alcanzado 25 aciertos en Nivel 1).
 * - Nivel 3: Casos Prácticos y Síntesis (requiere haber alcanzado 25 aciertos en Nivel 1 y 25 aciertos en Nivel 2).
 * Sin subir ni bajar arbitrariamente el nivel real ganado.
 */
export function sanitizeSmartStudySession(session: SmartStudySessionState | null | undefined): SmartStudySessionState | null {
  if (!session || typeof session !== 'object') return null;

  let l1 = typeof session.levelCorrectCounts?.[1] === 'number' ? Math.max(0, session.levelCorrectCounts[1]) : 0;
  let l2 = typeof session.levelCorrectCounts?.[2] === 'number' ? Math.max(0, session.levelCorrectCounts[2]) : 0;
  let l3 = typeof session.levelCorrectCounts?.[3] === 'number' ? Math.max(0, session.levelCorrectCounts[3]) : 0;

  // Si no venía levelCorrectCounts detallado pero sí levelCorrectCount
  if (!session.levelCorrectCounts && typeof session.levelCorrectCount === 'number') {
    if (session.level === 1) l1 = session.levelCorrectCount;
    else if (session.level === 2) { l1 = 25; l2 = session.levelCorrectCount; }
    else if (session.level === 3) { l1 = 25; l2 = 25; l3 = session.levelCorrectCount; }
  }

  const rawCorrect = l1 + l2 + l3;
  const history = Array.isArray(session.history) ? session.history : [];
  const correctInHistory = history.filter((h: any) => h && h.isCorrect).length;

  const answeredTotal = Math.max(
    typeof session.questionsAnsweredTotal === 'number' ? session.questionsAnsweredTotal : 0,
    history.length,
    correctInHistory,
    rawCorrect
  );

  // Si no hay ninguna pregunta respondida ni aciertos en ningún lado, el nivel exacto es 1 con 0 aciertos
  if (answeredTotal === 0 && correctInHistory === 0 && rawCorrect === 0) {
    return {
      ...session,
      level: 1,
      levelCorrectCount: 0,
      levelCorrectCounts: { 1: 0, 2: 0, 3: 0 },
      currentIndex: 0,
      questionsAnsweredTotal: 0,
    };
  }

  // Determinar el nivel real exacto ganado:
  // Nivel 1: < 25 aciertos en L1
  // Nivel 2: nivel 1 completado (>= 25) y nivel 2 en progreso (< 25)
  // Nivel 3: niveles 1 y 2 completados (>= 25 cada uno)
  let realLevel: 1 | 2 | 3 = 1;
  if (l1 >= 25) {
    l1 = 25;
    if (l2 >= 25) {
      l2 = 25;
      realLevel = 3;
    } else {
      realLevel = 2;
      l3 = 0;
    }
  } else {
    realLevel = 1;
    l2 = 0;
    l3 = 0;
  }

  const currentCount = realLevel === 1 ? l1 : (realLevel === 2 ? l2 : l3);

  return {
    ...session,
    level: realLevel,
    levelCorrectCount: Math.min(25, Math.max(0, currentCount)),
    levelCorrectCounts: {
      1: Math.min(25, Math.max(0, l1)),
      2: Math.min(25, Math.max(0, l2)),
      3: Math.min(25, Math.max(0, l3)),
    },
    questionsAnsweredTotal: Math.max(answeredTotal, l1 + l2 + l3),
    answeredQuestionIds: Array.isArray((session as any).answeredQuestionIds)
      ? (session as any).answeredQuestionIds
      : Array.from(new Set(history.map((h: any) => h.questionId).filter(Boolean))),
  };
}

function normalizeOrderedIds(ids: unknown): string {
  return Array.isArray(ids) ? ids.filter(Boolean).join(',') : '';
}

function areSmartStudySessionsEquivalent(
  a: SmartStudySessionState | null | undefined,
  b: SmartStudySessionState | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const qIdA = a.currentQuestionId || a.currentQuestion?.id || '';
  const qIdB = b.currentQuestionId || b.currentQuestion?.id || '';
  if (
    a.level !== b.level ||
    a.activePracticeLevel !== b.activePracticeLevel ||
    a.levelCorrectCount !== b.levelCorrectCount ||
    a.currentIndex !== b.currentIndex ||
    qIdA !== qIdB ||
    Boolean(a.isAnswered) !== Boolean(b.isAnswered) ||
    (a.isCurrentCorrect ?? null) !== (b.isCurrentCorrect ?? null) ||
    (a.selectedOption ?? null) !== (b.selectedOption ?? null) ||
    Boolean(a.isReinforcementMode) !== Boolean(b.isReinforcementMode) ||
    (a.questionsAnsweredTotal || 0) !== (b.questionsAnsweredTotal || 0) ||
    (a.totalErrorsReinforced || 0) !== (b.totalErrorsReinforced || 0) ||
    (a.resetAt || 0) !== (b.resetAt || 0)
  ) {
    return false;
  }
  const countsA = a.levelCorrectCounts || { 1: 0, 2: 0, 3: 0 };
  const countsB = b.levelCorrectCounts || { 1: 0, 2: 0, 3: 0 };
  if (
    (countsA[1] || 0) !== (countsB[1] || 0) ||
    (countsA[2] || 0) !== (countsB[2] || 0) ||
    (countsA[3] || 0) !== (countsB[3] || 0)
  ) {
    return false;
  }
  const errA = Array.isArray(a.errorQueue) ? a.errorQueue.map(q => q?.id || '').join(',') : '';
  const errB = Array.isArray(b.errorQueue) ? b.errorQueue.map(q => q?.id || '').join(',') : '';
  if (errA !== errB) return false;

  if (
    normalizeOrderedIds((a as any).answeredQuestionIds) !== normalizeOrderedIds((b as any).answeredQuestionIds) ||
    normalizeOrderedIds(a.revealedQuestionIds) !== normalizeOrderedIds(b.revealedQuestionIds)
  ) {
    return false;
  }

  const histA = Array.isArray(a.history) ? a.history : [];
  const histB = Array.isArray(b.history) ? b.history : [];
  if (histA.length !== histB.length) return false;
  if (histA.length > 0 && (histA[0]?.id || '') !== (histB[0]?.id || '')) return false;

  return true;
}

export const authService = {
  /**
   * Obtiene el usuario actual logueado o null si está en modo invitado.
   * Cuenta con respaldo síncrono mediante cookie de 365 días en caso de purga de localStorage.
   */
  getCurrentUser(): User | null {
    try {
      let currentId = localStorage.getItem(STORAGE_CURRENT_SESSION_KEY);
      if (!currentId) {
        currentId = getSessionCookie(STORAGE_CURRENT_SESSION_KEY);
        if (currentId) {
          safeLocalStorageSetItem(STORAGE_CURRENT_SESSION_KEY, currentId);
        }
      }
      if (!currentId) return null;
      const users = getStoredUsers();
      const user = users.find(u => u.id === currentId);
      if (user) {
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
      }

      // Fallback sincrono inmediato en 0ms si la coleccion de usuarios esta hidratando desde IndexedDB
      try {
        const rawProf = localStorage.getItem('thea_gdrive_profile');
        if (rawProf) {
          const prof = JSON.parse(rawProf);
          return {
            id: currentId,
            username: prof.email ? prof.email.split('@')[0] : currentId,
            displayName: prof.name || prof.email || 'Usuario',
            createdAt: new Date().toISOString(),
          };
        }
      } catch {}

      return {
        id: currentId,
        username: currentId,
        displayName: 'Usuario',
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  /**
   * Restaura la sesión persistente desde IndexedDB si tanto LocalStorage como Cookies fueron limpiados.
   */
  async restorePersistentSession(): Promise<User | null> {
    try {
      const syncUser = this.getCurrentUser();
      if (syncUser) {
        persistSessionRecord(syncUser.id);
        return syncUser;
      }

      const [storedId, storedUsers] = await Promise.all([
        getSessionItem<string>(STORAGE_CURRENT_SESSION_KEY),
        getSessionItem<StoredUserRecord[]>(STORAGE_USERS_KEY),
      ]);

      if (storedUsers && Array.isArray(storedUsers) && storedUsers.length > 0) {
        const localUsers = getStoredUsers();
        if (localUsers.length === 0) {
          saveStoredUsers(storedUsers);
        }
      }

      if (storedId) {
        persistSessionRecord(storedId);
        const users = getStoredUsers();
        const user = users.find(u => u.id === storedId);
        if (user) {
          const { passwordHash: _, ...safeUser } = user;
          return safeUser;
        }
      }
      return null;
    } catch (e) {
      console.warn('[authService] Error al restaurar sesión persistente desde IndexedDB:', e);
      return null;
    }
  },

  /**
   * Registra un nuevo usuario con contraseña cifrada y kits independientes.
   */
  async register(username: string, password: string, displayName?: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return { success: false, error: 'El nombre de usuario debe tener al menos 3 caracteres.' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      return { success: false, error: 'El usuario solo puede contener letras, números, guiones y guiones bajos.' };
    }
    if (password.length < 4) {
      return { success: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
    }

    const users = getStoredUsers();
    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: 'Este nombre de usuario ya está registrado. Por favor elige otro o inicia sesión.' };
    }

    const pwdHash = await hashPassword(password);
    const newUser: StoredUserRecord = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: cleanUsername,
      displayName: (displayName && displayName.trim()) || username.trim(),
      createdAt: new Date().toISOString(),
      passwordHash: pwdHash,
    };

    users.push(newUser);
    saveStoredUsers(users);

    // Inicializar kits limpios de fábrica para este nuevo usuario
    kitRepositoryService.resetToDefaultKits(newUser.id);

    // Iniciar sesión persistente extendida (LocalStorage + Cookie 1 año + IndexedDB)
    persistSessionRecord(newUser.id);
    this.clearGuestData();

    const { passwordHash: _, ...safeUser } = newUser;
    return { success: true, user: safeUser };
  },

  /**
   * Inicia sesión verificando credenciales.
   */
  async login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const cleanUsername = username.trim().toLowerCase();
    const users = getStoredUsers();
    const user = users.find(u => u.username.toLowerCase() === cleanUsername);

    if (!user) {
      return { success: false, error: 'No existe una cuenta registrada con este usuario.' };
    }

    const pwdHash = await hashPassword(password);
    if (user.passwordHash !== pwdHash) {
      return { success: false, error: 'Contraseña incorrecta. Por favor verifica tus datos.' };
    }

    // Iniciar sesión persistente extendida (LocalStorage + Cookie 1 año + IndexedDB)
    persistSessionRecord(user.id);
    this.clearGuestData();
    const { passwordHash: _, ...safeUser } = user;
    return { success: true, user: safeUser };
  },

  /**
   * Inicia o registra una sesión utilizando una cuenta de Google verificada.
   */
  async loginWithGoogle(profile: { id: string; email: string; name: string; avatarUrl?: string }): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const users = getStoredUsers();
      let existing = users.find(u => (u.googleId && u.googleId === profile.id) || (u.email && u.email.toLowerCase() === profile.email.toLowerCase()));

      if (!existing) {
        // Crear nuevo usuario vinculado con Google
        const generatedUsername = profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const newUser: StoredUserRecord = {
          id: `usr_g_${profile.id}`,
          username: generatedUsername,
          displayName: (profile.name && profile.name.trim()) || generatedUsername,
          email: profile.email,
          googleId: profile.id,
          avatarUrl: profile.avatarUrl,
          createdAt: new Date().toISOString(),
          passwordHash: '',
        };
        users.push(newUser);
        saveStoredUsers(users);

        // Inicializar kits limpios para este usuario de Google si no existen
        const key = `thea_user_kits_${newUser.id}`;
        if (!localStorage.getItem(key)) {
          kitRepositoryService.resetToDefaultKits(newUser.id);
        }
        existing = newUser;
      } else {
        // Actualizar datos de perfil si cambiaron
        if (profile.name) existing.displayName = profile.name;
        if (profile.avatarUrl) existing.avatarUrl = profile.avatarUrl;
        if (!existing.googleId) existing.googleId = profile.id;
        if (!existing.email) existing.email = profile.email;
        saveStoredUsers(users);
      }

      // Iniciar sesión persistente extendida (LocalStorage + Cookie 1 año + IndexedDB)
      persistSessionRecord(existing.id);
      this.clearGuestData();
      const { passwordHash: _, ...safeUser } = existing;
      return { success: true, user: safeUser };
    } catch (e: any) {
      console.error('Error al iniciar sesión con Google:', e);
      return { success: false, error: e?.message || 'Error al autenticar con Google' };
    }
  },

  /**
   * Cierra la sesión activa regresando al modo invitado.
   */
  logout(): void {
    clearPersistedSessionRecord();
  },

  /**
   * Obtiene la lista interna de usuarios para sincronización en la nube.
   */
  getRawStoredUsers(): StoredUserRecord[] {
    return getStoredUsers();
  },

  /**
   * Actualiza la lista interna de usuarios desde la nube.
   */
  setRawStoredUsers(users: StoredUserRecord[]): void {
    saveStoredUsers(users);
  },

  /** Carga los kits asociados al usuario o a la sesion de invitado de manera sincrona. */
  getUserKits(userId: string | null): StudyKit[] {
    return kitRepositoryService.getUserKits(userId);
  },

  /** Restaura los kits asincronamente desde IndexedDB con tolerancia a fallos. */
  async restoreUserKitsAsync(userId: string | null): Promise<StudyKit[]> {
    return kitRepositoryService.restoreUserKitsAsync(userId);
  },

  /** Escribe el indice ligero en LocalStorage para garantizar disponibilidad inmediata tras reinicio. */
  writeIndexToLocalStorage(userId: string | null, kits: StudyKit[], pendingDriveSync = true): void {
    kitRepositoryService.writeIndexToLocalStorage(userId, kits, pendingDriveSync);
  },

  /** Actualiza el indicador de sincronizacion en el indice de kits cuando la subida a Drive culmina. */
  markKitsSyncedWithDrive(userId: string | null, kitIds: string[]): void {
    kitRepositoryService.markKitsSyncedWithDrive(userId, kitIds);
  },

  /** Vuelca de manera sincrona el estado de kits antes del cierre de pestana. */
  flushKitsSync(userId: string | null, kits: StudyKit[]): void {
    kitRepositoryService.flushKitsSync(userId, kits);
  },

  /** Guarda los kits para el usuario actual o invitado de forma asincrona asegurando confirmacion en IndexedDB. */
  async saveUserKitsAsync(userId: string | null, kits: StudyKit[]): Promise<void> {
    return kitRepositoryService.saveUserKitsAsync(userId, kits);
  },

  /** Restablece los kits de estudio iniciales de fabrica para el usuario actual o invitado. */
  resetToDefaultKits(userId: string | null): StudyKit[] {
    return kitRepositoryService.resetToDefaultKits(userId);
  },

  /** Guarda los kits para el usuario actual o invitado delegando al repositorio. */
  saveUserKits(userId: string | null, kits: StudyKit[]): void {
    kitRepositoryService.saveUserKits(userId, kits);
  },


  /**
   * Obtiene la sesión de Smart Study guardada (memoria total en tiempo real).
   * Cuenta con respaldo inmediato en caché de memoria y fallback transparente a sesión de invitado.
   */
  getSmartStudySession(userId: string | null, rawKitId: string): SmartStudySessionState | null {
    try {
      const kitId = extractCleanKitId(rawKitId);
      if (!kitId) return null;
      const userKey = `thea_ss_mem_${userId || 'guest'}_${kitId}`;

      const cachedUser = inMemorySessionCache.get(userKey) || null;
      const lsUser = readLocalStorageSmartStudySession(userKey);
      let best: SmartStudySessionState | null = cachedUser;
      if (lsUser && isSessionNewerOrBetter(lsUser, best)) {
        inMemorySessionCache.set(userKey, lsUser);
        best = lsUser;
      }

      if (!best && userId && userId !== 'guest') {
        const guestKey = `thea_ss_mem_guest_${kitId}`;
        const cachedGuest = inMemorySessionCache.get(guestKey) || null;
        const lsGuest = readLocalStorageSmartStudySession(guestKey);
        let guestBest = cachedGuest;
        if (lsGuest && isSessionNewerOrBetter(lsGuest, guestBest)) {
          inMemorySessionCache.set(guestKey, lsGuest);
          guestBest = lsGuest;
        }
        best = guestBest;
      }

      // Fallback difuso: buscar la sesión válida más reciente que coincida con el sufijo del kit
      if (!best && typeof localStorage !== 'undefined') {
        const suffix = `_${kitId}`;
        for (const [cacheKey, cachedSession] of inMemorySessionCache.entries()) {
          if (
            cacheKey.startsWith('thea_ss_mem_') &&
            cacheKey.endsWith(suffix) &&
            !isCorruptedStorageKey(cacheKey) &&
            cachedSession &&
            isSessionNewerOrBetter(cachedSession, best)
          ) {
            best = sanitizeSmartStudySession(cachedSession) || cachedSession;
          }
        }
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('thea_ss_mem_') && k.endsWith(suffix) && !isCorruptedStorageKey(k)) {
            const candidate = readLocalStorageSmartStudySession(k);
            if (candidate && isSessionNewerOrBetter(candidate, best)) {
              best = candidate;
            }
          }
        }
        if (best) {
          inMemorySessionCache.set(userKey, best);
        }
      }

      if (!best) return null;
      const sanitized = sanitizeSmartStudySession(best);
      if (sanitized) {
        inMemorySessionCache.set(userKey, sanitized);
      }
      return sanitized;
    } catch (e) {
      console.error('Error al leer memoria de Smart Study', e);
      return null;
    }
  },

  /**
   * Restaura la sesión de Smart Study de forma asíncrona desde IndexedDB
   * si por alguna razón no se encontraba en memoria o LocalStorage.
   */
  async restoreSmartStudySessionAsync(userId: string | null, rawKitId: string): Promise<SmartStudySessionState | null> {
    try {
      const syncSession = this.getSmartStudySession(userId, rawKitId);
      if (syncSession) return syncSession;
      const kitId = extractCleanKitId(rawKitId);
      if (!kitId) return null;
      const userKey = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      const idbVal = await getSessionItem<SmartStudySessionState>(userKey);
      if (idbVal) {
        const sanitized = sanitizeSmartStudySession(idbVal);
        if (sanitized) {
          this.saveSmartStudySession(userId, kitId, sanitized, { source: 'idb_restore' });
          return sanitized;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Restaura todas las sesiones de Smart Study y progresos de Flashcards desde IndexedDB
   * hacia la memoria y LocalStorage para garantizar que las metricas nunca bajen a 0 al recargar.
   */
  async restoreAllSessionsFromIndexedDB(): Promise<number> {
    try {
      const items = await getAllSessionItems();
      if (!Array.isArray(items) || items.length === 0) return 0;

      let restoredCount = 0;
      for (const item of items) {
        if (!item || !item.key || !item.value) continue;

        // Purgar cualquier clave corrupta residual en IndexedDB sin restaurarla jamás
        if (isCorruptedStorageKey(item.key)) {
          removeSessionItem(item.key).catch(() => {});
          continue;
        }

        if (item.key.startsWith('thea_ss_mem_')) {
          const rawVal = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
          const sanitized = sanitizeSmartStudySession(rawVal);
          if (sanitized) {
            const existingMem = inMemorySessionCache.get(item.key) || null;
            const existingLs = readLocalStorageSmartStudySession(item.key);
            const currentBest = (existingLs && isSessionNewerOrBetter(existingLs, existingMem))
              ? existingLs
              : (existingMem || existingLs);

            if (currentBest && !isSessionNewerOrBetter(sanitized, currentBest)) {
              inMemorySessionCache.set(item.key, currentBest);
              saveSessionItem(item.key, currentBest).catch(() => {});
            } else {
              inMemorySessionCache.set(item.key, sanitized);
              const activeKitId = typeof localStorage !== 'undefined'
                ? (localStorage.getItem('thea_current_kit_id') || localStorage.getItem('thea_currentkit_id') || '')
                : '';
              const isActive = Boolean(activeKitId && item.key.endsWith(`_${activeKitId}`));
              if (isActive && typeof localStorage !== 'undefined' && !localStorage.getItem(item.key)) {
                const cleanCurrentQ = sanitized.currentQuestion ? {
                  ...sanitized.currentQuestion,
                  sourceAsset: sanitized.currentQuestion.sourceAsset ? {
                    id: sanitized.currentQuestion.sourceAsset.id,
                    type: sanitized.currentQuestion.sourceAsset.type,
                    caption: sanitized.currentQuestion.sourceAsset.caption,
                    pageOrSlide: sanitized.currentQuestion.sourceAsset.pageOrSlide,
                    contextNearby: sanitized.currentQuestion.sourceAsset.contextNearby,
                  } : undefined
                } : undefined;
                const compact = {
                  ...sanitized,
                  currentQuestion: cleanCurrentQ,
                  history: Array.isArray(sanitized.history) ? sanitized.history.slice(0, 15) : [],
                };
                safeLocalStorageSetItem(item.key, JSON.stringify(compact));
              }
              restoredCount++;
            }
          }
        } else if (item.key.startsWith('thea_fc_mem_')) {
          const activeKitId = typeof localStorage !== 'undefined'
            ? (localStorage.getItem('thea_current_kit_id') || localStorage.getItem('thea_currentkit_id') || '')
            : '';
          const isActive = Boolean(activeKitId && item.key.endsWith(`_${activeKitId}`));
          if (isActive && typeof localStorage !== 'undefined' && !localStorage.getItem(item.key)) {
            const valStr = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
            safeLocalStorageSetItem(item.key, valStr);
          }
          restoredCount++;
        }
      }

      if (restoredCount > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { restoredCount } }));
      }

      return restoredCount;
    } catch {
      return 0;
    }
  },

  /**
   * Guarda el instante exacto de la sesión de Smart Study en LocalStorage e IndexedDB,
   * emitiendo un evento en vivo para que HomeView y Google Drive sincronicen cuando corresponde.
   */
  saveSmartStudySession(
    userId: string | null,
    rawKitId: string,
    state: SmartStudySessionState,
    options?: { source?: 'local' | 'remote_sync' | 'idb_restore' }
  ): void {
    const source = options?.source || 'local';
    try {
      const kitId = extractCleanKitId(rawKitId);
      if (!kitId) return;
      const sanitized = sanitizeSmartStudySession(state) || state;
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      
      inMemorySessionCache.set(key, sanitized);

      // Desprender datos pesados binarios base64 de la pregunta activa para aligerar LocalStorage (<5KB)
      const cleanCurrentQ = sanitized.currentQuestion ? {
        ...sanitized.currentQuestion,
        sourceAsset: sanitized.currentQuestion.sourceAsset ? {
          id: sanitized.currentQuestion.sourceAsset.id,
          type: sanitized.currentQuestion.sourceAsset.type,
          caption: sanitized.currentQuestion.sourceAsset.caption,
          pageOrSlide: sanitized.currentQuestion.sourceAsset.pageOrSlide,
          contextNearby: sanitized.currentQuestion.sourceAsset.contextNearby,
        } : undefined
      } : undefined;

      const compactSession = {
        ...sanitized,
        currentQuestion: cleanCurrentQ,
        answeredQuestionIds: Array.isArray((sanitized as any).answeredQuestionIds)
          ? (sanitized as any).answeredQuestionIds.slice(-200)
          : Array.from(new Set((sanitized.history || []).map((h: any) => h.questionId).filter(Boolean))),
        history: Array.isArray(sanitized.history) ? sanitized.history.slice(0, 15).map(h => ({
          id: h.id,
          questionId: h.questionId,
          questionText: (h.questionText || '').slice(0, 120),
          userAnswer: (h.userAnswer || '').slice(0, 80),
          correctAnswer: (h.correctAnswer || '').slice(0, 80),
          explanation: (h.explanation || '').slice(0, 120),
          topic: h.topic,
          difficulty: h.difficulty,
          type: h.type,
          isCorrect: h.isCorrect,
          timestamp: h.timestamp,
          timestampEpoch: h.timestampEpoch,
          attemptNumber: h.attemptNumber,
          level: h.level,
        })) : [],
      };
      safeLocalStorageSetItem(key, JSON.stringify(compactSession));
      
      saveSessionItem(key, sanitized).catch(() => {});

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thea_session_saved', {
          detail: { userId, kitId, state: sanitized, source }
        }));
        window.dispatchEvent(new CustomEvent('thea_progress_synced', {
          detail: { userId, kitId, state: sanitized, source }
        }));
      }
    } catch (e) {
      console.error('Error al guardar memoria de Smart Study', e);
    }
  },

  /**
   * Obtiene un mapa de todas las sesiones de Smart Study para un usuario dado.
   */
  getAllSmartStudySessions(userId: string | null): Record<string, SmartStudySessionState> {
    const result: Record<string, SmartStudySessionState> = {};
    const targetUserId = userId || 'guest';
    const prefix = `thea_ss_mem_${targetUserId}_`;

    // 1. Incorporar lo presente en inMemorySessionCache ignorando claves corruptas o anidadas
    for (const [k, session] of inMemorySessionCache.entries()) {
      if (k.startsWith(prefix) && !isCorruptedStorageKey(k) && session) {
        const rawKitId = k.substring(prefix.length);
        const kitId = extractCleanKitId(rawKitId);
        if (kitId && rawKitId === kitId && isSessionNewerOrBetter(session, result[kitId])) {
          result[kitId] = session;
        }
      }
    }

    if (typeof localStorage === 'undefined') return result;

    // 2. Conciliar con LocalStorage preservando siempre la instantánea más reciente
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith(prefix) && !isCorruptedStorageKey(key)) {
        const rawKitId = key.substring(prefix.length);
        const kitId = extractCleanKitId(rawKitId);
        if (!kitId || rawKitId !== kitId) continue;
        const sanitized = readLocalStorageSmartStudySession(key);
        if (sanitized && isSessionNewerOrBetter(sanitized, result[kitId])) {
          result[kitId] = sanitized;
          inMemorySessionCache.set(key, sanitized);
        }
      }
    }
    return result;
  },

  /**
   * Obtiene TODAS las sesiones de Smart Study combinando RAM, LocalStorage e IndexedDB,
   * evitando perder avance de kits inactivos y protegiendo la sesión más reciente contra copias obsoletas.
   */
  async getAllSmartStudySessionsAsync(userId: string | null): Promise<Record<string, SmartStudySessionState>> {
    const result = this.getAllSmartStudySessions(userId);
    const targetUserId = userId || 'guest';
    const prefix = `thea_ss_mem_${targetUserId}_`;
    try {
      const idbMap = await getSessionItemsByPrefix<SmartStudySessionState>(prefix);
      for (const [rawKitId, rawSession] of Object.entries(idbMap)) {
        const fullKey = `${prefix}${rawKitId}`;
        if (isCorruptedStorageKey(fullKey)) {
          removeSessionItem(fullKey).catch(() => {});
          continue;
        }
        const kitId = extractCleanKitId(rawKitId);
        if (!kitId || rawKitId !== kitId || !rawSession) continue;
        const sanitized = sanitizeSmartStudySession(rawSession);
        if (!sanitized) continue;

        const canonicalKey = `${prefix}${kitId}`;
        const existing = result[kitId] || inMemorySessionCache.get(canonicalKey) || readLocalStorageSmartStudySession(canonicalKey);
        if (!existing || isSessionNewerOrBetter(sanitized, existing)) {
          inMemorySessionCache.set(canonicalKey, sanitized);
          result[kitId] = sanitized;
        }
      }
    } catch {}
    return result;
  },

  /**
   * Obtiene todos los conjuntos de preguntas reveladas del usuario.
   */
  getAllRevealedQuestionIds(userId: string | null): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (typeof localStorage === 'undefined') return result;

    const prefix = `thea_revealed_q_${userId || 'guest'}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && !isCorruptedStorageKey(key)) {
        const rawKitId = key.substring(prefix.length);
        const kitId = extractCleanKitId(rawKitId);
        if (!kitId) continue;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            result[kitId] = JSON.parse(raw);
          }
        } catch {}
      }
    }
    return result;
  },

  /**
   * Obtiene todas las preguntas reveladas combinando LocalStorage e IndexedDB.
   */
  async getAllRevealedQuestionIdsAsync(userId: string | null): Promise<Record<string, string[]>> {
    const result = this.getAllRevealedQuestionIds(userId);
    const prefix = `thea_revealed_q_${userId || 'guest'}_`;
    try {
      const idbMap = await getSessionItemsByPrefix<string[]>(prefix);
      for (const [rawKitId, arr] of Object.entries(idbMap)) {
        const kitId = extractCleanKitId(rawKitId);
        if (!kitId || !Array.isArray(arr)) continue;
        result[kitId] = Array.from(new Set([...(result[kitId] || []), ...arr]));
      }
    } catch {}
    return result;
  },

  /** Obtiene el progreso de flashcards guardado para el usuario y kit especificos. */
  getFlashcardProgress(userId: string | null, kitId: string): FlashcardProgressState | null {
    return flashcardProgressService.getFlashcardProgress(userId, kitId);
  },

  /** Recupera de forma asincrona el progreso de flashcards desde IndexedDB si LocalStorage fue purgado. */
  async restoreFlashcardProgressAsync(userId: string | null, kitId: string): Promise<FlashcardProgressState | null> {
    return flashcardProgressService.restoreFlashcardProgressAsync(userId, kitId);
  },

  /** Guarda de forma atomica el progreso de flashcards en LocalStorage e IndexedDB en tiempo real. */
  saveFlashcardProgress(userId: string | null, kitId: string, state: FlashcardProgressState): void {
    flashcardProgressService.saveFlashcardProgress(userId, kitId, state);
  },

  /** Obtiene todos los progresos de flashcards guardados para un usuario. */
  getAllFlashcardProgress(userId: string | null): Record<string, FlashcardProgressState> {
    return flashcardProgressService.getAllFlashcardProgress(userId);
  },

  /** Guarda o actualiza un lote completo de progresos de flashcards. */
  saveAllFlashcardProgress(
    userId: string | null,
    progressMap: Record<string, FlashcardProgressState>,
    options?: { source?: 'local' | 'remote_sync' }
  ): boolean {
    return flashcardProgressService.saveAllFlashcardProgress(userId, progressMap, options);
  },

  /** Elimina el progreso de flashcards de un kit. */
  removeFlashcardProgress(userId: string | null, kitId: string): void {
    flashcardProgressService.removeFlashcardProgress(userId, kitId);
  },

  /**
   * Fusiona una sesión entrante (ej. descargada de Google Drive) con la sesión local
   * sincronizando el progreso exacto sin subir ni bajar arbitrariamente el nivel real.
   * Devuelve true solo si hubo cambios reales respecto al estado local previo.
   */
  mergeSmartStudySession(
    userId: string | null,
    kitId: string,
    incomingSession: SmartStudySessionState,
    options?: { source?: 'local' | 'remote_sync' }
  ): boolean {
    const source = options?.source || 'remote_sync';
    if (!incomingSession) return false;
    const sanitizedIncoming = sanitizeSmartStudySession(incomingSession);
    if (!sanitizedIncoming) return false;

    const rawCurrent = this.getSmartStudySession(userId, kitId);
    if (!rawCurrent) {
      this.saveSmartStudySession(userId, kitId, sanitizedIncoming, { source });
      return true;
    }

    const localSession = sanitizeSmartStudySession(rawCurrent) || rawCurrent;
    const localResetAt = localSession.resetAt || 0;
    const incomingResetAt = sanitizedIncoming.resetAt || 0;
    const localLastUpdated = localSession.lastUpdated || 0;
    const incomingLastUpdated = sanitizedIncoming.lastUpdated || 0;

    // Respetar reinicios explícitos más recientes para que el progreso viejo del otro dispositivo no resucite
    if (incomingResetAt > localResetAt && incomingResetAt >= localLastUpdated) {
      if (areSmartStudySessionsEquivalent(localSession, sanitizedIncoming)) return false;
      this.saveSmartStudySession(userId, kitId, sanitizedIncoming, { source });
      return true;
    }
    if (localResetAt > incomingResetAt && localResetAt >= incomingLastUpdated) {
      return false;
    }

    // Fusión por marca temporal: si ambos dispositivos han progresado desde el mismo punto,
    // combinamos historial nuevo y tomamos el avance más reciente o mayor si empatan.
    const incomingClearlyNewer = incomingLastUpdated > localLastUpdated + 2000;
    const localClearlyNewer = localLastUpdated > incomingLastUpdated + 2000;

    const mergedL1 = incomingClearlyNewer && incomingResetAt > 0
      ? (sanitizedIncoming.levelCorrectCounts?.[1] || 0)
      : Math.min(25, Math.max(localSession.levelCorrectCounts?.[1] || 0, sanitizedIncoming.levelCorrectCounts?.[1] || 0));
    const mergedL2 = incomingClearlyNewer && incomingResetAt > 0
      ? (sanitizedIncoming.levelCorrectCounts?.[2] || 0)
      : Math.min(25, Math.max(localSession.levelCorrectCounts?.[2] || 0, sanitizedIncoming.levelCorrectCounts?.[2] || 0));
    const mergedL3 = incomingClearlyNewer && incomingResetAt > 0
      ? (sanitizedIncoming.levelCorrectCounts?.[3] || 0)
      : Math.min(25, Math.max(localSession.levelCorrectCounts?.[3] || 0, sanitizedIncoming.levelCorrectCounts?.[3] || 0));

    let finalLevel: 1 | 2 | 3 = 1;
    let finalCurrentCount = mergedL1;
    if (mergedL1 >= 25) {
      if (mergedL2 >= 25) {
        finalLevel = 3;
        finalCurrentCount = mergedL3;
      } else {
        finalLevel = 2;
        finalCurrentCount = mergedL2;
      }
    }

    const mergedRevealed = Array.from(new Set([
      ...(localSession.revealedQuestionIds || []),
      ...(sanitizedIncoming.revealedQuestionIds || []),
    ]));

    const getEpoch = (h: any): number => {
      if (typeof h?.timestampEpoch === 'number' && !isNaN(h.timestampEpoch)) return h.timestampEpoch;
      const match = (h?.id || '').match(/^hist-(\d+)/);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val)) return val;
      }
      return 0;
    };

    const existingHistKeys = new Set((localSession.history || []).map((h: any) => `${h.questionId || ''}_${h.timestamp || ''}_${h.id || ''}`));
    const mergedHistory = [...(localSession.history || [])];
    for (const h of (sanitizedIncoming.history || [])) {
      const key = `${h.questionId || ''}_${h.timestamp || ''}_${h.id || ''}`;
      if (!existingHistKeys.has(key)) {
        mergedHistory.push(h);
        existingHistKeys.add(key);
      }
    }
    // Ordenar historial por fecha más reciente descendente (última pregunta respondida primero)
    mergedHistory.sort((a, b) => {
      const epA = getEpoch(a);
      const epB = getEpoch(b);
      if (epA !== epB) return epB - epA;
      if (typeof b.attemptNumber === 'number' && typeof a.attemptNumber === 'number') {
        return b.attemptNumber - a.attemptNumber;
      }
      return 0;
    });

    const mergedAnsweredIds = Array.from(new Set([
      ...((localSession as any).answeredQuestionIds || []),
      ...((sanitizedIncoming as any).answeredQuestionIds || []),
      ...mergedHistory.map((h: any) => h.questionId).filter(Boolean)
    ]));
    const mergedAnsweredSet = new Set(mergedAnsweredIds);

    // Determinar cuál sesión tenía el contexto activo más reciente para cursor y estado de pregunta actual,
    // protegiendo contra cursores obsoletos o rebotes que apunten a una pregunta ya superada localmente.
    let isIncomingMoreRecent = incomingLastUpdated > localLastUpdated && !localClearlyNewer;
    if (isIncomingMoreRecent && localResetAt === incomingResetAt) {
      const localProgress = getSessionProgressRank(localSession);
      const incomingProgress = getSessionProgressRank(sanitizedIncoming);
      const incomingQId = sanitizedIncoming.currentQuestionId || sanitizedIncoming.currentQuestion?.id;
      const localQId = localSession.currentQuestionId || localSession.currentQuestion?.id;
      const incomingPointsToAlreadyAnswered = Boolean(
        incomingQId &&
        mergedAnsweredSet.has(incomingQId) &&
        !sanitizedIncoming.isAnswered &&
        localQId &&
        !mergedAnsweredSet.has(localQId)
      );
      if (
        incomingPointsToAlreadyAnswered ||
        (!incomingClearlyNewer && localProgress > incomingProgress)
      ) {
        isIncomingMoreRecent = false;
      }
    }

    const activeContext = isIncomingMoreRecent ? sanitizedIncoming : localSession;
    const latestResetAt = Math.max(localResetAt, incomingResetAt);

    const mergedSession: SmartStudySessionState = {
      ...activeContext,
      level: finalLevel,
      levelCorrectCount: finalCurrentCount,
      levelCorrectCounts: {
        1: mergedL1,
        2: finalLevel >= 2 ? mergedL2 : 0,
        3: finalLevel === 3 ? mergedL3 : 0,
      },
      revealedQuestionIds: mergedRevealed,
      answeredQuestionIds: mergedAnsweredIds,
      history: mergedHistory.slice(0, 50),
      questionsAnsweredTotal: Math.max(
        localSession.questionsAnsweredTotal || 0,
        sanitizedIncoming.questionsAnsweredTotal || 0,
        mergedL1 + mergedL2 + mergedL3,
        mergedHistory.length
      ),
      lastUpdated: Math.max(localLastUpdated, incomingLastUpdated),
      ...(latestResetAt > 0 ? { resetAt: latestResetAt } : {}),
    };

    if (areSmartStudySessionsEquivalent(localSession, mergedSession)) {
      return false;
    }

    this.saveSmartStudySession(userId, kitId, mergedSession, { source });
    return true;
  },

  /**
   * Guarda y fusiona en lote las sesiones de estudio y preguntas reveladas recibidas desde Google Drive.
   */
  saveAllSmartStudySessions(
    userId: string | null,
    sessions: Record<string, SmartStudySessionState>,
    revealedQuestions?: Record<string, string[]>,
    options?: { source?: 'local' | 'remote_sync' }
  ): boolean {
    if (!sessions || typeof sessions !== 'object') return false;
    const source = options?.source || 'remote_sync';
    let anyChanged = false;

    for (const [rawKitId, session] of Object.entries(sessions)) {
      if (isCorruptedStorageKey(`thea_ss_mem_${userId || 'guest'}_${rawKitId}`)) continue;
      const kitId = extractCleanKitId(rawKitId);
      if (kitId && session && typeof session === 'object') {
        if (this.mergeSmartStudySession(userId, kitId, session, { source })) {
          anyChanged = true;
        }
      }
    }

    if (revealedQuestions && typeof revealedQuestions === 'object') {
      for (const [rawKitId, ids] of Object.entries(revealedQuestions)) {
        const kitId = extractCleanKitId(rawKitId);
        if (kitId && Array.isArray(ids)) {
          const current = this.getRevealedQuestionIds(userId, kitId);
          const union = Array.from(new Set([...current, ...ids]));
          if (union.length > current.length) {
            const key = `thea_revealed_q_${userId || 'guest'}_${kitId}`;
            try {
              safeLocalStorageSetItem(key, JSON.stringify(union));
              saveSessionItem(key, union).catch(() => {});
              anyChanged = true;
            } catch {}
          }
        }
      }
    }

    if (anyChanged && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { userId, source } }));
    }
    return anyChanged;
  },

  /**
   * Borra total e inmediatamente todos los datos temporales del modo invitado
   * (kits, progreso de Smart Study, preguntas reveladas y caché de sesión) tanto de LocalStorage
   * como de IndexedDB al iniciar sesión, evitando cualquier contaminación cruzada con la nube.
   */
  clearGuestData(): void {
    try {
      inMemoryKitsCache.delete('thea_guest_kits');
      localStorage.removeItem('thea_guest_kits');
      localStorage.removeItem('thea_guest_kits_index');
      localStorage.removeItem('thea_study_kits_v2');

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('thea_ss_mem_guest_') ||
           key.startsWith('thea_revealed_q_guest_') ||
           key.startsWith('thea_guest_'))
        ) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        inMemorySessionCache.delete(k);
        localStorage.removeItem(k);
        removeSessionItem(k).catch(() => {});
      }

      removeSessionItem('thea_guest_kits').catch(() => {});
      removeSessionItem('thea_guest_kits_index').catch(() => {});
      removeSessionItem('thea_study_kits_v2').catch(() => {});
      localStorage.removeItem('thea_custom_materias');
      removeSessionItem('thea_custom_materias').catch(() => {});
    } catch (e) {
      console.warn('[authService] Error al limpiar datos de invitado:', e);
    }
  },

  /**
   * @deprecated Prohibido fusionar datos de invitado con la cuenta de usuario.
   * Ejecuta en su lugar un borrado limpio de datos de invitado.
   */
  migrateGuestProgressToUser(_userId: string): void {
    this.clearGuestData();
  },

  /**
   * Limpia la memoria de un kit si el usuario decide reiniciar su progreso.
   */
  clearSmartStudySession(userId: string | null, rawKitId: string): void {
    try {
      const kitId = extractCleanKitId(rawKitId);
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      inMemorySessionCache.delete(key);
      localStorage.removeItem(key);
      removeSessionItem(key).catch(() => {});
    } catch (e) {
      console.error(e);
    }
  },

  /**
   * Obtiene los IDs de preguntas que han sido reveladas voluntariamente en el banco de preguntas.
   */
  getRevealedQuestionIds(userId: string | null, kitId: string): string[] {
    try {
      const key = `thea_revealed_q_${userId || 'guest'}_${kitId}`;
      const raw = localStorage.getItem(key);
      const list: string[] = raw ? JSON.parse(raw) : [];

      // Sincronizar también con la memoria de sesión si existiera
      const session = this.getSmartStudySession(userId, kitId);
      if (session?.revealedQuestionIds && Array.isArray(session.revealedQuestionIds)) {
        for (const id of session.revealedQuestionIds) {
          if (!list.includes(id)) list.push(id);
        }
      }
      return list;
    } catch {
      return [];
    }
  },

  /**
   * Registra una pregunta como revelada en el banco para que no sume avance en SmartStudy.
   */
  markQuestionAsRevealed(userId: string | null, kitId: string, questionId: string): void {
    try {
      const current = this.getRevealedQuestionIds(userId, kitId);
      if (!current.includes(questionId)) {
        current.push(questionId);
      }
      const key = `thea_revealed_q_${userId || 'guest'}_${kitId}`;
      safeLocalStorageSetItem(key, JSON.stringify(current));
      saveSessionItem(key, current).catch(() => {});

      // Actualizar también la sesión activa para consistencia inmediata
      const session = this.getSmartStudySession(userId, kitId);
      if (session) {
        session.revealedQuestionIds = current;
        this.saveSmartStudySession(userId, kitId, session);
      }
    } catch (e) {
      console.error('Error al registrar pregunta revelada', e);
    }
  },

  /**
   * Obtiene la configuración de IA guardada para un usuario específico.
   */
  getUserAISettings(userId: string | null): AISettings | null {
    if (!userId) return null;
    try {
      const key = `thea_user_ai_settings_${userId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const hasKey = Boolean(
          (parsed.apiKey && parsed.apiKey.trim().length > 0) ||
          (parsed.geminiApiKey && parsed.geminiApiKey.trim().length > 0) ||
          (parsed.grokApiKey && parsed.grokApiKey.trim().length > 0) ||
          (parsed.groqApiKey && parsed.groqApiKey.trim().length > 0)
        );
        if (hasKey) return parsed;
      }
      // Buscar también dentro del registro de usuario
      const users = getStoredUsers();
      const user = users.find(u => u.id === userId);
      const userHasKey = Boolean(
        (user?.aiSettings?.apiKey && user.aiSettings.apiKey.trim().length > 0) ||
        (user?.aiSettings?.geminiApiKey && user.aiSettings.geminiApiKey.trim().length > 0) ||
        (user?.aiSettings?.grokApiKey && user.aiSettings.grokApiKey.trim().length > 0) ||
        (user?.aiSettings?.groqApiKey && user.aiSettings.groqApiKey.trim().length > 0)
      );
      if (user?.aiSettings && userHasKey) {
        return user.aiSettings;
      }
      return raw ? JSON.parse(raw) : (user?.aiSettings || null);
    } catch (e) {
      console.error('Error al leer configuración de IA del usuario', e);
      return null;
    }
  },

  /**
   * Guarda la configuración de IA asociada al perfil de un usuario específico.
   */
  saveUserAISettings(userId: string | null, settings: AISettings): void {
    if (!userId) return;
    try {
      const key = `thea_user_ai_settings_${userId}`;
      safeLocalStorageSetItem(key, JSON.stringify(settings));

      // Guardar también dentro del registro de usuario para sincronización con Google Drive
      const users = getStoredUsers();
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex >= 0) {
        users[userIndex].aiSettings = settings;
        saveStoredUsers(users);
      }
    } catch (e) {
      console.error('Error al guardar configuración de IA del usuario', e);
    }
  },

  /**
   * Obtiene la configuración de Podcast guardada para un usuario específico.
   */
  getUserPodcastSettings(userId: string | null): PodcastSettings | null {
    if (!userId) return null;
    try {
      const key = `thea_user_podcast_settings_${userId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
      const users = getStoredUsers();
      const user = users.find(u => u.id === userId);
      return user?.podcastSettings || null;
    } catch (e) {
      console.error('Error al leer configuración de podcast del usuario', e);
      return null;
    }
  },

  /**
   * Guarda la configuración de Podcast asociada al perfil de un usuario específico.
   */
  saveUserPodcastSettings(userId: string | null, settings: PodcastSettings): void {
    if (!userId) return;
    try {
      const key = `thea_user_podcast_settings_${userId}`;
      safeLocalStorageSetItem(key, JSON.stringify(settings));

      const users = getStoredUsers();
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex >= 0) {
        users[userIndex].podcastSettings = settings;
        saveStoredUsers(users);
      }
    } catch (e) {
      console.error('Error al guardar configuración de podcast del usuario', e);
    }
  }
};
