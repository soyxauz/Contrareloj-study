import type { Question } from '../types';
import { normalizeTopicKey } from './socraticEngine';

// Conjunto exhaustivo de palabras vacías (stopwords) en español y términos genéricos de preguntas
const SPANISH_STOPWORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'o',
  'este', 'si', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'tambien',
  'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos',
  'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto',
  'mi', 'antes', 'algunos', 'unos', 'yo', 'otro', 'otras', 'otra', 'tanto',
  'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'sea', 'poco', 'ella',
  'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mis', 'tu', 'te', 'ti',
  'tus', 'ellas', 'nosotras', 'vosotros', 'vosotras', 'os', 'mio', 'mia', 'mios',
  'mias', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos', 'suyas', 'nuestro',
  'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras',
  // Palabras genéricas de exámenes y preguntas:
  'cuales', 'siguiente', 'siguientes', 'afirmacion', 'afirmaciones', 'correcta',
  'incorrecta', 'correctas', 'incorrectas', 'enunciado', 'enunciados', 'indica', 'senala',
  'marca', 'selecciona', 'respecto', 'acerca', 'funcion', 'proceso', 'principal', 'explica',
  'paciente', 'presenta', 'cuadro', 'caso', 'clinico', 'opcion', 'alternativa', 'falso',
  'verdadero', 'excepto', 'mejor', 'cada', 'segun', 'muestra', 'debido', 'asociado',
  'completa', 'espacios', 'blanco', 'termino', 'definicion', 'relacionado', 'pregunta'
]);

export interface QuestionSignature {
  id: string;
  topic: string;
  subtopic: string;
  stemTokens: Set<string>;
  allTokens: Set<string>;
}

/**
 * Normaliza y tokeniza un texto eliminando acentos, puntuación y stopwords.
 */
export function extractCleanTokens(text?: string, extraStopwords: Set<string> = new Set()): Set<string> {
  if (!text) return new Set();
  const normalized = normalizeTopicKey(text);
  const rawWords = normalized.split(/\s+/);
  const result = new Set<string>();

  for (const w of rawWords) {
    if (w.length < 3) continue; // Descartar palabras muy cortas
    if (SPANISH_STOPWORDS.has(w)) continue;
    if (extraStopwords.has(w)) continue;
    result.add(w);
  }

  return result;
}

/**
 * Extrae las palabras clave del título del kit para evitar que el tema global
 * contamine la distinción entre subtemas específicos.
 */
export function extractKitContextStopwords(kitTitle?: string): Set<string> {
  if (!kitTitle) return new Set();
  const tokens = extractCleanTokens(kitTitle);
  return tokens;
}

/**
 * Extrae los tokens nucleares del enunciado (stem) de la pregunta.
 * Estos tokens definen directamente la intención cognitiva y el subtema específico evaluado.
 */
export function extractQuestionStemTokens(q: Question, kitTitle?: string): Set<string> {
  const kitStopwords = extractKitContextStopwords(kitTitle);
  const stemText = `${q.topic || ''} ${q.question || ''}`;
  return extractCleanTokens(stemText, kitStopwords);
}

/**
 * Extrae la huella conceptual semántica completa de una pregunta.
 */
export function extractQuestionSemanticTokens(q: Question, kitTitle?: string): Set<string> {
  const kitStopwords = extractKitContextStopwords(kitTitle);
  const tokens = new Set<string>();

  // 1. Extraer del tema y enunciado
  const stemTokens = extractQuestionStemTokens(q, kitTitle);
  stemTokens.forEach(t => tokens.add(t));

  // 2. Extraer de las opciones
  if (Array.isArray(q.options)) {
    for (const opt of q.options) {
      if (typeof opt === 'string') {
        const optTokens = extractCleanTokens(opt, kitStopwords);
        optTokens.forEach(t => tokens.add(t));
      }
    }
  }

  // 3. Extraer de la justificación / explicación
  if (q.explanation) {
    const expTokens = extractCleanTokens(q.explanation, kitStopwords);
    expTokens.forEach(t => tokens.add(t));
  }

  return tokens;
}

/**
 * Deduce un subtema granular limpio, elegante y representativo para la pregunta.
 * Si q.topic es genérico o replica el título del kit, extrae el núcleo conceptual del enunciado.
 */
export function deriveGranularSubtopic(q: Question, kitTitle?: string): string {
  const rawTopic = (q.topic || '').trim();
  const normKit = normalizeTopicKey(kitTitle);
  const normTopic = normalizeTopicKey(rawTopic);

  // Comprobar coincidencia léxica entre el tema y el título global del kit
  let isKitTitleSubset = false;
  if (normKit && normTopic) {
    const kitWords = new Set(normKit.split(/\s+/).filter(w => w.length > 2));
    const topicWords = normTopic.split(/\s+/).filter(w => w.length > 2);
    if (topicWords.length > 0) {
      const matchCount = topicWords.filter(w => kitWords.has(w)).length;
      if (matchCount / topicWords.length >= 0.5) {
        isKitTitleSubset = true;
      }
    }
  }

  const isGeneric = !rawTopic ||
    isKitTitleSubset ||
    normTopic === normKit ||
    normTopic === 'general' ||
    normTopic === 'conceptos clave' ||
    normTopic === 'conceptos fundamentales' ||
    normTopic === 'fundamentos';

  if (!isGeneric && rawTopic.length >= 4) {
    // Si viene con formato "Tema: Subtema" o "2.3 Subtema", limpiar prefijos numéricos
    const cleaned = rawTopic.replace(/^\d+(\.\d+)*\s*[-–—:]*\s*/, '').trim();
    if (cleaned.length >= 4) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return rawTopic;
  }

  // Si es genérico, clasificar mediante patrones académicos en el enunciado:
  const fullText = `${q.question || ''} ${q.explanation || ''}`.toLowerCase();

  if (/fisiopatol|patogen|hipergluc|resistencia\s+a\s+la\s+insulina|secrecion\s+pancreatica|celulas\s+beta/.test(fullText)) {
    return 'Fisiopatología & Patogénesis';
  }
  if (/metformin|biguanid|ampk|gluconeogenesis|lactica/.test(fullText)) {
    return 'Farmacología: Metformina (Biguanidas)';
  }
  if (/sulfonilurea|glibenclamid|glimepirid|glinida|sur-1|secretagogo/.test(fullText)) {
    return 'Farmacología: Secretagogos de Insulina';
  }
  if (/sglt-2|sglt2|glucosuria|empagliflozina|dapagliflozina/.test(fullText)) {
    return 'Farmacología: Inhibidores SGLT-2';
  }
  if (/glp-1|glp1|incretin|liraglutida|semaglutida|dpp-4|dpp4/.test(fullText)) {
    return 'Farmacología: Vía de Incretinas';
  }
  if (/prevencion|factores\s+de\s+riesgo|sedentarismo|obesidad|estilo\s+de\s+vida|dieta/.test(fullText)) {
    return 'Prevención & Factores de Riesgo';
  }
  if (/diagnostico|criterios|hba1c|hemoglobina\s+glicosilada|curva\s+de\s+tolerancia|glucosa\s+en\s+ayunas/.test(fullText)) {
    return 'Criterios Diagnósticos & Laboratorio';
  }
  if (/complicacion|retinopat|nefropat|neuropat|pie\s+diabetico|microangiopat|macroangiopat/.test(fullText)) {
    return 'Complicaciones Crónicas';
  }
  if (/cetoacidosis|estado\s+hiperosmolar|crisis\s+hiperglucemica/.test(fullText)) {
    return 'Complicaciones Agudas';
  }

  // Si ningún patrón predefinido coincide, inferir a partir de los tokens nucleares del enunciado
  const stemTokens = Array.from(extractQuestionStemTokens(q, kitTitle));
  if (stemTokens.length >= 2) {
    const w1 = stemTokens[0].charAt(0).toUpperCase() + stemTokens[0].slice(1);
    const w2 = stemTokens[1].charAt(0).toUpperCase() + stemTokens[1].slice(1);
    return `${w1} & ${w2}`;
  } else if (stemTokens.length === 1) {
    return stemTokens[0].charAt(0).toUpperCase() + stemTokens[0].slice(1);
  }

  return kitTitle ? kitTitle.trim() : 'Conceptos Clave';
}

/**
 * Calcula la similitud semántica (coeficiente de Jaccard) entre dos conjuntos de tokens conceptuales.
 */
export function computeSemanticSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) shared++;
  }
  const total = tokensA.size + tokensB.size - shared;
  return total > 0 ? shared / total : 0;
}

/**
 * Cuenta cuántos tokens conceptuales clave comparten dos preguntas.
 */
export function countSharedTokens(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) shared++;
  }
  return shared;
}

/**
 * Calcula la penalización de intercalado (Interleaving Penalty) para una pregunta candidata
 * evaluada contra la ventana deslizante reciente de preguntas.
 * 
 * Reglas:
 * 1. Coincidencia de subtema: Penalización muy alta (25 pts * factor de cercanía temporal).
 * 2. Similitud semántica en el Stem (enunciado): Penalización fuerte (tokens nucleares).
 * 3. Factor de decaimiento temporal:
 *    - Pregunta inmediata anterior (distancia 1): peso 1.0 (máxima penalización).
 *    - Distancia 2: peso 0.8
 *    - Distancia 3: peso 0.6
 *    - Distancia 4: peso 0.4
 *    - Distancia 5: peso 0.2
 * 
 * Un puntaje de 0 significa que la pregunta candidata pertenece a un subtema y concepto 100% fresco.
 */
export function calculateInterleavingPenalty(
  _candidate: Question,
  candidateStemTokens: Set<string>,
  candidateAllTokens: Set<string>,
  candidateSubtopic: string,
  recentHistory: QuestionSignature[],
  windowSize: number = 5
): number {
  if (!recentHistory || recentHistory.length === 0) return 0;

  let totalPenalty = 0;
  const recentWindow = recentHistory.slice(-windowSize).reverse(); // Orden: [última pregunta, penúltima, ...]
  const normCandidateSubtopic = normalizeTopicKey(candidateSubtopic);

  recentWindow.forEach((recent, index) => {
    const distance = index + 1; // 1 = pregunta anterior, 2 = hace dos preguntas, etc.
    const recencyWeight = Math.max(0.2, 1.2 - (distance * 0.2));

    // 1. Penalización estricta por mismo subtema derivado
    const normRecentSubtopic = normalizeTopicKey(recent.subtopic || recent.topic);
    if (normCandidateSubtopic && normRecentSubtopic) {
      if (normCandidateSubtopic === normRecentSubtopic) {
        totalPenalty += 25.0 * recencyWeight;
      } else if (
        (normCandidateSubtopic.length >= 6 && normRecentSubtopic.includes(normCandidateSubtopic)) ||
        (normRecentSubtopic.length >= 6 && normCandidateSubtopic.includes(normRecentSubtopic))
      ) {
        totalPenalty += 15.0 * recencyWeight;
      }
    }

    // 2. Penalización por tokens nucleares del enunciado (Stem tokens)
    const sharedStemCount = countSharedTokens(candidateStemTokens, recent.stemTokens);
    if (sharedStemCount >= 2) {
      totalPenalty += (sharedStemCount * 6.0) * recencyWeight;
    } else if (sharedStemCount === 1) {
      totalPenalty += 3.0 * recencyWeight;
    }

    // 3. Penalización secundaria por tokens globales (opciones/explicación)
    const sharedAllCount = countSharedTokens(candidateAllTokens, recent.allTokens);
    const jaccard = computeSemanticSimilarity(candidateAllTokens, recent.allTokens);
    if (jaccard >= 0.35) {
      totalPenalty += (sharedAllCount * 1.5 + jaccard * 5.0) * recencyWeight;
    }
  });

  return totalPenalty;
}

/**
 * Comprueba si una pregunta está en "enfriamiento temático" (Cooldown Window)
 * respecto a las últimas `minDistance` preguntas.
 */
export function isQuestionThematicallyRecent(
  candidate: Question,
  candidateStemTokens: Set<string>,
  candidateAllTokens: Set<string>,
  candidateSubtopic: string,
  recentHistory: QuestionSignature[],
  minDistance: number = 4
): boolean {
  if (!recentHistory || recentHistory.length === 0) return false;
  const penalty = calculateInterleavingPenalty(
    candidate,
    candidateStemTokens,
    candidateAllTokens,
    candidateSubtopic,
    recentHistory,
    minDistance
  );
  // Un penalty >= 10.0 indica que pertenece al mismo subtema o tiene alta concentración temática
  return penalty >= 10.0;
}
