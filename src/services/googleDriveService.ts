import type { StudyKit, DocumentAsset, User, PodcastSettings } from '../types';
import { authService } from './authService';
import {
  getAllStoredAssets,
  saveAssetsToIndexedDB,
  stripHeavyAssetsForLocalStorage,
  saveSessionItem,
  getSessionItem,
  removeSessionItem,
  isCorruptedKit,
  mergeKitsByUpdatedAt,
  getDeletedKitIds,
  registerDriveAssetDownloader
} from './storageService';
import { getAISettings, saveAISettings, resetAISettingsToDefault, type AISettings } from './aiService';
import { getPodcastSettings, savePodcastSettings } from './geminiAudioService';
import {
  getStoredCustomMaterias,
  saveCustomMaterias,
  mergeCustomMaterias,
  type CustomMateria
} from './materiaService';

export type DriveSyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'unlinked' | 'needs_client_id' | 'needs_reauth';

export interface DriveSyncState {
  status: DriveSyncStatus;
  lastSyncTime: number | null;
  errorMessage: string | null;
  userEmail: string | null;
  userName: string | null;
  avatarUrl: string | null;
  filesSyncedCount: number;
}

const STORAGE_CLIENT_ID_KEY = 'thea_gdrive_client_id';
const STORAGE_TOKEN_KEY = 'thea_gdrive_token';
const STORAGE_TOKEN_EXP_KEY = 'thea_gdrive_token_exp';
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
};

let proactiveRefreshTimer: any = null;

// Initialize cached state from storage
try {
  const lastSync = localStorage.getItem(STORAGE_LAST_SYNC_KEY);
  const rawProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
  const token = localStorage.getItem(STORAGE_TOKEN_KEY);
  const expStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
  if (lastSync) {
    currentState.lastSyncTime = parseInt(lastSync, 10);
  }
  if (rawProfile) {
    const prof = JSON.parse(rawProfile);
    currentState.userEmail = prof.email || null;
    currentState.userName = prof.name || null;
    currentState.avatarUrl = prof.avatarUrl || null;

    if (token && expStr) {
      const exp = parseInt(expStr, 10);
      if (Date.now() > exp - 60000) {
        currentState.status = 'needs_reauth';
        currentState.errorMessage = 'Tu sesión de Google Drive requiere reconexión.';
      } else {
        currentState.status = 'synced';
      }
    } else {
      currentState.status = 'needs_reauth';
      currentState.errorMessage = 'Tu sesión de Google Drive requiere reconexión.';
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
    const [id, prof, token, exp, lastSync] = await Promise.all([
      getSessionItem<string>(STORAGE_CLIENT_ID_KEY),
      getSessionItem<any>(STORAGE_PROFILE_KEY),
      getSessionItem<string>(STORAGE_TOKEN_KEY),
      getSessionItem<string>(STORAGE_TOKEN_EXP_KEY),
      getSessionItem<string>(STORAGE_LAST_SYNC_KEY),
    ]);

    let changed = false;
    if (id && !localStorage.getItem(STORAGE_CLIENT_ID_KEY)) {
      localStorage.setItem(STORAGE_CLIENT_ID_KEY, id);
    }
    if (prof && !localStorage.getItem(STORAGE_PROFILE_KEY)) {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(prof));
      currentState.userEmail = prof.email || null;
      currentState.userName = prof.name || null;
      currentState.avatarUrl = prof.avatarUrl || null;
      changed = true;
    }
    if (token && !localStorage.getItem(STORAGE_TOKEN_KEY)) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    }
    if (exp && !localStorage.getItem(STORAGE_TOKEN_EXP_KEY)) {
      localStorage.setItem(STORAGE_TOKEN_EXP_KEY, exp);
    }
    if (lastSync && !localStorage.getItem(STORAGE_LAST_SYNC_KEY)) {
      localStorage.setItem(STORAGE_LAST_SYNC_KEY, lastSync);
      currentState.lastSyncTime = parseInt(lastSync, 10);
      changed = true;
    }

    if (changed) {
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
    return '';
  },

  /**
   * Guarda un nuevo Client ID en localStorage e IndexedDB.
   */
  setClientId(clientId: string): void {
    const clean = clientId.trim();
    if (clean) {
      localStorage.setItem(STORAGE_CLIENT_ID_KEY, clean);
      saveSessionItem(STORAGE_CLIENT_ID_KEY, clean).catch(() => {});
      updateState({ status: 'idle', errorMessage: null });
    } else {
      localStorage.removeItem(STORAGE_CLIENT_ID_KEY);
      removeSessionItem(STORAGE_CLIENT_ID_KEY).catch(() => {});
    }
  },

  /**
   * Verifica si existe un Client ID listo para operar.
   */
  hasClientId(): boolean {
    return this.getClientId().length > 0;
  },

  /**
   * Recupera el token de acceso OAuth activo si aún no ha expirado.
   */
  getValidAccessToken(): string | null {
    try {
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);
      const expStr = localStorage.getItem(STORAGE_TOKEN_EXP_KEY);
      if (!token || !expStr) return null;

      const exp = parseInt(expStr, 10);
      // Renovar 60 segundos antes de expirar
      if (Date.now() > exp - 60000) {
        return null;
      }
      return token;
    } catch {
      return null;
    }
  },

  /**
   * Indica si la cuenta de Google Drive ha sido vinculada previamente en este navegador.
   */
  isLinked(): boolean {
    return Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
  },

  /**
   * Intenta renovar el token de acceso de Google de forma silenciosa sin interrumpir al usuario.
   * Utiliza el hint del perfil del usuario para resolver la cuenta en segundo plano de manera transparente.
   */
  async attemptSilentTokenRefresh(): Promise<string | null> {
    const clientId = this.getClientId();
    if (!clientId) return null;

    try {
      await ensureGsiLoaded();

      let userEmail: string | undefined;
      const rawProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (rawProfile) {
        try {
          const p = JSON.parse(rawProfile);
          if (p?.email) userEmail = p.email;
        } catch {}
      }
      if (!userEmail && currentState.userEmail) {
        userEmail = currentState.userEmail;
      }

      return await new Promise<string | null>((resolve) => {
        try {
          const timeout = setTimeout(() => {
            resolve(null);
          }, 6000);

          const clientConfig: any = {
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
            prompt: '',
            callback: (response: any) => {
              clearTimeout(timeout);
              if (response.error || !response.access_token) {
                resolve(null);
                return;
              }
              const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
              this.setAccessToken(response.access_token, expiresIn);
              updateState({ status: 'synced', errorMessage: null });
              resolve(response.access_token);
            },
            error_callback: () => {
              clearTimeout(timeout);
              resolve(null);
            },
          };

          if (userEmail) {
            clientConfig.hint = userEmail;
          }

          const client = (window as any).google.accounts.oauth2.initTokenClient(clientConfig);

          // Solicitar token silenciosamente sin forzar selector si la sesión del navegador sigue activa
          const reqOpts: any = { prompt: '' };
          if (userEmail) {
            reqOpts.hint = userEmail;
          }
          client.requestAccessToken(reqOpts);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  },

  /**
   * Sincronización automática optimizada para el arranque de la aplicación o inicio de sesión.
   */
  async autoSyncOnStartup(userId: string): Promise<StudyKit[] | null> {
    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }

    if (!token) {
      if (this.isLinked()) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      }
      return null;
    }

    return this.pullFromDrive(userId);
  },

  /**
   * Guarda el token de acceso con su tiempo de expiración tanto en LocalStorage como en IndexedDB.
   */
  setAccessToken(token: string, expiresInSec: number = 3600): void {
    const expTime = Date.now() + expiresInSec * 1000;
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_TOKEN_EXP_KEY, expTime.toString());
    saveSessionItem(STORAGE_TOKEN_KEY, token).catch(() => {});
    saveSessionItem(STORAGE_TOKEN_EXP_KEY, expTime.toString()).catch(() => {});
  },

  /**
   * Limpia el token de acceso local cuando Google reporta que expiró o fue revocado (401).
   */
  clearAccessToken(): void {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_TOKEN_EXP_KEY);
    removeSessionItem(STORAGE_TOKEN_KEY).catch(() => {});
    removeSessionItem(STORAGE_TOKEN_EXP_KEY).catch(() => {});
  },

  /**
   * Desconecta la cuenta de Google y remueve los tokens locales e IndexedDB.
   */
  disconnect(): void {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (token && (window as any).google?.accounts?.oauth2?.revoke) {
      try {
        (window as any).google.accounts.oauth2.revoke(token, () => {});
      } catch {
        // Ignorar fallo de revocación
      }
    }
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_TOKEN_EXP_KEY);
    localStorage.removeItem(STORAGE_PROFILE_KEY);
    localStorage.removeItem(STORAGE_LAST_SYNC_KEY);

    removeSessionItem(STORAGE_TOKEN_KEY).catch(() => {});
    removeSessionItem(STORAGE_TOKEN_EXP_KEY).catch(() => {});
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
    });
  },

  /**
   * Inicia el flujo OAuth popup con Google Identity Services para autorizar Google Drive.
   */
  async requestGoogleAccess(): Promise<string> {
    const clientId = this.getClientId();
    if (!clientId) {
      updateState({ status: 'needs_client_id', errorMessage: 'Configura tu Google Client ID para continuar.' });
      throw new Error('CLIENT_ID_MISSING');
    }

    await ensureGsiLoaded();

    return new Promise((resolve, reject) => {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          prompt: '',
          callback: (response: any) => {
            if (response.error) {
              console.error('[GoogleDriveService] Error en popup OAuth:', response);
              updateState({ status: 'error', errorMessage: `Error de autenticación: ${response.error}` });
              reject(new Error(response.error));
              return;
            }

            if (response.access_token) {
              const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
              this.setAccessToken(response.access_token, expiresIn);
              resolve(response.access_token);
            } else {
              reject(new Error('No se recibió token de acceso de Google.'));
            }
          },
          error_callback: (err: any) => {
            console.error('[GoogleDriveService] Error callback GIS:', err);
            updateState({ status: 'error', errorMessage: err?.message || 'Ventana de inicio de sesión cerrada o cancelada.' });
            reject(err);
          },
        });

        client.requestAccessToken();
      } catch (err: any) {
        console.error('[GoogleDriveService] Excepción al invocar initTokenClient:', err);
        updateState({ status: 'error', errorMessage: err?.message || 'Error al inicializar sesión con Google.' });
        reject(err);
      }
    });
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

    localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
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
  async loginAndSync(onFastAuthenticated?: (user: User, localOrFastKits: StudyKit[]) => void): Promise<{ user: User; kits: StudyKit[] | null }> {
    updateState({ status: 'syncing', errorMessage: null });
    try {
      let token = this.getValidAccessToken();
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
          updateState({ status: 'error', errorMessage: err?.message || 'Error al sincronizar con Google Drive.' });
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
    const jsonStr = JSON.stringify(jsonData, null, 2);

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
  async uploadAssetDirectly(token: string, assetsFolderId: string, asset: DocumentAsset): Promise<string | null> {
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

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fullBlob,
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.clearAccessToken();
          throw new Error('TOKEN_EXPIRED_401');
        }
        console.warn(`[GoogleDriveService] No se pudo subir activo directo ${asset.id} (${res.status})`);
        return null;
      }

      const fileData = await res.json();
      return fileData.id;
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
   * Descarga un archivo de imagen desde Drive y lo convierte a DataURL.
   */
  async downloadAssetDataUrl(token: string, fileId: string): Promise<string> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.clearAccessToken();
        throw new Error('TOKEN_EXPIRED_401');
      }
      throw new Error(`Error al descargar activo ${fileId}`);
    }

    const blob = await res.blob();
    return await blobToDataUrl(blob);
  },

  /**
   * Lista todos los archivos dentro de una carpeta en Google Drive.
   */
  async listFilesInFolder(token: string, folderId: string): Promise<Array<{ id: string; name: string }>> {
    const q = `'${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      this.clearAccessToken();
      throw new Error('TOKEN_EXPIRED_401');
    }

    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  },

  /**
   * Sincroniza activos visuales de forma asíncrona en segundo plano sin congelar la interfaz.
   */
  async syncAssetsInBackground(token: string, rootFolderId: string): Promise<void> {
    try {
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const driveAssetFiles = await this.listFilesInFolder(token, assetsFolderId);

      if (driveAssetFiles.length === 0) return;

      const localAssets = await getAllStoredAssets();
      const localIds = new Set(localAssets.map(a => a.id));
      const assetsToDownload = driveAssetFiles.filter(f => {
        const rawId = f.name.replace(/\.[^/.]+$/, '');
        return !localIds.has(rawId);
      });

      if (assetsToDownload.length === 0) return;

      // Descargar en lotes de 4 concurrentes para no saturar la red ni la memoria
      const BATCH_SIZE = 4;
      for (let i = 0; i < assetsToDownload.length; i += BATCH_SIZE) {
        const batch = assetsToDownload.slice(i, i + BATCH_SIZE);
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
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('thea_assets_synced'));
          }
        }
      }
    } catch (e) {
      console.warn('[GoogleDriveService] Error en syncAssetsInBackground:', e);
    }
  },

  /**
   * Descarga de forma prioritaria los activos de un kit específico desde Google Drive si faltan localmente.
   */
  async prioritizeAssetsDownload(assetIds: string[]): Promise<Map<string, DocumentAsset>> {
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

      const downloaded = await Promise.all(
        filesToDownload.map(async (file): Promise<DocumentAsset | null> => {
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
    } catch (err) {
      console.warn('[GoogleDriveService] Error en prioritizeAssetsDownload:', err);
    }

    return result;
  },

  /**
   * Descarga el estado completo guardado en Google Drive y lo restaura localmente con consultas paralelas ultra rápidas.
   */
  async pullFromDrive(userId: string): Promise<StudyKit[] | null> {
    const token = this.getValidAccessToken();
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

    updateState({ status: 'syncing', errorMessage: null });

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);

      // 1. Obtener todos los archivos en la carpeta raíz en UNA sola llamada de red
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const rootFilesMap = new Map<string, { id: string; name: string }>();
      for (const f of rootFiles) {
        rootFilesMap.set(f.name, f);
      }

      const usersFile = rootFilesMap.get('thea_auth_users.json');
      const userKitsFileName = `thea_kits_${userId}.json`;
      const kitsFile = rootFilesMap.get(userKitsFileName) || rootFilesMap.get('thea_study_kits.json');
      const userProgressFileName = `thea_progress_${userId}.json`;
      const progressFile = rootFilesMap.get(userProgressFileName) || rootFilesMap.get('thea_progress.json');
      const aiSettingsFile = rootFilesMap.get('thea_ai_settings.json');
      const userPodcastSettingsFileName = `thea_podcast_settings_${userId}.json`;
      const podcastSettingsFile = rootFilesMap.get(userPodcastSettingsFileName) || rootFilesMap.get('thea_podcast_settings.json');
      const userMateriasFileName = `thea_materias_${userId}.json`;
      const materiasFile = rootFilesMap.get(userMateriasFileName) || rootFilesMap.get('thea_custom_materias.json');

      // 2. Descargar todos los archivos JSON esenciales en paralelo ultrarrápido (sub-segundo)
      const [remoteUsers, pulledKits, cloudProgress, remoteAISettings, remotePodcastSettings, remoteMaterias] = await Promise.all([
        usersFile ? this.readJsonFromDrive<any[]>(token, usersFile.id).catch(() => null) : null,
        kitsFile ? this.readJsonFromDrive<StudyKit[]>(token, kitsFile.id).catch(() => null) : null,
        progressFile ? this.readJsonFromDrive<any>(token, progressFile.id).catch(() => null) : null,
        aiSettingsFile ? this.readJsonFromDrive<AISettings>(token, aiSettingsFile.id).catch(() => null) : null,
        podcastSettingsFile ? this.readJsonFromDrive<PodcastSettings>(token, podcastSettingsFile.id).catch(() => null) : null,
        materiasFile ? this.readJsonFromDrive<CustomMateria[]>(token, materiasFile.id).catch(() => null) : null,
      ]);

      // 3. Procesar e integrar usuarios
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

      // 4. Procesar e integrar kits de estudio con fusion acumulativa estricta y proteccion anti-vaciado
      let validPulledKits: StudyKit[] | null = null;
      if (Array.isArray(pulledKits)) {
        const cleanPulled = pulledKits.filter(k => !isCorruptedKit(k));
        const deletedIds = getDeletedKitIds();
        const activePulled = cleanPulled.filter(k => !deletedIds.has(k.id));

        // Obtener kits locales actuales para fusion acumulativa (ningun kit local se pierde)
        const localKits = authService.getUserKits(userId);
        const mergedKits = mergeKitsByUpdatedAt(localKits, activePulled, deletedIds);

        if (mergedKits.length > 0) {
          validPulledKits = mergedKits;
          await authService.saveUserKitsAsync(userId, mergedKits);
          authService.markKitsSyncedWithDrive(userId, mergedKits.map(k => k.id));

          // Si la fusion acumulativa genero novedades para la nube o detecto eliminaciones, sincronizar hacia Drive tras reposo
          if (mergedKits.length !== cleanPulled.length || deletedIds.size > 0) {
            setTimeout(() => {
              this.pushToDrive(userId, mergedKits).catch(() => {});
            }, 4000);
          }
        } else {
          console.warn('[GoogleDriveService] Kits descargados de la nube vacios o corruptos; se preservan los kits locales para garantizar datos infinitos.');
        }
      }

      // 5. Procesar e integrar progreso de Smart Study (nivel, respuestas, historial)
      if (cloudProgress?.sessions && typeof cloudProgress.sessions === 'object') {
        authService.saveAllSmartStudySessions(userId, cloudProgress.sessions, cloudProgress.revealedQuestions);

        // Subir inmediatamente la versión validada y saneada a Google Drive para limpiar la nube
        const cleanSessions = authService.getAllSmartStudySessions(userId);
        const cleanRevealed = authService.getAllRevealedQuestionIds(userId);
        const cleanPayload = {
          version: 1,
          updatedAt: Date.now(),
          userId,
          sessions: cleanSessions,
          revealedQuestions: cleanRevealed,
        };
        this.uploadOrUpdateJson(token, rootFolderId, userProgressFileName, cleanPayload).catch(err => {
          console.warn('[GoogleDriveService] Error actualizando progreso saneado en Drive:', err);
        });
      }

      // 6. Procesar e integrar ajustes de IA
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
            localStorage.setItem('contrareloj_gemini_api_key', effectiveRemoteAI.geminiApiKey.trim());
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
          this.uploadOrUpdateJson(token, rootFolderId, 'thea_ai_settings.json', localAISettings).catch(() => {});
        }
      } else if (
        (localAISettings.apiKey && localAISettings.apiKey.trim().length > 0) ||
        (localAISettings.geminiApiKey && localAISettings.geminiApiKey.trim().length > 0)
      ) {
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_ai_settings.json', localAISettings).catch(() => {});
      }

      // 6.1 Procesar e integrar ajustes de Podcast
      if (remotePodcastSettings && typeof remotePodcastSettings === 'object') {
        savePodcastSettings(remotePodcastSettings);
        if (userId) {
          authService.saveUserPodcastSettings(userId, remotePodcastSettings);
        }
        if (remotePodcastSettings.geminiApiKey && remotePodcastSettings.geminiApiKey.trim().length > 0) {
          localStorage.setItem('contrareloj_gemini_api_key', remotePodcastSettings.geminiApiKey.trim());
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
          this.uploadOrUpdateJson(token, rootFolderId, 'thea_podcast_settings.json', localPodcastSettings).catch(() => {});
        }
      }

      // 6.b Procesar e integrar materias personalizadas y colores con prioridad por fecha y hora (más reciente gana)
      if (Array.isArray(remoteMaterias) && remoteMaterias.length > 0) {
        const localMaterias = getStoredCustomMaterias(userId);
        const mergedMaterias = mergeCustomMaterias(localMaterias, remoteMaterias);
        saveCustomMaterias(mergedMaterias, userId, false);
      }

      // 7. Notificar inmediatamente que los datos y el progreso están listos
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thea_ai_settings_changed'));
        window.dispatchEvent(new CustomEvent('contrareloj_podcast_settings_changed', { detail: getPodcastSettings() }));
        window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { userId } }));
      }

      const now = Date.now();
      localStorage.setItem(STORAGE_LAST_SYNC_KEY, now.toString());
      updateState({
        status: 'synced',
        lastSyncTime: now,
        filesSyncedCount: rootFiles.length,
        errorMessage: null,
      });

      // 8. Descarga de activos visuales en segundo plano sin bloquear el retorno ni la UI
      this.syncAssetsInBackground(token, rootFolderId).catch((err) => {
        console.warn('[GoogleDriveService] Error en sincronización de activos en segundo plano:', err);
      });

      return validPulledKits;
    } catch (err: any) {
      console.error('[GoogleDriveService] Error en pullFromDrive:', err);
      const is401 = err?.message?.includes('401') || err?.message?.includes('TOKEN_EXPIRED') || err?.status === 401;
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
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
    }
  },

  /**
   * Sube los datos locales actualizados a Google Drive en segundo plano con auto-renovación silenciosa de token.
   */
  async pushToDrive(userId: string, kits: StudyKit[]): Promise<void> {
    // 1. Candado estricto de sesión abierta: los datos de la nube solo pueden ser modificados con sesión abierta
    if (!userId || userId === 'guest') {
      console.warn('[GoogleDriveService] Intento de escritura en la nube sin sesión de usuario activa bloqueado.');
      return;
    }

    // 2. Candado estricto anti-vaciado: prohibido sobreescribir la nube con listas vacías o corruptas (datos infinitos)
    if (!kits || !Array.isArray(kits) || kits.length === 0) {
      console.warn('[GoogleDriveService] Bloqueada sobreescritura de la nube con lista vacía para proteger la persistencia infinita.');
      return;
    }

    const deletedIds = getDeletedKitIds();
    const cleanKits: StudyKit[] = kits
      .filter(k => !isCorruptedKit(k) && !deletedIds.has(k.id))
      .map(k => ({ ...k, updatedAt: k.updatedAt || Date.now() }));

    if (cleanKits.length === 0) {
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

    updateState({ status: 'syncing', errorMessage: null });

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);

      // 1. Guardar base de usuarios, kits y progreso en paralelo con fusion acumulativa
      const userKitsFileName = `thea_kits_${userId}.json`;
      const existingDriveKitsFile = await this.findFileInFolder(token, rootFolderId, userKitsFileName);
      let driveMergedKits: StudyKit[] = cleanKits;
      if (existingDriveKitsFile) {
        try {
          const remoteKits = await this.readJsonFromDrive<StudyKit[]>(token, existingDriveKitsFile.id);
          if (Array.isArray(remoteKits) && remoteKits.length > 0) {
            driveMergedKits = mergeKitsByUpdatedAt(remoteKits, cleanKits, deletedIds);
          }
        } catch (e) {
          console.warn('[GoogleDriveService] Error leyendo kits remotos previos:', e);
        }
      }

      if (driveMergedKits.length > cleanKits.length) {
        authService.saveUserKits(userId, driveMergedKits);
      }

      const localUsers = authService.getRawStoredUsers();
      const lightweightKits = stripHeavyAssetsForLocalStorage(driveMergedKits);
      const userSessions = authService.getAllSmartStudySessions(userId);
      const userRevealed = authService.getAllRevealedQuestionIds(userId);
      const userProgressPayload = {
        version: 1,
        updatedAt: Date.now(),
        userId,
        sessions: userSessions,
        revealedQuestions: userRevealed,
      };
      const userProgressFileName = `thea_progress_${userId}.json`;
      const userMateriasFileName = `thea_materias_${userId}.json`;
      const localMaterias = getStoredCustomMaterias(userId);

      const currentPodcastSettings = getPodcastSettings();
      await Promise.all([
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_auth_users.json', localUsers),
        this.uploadOrUpdateJson(token, rootFolderId, userKitsFileName, lightweightKits),
        this.uploadOrUpdateJson(token, rootFolderId, userProgressFileName, userProgressPayload),
        this.uploadOrUpdateJson(token, rootFolderId, userMateriasFileName, localMaterias),
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_podcast_settings.json', currentPodcastSettings),
      ]);

      authService.markKitsSyncedWithDrive(userId, driveMergedKits.map(k => k.id));

      // 2. Subir activos visuales a subcarpeta 'assets/' concurrentemente en lotes de 6
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const existingDriveAssets = await this.listFilesInFolder(token, assetsFolderId);
      const driveAssetNames = new Set(existingDriveAssets.map(f => f.name));

      const allLocalAssets = await getAllStoredAssets();
      const assetsToUpload = allLocalAssets.filter(asset => {
        if (!asset.id || !asset.dataUrl) return false;
        const isPng = asset.dataUrl.includes('image/png');
        const expectedName = `${asset.id}.${isPng ? 'png' : 'jpg'}`;
        return !driveAssetNames.has(expectedName);
      });

      let uploadedCount = 0;
      const BATCH_SIZE = 6;
      for (let i = 0; i < assetsToUpload.length; i += BATCH_SIZE) {
        const batch = assetsToUpload.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(asset => this.uploadAssetDirectly(token, assetsFolderId, asset))
        );
        uploadedCount += batch.length;
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
      localStorage.setItem(STORAGE_LAST_SYNC_KEY, now.toString());
      updateState({
        status: 'synced',
        lastSyncTime: now,
        filesSyncedCount: existingDriveAssets.length + uploadedCount + 3,
        errorMessage: null,
      });
    } catch (err: any) {
      console.error('[GoogleDriveService] Error en pushToDrive:', err);
      const is401 = err?.message?.includes('401') || err?.message?.includes('TOKEN_EXPIRED') || err?.status === 401;
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          return this.pushToDrive(userId, kits);
        }
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive requiere reconexión.',
        });
      } else {
        updateState({ status: 'error', errorMessage: err?.message || 'Error al sincronizar con Google Drive.' });
      }
    }
  },

  /**
   * Sube un kit recién creado y todas sus imágenes asociadas a Google Drive de forma inmediata y ultra rápida,
   * sin esperar el debounce y con subidas concurrentes en paralelo (lotes de 6 simultáneos).
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

      // 1. Guardar de inmediato los JSONs fundamentales en paralelo con fusion acumulativa
      const deletedIds = getDeletedKitIds();
      const cleanKits: StudyKit[] = allKits
        .filter(k => !isCorruptedKit(k) && !deletedIds.has(k.id))
        .map(k => ({ ...k, updatedAt: k.updatedAt || Date.now() }));

      const userKitsFileName = `thea_kits_${userId}.json`;
      const existingDriveKitsFile = await this.findFileInFolder(token, rootFolderId, userKitsFileName);
      let driveMergedKits: StudyKit[] = cleanKits;
      if (existingDriveKitsFile) {
        try {
          const remoteKits = await this.readJsonFromDrive<StudyKit[]>(token, existingDriveKitsFile.id);
          if (Array.isArray(remoteKits) && remoteKits.length > 0) {
            driveMergedKits = mergeKitsByUpdatedAt(remoteKits, cleanKits, deletedIds);
          }
        } catch {}
      }

      if (driveMergedKits.length > cleanKits.length) {
        authService.saveUserKits(userId, driveMergedKits);
      }

      const lightweightKits = stripHeavyAssetsForLocalStorage(driveMergedKits);
      const localUsers = authService.getRawStoredUsers();

      const userSessions = authService.getAllSmartStudySessions(userId);
      const userRevealed = authService.getAllRevealedQuestionIds(userId);
      const userProgressPayload = {
        version: 1,
        updatedAt: Date.now(),
        userId,
        sessions: userSessions,
        revealedQuestions: userRevealed,
      };
      const userProgressFileName = `thea_progress_${userId}.json`;

      const jsonUploadPromises = [
        this.uploadOrUpdateJson(token, rootFolderId, 'thea_auth_users.json', localUsers),
        this.uploadOrUpdateJson(token, rootFolderId, userKitsFileName, lightweightKits),
        this.uploadOrUpdateJson(token, rootFolderId, userProgressFileName, userProgressPayload),
      ];

      // 2. Extraer todos los activos de este kit y de IndexedDB
      const kitAssets: DocumentAsset[] = [];
      const seenIds = new Set<string>();

      const collectAsset = (a?: DocumentAsset | null) => {
        if (a && a.id && a.dataUrl && !seenIds.has(a.id)) {
          seenIds.add(a.id);
          kitAssets.push(a);
        }
      };

      if (Array.isArray(newKit.assets)) {
        for (const a of newKit.assets) collectAsset(a);
      }
      if (Array.isArray(newKit.questions)) {
        for (const q of newKit.questions) collectAsset(q.sourceAsset);
      }
      if (Array.isArray(newKit.flashcards)) {
        for (const f of newKit.flashcards) collectAsset(f.sourceAsset);
      }
      if (Array.isArray((newKit as any).smartStudyQuestions)) {
        for (const q of (newKit as any).smartStudyQuestions) collectAsset(q.sourceAsset);
      }

      // Sumar activos almacenados en IndexedDB
      const localStored = await getAllStoredAssets();
      for (const a of localStored) {
        collectAsset(a);
      }

      // 3. Consultar una sola vez los archivos ya existentes en la carpeta assets/ de Drive
      const [existingDriveAssets] = await Promise.all([
        this.listFilesInFolder(token, assetsFolderId),
        Promise.all(jsonUploadPromises),
      ]);

      const driveAssetNames = new Set(existingDriveAssets.map(f => f.name));

      // Filtrar los activos que aún no existen en Drive
      const pendingAssets = kitAssets.filter(asset => {
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
        await Promise.all(
          batch.map(asset => this.uploadAssetDirectly(token, assetsFolderId, asset))
        );
        uploadedCount += batch.length;
      }

      const now = Date.now();
      localStorage.setItem(STORAGE_LAST_SYNC_KEY, now.toString());
      authService.markKitsSyncedWithDrive(userId, driveMergedKits.map(k => k.id));
      updateState({
        status: 'synced',
        lastSyncTime: now,
        filesSyncedCount: existingDriveAssets.length + uploadedCount + 3,
        errorMessage: null,
      });
      console.log(`[GoogleDriveService] Kit '${newKit.title}' sincronizado de inmediato. ${uploadedCount} imágenes subidas a Drive.`);
    } catch (err: any) {
      console.error('[GoogleDriveService] Error en pushKitImmediately:', err);
      const is401 = err?.message?.includes('401') || err?.message?.includes('TOKEN_EXPIRED') || err?.status === 401;
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
          errorMessage: err.message || 'Error al respaldar kit en Google Drive',
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
   * Sincroniza únicamente el progreso de estudio hacia Google Drive en segundo plano (nivel, respuestas e historial).
   */
  async pushProgressToDrive(userId: string): Promise<void> {
    if (!userId || userId === 'guest') {
      console.warn('[GoogleDriveService] Intento de sincronizar progreso en la nube sin sesión activa bloqueado.');
      return;
    }

    let token = this.getValidAccessToken();
    if (!token && this.isLinked()) {
      token = await this.attemptSilentTokenRefresh();
    }
    if (!token) return;

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);
      const userSessions = authService.getAllSmartStudySessions(userId);
      const userRevealed = authService.getAllRevealedQuestionIds(userId);
      const userProgressPayload = {
        version: 1,
        updatedAt: Date.now(),
        userId,
        sessions: userSessions,
        revealedQuestions: userRevealed,
      };
      const userProgressFileName = `thea_progress_${userId}.json`;
      await this.uploadOrUpdateJson(token, rootFolderId, userProgressFileName, userProgressPayload);
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error en pushProgressToDrive:', e);
      const is401 = e?.message?.includes('401') || e?.message?.includes('TOKEN_EXPIRED') || e?.status === 401;
      if (is401) {
        this.clearAccessToken();
        const refreshedToken = await this.attemptSilentTokenRefresh();
        if (refreshedToken) {
          return this.pushProgressToDrive(userId);
        }
      }
    }
  },

  /**
   * Sube inmediatamente a Google Drive los colores y materias personalizadas en segundo plano.
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

      // Descargar materias previas de Drive para fusión por fecha y hora (más reciente gana)
      const rootFiles = await this.listFilesInFolder(token, rootFolderId);
      const remoteFile = rootFiles.find(f => f.name === userMateriasFileName || f.name === 'thea_custom_materias.json');
      let payload = localMaterias;
      if (remoteFile) {
        try {
          const remoteMaterias = await this.readJsonFromDrive<CustomMateria[]>(token, remoteFile.id);
          if (Array.isArray(remoteMaterias) && remoteMaterias.length > 0) {
            payload = mergeCustomMaterias(localMaterias, remoteMaterias);
            saveCustomMaterias(payload, userId, false);
          }
        } catch {}
      }

      await this.uploadOrUpdateJson(token, rootFolderId, userMateriasFileName, payload);
      console.log('[GoogleDriveService] Colores de materias sincronizados con Google Drive inmediatamente.');
    } catch (e: any) {
      console.warn('[GoogleDriveService] Error en pushMateriasToDrive:', e);
      const is401 = e?.message?.includes('401') || e?.message?.includes('TOKEN_EXPIRED') || e?.status === 401;
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
   * Programa la sincronización automática hacia Google Drive con debounce configurable.
   */
  scheduleAutoSync(userId: string, kits: StudyKit[], delayMs: number = 1500): void {
    if (!userId || userId === 'guest') return;
    if (globalDriveDebounceTimer) clearTimeout(globalDriveDebounceTimer);
    globalDriveDebounceTimer = setTimeout(() => {
      this.pushToDrive(userId, kits).catch(err => {
        console.warn('[GoogleDriveService] Error en scheduleAutoSync:', err);
      });
    }, delayMs);
  },
};

let globalDriveDebounceTimer: any = null;

// Registrar el descargador prioritario de activos en storageService para hidratar imágenes automáticamente
registerDriveAssetDownloader((assetIds) => googleDriveService.prioritizeAssetsDownload(assetIds));
