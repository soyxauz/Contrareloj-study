export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Valida una URL base de API (Ollama, OpenAI, Groq, etc.)
 */
export function validateBaseUrl(url: string): ValidationResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { isValid: false, error: 'La URL base no puede estar vacía.' };
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { isValid: false, error: 'El protocolo debe ser http:// o https://.' };
    }
    if (!parsed.hostname) {
      return { isValid: false, error: 'La URL debe incluir un nombre de host o dominio válido.' };
    }
    return { isValid: true };
  } catch {
    return { isValid: false, error: 'El formato de la URL no es válido (ej: https://ollama.com/v1).' };
  }
}

/**
 * Valida el formato de una API Key para el Motor Oral (admite Grok de grok.com/xAI y Groq de groq.com)
 */
export function validateOralApiKey(key: string, isOptional = false): ValidationResult {
  const trimmed = key.trim();
  if (!trimmed) {
    if (isOptional) return { isValid: true };
    return { isValid: false, error: 'La API Key del motor oral no puede estar vacía.' };
  }

  const isGrok = trimmed.startsWith('grok_') || trimmed.startsWith('xai-');
  const isGroq = trimmed.startsWith('gsk_');

  if (!isGrok && !isGroq) {
    return {
      isValid: false,
      error: 'La clave debe ser de Grok (prefijo "grok_" o "xai-") o de Groq (prefijo "gsk_").',
    };
  }

  if (trimmed.length < 25) {
    return { isValid: false, error: 'La clave ingresada es demasiado corta (mínimo 25 caracteres).' };
  }

  if (!/^(grok_|xai-|gsk_)[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { isValid: false, error: 'La clave contiene caracteres no válidos.' };
  }

  return { isValid: true };
}

/**
 * Valida el formato de una API Key de Groq o Grok (compatible con ambos)
 */
export function validateGroqApiKey(key: string, isOptional = false): ValidationResult {
  return validateOralApiKey(key, isOptional);
}

/**
 * Valida el formato de una API Key de Gemini
 */
export function validateGeminiApiKey(key: string, isOptional = true): ValidationResult {
  const trimmed = key.trim();
  if (!trimmed) {
    if (isOptional) return { isValid: true };
    return { isValid: false, error: 'La clave de Gemini no puede estar vacía.' };
  }

  if (trimmed.length < 20) {
    return { isValid: false, error: 'La clave de Gemini es demasiado corta.' };
  }

  if (!trimmed.startsWith('AIzaSy')) {
    return {
      isValid: true,
      warning: 'Las claves de Google Gemini habitualmente inician con "AIzaSy".',
    };
  }

  return { isValid: true };
}

/**
 * Valida el formato de una API Key de Grok / xAI
 */
export function validateGrokApiKey(key: string, isOptional = true): ValidationResult {
  const trimmed = key.trim();
  if (!trimmed) {
    if (isOptional) return { isValid: true };
    return { isValid: false, error: 'La clave de Grok no puede estar vacía.' };
  }

  if (trimmed.length < 25) {
    return { isValid: false, error: 'La clave de Grok es demasiado corta (mínimo 25 caracteres).' };
  }

  return { isValid: true };
}

/**
 * Valida el formato de un Google OAuth 2.0 Client ID
 */
export function validateGoogleClientId(clientId: string, isOptional = false): ValidationResult {
  const trimmed = clientId.trim();
  if (!trimmed) {
    if (isOptional) return { isValid: true };
    return { isValid: false, error: 'El Client ID no puede estar vacío.' };
  }

  if (!trimmed.endsWith('.apps.googleusercontent.com')) {
    return {
      isValid: false,
      error: 'El Client ID de Google debe finalizar con ".apps.googleusercontent.com".',
    };
  }

  if (!/^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(trimmed)) {
    return {
      isValid: false,
      error: 'Formato de Client ID inválido (debe ser [número]-[id].apps.googleusercontent.com).',
    };
  }

  return { isValid: true };
}
