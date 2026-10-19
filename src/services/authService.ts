import type { User, StudyKit, SmartStudySessionState, PodcastSettings } from '../types';
import type { AISettings } from './aiService';
import { DEFAULT_STUDY_KITS } from '../data/defaultKits';
import {
  saveAssetsFromKits,
  stripHeavyAssetsForLocalStorage,
  saveSessionItem,
  getSessionItem,
  removeSessionItem,
  requestPersistentStorage,
  isCorruptedKit
} from './storageService';

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
   * Cuenta con fallback transparente a kits heredados o kits iniciales para evitar estados en blanco.
   */
  getUserKits(userId: string | null): StudyKit[] {
    try {
      if (!userId) {
        const key = 'thea_guest_kits';
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const clean = parsed.filter(k => !isCorruptedKit(k));
              if (clean.length > 0) return clean;
            }
          } catch {}
        }

        // Fallback 1: Comprobar almacenamiento heredado thea_study_kits_v2
        const legacy = localStorage.getItem('thea_study_kits_v2');
        if (legacy !== null) {
          try {
            const parsedLegacy = JSON.parse(legacy);
            if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
              const cleanLegacy = parsedLegacy.filter(k => !isCorruptedKit(k));
              if (cleanLegacy.length > 0) {
                try {
                  localStorage.setItem(key, JSON.stringify(cleanLegacy));
                } catch {}
                return cleanLegacy;
              }
            }
          } catch {}
        }

        // Fallback final: kits de estudio predeterminados de fábrica
        const defaultKits = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
        this.saveUserKits(null, defaultKits);
        return defaultKits;
      }

      const key = `thea_user_kits_${userId}`;
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const clean = parsed.filter(k => !isCorruptedKit(k));
            if (clean.length > 0) return clean;
          }
        } catch {}
      }

      // Fallback para usuario sin kits locales previos: inicializar con kits limpios de fábrica
      const defaultKits = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
      this.saveUserKits(userId, defaultKits);
      return defaultKits;
    } catch (e) {
      console.error('Error al obtener kits de usuario', e);
      return JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
    }
  },

  /**
   * Restaura los kits asíncronamente desde IndexedDB o LocalStorage con tolerancia a fallos.
   * Evita pérdidas de datos si LocalStorage fue purgado o reseteado.
   */
  async restoreUserKitsAsync(userId: string | null): Promise<StudyKit[]> {
    try {
      const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';

      // 1. Intentar leer de IndexedDB primero para recuperar kits íntegros con sus activos
      const idbKits = await getSessionItem<StudyKit[]>(key);
      if (idbKits && Array.isArray(idbKits) && idbKits.length > 0) {
        const cleanIdb = idbKits.filter(k => !isCorruptedKit(k));
        if (cleanIdb.length > 0) {
          try {
            localStorage.setItem(key, JSON.stringify(cleanIdb));
          } catch {}
          return cleanIdb;
        }
      }

      // 2. Intentar recuperar desde legacy en IndexedDB
      const legacyIdb = await getSessionItem<StudyKit[]>('thea_study_kits_v2');
      if (legacyIdb && Array.isArray(legacyIdb) && legacyIdb.length > 0) {
        const cleanLegacy = legacyIdb.filter(k => !isCorruptedKit(k));
        if (cleanLegacy.length > 0) {
          try {
            localStorage.setItem(key, JSON.stringify(cleanLegacy));
          } catch {}
          return cleanLegacy;
        }
      }

      // 3. Fallback a lectura síncrona
      const localKits = this.getUserKits(userId);
      if (localKits && localKits.length > 0) {
        return localKits;
      }

      // 4. Kits predeterminados de fábrica garantizados
      const defaults = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
      this.saveUserKits(userId, defaults);
      return defaults;
    } catch (e) {
      console.error('[authService] Error al restaurar kits asíncronamente:', e);
      return this.getUserKits(userId);
    }
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
   * Transfiere automáticamente los activos pesados a IndexedDB para no saturar LocalStorage.
   */
  saveUserKits(userId: string | null, kits: StudyKit[]): void {
    const cleanKits = Array.isArray(kits) ? kits.filter(k => !isCorruptedKit(k)) : [];

    if (!userId) {
      try {
        localStorage.setItem('thea_guest_kits', JSON.stringify(cleanKits));
      } catch (e) {
        console.warn('Error al guardar kits de invitado en LocalStorage:', e);
      }
      saveSessionItem('thea_guest_kits', cleanKits).catch(() => {});
      saveAssetsFromKits(cleanKits).catch(() => {});
      return;
    }

    // Persistir activos en IndexedDB en segundo plano
    saveAssetsFromKits(cleanKits).catch((err) => {
      console.warn('[authService] Error al sincronizar activos con IndexedDB:', err);
    });

    const key = `thea_user_kits_${userId}`;
    saveSessionItem(key, cleanKits).catch(() => {});
    try {
      localStorage.setItem(key, JSON.stringify(cleanKits));
    } catch (e) {
      console.warn('Quota excedida al guardar kits completos en LocalStorage, optimizando con IndexedDB...', e);
      try {
        // Aligerar datos quitando dataUrls pesados (preservados en IndexedDB)
        const lightweight = stripHeavyAssetsForLocalStorage(cleanKits).map(k => ({
          ...k,
          sourceMaterials: k.sourceMaterials?.map(m => ({
            ...m,
            rawText: m.rawText && m.rawText.length > 30000 ? m.rawText.slice(0, 30000) : m.rawText
          }))
        }));
        localStorage.setItem(key, JSON.stringify(lightweight));
      } catch (fallbackErr) {
        console.error('Error crítico al persistir kits ligeros:', fallbackErr);
      }
    }
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
      localStorage.removeItem('thea_guest_kits');
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
      removeSessionItem('thea_study_kits_v2').catch(() => {});
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
        if (
          parsed.baseUrl?.includes('api.x.ai') ||
          parsed.baseUrl?.includes('grok.com') ||
          parsed.apiKey?.startsWith('grok_') ||
          parsed.apiKey?.startsWith('xai-')
        ) {
          localStorage.removeItem(key);
        } else {
          const hasKey = Boolean(
            (parsed.apiKey && parsed.apiKey.trim().length > 0) ||
            (parsed.geminiApiKey && parsed.geminiApiKey.trim().length > 0)
          );
          if (hasKey) return parsed;
        }
      }
      // Buscar también dentro del registro de usuario
      const users = getStoredUsers();
      const user = users.find(u => u.id === userId);
      if (
        user?.aiSettings &&
        (user.aiSettings.baseUrl?.includes('api.x.ai') ||
         user.aiSettings.baseUrl?.includes('grok.com') ||
         user.aiSettings.apiKey?.startsWith('grok_') ||
         user.aiSettings.apiKey?.startsWith('xai-'))
      ) {
        delete user.aiSettings;
      }
      const userHasKey = Boolean(
        (user?.aiSettings?.apiKey && user.aiSettings.apiKey.trim().length > 0) ||
        (user?.aiSettings?.geminiApiKey && user.aiSettings.geminiApiKey.trim().length > 0)
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
