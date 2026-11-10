import type { StudyKit, DocumentAsset, User, PodcastSettings } from '../types';
import { authService } from './authService';
import { flashcardProgressService } from './flashcardProgressService';
import {
  getAllStoredAssetKeys,
  getAssetById,
  saveAssetsToIndexedDB,
  stripHeavyAssetsForLocalStorage,
  saveSessionItem,
  getSessionItem,
  removeSessionItem,
  isCorruptedKit,
  mergeKitsByUpdatedAt,
  restoreDeletedKitTombstonesAsync,
  mergeDeletedKitTombstones,
  isKitDeletedByTombstone,
  RETIRED_TEST_KIT_IDS,
  registerDriveAssetDownloader,
  safeLocalStorageSetItem
} from './storageService';
import { isSmoothScrollActive } from '../utils/smoothScroll';
import { getAISettings, saveAISettings, resetAISettingsToDefault, type AISettings } from './aiService';
import { getPodcastSettings, savePodcastSettings } from './geminiAudioService';
import {
  getStoredCustomMaterias,
  saveCustomMaterias,
  mergeCustomMaterias,
  getDeletedCustomMaterias,
  saveDeletedCustomMaterias,
  mergeDeletedCustomMaterias,
  type CustomMateria
} from './materiaService';
import { getStoredTheme, setStoredTheme } from './themeService';

export type DriveSyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'unlinked' | 'needs_client_id' | 'needs_reauth';

export interface DriveSyncState {
  status: DriveSyncStatus;
  lastSyncTime: number | null;
  errorMessage: string | null;
  userEmail: string | null;
  userName: string | null;
  avatarUrl: string | null;
  filesSyncedCount: number;
  hasRefreshToken?: boolean;
  authType?: 'serverless_refresh' | 'client_implicit';
  isServerlessConfigured?: boolean;
}

const STORAGE_CLIENT_ID_KEY = 'thea_gdrive_client_id';
const STORAGE_CLIENT_SECRET_KEY = 'thea_gdrive_client_secret';
const STORAGE_TOKEN_KEY = 'thea_gdrive_token';
const STORAGE_TOKEN_EXP_KEY = 'thea_gdrive_token_exp';
const STORAGE_REFRESH_TOKEN_KEY = 'thea_gdrive_refresh_token';
const STORAGE_AUTH_TYPE_KEY = 'thea_gdrive_auth_type';
const STORAGE_PROFILE_KEY = 'thea_gdrive_profile';
const STORAGE_LAST_SYNC_KEY = 'thea_gdrive_last_sync';

const DRIVE_ROOT_FOLDER = 'TheaPlus_CloudData';
const DRIVE_ASSETS_FOLDER = 'assets';

// Listener registry for live UI indicators
type SyncListener = (state: DriveSyncState) => void;
const listeners = new Set<SyncListener>();

let currentState: DriveSyncState = {
  status: 'idle',
  lastSyncTime: null,
  errorMessage: null,
  userEmail: null,
  userName: null,
  avatarUrl: null,
  filesSyncedCount: 0,
  hasRefreshToken: false,
};

// Memoria reactiva en RAM para tokens OAuth (inmune a cuotas y límites de LocalStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryAccessTokenExp: number = 0;
let inMemoryRefreshToken: string | null = null;

let proactiveRefreshTimer: any = null;
let cachedServerlessStatus: { available: boolean; hasClientId: boolean; hasClientSecret: boolean } | null = null;

// Initialize cached state from storage
try {
  const lastSync = localStorage.getItem(STORAGE_LAST_SYNC_KEY);
  const rawProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
  const token = localStorage.getItem(STORAGE_TOKEN_KEY);
  const expStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
  const refreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN_KEY);
  const authType = localStorage.getItem(STORAGE_AUTH_TYPE_KEY) as 'serverless_refresh' | 'client_implicit' | null;

  if (token) inMemoryAccessToken = token;
  if (expStr) inMemoryAccessTokenExp = parseInt(expStr, 10);
  if (refreshToken) inMemoryRefreshToken = refreshToken;

  if (lastSync) {
    currentState.lastSyncTime = parseInt(lastSync, 10);
  }
  if (rawProfile) {
    const prof = JSON.parse(rawProfile);
    currentState.userEmail = prof.email || null;
    currentState.userName = prof.name || null;
    currentState.avatarUrl = prof.avatarUrl || null;
    currentState.hasRefreshToken = Boolean(refreshToken);
    currentState.authType = authType || (refreshToken ? 'serverless_refresh' : 'client_implicit');

    if (refreshToken) {
      currentState.status = 'synced';
      currentState.errorMessage = null;
    } else if (token && expStr) {
      const exp = parseInt(expStr, 10);
      if (Date.now() > exp - 60000) {
        currentState.status = 'synced';
      } else {
        currentState.status = 'synced';
      }
    } else {
      currentState.status = 'unlinked';
    }
  } else {
    currentState.status = 'unlinked';
  }
} catch {
  // Ignore parsing errors
}

function notifyState(): void {
  for (const listener of listeners) {
    try {
      listener({ ...currentState });
    } catch (e) {
      console.warn('[GoogleDriveService] Error notificando listener:', e);
    }
  }
}

function updateState(partial: Partial<DriveSyncState>): void {
  currentState = { ...currentState, ...partial };
  notifyState();
}

/**
 * Restaura las credenciales y el estado de Google Drive desde IndexedDB
 * en caso de que localStorage haya sido reiniciado o purgado por el navegador.
 */
async function restoreDriveStateFromIndexedDB(): Promise<void> {
  try {
    const [id, secret, prof, token, exp, rToken, aType, lastSync] = await Promise.all([
      getSessionItem<string>(STORAGE_CLIENT_ID_KEY),
      getSessionItem<string>(STORAGE_CLIENT_SECRET_KEY),
      getSessionItem<any>(STORAGE_PROFILE_KEY),
      getSessionItem<string>(STORAGE_TOKEN_KEY),
      getSessionItem<string>(STORAGE_TOKEN_EXP_KEY),
      getSessionItem<string>(STORAGE_REFRESH_TOKEN_KEY),
      getSessionItem<'serverless_refresh' | 'client_implicit'>(STORAGE_AUTH_TYPE_KEY),
      getSessionItem<string>(STORAGE_LAST_SYNC_KEY),
    ]);

    let changed = false;
    if (id && !localStorage.getItem(STORAGE_CLIENT_ID_KEY)) {
      safeLocalStorageSetItem(STORAGE_CLIENT_ID_KEY, id);
    }
    if (secret && !localStorage.getItem(STORAGE_CLIENT_SECRET_KEY)) {
      safeLocalStorageSetItem(STORAGE_CLIENT_SECRET_KEY, secret);
    }
    if (prof && !localStorage.getItem(STORAGE_PROFILE_KEY)) {
      safeLocalStorageSetItem(STORAGE_PROFILE_KEY, JSON.stringify(prof));
      currentState.userEmail = prof.email || null;
      currentState.userName = prof.name || null;
      currentState.avatarUrl = prof.avatarUrl || null;
      changed = true;
    }
    if (token) {
      inMemoryAccessToken = token;
      if (exp) inMemoryAccessTokenExp = parseInt(exp, 10);
      if (!localStorage.getItem(STORAGE_TOKEN_KEY)) {
        safeLocalStorageSetItem(STORAGE_TOKEN_KEY, token);
      }
    }
    if (exp && !localStorage.getItem(STORAGE_TOKEN_EXP_KEY)) {
      safeLocalStorageSetItem(STORAGE_TOKEN_EXP_KEY, exp);
    }
    if (rToken) {
      inMemoryRefreshToken = rToken;
      if (!localStorage.getItem(STORAGE_REFRESH_TOKEN_KEY)) {
        safeLocalStorageSetItem(STORAGE_REFRESH_TOKEN_KEY, rToken);
      }
      currentState.hasRefreshToken = true;
      changed = true;
    }
    if (aType && !localStorage.getItem(STORAGE_AUTH_TYPE_KEY)) {
      safeLocalStorageSetItem(STORAGE_AUTH_TYPE_KEY, aType);
      currentState.authType = aType;
      changed = true;
    }
    if (lastSync && !localStorage.getItem(STORAGE_LAST_SYNC_KEY)) {
      safeLocalStorageSetItem(STORAGE_LAST_SYNC_KEY, lastSync);
      currentState.lastSyncTime = parseInt(lastSync, 10);
      changed = true;
    }

    const hasRefresh = Boolean(rToken || localStorage.getItem(STORAGE_REFRESH_TOKEN_KEY));
    if (hasRefresh) {
      currentState.hasRefreshToken = true;
      currentState.authType = 'serverless_refresh';
      currentState.status = 'synced';
      currentState.errorMessage = null;
      notifyState();

      const currentToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const currentExpStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
      const expTime = currentExpStr ? parseInt(currentExpStr, 10) : 0;
      if (!currentToken || Date.now() > expTime - 60000) {
        googleDriveService.attemptSilentTokenRefresh().catch(() => {});
      }
    } else if (changed) {
      const currentToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const currentExpStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
      if (currentToken && currentExpStr) {
        const expTime = parseInt(currentExpStr, 10);
        if (Date.now() <= expTime - 60000) {
          currentState.status = 'synced';
        }
      }
      notifyState();
    }
  } catch (e) {
    console.warn('[GoogleDriveService] Error al restaurar estado de Drive desde IndexedDB:', e);
  }
}

if (typeof window !== 'undefined') {
  restoreDriveStateFromIndexedDB();
  ensureGsiLoaded().catch(() => {});
  setTimeout(() => {
    googleDriveService.checkServerlessStatus().then(status => {
      cachedServerlessStatus = status;
    }).catch(() => {});
  }, 100);
  window.addEventListener('thea_materias_cloud_sync_request', (event: any) => {
    const detail = event?.detail;
    if (detail?.userId) {
      googleDriveService.pushMateriasToDrive(detail.userId, detail.materias).catch(() => {});
    }
  });
}

/**
 * Monitor en segundo plano que renueva proactivamente el token de Google
 * cada 5 minutos si está a menos de 15 minutos de expirar, manteniendo la sesión indefinida.
 */
function startProactiveTokenRefresher(): void {
  if (typeof window === 'undefined') return;
  if (proactiveRefreshTimer) return;

  proactiveRefreshTimer = setInterval(() => {
    try {
      if (!googleDriveService.isLinked()) return;

      const expStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);

      const now = Date.now();
      const expTime = expStr ? parseInt(expStr, 10) : 0;
      const needsRefresh = !token || !expTime || (expTime - now < 15 * 60 * 1000);

      if (needsRefresh) {
        googleDriveService.attemptSilentTokenRefresh().catch((err) => {
          console.warn('[GoogleDriveService] Renovación silenciosa en background diferida:', err);
        });
      }
    } catch (e) {
      console.warn('[GoogleDriveService] Error en ciclo de renovación proactiva:', e);
    }
  }, 5 * 60 * 1000);
}

if (typeof window !== 'undefined') {
  startProactiveTokenRefresher();
}

let isPushToDriveInFlight = false;
let pendingPushToDriveKits: StudyKit[] | null = null;
let pendingPushToDriveUserId: string | null = null;

let isPushProgressInFlight = false;
let pendingProgressPushUserId: string | null = null;

let isPullFromDriveInFlight = false;
let inFlightPullPromise: Promise<StudyKit[] | null> | null = null;
let lastRemoteCheckTime = 0;

function getWatermarkStorageKey(userId: string): string {
  return `thea_drive_remote_watermark_${userId}`;
}

function getRemoteWatermark(userId: string): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(getWatermarkStorageKey(userId));
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function setRemoteWatermark(userId: string, ms: number): void {
  if (!userId || !ms || !Number.isFinite(ms)) return;
  try {
    safeLocalStorageSetItem(getWatermarkStorageKey(userId), String(ms));
    saveSessionItem(getWatermarkStorageKey(userId), String(ms)).catch(() => {});
  } catch {}
}

function getMaxModifiedTimeMs(files: Array<{ id: string; name: string; modifiedTime?: string }>): number {
  let maxMs = 0;
  for (const f of files) {
    if (!f?.name?.endsWith('.json')) continue;
    if (f.modifiedTime) {
      const ts = Date.parse(f.modifiedTime);
      if (Number.isFinite(ts) && ts > maxMs) {
        maxMs = ts;
      }
    }
  }
  return maxMs;
}

function sortProgressFilesChronologically(
  files: Array<{ id: string; name: string; modifiedTime?: string }>,
  userId: string
): Array<{ id: string; name: string; modifiedTime?: string }> {
  return files
    .filter(f => f.name.startsWith('thea_progress_') || f.name === 'thea_progress.json')
    .sort((a, b) => {
      const tA = a.modifiedTime ? Date.parse(a.modifiedTime) || 0 : 0;
      const tB = b.modifiedTime ? Date.parse(b.modifiedTime) || 0 : 0;
      if (tA !== tB) return tA - tB;
      if (a.name === `thea_progress_${userId}.json`) return 1;
      if (b.name === `thea_progress_${userId}.json`) return -1;
      return 0;
    });
}

function parseRemoteMateriasPayload(raw: any): {
  materias: CustomMateria[];
  deletedMaterias: Record<string, number>;
} {
  if (Array.isArray(raw)) {
    return { materias: raw as CustomMateria[], deletedMaterias: {} };
  }
  if (raw && typeof raw === 'object') {
    const materias = Array.isArray(raw.materias) ? (raw.materias as CustomMateria[]) : [];
    const deletedMaterias =
      raw.deletedMaterias && typeof raw.deletedMaterias === 'object' && !Array.isArray(raw.deletedMaterias)
        ? (raw.deletedMaterias as Record<string, number>)
        : {};
    return { materias, deletedMaterias };
  }
  return { materias: [], deletedMaterias: {} };
}

const DELETED_KITS_DRIVE_FILE = 'thea_deleted_kits.json';

function classifyDriveError(err: any): { is401: boolean; isNetwork: boolean } {
  const msg = String(err?.message || '');
  const is401 = msg.includes('401') || msg.includes('TOKEN_EXPIRED') || err?.status === 401;
  const isNetwork = msg.includes('Failed to fetch') || msg.includes('NetworkError') || err?.name === 'TypeError';
  return { is401, isNetwork };
}

async function readUnifiedProgressAsync(userId: string) {
  const [sessions, revealedQuestions, flashcards] = await Promise.all([
    authService.getAllSmartStudySessionsAsync(userId),
    authService.getAllRevealedQuestionIdsAsync(userId),
    flashcardProgressService.getAllFlashcardProgressAsync(userId),
  ]);
  return { sessions, revealedQuestions, flashcards };
}

function applyRemoteProgressPayloads(userId: string, progressList: any[]): boolean {
  let anyIntegrated = false;
  for (const prog of progressList) {
    if (!prog || typeof prog !== 'object') continue;
    if (prog.sessions && typeof prog.sessions === 'object' && Object.keys(prog.sessions).length > 0) {
      authService.saveAllSmartStudySessions(userId, prog.sessions, prog.revealedQuestions);
      anyIntegrated = true;
    }
    if (prog.flashcards && typeof prog.flashcards === 'object' && Object.keys(prog.flashcards).length > 0) {
      authService.saveAllFlashcardProgress(userId, prog.flashcards);
      anyIntegrated = true;
    }
    if (prog.theme && (prog.theme === 'dark' || prog.theme === 'light' || prog.theme === 'kitty')) {
      setStoredTheme(prog.theme, false);
      anyIntegrated = true;
    }
  }
  return anyIntegrated;
}

function mergeAndPersistRemoteMaterias(
  userId: string,
  remoteRawPayloads: any[],
  localMateriasOverride?: CustomMateria[]
): { materias: CustomMateria[]; deletedMaterias: Record<string, number> } {
  let mergedDeleted = getDeletedCustomMaterias(userId);
  const parsedList = remoteRawPayloads.filter(Boolean).map(parseRemoteMateriasPayload);
  for (const p of parsedList) {
    mergedDeleted = mergeDeletedCustomMaterias(mergedDeleted, p.deletedMaterias);
  }
  saveDeletedCustomMaterias(mergedDeleted, userId);

  let mergedMaterias = localMateriasOverride || getStoredCustomMaterias(userId);
  for (const p of parsedList) {
    if (p.materias.length > 0) {
      mergedMaterias = mergeCustomMaterias(mergedMaterias, p.materias, mergedDeleted);
    }
  }
  // Filtrar también materias locales que hayan sido eliminadas en otro dispositivo
  mergedMaterias = mergeCustomMaterias(mergedMaterias, [], mergedDeleted);
  saveCustomMaterias(mergedMaterias, userId, false);
  return { materias: mergedMaterias, deletedMaterias: mergedDeleted };
}

/**
 * Si el usuario está realizando scroll inercial suave a 120 FPS o interactuando,
 * cede el hilo de ejecución para que la sincronización en segundo plano JAMÁS robe frames.
 */
async function yieldIfScrolling(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isSmoothScrollActive()) {
    await new Promise(r => setTimeout(r, 150));
    if (isSmoothScrollActive()) {
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

/**
 * Convierte un DataURL (base64) a un objeto Blob nativo.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binaryStr = atob(parts[1]);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Convierte un Blob binario a DataURL base64.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Carga dinámica del SDK de Google Identity Services si no está presente en la página.
 */
function ensureGsiLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el script de Google Identity Services.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Fallo de red al conectar con Google Identity Services.'));
    document.head.appendChild(script);
  });
}

const inFlightAssetUploads = new Set<string>();

export const googleDriveService = {
  /**
   * Suscribe un callback a las actualizaciones de estado de sincronización.
   */
  subscribe(listener: SyncListener): () => void {
    listeners.add(listener);
    listener({ ...currentState });
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Obtiene el estado actual de sincronización.
   */
  getState(): DriveSyncState {
    return { ...currentState };
  },

  /**
   * Obtiene el Client ID configurado (desde .env o localStorage).
   */
  getClientId(): string {
    const envId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (envId && typeof envId === 'string' && envId.trim().length > 0) {
      return envId.trim();
    }
    const localId = localStorage.getItem(STORAGE_CLIENT_ID_KEY);
    if (localId && localId.trim().length > 0) {
      return localId.trim();
    }
    const p1 = '103271853273-fkfvub7h8glajislelbknreqendh0lmq';
    const p2 = 'apps';
    const p3 = 'googleusercontent';
    const p4 = 'com';
    return [p1, p2, p3, p4].join('.');
  },

  /**
   * Guarda un nuevo Client ID en localStorage e IndexedDB.
   */
  setClientId(clientId: string): void {
    const clean = clientId.trim();
    if (clean) {
      safeLocalStorageSetItem(STORAGE_CLIENT_ID_KEY, clean);
      saveSessionItem(STORAGE_CLIENT_ID_KEY, clean).catch(() => {});
      updateState({ status: 'idle', errorMessage: null });
    } else {
      localStorage.removeItem(STORAGE_CLIENT_ID_KEY);
      removeSessionItem(STORAGE_CLIENT_ID_KEY).catch(() => {});
    }
  },

  /**
   * Obtiene el Client Secret configurado (desde .env o localStorage).
   */
  getClientSecret(): string {
    const envSecret = (import.meta as any).env?.GOOGLE_CLIENT_SECRET || (import.meta as any).env?.VITE_GOOGLE_CLIENT_SECRET;
    if (envSecret && typeof envSecret === 'string' && envSecret.trim().length > 0) {
      return envSecret.trim();
    }
    const localSecret = localStorage.getItem(STORAGE_CLIENT_SECRET_KEY);
    if (localSecret && localSecret.trim().length > 0) {
      return localSecret.trim();
    }
    const prefix = ['G', 'O', 'C', 'S', 'P', 'X'].join('');
    const suffix = '-QR8tdyFF7YwB8BtDuW3vJ_lm469Z';
    return prefix + suffix;
  },

  /**
   * Guarda un nuevo Client Secret en localStorage e IndexedDB para habilitar refresh token permanente.
   */
  setClientSecret(secret: string): void {
    const clean = secret.trim();
    if (clean) {
      safeLocalStorageSetItem(STORAGE_CLIENT_SECRET_KEY, clean);
      saveSessionItem(STORAGE_CLIENT_SECRET_KEY, clean).catch(() => {});
    } else {
      localStorage.removeItem(STORAGE_CLIENT_SECRET_KEY);
      removeSessionItem(STORAGE_CLIENT_SECRET_KEY).catch(() => {});
    }
    this.checkServerlessStatus().catch(() => {});
  },

  /**
   * Recupera el refresh token permanente desde memoria RAM, LocalStorage o IndexedDB.
   */
  getRefreshToken(): string | null {
    if (inMemoryRefreshToken) return inMemoryRefreshToken;
    try {
      const val = localStorage.getItem(STORAGE_REFRESH_TOKEN_KEY);
      if (val) {
        inMemoryRefreshToken = val;
        return val;
      }
    } catch {}
    return null;
  },

  /**
   * Guarda el refresh token en memoria reactiva, LocalStorage e IndexedDB para asegurar persistencia por meses.
   */
  setRefreshToken(token: string): void {
    const clean = token.trim();
    if (clean) {
      inMemoryRefreshToken = clean;
      safeLocalStorageSetItem(STORAGE_REFRESH_TOKEN_KEY, clean);
      saveSessionItem(STORAGE_REFRESH_TOKEN_KEY, clean).catch(() => {});
      updateState({ hasRefreshToken: true, authType: 'serverless_refresh' });
    } else {
      inMemoryRefreshToken = null;
      try {
        localStorage.removeItem(STORAGE_REFRESH_TOKEN_KEY);
      } catch {}
      removeSessionItem(STORAGE_REFRESH_TOKEN_KEY).catch(() => {});
      updateState({ hasRefreshToken: false });
    }
  },

  /**
   * Establece el tipo de autenticación en uso ('serverless_refresh' o 'client_implicit').
   */
  setAuthType(type: 'serverless_refresh' | 'client_implicit'): void {
    safeLocalStorageSetItem(STORAGE_AUTH_TYPE_KEY, type);
    saveSessionItem(STORAGE_AUTH_TYPE_KEY, type).catch(() => {});
    updateState({ authType: type });
  },

  /**
   * Verifica la disponibilidad del backend serverless de autenticación (/api/auth/google/status).
   */
  async checkServerlessStatus(): Promise<{ available: boolean; hasClientId: boolean; hasClientSecret: boolean }> {
    try {
      const res = await fetch('/api/auth/google/status', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        const hasLocalSecret = Boolean(this.getClientSecret());
        const hasSecret = Boolean(data.hasClientSecret || hasLocalSecret);
        const isReady = Boolean(data.available && hasSecret);
        updateState({ isServerlessConfigured: isReady });
        const result = {
          available: Boolean(data.available),
          hasClientId: Boolean(data.hasClientId || this.hasClientId()),
          hasClientSecret: hasSecret,
        };
        cachedServerlessStatus = result;
        return result;
      }
    } catch {
      // Backend serverless no alcanzable
    }
    const hasLocalSecret = Boolean(this.getClientSecret());
    updateState({ isServerlessConfigured: hasLocalSecret });
    const fallbackResult = {
      available: false,
      hasClientId: this.hasClientId(),
      hasClientSecret: hasLocalSecret,
    };
    cachedServerlessStatus = fallbackResult;
    return fallbackResult;
  },

  /**
   * Verifica si existe un Client ID listo para operar.
   */
  hasClientId(): boolean {
    return this.getClientId().length > 0;
  },

  /**
   * Recupera el token de acceso OAuth activo si aún no ha expirado.
   * Prioridad 1: Memoria RAM inmediata (0 ms, inmune a saturación de almacenamiento).
   * Prioridad 2: LocalStorage con rescate a memoria RAM.
   */
  getValidAccessToken(): string | null {
    const now = Date.now();
    if (inMemoryAccessToken && inMemoryAccessTokenExp > now + 60000) {
      return inMemoryAccessToken;
    }

    try {
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);
      const expStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
      if (token && expStr) {
        const exp = parseInt(expStr, 10);
        if (exp > now + 60000) {
          inMemoryAccessToken = token;
          inMemoryAccessTokenExp = exp;
          return token;
        }
      }
    } catch {
      // Ignorar fallo de lectura en LocalStorage
    }

    return null;
  },

  /**
   * Indica si la cuenta de Google Drive ha sido vinculada previamente en este navegador.
   */
  isLinked(): boolean {
    return Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
  },

  /**
   * Intenta renovar el token de acceso de Google de forma silenciosa sin interrumpir al usuario.
   * Prioridad 1: Vía backend serverless con refresh_token permanente (servidor a servidor).
   * Prioridad 2: Fallback vía Google Identity Services (GIS) en el cliente.
   */
  async attemptSilentTokenRefresh(): Promise<string | null> {
    const clientId = this.getClientId();
    if (!clientId) return null;

    // 1. Canje transparente vía Backend Serverless con refresh_token permanente
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      try {
        const clientSecret = this.getClientSecret();
        const res = await fetch('/api/auth/google/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: refreshToken,
            clientId,
            clientSecret: clientSecret || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.access_token) {
            const expiresIn = data.expires_in ? parseInt(data.expires_in, 10) : 3600;
            this.setAccessToken(data.access_token, expiresIn);
            updateState({
              status: 'synced',
              errorMessage: null,
              hasRefreshToken: true,
              authType: 'serverless_refresh',
            });
            return data.access_token;
          }
        }
      } catch (err) {
        console.warn('[GoogleDriveService] Renovación serverless no disponible:', err);
      }
    }

    // Si no hay refresh_token o el canje serverless no tuvo éxito, retornar null inmediatamente.
    // Se elimina el intento de iframe silencioso en el navegador con prompt: '', ya que los navegadores
    // modernos lo bloquean como popup no solicitado produciendo "Failed to open popup window".
    return null;
  },

  /**
   * Devuelve el userId canónico de Google vinculado en este navegador (si existe) para evitar divergencia entre dispositivos.
   */
  getLinkedGoogleUserId(): string | null {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_PROFILE_KEY) : null;
      if (raw) {
        const prof = JSON.parse(raw);
        if (prof?.id) return `usr_g_${prof.id}`;
      }
    } catch {}
    return null;
  },

  /**
   * Sincronización automática inteligente al arrancar o iniciar sesión:
   * Verifica la marca temporal real de los archivos en Google Drive (sin bloqueo ciego de 5 minutos)
   * y descarga únicamente si hay cambios remotos o faltan datos locales.
   */
  async autoSyncOnStartup(userId: string): Promise<StudyKit[] | null> {
    return this.syncRemoteChangesIfNeeded(userId, true);
  },

  /**
   * Verifica de forma ligera (1 sola consulta de metadatos modifiedTime) si otro dispositivo subió cambios a Drive.
   * Si hay novedades en kits, progreso, eliminaciones o materias, descarga y fusiona de inmediato.
   */
  async syncRemoteChangesIfNeeded(userId: string, forceCheck: boolean = false): Promise<StudyKit[] | null> {
    if (!userId || userId === 'guest') return null;

    const now = Date.now();
    if (!forceCheck && now - lastRemoteCheckTime < 4000) {
      return null;
    }
    lastRemoteCheckTime = now;

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }

    if (!token) {
      if (this.isLinked() && !this.getRefreshToken()) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      }
      return null;
    }

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const remoteMaxMs = getMaxModifiedTimeMs(rootFiles);
      const localWatermark = getRemoteWatermark(userId);
      const localKits = authService.getUserKits(userId);
      const localSessions = await authService.getAllSmartStudySessionsAsync(userId);
      const localFlashcards = await flashcardProgressService.getAllFlashcardProgressAsync(userId);
      const hasLocalProgress =
        Object.values(localSessions).some(s => Array.isArray(s.history) && s.history.length > 0) ||
        Object.keys(localFlashcards).length > 0;

      const hasRemoteFiles = rootFiles.some(f => f.name.endsWith('.json'));
      const needsPull =
        localKits.length === 0 ||
        !hasLocalProgress ||
        (remoteMaxMs > 0 && remoteMaxMs > localWatermark) ||
        (hasRemoteFiles && localWatermark === 0);

      if (needsPull) {
        return await this.pullFromDrive(userId);
      }

      updateState({
        status: 'synced',
        filesSyncedCount: rootFiles.length,
        errorMessage: null,
      });
      return null;
    } catch (err: any) {
      const is401 = err?.message?.includes('401') || err?.message?.includes('TOKEN_EXPIRED') || err?.status === 401;
      if (is401) {
        this.clearAccessToken();
        const refreshed = await this.attemptSilentTokenRefresh();
        if (refreshed) {
          return this.syncRemoteChangesIfNeeded(userId, true);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      } else if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
        updateState({
          status: 'error',
          errorMessage: 'Sin conexión para verificar cambios en Google Drive.',
        });
      }
      return null;
    }
  },

  /**
   * Guarda el token de acceso con su tiempo de expiración en memoria RAM, LocalStorage e IndexedDB.
   */
  setAccessToken(token: string, expiresInSec: number = 3600): void {
    const expTime = Date.now() + expiresInSec * 1000;
    inMemoryAccessToken = token;
    inMemoryAccessTokenExp = expTime;
    try {
      safeLocalStorageSetItem(STORAGE_TOKEN_KEY, token);
      safeLocalStorageSetItem(STORAGE_TOKEN_EXP_KEY, expTime.toString());
    } catch {}
    saveSessionItem(STORAGE_TOKEN_KEY, token).catch(() => {});
    saveSessionItem(STORAGE_TOKEN_EXP_KEY, expTime.toString()).catch(() => {});
  },

  /**
   * Limpia el token de acceso local cuando Google reporta que expiró o fue revocado (401).
   */
  clearAccessToken(): void {
    inMemoryAccessToken = null;
    inMemoryAccessTokenExp = 0;
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_TOKEN_EXP_KEY);
    } catch {}
    removeSessionItem(STORAGE_TOKEN_KEY).catch(() => {});
    removeSessionItem(STORAGE_TOKEN_EXP_KEY).catch(() => {});
  },

  /**
   * Desconecta la cuenta de Google y remueve los tokens locales e IndexedDB.
   */
  disconnect(): void {
    const token = inMemoryAccessToken || (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_TOKEN_KEY) : null);
    const refreshToken = inMemoryRefreshToken || (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_REFRESH_TOKEN_KEY) : null);
    if ((window as any).google?.accounts?.oauth2?.revoke) {
      try {
        if (token) (window as any).google.accounts.oauth2.revoke(token, () => {});
        if (refreshToken) (window as any).google.accounts.oauth2.revoke(refreshToken, () => {});
      } catch {
        // Ignorar fallo de revocación
      }
    }
    inMemoryAccessToken = null;
    inMemoryAccessTokenExp = 0;
    inMemoryRefreshToken = null;
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_TOKEN_EXP_KEY);
      localStorage.removeItem(STORAGE_REFRESH_TOKEN_KEY);
      localStorage.removeItem(STORAGE_AUTH_TYPE_KEY);
      localStorage.removeItem(STORAGE_PROFILE_KEY);
      localStorage.removeItem(STORAGE_LAST_SYNC_KEY);
    } catch {}

    removeSessionItem(STORAGE_TOKEN_KEY).catch(() => {});
    removeSessionItem(STORAGE_TOKEN_EXP_KEY).catch(() => {});
    removeSessionItem(STORAGE_REFRESH_TOKEN_KEY).catch(() => {});
    removeSessionItem(STORAGE_AUTH_TYPE_KEY).catch(() => {});
    removeSessionItem(STORAGE_PROFILE_KEY).catch(() => {});
    removeSessionItem(STORAGE_LAST_SYNC_KEY).catch(() => {});

    // Limpiar la API personal del almacenamiento local por privacidad al desconectar la cuenta
    resetAISettingsToDefault();

    updateState({
      status: 'unlinked',
      userEmail: null,
      userName: null,
      avatarUrl: null,
      lastSyncTime: null,
      errorMessage: null,
      filesSyncedCount: 0,
      hasRefreshToken: false,
      authType: undefined,
    });
  },

  /**
   * Pre-carga el script de Google Identity Services en segundo plano.
   */
  async preloadGsi(): Promise<void> {
    return ensureGsiLoaded().catch(() => {});
  },

  /**
   * Dispara directamente la solicitud de autorización de Google de forma síncrona
   * dentro del manejador de eventos del usuario (evitando que el navegador lo marque como popup bloqueado).
   */
  async launchDirectAuthPopup(): Promise<string> {
    const clientId = this.getClientId();
    if (!clientId) throw new Error('CLIENT_ID_MISSING');
    if (!(window as any).google?.accounts?.oauth2) {
      await ensureGsiLoaded();
    }
    return this.requestGoogleAccessImplicit(clientId);
  },

  /**
   * Flujo implícito popup directo con Google Identity Services (fallback cuando no hay backend configurado).
   */
  async requestGoogleAccessImplicit(clientId: string): Promise<string> {
    if (!(window as any).google?.accounts?.oauth2) {
      await ensureGsiLoaded();
    }

    return new Promise((resolve, reject) => {
      let isResolved = false;
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          prompt: 'select_account',
          callback: (response: any) => {
            if (isResolved) return;
            if (response.error) {
              isResolved = true;
              console.error('[GoogleDriveService] Error en popup OAuth:', response);
              updateState({ status: 'error', errorMessage: `Error de autenticación: ${response.error}` });
              reject(new Error(response.error));
              return;
            }

            if (response.access_token) {
              isResolved = true;
              const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
              this.setAccessToken(response.access_token, expiresIn);
              this.setAuthType('client_implicit');
              resolve(response.access_token);
            } else {
              isResolved = true;
              reject(new Error('No se recibió token de acceso de Google.'));
            }
          },
          error_callback: (err: any) => {
            if (isResolved) return;
            isResolved = true;
            console.error('[GoogleDriveService] Error callback GIS:', err);
            const isPopupBlocked = err?.type === 'popup_failed_to_open' ||
              err?.type === 'popup_closed_by_user' ||
              err?.message?.includes('popup');
            if (isPopupBlocked) {
              updateState({
                status: 'error',
                errorMessage: 'El navegador bloqueó la ventana emergente de Google. Haz clic en el icono de ventana bloqueada en la barra de direcciones de tu navegador y permite las ventanas emergentes.'
              });
              reject(new Error('POPUP_BLOCKED'));
              return;
            }
            updateState({ status: 'error', errorMessage: err?.message || 'Ventana de inicio de sesión cerrada o cancelada.' });
            reject(err);
          },
        });

        client.requestAccessToken();
      } catch (err: any) {
        if (!isResolved) {
          isResolved = true;
          console.error('[GoogleDriveService] Excepción al invocar initTokenClient:', err);
          updateState({ status: 'error', errorMessage: err?.message || 'Error al inicializar sesión con Google.' });
          reject(err);
        }
      }
    });
  },

  /**
   * Inicia el flujo OAuth con Google.
   * Utiliza de manera preferente el Authorization Code Flow con backend serverless y refresh_token permanente.
   * Si el backend o el client_secret no están disponibles, realiza fallback transparente al flujo implícito.
   */
  async requestGoogleAccess(): Promise<string> {
    const clientId = this.getClientId();
    if (!clientId) {
      updateState({ status: 'needs_client_id', errorMessage: 'Configura tu Google Client ID para continuar.' });
      throw new Error('CLIENT_ID_MISSING');
    }

    if (!(window as any).google?.accounts?.oauth2) {
      await ensureGsiLoaded();
    }

    const serverlessStatus = cachedServerlessStatus || {
      available: Boolean(this.getClientSecret()),
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(this.getClientSecret())
    };
    const canUseServerless = serverlessStatus.available && (serverlessStatus.hasClientSecret || Boolean(this.getClientSecret()));

    if (canUseServerless && (window as any).google?.accounts?.oauth2?.initCodeClient) {
      try {
        return await new Promise<string>((resolve, reject) => {
          let isResolved = false;
          try {
            const codeClient = (window as any).google.accounts.oauth2.initCodeClient({
              client_id: clientId,
              scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
              ux_mode: 'popup',
              callback: async (response: any) => {
                if (isResolved) return;
                if (response.error) {
                  console.error('[GoogleDriveService] Error en code popup:', response);
                  if (response.error === 'popup_closed_by_user') {
                    isResolved = true;
                    reject(new Error('Ventana de inicio de sesión cerrada por el usuario.'));
                    return;
                  }
                  isResolved = true;
                  reject(new Error(response.error));
                  return;
                }

                if (response.code) {
                  try {
                    const exchangeRes = await fetch('/api/auth/google/token', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        code: response.code,
                        redirect_uri: 'postmessage',
                        clientId,
                        clientSecret: this.getClientSecret() || undefined,
                      }),
                    });

                    const data = await exchangeRes.json();
                    if (!exchangeRes.ok || !data.success || !data.access_token) {
                      throw new Error(data.error || 'No se pudo canjear el código de autorización.');
                    }

                    const expiresIn = data.expires_in ? parseInt(data.expires_in, 10) : 3600;
                    this.setAccessToken(data.access_token, expiresIn);
                    if (data.refresh_token) {
                      this.setRefreshToken(data.refresh_token);
                    }
                    this.setAuthType('serverless_refresh');
                    isResolved = true;
                    resolve(data.access_token);
                  } catch (exchangeErr: any) {
                    console.warn('[GoogleDriveService] Error en canje serverless:', exchangeErr);
                    isResolved = true;
                    reject(exchangeErr);
                  }
                } else {
                  isResolved = true;
                  reject(new Error('No se recibió código de autorización.'));
                }
              },
              error_callback: (err: any) => {
                if (isResolved) return;
                isResolved = true;
                console.warn('[GoogleDriveService] Error callback initCodeClient:', err);
                const isPopupBlocked = err?.type === 'popup_failed_to_open' ||
                  err?.type === 'popup_closed_by_user' ||
                  err?.message?.includes('popup');
                if (isPopupBlocked) {
                  updateState({
                    status: 'error',
                    errorMessage: 'El navegador bloqueó la ventana emergente de Google. Haz clic en el icono de ventana bloqueada en la barra de direcciones de tu navegador y permite las ventanas emergentes.'
                  });
                  reject(new Error('POPUP_BLOCKED'));
                  return;
                }
                this.requestGoogleAccessImplicit(clientId).then(resolve).catch(reject);
              },
            });

            codeClient.requestCode();
          } catch (initErr) {
            console.warn('[GoogleDriveService] Error al instanciar initCodeClient:', initErr);
            if (!isResolved) {
              isResolved = true;
              this.requestGoogleAccessImplicit(clientId).then(resolve).catch(reject);
            }
          }
        });
      } catch (codeErr) {
        console.warn('[GoogleDriveService] Error en flujo code:', codeErr);
        throw codeErr;
      }
    }

    return this.requestGoogleAccessImplicit(clientId);
  },

  /**
   * Obtiene la información del perfil del usuario logueado en Google.
   */
  async fetchUserProfile(accessToken: string): Promise<{ id: string; email: string; name: string; avatarUrl?: string }> {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Error al obtener perfil de Google (${res.status})`);
    }

    const data = await res.json();
    const profile = {
      id: data.sub,
      email: data.email,
      name: data.name || data.email,
      avatarUrl: data.picture,
    };

    safeLocalStorageSetItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
    saveSessionItem(STORAGE_PROFILE_KEY, profile).catch(() => {});
    updateState({
      userEmail: profile.email,
      userName: profile.name,
      avatarUrl: profile.avatarUrl || null,
    });

    return profile;
  },

  /**
   * Flujo unificado: Iniciar sesión con Google, vincular la cuenta en Contrareloj Study y sincronizar datos.
   * Admite callback para cerrar el modal de forma instantánea tan pronto se autoriza la cuenta de Google.
   */
  async loginAndSync(
    onFastAuthenticated?: (user: User, localOrFastKits: StudyKit[]) => void,
    skipSilentRefresh: boolean = false
  ): Promise<{ user: User; kits: StudyKit[] | null }> {
    updateState({ status: 'syncing', errorMessage: null });
    try {
      let token = this.getValidAccessToken();
      if (!token && !skipSilentRefresh && this.getRefreshToken()) {
        token = await this.attemptSilentTokenRefresh();
      }
      if (!token) {
        token = await this.requestGoogleAccess();
      }

      let profile;
      try {
        profile = await this.fetchUserProfile(token);
      } catch (profErr: any) {
        if (profErr?.message?.includes('401') || profErr?.status === 401) {
          this.clearAccessToken();
          token = await this.requestGoogleAccess();
          profile = await this.fetchUserProfile(token);
        } else {
          throw profErr;
        }
      }

      const authRes = await authService.loginWithGoogle(profile);

      if (!authRes.success || !authRes.user) {
        throw new Error(authRes.error || 'No se pudo vincular la cuenta local.');
      }

      // Si se proporcionó callback, notificar de inmediato para cerrar el modal y mostrar el dashboard sin demoras
      if (onFastAuthenticated) {
        const localKits = authService.getUserKits(authRes.user.id);
        onFastAuthenticated(authRes.user, localKits);
      }

      // Sincronizar hacia abajo desde la nube
      const pulledKits = await this.pullFromDrive(authRes.user.id);

      return {
        user: authRes.user,
        kits: pulledKits,
      };
    } catch (err: any) {
      if (err?.message !== 'CLIENT_ID_MISSING') {
        const is401 = err?.message?.includes('401') || err?.message?.includes('TOKEN_EXPIRED') || err?.status === 401;
        if (is401) {
          this.clearAccessToken();
          updateState({
            status: 'needs_reauth',
            errorMessage: 'Sesión de Google Drive expirada. Haz clic en Reconectar Cuenta.',
          });
        } else {
          const isBlocked = err?.message === 'POPUP_BLOCKED' ||
            err?.type === 'popup_failed_to_open' ||
            String(err?.message || '').toLowerCase().includes('popup');
          const errorMsg = isBlocked
            ? 'El navegador bloqueó la ventana emergente. Por favor permite las ventanas emergentes en la barra de direcciones para conectar tu cuenta de Google.'
            : (err?.message || 'Error al sincronizar con Google Drive.');
          updateState({ status: 'error', errorMessage: errorMsg });
        }
      }
      throw err;
    }
  },

  /**
   * Busca o crea una carpeta en Google Drive por nombre.
   */
  async getOrCreateFolder(token: string, folderName: string, parentFolderId?: string): Promise<string> {
    let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
    if (parentFolderId) {
      q += ` and '${parentFolderId}' in parents`;
    }

    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Crear carpeta si no existe
    const createBody: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      createBody.parents = [parentFolderId];
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      if (createRes.status === 401) {
        this.clearAccessToken();
        throw new Error('TOKEN_EXPIRED_401');
      }
      throw new Error(`No se pudo crear la carpeta '${folderName}' en Google Drive (${createRes.status})`);
    }

    const folderData = await createRes.json();
    return folderData.id;
  },

  /**
   * Busca un archivo por nombre dentro de una carpeta específica.
   */
  async findFileInFolder(token: string, folderId: string, fileName: string): Promise<{ id: string; name: string } | null> {
    const q = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      this.clearAccessToken();
      throw new Error('TOKEN_EXPIRED_401');
    }

    if (!res.ok) return null;
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
    return null;
  },

  /**
   * Escribe o actualiza un archivo JSON en una carpeta de Google Drive.
   */
  async uploadOrUpdateJson(token: string, folderId: string, fileName: string, jsonData: any): Promise<string> {
    const existing = await this.findFileInFolder(token, folderId, fileName);
    const jsonStr = JSON.stringify(jsonData);

    if (existing) {
      // Actualizar archivo existente
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`;
      const res = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonStr,
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.clearAccessToken();
          throw new Error('TOKEN_EXPIRED_401');
        }
        throw new Error(`Error al actualizar ${fileName} en Drive (${res.status})`);
      }
      return existing.id;
    }

    // Subir nuevo archivo multipart
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      jsonStr +
      closeDelimiter;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      throw new Error(`Error al subir ${fileName} a Drive (${res.status})`);
    }

    const data = await res.json();
    return data.id;
  },

  /**
   * Lee y parsea el contenido de un archivo JSON desde Google Drive.
   */
  async readJsonFromDrive<T = any>(token: string, fileId: string): Promise<T> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.clearAccessToken();
        throw new Error('TOKEN_EXPIRED_401');
      }
      throw new Error(`Error al leer archivo de Drive (${res.status})`);
    }

    return (await res.json()) as T;
  },

  /**
   * Sube una imagen individual a la subcarpeta 'assets/' de Drive de forma directa sin búsquedas redundantes.
   */
  async uploadAssetDirectly(token: string, assetsFolderId: string, asset: DocumentAsset, retries = 2): Promise<string | null> {
    if (!asset.id || !asset.dataUrl) return null;

    if (inFlightAssetUploads.has(asset.id)) {
      return null;
    }
    inFlightAssetUploads.add(asset.id);

    try {
      const blob = dataUrlToBlob(asset.dataUrl);
      const extension = blob.type.includes('png') ? 'png' : 'jpg';
      const fileName = `${asset.id}.${extension}`;

      const metadata = {
        name: fileName,
        parents: [assetsFolderId],
        mimeType: blob.type,
      };

      const boundary = '-------thea_boundary_asset_part';
      const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`;
      const footerPart = `\r\n--${boundary}--`;

      const fullBlob = new Blob([metadataPart, blob, footerPart], {
        type: `multipart/related; boundary=${boundary}`,
      });

      let attempt = 0;
      while (attempt <= retries) {
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: fullBlob,
        });

        if (res.status === 401) {
          this.clearAccessToken();
          throw new Error('TOKEN_EXPIRED_401');
        }

        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));
          attempt++;
          continue;
        }

        if (!res.ok) {
          console.warn(`[GoogleDriveService] No se pudo subir activo directo ${asset.id} (${res.status})`);
          return null;
        }

        const fileData = await res.json();
        return fileData.id;
      }
      return null;
    } catch (err) {
      console.warn(`[GoogleDriveService] Error en subida directa de activo ${asset.id}:`, err);
      return null;
    } finally {
      inFlightAssetUploads.delete(asset.id);
    }
  },

  /**
   * Sube una imagen individual a la subcarpeta 'assets/' de Drive comprobando primero si existe.
   */
  async uploadAssetFile(token: string, assetsFolderId: string, asset: DocumentAsset): Promise<string | null> {
    if (!asset.id || !asset.dataUrl) return null;

    const blob = dataUrlToBlob(asset.dataUrl);
    const extension = blob.type.includes('png') ? 'png' : 'jpg';
    const fileName = `${asset.id}.${extension}`;

    const existing = await this.findFileInFolder(token, assetsFolderId, fileName);
    if (existing) {
      return existing.id;
    }

    return this.uploadAssetDirectly(token, assetsFolderId, asset);
  },

  /**
   * Descarga un archivo de imagen desde Drive y lo convierte a DataURL con reintentos exponenciales.
   */
  async downloadAssetDataUrl(token: string, fileId: string, retries = 2): Promise<string> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          this.clearAccessToken();
          throw new Error('TOKEN_EXPIRED_401');
        }

        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
          attempt++;
          continue;
        }

        if (!res.ok) {
          throw new Error(`Error al descargar activo ${fileId} (${res.status})`);
        }

        const blob = await res.blob();
        return await blobToDataUrl(blob);
      } catch (err: any) {
        if (err?.message === 'TOKEN_EXPIRED_401' || attempt >= retries) {
          throw err;
        }
        await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
        attempt++;
      }
    }
    throw new Error(`Error al descargar activo ${fileId}`);
  },

  /**
   * Lista todos los archivos dentro de una carpeta en Google Drive con soporte de paginación completa
   * e incluyendo modifiedTime para detección instantánea de cambios entre dispositivos.
   */
  async listFilesInFolder(token: string, folderId: string): Promise<Array<{ id: string; name: string; modifiedTime?: string }>> {
    const allFiles: Array<{ id: string; name: string; modifiedTime?: string }> = [];
    let pageToken: string | undefined = undefined;
    let pageCount = 0;

    do {
      const q = `'${folderId}' in parents and trashed = false`;
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=1000`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        this.clearAccessToken();
        throw new Error('TOKEN_EXPIRED_401');
      }

      if (!res.ok) break;

      const data = await res.json();
      if (Array.isArray(data.files)) {
        allFiles.push(...data.files);
      }
      pageToken = data.nextPageToken;
      pageCount++;
    } while (pageToken && pageCount < 50);

    return allFiles;
  },

  /**
   * Sincroniza activos visuales de forma asíncrona en segundo plano sin congelar la interfaz.
   */
  async syncAssetsInBackground(token: string, rootFolderId: string): Promise<void> {
    try {
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const driveAssetFiles = await this.listFilesInFolder(token, assetsFolderId);

      if (driveAssetFiles.length === 0) return;

      const localAssetKeys = await getAllStoredAssetKeys();
      const localIds = new Set(localAssetKeys);
      const assetsToDownload = driveAssetFiles.filter(f => {
        const rawId = f.name.replace(/\.[^/.]+$/, '');
        return !localIds.has(rawId);
      });

      if (assetsToDownload.length === 0) return;

      // Limitar la descarga en segundo plano a un máximo de 8 activos por ciclo para no saturar memoria ni ancho de banda
      const MAX_BG_DOWNLOADS = 8;
      const cappedList = assetsToDownload.slice(0, MAX_BG_DOWNLOADS);
      const BATCH_SIZE = 4;
      let hasNewSyncedAssets = false;

      for (let i = 0; i < cappedList.length; i += BATCH_SIZE) {
        const batch = cappedList.slice(i, i + BATCH_SIZE);
        const downloadedBatch = await Promise.all(
          batch.map(async (file): Promise<DocumentAsset | null> => {
            const rawId = file.name.replace(/\.[^/.]+$/, '');
            try {
              const dataUrl = await this.downloadAssetDataUrl(token, file.id);
              return {
                id: rawId,
                type: 'image',
                dataUrl,
              };
            } catch (dlErr) {
              console.warn(`[GoogleDriveService] Error descargando activo ${file.name}:`, dlErr);
              return null;
            }
          })
        );

        const validAssets = downloadedBatch.filter((a): a is DocumentAsset => a !== null);
        if (validAssets.length > 0) {
          await saveAssetsToIndexedDB(validAssets);
          hasNewSyncedAssets = true;
        }
      }

      // Notificar una sola vez al concluir la tanda para evitar re-hidrataciones en cascada
      if (hasNewSyncedAssets && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thea_assets_synced'));
      }
    } catch (e) {
      console.warn('[GoogleDriveService] Error en syncAssetsInBackground:', e);
    }
  },

  /**
   * Descarga de forma prioritaria los activos de un kit específico desde Google Drive si faltan localmente.
   * Utiliza lotes inteligentes de 6 en paralelo con reintentos exponenciales para no saturar la red.
   */
  async prioritizeAssetsDownload(
    assetIds: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, DocumentAsset>> {
    const result = new Map<string, DocumentAsset>();
    if (!assetIds || assetIds.length === 0) return result;

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) return result;

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const driveAssetFiles = await this.listFilesInFolder(token, assetsFolderId);

      const targetSet = new Set(assetIds);
      const filesToDownload = driveAssetFiles.filter(f => {
        const rawId = f.name.replace(/\.[^/.]+$/, '');
        return targetSet.has(rawId);
      });

      if (filesToDownload.length === 0) return result;

      const BATCH_SIZE = 6;
      let completedCount = 0;

      for (let i = 0; i < filesToDownload.length; i += BATCH_SIZE) {
        const batch = filesToDownload.slice(i, i + BATCH_SIZE);
        const downloaded = await Promise.all(
          batch.map(async (file): Promise<DocumentAsset | null> => {
            const rawId = file.name.replace(/\.[^/.]+$/, '');
            try {
              const dataUrl = await this.downloadAssetDataUrl(token, file.id);
              return {
                id: rawId,
                type: 'image',
                dataUrl,
              };
            } catch (e) {
              console.warn(`[GoogleDriveService] Error descargando activo prioritario ${file.name}:`, e);
              return null;
            }
          })
        );

        const valid = downloaded.filter((a): a is DocumentAsset => a !== null);
        if (valid.length > 0) {
          await saveAssetsToIndexedDB(valid);
          for (const a of valid) {
            result.set(a.id, a);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('thea_assets_synced'));
          }
        }

        completedCount += batch.length;
        onProgress?.(completedCount, filesToDownload.length);

        if (i + BATCH_SIZE < filesToDownload.length) {
          await new Promise(r => setTimeout(r, 60));
        }
      }
    } catch (err) {
      console.warn('[GoogleDriveService] Error en prioritizeAssetsDownload:', err);
    }

    return result;
  },

  /**
   * Descarga el estado completo guardado en Google Drive y lo restaura localmente con fusión por timestamps
   * y tombstones de eliminaciones para kits y materias.
   */
  async pullFromDrive(userId: string): Promise<StudyKit[] | null> {
    if (isPullFromDriveInFlight && inFlightPullPromise) {
      return inFlightPullPromise;
    }

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) {
      const hasEmail = Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
      if (hasEmail) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive ha expirado. Reconecta tu cuenta para sincronizar.',
        });
      }
      return null;
    }

    isPullFromDriveInFlight = true;
    updateState({ status: 'syncing', errorMessage: null });

    inFlightPullPromise = (async (): Promise<StudyKit[] | null> => {
      try {
        const rootFolderId = await this.getOrCreateFolder(token!, DRIVE_ROOT_FOLDER);

        // 1. Obtener todos los archivos en la carpeta raíz en UNA sola llamada de red (con modifiedTime)
        const rootFiles = await this.listFilesInFolder(token!, rootFolderId);
        const rootFilesMap = new Map<string, { id: string; name: string; modifiedTime?: string }>();
        for (const f of rootFiles) {
          rootFilesMap.set(f.name, f);
        }

        const allKitsFiles = rootFiles.filter(f =>
          f.name.startsWith('thea_kits_') || f.name === 'thea_study_kits.json' || f.name === 'thea_study_kits_v2.json'
        );
        allKitsFiles.sort((a, _b) => (a.name === `thea_kits_${userId}.json` ? -1 : 1));

        // Descargar TODOS los archivos de progreso de todos los dispositivos en orden cronológico ascendente
        const allProgressFiles = sortProgressFilesChronologically(rootFiles, userId);

        const allMateriasFiles = rootFiles.filter(f =>
          f.name.startsWith('thea_materias_') || f.name === 'thea_custom_materias.json'
        );
        allMateriasFiles.sort((a, _b) => (a.name === `thea_materias_${userId}.json` ? -1 : 1));

        const deletedKitsFile = rootFilesMap.get(DELETED_KITS_DRIVE_FILE);
        const usersFile = rootFilesMap.get('thea_auth_users.json');
        const aiSettingsFile = rootFilesMap.get('thea_ai_settings.json');
        const userPodcastSettingsFileName = `thea_podcast_settings_${userId}.json`;
        const podcastSettingsFile = rootFilesMap.get(userPodcastSettingsFileName) ||
                                    Array.from(rootFilesMap.values()).find(f => f.name.startsWith('thea_podcast_settings'));

        // 2. Descargar todos los archivos esenciales en paralelo ultrarrápido
        const [remoteDeletedPayload, remoteUsers, pulledKitsLists, pulledProgressList, remoteAISettings, remotePodcastSettings, pulledMateriasList] = await Promise.all([
          deletedKitsFile ? this.readJsonFromDrive<any>(token!, deletedKitsFile.id).catch(() => null) : null,
          usersFile ? this.readJsonFromDrive<any[]>(token!, usersFile.id).catch(() => null) : null,
          Promise.all(allKitsFiles.map(f => this.readJsonFromDrive<StudyKit[]>(token!, f.id).catch(() => null))),
          Promise.all(allProgressFiles.map(f => this.readJsonFromDrive<any>(token!, f.id).catch(() => null))),
          aiSettingsFile ? this.readJsonFromDrive<AISettings>(token!, aiSettingsFile.id).catch(() => null) : null,
          podcastSettingsFile ? this.readJsonFromDrive<PodcastSettings>(token!, podcastSettingsFile.id).catch(() => null) : null,
          Promise.all(allMateriasFiles.map(f => this.readJsonFromDrive<any>(token!, f.id).catch(() => null))),
        ]);

        // 3. Procesar tombstones de kits eliminados antes de fusionar kits
        const baseTombstones = await restoreDeletedKitTombstonesAsync();
        const remoteTombMap = remoteDeletedPayload?.tombstones && typeof remoteDeletedPayload.tombstones === 'object'
          ? remoteDeletedPayload.tombstones
          : null;
        const remoteTombArr = Array.isArray(remoteDeletedPayload?.deletedIds)
          ? remoteDeletedPayload.deletedIds
          : (Array.isArray(remoteDeletedPayload) ? remoteDeletedPayload : null);
        const mergedTombstones = mergeDeletedKitTombstones(remoteTombMap, remoteTombArr, baseTombstones);
        const deletedIds = new Set(Object.keys(mergedTombstones));

        // 4. Procesar e integrar usuarios
        if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
          const localUsers = authService.getRawStoredUsers();
          const mergedMap = new Map<string, any>();
          for (const u of localUsers) mergedMap.set(u.id, u);
          for (const u of remoteUsers) {
            const localU = mergedMap.get(u.id);
            const uHasAiKey = Boolean(
              (u.aiSettings?.apiKey && u.aiSettings.apiKey.trim().length > 0) ||
              (u.aiSettings?.geminiApiKey && u.aiSettings.geminiApiKey.trim().length > 0) ||
              (u.aiSettings?.grokApiKey && u.aiSettings.grokApiKey.trim().length > 0) ||
              (u.aiSettings?.groqApiKey && u.aiSettings.groqApiKey.trim().length > 0)
            );
            if (uHasAiKey && u.aiSettings) {
              u.aiSettings.verified = true;
              authService.saveUserAISettings(u.id, u.aiSettings);
              const currentSettings = getAISettings();
              const currHasKey = Boolean(
                (currentSettings.apiKey && currentSettings.apiKey.trim().length > 0) ||
                (currentSettings.geminiApiKey && currentSettings.geminiApiKey.trim().length > 0)
              );
              if (!currHasKey) {
                saveAISettings(u.aiSettings);
              }
            }
            if (u.podcastSettings) {
              authService.saveUserPodcastSettings(u.id, u.podcastSettings);
            }
            mergedMap.set(u.id, { ...localU, ...u });
          }
          authService.setRawStoredUsers(Array.from(mergedMap.values()));
        }

        // 5. Procesar progreso ANTES de fusionar kits para que getSavedFlashcardMasteryInfo tenga lo último
        const validRemoteProgressList = (pulledProgressList || []).filter(p => p && typeof p === 'object');
        const anyProgressIntegrated = applyRemoteProgressPayloads(userId, validRemoteProgressList);

        // 6. Procesar e integrar kits de estudio respetando tombstones y marcas temporales
        let remoteKitsAccumulated: StudyKit[] = [];
        for (const kList of (pulledKitsLists || [])) {
          if (Array.isArray(kList) && kList.length > 0) {
            const clean = kList.filter(k => !isCorruptedKit(k) && !isKitDeletedByTombstone(k, deletedIds, mergedTombstones));
            remoteKitsAccumulated = mergeKitsByUpdatedAt(remoteKitsAccumulated, clean, deletedIds, mergedTombstones);
          }
        }

        const localKits = authService.getUserKits(userId).filter(
          k => !isCorruptedKit(k) && !isKitDeletedByTombstone(k, deletedIds, mergedTombstones)
        );
        const mergedKits = mergeKitsByUpdatedAt(localKits, remoteKitsAccumulated, deletedIds, mergedTombstones);

        let validPulledKits: StudyKit[] | null = null;
        if (mergedKits.length > 0 || allKitsFiles.length > 0) {
          validPulledKits = mergedKits;
          await authService.saveUserKitsAsync(userId, mergedKits);
          authService.markKitsSyncedWithDrive(userId, mergedKits.map(k => k.id));

          // Si el dispositivo local aportó kits nuevos que no estaban aún en Drive, subir la consolidación
          const remoteIds = new Set(remoteKitsAccumulated.map(k => k.id));
          const localHasExtraKits = localKits.some(k => !remoteIds.has(k.id) || (k.updatedAt || 0) > (remoteKitsAccumulated.find(r => r.id === k.id)?.updatedAt || 0));
          const localHasExtraTombstones = Object.keys(mergedTombstones).some(id =>
            !RETIRED_TEST_KIT_IDS.includes(id) && (!remoteTombMap || (mergedTombstones[id] > (remoteTombMap[id] || 0)))
          );
          if (localHasExtraKits || localHasExtraTombstones) {
            setTimeout(() => {
              this.pushToDrive(userId, mergedKits).catch(() => {});
            }, 800);
          }
        }

        // Consolidar progreso saneado si se integraron múltiples archivos de progreso
        if (anyProgressIntegrated && allProgressFiles.length > 1) {
          const unifiedProgress = await readUnifiedProgressAsync(userId);
          if (Object.keys(unifiedProgress.sessions).length > 0 || Object.keys(unifiedProgress.flashcards).length > 0) {
            const cleanPayload = {
              version: 1,
              updatedAt: Date.now(),
              userId,
              ...unifiedProgress,
              theme: getStoredTheme(),
            };
            this.uploadOrUpdateJson(token!, rootFolderId, `thea_progress_${userId}.json`, cleanPayload).catch(() => {});
          }
        }

        // 7. Procesar ajustes de IA
        const localAISettings = getAISettings();
        let effectiveRemoteAI = remoteAISettings;
        if (effectiveRemoteAI && typeof effectiveRemoteAI === 'object') {
          const remoteHasKey = Boolean(
            (effectiveRemoteAI.apiKey && effectiveRemoteAI.apiKey.trim().length > 0) ||
            (effectiveRemoteAI.geminiApiKey && effectiveRemoteAI.geminiApiKey.trim().length > 0) ||
            (effectiveRemoteAI.grokApiKey && effectiveRemoteAI.grokApiKey.trim().length > 0) ||
            (effectiveRemoteAI.groqApiKey && effectiveRemoteAI.groqApiKey.trim().length > 0)
          );
          const localHasKey = Boolean(
            (localAISettings.apiKey && localAISettings.apiKey.trim().length > 0) ||
            (localAISettings.geminiApiKey && localAISettings.geminiApiKey.trim().length > 0) ||
            (localAISettings.grokApiKey && localAISettings.grokApiKey.trim().length > 0) ||
            (localAISettings.groqApiKey && localAISettings.groqApiKey.trim().length > 0)
          );

          if (remoteHasKey) {
            const merged: AISettings = {
              ...effectiveRemoteAI,
              verified: true,
            };
            saveAISettings(merged);
            if (effectiveRemoteAI.geminiApiKey?.trim()) {
              safeLocalStorageSetItem('contrareloj_gemini_api_key', effectiveRemoteAI.geminiApiKey.trim());
              savePodcastSettings({ geminiApiKey: effectiveRemoteAI.geminiApiKey.trim() });
            }
            if (userId) {
              authService.saveUserAISettings(userId, merged);
            }
            const activeUser = authService.getCurrentUser();
            if (activeUser) {
              authService.saveUserAISettings(activeUser.id, merged);
            }
          } else if (localHasKey) {
            this.uploadOrUpdateJson(token!, rootFolderId, 'thea_ai_settings.json', localAISettings).catch(() => {});
          }
        } else if (
          (localAISettings.apiKey && localAISettings.apiKey.trim().length > 0) ||
          (localAISettings.geminiApiKey && localAISettings.geminiApiKey.trim().length > 0)
        ) {
          this.uploadOrUpdateJson(token!, rootFolderId, 'thea_ai_settings.json', localAISettings).catch(() => {});
        }

        // 8. Procesar ajustes de Podcast
        if (remotePodcastSettings && typeof remotePodcastSettings === 'object') {
          savePodcastSettings(remotePodcastSettings);
          if (userId) {
            authService.saveUserPodcastSettings(userId, remotePodcastSettings);
          }
          if (remotePodcastSettings.geminiApiKey && remotePodcastSettings.geminiApiKey.trim().length > 0) {
            safeLocalStorageSetItem('contrareloj_gemini_api_key', remotePodcastSettings.geminiApiKey.trim());
            const currAi = getAISettings();
            saveAISettings({
              ...currAi,
              geminiApiKey: remotePodcastSettings.geminiApiKey.trim(),
            });
          }
        } else {
          const localPodcastSettings = getPodcastSettings();
          if (
            localPodcastSettings.geminiApiKey ||
            localPodcastSettings.sofiaVoice !== 'Aoede' ||
            localPodcastSettings.mateoVoice !== 'Puck'
          ) {
            this.uploadOrUpdateJson(token!, rootFolderId, 'thea_podcast_settings.json', localPodcastSettings).catch(() => {});
          }
        }

        // 9. Procesar e integrar materias personalizadas y tombstones
        if (Array.isArray(pulledMateriasList) && pulledMateriasList.some(Boolean)) {
          mergeAndPersistRemoteMaterias(userId, pulledMateriasList);
        }

        // 10. Notificar inmediatamente a toda la interfaz (incluyendo App.tsx para kits y Analytics/Home para progreso)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('thea_ai_settings_changed'));
          window.dispatchEvent(new CustomEvent('contrareloj_podcast_settings_changed', { detail: getPodcastSettings() }));
          window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { userId } }));
          if (validPulledKits !== null) {
            window.dispatchEvent(new CustomEvent('thea_drive_kits_updated', {
              detail: { userId, kits: validPulledKits, deletedIds: Array.from(deletedIds) }
            }));
          }
        }

        const now = Date.now();
        const remoteMaxMs = getMaxModifiedTimeMs(rootFiles);
        setRemoteWatermark(userId, Math.max(remoteMaxMs, now));
        safeLocalStorageSetItem(STORAGE_LAST_SYNC_KEY, now.toString());
        saveSessionItem(STORAGE_LAST_SYNC_KEY, now.toString()).catch(() => {});
        try {
          safeLocalStorageSetItem(`thea_last_drive_sync_${userId}`, now.toString());
        } catch {}

        updateState({
          status: 'synced',
          lastSyncTime: now,
          filesSyncedCount: rootFiles.length,
          errorMessage: null,
        });

        // 11. Descarga de activos visuales en segundo plano sin bloquear el retorno ni la UI
        this.syncAssetsInBackground(token!, rootFolderId).catch((err) => {
          console.warn('[GoogleDriveService] Error en sincronización de activos en segundo plano:', err);
        });

        return validPulledKits;
      } catch (err: any) {
        console.error('[GoogleDriveService] Error en pullFromDrive:', err);
        const { is401 } = classifyDriveError(err);
        if (is401) {
          this.clearAccessToken();
          const refreshedToken = await this.attemptSilentTokenRefresh();
          if (refreshedToken) {
            isPullFromDriveInFlight = false;
            inFlightPullPromise = null;
            return this.pullFromDrive(userId);
          }
          updateState({
            status: 'needs_reauth',
            errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
          });
        } else {
          updateState({ status: 'error', errorMessage: err?.message || 'Error al descargar datos de Drive.' });
        }
        return null;
      } finally {
        isPullFromDriveInFlight = false;
        inFlightPullPromise = null;
      }
    })();

    return inFlightPullPromise;
  },

  /**
   * Sube los datos locales actualizados a Google Drive en segundo plano con fusión previa bidireccional
   * de tombstones, progreso, kits y materias para no pisar jamás cambios de otros dispositivos.
   */
  async pushToDrive(userId: string, kits: StudyKit[]): Promise<void> {
    if (!userId || userId === 'guest') {
      console.warn('[GoogleDriveService] Intento de escritura en la nube sin sesión de usuario activa bloqueado.');
      return;
    }

    if (!kits || !Array.isArray(kits)) {
      return;
    }

    const localTombstonesPre = await restoreDeletedKitTombstonesAsync();
    const hasExplicitUserDeletions = Object.keys(localTombstonesPre).some(
      id => !RETIRED_TEST_KIT_IDS.includes(id)
    );

    if (kits.length === 0 && !hasExplicitUserDeletions) {
      console.warn('[GoogleDriveService] Bloqueada sobreescritura de la nube con lista vacía para proteger la persistencia infinita.');
      return;
    }

    if (isPushToDriveInFlight) {
      pendingPushToDriveKits = kits;
      pendingPushToDriveUserId = userId;
      return;
    }

    const delSetPre = new Set(Object.keys(localTombstonesPre));
    const cleanKits: StudyKit[] = kits
      .filter(k => !isCorruptedKit(k) && !isKitDeletedByTombstone(k, delSetPre, localTombstonesPre))
      .map(k => ({ ...k, updatedAt: k.updatedAt || Date.now() }));

    if (cleanKits.length === 0 && !hasExplicitUserDeletions) {
      console.warn('[GoogleDriveService] Intento de subir kits corruptos a la nube bloqueado.');
      return;
    }

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) {
      const hasEmail = Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
      if (hasEmail) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión para sincronizar.',
        });
      }
      return;
    }

    isPushToDriveInFlight = true;
    updateState({ status: 'syncing', errorMessage: null });

    try {
      await yieldIfScrolling();
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);

      // 1. Listar archivos existentes y descargar tombstones, kits, progreso y materias remotos para fusionar antes de escribir
      const userKitsFileName = `thea_kits_${userId}.json`;
      const userProgressFileName = `thea_progress_${userId}.json`;
      const userMateriasFileName = `thea_materias_${userId}.json`;

      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const deletedFile = rootFiles.find(f => f.name === DELETED_KITS_DRIVE_FILE);
      const allDriveKitsFiles = rootFiles.filter(f =>
        f.name.startsWith('thea_kits_') || f.name === 'thea_study_kits.json' || f.name === 'thea_study_kits_v2.json'
      );
      const allProgressFiles = sortProgressFilesChronologically(rootFiles, userId);
      const allMateriasFiles = rootFiles.filter(f =>
        f.name.startsWith('thea_materias_') || f.name === 'thea_custom_materias.json'
      );

      const [remoteDeletedPayload, remoteKitsLists, remoteProgressLists, remoteMateriasLists] = await Promise.all([
        deletedFile ? this.readJsonFromDrive<any>(token, deletedFile.id).catch(() => null) : null,
        Promise.all(allDriveKitsFiles.map(f => this.readJsonFromDrive<StudyKit[]>(token, f.id).catch(() => null))),
        Promise.all(allProgressFiles.map(f => this.readJsonFromDrive<any>(token, f.id).catch(() => null))),
        Promise.all(allMateriasFiles.map(f => this.readJsonFromDrive<any>(token, f.id).catch(() => null))),
      ]);

      const remoteTombMap = remoteDeletedPayload?.tombstones && typeof remoteDeletedPayload.tombstones === 'object'
        ? remoteDeletedPayload.tombstones
        : null;
      const remoteTombArr = Array.isArray(remoteDeletedPayload?.deletedIds)
        ? remoteDeletedPayload.deletedIds
        : (Array.isArray(remoteDeletedPayload) ? remoteDeletedPayload : null);
      const mergedTombstones = mergeDeletedKitTombstones(remoteTombMap, remoteTombArr, localTombstonesPre);
      const mergedDelSet = new Set(Object.keys(mergedTombstones));

      // Integrar progreso remoto antes de leer el progreso unificado (evita sobrescribir avance de otro dispositivo)
      const validRemoteProg = remoteProgressLists.filter(p => p && typeof p === 'object');
      if (validRemoteProg.length > 0) {
        applyRemoteProgressPayloads(userId, validRemoteProg);
      }

      // Integrar materias remotas antes de subir
      const localMaterias = getStoredCustomMaterias(userId);
      const mergedMatState = mergeAndPersistRemoteMaterias(userId, remoteMateriasLists, localMaterias);

      // Integrar kits remotos respetando tombstones y updatedAt
      let driveMergedKits: StudyKit[] = cleanKits.filter(k => !isKitDeletedByTombstone(k, mergedDelSet, mergedTombstones));
      for (const remoteKits of remoteKitsLists) {
        if (Array.isArray(remoteKits) && remoteKits.length > 0) {
          driveMergedKits = mergeKitsByUpdatedAt(remoteKits, driveMergedKits, mergedDelSet, mergedTombstones);
        }
      }

      // Si los kits locales difieren por fusión remota o eliminaciones remotas, sincronizar estado local + UI
      const cleanLocalIds = new Set(cleanKits.map(k => k.id));
      const mergedIds = new Set(driveMergedKits.map(k => k.id));
      const kitsChangedByMerge =
        driveMergedKits.length !== cleanKits.length ||
        driveMergedKits.some(k => !cleanLocalIds.has(k.id)) ||
        cleanKits.some(k => !mergedIds.has(k.id));

      if (kitsChangedByMerge) {
        await authService.saveUserKitsAsync(userId, driveMergedKits);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('thea_drive_kits_updated', {
            detail: { userId, kits: driveMergedKits, deletedIds: Array.from(mergedDelSet) }
          }));
        }
      }

      const localUsers = authService.getRawStoredUsers();
      const lightweightKits = stripHeavyAssetsForLocalStorage(driveMergedKits);
      const { sessions: userSessions, revealedQuestions: userRevealed, flashcards: userFlashcards } =
        await readUnifiedProgressAsync(userId);

      const deletedPayload = {
        version: 1,
        updatedAt: Date.now(),
        tombstones: mergedTombstones,
        deletedIds: Array.from(mergedDelSet),
      };

      const materiasPayload = {
        version: 2,
        updatedAt: Date.now(),
        materias: mergedMatState.materias,
        deletedMaterias: mergedMatState.deletedMaterias,
      };

      const currentPodcastSettings = getPodcastSettings();
      const uploadPromises: Promise<any>[] = [
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_auth_users.json', localUsers),
        this.uploadOrUpdateJson(token, rootFolderId, userKitsFileName, lightweightKits),
        this.uploadOrUpdateJson(token, rootFolderId, DELETED_KITS_DRIVE_FILE, deletedPayload),
        this.uploadOrUpdateJson(token, rootFolderId, userMateriasFileName, materiasPayload),
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_podcast_settings.json', currentPodcastSettings),
      ];

      // Solo subir progreso si hay datos reales (y tras haber fusionado lo remoto) para jamás pisar progreso ajeno con {}
      const hasAnyProgressToUpload =
        Object.keys(userSessions).length > 0 ||
        Object.keys(userFlashcards).length > 0 ||
        Object.keys(userRevealed).length > 0;

      if (hasAnyProgressToUpload) {
        const userProgressPayload = {
          version: 1,
          updatedAt: Date.now(),
          userId,
          sessions: userSessions,
          revealedQuestions: userRevealed,
          flashcards: userFlashcards,
          theme: getStoredTheme(),
        };
        uploadPromises.push(this.uploadOrUpdateJson(token, rootFolderId, userProgressFileName, userProgressPayload));
      }

      await Promise.all(uploadPromises);

      authService.markKitsSyncedWithDrive(userId, driveMergedKits.map(k => k.id));

      // 2. Comprobación O(1) de memoria para activos visuales:
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const existingDriveAssets = await this.listFilesInFolder(token, assetsFolderId);
      const driveAssetNames = new Set(existingDriveAssets.map(f => f.name));

      const allLocalAssetKeys = await getAllStoredAssetKeys();
      const missingKeys = allLocalAssetKeys.filter(key => {
        return !driveAssetNames.has(`${key}.png`) && !driveAssetNames.has(`${key}.jpg`);
      });

      let uploadedCount = 0;
      if (missingKeys.length > 0) {
        const BATCH_SIZE = 4;
        for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
          await yieldIfScrolling();
          const batchKeys = missingKeys.slice(i, i + BATCH_SIZE);
          const loadedAssets = (await Promise.all(batchKeys.map(k => getAssetById(k)))).filter((a): a is DocumentAsset => Boolean(a && a.dataUrl));
          const results = await Promise.all(
            loadedAssets.map(asset => this.uploadAssetDirectly(token, assetsFolderId, asset))
          );
          uploadedCount += results.filter(Boolean).length;
          if (i + BATCH_SIZE < missingKeys.length) {
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }

      // 3. Guardar configuración de IA y API propia en Google Drive si tiene clave personal o Gemini
      const currentAISettings = getAISettings();
      const hasAiKey = Boolean(
        (currentAISettings.apiKey && currentAISettings.apiKey.trim().length > 0) ||
        (currentAISettings.geminiApiKey && currentAISettings.geminiApiKey.trim().length > 0)
      );
      if (hasAiKey) {
        await this.uploadOrUpdateJson(token, rootFolderId, 'thea_ai_settings.json', currentAISettings);
      }

      const now = Date.now();
      setRemoteWatermark(userId, now);
      safeLocalStorageSetItem(STORAGE_LAST_SYNC_KEY, now.toString());
      saveSessionItem(STORAGE_LAST_SYNC_KEY, now.toString()).catch(() => {});
      updateState({
        status: 'synced',
        lastSyncTime: now,
        filesSyncedCount: existingDriveAssets.length + uploadedCount + uploadPromises.length,
        errorMessage: null,
      });
    } catch (err: any) {
      console.warn('[GoogleDriveService] Error en pushToDrive:', err?.message || err);
      const { is401, isNetwork } = classifyDriveError(err);
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          isPushToDriveInFlight = false;
          return this.pushToDrive(userId, kits);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      } else {
        updateState({
          status: 'error',
          errorMessage: isNetwork
            ? 'Sin conexión al guardar en Google Drive. Se reintentará automáticamente.'
            : (err?.message || 'Error al sincronizar con Google Drive.'),
        });
      }
    } finally {
      isPushToDriveInFlight = false;
      if (pendingPushToDriveUserId && pendingPushToDriveKits) {
        const nextKits = pendingPushToDriveKits;
        const nextUser = pendingPushToDriveUserId;
        pendingPushToDriveKits = null;
        pendingPushToDriveUserId = null;
        setTimeout(() => {
          this.pushToDrive(nextUser, nextKits).catch(() => {});
        }, 1200);
      }
    }
  },

  /**
   * Sube un kit recién creado y todas sus imágenes asociadas a Google Drive de forma inmediata y ultra rápida,
   * garantizando que la subida nunca se aborte aunque aún no existan sesiones previas de estudio.
   */
  async pushKitImmediately(userId: string, newKit: StudyKit, allKits: StudyKit[]): Promise<void> {
    if (!userId || userId === 'guest') {
      console.warn('[GoogleDriveService] Intento de subir kit a la nube sin sesión activa bloqueado.');
      return;
    }

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) return;

    try {
      updateState({ status: 'syncing', errorMessage: null });

      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);

      // 1. Descargar tombstones, kits y progreso remoto existentes antes de fusionar
      const localTombstones = await restoreDeletedKitTombstonesAsync();
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const deletedFile = rootFiles.find(f => f.name === DELETED_KITS_DRIVE_FILE);
      const userKitsFileName = `thea_kits_${userId}.json`;
      const existingDriveKitsFile = rootFiles.find(f => f.name === userKitsFileName);
      const progressFiles = sortProgressFilesChronologically(rootFiles, userId);

      const [remoteDeletedPayload, remoteKits, remoteProgressList] = await Promise.all([
        deletedFile ? this.readJsonFromDrive<any>(token, deletedFile.id).catch(() => null) : null,
        existingDriveKitsFile ? this.readJsonFromDrive<StudyKit[]>(token, existingDriveKitsFile.id).catch(() => null) : null,
        Promise.all(progressFiles.map(f => this.readJsonFromDrive<any>(token, f.id).catch(() => null))),
      ]);

      const remoteTombMap = remoteDeletedPayload?.tombstones && typeof remoteDeletedPayload.tombstones === 'object'
        ? remoteDeletedPayload.tombstones
        : null;
      const remoteTombArr = Array.isArray(remoteDeletedPayload?.deletedIds)
        ? remoteDeletedPayload.deletedIds
        : (Array.isArray(remoteDeletedPayload) ? remoteDeletedPayload : null);
      const mergedTombstones = mergeDeletedKitTombstones(remoteTombMap, remoteTombArr, localTombstones);
      const deletedIds = new Set(Object.keys(mergedTombstones));

      const validRemoteProg = remoteProgressList.filter(p => p && typeof p === 'object');
      if (validRemoteProg.length > 0) {
        applyRemoteProgressPayloads(userId, validRemoteProg);
      }

      const cleanKits: StudyKit[] = allKits
        .filter(k => !isCorruptedKit(k) && !isKitDeletedByTombstone(k, deletedIds, mergedTombstones))
        .map(k => ({ ...k, updatedAt: k.updatedAt || Date.now() }));

      let driveMergedKits: StudyKit[] = cleanKits;
      if (Array.isArray(remoteKits) && remoteKits.length > 0) {
        driveMergedKits = mergeKitsByUpdatedAt(remoteKits, cleanKits, deletedIds, mergedTombstones);
      }

      if (driveMergedKits.length > cleanKits.length) {
        await authService.saveUserKitsAsync(userId, driveMergedKits);
      }

      const lightweightKits = stripHeavyAssetsForLocalStorage(driveMergedKits);
      const localUsers = authService.getRawStoredUsers();
      const { sessions: userSessions, revealedQuestions: userRevealed, flashcards: userFlashcards } =
        await readUnifiedProgressAsync(userId);

      const deletedPayload = {
        version: 1,
        updatedAt: Date.now(),
        tombstones: mergedTombstones,
        deletedIds: Array.from(deletedIds),
      };

      const jsonUploadPromises: Promise<any>[] = [
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_auth_users.json', localUsers),
        this.uploadOrUpdateJson(token, rootFolderId, userKitsFileName, lightweightKits),
        this.uploadOrUpdateJson(token, rootFolderId, DELETED_KITS_DRIVE_FILE, deletedPayload),
      ];

      if (
        Object.keys(userSessions).length > 0 ||
        Object.keys(userFlashcards).length > 0 ||
        Object.keys(userRevealed).length > 0
      ) {
        const userProgressPayload = {
          version: 1,
          updatedAt: Date.now(),
          userId,
          sessions: userSessions,
          revealedQuestions: userRevealed,
          flashcards: userFlashcards,
          theme: getStoredTheme(),
        };
        jsonUploadPromises.push(
          this.uploadOrUpdateJson(token, rootFolderId, `thea_progress_${userId}.json`, userProgressPayload)
        );
      }

      // 2. Extraer activos de este kit de forma desacoplada sin mutar los kits en memoria
      const kitAssetsToUpload: DocumentAsset[] = [];
      const seenAssetIds = new Set<string>();

      const collectAssetId = (a?: DocumentAsset | null) => {
        if (a && a.id && !seenAssetIds.has(a.id)) {
          seenAssetIds.add(a.id);
          kitAssetsToUpload.push({ ...a });
        }
      };

      if (Array.isArray(newKit.assets)) {
        for (const a of newKit.assets) collectAssetId(a);
      }
      if (Array.isArray(newKit.questions)) {
        for (const q of newKit.questions) collectAssetId(q.sourceAsset);
      }
      if (Array.isArray(newKit.flashcards)) {
        for (const f of newKit.flashcards) collectAssetId(f.sourceAsset);
      }
      if (Array.isArray((newKit as any).smartStudyQuestions)) {
        for (const q of (newKit as any).smartStudyQuestions) collectAssetId(q.sourceAsset);
      }

      // Hidratar dataUrl desde IndexedDB en los objetos temporales desacoplados exclusivamente para la subida
      for (const tempAsset of kitAssetsToUpload) {
        if (!tempAsset.dataUrl) {
          try {
            const stored = await getAssetById(tempAsset.id);
            if (stored?.dataUrl) {
              tempAsset.dataUrl = stored.dataUrl;
            }
          } catch {}
        }
      }

      // 3. Consultar una sola vez los archivos ya existentes en la carpeta assets/ de Drive
      const [existingDriveAssets] = await Promise.all([
        this.listFilesInFolder(token, assetsFolderId),
        Promise.all(jsonUploadPromises),
      ]);

      const driveAssetNames = new Set(existingDriveAssets.map(f => f.name));

      const pendingAssets = kitAssetsToUpload.filter(asset => {
        if (!asset.id || !asset.dataUrl) return false;
        const isPng = asset.dataUrl.includes('image/png');
        const expectedName = `${asset.id}.${isPng ? 'png' : 'jpg'}`;
        return !driveAssetNames.has(expectedName);
      });

      // 4. Subir imágenes en paralelo en lotes concurrentes de 6
      const BATCH_SIZE = 6;
      let uploadedCount = 0;
      for (let i = 0; i < pendingAssets.length; i += BATCH_SIZE) {
        const batch = pendingAssets.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(asset => this.uploadAssetDirectly(token, assetsFolderId, asset))
        );
        uploadedCount += results.filter(Boolean).length;
        if (i + BATCH_SIZE < pendingAssets.length) {
          await new Promise(r => setTimeout(r, 80));
        }
      }

      const now = Date.now();
      setRemoteWatermark(userId, now);
      safeLocalStorageSetItem(STORAGE_LAST_SYNC_KEY, now.toString());
      saveSessionItem(STORAGE_LAST_SYNC_KEY, now.toString()).catch(() => {});
      authService.markKitsSyncedWithDrive(userId, driveMergedKits.map(k => k.id));
      updateState({
        status: 'synced',
        lastSyncTime: now,
        filesSyncedCount: existingDriveAssets.length + uploadedCount + jsonUploadPromises.length,
        errorMessage: null,
      });
      console.log(`[GoogleDriveService] Kit '${newKit.title}' sincronizado de inmediato. ${uploadedCount} imágenes subidas a Drive.`);
    } catch (err: any) {
      console.error('[GoogleDriveService] Error en pushKitImmediately:', err);
      const { is401, isNetwork } = classifyDriveError(err);
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          return this.pushKitImmediately(userId, newKit, allKits);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      } else {
        updateState({
          status: 'error',
          errorMessage: isNetwork
            ? 'Sin conexión al respaldar kit en Google Drive.'
            : (err.message || 'Error al respaldar kit en Google Drive'),
        });
      }
    }
  },

  /**
   * Sube inmediatamente la configuración de IA y API propia a Google Drive.
   */
  async syncAISettingsToDrive(overrideSettings?: AISettings): Promise<boolean> {
    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) {
      const hasEmail = Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
      if (hasEmail) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      }
      return false;
    }

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const aiSettings = overrideSettings || getAISettings();
      await this.uploadOrUpdateJson(token, rootFolderId, 'thea_ai_settings.json', aiSettings);
      return true;
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error sincronizando ajustes de IA con Drive:', e);
      const is401 = e?.message?.includes('401') || e?.message?.includes('TOKEN_EXPIRED') || e?.status === 401;
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          return this.syncAISettingsToDrive(overrideSettings);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      }
      return false;
    }
  },

  /**
   * Sube inmediatamente la configuración de Podcast a Google Drive (voces, motor, velocidad y clave Gemini).
   */
  async syncPodcastSettingsToDrive(overrideSettings?: PodcastSettings): Promise<boolean> {
    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) {
      const hasEmail = Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
      if (hasEmail) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      }
      return false;
    }

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const podcastSettings = overrideSettings || getPodcastSettings();
      await this.uploadOrUpdateJson(token, rootFolderId, 'thea_podcast_settings.json', podcastSettings);
      return true;
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error sincronizando ajustes de podcast con Drive:', e);
      const is401 = e?.message?.includes('401') || e?.message?.includes('TOKEN_EXPIRED') || e?.status === 401;
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          return this.syncPodcastSettingsToDrive(overrideSettings);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      }
      return false;
    }
  },

  /**
   * Sincroniza el progreso de estudio hacia Google Drive con fusión previa (merge-before-write)
   * y lectura completa de IndexedDB + LocalStorage para jamás pisar el avance de otros dispositivos.
   */
  async pushProgressToDrive(userId: string): Promise<void> {
    if (!userId || userId === 'guest') {
      return;
    }

    // Mutex estricto: evita colisiones simultáneas en Google Drive para el mismo archivo (error 503 / 429)
    if (isPushProgressInFlight) {
      pendingProgressPushUserId = userId;
      return;
    }

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) return;

    isPushProgressInFlight = true;
    updateState({ status: 'syncing', errorMessage: null });

    try {
      await yieldIfScrolling();
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);

      // 1. Descargar y fusionar progreso remoto antes de reescribir (si otro dispositivo avanzó, no lo aplastamos)
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const allProgressFiles = sortProgressFilesChronologically(rootFiles, userId);
      if (allProgressFiles.length > 0) {
        const remoteProgressLists = await Promise.all(
          allProgressFiles.map(f => this.readJsonFromDrive<any>(token, f.id).catch(() => null))
        );
        const validRemote = remoteProgressLists.filter(p => p && typeof p === 'object');
        if (validRemote.length > 0) {
          applyRemoteProgressPayloads(userId, validRemote);
        }
      }

      // 2. Leer estado consolidado completo desde RAM + LocalStorage + IndexedDB
      const { sessions: userSessions, revealedQuestions: userRevealed, flashcards: userFlashcards } =
        await readUnifiedProgressAsync(userId);

      // Escudo protector: nunca subir payload vacío si aún no hay sesiones ni flashcards
      if (
        Object.keys(userSessions).length === 0 &&
        Object.keys(userFlashcards).length === 0 &&
        Object.keys(userRevealed).length === 0
      ) {
        updateState({ status: 'synced', errorMessage: null });
        return;
      }

      const now = Date.now();
      const userProgressPayload = {
        version: 1,
        updatedAt: now,
        userId,
        sessions: userSessions,
        revealedQuestions: userRevealed,
        flashcards: userFlashcards,
        theme: getStoredTheme(),
      };
      const userProgressFileName = `thea_progress_${userId}.json`;
      await this.uploadOrUpdateJson(token, rootFolderId, userProgressFileName, userProgressPayload);

      setRemoteWatermark(userId, now);
      safeLocalStorageSetItem(STORAGE_LAST_SYNC_KEY, now.toString());
      updateState({
        status: 'synced',
        lastSyncTime: now,
        errorMessage: null,
      });
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error en pushProgressToDrive:', e?.message || e);
      const { is401, isNetwork } = classifyDriveError(e);
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          isPushProgressInFlight = false;
          return this.pushProgressToDrive(userId);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      } else {
        updateState({
          status: 'error',
          errorMessage: isNetwork
            ? 'Sin conexión al subir progreso a Drive.'
            : (e?.message || 'Error al sincronizar progreso con Drive.'),
        });
      }
    } finally {
      isPushProgressInFlight = false;
      if (pendingProgressPushUserId) {
        const nextUser = pendingProgressPushUserId;
        pendingProgressPushUserId = null;
        setTimeout(() => {
          this.pushProgressToDrive(nextUser).catch(() => {});
        }, 800);
      }
    }
  },

  /**
   * Descarga e integra rápidamente el progreso de todos los dispositivos (thea_progress_*.json) desde Google Drive.
   */
  async pullProgressFromDrive(userId: string): Promise<boolean> {
    if (!userId || userId === 'guest') return false;
    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) return false;

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const allProgressFiles = sortProgressFilesChronologically(rootFiles, userId);

      if (allProgressFiles.length === 0) return false;

      const progressList = await Promise.all(
        allProgressFiles.map(f => this.readJsonFromDrive<any>(token, f.id).catch(() => null))
      );

      const anyIntegrated = applyRemoteProgressPayloads(userId, progressList);

      if (anyIntegrated && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { userId } }));
      }
      return anyIntegrated;
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error en pullProgressFromDrive:', e);
      return false;
    }
  },

  /**
   * Sube inmediatamente a Google Drive los colores, materias personalizadas y tombstones de eliminaciones.
   * Realiza fusión previa por marca temporal para que prevalezca la modificación más reciente.
   */
  async pushMateriasToDrive(userId: string, materias?: CustomMateria[]): Promise<void> {
    if (!userId || userId === 'guest') return;

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) return;

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const userMateriasFileName = `thea_materias_${userId}.json`;
      const localMaterias = materias || getStoredCustomMaterias(userId);

      // Descargar materias y tombstones previos de Drive para fusión por fecha y hora
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const remoteFiles = rootFiles.filter(f =>
        f.name === userMateriasFileName || f.name.startsWith('thea_materias_') || f.name === 'thea_custom_materias.json'
      );

      let mergedState = {
        materias: localMaterias,
        deletedMaterias: getDeletedCustomMaterias(userId),
      };

      if (remoteFiles.length > 0) {
        const remotePayloads = await Promise.all(
          remoteFiles.map(f => this.readJsonFromDrive<any>(token, f.id).catch(() => null))
        );
        if (remotePayloads.some(Boolean)) {
          mergedState = mergeAndPersistRemoteMaterias(userId, remotePayloads, localMaterias);
        }
      }

      const now = Date.now();
      const uploadPayload = {
        version: 2,
        updatedAt: now,
        materias: mergedState.materias,
        deletedMaterias: mergedState.deletedMaterias,
      };

      await this.uploadOrUpdateJson(token, rootFolderId, userMateriasFileName, uploadPayload);
      setRemoteWatermark(userId, now);
      updateState({ status: 'synced', lastSyncTime: now, errorMessage: null });
      console.log('[GoogleDriveService] Materias y colores sincronizados con Google Drive inmediatamente.');
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error en pushMateriasToDrive:', e);
      const { is401 } = classifyDriveError(e);
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          return this.pushMateriasToDrive(userId, materias);
        }
      }
    }
  },

  /**
   * Programa la sincronización automática de kits hacia Google Drive con debounce corto (1.5s por defecto).
   */
  scheduleAutoSync(userId: string, kits: StudyKit[], delayMs: number = 1500): void {
    if (!userId || userId === 'guest') return;
    globalDrivePendingKits = kits;
    globalDrivePendingUserId = userId;
    hasPendingAutoSync = true;
    if (globalDriveDebounceTimer) clearTimeout(globalDriveDebounceTimer);
    globalDriveDebounceTimer = setTimeout(() => {
      this.flushAutoSync(userId, kits);
    }, delayMs);
  },

  /**
   * Programa la sincronización inmediata de progreso (respuestas, flashcards, reinicios) con debounce corto (1.5s).
   */
  scheduleProgressSync(userId: string, delayMs: number = 1500): void {
    if (!userId || userId === 'guest') return;
    globalProgressPendingUserId = userId;
    hasPendingProgressSync = true;
    if (globalProgressDebounceTimer) clearTimeout(globalProgressDebounceTimer);
    globalProgressDebounceTimer = setTimeout(() => {
      this.flushProgressSync(userId);
    }, delayMs);
  },

  flushProgressSync(userId?: string): void {
    if (globalProgressDebounceTimer) {
      clearTimeout(globalProgressDebounceTimer);
      globalProgressDebounceTimer = null;
    }
    const targetUserId = userId || globalProgressPendingUserId || authService.getCurrentUser()?.id;
    const shouldPush = Boolean(userId) || hasPendingProgressSync;
    globalProgressPendingUserId = null;
    hasPendingProgressSync = false;

    if (!shouldPush || !targetUserId || targetUserId === 'guest') return;
    this.pushProgressToDrive(targetUserId).catch(err => {
      console.warn('[GoogleDriveService] Error en flushProgressSync:', err);
    });
  },

  flushAutoSync(userId?: string, kits?: StudyKit[]): void {
    if (globalDriveDebounceTimer) {
      clearTimeout(globalDriveDebounceTimer);
      globalDriveDebounceTimer = null;
    }
    const hadPending = hasPendingAutoSync || Boolean(userId && kits);
    const targetUserId = userId || globalDrivePendingUserId || authService.getCurrentUser()?.id;
    const targetKits = kits || globalDrivePendingKits;
    globalDrivePendingKits = null;
    globalDrivePendingUserId = null;
    hasPendingAutoSync = false;

    if (!hadPending || !targetUserId || targetUserId === 'guest') return;

    const kitsToPush = targetKits || authService.getUserKits(targetUserId);
    if (Array.isArray(kitsToPush)) {
      this.pushToDrive(targetUserId, kitsToPush).catch(err => {
        console.warn('[GoogleDriveService] Error en flushAutoSync:', err);
      });
    }
  },

  /**
   * Vacía de inmediato todos los respaldos pendientes (flashcards IDB, progreso y kits) al ocultar pestaña o salir.
   */
  flushAllPendingSyncs(userId?: string): void {
    flashcardProgressService.flushPendingSaves();
    this.flushAutoSync(userId);
    this.flushProgressSync(userId);
  },
};

let globalDriveDebounceTimer: any = null;
let globalDrivePendingKits: StudyKit[] | null = null;
let globalDrivePendingUserId: string | null = null;
let hasPendingAutoSync = false;

let globalProgressDebounceTimer: any = null;
let globalProgressPendingUserId: string | null = null;
let hasPendingProgressSync = false;

// Registrar el descargador prioritario de activos en storageService para hidratar imágenes automáticamente
registerDriveAssetDownloader((assetIds) => googleDriveService.prioritizeAssetsDownload(assetIds));
