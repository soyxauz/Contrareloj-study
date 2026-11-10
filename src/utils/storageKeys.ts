/**
 * Utilidades para la normalizacion y saneamiento de claves de almacenamiento (LocalStorage e IndexedDB).
 * Previene la anidacion recursiva de identificadores de usuario y asegura acceso O(1) con claves canonicas.
 */

/**
 * Extrae y normaliza el kitId canonico eliminando cualquier prefijo repetido o corrupto
 * como 'thea_ss_mem_', 'thea_fc_mem_', 'usr_g_..._', 'guest_', etc.
 */
export function extractCleanKitId(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/^(?:thea_(?:ss|fc)_mem_|thea_revealed_q_)/, '');
  while (/^(?:usr_g_\d+_|usr_\d+_[a-zA-Z0-9]+_|usr_[a-zA-Z0-9_-]+?_|guest_)/.test(s)) {
    s = s.replace(/^(?:usr_g_\d+_|usr_\d+_[a-zA-Z0-9]+_|usr_[a-zA-Z0-9_-]+?_|guest_)/, '');
  }
  const kitMatch = s.match(/(kit-[a-zA-Z0-9_-]+)$/);
  if (kitMatch) return kitMatch[1];
  return s;
}

/**
 * Detecta si una clave de almacenamiento presenta anidamiento corrupto de identificadores de usuario.
 */
export function isCorruptedStorageKey(key: string): boolean {
  if (!key) return false;
  const isSS = key.startsWith('thea_ss_mem_');
  const isFC = key.startsWith('thea_fc_mem_');
  const isRQ = key.startsWith('thea_revealed_q_');
  if (!isSS && !isFC && !isRQ) return false;

  const rest = key.replace(/^(?:thea_(?:ss|fc)_mem_|thea_revealed_q_)/, '');
  if (
    rest.includes('_usr_') ||
    rest.includes('_guest_') ||
    (rest.match(/usr_/g) || []).length > 1 ||
    (rest.match(/guest_/g) || []).length > 1
  ) {
    return true;
  }
  return false;
}

/**
 * Determina si una clave de LocalStorage es vital para el sistema de sesión y configuración.
 * Solo estas claves esenciales están protegidas contra purga de cuota.
 */
export function isProtectedStorageKey(k: string): boolean {
  if (!k) return false;
  return (
    k === 'thea_auth_users' ||
    k === 'thea_auth_session' ||
    k === 'thea_gdrive_token' ||
    k === 'thea_gdrive_token_exp' ||
    k === 'thea_gdrive_refresh_token' ||
    k === 'thea_gdrive_client_id' ||
    k === 'thea_gdrive_client_secret' ||
    k === 'thea_gdrive_profile' ||
    k === 'thea_gdrive_auth_type' ||
    k === 'thea_gdrive_last_sync' ||
    k === 'thea_theme' ||
    k === 'thea_current_kit_id' ||
    k === 'thea_currentkit_id' ||
    k === 'thea_deleted_kit_ids' ||
    k.startsWith('thea_ollama_') ||
    k.startsWith('thea_groq_') ||
    k.startsWith('thea_grok_') ||
    k === 'contrareloj_gemini_api_key' ||
    k === 'thea_ai_settings' ||
    k.startsWith('thea_user_kits_index_') ||
    k === 'thea_guest_kits_index' ||
    k === 'thea_global_stats_snap_active' ||
    k.startsWith('thea_last_drive_sync_') ||
    k.startsWith('thea_custom_materias')
  );
}

/**
 * Purga de LocalStorage cualquier dato residual o legacy de kits o imágenes en Base64
 * que exceda límites o claves no críticas.
 * Los activos y kits completos residen de forma segura y permanente en IndexedDB y Google Drive,
 * por lo que LocalStorage solo debe almacenar índices y tokens de estado ultraligeros (<50KB).
 */
export function purgeOversizedLegacyDataFromLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    const activeKitId = localStorage.getItem('thea_current_kit_id') || localStorage.getItem('thea_currentkit_id') || '';

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // 1. Purgar inmediatamente cualquier clave corrupta con anidamiento
      if (isCorruptedStorageKey(k)) {
        keysToRemove.push(k);
        continue;
      }

      // 2. Desalojar kits completos legacy (deben residir en IndexedDB)
      if (
        (k.startsWith('thea_user_kits_') && !k.startsWith('thea_user_kits_index_')) ||
        k === 'thea_guest_kits' ||
        k === 'thea_study_kits_v2'
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 3. Desalojar sesiones de kits no activos si contienen imágenes o exceden 6KB
      // Los datos completos están 100% preservados en IndexedDB
      if (k.startsWith('thea_ss_mem_') || k.startsWith('thea_fc_mem_')) {
        const cleanKitId = extractCleanKitId(k);
        const isCurrentKit = Boolean(activeKitId && cleanKitId && cleanKitId === activeKitId);
        const val = localStorage.getItem(k);
        if (val) {
          if (!isCurrentKit && (val.length > 6000 || val.includes('data:image/') || val.includes('data:application/pdf'))) {
            // Respaldar en IndexedDB ('TheaStorageDB' -> 'persistent_session') antes de desalojar de LocalStorage
            backupSessionToStorageDB(k, val);
            keysToRemove.push(k);
            continue;
          }
        }
      }

      if (isProtectedStorageKey(k)) continue;

      // 4. Purgar cualquier dato no protegido que contenga imágenes base64, PDFs o cadenas masivas
      const val = localStorage.getItem(k);
      if (val && (val.includes('data:image/') || val.includes('data:application/pdf') || val.length > 15000)) {
        keysToRemove.push(k);
      }
    }

    // Ejecutar purga de claves pesadas no esenciales
    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

/**
 * Inspecciona LocalStorage una sola vez en el arranque de la aplicacion,
 * recupera el progreso que pudiera haber quedado en claves corruptas y las purga.
 */
export function recoverAndPurgeCorruptedKeys(): void {
  purgeOversizedLegacyDataFromLocalStorage();
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToPurge: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isCorruptedStorageKey(key)) {
        keysToPurge.push(key);
      }
    }

    for (const badKey of keysToPurge) {
      try {
        const val = localStorage.getItem(badKey);
        // Desalojar inmediatamente de LocalStorage para liberar cuota al 100%
        try {
          localStorage.removeItem(badKey);
        } catch {}

        const cleanKitId = extractCleanKitId(badKey);
        if (!cleanKitId || !val) continue;

        let prefix = 'thea_ss_mem_';
        if (badKey.startsWith('thea_fc_mem_')) prefix = 'thea_fc_mem_';
        else if (badKey.startsWith('thea_revealed_q_')) prefix = 'thea_revealed_q_';

        const userMatch = badKey.match(/(usr_g_\d+|usr_\d+_[a-zA-Z0-9]+|usr_[a-zA-Z0-9_-]+|guest)/);
        const targetUserId = userMatch ? userMatch[1] : 'guest';
        const canonicalKey = `${prefix}${targetUserId}_${cleanKitId}`;

        // Respaldar en IndexedDB ('TheaStorageDB') solo si no existe un progreso canónico más reciente
        backupSessionToStorageDB(canonicalKey, val);
      } catch {}
    }

    // Purgar también claves corruptas residuales dentro de IndexedDB ('TheaStorageDB' / 'persistent_session')
    purgeCorruptedKeysFromStorageDB();
  } catch {}
}

function getSessionFreshnessRank(val: any): number {
  if (!val || typeof val !== 'object') return 0;
  return Math.max(Number(val.lastUpdated) || 0, Number(val.resetAt) || 0);
}

function openTheaStorageDB(onReady: (db: IDBDatabase) => void): void {
  if (typeof indexedDB === 'undefined') return;
  try {
    const req = indexedDB.open('TheaStorageDB', 2);
    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('persistent_session')) {
          db.createObjectStore('persistent_session', { keyPath: 'key' });
        }
      } catch {}
    };
    req.onsuccess = () => {
      try {
        onReady(req.result);
      } catch {}
    };
  } catch {}
}

function backupSessionToStorageDB(targetKey: string, rawVal: string | any): void {
  openTheaStorageDB((db) => {
    if (!db.objectStoreNames.contains('persistent_session')) return;
    let parsedVal = rawVal;
    if (typeof rawVal === 'string') {
      try { parsedVal = JSON.parse(rawVal); } catch {}
    }
    const tx = db.transaction('persistent_session', 'readwrite');
    const store = tx.objectStore('persistent_session');
    const getReq = store.get(targetKey);
    getReq.onsuccess = () => {
      try {
        const existing = getReq.result?.value;
        if (existing && getSessionFreshnessRank(existing) > getSessionFreshnessRank(parsedVal)) {
          return;
        }
        store.put({ key: targetKey, value: parsedVal, updatedAt: Date.now() });
      } catch {}
    };
  });
}

function purgeCorruptedKeysFromStorageDB(): void {
  openTheaStorageDB((db) => {
    if (!db.objectStoreNames.contains('persistent_session')) return;
    const tx = db.transaction('persistent_session', 'readwrite');
    const store = tx.objectStore('persistent_session');
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      try {
        const items = getAllReq.result as Array<{ key: string; value: any }>;
        if (!Array.isArray(items)) return;
        const validByKey = new Map<string, any>();
        for (const item of items) {
          if (item?.key && !isCorruptedStorageKey(item.key)) {
            validByKey.set(item.key, item.value);
          }
        }
        for (const item of items) {
          if (!item?.key || !isCorruptedStorageKey(item.key)) continue;
          const cleanKitId = extractCleanKitId(item.key);
          if (cleanKitId && item.value) {
            let prefix = 'thea_ss_mem_';
            if (item.key.startsWith('thea_fc_mem_')) prefix = 'thea_fc_mem_';
            else if (item.key.startsWith('thea_revealed_q_')) prefix = 'thea_revealed_q_';
            const userMatch = item.key.match(/(usr_g_\d+|usr_\d+_[a-zA-Z0-9]+|usr_[a-zA-Z0-9_-]+|guest)/);
            const canonicalKey = `${prefix}${userMatch ? userMatch[1] : 'guest'}_${cleanKitId}`;
            const existingCanonical = validByKey.get(canonicalKey);
            if (!existingCanonical || getSessionFreshnessRank(item.value) > getSessionFreshnessRank(existingCanonical)) {
              validByKey.set(canonicalKey, item.value);
              store.put({ key: canonicalKey, value: item.value, updatedAt: Date.now() });
            }
          }
          store.delete(item.key);
        }
      } catch {}
    };
  });
}
