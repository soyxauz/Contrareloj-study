import type { StudyKit, Question, Flashcard, PodcastEpisode, DocumentChunk } from '../types';

export interface AISettings {
  enabled: boolean;
  provider: 'ollama' | 'openai-compatible' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AIPreset {
  id: 'ollama-cloud' | 'groq' | 'gemini' | 'deepseek' | 'openai' | 'openrouter' | 'ollama';
  name: string;
  provider: 'ollama' | 'openai-compatible' | 'custom';
  baseUrl: string;
  model: string;
  keyPlaceholder: string;
  keyUrl?: string;
  description: string;
  badge: string;
  freeTier: boolean;
}

export const AI_PRESETS: AIPreset[] = [
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud (Gemma 4)',
    provider: 'openai-compatible',
    baseUrl: 'https://ollama.com/v1',
    model: 'gemma4:31b',
    keyPlaceholder: '716a4f59...',
    keyUrl: 'https://ollama.com/settings/keys',
    description: 'Servicio cloud oficial con modelo Gemma 4 (31B). Nivel de cuenta activo.',
    badge: 'Tu Cuenta / Activo',
    freeTier: true,
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    provider: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    description: 'Ultra rápido y gratuito. Genera hasta 50 preguntas en segundos.',
    badge: 'Recomendado / Gratis',
    freeTier: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    provider: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-flash',
    keyPlaceholder: 'AIzaSy...',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    description: 'Endpoint oficial OpenAI de Google Gemini. Nivel gratuito en AI Studio.',
    badge: 'Oficial Google / Gratis',
    freeTier: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'Alta potencia de razonamiento lógico y pedagógico a muy bajo costo.',
    badge: 'Alta Precisión',
    freeTier: false,
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyPlaceholder: 'sk-proj-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    description: 'Modelos GPT-4o y GPT-4o-mini oficiales de OpenAI.',
    badge: 'OpenAI Oficial',
    freeTier: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    provider: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct',
    keyPlaceholder: 'sk-or-v1-...',
    keyUrl: 'https://openrouter.ai/keys',
    description: 'Acceso unificado a múltiples modelos con opciones gratuitas.',
    badge: 'Multi-Modelo',
    freeTier: true,
  },
  {
    id: 'ollama',
    name: 'Ollama Local',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    keyPlaceholder: 'No requiere clave de API',
    description: 'Ejecución 100% privada y offline. Requiere Ollama corriendo en tu equipo.',
    badge: 'Offline / Privado',
    freeTier: true,
  },
];

const STORAGE_KEY = 'thea_ai_settings';

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  provider: 'openai-compatible',
  baseUrl: 'https://ollama.com/v1',
  apiKey: '716a4f5985e54bc8830fac7e2835578a.x9f9A2l0bgRf4WjF86KPWfHl',
  model: 'gemma4:31b',
  timeoutMs: 45000,
};

export function getAISettings(): AISettings {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Si apuntaba a localhost inactivo o la clave fue borrada o el modelo estaba desactualizado
      if (
        !parsed.apiKey ||
        parsed.apiKey.trim() === '' ||
        parsed.baseUrl === 'http://localhost:11434/v1' ||
        parsed.baseUrl?.includes('11434') ||
        parsed.model === 'gemma4:31b-cloud' ||
        parsed.model === 'llama3.2'
      ) {
        const restored: AISettings = {
          ...DEFAULT_AI_SETTINGS,
          ...parsed,
          provider: 'openai-compatible',
          baseUrl: 'https://ollama.com/v1',
          apiKey: DEFAULT_AI_SETTINGS.apiKey,
          model: 'gemma4:31b',
        };
        saveAISettings(restored);
        return restored;
      }
      return { ...DEFAULT_AI_SETTINGS, ...parsed };
    } catch {
      // fallback
    }
  }
  return DEFAULT_AI_SETTINGS;
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Cliente de red inteligente con enrutamiento por proxy local anti-CORS.
 * Si el navegador bloquea la llamada directa por CORS o puertos locales,
 * se enruta transparentemente a través del servidor Vite (/api/ai-proxy).
 */
async function fetchWithProxyFallback(
  url: string,
  options: RequestInit,
  bodyData?: Record<string, unknown>
): Promise<Response> {
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // En localhost, si es ollama.com, pasar directamente por el proxy de Vite para evitar error CORS en consola
  if (isLocalHost && url.includes('ollama.com')) {
    try {
      const proxyRes = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
          data: bodyData,
        }),
      });
      return proxyRes;
    } catch {
      // Si el proxy falla, intentar fetch directo
    }
  }

  try {
    const res = await fetch(url, options);
    return res;
  } catch (err: unknown) {
    // Si el navegador falla por red o CORS, reintentar por proxy Vite si estamos en localhost
    if (isLocalHost) {
      try {
        const proxyRes = await fetch('/api/ai-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            data: bodyData,
          }),
        });
        return proxyRes;
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

/** Prueba la conectividad con el endpoint configurado */
export async function testAIConnection(override?: AISettings): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  const settings = override || getAISettings();
  const cleanBase = settings.baseUrl.replace(/\/+$/, '');
  const isLocal = cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1');
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && isLocal) {
    return {
      success: false,
      message: 'Estás conectado a través de HTTPS. Los navegadores bloquean llamadas a servidores HTTP locales (localhost:11434) por política de contenido mixto. Para usar IA en la web, selecciona un proveedor en la nube con su clave.',
    };
  }

  // Si está en la web estática (GitHub Pages / Netlify) y usa ollama.com sin proxy backend
  if (!isLocalHost && cleanBase.includes('ollama.com')) {
    return {
      success: false,
      message: 'En entornos web estáticos (GitHub Pages), los navegadores bloquean peticiones directas a Ollama Cloud por política CORS. En la web te recomendamos usar el preset de Google Gemini o Groq con su clave gratuita. En localhost:5173 tu Ollama Cloud funciona al 100% mediante el proxy local.',
    };
  }

  if (!isLocal && !settings.apiKey.trim()) {
    return {
      success: false,
      message: 'Por favor ingresa tu API Key para probar la conexión con este proveedor.',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(settings.timeoutMs, 8000));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${settings.apiKey.trim()}`;
    }

    let res = await fetchWithProxyFallback(`${cleanBase}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(async () => {
      // Si falla /models, probar /api/tags de Ollama
      return await fetchWithProxyFallback(`${cleanBase.replace(/\/v1$/, '')}/api/tags`, {
        signal: controller.signal,
      });
    });

    // Si /models devuelve error, verificar enviando un ping liviano a chat/completions
    if (!res || !res.ok) {
      try {
        const pingPayload = {
          model: settings.model || 'gemma4:31b',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        };
        const pingRes = await fetchWithProxyFallback(
          `${cleanBase}/chat/completions`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(pingPayload),
            signal: controller.signal,
          },
          pingPayload
        );
        if (pingRes && pingRes.ok) {
          clearTimeout(timeout);
          return {
            success: true,
            message: `Conexión establecida con éxito. Modelo activo: ${settings.model || 'gemma4:31b'}.`,
            models: [settings.model || 'gemma4:31b'],
          };
        }
      } catch {
        // Continuar con el manejo de respuesta normal
      }
    }

    clearTimeout(timeout);

    if (res && res.ok) {
      const data = await res.json();
      let modelList: string[] = [];
      if (Array.isArray(data.data)) {
        modelList = data.data.map((m: { id?: string; name?: string }) => m.id || m.name || '');
      } else if (Array.isArray(data.models)) {
        modelList = data.models.map((m: { name?: string; id?: string }) => m.name || m.id || '');
      }
      return {
        success: true,
        message: `Conexión establecida con éxito (${modelList.length} modelos detectados en el servidor).`,
        models: modelList.filter(Boolean),
      };
    } else {
      let detail = '';
      try {
        const errJson = await res.json();
        detail = errJson.error?.message || errJson.message || '';
      } catch {
        // text fallback
      }

      if (res.status === 401) {
        return {
          success: false,
          message: 'Error de autenticación (HTTP 401): Clave de API no válida o expirada. Verifica tu API Key.',
        };
      }
      if (res.status === 404) {
        return {
          success: false,
          message: `Endpoint no encontrado (HTTP 404): Verifica la URL base (${cleanBase}).`,
        };
      }

      return {
        success: false,
        message: `El servidor respondió con código HTTP ${res.status}: ${detail || res.statusText}`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted') || msg.includes('timeout')) {
      return {
        success: false,
        message: `Tiempo de espera agotado. Verifica que el endpoint esté en línea o que tu clave de API sea válida.`,
      };
    }
    if (isLocal) {
      return {
        success: false,
        message: `No se pudo conectar a Ollama local en ${cleanBase}. Verifica que esté activo con: set OLLAMA_ORIGINS=* && ollama serve`,
      };
    }
    return {
      success: false,
      message: `Error de red al conectar con ${cleanBase}: ${msg}`,
    };
  }
}

/** Ejecuta una llamada de chat completion con timeout y fallback seguro */
export async function queryAICompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  jsonMode: boolean = false,
  override?: AISettings
): Promise<string> {
  const settings = override || getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const cleanBase = settings.baseUrl.replace(/\/+$/, '');
  const isLocal = cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1');

  if (!isLocal && !settings.apiKey.trim()) {
    throw new Error(
      `Falta la clave de API (API Key) para el proveedor configurado (${cleanBase}). Abre "Configurar IA" e ingresa tu clave.`
    );
  }

  const url = `${cleanBase}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${settings.apiKey.trim()}`;
  }

  const body: Record<string, unknown> = {
    model: settings.model || 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.3,
  };

  if (jsonMode) {
    body['response_format'] = { type: 'json_object' };
  }

  try {
    const response = await fetchWithProxyFallback(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      body
    );

    clearTimeout(timer);

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson.error?.message || errJson.message || '';
      } catch {
        // text fallback
      }

      if (response.status === 401) {
        throw new Error(
          `Error de autenticación (HTTP 401): Clave de API no válida o expirada. ${detail ? `(${detail})` : ''}`
        );
      }
      if (response.status === 429) {
        throw new Error(
          `Límite de tasa excedido (HTTP 429): Cuota de peticiones agotada o saturada. ${detail ? `(${detail})` : ''}`
        );
      }
      throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
    }

    const json = await response.json();
    const content =
      json.choices?.[0]?.message?.content ||
      json.choices?.[0]?.message?.reasoning ||
      json.choices?.[0]?.text;
    if (!content) {
      throw new Error('Respuesta de IA vacía recibida del proveedor.');
    }

    return content;
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}

/** Normalizador ultra-robusto del índice correcto para preguntas de opción múltiple y V/F */
export function parseCorrectIndex(
  rawAnswer: unknown,
  options: string[] = [],
  _qType: string = 'multiple-choice'
): number {
  if (typeof rawAnswer === 'number' && !isNaN(rawAnswer) && rawAnswer >= 0 && (options.length === 0 || rawAnswer < options.length)) {
    return rawAnswer;
  }
  const str = String(rawAnswer ?? '').trim();
  const upper = str.toUpperCase();

  // Dígito numérico directo "0", "1", "2", "3"
  if (/^[0-3]$/.test(str)) {
    const num = parseInt(str, 10);
    if (options.length === 0 || num < options.length) return num;
  }

  // Mapeos de letras o palabras frecuentes devueltas por modelos de IA
  if (
    upper === 'A' ||
    upper.startsWith('A)') ||
    upper.startsWith('A.') ||
    upper.startsWith('OPCIÓN A') ||
    upper.startsWith('OPCION A') ||
    upper === 'VERDADERO' ||
    upper === 'TRUE' ||
    upper === 'V'
  ) {
    return 0;
  }
  if (
    upper === 'B' ||
    upper.startsWith('B)') ||
    upper.startsWith('B.') ||
    upper.startsWith('OPCIÓN B') ||
    upper.startsWith('OPCION B') ||
    upper === 'FALSO' ||
    upper === 'FALSE' ||
    upper === 'F'
  ) {
    return 1;
  }
  if (
    upper === 'C' ||
    upper.startsWith('C)') ||
    upper.startsWith('C.') ||
    upper.startsWith('OPCIÓN C') ||
    upper.startsWith('OPCION C')
  ) {
    return 2;
  }
  if (
    upper === 'D' ||
    upper.startsWith('D)') ||
    upper.startsWith('D.') ||
    upper.startsWith('OPCIÓN D') ||
    upper.startsWith('OPCION D') ||
    upper.startsWith('OPCIÓN 4') ||
    upper.startsWith('OPCION 4') ||
    upper.startsWith('4)') ||
    upper.startsWith('4.') ||
    upper === '4'
  ) {
    return 3;
  }

  // Coincidencia exacta o parcial con el texto de las opciones
  if (options && options.length > 0) {
    const exactIdx = options.findIndex(o => o.toLowerCase().trim() === str.toLowerCase().trim());
    if (exactIdx !== -1) return exactIdx;
    const partialIdx = options.findIndex(o => o.toLowerCase().includes(str.toLowerCase()) || str.toLowerCase().includes(o.toLowerCase()));
    if (partialIdx !== -1) return partialIdx;
  }

  return 0;
}

/** Normalizador tolerante de índices correctos para preguntas de selección múltiple */
export function parseCorrectIndices(
  rawIndices: unknown,
  options: string[] = []
): number[] {
  if (!Array.isArray(rawIndices) || rawIndices.length === 0) {
    return [0, 1];
  }
  const result: number[] = [];
  for (const item of rawIndices) {
    if (typeof item === 'number' && !isNaN(item) && item >= 0 && (options.length === 0 || item < options.length)) {
      if (!result.includes(item)) result.push(item);
    } else {
      const idx = parseCorrectIndex(item, options, 'multi-select');
      if (!result.includes(idx)) result.push(idx);
    }
  }
  return result.length > 0 ? result : [0];
}

/**
 * Distribuye aleatoriamente las opciones de respuesta para que cada posición (0, 1, 2, 3)
 * tenga exactamente una probabilidad idéntica del 25% de albergar la respuesta correcta.
 */
export function shuffleOptionsWithEqualProbability(
  options: string[],
  rawCorrectIndex: number
): { options: string[]; correctIndex: number } {
  if (!options || options.length <= 1) {
    return { options: options || [], correctIndex: 0 };
  }
  const cleanOptions = [...options];
  while (cleanOptions.length < 4) {
    cleanOptions.push(`Alternativa adicional ${cleanOptions.length + 1}`);
  }

  const validCorrectIdx = Math.max(0, Math.min(cleanOptions.length - 1, rawCorrectIndex));
  const correctText = cleanOptions[validCorrectIdx];
  const distractors = cleanOptions.filter((_, idx) => idx !== validCorrectIdx);

  // Mezclar distractores aleatoriamente
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
  }

  // Asignar slot con distribución uniforme matemática (25% cada posición: 0, 1, 2, 3)
  const targetSlot = Math.floor(Math.random() * 4);
  const shuffled: string[] = new Array(4);
  shuffled[targetSlot] = correctText;

  let dIdx = 0;
  for (let slot = 0; slot < 4; slot++) {
    if (slot !== targetSlot) {
      shuffled[slot] = distractors[dIdx] || `Alternativa ${slot + 1}`;
      dIdx++;
    }
  }

  return { options: shuffled, correctIndex: targetSlot };
}

/**
 * Limita la extensión de un enunciado respetando la regla pedagógica estricta:
 * - Límite general: Máximo 50 palabras para enunciados estándar.
 * - Excepción: Si es descripción de un caso / supuesto de hecho / viñeta práctica, sube a 80 palabras máximo.
 */
export function enforceQuestionLengthLimit(questionText: string, isCaseExplicit?: boolean): string {
  if (!questionText) return '';
  const clean = questionText.trim();
  const words = clean.split(/\s+/).filter(Boolean);

  const isCase = isCaseExplicit ?? (
    /\b(caso\s+(clínico|práctico|jurídico|de estudio|real)|supuesto\s+de\s+hecho|paciente\s+de|en\s+el\s+siguiente\s+caso|viñeta\s+clínica|escenario\s+práctico)\b/i.test(clean) ||
    /^(en\s+un\s+caso|supongamos\s+que|un\s+paciente|una\s+persona|un\s+tribunal|en\s+un\s+juicio)/i.test(clean)
  );

  const maxWords = isCase ? 80 : 50;

  if (words.length <= maxWords) {
    return clean;
  }

  // Recorte natural respetando límite de palabras
  const truncatedWords = words.slice(0, maxWords);
  const truncatedText = truncatedWords.join(' ');

  // Si hay punto o cierre de interrogación en el último 25% del texto recortado, cortar limpiamente
  const lastPeriod = truncatedText.lastIndexOf('.');
  const lastQuestion = truncatedText.lastIndexOf('?');
  const cutPoint = Math.max(lastPeriod, lastQuestion);

  if (cutPoint > truncatedText.length * 0.75) {
    return truncatedText.slice(0, cutPoint + 1).trim();
  }

  if (clean.includes('?') && !truncatedText.endsWith('?')) {
    return `${truncatedText}...?`;
  }
  return `${truncatedText}...`;
}

/**
 * Motor de Inteligencia Pedagógica Contrareloj Study
 * FASE 1: Análisis profundo del texto (disciplina, naturaleza, anclaje y limpieza).
 * FASE 2: Preguntas de alta calidad con sentido lógico, contexto, distractores inteligentes y retroalimentación trifásica.
 */
export async function generateAIPedagogicalQuestions(
  rawText: string,
  count: number = 10,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  chunks?: DocumentChunk[]
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const difficultyDirectives = {
    easy: 'NIVEL DE EXIGENCIA FÁCIL: Evalúa núcleos conceptuales fundamentales, definiciones operativas esenciales y principios rectores del texto. Preguntas de comprensión conceptual directa, con 4 opciones pertinentes donde los 3 distractores sean conceptos afines del mismo texto.',
    medium: 'NIVEL DE EXIGENCIA MEDIO / INTERMEDIO: Evalúa aplicación práctica, relaciones causa-efecto, supuestos de hecho concretos o deducción de consecuencias lógicas a partir del texto. Obligatorio formular contexto o escenario previo.',
    hard: 'NIVEL DE EXIGENCIA DIFÍCIL / AVANZADO: Evalúa casos de alta complejidad, viñetas de casos clínicos si es medicina, conflictos jurídicos o doctrinarios si es derecho, o resolución de fallas/mecanismos si es ciencias o ingeniería. Distractores sutiles y técnicamente plausibles.',
  };

  const systemPrompt = `Eres el motor de inteligencia pedagógica de Contrareloj Study, una plataforma de estudio adaptativo de alta exigencia académica. Tu objetivo es recibir un texto de estudio (apuntes, artículos, libros o guías), comprender profundamente de qué trata, extraer sus núcleos conceptuales más importantes y transformarlos en preguntas de evaluación variadas, atractivas y de alto impacto memorístico.

FASE 1: ANÁLISIS DEL TEXTO Y DETECCIÓN CONCEPTUAL
1. Limpieza de ruido: Ignora encabezados, pies de página, bibliografías, números de página o ejemplos anecdóticos sin peso académico.
2. Detección disciplinar: Identifica la rama (Ciencias Médicas, Derecho, Ingeniería, Historia, etc.) y los núcleos esenciales.
3. Fidelidad (Anclaje): Toda pregunta debe sustentarse estrictamente en la lógica y contenido del texto.
4. Directriz de dificultad: ${difficultyDirectives[difficulty]}

FASE 2: DISTRIBUCIÓN Y VARIEDAD DINÁMICA DE ESTILOS DE PREGUNTA (PROPORCIÓN REQUERIDA)
Para una experiencia pedagógica estimulante y variada, DEBES respetar rigurosamente la siguiente proporción:
1. "multiple-choice" (OPCIÓN MÚLTIPLE CLÁSICA A, B, C, D): Debe representar aproximadamente el 45% del lote (ejemplo: 3 de cada 7 preguntas). Es el formato predominante por un margen estrecho.
2. El 55% restante DEBE distribuirse de forma equitativa y activa entre los otros 5 formatos interactivos:
   - "matching": Emparejar conceptos (3 o 4 pares de "termino" <-> "definicion" exacta del texto).
   - "true-false": Pregunta de Verdadero o Falso enfocada en un matiz normativo, biológico, técnico o conceptual clave.
   - "multi-select": Pregunta con selección múltiple de 2 o 3 opciones correctas sobre una lista de 4 o 5 alternativas.
   - "drag-drop": Completar espacios en blanco (oración con huecos {0}, {1} y banco de palabras con distractores).
   - "image-labeling": Etiquetado de diagrama o esquema funcional descrito en el texto (ubicar partes o fases en un esquema).

FASE 3: LÍMITES ESTRICTOS DE EXTENSIÓN DEL ENUNCIADO (MÁXIMO 50 O 80 PALABRAS)
- REGLA GENERAL: Todo enunciado estándar DEBE TENER UN MÁXIMO DE 50 PALABRAS. Evita rodeos, redundancias o textos inflados; la formulación debe ser directa, ágil y de alto impacto memorístico.
- EXCEPCIÓN ÚNICA (DESCRIPCIÓN DE CASO): Únicamente si la pregunta describe un caso práctico, viñeta clínica, supuesto de hecho jurídico o escenario de aplicación, el límite máximo se amplía hasta 80 PALABRAS MÁXIMO.
- Cualquier enunciado que supere estos topes (50 palabras general / 80 palabras caso) es inválido.
- Recuerda: el 50% de las preguntas deben tener enunciados CORTOS de 1 o 2 líneas para memorizar conceptos específicos.

FORMATO DE SALIDA (JSON ESTRICTO):
Responde ÚNICAMENTE con un objeto JSON válido con esta estructura:

{
  "analisis_del_documento": {
    "disciplina_detectada": "Rama detectada",
    "tema_central": "Resumen de 1 línea",
    "conceptos_clave_extraidos": ["Concepto 1", "Concepto 2"]
  },
  "preguntas": [
    {
      "id": 1,
      "chunk_id_origen": "ID del fragmento origen (ej: chk-0-abc)",
      "tipo": "multiple-choice | matching | drag-drop | multi-select | image-labeling | true-false",
      "longitud_enunciado": "corto | medio_largo",
      "concepto_evaluado": "Concepto o tema evaluado",
      "pregunta": "Enunciado de la pregunta (resalta con **...** la parte nuclear o clave de la pregunta, dejando el contexto preliminar sin formato)",
      "opciones": { "A": "Opción A", "B": "Opción B", "C": "Opción C", "D": "Opción D" },
      "respuesta_correcta": "A",
      "opciones_multiples": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "indices_correctos": [0, 2],
      "pares_emparejamiento": [
        { "termino": "Concepto 1", "definicion": "Definición exacta 1" },
        { "termino": "Concepto 2", "definicion": "Definición exacta 2" },
        { "termino": "Concepto 3", "definicion": "Definición exacta 3" }
      ],
      "oracion_plantilla": "El proceso de {0} se lleva a cabo en {1}.",
      "huecos_correctos": ["término 1", "término 2"],
      "banco_palabras": ["término 1", "término 2", "distractor 1", "distractor 2"],
      "titulo_diagrama": "Esquema de ...",
      "etiquetas_diagrama": [
        { "id": "p1", "etiqueta": "Estructura A", "x_porcentaje": 25, "y_porcentaje": 30, "pista": "Paso 1" },
        { "id": "p2", "etiqueta": "Estructura B", "x_porcentaje": 75, "y_porcentaje": 65, "pista": "Paso 2" }
      ],
      "banco_etiquetas": ["Estructura A", "Estructura B", "Distractor A", "Distractor B"],
      "retroalimentacion": {
        "referencia_al_texto": "Cita o paráfrasis que sustenta la respuesta.",
        "explicacion_logica": "Por qué es la respuesta correcta.",
        "por_que_fallan_las_otras": "Por qué fallan los distractores."
      }
    }
}`;

  let sourceRepresentation = '';
  if (chunks && chunks.length > 0) {
    let selectedChunks = chunks;
    if (chunks.length > 36) {
      // Muestreo uniforme estratificado para cubrir desde la diapositiva/página 1 hasta la última sin omisiones
      const maxSlots = 36;
      const step = (chunks.length - 1) / (maxSlots - 1);
      const chosen = new Set<number>();
      selectedChunks = [];
      for (let i = 0; i < maxSlots; i++) {
        const idx = Math.min(chunks.length - 1, Math.round(i * step));
        if (!chosen.has(idx)) {
          chosen.add(idx);
          selectedChunks.push(chunks[idx]);
        }
      }
    }
    sourceRepresentation = selectedChunks.map(c =>
      `[FRAGMENTO ID: ${c.id} | ${c.heading || 'Sección'} | Pág/Diapositiva: ${c.pageOrSlide || 1}]\n${c.text}`
    ).join('\n\n---\n\n');
  } else {
    sourceRepresentation = rawText.slice(0, 35000);
  }

  const userPrompt = `PARÁMETROS DE ENTRADA:
- Texto fuente a analizar (cobertura integral de diapositivas y páginas):
${sourceRepresentation}

- Cantidad exacta de preguntas a generar: ${count}
- Nivel de exigencia: ${difficulty.toUpperCase()}
- COBERTURA COMPLETA OBLIGATORIA: Distribuye las preguntas de manera equilibrada a lo largo de TODAS las diapositivas/páginas presentadas (desde el inicio, pasando por el desarrollo intermedio, hasta la última diapositiva). ESTÁ PROHIBIDO concentrar las preguntas solo en las primeras 4 o 5 diapositivas.
- PROPORCIÓN Y VARIEDAD EXACTA:
  * Aproximadamente el 45% del lote (3 de las 7 preguntas, o 3 de las 6) DEBE ser "multiple-choice" con 4 opciones (A, B, C, D). Es el formato predominante por poco.
  * El 55% restante DEBE ser una rotación variada y balanceada de los otros formatos ("matching", "true-false", "multi-select", "drag-drop", "image-labeling"). No repitas un solo formato alternativo de forma monótona.
- LÍMITES ESTRICTOS DE EXTENSIÓN: Máximo 50 palabras por enunciado estándar; únicamente si es la descripción de un caso práctico, viñeta o supuesto de hecho, el límite máximo sube a 80 palabras.
- REGLA ESTRICTA PARA "drag-drop": La propiedad "pregunta" DEBE ser una instrucción ("Completa los espacios en blanco del siguiente enunciado:" o "Completa los espacios en blanco sobre **[concepto]**:"). NUNCA pongas {0} o {1} en "pregunta". La oración con los huecos {0}, {1} DEBE ir en "oracion_plantilla", las palabras correctas en orden en "huecos_correctos" y todas las palabras con 2-3 distractores en "banco_palabras".

Genera el JSON completo respetando la estructura exigida:`;

  try {
    const rawResponse = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      true
    );

    // Extracción tolerante y robusta de JSON
    const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = cleanOutput.indexOf('{');
    const lastBrace = cleanOutput.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('La respuesta del modelo de IA no contuvo un objeto JSON válido.');
    }

    const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonSnippet);
    } catch {
      let cleaned = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          cleaned = cleaned.replace(/[\u0000-\u001F]+/g, (m) => m === '\n' ? '\\n' : m === '\t' ? '\\t' : '');
          parsed = JSON.parse(cleaned);
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.preguntas) || parsed.preguntas.length === 0) {
      throw new Error('El modelo de IA devolvió un JSON sin lista de preguntas.');
    }

    const topicFallback = parsed.analisis_del_documento?.tema_central || 'Conceptos Fundamentales';

    const mappedQuestions: Question[] = parsed.preguntas.map((p: any, idx: number) => {
      const detectedType = (p.tipo || p.type || '').toLowerCase();
      let templateSentence = p.oracion_plantilla || p.templateSentence || undefined;
      let blanksCorrect: string[] | undefined = Array.isArray(p.huecos_correctos)
        ? p.huecos_correctos.map((h: any) => String(h).trim())
        : (typeof p.huecos_correctos === 'string' && p.huecos_correctos.trim()
            ? p.huecos_correctos.split(',').map((h: string) => h.trim())
            : undefined);

      let wordBank: string[] | undefined = Array.isArray(p.banco_palabras)
        ? p.banco_palabras.map((w: any) => String(w).trim())
        : (typeof p.banco_palabras === 'string' && p.banco_palabras.trim()
            ? p.banco_palabras.split(',').map((w: string) => w.trim())
            : undefined);

      const hasPlaceholders = Boolean(
        (p.pregunta && /\{\d+\}/.test(p.pregunta)) ||
        (templateSentence && /\{\d+\}/.test(templateSentence))
      );

      let qType: Question['type'] = 'multiple-choice';

      if (detectedType.includes('matching') || (Array.isArray(p.pares_emparejamiento) && p.pares_emparejamiento.length >= 2)) {
        qType = 'matching';
      } else if (
        detectedType.includes('drag') ||
        detectedType.includes('blanks') ||
        detectedType.includes('huecos') ||
        detectedType.includes('completar') ||
        (templateSentence && blanksCorrect && blanksCorrect.length > 0) ||
        (hasPlaceholders && (blanksCorrect || wordBank || detectedType.includes('drag')))
      ) {
        qType = 'drag-drop';
      } else if (detectedType.includes('multi-select') || (Array.isArray(p.indices_correctos) && p.indices_correctos.length > 1)) {
        qType = 'multi-select';
      } else if (detectedType.includes('image') || detectedType.includes('labeling') || (Array.isArray(p.etiquetas_diagrama) && p.etiquetas_diagrama.length >= 2)) {
        qType = 'image-labeling';
      } else if (detectedType.includes('true-false') || detectedType.includes('verdadero')) {
        qType = 'true-false';
      } else {
        qType = 'multiple-choice';
      }

      // Preparación de opciones estándar
      const optsObj = p.opciones || {};
      const optionsArray: string[] = Array.isArray(p.opciones_multiples) && p.opciones_multiples.length > 0
        ? p.opciones_multiples.map((o: any) => String(o).trim())
        : [
            String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
            String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
            String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
            String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
          ];
      const correctIndex = parseCorrectIndex(p.respuesta_correcta, optionsArray, qType);

      let finalOptions = optionsArray;
      let finalCorrectIndex = correctIndex;
      if (qType === 'multiple-choice') {
        const balanced = shuffleOptionsWithEqualProbability(optionsArray, correctIndex);
        finalOptions = balanced.options;
        finalCorrectIndex = balanced.correctIndex;
      }

      let fullQuestion = String(p.pregunta || '').trim();
      const contexto = String(p.contexto_o_enunciado || '').trim();
      if (contexto && !fullQuestion.includes(contexto.slice(0, 20)) && p.longitud_enunciado !== 'corto') {
        fullQuestion = `${contexto}\n\n${fullQuestion}`;
      }

      // Normalización pedagógica para preguntas drag-drop
      if (qType === 'drag-drop') {
        if (!templateSentence && /\{\d+\}/.test(fullQuestion)) {
          templateSentence = fullQuestion;
        }
        if (/\{\d+\}/.test(fullQuestion)) {
          const topicLabel = p.concepto_evaluado ? ` sobre **${String(p.concepto_evaluado).trim()}**` : '';
          fullQuestion = `Completa los espacios en blanco${topicLabel} del siguiente enunciado:`;
        }
        // Rescatar huecos si templateSentence los contiene pero blanksCorrect no se definió
        if ((!blanksCorrect || blanksCorrect.length === 0) && templateSentence) {
          const slotMatches = templateSentence.match(/\{\d+\}/g);
          if (slotMatches && Array.isArray(p.opciones_multiples) && p.opciones_multiples.length >= slotMatches.length) {
            blanksCorrect = p.opciones_multiples.slice(0, slotMatches.length);
          }
        }
        // Banco de palabras enriquecido con distractores para desafío pedagógico
        const bankSet = new Set<string>(wordBank || []);
        if (blanksCorrect) {
          blanksCorrect.forEach((b: string) => { if (b) bankSet.add(b); });
        }
        const distractorsPool = ['primario', 'secundario', 'crónico', 'agudo', 'sistémico', 'local', 'benigno', 'patológico'];
        for (const dist of distractorsPool) {
          if (bankSet.size >= (blanksCorrect?.length || 2) + 2) break;
          bankSet.add(dist);
        }
        wordBank = Array.from(bankSet).sort(() => Math.random() - 0.5);
      }

      const isCase = Boolean(p.es_caso || p.es_caso_o_escenario || /\b(caso|supuesto|paciente|tribunal|viñeta)\b/i.test(fullQuestion));
      fullQuestion = enforceQuestionLengthLimit(fullQuestion, isCase);

      const retro = p.retroalimentacion || {};
      const explanationParts: string[] = [];
      if (retro.explicacion_logica) {
        explanationParts.push(String(retro.explicacion_logica).trim());
      }
      if (retro.referencia_al_texto) {
        explanationParts.push(`**Referencia en el texto:** "${String(retro.referencia_al_texto).trim()}"`);
      }
      if (retro.por_que_fallan_las_otras) {
        explanationParts.push(`**Descarte:** ${String(retro.por_que_fallan_las_otras).trim()}`);
      }

      // RAG Traceability linkage
      let sourceChunkId = p.chunk_id_origen || undefined;
      let sourceChunkText: string | undefined = undefined;
      let sourcePageOrSlide: number | undefined = undefined;

      if (chunks && chunks.length > 0) {
        let matchedChunk = chunks.find(c => c.id === p.chunk_id_origen);
        if (!matchedChunk) {
          const textToSearch = (p.pregunta || '') + ' ' + (retro.referencia_al_texto || '');
          matchedChunk = chunks.find(c => textToSearch.toLowerCase().includes(c.text.slice(0, 30).toLowerCase())) || chunks[idx % chunks.length];
        }
        if (matchedChunk) {
          sourceChunkId = matchedChunk.id;
          sourceChunkText = matchedChunk.text;
          sourcePageOrSlide = matchedChunk.pageOrSlide;
        }
      }

      // Estructuras especializadas por tipo interactivo
      const matchingPairs = Array.isArray(p.pares_emparejamiento)
        ? p.pares_emparejamiento.map((pair: any) => ({
            term: String(pair.termino || pair.term || 'Concepto').trim(),
            definition: String(pair.definicion || pair.definition || 'Definición').trim()
          }))
        : undefined;

      const correctIndices = Array.isArray(p.indices_correctos)
        ? parseCorrectIndices(p.indices_correctos, optionsArray)
        : undefined;

      const imageHotspots = Array.isArray(p.etiquetas_diagrama)
        ? p.etiquetas_diagrama.map((h: any, hIdx: number) => ({
            id: String(h.id || `pin-${hIdx + 1}`),
            label: String(h.etiqueta || h.label || `Etiqueta ${hIdx + 1}`).trim(),
            xPercent: Number(h.x_porcentaje || h.xPercent || 25 + (hIdx * 20)),
            yPercent: Number(h.y_porcentaje || h.yPercent || 30 + (hIdx * 15)),
            hint: h.pista || h.hint || `Punto ${hIdx + 1}`
          }))
        : undefined;

      const imageWordBank = Array.isArray(p.banco_etiquetas)
        ? p.banco_etiquetas.map((b: any) => String(b).trim())
        : (imageHotspots ? imageHotspots.map((h: any) => h.label) : undefined);

      const diagramTitle = p.titulo_diagrama || p.diagramTitle || undefined;

      return {
        id: `q-pedagogical-${difficulty}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: qType,
        difficulty,
        topic: String(p.concepto_evaluado || topicFallback).trim(),
        question: fullQuestion || 'Pregunta pedagógica de evaluación.',
        options: qType === 'true-false' ? ['Verdadero', 'Falso'] : finalOptions,
        correctIndex: finalCorrectIndex,
        correctIndices,
        matchingPairs,
        templateSentence,
        blanksCorrect,
        wordBank,
        imageHotspots,
        imageWordBank,
        diagramTitle,
        explanation: explanationParts.join('\n\n') || 'Explicación fundamentada en el material de estudio.',
        sourceChunkId,
        sourceChunkText,
        sourcePageOrSlide,
      };
    });

    return mappedQuestions;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Contrareloj Study AI Engine] Error generando preguntas (${difficulty}):`, msg);
    throw new Error(`Fallo en llamada a IA (${difficulty}): ${msg}`);
  }
}

/**
 * Genera un lote inicial ágil de 20 preguntas pedagógicas por IA de manera concurrente
 * (7 Fácil, 7 Intermedio y 6 Difícil) para máxima rapidez en la creación del Study Kit,
 * garantizando cobertura pedagógica y prefetching posterior bajo demanda.
 */
export async function generateCompleteAIPedagogicalBatch(
  rawText: string,
  chunks?: DocumentChunk[],
  onProgress?: (step: string) => void
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada. Actívala en el menú de Configuración de IA.');
  }

  onProgress?.('Analizando disciplina, estructura y núcleos conceptuales con IA...');

  // Cobertura completa uniforme de todas las diapositivas y páginas para cada nivel pedagógico
  // Se garantiza que ningún nivel ignore secciones intermedias o finales
  let easyChunks = chunks;
  let mediumChunks = chunks;
  let hardChunks = chunks;

  if (chunks && chunks.length > 9) {
    // Muestreo estratificado alternado: los tres niveles cubren desde la diapositiva 1 hasta la última
    easyChunks = chunks.filter((_, idx) => idx % 3 === 0 || idx < 2 || idx >= chunks.length - 2);
    mediumChunks = chunks.filter((_, idx) => idx % 3 === 1 || idx % 2 === 0);
    hardChunks = chunks.filter((_, idx) => idx % 3 === 2 || idx % 2 === 1);
  }

  onProgress?.('Generando el lote de preguntas pedagógicas...');

  // Llamadas concurrentes a los 3 niveles: 7 + 7 + 6 = 20 preguntas iniciales
  const [resEasy, resMedium, resHard] = await Promise.allSettled([
    generateAIPedagogicalQuestions(rawText, 7, 'easy', easyChunks),
    generateAIPedagogicalQuestions(rawText, 7, 'medium', mediumChunks),
    generateAIPedagogicalQuestions(rawText, 6, 'hard', hardChunks),
  ]);

  const easyQuestions = resEasy.status === 'fulfilled' ? resEasy.value : [];
  const mediumQuestions = resMedium.status === 'fulfilled' ? resMedium.value : [];
  const hardQuestions = resHard.status === 'fulfilled' ? resHard.value : [];

  const allQuestions = [...easyQuestions, ...mediumQuestions, ...hardQuestions];

  // Si todas las llamadas fallaron o no se generó ninguna pregunta
  if (allQuestions.length === 0) {
    const errors: string[] = [];
    if (resEasy.status === 'rejected') errors.push(`Nivel Fácil: ${resEasy.reason.message}`);
    if (resMedium.status === 'rejected') errors.push(`Nivel Medio: ${resMedium.reason.message}`);
    if (resHard.status === 'rejected') errors.push(`Nivel Difícil: ${resHard.reason.message}`);

    throw new Error(
      `No fue posible generar las preguntas mediante IA.\n\n` +
      `Detalles del error detectado:\n${errors.join('\n')}\n\n` +
      `Verifica que tu servidor local (Ollama) o endpoint API esté activo y disponible en el menú de Configuración de IA.`
    );
  }

  onProgress?.('Preguntas pedagógicas generadas con éxito.');

  return allQuestions;
}

/** Generación de Flashcards bajo demanda */
export async function generateAIFlashcards(
  rawText: string,
  title: string,
  category: string
): Promise<Flashcard[]> {
  const settings = getAISettings();
  const systemPrompt = `Eres un docente experto en técnicas de estudio activo y repetición espaciada.
A partir del texto del estudiante, extrae los conceptos o términos clave esenciales y genera exactamente entre 8 y 12 flashcards rigurosas en español.
Responde ÚNICAMENTE con un JSON con la estructura:
{
  "flashcards": [
    { "term": "Concepto o Principio", "definition": "Definición concisa, clara y precisa sin rodeos" }
  ]
}`;

  const userPrompt = `Material ("${title}" - ${category}):\n\n${rawText.slice(0, 7000)}\n\nGenera las flashcards:`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true
      );
      const match = res.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
          return parsed.flashcards.map((f: { term: string; definition: string }, i: number) => ({
            id: `fc-ai-${Date.now()}-${i}`,
            term: f.term,
            definition: f.definition,
            mastery: 'to-learn' as const,
          }));
        }
      }
    } catch (e) {
      console.warn('[Flashcards AI] Error generando flashcards con IA:', e);
    }
  }

  return [];
}

/** Generación de lote adicional de Flashcards evitando conceptos ya existentes */
export async function generateAdditionalAIFlashcards(
  rawText: string,
  title: string,
  category: string,
  existingTerms: string[] = [],
  count: number = 10
): Promise<Flashcard[]> {
  const settings = getAISettings();
  const excludeList = existingTerms.slice(-30).join(', ');
  const systemPrompt = `Eres un docente experto en técnicas de estudio activo y repetición espaciada.
A partir del texto del estudiante, extrae conceptos o términos clave esenciales NO vistos previamente y genera exactamente ${count} flashcards rigurosas en español.
${excludeList ? `EVITA estrictamente repetir estos conceptos ya cubiertos: [${excludeList}].` : ''}
Responde ÚNICAMENTE con un JSON con la estructura:
{
  "flashcards": [
    { "term": "Concepto o Principio", "definition": "Definición concisa, clara y precisa sin rodeos" }
  ]
}`;

  const userPrompt = `Material ("${title}" - ${category}):\n\n${rawText.slice(0, 8000)}\n\nGenera las ${count} flashcards adicionales:`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true
      );
      const match = res.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
          return parsed.flashcards.map((f: { term: string; definition: string }, i: number) => ({
            id: `fc-ai-${Date.now()}-${i}`,
            term: f.term,
            definition: f.definition,
            mastery: 'to-learn' as const,
          }));
        }
      }
    } catch (e) {
      console.warn('[Flashcards AI] Error generando flashcards adicionales con IA:', e);
    }
  }

  // Generador de respaldo a partir del material si la IA está deshabilitada o falla
  const paragraphs = rawText
    .split(/\n{2,}|\.\s+/)
    .map(p => p.trim())
    .filter(p => p.length > 30 && !existingTerms.some(t => p.toLowerCase().includes(t.toLowerCase())));

  const fallbacks: Flashcard[] = [];
  for (let i = 0; i < Math.min(count, Math.max(1, paragraphs.length)); i++) {
    const p = paragraphs[i] || `Concepto clave adicional ${existingTerms.length + i + 1} del tema ${title}`;
    const colonIdx = p.indexOf(':');
    let term = `Concepto ${existingTerms.length + i + 1}`;
    let def = p;
    if (colonIdx > 3 && colonIdx < 50) {
      term = p.slice(0, colonIdx).trim();
      def = p.slice(colonIdx + 1).trim();
    } else {
      const words = p.split(' ');
      term = words.slice(0, Math.min(5, words.length)).join(' ');
      def = p;
    }
    fallbacks.push({
      id: `fc-fallback-${Date.now()}-${i}`,
      term,
      definition: def,
      mastery: 'to-learn',
    });
  }

  return fallbacks;
}

/** Generación de Guía de Estudio bajo demanda */
export async function generateAIStudyGuide(
  rawText: string,
  title: string,
  category: string
): Promise<string> {
  const settings = getAISettings();
  const systemPrompt = `Eres un redactor académico de élite de Contrareloj Study.
Genera una Guía de Estudio estructurada en Markdown rigurosa, clara y pedagógica en español.
Incluye:
# ${title}
> **Resumen Ejecutivo:** Síntesis del material en 3 líneas directas.

## 1. Núcleos Conceptuales y Principios Clave
(Con viñetas, definiciones y relaciones lógicas profundas)

## 2. Cuadros Comparativos y Diferenciaciones Clave
(UTILIZA TABLAS EN MARKDOWN con formato | Columna 1 | Columna 2 | Columna 3 | sin líneas vacías entre filas para contrastar patologías, clasificaciones, signos distintivos, fases o conceptos clave)

## 3. Puntos Clave de Examen & Errores Frecuentes
(Diferenciaciones sutiles y detalles que suelen confundir a los estudiantes)

## 4. Resumen Rápido / Mnemotecnia de Repaso`;

  const userPrompt = `Documento ("${title}" - ${category}):\n\n${rawText.slice(0, 8000)}\n\nGenera la guía de estudio en markdown:`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        false
      );
      if (res && res.trim().length > 100) {
        return res.trim();
      }
    } catch (e) {
      console.warn('[StudyGuide AI] Error generando guía con IA:', e);
    }
  }

  return '';
}

/** Generación de Episodio de Podcast bajo demanda */
export async function generateAIPodcast(
  rawText: string,
  title: string,
  category: string
): Promise<PodcastEpisode | null> {
  const settings = getAISettings();
  const systemPrompt = `Eres el productor ejecutivo del podcast educativo Contrareloj Review.
A partir del texto proporcionado, genera un episodio de repaso dinámico, entretenido y riguroso entre Sofia (Host entusiasta) y Alex (Tutor pedagógico experto).
Deben discutir los puntos centrales del tema con naturalidad, analogías y claridad en español.
Responde ÚNICAMENTE con un JSON con la estructura:
{
  "podcast": {
    "title": "Repaso Express: ${title}",
    "duration": "4:30 min",
    "dialogue": [
      { "speaker": "Sofia", "time": "0:00", "text": "¡Bienvenidos! Hoy analizaremos los puntos clave de..." },
      { "speaker": "Alex", "time": "0:15", "text": "Exacto, Sofia. Lo fundamental que debemos comprender es..." }
    ]
  }
}`;

  const userPrompt = `Material ("${title}" - ${category}):\n\n${rawText.slice(0, 7000)}\n\nGenera el podcast:`;

  if (settings.enabled) {
    try {
      const res = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        true
      );
      const match = res.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.podcast && Array.isArray(parsed.podcast.dialogue)) {
          return {
            id: `pod-ai-${Date.now()}`,
            title: parsed.podcast.title || `Repaso: ${title}`,
            duration: parsed.podcast.duration || '4:00 min',
            hosts: [
              { name: 'Sofia', role: 'Host', avatar: 'S' },
              { name: 'Alex', role: 'Tutor IA', avatar: 'A' },
            ],
            dialogue: parsed.podcast.dialogue,
          };
        }
      }
    } catch (e) {
      console.warn('[Podcast AI] Error generando podcast con IA:', e);
    }
  }

  return null;
}

/** Tutor interactivo "Ask Thea" potenciado por IA con fallback inteligente */
export async function askTheaAI(
  userQuery: string,
  kit: StudyKit,
  history: Array<{ sender: 'thea' | 'user'; text: string }>
): Promise<string> {
  const settings = getAISettings();

  if (settings.enabled) {
    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'system',
          content: `Eres una tutora académica inteligente, cálida y pedagógica de Contrareloj Study.
Estás ayudando al estudiante a dominar el tema: "${kit.title}" (Categoría: ${kit.category}).
Contexto del material de estudio del estudiante:
${kit.studyGuideMarkdown.slice(0, 5000)}

Responde de forma clara, motivadora y estructurada en español. Usa viñetas, analogías o reglas mnemotécnicas cuando sea útil para aprender mejor.`,
        },
      ];

      // Incluir últimos 4 mensajes del historial para coherencia conversacional
      const recent = history.slice(-4);
      for (const msg of recent) {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }

      messages.push({ role: 'user', content: userQuery });

      const reply = await queryAICompletion(messages, false);
      if (reply && reply.trim().length > 10) {
        return reply.trim();
      }
    } catch (err) {
      console.warn('[AskThea AI] Fallback a respuestas locales:', err);
    }
  }

  // ── Fallback local inteligente basado en el texto del Study Kit ──
  const lowerQuery = userQuery.toLowerCase();

  // Buscar coincidencia en preguntas
  const matchingQuestion = kit.questions.find(
    q => lowerQuery.includes(q.topic.toLowerCase()) || q.question.toLowerCase().includes(lowerQuery.slice(0, 15))
  );
  if (matchingQuestion) {
    return `Sobre tu duda en torno a **${matchingQuestion.topic}**: ${matchingQuestion.explanation}\n\n¿Quieres que profundicemos en este concepto o que te haga una pregunta de práctica?`;
  }

  // Buscar coincidencia en flashcards
  const matchingCard = kit.flashcards.find(
    f => lowerQuery.includes(f.term.toLowerCase()) || f.definition.toLowerCase().includes(lowerQuery.slice(0, 15))
  );
  if (matchingCard) {
    return `El concepto de **${matchingCard.term}** en este material se define como: ${matchingCard.definition}.\n\nEs un concepto clave para las evaluaciones de ${kit.category}.`;
  }

  return `Excelente pregunta sobre **${kit.title}**. Analizando tus apuntes y la guía de estudio:\n\n` +
    `• El núcleo del tema se centra en comprender las interacciones y definiciones de ${kit.questions[0]?.topic || 'los principios fundamentales'}.\n` +
    `• Recuerda repasar las sesiones de **Smart Study** para poner a prueba tu retención activa.\n\n` +
    `¿Deseas que te explique algún término específico o que simulemos una pregunta de examen?`;
}

export interface TopicResearchResult {
  text: string;
  title: string;
  sources: string[];
}

/**
 * Investiga un tema desde cero consultando fuentes abiertas (Wikipedia / Open Knowledge)
 * y sintetiza un dossier académico basado en evidencia científica utilizando IA.
 */
export async function researchTopicAndGenerateKit(
  topic: string,
  focusArea?: string
): Promise<TopicResearchResult> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    throw new Error('Debes ingresar un tema para realizar la investigación.');
  }

  const sources: string[] = [];
  let factualContext = '';
  let discoveredTitle = cleanTopic;

  // 1. Buscar en Wikipedia en español abierta
  try {
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTopic)}&utf8=&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const hits = searchData.query?.search || [];
      if (hits.length > 0) {
        discoveredTitle = hits[0].title;
        // Extraer contenido de los 2 artículos más relevantes en paralelo
        const topTitles = hits.slice(0, 2).map((h: { title: string }) => h.title);
        const extractResults = await Promise.all(
          topTitles.map(async (pageTitle: string) => {
            try {
              const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=4000&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
              const extractRes = await fetch(extractUrl);
              if (extractRes.ok) {
                const extractData = await extractRes.json();
                const pages = extractData.query?.pages || {};
                for (const pid in pages) {
                  const p = pages[pid];
                  if (p.extract) {
                    return {
                      context: `### Fuente Documental: ${p.title}\n${p.extract}\n\n`,
                      source: `Wikipedia: ${p.title} (https://es.wikipedia.org/wiki/${encodeURIComponent(p.title)})`,
                    };
                  }
                }
              }
            } catch {}
            return null;
          })
        );

        for (const item of extractResults) {
          if (item) {
            factualContext += item.context;
            sources.push(item.source);
          }
        }
      }
    }
  } catch (wikiErr) {
    console.warn('[TopicResearch] Error buscando en Wikipedia ES:', wikiErr);
  }

  // Si no se encontró en español, intentar en Wikipedia en inglés
  if (!factualContext) {
    try {
      const searchUrlEn = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTopic)}&utf8=&format=json&origin=*`;
      const searchResEn = await fetch(searchUrlEn);
      if (searchResEn.ok) {
        const searchDataEn = await searchResEn.json();
        const hitsEn = searchDataEn.query?.search || [];
        if (hitsEn.length > 0) {
          const pageTitle = hitsEn[0].title;
          discoveredTitle = pageTitle;
          const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=4000&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
          const extractRes = await fetch(extractUrl);
          if (extractRes.ok) {
            const extractData = await extractRes.json();
            const pages = extractData.query?.pages || {};
            for (const pid in pages) {
              const p = pages[pid];
              if (p.extract) {
                factualContext += `### Source: Wikipedia (${p.title})\n${p.extract}\n\n`;
                sources.push(`Wikipedia EN: ${p.title} (https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)})`);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const settings = getAISettings();

  // 2. Síntesis pedagógica profunda basada en evidencia científica con IA
  if (settings.enabled) {
    try {
      const systemPrompt = `Eres un investigador científico de élite y educador universitario de la plataforma Contrareloj Study.
Tu misión es redactar un DOSSIER DE ESTUDIO ACADÉMICO riguroso, exhaustivo y estructurado, fundamentado en EVIDENCIA CIENTÍFICA, consensos académicos y literatura comprobada.

REGLAS OBLIGATORIAS:
1. RIGOR Y VERACIDAD: Toda la información debe ser veraz y objetiva. Describe los mecanismos bioquímicos, fisiológicos, físicos, jurídicos o técnicos reales.
2. ESTRUCTURA:
   # ${discoveredTitle}
   > **Marco de Referencia Científico:** Síntesis del estado del arte y consensos actuales.

   ## 1. Fundamentos Conceptuales y Definición Rigurosa
   (Definición formal, etiología/principios base, terminología técnica sin ambigüedades)

   ## 2. Mecanismos y Procesos Detallados
   (Explicación paso a paso de cómo ocurre, vías moleculares/físicas o fundamentos normativos de causa y efecto)

   ## 3. Evidencia Científica y Consensos
   (Estudios clave, meta-análisis, guías de práctica o ensayos empíricos reconocidos)

   ## 4. Diferenciación Crítica y Diagnósticos/Casos Diferenciales
   (Contraste explícito con conceptos afines que se suelen confundir)

   ## 5. Núcleos de Dominio para Evaluación
   (Los conceptos nucleares que un estudiante debe comprender a fondo)

3. IDIOMA: Responde completamente en español formal académico, fluido y de alto valor pedagógico.`;

      const userPrompt = `TEMA INVESTIGADO: ${discoveredTitle}${focusArea ? `\nÁrea o Especialidad: ${focusArea}` : ''}

INFORMACIÓN FACTUAL RECUPERADA DE FUENTES CIENTÍFICAS Y ABIERTAS:
${factualContext ? factualContext.slice(0, 6000) : 'Utiliza tu conocimiento enciclopédico y científico verificado para desarrollar el tema.'}

Redacta el dossier académico completo:`;

      const aiSynthesized = await queryAICompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        false
      );

      if (aiSynthesized && aiSynthesized.trim().length > 250) {
        return {
          text: aiSynthesized.trim(),
          title: discoveredTitle,
          sources: sources.length > 0 ? sources : ['Bases de datos científicas abiertas (Open Knowledge Graph)'],
        };
      }
    } catch (aiErr) {
      console.warn('[TopicResearch] Error en llamada a IA para síntesis de tema:', aiErr);
    }
  }

  // 3. Fallback en caso de que la IA esté desactivada o inaccesible:
  if (factualContext && factualContext.length > 100) {
    const fallbackText = `# ${discoveredTitle} — Dossier de Estudio Basado en Evidencia

> **Investigación Abierta:** Material recopilado a partir de fuentes documentales y científicas para "${discoveredTitle}".

## 1. Fundamentos Conceptuales
${factualContext}

## 2. Puntos Clave de Dominio Académico
* Dominio de la definición rigurosa y terminología técnica fundamental.
* Comprensión de los mecanismos de causalidad e interacciones descritas en el material.
* Capacidad de diferenciar los conceptos centrales frente a distractores comunes.`;

    return {
      text: fallbackText,
      title: discoveredTitle,
      sources: sources.length > 0 ? sources : ['Búsqueda en enciclopedias y fuentes abiertas'],
    };
  }

  throw new Error(
    `No se pudo recopilar suficiente información científica sobre el tema "${cleanTopic}".\n\n` +
    `Verifica la ortografía o intenta con un término más específico (ej: "Resistencia bacteriana a antibióticos", "Leyes de Newton", "Contrato de compraventa").`
  );
}

/**
 * Genera una pregunta socrática reformulada con Active Recall ante un error del estudiante.
 * Modifica el ángulo cognitivo para verificar la comprensión real del concepto y no la simple
 * memorización posicional de las opciones múltiples.
 */
export async function generateSocraticReformulatedQuestion(
  concept: string,
  originalQuestion: Question,
  userWrongAnswer: string,
  contextChunkText?: string
): Promise<Question> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const systemPrompt = `Eres el motor de tutoría socrática de Contrareloj Study, plataforma adaptativa de alto rendimiento académico.
Tu misión pedagógica es verificar la comprensión profunda y el dominio conceptual real de un estudiante mediante Active Recall y reformulación socrática.

EL ESTUDIANTE COMETIÓ UN ERROR EN ESTE CONCEPTO:
- Concepto Clave: "${concept}"
- Pregunta que falló: "${originalQuestion.question}"
- Respuesta errónea seleccionada por el estudiante: "${userWrongAnswer}"

PRINCIPIOS SOCRÁTICOS DE REFORMULACIÓN OBLIGATORIOS:
1. PROHIBICIÓN DE REPETICIÓN: No repitas la misma pregunta ni las mismas opciones en el mismo orden.
2. REFORMULACIÓN COGNITIVA DESDE OTRO ÁNGULO:
   - Si la pregunta original evaluaba identificación directa, ahora plantea un caso práctico, un supuesto fáctico o una relación causa-efecto inversa.
   - Si la pregunta original evaluaba la causa, ahora evalúa el mecanismo, la consecuencia de una alteración o un contraste con un concepto limítrofe.
3. DISTRACTORES INTELIGENTES SOCRÁTICOS:
   - Las 4 opciones deben ser plausibles y homogéneas en extensión.
   - Uno de los distractores debe atacar directamente la confusión o error conceptual evidenciado por la respuesta errónea anterior ("${userWrongAnswer}").
4. RETROALIMENTACIÓN SOCRÁTICA COMPLETA:
   - Explica por qué la respuesta correcta resuelve el caso.
   - Desarma con claridad y lógica el motivo del error previo para consolidar el aprendizaje activo.
5. LÍMITE ESTRICTO DE EXTENSIÓN:
   - Máximo 50 palabras para preguntas estándar.
   - Máximo 80 palabras si es descripción de un caso o supuesto de hecho.

FORMATO DE SALIDA (JSON ÚNICAMENTE):
{
  "concepto_evaluado": "${concept}",
  "angulo_socratico": "Explicación breve del ángulo cognitivo utilizado (ej: Caso práctico aplicado, deducción de mecanismo inverso)",
  "contexto_o_enunciado": "Planteamiento del escenario o premisa lógica.",
  "pregunta": "¿Pregunta clara, directa y reformulada?",
  "opciones": {
    "A": "Opción A",
    "B": "Opción B",
    "C": "Opción C",
    "D": "Opción D"
  },
  "respuesta_correcta": "Letra (A, B, C o D)",
  "retroalimentacion": {
    "explicacion_logica": "Fundamento lógico de la respuesta correcta.",
    "desmonte_del_error": "Explicación de por qué la confusión previa queda resuelta.",
    "referencia_al_texto": "Cita o referencia al principio del material de estudio."
  }
}`;

  const referenceText = contextChunkText || originalQuestion.sourceChunkText || originalQuestion.explanation;
  const userPrompt = `Material de estudio de referencia sobre el concepto "${concept}":
${referenceText ? referenceText.slice(0, 4000) : 'Fundamenta la pregunta en la definición académica y operativa del concepto.'}

Genera la pregunta socrática reformulada en formato JSON:`;

  const rawResponse = await queryAICompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    true
  );

  const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = cleanOutput.indexOf('{');
  const lastBrace = cleanOutput.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('La respuesta de reformulación socrática no contuvo un objeto JSON válido.');
  }

  const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonSnippet);
  } catch {
    const sanitizedJson = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
    parsed = JSON.parse(sanitizedJson);
  }

  const optsObj = parsed.opciones || {};
  const optionsArray: string[] = [
    String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
    String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
    String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
    String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
  ];

  const rawCorrectIndex = parseCorrectIndex(parsed.respuesta_correcta, optionsArray, 'multiple-choice');
  const balanced = shuffleOptionsWithEqualProbability(optionsArray, rawCorrectIndex);
  const optionsArrayFinal = balanced.options;
  const correctIndex = balanced.correctIndex;

  let fullQuestion = String(parsed.pregunta || '').trim();
  const contexto = String(parsed.contexto_o_enunciado || '').trim();
  if (contexto && !fullQuestion.includes(contexto.slice(0, 20))) {
    fullQuestion = `${contexto}\n\n${fullQuestion}`;
  }
  const isCase = /\b(caso|supuesto|paciente|clínic|escenario)\b/i.test(fullQuestion);
  fullQuestion = enforceQuestionLengthLimit(fullQuestion, isCase);

  const retro = parsed.retroalimentacion || {};
  const explanationParts: string[] = [];
  if (retro.explicacion_logica) {
    explanationParts.push(String(retro.explicacion_logica).trim());
  }
  if (retro.desmonte_del_error) {
    explanationParts.push(`**Desmonte del error previo:** ${String(retro.desmonte_del_error).trim()}`);
  }
  if (retro.referencia_al_texto) {
    explanationParts.push(`**Referencia en el texto:** "${String(retro.referencia_al_texto).trim()}"`);
  }

  return {
    id: `q-socratic-recall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'multiple-choice',
    difficulty: originalQuestion.difficulty || 'medium',
    topic: concept,
    question: fullQuestion || 'Pregunta de refuerzo socrático.',
    options: optionsArrayFinal,
    correctIndex,
    explanation: explanationParts.join('\n\n') || 'Explicación fundamentada en la consolidación socrática del concepto.',
    sourceChunkId: originalQuestion.sourceChunkId,
    sourceChunkText: originalQuestion.sourceChunkText,
    sourcePageOrSlide: originalQuestion.sourcePageOrSlide,
    isSocraticReformulation: true,
    reformedConcept: concept,
    originalFailedQuestionId: originalQuestion.id,
    socraticAngle: parsed.angulo_socratico || 'Reformulación cognitiva de Active Recall',
  };
}

/**
 * Genera preguntas dirigidas a un subtema concreto y calibradas por nivel de exigencia.
 * Para Nivel 3 (Máxima Exigencia), aplica la regla pedagógica de distractores sutiles y opciones sumamente similares.
 */
export async function generateTargetedPedagogicalQuestions(
  rawText: string,
  topicQuery: string,
  level: 1 | 2 | 3,
  count: number = 5,
  chunks?: DocumentChunk[]
): Promise<Question[]> {
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('La integración de IA está desactivada en la configuración.');
  }

  const difficultyMap: Record<number, 'easy' | 'medium' | 'hard'> = {
    1: 'easy',
    2: 'medium',
    3: 'hard',
  };
  const difficulty = difficultyMap[level] || 'hard';

  // RAG Filtrado y Relevancia Temática
  let relevantChunks: DocumentChunk[] = [];
  const normalizedQuery = topicQuery.trim().toLowerCase();

  if (chunks && chunks.length > 0) {
    if (normalizedQuery) {
      const keywords = normalizedQuery
        .split(/\s+/)
        .map(w => w.replace(/[^\wáéíóúüñ]/gi, '').toLowerCase())
        .filter(w => w.length > 2 && !['para', 'como', 'sobre', 'entre', 'desde', 'hacia', 'este', 'esta', 'los', 'las', 'del', 'una', 'con'].includes(w));

      const scored = chunks.map(chunk => {
        const textLower = chunk.text.toLowerCase();
        const headingLower = (chunk.heading || '').toLowerCase();
        let score = 0;

        if (textLower.includes(normalizedQuery)) score += 10;
        if (headingLower.includes(normalizedQuery)) score += 15;

        for (const kw of keywords) {
          if (headingLower.includes(kw)) score += 4;
          if (textLower.includes(kw)) score += 1;
        }

        return { chunk, score };
      });

      const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
      if (matched.length > 0) {
        relevantChunks = matched.slice(0, 10).map(m => m.chunk);
      } else {
        relevantChunks = chunks.slice(0, 8);
      }
    } else {
      relevantChunks = chunks.slice(0, 10);
    }
  }

  let sourceRepresentation = '';
  if (relevantChunks.length > 0) {
    sourceRepresentation = relevantChunks.map(c =>
      `[FRAGMENTO ID: ${c.id} | ${c.heading || 'Sección'} | Pág/Diapositiva: ${c.pageOrSlide || 1}]\n${c.text}`
    ).join('\n\n---\n\n');
  } else {
    sourceRepresentation = rawText.slice(0, 8000);
  }

  const levelInstructions: Record<number, string> = {
    1: `NIVEL 1 - FUNDAMENTOS Y RETENCIÓN BÁSICA:
- Evalúa definiciones operativas esenciales, principios rectores y terminología fundamental del tema.
- Preguntas conceptuales directas con 4 opciones claramente formuladas, donde los 3 distractores sean conceptos del mismo tema.`,

    2: `NIVEL 2 - APLICACIÓN PRÁCTICA Y ESCENARIOS:
- Evalúa relaciones causa-efecto, aplicación de procedimientos o resolución de situaciones prácticas a partir del texto.
- Formula un caso o premisa lógica previa que obligue a deducir la respuesta correcta en lugar de recordarla de memoria.`,

    3: `NIVEL 3 - MÁXIMA EXIGENCIA CON OPCIONES SIMILARES (DISCRIMINACIÓN FINA):
- EXIGENCIA CRÍTICA: Casos clínicos de diagnóstico diferencial, conflictos normativos complejos o mecanismos de acción sutiles.
- REGLA OBLIGATORIA DE OPCIONES SIMILARES:
  1. Las 4 opciones de respuesta (A, B, C, D) deben tener UNA ESTRUCTURA GRAMATICAL, EXTENSIÓN Y VOCABULARIO TÉCNICO PRÁCTICAMENTE IDÉNTICOS.
  2. Los 3 distractores deben ser variantes sumamente sutiles y plausibles fundamentadas en el documento (ej. ligeras diferencias en dosis, mecanismos adyacentes, plazos jurídicos o matices taxonómicos reales).
  3. Está TERMINANTEMENTE PROHIBIDO incluir distractores absurdos o descartables por longitud o tono. El estudiante debe dominar los matices más finos para no equivocarse.`
  };

  const systemPrompt = `Eres el evaluador de alta exigencia académica de Contrareloj Study.
Tu objetivo es formular preguntas de evaluación altamente especializadas, enfocadas rigurosamente en el subtema solicitado por el usuario y calibradas al nivel pedagógico elegido.

${levelInstructions[level]}

DIRECTRICES GENERALES DE GENERACIÓN:
1. Fidelidad estricta al documento: Toda afirmación y justificación debe emanar del texto provisto.
2. ROTACIÓN DE ESTILOS: Alterna estilos interactivos:
   - "multiple-choice": 4 opciones con distractores plausibles del texto.
   - "matching": Emparejar 3 o 4 conceptos específicos con sus definiciones/roles.
   - "drag-drop": Oración con huecos {0}, {1} y banco de palabras con distractores.
   - "multi-select": 4 o 5 opciones con 2 o 3 respuestas correctas.
   - "image-labeling": Etiquetar zonas de un diagrama o esquema.
   - "true-false": Afirmación conceptual directa.
3. EXTENSIÓN BALANCEADA: El 50% de las preguntas DEBEN tener enunciados CORTOS Y DIRECTOS (1 a 2 líneas concisas) para memorizar conceptos específicos; el otro 50% casos prácticos o de análisis.
4. LÍMITES ESTRICTOS DE EXTENSIÓN (MÁXIMO 50 O 80 PALABRAS):
   - Todo enunciado estándar DEBE TENER UN MÁXIMO DE 50 PALABRAS. Evita redundancias o textos inflados.
   - Si describe un caso práctico, viñeta clínica o supuesto de hecho, el límite máximo se amplía hasta 80 PALABRAS MÁXIMO.
   - Cualquier enunciado que supere estos límites debe compactarse o recortarse.
5. Tema Enfocado: ${topicQuery.trim() ? `TODAS las preguntas deben abordar exclusivamente: "${topicQuery.trim()}".` : 'Aborda los núcleos temáticos más desafiantes del documento.'}

FORMATO DE SALIDA (JSON ÚNICAMENTE):
{
  "tema_calibrado": "${topicQuery.trim() || 'Subtema evaluado'}",
  "nivel_calibrado": ${level},
  "preguntas": [
    {
      "id": 1,
      "chunk_id_origen": "ID del fragmento utilizado",
      "tipo": "multiple-choice | matching | drag-drop | multi-select | image-labeling | true-false",
      "longitud_enunciado": "corto | medio_largo",
      "concepto_evaluado": "Subconcepto específico evaluado",
      "contexto_o_enunciado": "Planteamiento del escenario o premisa.",
      "pregunta": "¿Pregunta analítica o concepto específico?",
      "opciones": { "A": "Opción A", "B": "Opción B", "C": "Opción C", "D": "Opción D" },
      "respuesta_correcta": "A",
      "opciones_multiples": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "indices_correctos": [0, 2],
      "pares_emparejamiento": [
        { "termino": "Concepto 1", "definicion": "Definición 1" },
        { "termino": "Concepto 2", "definicion": "Definición 2" }
      ],
      "oracion_plantilla": "El {0} actúa sobre {1}.",
      "huecos_correctos": ["término 1", "término 2"],
      "banco_palabras": ["término 1", "término 2", "distractor 1", "distractor 2"],
      "titulo_diagrama": "Diagrama de ...",
      "etiquetas_diagrama": [
        { "id": "p1", "etiqueta": "Elemento A", "x_porcentaje": 30, "y_porcentaje": 40 }
      ],
      "banco_etiquetas": ["Elemento A", "Elemento B"],
      "retroalimentacion": {
        "referencia_al_texto": "Cita textual del fragmento que fundamenta la respuesta.",
        "explicacion_logica": "Por qué esta opción es la correcta.",
        "por_que_fallan_las_otras": "Diferenciación fina y sutil de por qué fallan los distractores."
      }
    }
  ]
}`;

  const userPrompt = `MATERIAL DE ESTUDIO DE REFERENCIA:
${sourceRepresentation}

PARÁMETROS DE GENERACIÓN:
- Subtema concreto solicitado: ${topicQuery.trim() || 'General del documento'}
- Nivel de dificultad: Nivel ${level} (${level === 3 ? 'MÁXIMA EXIGENCIA - OPCIONES SIMILARES' : level === 2 ? 'INTERMEDIO' : 'BÁSICO'})
- Cantidad de preguntas a generar: ${count}
- Límite de palabras: Máximo 50 palabras para enunciados estándar, o 80 palabras si es descripción de un caso.
- Recuerda: Alterna los estilos de pregunta y haz que el 50% de los enunciados sean CORTOS (1 o 2 líneas) para memorizar conceptos específicos.

Genera las ${count} preguntas en formato JSON estricto:`;

  const rawResponse = await queryAICompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    true
  );

  const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = cleanOutput.indexOf('{');
  const lastBrace = cleanOutput.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('La respuesta de generación calibrada no contuvo un objeto JSON válido.');
  }

  const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonSnippet);
  } catch {
    let cleaned = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      cleaned = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        cleaned = cleaned.replace(/[\u0000-\u001F]+/g, (m) => m === '\n' ? '\\n' : m === '\t' ? '\\t' : '');
        parsed = JSON.parse(cleaned);
      }
    }
  }

  if (!parsed || !Array.isArray(parsed.preguntas) || parsed.preguntas.length === 0) {
    throw new Error('El modelo de IA no devolvió preguntas en el formato esperado.');
  }

  const defaultTopic = topicQuery.trim() || parsed.tema_calibrado || 'Calibración Personalizada';

  const mapped: Question[] = parsed.preguntas.map((p: any, idx: number) => {
    const detectedType = (p.tipo || p.type || '').toLowerCase();
    let templateSentence = p.oracion_plantilla || p.templateSentence || undefined;
    let blanksCorrect: string[] | undefined = Array.isArray(p.huecos_correctos)
      ? p.huecos_correctos.map((h: any) => String(h).trim())
      : (typeof p.huecos_correctos === 'string' && p.huecos_correctos.trim()
          ? p.huecos_correctos.split(',').map((h: string) => h.trim())
          : undefined);

    let wordBank: string[] | undefined = Array.isArray(p.banco_palabras)
      ? p.banco_palabras.map((w: any) => String(w).trim())
      : (typeof p.banco_palabras === 'string' && p.banco_palabras.trim()
          ? p.banco_palabras.split(',').map((w: string) => w.trim())
          : undefined);

    const hasPlaceholders = Boolean(
      (p.pregunta && /\{\d+\}/.test(p.pregunta)) ||
      (templateSentence && /\{\d+\}/.test(templateSentence))
    );

    let qType: Question['type'] = 'multiple-choice';

    if (detectedType.includes('matching') || (Array.isArray(p.pares_emparejamiento) && p.pares_emparejamiento.length >= 2)) {
      qType = 'matching';
    } else if (
      detectedType.includes('drag') ||
      detectedType.includes('blanks') ||
      detectedType.includes('huecos') ||
      detectedType.includes('completar') ||
      (templateSentence && blanksCorrect && blanksCorrect.length > 0) ||
      (hasPlaceholders && (blanksCorrect || wordBank || detectedType.includes('drag')))
    ) {
      qType = 'drag-drop';
    } else if (detectedType.includes('multi-select') || (Array.isArray(p.indices_correctos) && p.indices_correctos.length > 1)) {
      qType = 'multi-select';
    } else if (detectedType.includes('image') || detectedType.includes('labeling') || (Array.isArray(p.etiquetas_diagrama) && p.etiquetas_diagrama.length >= 1)) {
      qType = 'image-labeling';
    } else if (detectedType.includes('true-false') || detectedType.includes('verdadero')) {
      qType = 'true-false';
    } else {
      qType = 'multiple-choice';
    }

    const optsObj = p.opciones || {};
    const optionsArray: string[] = Array.isArray(p.opciones_multiples) && p.opciones_multiples.length > 0
      ? p.opciones_multiples.map((o: any) => String(o).trim())
      : [
          String(optsObj.A || optsObj['a'] || 'Opción A').trim(),
          String(optsObj.B || optsObj['b'] || 'Opción B').trim(),
          String(optsObj.C || optsObj['c'] || 'Opción C').trim(),
          String(optsObj.D || optsObj['d'] || 'Opción D').trim(),
        ];
    const correctIndex = parseCorrectIndex(p.respuesta_correcta, optionsArray, qType);

    let finalOptions = optionsArray;
    let finalCorrectIndex = correctIndex;
    if (qType === 'multiple-choice') {
      const balanced = shuffleOptionsWithEqualProbability(optionsArray, correctIndex);
      finalOptions = balanced.options;
      finalCorrectIndex = balanced.correctIndex;
    }

    let fullQuestion = String(p.pregunta || '').trim();
    const contexto = String(p.contexto_o_enunciado || '').trim();
    if (contexto && !fullQuestion.includes(contexto.slice(0, 20)) && p.longitud_enunciado !== 'corto') {
      fullQuestion = `${contexto}\n\n${fullQuestion}`;
    }

    // Normalización pedagógica para preguntas drag-drop
    if (qType === 'drag-drop') {
      if (!templateSentence && /\{\d+\}/.test(fullQuestion)) {
        templateSentence = fullQuestion;
      }
      if (/\{\d+\}/.test(fullQuestion)) {
        const topicLabel = p.concepto_evaluado ? ` sobre **${String(p.concepto_evaluado).trim()}**` : '';
        fullQuestion = `Completa los espacios en blanco${topicLabel} del siguiente enunciado:`;
      }
      if ((!blanksCorrect || blanksCorrect.length === 0) && templateSentence) {
        const slotMatches = templateSentence.match(/\{\d+\}/g);
        if (slotMatches && Array.isArray(p.opciones_multiples) && p.opciones_multiples.length >= slotMatches.length) {
          blanksCorrect = p.opciones_multiples.slice(0, slotMatches.length);
        }
      }
      const bankSet = new Set<string>(wordBank || []);
      if (blanksCorrect) {
        blanksCorrect.forEach(b => { if (b) bankSet.add(b); });
      }
      const distractorsPool = ['primario', 'secundario', 'crónico', 'agudo', 'sistémico', 'local', 'benigno', 'patológico'];
      for (const dist of distractorsPool) {
        if (bankSet.size >= (blanksCorrect?.length || 2) + 2) break;
        bankSet.add(dist);
      }
      wordBank = Array.from(bankSet).sort(() => Math.random() - 0.5);
    }

    const isCase = p.longitud_enunciado === 'medio_largo' || /\b(caso|supuesto|paciente|clínic|escenario)\b/i.test(fullQuestion);
    fullQuestion = enforceQuestionLengthLimit(fullQuestion, isCase);

    const retro = p.retroalimentacion || {};
    const explanationParts: string[] = [];
    if (retro.explicacion_logica) {
      explanationParts.push(String(retro.explicacion_logica).trim());
    }
    if (retro.referencia_al_texto) {
      explanationParts.push(`**Referencia en el texto:** "${String(retro.referencia_al_texto).trim()}"`);
    }
    if (retro.por_que_fallan_las_otras) {
      explanationParts.push(`**Discriminación de distractores:** ${String(retro.por_que_fallan_las_otras).trim()}`);
    }

    let sourceChunkId = p.chunk_id_origen || undefined;
    let sourceChunkText: string | undefined = undefined;
    let sourcePageOrSlide: number | undefined = undefined;

    if (chunks && chunks.length > 0) {
      let matchedChunk = chunks.find(c => c.id === p.chunk_id_origen);
      if (!matchedChunk) {
        matchedChunk = relevantChunks[idx % relevantChunks.length] || chunks[0];
      }
      if (matchedChunk) {
        sourceChunkId = matchedChunk.id;
        sourceChunkText = matchedChunk.text;
        sourcePageOrSlide = matchedChunk.pageOrSlide;
      }
    }

    const matchingPairs = Array.isArray(p.pares_emparejamiento)
      ? p.pares_emparejamiento.map((pair: any) => ({
          term: String(pair.termino || pair.term || 'Concepto').trim(),
          definition: String(pair.definicion || pair.definition || 'Definición').trim()
        }))
      : undefined;

    const correctIndices = Array.isArray(p.indices_correctos)
      ? parseCorrectIndices(p.indices_correctos, optionsArray)
      : undefined;

    const imageHotspots = Array.isArray(p.etiquetas_diagrama)
      ? p.etiquetas_diagrama.map((h: any, hIdx: number) => ({
          id: String(h.id || `pin-${hIdx + 1}`),
          label: String(h.etiqueta || h.label || `Etiqueta ${hIdx + 1}`).trim(),
          xPercent: Number(h.x_porcentaje || h.xPercent || 25 + (hIdx * 20)),
          yPercent: Number(h.y_porcentaje || h.yPercent || 30 + (hIdx * 15)),
          hint: h.pista || h.hint || `Punto ${hIdx + 1}`
        }))
      : undefined;

    const imageWordBank = Array.isArray(p.banco_etiquetas)
      ? p.banco_etiquetas.map((b: any) => String(b).trim())
      : (imageHotspots ? imageHotspots.map((h: any) => h.label) : undefined);

    const diagramTitle = p.titulo_diagrama || p.diagramTitle || undefined;

    return {
      id: `q-calibrated-lvl${level}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      type: qType,
      difficulty,
      topic: String(p.concepto_evaluado || defaultTopic).trim(),
      question: fullQuestion || 'Pregunta calibrada de alta exigencia.',
      options: qType === 'true-false' ? ['Verdadero', 'Falso'] : finalOptions,
      correctIndex: finalCorrectIndex,
      correctIndices,
      matchingPairs,
      templateSentence,
      blanksCorrect,
      wordBank,
      imageHotspots,
      imageWordBank,
      diagramTitle,
      explanation: explanationParts.join('\n\n') || 'Explicación fundamentada en el texto.',
      sourceChunkId,
      sourceChunkText,
      sourcePageOrSlide,
    };
  });

  return mapped;
}

export interface DocumentClassification {
  tema: string;
  materia: string;
  descripcion: string;
  palabrasClave: string[];
  icon: string;
  color: string;
}

export function getVisualsForMateria(materia: string): { icon: string; color: string } {
  const m = (materia || '').toLowerCase();

  if (m.includes('farma') || m.includes('medicament') || m.includes('terapéut')) {
    return { icon: 'Pill', color: 'from-emerald-500 to-teal-700' };
  }
  if (m.includes('médic') || m.includes('salud') || m.includes('clínic') || m.includes('patolog') || m.includes('cardiolog') || m.includes('pediatr') || m.includes('anatom')) {
    return { icon: 'Stethoscope', color: 'from-rose-500 to-red-700' };
  }
  if (m.includes('bioquím') || m.includes('genétic') || m.includes('adn') || m.includes('biolog') || m.includes('microbiolog')) {
    return { icon: 'Microscope', color: 'from-teal-500 to-emerald-700' };
  }
  if (m.includes('derecho') || m.includes('jurídic') || m.includes('ley') || m.includes('penal') || m.includes('civil') || m.includes('constitucion')) {
    return { icon: 'Scale', color: 'from-amber-600 to-yellow-800' };
  }
  if (m.includes('químic')) {
    return { icon: 'FlaskConical', color: 'from-cyan-500 to-blue-700' };
  }
  if (m.includes('físic') || m.includes('astronom')) {
    return { icon: 'Atom', color: 'from-indigo-500 to-purple-700' };
  }
  if (m.includes('software') || m.includes('comput') || m.includes('programac') || m.includes('sistemas') || m.includes('algoritm') || m.includes('informát') || m.includes('redes')) {
    return { icon: 'Binary', color: 'from-violet-600 to-indigo-800' };
  }
  if (m.includes('econom') || m.includes('finanz') || m.includes('contabil') || m.includes('comerc') || m.includes('negocio') || m.includes('administra')) {
    return { icon: 'TrendingUp', color: 'from-emerald-600 to-green-800' };
  }
  if (m.includes('psicolog') || m.includes('neuro') || m.includes('cognit') || m.includes('conduct')) {
    return { icon: 'Brain', color: 'from-purple-500 to-fuchsia-700' };
  }
  if (m.includes('historia') || m.includes('arqueolog') || m.includes('polític') || m.includes('sociolog')) {
    return { icon: 'Landmark', color: 'from-yellow-600 to-amber-700' };
  }
  if (m.includes('matemát') || m.includes('estadíst') || m.includes('álgebra') || m.includes('cálculo') || m.includes('geometr')) {
    return { icon: 'Calculator', color: 'from-orange-500 to-amber-600' };
  }
  if (m.includes('literatur') || m.includes('filosof') || m.includes('lingüíst') || m.includes('lengua') || m.includes('comunicac')) {
    return { icon: 'BookOpen', color: 'from-pink-500 to-rose-700' };
  }

  return { icon: 'GraduationCap', color: 'from-violet-500 to-purple-700' };
}

const classificationCache = new Map<string, DocumentClassification>();
const MAX_CLASSIFICATION_CACHE = 40;

/**
 * Clasifica automáticamente el contenido de un documento mediante IA:
 * Extrae la materia específica (ej: Farmacología, Derecho Penal, Bioquímica)
 * y el tema académico representativo en base al contenido real.
 */
export async function classifyDocumentWithAI(
  rawText: string,
  chunks?: DocumentChunk[]
): Promise<DocumentClassification> {
  const settings = getAISettings();
  if (!settings.enabled) {
    const fallbackMateria = 'General';
    const visuals = getVisualsForMateria(fallbackMateria);
    return {
      tema: rawText.split('\n')[0]?.slice(0, 50) || 'Material de Estudio',
      materia: fallbackMateria,
      descripcion: 'Material de estudio analizado.',
      palabrasClave: [],
      icon: visuals.icon,
      color: visuals.color,
    };
  }

  let sampleText = '';
  if (chunks && chunks.length > 0) {
    sampleText = chunks.slice(0, 8).map(c => c.text).join('\n\n').slice(0, 5000);
  } else {
    sampleText = rawText.slice(0, 5000);
  }

  const cacheKey = `${sampleText.length}:${sampleText.slice(0, 120)}:${sampleText.slice(-120)}`;
  const cached = classificationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const systemPrompt = `Eres el clasificador académico experto de Contrareloj Study.
Tu objetivo es analizar el contenido de un documento educativo y clasificarlo con alta precisión académica.

DEBES IDENTIFICAR:
1. "tema": El título o tema central real del documento (de 3 a 8 palabras). Debe ser concreto, académico y descriptivo del contenido (ej: "Mecanismo de Acción de Betalactámicos y Resistencia", "Teoría del Delito y Culpabilidad Penal", "Ciclo de Krebs y Fosforilación Oxidativa"). NO uses nombres de archivo ni palabras vacías como "Documento", "Apuntes" o "PDF".
2. "materia": La materia o disciplina académica específica a la que pertenece (ej: "Farmacología", "Derecho Penal", "Bioquímica", "Fisiología Médica", "Ingeniería de Software", "Economía Internacional", "Microbiología", "Física Cuántica"). Sé específico con la disciplina exacta.
3. "descripcion": Una síntesis académica en 1 o 2 oraciones concisas que explique qué abarca el material y qué se aprenderá.
4. "palabras_clave": Una lista de 3 a 5 conceptos nucleares o palabras clave más relevantes del texto.

FORMATO DE SALIDA (EXCLUSIVAMENTE OBJETO JSON VÁLIDO):
{
  "tema": "Tema concreto y académico del texto",
  "materia": "Materia o disciplina académica específica",
  "descripcion": "Descripción concisa en 1-2 líneas del contenido educativo.",
  "palabras_clave": ["concepto1", "concepto2", "concepto3"]
}`;

  const userPrompt = `Analiza este fragmento del documento y clasifícalo en formato JSON:
${sampleText}`;

  try {
    const rawResponse = await queryAICompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      true
    );

    const cleanOutput = rawResponse.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = cleanOutput.indexOf('{');
    const lastBrace = cleanOutput.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('No se detectó JSON válido en la clasificación.');
    }

    const jsonSnippet = cleanOutput.substring(firstBrace, lastBrace + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonSnippet);
    } catch {
      const sanitized = jsonSnippet.replace(/,\s*([}\]])/g, '$1');
      parsed = JSON.parse(sanitized);
    }

    const tema = String(parsed.tema || '').trim() || 'Material de Estudio';
    const materia = String(parsed.materia || '').trim() || 'General';
    const descripcion = String(parsed.descripcion || '').trim() || `Study Kit de ${materia} sobre ${tema}.`;
    const palabrasClave = Array.isArray(parsed.palabras_clave) ? parsed.palabras_clave.map(String) : [];
    const visuals = getVisualsForMateria(materia);

    const result: DocumentClassification = {
      tema,
      materia,
      descripcion,
      palabrasClave,
      icon: visuals.icon,
      color: visuals.color,
    };

    if (classificationCache.size >= MAX_CLASSIFICATION_CACHE) {
      const oldestKey = classificationCache.keys().next().value;
      if (oldestKey) classificationCache.delete(oldestKey);
    }
    classificationCache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.warn('[classifyDocumentWithAI] Fallback de clasificación:', err);
    const fallbackMateria = 'General';
    const visuals = getVisualsForMateria(fallbackMateria);
    return {
      tema: rawText.split('\n')[0]?.slice(0, 50) || 'Material de Estudio',
      materia: fallbackMateria,
      descripcion: 'Material de estudio analizado.',
      palabrasClave: [],
      icon: visuals.icon,
      color: visuals.color,
    };
  }
}



