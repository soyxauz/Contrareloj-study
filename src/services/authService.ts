import type { User, StudyKit, SmartStudySessionState } from '../types';
import type { AISettings } from './aiService';
import { DEFAULT_STUDY_KITS } from '../data/defaultKits';
import { saveAssetsFromKits, stripHeavyAssetsForLocalStorage } from './storageService';

interface StoredUserRecord extends User {
  passwordHash: string;
}

const STORAGE_USERS_KEY = 'thea_auth_users';
const STORAGE_CURRENT_SESSION_KEY = 'thea_auth_session';

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
  } catch (e) {
    console.error('Error al guardar usuarios en localStorage', e);
  }
}

export const authService = {
  /**
   * Obtiene el usuario actual logueado o null si está en modo invitado.
   */
  getCurrentUser(): User | null {
    try {
      const currentId = localStorage.getItem(STORAGE_CURRENT_SESSION_KEY);
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

    // Iniciar sesión automáticamente
    localStorage.setItem(STORAGE_CURRENT_SESSION_KEY, newUser.id);

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

    localStorage.setItem(STORAGE_CURRENT_SESSION_KEY, user.id);
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

      localStorage.setItem(STORAGE_CURRENT_SESSION_KEY, existing.id);
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
    localStorage.removeItem(STORAGE_CURRENT_SESSION_KEY);
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
   * Carga los kits asociados al usuario o a la sesión de invitado.
   */
  getUserKits(userId: string | null): StudyKit[] {
    try {
      const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }

      // Si es invitado y existe el legado `thea_study_kits_v2`, usarlo
      if (!userId) {
        const legacy = localStorage.getItem('thea_study_kits_v2');
        if (legacy !== null) return JSON.parse(legacy);
      }

      // Inicializar con copias de los kits de fábrica solo en el primer inicio absoluto
      const initial = JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    } catch (e) {
      console.error('Error al obtener kits de usuario', e);
      return JSON.parse(JSON.stringify(DEFAULT_STUDY_KITS));
    }
  },

  /**
   * Guarda los kits para el usuario actual o invitado.
   * Transfiere automáticamente los activos pesados a IndexedDB para no saturar LocalStorage.
   */
  saveUserKits(userId: string | null, kits: StudyKit[]): void {
    // Persistir activos en IndexedDB en segundo plano
    saveAssetsFromKits(kits).catch((err) => {
      console.warn('[authService] Error al sincronizar activos con IndexedDB:', err);
    });

    const key = userId ? `thea_user_kits_${userId}` : 'thea_guest_kits';
    try {
      localStorage.setItem(key, JSON.stringify(kits));
      if (!userId) {
        localStorage.setItem('thea_study_kits_v2', JSON.stringify(kits));
      }
    } catch (e) {
      console.warn('Quota excedida al guardar kits completos en LocalStorage, optimizando con IndexedDB...', e);
      try {
        // Aligerar datos quitando dataUrls pesados (preservados en IndexedDB)
        const lightweight = stripHeavyAssetsForLocalStorage(kits).map(k => ({
          ...k,
          sourceMaterials: k.sourceMaterials?.map(m => ({
            ...m,
            rawText: m.rawText && m.rawText.length > 30000 ? m.rawText.slice(0, 30000) : m.rawText
          }))
        }));
        localStorage.setItem(key, JSON.stringify(lightweight));
      } catch (fallbackErr) {
        console.error('Error crítico al persistir kits en LocalStorage:', fallbackErr);
      }
    }
  },

  /**
   * Obtiene la sesión de Smart Study guardada (memoria total en tiempo real).
   */
  getSmartStudySession(userId: string | null, kitId: string): SmartStudySessionState | null {
    try {
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error al leer memoria de Smart Study', e);
      return null;
    }
  },

  /**
   * Guarda el instante exacto de la sesión de Smart Study.
   */
  saveSmartStudySession(userId: string | null, kitId: string, state: SmartStudySessionState): void {
    try {
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.error('Error al guardar memoria de Smart Study', e);
    }
  },

  /**
   * Limpia la memoria de un kit si el usuario decide reiniciar su progreso.
   */
  clearSmartStudySession(userId: string | null, kitId: string): void {
    try {
      const key = `thea_ss_mem_${userId || 'guest'}_${kitId}`;
      localStorage.removeItem(key);
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
      if (!raw) return null;
      return JSON.parse(raw);
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
    } catch (e) {
      console.error('Error al guardar configuración de IA del usuario', e);
    }
  }
};
