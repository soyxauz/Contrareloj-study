import type { StudyKit, DocumentAsset, User } from '../types';
import { authService } from './authService';
import { getAllStoredAssets, saveAssetsToIndexedDB, stripHeavyAssetsForLocalStorage } from './storageService';
import { getAISettings, saveAISettings, resetAISettingsToDefault, type AISettings } from './aiService';

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
const DEFAULT_CLIENT_ID = '103271853273-fkfvub7h8glajislelbknreqendh0lmq.apps.googleusercontent.com';

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

// Initialize cached state from storage
try {
  const lastSync = localStorage.getItem(STORAGE_LAST_SYNC_KEY);
  const rawProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
  if (lastSync) {
    currentState.lastSyncTime = parseInt(lastSync, 10);
  }
  if (rawProfile) {
    const prof = JSON.parse(rawProfile);
    currentState.userEmail = prof.email || null;
    currentState.userName = prof.name || null;
    currentState.avatarUrl = prof.avatarUrl || null;
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
    return DEFAULT_CLIENT_ID;
  },

  /**
   * Guarda un nuevo Client ID en localStorage.
   */
  setClientId(clientId: string): void {
    const clean = clientId.trim();
    if (clean) {
      localStorage.setItem(STORAGE_CLIENT_ID_KEY, clean);
      updateState({ status: 'idle', errorMessage: null });
    } else {
      localStorage.removeItem(STORAGE_CLIENT_ID_KEY);
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
   * Guarda el token de acceso con su tiempo de expiración.
   */
  setAccessToken(token: string, expiresInSec: number = 3600): void {
    const expTime = Date.now() + expiresInSec * 1000;
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_TOKEN_EXP_KEY, expTime.toString());
  },

  /**
   * Limpia el token de acceso local cuando Google reporta que expiró o fue revocado (401).
   */
  clearAccessToken(): void {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_TOKEN_EXP_KEY);
  },

  /**
   * Desconecta la cuenta de Google y remueve los tokens locales.
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
    updateState({
      userEmail: profile.email,
      userName: profile.name,
      avatarUrl: profile.avatarUrl || null,
    });

    return profile;
  },

  /**
   * Flujo unificado: Iniciar sesión con Google, vincular la cuenta en Contrareloj Study y sincronizar datos.
   */
  async loginAndSync(): Promise<{ user: User; kits: StudyKit[] | null }> {
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
  async readJsonFromDrive(token: string, fileId: string): Promise<any> {
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

    return await res.json();
  },

  /**
   * Sube una imagen individual a la subcarpeta 'assets/' de Drive.
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
      console.warn(`[GoogleDriveService] No se pudo subir activo ${asset.id} (${res.status})`);
      return null;
    }

    const fileData = await res.json();
    return fileData.id;
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
   * Descarga el estado completo guardado en Google Drive y lo restaura localmente.
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

      // 1. Sincronizar usuarios de la app
      const usersFile = await this.findFileInFolder(token, rootFolderId, 'thea_auth_users.json');
      if (usersFile) {
        try {
          const remoteUsers = await this.readJsonFromDrive(token, usersFile.id);
          if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
            const localUsers = authService.getRawStoredUsers();
            const mergedMap = new Map<string, any>();
            for (const u of localUsers) mergedMap.set(u.id, u);
            for (const u of remoteUsers) {
              const localU = mergedMap.get(u.id);
              if (u.aiSettings?.apiKey && u.aiSettings.apiKey.trim().length > 0) {
                u.aiSettings.verified = true;
                authService.saveUserAISettings(u.id, u.aiSettings);
                const currentSettings = getAISettings();
                if (!currentSettings.apiKey || currentSettings.apiKey.trim().length === 0) {
                  saveAISettings(u.aiSettings);
                }
              }
              mergedMap.set(u.id, { ...localU, ...u });
            }
            authService.setRawStoredUsers(Array.from(mergedMap.values()));
          }
        } catch (e) {
          console.warn('[GoogleDriveService] Error sincronizando usuarios remotos:', e);
        }
      }

      // 2. Sincronizar kits de estudio del usuario
      const userKitsFileName = `thea_kits_${userId}.json`;
      let kitsFile = await this.findFileInFolder(token, rootFolderId, userKitsFileName);
      if (!kitsFile) {
        // Fallback al nombre genérico si se guardó anteriormente
        kitsFile = await this.findFileInFolder(token, rootFolderId, 'thea_study_kits.json');
      }

      let pulledKits: StudyKit[] | null = null;
      if (kitsFile) {
        try {
          pulledKits = await this.readJsonFromDrive(token, kitsFile.id);
          if (Array.isArray(pulledKits)) {
            authService.saveUserKits(userId, pulledKits);
          }
        } catch (e) {
          console.warn('[GoogleDriveService] Error leyendo kits de Drive:', e);
        }
      }

      // 3. Sincronizar activos visuales desde subcarpeta 'assets/'
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const driveAssetFiles = await this.listFilesInFolder(token, assetsFolderId);

      if (driveAssetFiles.length > 0) {
        const localAssets = await getAllStoredAssets();
        const localIds = new Set(localAssets.map(a => a.id));
        const assetsToDownload = driveAssetFiles.filter(f => {
          const rawId = f.name.replace(/\.[^/.]+$/, '');
          return !localIds.has(rawId);
        });

        if (assetsToDownload.length > 0) {
          const downloadedAssets: DocumentAsset[] = [];
          for (let i = 0; i < assetsToDownload.length; i++) {
            const file = assetsToDownload[i];
            const rawId = file.name.replace(/\.[^/.]+$/, '');
            try {
              const dataUrl = await this.downloadAssetDataUrl(token, file.id);
              downloadedAssets.push({
                id: rawId,
                type: 'image',
                dataUrl,
              });
            } catch (dlErr) {
              console.warn(`[GoogleDriveService] Error descargando activo ${file.name}:`, dlErr);
            }
          }

          if (downloadedAssets.length > 0) {
            await saveAssetsToIndexedDB(downloadedAssets);
          }
        }
      }

      // 4. Sincronizar ajustes de IA y API personal desde Google Drive
      const aiSettingsFile = await this.findFileInFolder(token, rootFolderId, 'thea_ai_settings.json');
      const localAISettings = getAISettings();
      if (aiSettingsFile) {
        try {
          const remoteAISettings = await this.readJsonFromDrive(token, aiSettingsFile.id);
          if (remoteAISettings && typeof remoteAISettings === 'object') {
            const remoteHasKey = Boolean(remoteAISettings.apiKey && remoteAISettings.apiKey.trim().length > 0);
            const localHasKey = Boolean(localAISettings.apiKey && localAISettings.apiKey.trim().length > 0);

            if (remoteHasKey) {
              // Si la nube tiene API Key guardada, importarla y desbloquear
              const merged: AISettings = {
                ...remoteAISettings,
                verified: true,
              };
              saveAISettings(merged);
              if (userId) {
                authService.saveUserAISettings(userId, merged);
              }
              const activeUser = authService.getCurrentUser();
              if (activeUser) {
                authService.saveUserAISettings(activeUser.id, merged);
              }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('thea_ai_settings_changed'));
              }
            } else if (localHasKey) {
              // Si la nube no tenía clave pero localmente sí tenemos una, subirla a Drive
              await this.uploadOrUpdateJson(token, rootFolderId, 'thea_ai_settings.json', localAISettings);
            }
          }
        } catch (aiErr) {
          console.warn('[GoogleDriveService] Error sincronizando ajustes de IA desde Drive:', aiErr);
        }
      } else {
        // Si thea_ai_settings.json aún no existe en Drive pero hay clave local, subirla de inmediato
        if (localAISettings.apiKey && localAISettings.apiKey.trim().length > 0) {
          try {
            await this.uploadOrUpdateJson(token, rootFolderId, 'thea_ai_settings.json', localAISettings);
          } catch (e) {
            console.warn('[GoogleDriveService] Error creando thea_ai_settings.json inicial en Drive:', e);
          }
        }
      }

      const now = Date.now();
      localStorage.setItem(STORAGE_LAST_SYNC_KEY, now.toString());
      updateState({
        status: 'synced',
        lastSyncTime: now,
        filesSyncedCount: driveAssetFiles.length + (kitsFile ? 1 : 0),
        errorMessage: null,
      });

      return pulledKits;
    } catch (err: any) {
      console.error('[GoogleDriveService] Error en pullFromDrive:', err);
      const is401 = err?.message?.includes('401') || err?.message?.includes('TOKEN_EXPIRED') || err?.status === 401;
      if (is401) {
        this.clearAccessToken();
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive ha expirado. Haz clic en Reconectar Cuenta.',
        });
      } else {
        updateState({ status: 'error', errorMessage: err?.message || 'Error al descargar datos de Drive.' });
      }
      return null;
    }
  },

  /**
   * Sube los datos locales actualizados a Google Drive en segundo plano.
   */
  async pushToDrive(userId: string, kits: StudyKit[]): Promise<void> {
    const token = this.getValidAccessToken();
    if (!token) {
      const hasEmail = Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
      if (hasEmail) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive ha expirado. Reconecta tu cuenta para sincronizar.',
        });
      }
      return;
    }

    updateState({ status: 'syncing', errorMessage: null });

    try {
      const rootFolderId = await this.getOrCreateFolder(token, DRIVE_ROOT_FOLDER);

      // 1. Guardar base de usuarios
      const localUsers = authService.getRawStoredUsers();
      await this.uploadOrUpdateJson(token, rootFolderId, 'thea_auth_users.json', localUsers);

      // 2. Guardar kits (versión aligerada para no inflar el JSON)
      const lightweightKits = stripHeavyAssetsForLocalStorage(kits);
      const userKitsFileName = `thea_kits_${userId}.json`;
      await this.uploadOrUpdateJson(token, rootFolderId, userKitsFileName, lightweightKits);

      // 3. Subir activos visuales a subcarpeta 'assets/' individualmente
      const assetsFolderId = await this.getOrCreateFolder(token, DRIVE_ASSETS_FOLDER, rootFolderId);
      const existingDriveAssets = await this.listFilesInFolder(token, assetsFolderId);
      const driveAssetNames = new Set(existingDriveAssets.map(f => f.name));

      const allLocalAssets = await getAllStoredAssets();
      let uploadedCount = 0;

      for (let i = 0; i < allLocalAssets.length; i++) {
        const asset = allLocalAssets[i];
        if (!asset.id || !asset.dataUrl) continue;

        const isPng = asset.dataUrl.includes('image/png');
        const expectedName = `${asset.id}.${isPng ? 'png' : 'jpg'}`;

        if (!driveAssetNames.has(expectedName)) {
          await this.uploadAssetFile(token, assetsFolderId, asset);
          uploadedCount++;
        }
      }

      // 4. Guardar configuración de IA y API propia en Google Drive solo si tiene clave
      const currentAISettings = getAISettings();
      if (currentAISettings.apiKey && currentAISettings.apiKey.trim().length > 0) {
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
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive ha expirado. Haz clic en Reconectar Cuenta.',
        });
      } else {
        updateState({ status: 'error', errorMessage: err?.message || 'Error al sincronizar con Google Drive.' });
      }
    }
  },

  /**
   * Sube inmediatamente la configuración de IA y API propia a Google Drive.
   */
  async syncAISettingsToDrive(overrideSettings?: AISettings): Promise<boolean> {
    const token = this.getValidAccessToken();
    if (!token) {
      const hasEmail = Boolean(localStorage.getItem(STORAGE_PROFILE_KEY));
      if (hasEmail) {
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive ha expirado. Reconecta tu cuenta.',
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
        updateState({
          status: 'needs_reauth',
          errorMessage: 'Tu sesión de Google Drive ha expirado. Haz clic en Reconectar Cuenta.',
        });
      }
      return false;
    }
  },
};
