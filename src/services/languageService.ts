/**
 * Language detection and translation directives service for Contrareloj Study.
 * Automatically identifies foreign language source documents and provides
 * academic translation directives so that all generated kits, questions,
 * flashcards, study guides, and podcasts are strictly in Spanish.
 */

const SPANISH_STOPWORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'se', 'del', 'las', 'por', 'un', 'para', 'con', 'no',
  'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'fue', 'este', 'ha', 'sí',
  'porque', 'esta', 'son', 'entre', 'está', 'cuando', 'muy', 'sin', 'sobre', 'ser', 'tiene', 'también',
  'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni',
  'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'esto', 'antes', 'algunos', 'qué', 'unos', 'otro',
  'otras', 'otra', 'él', 'tanto', 'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'sea',
  'poco', 'ella', 'mayor', 'mucha', 'dicho', 'cada', 'estos', 'estas'
]);

const ENGLISH_STOPWORDS = new Set([
  'the', 'of', 'and', 'a', 'to', 'in', 'is', 'you', 'that', 'it', 'he', 'was', 'for', 'on', 'are', 'as',
  'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but',
  'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each',
  'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then',
  'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look',
  'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first',
  'water', 'been', 'call', 'who', 'its', 'now', 'find', 'between', 'should', 'after', 'also', 'through'
]);

const PORTUGUESE_STOPWORDS = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no',
  'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu',
  'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela',
  'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas'
]);

const FRENCH_STOPWORDS = new Set([
  'de', 'la', 'le', 'et', 'les', 'des', 'en', 'un', 'du', 'une', 'que', 'est', 'pour', 'qui', 'dans',
  'par', 'sur', 'pas', 'plus', 'au', 'avec', 'ce', 'son', 'sont', 'se', 'ou', 'il', 'ont', 'sa', 'mais',
  'nous', 'vous', 'aux', 'ne', 'faire', 'ces', 'même', 'leur', 'elle', 'tout', 'ses', 'aussi', 'été',
  'comme', 'cette', 'bien', 'où', 'après', 'sans'
]);

const GERMAN_STOPWORDS = new Set([
  'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist',
  'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass',
  'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über', 'einen'
]);

export interface LanguageDetectionResult {
  isSpanish: boolean;
  detectedLanguage: string;
  confidence: number;
  isForeign: boolean;
}

/**
 * Detecta con alta velocidad y precisión si el texto del documento está en español
 * o en un idioma extranjero (inglés, portugués, francés, alemán, etc.).
 */
export function detectDocumentLanguage(text: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      isSpanish: true,
      detectedLanguage: 'Español',
      confidence: 1,
      isForeign: false,
    };
  }

  // Analizar muestra representativa (hasta 5000 caracteres)
  const sample = text.slice(0, 5000).toLowerCase();
  const words = sample.match(/[a-záéíóúüñàèìòùâêîôûãõçäëïöü]+/g) || [];

  if (words.length < 15) {
    return {
      isSpanish: true,
      detectedLanguage: 'Español',
      confidence: 0.8,
      isForeign: false,
    };
  }

  let esScore = 0;
  let enScore = 0;
  let ptScore = 0;
  let frScore = 0;
  let deScore = 0;

  for (const w of words) {
    if (SPANISH_STOPWORDS.has(w)) esScore++;
    if (ENGLISH_STOPWORDS.has(w)) enScore++;
    if (PORTUGUESE_STOPWORDS.has(w)) ptScore++;
    if (FRENCH_STOPWORDS.has(w)) frScore++;
    if (GERMAN_STOPWORDS.has(w)) deScore++;
  }

  const scores = [
    { lang: 'Español', score: esScore, isSpanish: true },
    { lang: 'Inglés', score: enScore, isSpanish: false },
    { lang: 'Portugués', score: ptScore, isSpanish: false },
    { lang: 'Francés', score: frScore, isSpanish: false },
    { lang: 'Alemán', score: deScore, isSpanish: false },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const totalScore = esScore + enScore + ptScore + frScore + deScore;

  // Si no hay palabras funcionales reconocidas
  if (totalScore === 0) {
    return {
      isSpanish: true,
      detectedLanguage: 'Español',
      confidence: 0.5,
      isForeign: false,
    };
  }

  // Si el español tiene una presencia dominante (mayor o igual al 40% del total de stopwords)
  if (esScore >= enScore && esScore >= ptScore && esScore >= frScore && esScore >= deScore) {
    return {
      isSpanish: true,
      detectedLanguage: 'Español',
      confidence: Math.round((esScore / totalScore) * 100) / 100,
      isForeign: false,
    };
  }

  // Idioma extranjero dominante detectado
  const confidence = Math.round((best.score / totalScore) * 100) / 100;
  return {
    isSpanish: false,
    detectedLanguage: best.lang,
    confidence,
    isForeign: true,
  };
}

/**
 * Devuelve la directriz estricta de traducción y adaptación que se inyecta en los
 * prompts del sistema de IA para asegurar que la salida sea 100% en español académico.
 */
export function getSpanishTranslationDirective(detectedLang?: string): string {
  const langNotice = detectedLang && detectedLang !== 'Español'
    ? `(Texto fuente detectado en: ${detectedLang})`
    : '';

  return `
SISTEMA DE TRADUCCIÓN ACADÉMICA Y ADAPTACIÓN AL ESPAÑOL (OBLIGATORIA) ${langNotice}:
1. Si el material o texto fuente analizado está redactado en inglés, portugués, francés, alemán u otro idioma extranjero, TIENES LA INSTRUCCIÓN ESTRICTA Y OBLIGATORIA de traducir conceptualmente todo el contenido al ESPAÑOL académico impecable.
2. ABSOLUTAMENTE TODAS las salidas generadas (títulos, materias, preguntas, opciones A, B, C, D, explicaciones pedagógicas, flashcards, guías de estudio, esquemas y diálogos) DEBEN formularse 100% EN ESPAÑOL.
3. Está TERMINANTEMENTE PROHIBIDO generar preguntas, opciones o explicaciones en el idioma extranjero original.
4. Conserva únicamente siglas técnicas internacionales estándar (ej. ADN, ARN, ATP, HTTP, TCP/IP, ECG, triage, etc.) o nombres propios sin traducción convencional.
`;
}
