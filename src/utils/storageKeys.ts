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
 * Inspecciona LocalStorage una sola vez en el arranque de la aplicacion,
 * recupera el progreso que pudiera haber quedado en claves corruptas y las purga.
 */
export function recoverAndPurgeCorruptedKeys(): void {
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
        const cleanKitId = extractCleanKitId(badKey);
        if (!cleanKitId) {
          localStorage.removeItem(badKey);
          continue;
        }

        let prefix = 'thea_ss_mem_';
        if (badKey.startsWith('thea_fc_mem_')) prefix = 'thea_fc_mem_';
        else if (badKey.startsWith('thea_revealed_q_')) prefix = 'thea_revealed_q_';

        const userMatch = badKey.match(/(usr_g_\d+|usr_\d+_[a-zA-Z0-9]+|usr_[a-zA-Z0-9_-]+|guest)/);
        const targetUserId = userMatch ? userMatch[1] : 'guest';
        const canonicalKey = `${prefix}${targetUserId}_${cleanKitId}`;

        if (val && !localStorage.getItem(canonicalKey)) {
          localStorage.setItem(canonicalKey, val);
        }
        localStorage.removeItem(badKey);
      } catch {}
    }
  } catch {}
}
