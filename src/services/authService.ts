import type { User, StudyKit, SmartStudySessionState, PodcastSettings, FlashcardProgressState } from '../types';
import type { AISettings } from './aiService';
import { DEFAULT_STUDY_KITS } from '../data/defaultKits';
import {
  saveAssetsFromKits,
  stripHeavyAssetsForLocalStorage,
  saveSessionItem,
  getSessionItem,
  removeSessionItem,
  requestPersistentStorage,
  isCorruptedKit,
  saveKitsToIndexedDB,
  getKitsFromIndexedDB,
  mergeKitsByUpdatedAt,
  getDeletedKitIds,
  notifyQuotaExceeded,
  type StudyKitIndexItem
} from './storageService';

const inMemoryKitsCache = new Map<string, StudyKit[]>();
const flashcardIdbTimers = new Map<string, any>();

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
    localStorage.setItem(STORAGE_CURRENT_SESSION_KEY, userId);
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
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    saveSessionItem(STORAGE_USERS_KEY, users).catch(() => {});
  } catch (e) {
    console.error('Error al guardar usuarios en localStorage', e);
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

  const history = Array.isArray(session.history) ? session.history : [];
  const correctInHistory = history.filter((h: any) => h && h.isCorrect).length;
  const answeredTotal = Math.max(
    typeof session.questionsAnsweredTotal === 'number' ? session.questionsAnsweredTotal : 0,
    history.length,
    correctInHistory
  );

  // Si no hay ninguna pregunta respondida ni aciertos en historial, el nivel exacto es 1 con 0 aciertos
  if (answeredTotal === 0 && correctInHistory === 0) {
    return {
      ...session,
      level: 1,
      levelCorrectCount: 0,
      levelCorrectCounts: { 1: 0, 2: 0, 3: 0 },
      currentIndex: 0,
      questionsAnsweredTotal: 0,
    };
  }

  let l1 = typeof session.levelCorrectCounts?.[1] === 'number' ? session.levelCorrectCounts[1] : 0;
  let l2 = typeof session.levelCorrectCounts?.[2] === 'number' ? session.levelCorrectCounts[2] : 0;
  let l3 = typeof session.levelCorrectCounts?.[3] === 'number' ? session.levelCorrectCounts[3] : 0;

  // Si no venía levelCorrectCounts detallado
  if (!session.levelCorrectCounts && typeof session.levelCorrectCount === 'number') {
    if (session.level === 1) l1 = session.levelCorrectCount;
    else if (session.level === 2) { l1 = 25; l2 = session.levelCorrectCount; }
    else if (session.level === 3) { l1 = 25; l2 = 25; l3 = session.levelCorrectCount; }
  }

  // Si los aciertos declarados exceden el total respondido, calibrar con el historial
  const claimedCorrect = l1 + l2 + l3;
  if (claimedCorrect > answeredTotal && answeredTotal > 0) {
    if (correctInHistory > 0) {
      l1 = history.filter((h: any) => h.isCorrect && (h.level === 1 || !h.level)).length;
      l2 = history.filter((h: any) => h.isCorrect && h.level === 2).length;
      l3 = history.filter((h: any) => h.isCorrect && h.level === 3).length;
    } else {
      l1 = Math.min(25, answeredTotal);
      l2 = 0;
      l3 = 0;
    }
  }

  // Determinar el nivel real exacto ganado:
  let realLevel: 1 | 2 | 3 = 1;
  if (l1 >= 25) {
    if (l2 >= 25) {
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

  if (realLevel === 2) {
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
  };
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
          localStorage.setItem(STORAGE_CURRENT_SESSION_KEY, currentId);
        }
      }
      if (!currentId) return null;
      const users = getStoredUsers();
      const user = users.find(u => u.id === currentId);
      if (!user) return null;
      const { passwordHash: _, ...safeUser } = user;
      return safeUser;
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
    const initialKits = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
    localStorage.setItem(`thea_user_kits_${newUser.id}`, JSON.stringify(initialKits));

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
          const initialKits = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
          localStorage.setItem(key, JSON.stringify(initialKits));
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

  /**
   * Carga los kits asociados al usuario o a la sesión de invitado de manera síncrona.
   * Utiliza la memoria caché rápida, el índice liviano o LocalStorage sin sobreescribir datos existentes.
   */
  getUserKits(userId: string | null): StudyKit[] {
    try {
      const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';

      // 1. Memoria rápida inmediata
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

      // 3. Fallback a índice liviano en LocalStorage si los kits completos fueron movidos a IndexedDB
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
      console.error('[authService] Error al obtener kits de usuario:', e);
      return [];
    }
  },

  /**
   * Restaura los kits asíncronamente desde IndexedDB con tolerancia a fallos.
   * Evita pérdidas de datos si LocalStorage fue purgado o se alcanzó la cuota.
   */
  async restoreUserKitsAsync(userId: string | null): Promise<StudyKit[]> {
    try {
      const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';
      const deletedIds = getDeletedKitIds();

      // 1. Intentar leer de IndexedDB primero para recuperar kits íntegros con sus activos
      let idbKits = await getKitsFromIndexedDB(key);
      if (!idbKits || idbKits.length === 0) {
        idbKits = await getKitsFromIndexedDB('thea_study_kits_v2');
      }

      const memKits = inMemoryKitsCache.get(key) || [];
      let merged: StudyKit[] = [];

      if (idbKits && idbKits.length > 0) {
        // Si memKits tiene elementos completos, fusionar por updatedAt.
        // Si memKits solo contenía esquemas vacíos del índice, los de IndexedDB prevalecen en detalle.
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

      // 2. Fallback síncrono si IndexedDB aún no tenía datos
      const localKits = this.getUserKits(userId);
      if (localKits && localKits.length > 0) {
        return localKits;
      }

      // 3. Si es sesión de invitado nueva, inicializar de fábrica
      if (!userId) {
        const defaults = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
        this.saveUserKits(null, defaults);
        return defaults;
      }

      return [];
    } catch (e) {
      console.error('[authService] Error al restaurar kits asíncronamente:', e);
      return this.getUserKits(userId);
    }
  },

  /**
   * Escribe el índice ligero en LocalStorage para garantizar disponibilidad inmediata tras reinicio.
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
   * Actualiza el indicador de sincronización en el índice de kits cuando la subida a Drive culmina.
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
   * Vuelca de manera síncrona el estado de kits antes del cierre de pestaña (pagehide / visibilitychange).
   */
  flushKitsSync(userId: string | null, kits: StudyKit[]): void {
    try {
      this.saveUserKits(userId, kits);
    } catch (e) {
      console.warn('[authService] Error en flushKitsSync:', e);
    }
  },

  /**
   * Guarda los kits para el usuario actual o invitado de forma asíncrona asegurando confirmación en IndexedDB.
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
   * Restablece los kits de estudio iniciales de fábrica para el usuario actual o invitado.
   */
  resetToDefaultKits(userId: string | null): StudyKit[] {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
    this.saveUserKits(userId, defaults);
    return defaults;
  },

  /**
   * Guarda los kits para el usuario actual o invitado.
   * Transfiere automáticamente los activos pesados a IndexedDB y almacena un índice ligero en LocalStorage.
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

    // 2. Escribir índice ligero en LocalStorage
    this.writeIndexToLocalStorage(userId, cleanKits, true);

    // 3. Intentar guardar versión aligerada en LocalStorage protegiendo la cuota
    try {
      const lightweight = stripHeavyAssetsForLocalStorage(cleanKits);
      const serialized = JSON.stringify(lightweight);
      if (serialized.length < 2500000) {
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

    // 4. Guardar inmediatamente en IndexedDB (almacén primario completo)
    saveKitsToIndexedDB(key, cleanKits).catch((err) => {
      console.warn('[authService] Error guardando kits en IndexedDB:', err);
    });

    // 5. Extraer y persistir activos pesados en IndexedDB
    saveAssetsFromKits(cleanKits).catch((err) => {
      console.warn('[authService] Error guardando activos en IndexedDB:', err);
    });
  },


  /**
   * Obtiene la sesión de Smart Study guardada (memoria total en tiempo real).
   * Cuenta con fallback transparente a la sesión de invitado si el usuario no tenía progreso previo en este kit.
   */
  getSmartStudySession(userId: string | null, kitId: string): SmartStudySessionState | null {
    try {
      const userKey = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      const raw = localStorage.getItem(userKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeSmartStudySession(parsed);
      if (sanitized && (sanitized.level !== parsed.level || sanitized.levelCorrectCount !== parsed.levelCorrectCount)) {
        localStorage.setItem(userKey, JSON.stringify(sanitized));
        saveSessionItem(userKey, sanitized).catch(() => {});
      }
      return sanitized;
    } catch (e) {
      console.error('Error al leer memoria de Smart Study', e);
      return null;
    }
  },

  /**
   * Guarda el instante exacto de la sesión de Smart Study en LocalStorage e IndexedDB,
   * emitiendo un evento en vivo para que HomeView y Google Drive sincronicen de inmediato.
   */
  saveSmartStudySession(userId: string | null, kitId: string, state: SmartStudySessionState): void {
    try {
      const sanitized = sanitizeSmartStudySession(state) || state;
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      localStorage.setItem(key, JSON.stringify(sanitized));
      saveSessionItem(key, sanitized).catch(() => {});

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thea_session_saved', {
          detail: { userId, kitId, state: sanitized }
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
    if (typeof localStorage === 'undefined') return result;

    const prefix = `thea_ss_mem_${userId || 'guest'}_`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith(prefix)) {
        const kitId = key.substring(prefix.length);
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const sanitized = sanitizeSmartStudySession(JSON.parse(raw));
            if (sanitized) result[kitId] = sanitized;
          }
        } catch {}
      }
    }
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
      if (key && key.startsWith(prefix)) {
        const kitId = key.substring(prefix.length);
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
   * Obtiene el progreso de flashcards guardado para el usuario y kit específicos (persistencia inmediata y total).
   * Cuenta con fallback a sesión de invitado si no existe sesión para el usuario.
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
      // Fallback a invitado si el usuario aún no tiene progreso registrado
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
      console.warn('[authService] Error al leer memoria de Flashcards:', e);
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
      console.warn('[authService] Error al restaurar memoria de Flashcards desde IndexedDB:', e);
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
              normalizedMap[c.term] = m;
              normalizedMap[c.term.trim()] = m;
              normalizedMap[c.term.trim().toLowerCase()] = m;
            }
          }
        });
      }

      const cleanState: FlashcardProgressState = {
        version: 1,
        updatedAt: state.updatedAt || Date.now(),
        kitId,
        cards: state.cards,
        archivedCards: state.archivedCards,
        masteryMap: normalizedMap,
        currentIdx: typeof state.currentIdx === 'number' ? state.currentIdx : 0,
      };

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(userKey, JSON.stringify(cleanState));
        } catch (err) {
          try {
            // Si la cuota de LocalStorage está saturada, guardar versión ultra-compacta (sin imágenes)
            const compactCards = cleanState.cards?.map(c => ({
              id: c.id,
              term: c.term,
              definition: c.definition ? c.definition.slice(0, 200) : '',
              mastery: c.mastery,
              type: c.type,
            }));
            const compactArchived = cleanState.archivedCards?.map(c => ({
              id: c.id,
              term: c.term,
              definition: c.definition ? c.definition.slice(0, 200) : '',
              mastery: c.mastery,
              type: c.type,
            }));
            const compactState: FlashcardProgressState = {
              version: 1,
              updatedAt: cleanState.updatedAt,
              kitId,
              cards: compactCards,
              archivedCards: compactArchived,
              masteryMap: normalizedMap,
              currentIdx: cleanState.currentIdx,
            };
            localStorage.setItem(userKey, JSON.stringify(compactState));
          } catch (compactErr) {
            notifyQuotaExceeded(compactErr);
          }
        }
      }
      // Persistencia diferida hacia IndexedDB y eventos en vivo con debounce de 350ms
      // Previene saturacion del bucle de eventos y de memoria (OOM) ante clics sucesivos ultrarrapidos
      if (flashcardIdbTimers.has(userKey)) {
        clearTimeout(flashcardIdbTimers.get(userKey));
      }
      const timer = setTimeout(() => {
        flashcardIdbTimers.delete(userKey);
        saveSessionItem(userKey, cleanState).catch(() => {});
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('thea_flashcard_saved', {
            detail: { userId, kitId, state: cleanState }
          }));
        }
      }, 350);
      flashcardIdbTimers.set(userKey, timer);
    } catch (e) {
      console.warn('[authService] Error al guardar memoria de Flashcards:', e);
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

  /**
   * Fusiona una sesión entrante (ej. descargada de Google Drive) con la sesión local
   * sincronizando el progreso exacto sin subir ni bajar arbitrariamente el nivel real.
   */
  mergeSmartStudySession(userId: string | null, kitId: string, incomingSession: SmartStudySessionState): void {
    if (!incomingSession) return;
    const sanitizedIncoming = sanitizeSmartStudySession(incomingSession);
    if (!sanitizedIncoming) return;

    const rawCurrent = this.getSmartStudySession(userId, kitId);
    if (!rawCurrent) {
      this.saveSmartStudySession(userId, kitId, sanitizedIncoming);
      return;
    }

    const localSession = sanitizeSmartStudySession(rawCurrent) || rawCurrent;

    // Comparar aciertos acumulados reales para que la sincronización sea exacta
    const localTotalCorrect = (localSession.levelCorrectCounts?.[1] || 0) + (localSession.levelCorrectCounts?.[2] || 0) + (localSession.levelCorrectCounts?.[3] || 0);
    const incomingTotalCorrect = (sanitizedIncoming.levelCorrectCounts?.[1] || 0) + (sanitizedIncoming.levelCorrectCounts?.[2] || 0) + (sanitizedIncoming.levelCorrectCounts?.[3] || 0);

    let isIncomingBetter = false;
    if (incomingTotalCorrect > localTotalCorrect) {
      isIncomingBetter = true;
    } else if (incomingTotalCorrect === localTotalCorrect) {
      const localAnswered = localSession.questionsAnsweredTotal || (localSession.history ? localSession.history.length : 0);
      const incomingAnswered = sanitizedIncoming.questionsAnsweredTotal || (sanitizedIncoming.history ? sanitizedIncoming.history.length : 0);
      if (incomingAnswered > localAnswered) {
        isIncomingBetter = true;
      } else if (incomingAnswered === localAnswered) {
        isIncomingBetter = (sanitizedIncoming.lastUpdated || 0) > (localSession.lastUpdated || 0);
      }
    }

    const baseSession = isIncomingBetter ? sanitizedIncoming : localSession;
    const otherSession = isIncomingBetter ? localSession : sanitizedIncoming;

    const mergedRevealed = Array.from(new Set([
      ...(baseSession.revealedQuestionIds || []),
      ...(otherSession.revealedQuestionIds || []),
    ]));

    const existingHistKeys = new Set((baseSession.history || []).map((h: any) => `${h.questionId || ''}_${h.timestamp || ''}`));
    const mergedHistory = [...(baseSession.history || [])];
    for (const h of (otherSession.history || [])) {
      const key = `${h.questionId || ''}_${h.timestamp || ''}`;
      if (!existingHistKeys.has(key)) {
        mergedHistory.push(h);
        existingHistKeys.add(key);
      }
    }

    const mergedSession: SmartStudySessionState = {
      ...baseSession,
      revealedQuestionIds: mergedRevealed,
      history: mergedHistory.slice(0, 50),
      questionsAnsweredTotal: Math.max(baseSession.questionsAnsweredTotal || 0, otherSession.questionsAnsweredTotal || 0, mergedHistory.length),
      lastUpdated: Math.max(baseSession.lastUpdated || 0, otherSession.lastUpdated || 0, Date.now()),
    };

    this.saveSmartStudySession(userId, kitId, mergedSession);
  },

  /**
   * Guarda y fusiona en lote las sesiones de estudio y preguntas reveladas recibidas desde Google Drive.
   */
  saveAllSmartStudySessions(userId: string | null, sessions: Record<string, SmartStudySessionState>, revealedQuestions?: Record<string, string[]>): void {
    if (!sessions || typeof sessions !== 'object') return;

    for (const [kitId, session] of Object.entries(sessions)) {
      if (session && typeof session === 'object') {
        this.mergeSmartStudySession(userId, kitId, session);
      }
    }

    if (revealedQuestions && typeof revealedQuestions === 'object') {
      for (const [kitId, ids] of Object.entries(revealedQuestions)) {
        if (Array.isArray(ids)) {
          const current = this.getRevealedQuestionIds(userId, kitId);
          const union = Array.from(new Set([...current, ...ids]));
          const key = `thea_revealed_q_${userId || 'guest'}_${kitId}`;
          try {
            localStorage.setItem(key, JSON.stringify(union));
            saveSessionItem(key, union).catch(() => {});
          } catch {}
        }
      }
    }
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
  clearSmartStudySession(userId: string | null, kitId: string): void {
    try {
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
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
      localStorage.setItem(key, JSON.stringify(current));
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
      localStorage.setItem(key, JSON.stringify(settings));

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
      localStorage.setItem(key, JSON.stringify(settings));

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
