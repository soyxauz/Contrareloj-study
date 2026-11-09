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
    k.startsWith('thea_global_stats_snap_') ||
    k.startsWith('thea_ss_mem_') ||
    k.startsWith('thea_fc_mem_') ||
    k.startsWith('thea_revealed_q_') ||
    k.startsWith('thea_last_drive_sync_') ||
    k.startsWith('thea_custom_materias')
  );
}

/**
 * Purga de LocalStorage cualquier dato residual o legacy de kits o imágenes en Base64
 * que exceda 50KB o contenga data:image/data:application/pdf.
 * Los activos y kits completos residen de forma segura y permanente en IndexedDB y Google Drive,
 * por lo que LocalStorage solo debe almacenar índices y tokens de estado ultraligeros (<50KB).
 */
export function purgeOversizedLegacyDataFromLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    const keysToSanitizeSS: string[] = [];
    const keysToSanitizeFC: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // 1. Saneamiento profundo de sesiones de Smart Study si tienen imagenes base64 o historial masivo
      if (k.startsWith('thea_ss_mem_')) {
        const val = localStorage.getItem(k);
        if (val && (val.includes('data:image/') || val.includes('data:application/pdf') || val.length > 25000)) {
          keysToSanitizeSS.push(k);
        }
        continue;
      }

      // 2. Saneamiento de progreso de Flashcards si contiene imagenes
      if (k.startsWith('thea_fc_mem_')) {
        const val = localStorage.getItem(k);
        if (val && (val.includes('data:image/') || val.includes('data:application/pdf') || val.length > 25000)) {
          keysToSanitizeFC.push(k);
        }
        continue;
      }

      if (isProtectedStorageKey(k)) continue;

      // 3. Purgar copias legacy de kits completos en LocalStorage (los kits residen en IndexedDB e índice ligero)
      if (
        (k.startsWith('thea_user_kits_') && !k.startsWith('thea_user_kits_index_')) ||
        k === 'thea_guest_kits' ||
        k === 'thea_study_kits_v2'
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 4. Purgar cualquier activo no protegido que contenga imágenes base64, PDFs o cadenas masivas
      const val = localStorage.getItem(k);
      if (val && (val.includes('data:image/') || val.includes('data:application/pdf') || val.length > 50000)) {
        keysToRemove.push(k);
      }
    }

    // Ejecutar purga de claves pesadas no esenciales
    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    // Desprender base64 y podar historial en sesiones de Smart Study saturadas
    for (const key of keysToSanitizeSS) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed.currentQuestion?.sourceAsset?.dataUrl) {
          delete parsed.currentQuestion.sourceAsset.dataUrl;
        }
        if (Array.isArray(parsed.history)) {
          parsed.history = parsed.history.slice(0, 15).map((h: any) => ({
            id: h.id,
            questionId: h.questionId,
            questionText: typeof h.questionText === 'string' ? h.questionText.slice(0, 120) : '',
            userAnswer: typeof h.userAnswer === 'string' ? h.userAnswer.slice(0, 80) : '',
            correctAnswer: typeof h.correctAnswer === 'string' ? h.correctAnswer.slice(0, 80) : '',
            explanation: typeof h.explanation === 'string' ? h.explanation.slice(0, 120) : '',
            isCorrect: Boolean(h.isCorrect),
            timestamp: h.timestamp,
            level: h.level,
          }));
        }
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch {}
    }

    // Saneamiento de flashcards
    for (const key of keysToSanitizeFC) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.masteredCards)) {
          parsed.masteredCards = parsed.masteredCards.slice(0, 50);
        }
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch {}
    }
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
