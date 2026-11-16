import type { DocumentChunk } from '../types';

/**
 * Motor de Extracción RAG de Alta Precisión
 * Identifica, puntúa y extrae la oración o pasaje exacto del documento fuente que fundamenta
 * de manera textual y específica la pregunta y su respuesta correcta.
 */

const ABBREVIATION_PLACEHOLDERS: [RegExp, string, string][] = [
  [/p\.\s*ej\./gi, '__PEJ__', 'p. ej.'],
  [/ej\./gi, '__EJ__', 'ej.'],
  [/vs\./gi, '__VS__', 'vs.'],
  [/art\./gi, '__ART__', 'art.'],
  [/n[úu]m\./gi, '__NUM__', 'núm.'],
  [/p[áa]g\./gi, '__PAG__', 'pág.'],
  [/dr\./gi, '__DR__', 'dr.'],
  [/dra\./gi, '__DRA__', 'dra.'],
  [/sr\./gi, '__SR__', 'sr.'],
  [/sra\./gi, '__SRA__', 'sra.'],
  [/fig\./gi, '__FIG__', 'fig.'],
  [/tab\./gi, '__TAB__', 'tab.'],
  [/aprox\./gi, '__APROX__', 'aprox.'],
  [/(\d+)\.(\d+)/g, '$1__DOT__$2', '.'], // Decimales como 3.14
];

const SPANISH_STOPWORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o',
  'fue', 'este', 'ha', 'sí', 'porque', 'esta', 'son', 'entre', 'está', 'cuando', 'muy',
  'sin', 'sobre', 'ser', 'tiene', 'también', 'me', 'hasta', 'hay', 'donde', 'quien',
  'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros',
  'ese', 'eso', 'ante', 'ellos', 'esto', 'mí', 'antes', 'algunos', 'qué', 'cuál', 'cuáles',
  'cómo', 'cuándo', 'dónde', 'quién', 'quiénes', 'the', 'of', 'and', 'in', 'to', 'a',
  'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'at', 'by', 'this', 'be', 'from',
  'or', 'an', 'cual', 'cuales', 'indica', 'senala', 'selecciona', 'opcion', 'opciones',
  'siguiente', 'siguientes', 'respecto', 'relacion', 'afirmacion', 'enunciado', 'pregunta'
]);

/**
 * Normaliza y divide un fragmento documental en oraciones coherentes preservando abreviaturas
 */
export function splitDocumentIntoSentences(text: string): string[] {
  if (!text) return [];

  let protectedText = text;
  for (const [pattern, placeholder] of ABBREVIATION_PLACEHOLDERS) {
    protectedText = protectedText.replace(pattern, placeholder);
  }

  // Segmentar por fin de oración (. ! ? o saltos de línea dobles)
  const rawSegments = protectedText
    .split(/(?:(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚÑ"«0-9])|\n\s*\n|\r\n\s*\r\n)/)
    .map(s => s.trim())
    .filter(Boolean);

  const restored: string[] = [];
  for (const segment of rawSegments) {
    let clean = segment;
    for (const [, placeholder, original] of ABBREVIATION_PLACEHOLDERS) {
      if (placeholder === '$1__DOT__$2') {
        clean = clean.replace(/__DOT__/g, '.');
      } else {
        clean = clean.split(placeholder).join(original);
      }
    }
    // Normalizar espacios internos
    clean = clean.replace(/\s+/g, ' ').trim();
    if (clean.length >= 8) {
      restored.push(clean);
    }
  }

  // Si no se detectaron oraciones bien formadas, devolver líneas no vacías
  if (restored.length === 0) {
    return text.split(/\n+/).map(s => s.trim()).filter(s => s.length >= 8);
  }

  return restored;
}

/**
 * Extrae tokens sustantivos sin acentos ni stopwords
 */
export function extractMeaningfulTokens(text: string): Set<string> {
  if (!text) return new Set();

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[^a-z0-9áéíóúñ\s-]/g, ' ');

  const words = normalized
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !SPANISH_STOPWORDS.has(w));

  return new Set(words);
}

export interface SpecificPassageResult {
  excerpt: string;
  highlightedExcerpt: string;
  score: number;
  matchQuality: 'high' | 'medium' | 'low';
  sentenceIndices: number[];
  allSentences: string[];
  bestSentenceIndex: number;
}

/**
 * Puntúa una oración individual contra las señales cognitivas de la pregunta y la respuesta
 */
function scoreSentence(
  sentence: string,
  queryTokens: Set<string>,
  answerTokens: Set<string>,
  conceptTokens: Set<string>,
  cleanAnswerText: string,
  cleanQuestionText: string = ''
): number {
  const sentenceTokens = extractMeaningfulTokens(sentence);
  if (sentenceTokens.size === 0) return 0;

  let score = 0;

  // 1. Coincidencia con tokens de la respuesta correcta (prioridad máxima: peso 3.0)
  for (const t of answerTokens) {
    if (sentenceTokens.has(t)) {
      score += t.length >= 6 ? 4.0 : 3.0; // Bonus a términos médicos/técnicos largos
    }
  }

  // 2. Coincidencia con el concepto evaluado (peso 2.0)
  for (const t of conceptTokens) {
    if (sentenceTokens.has(t)) {
      score += t.length >= 6 ? 3.0 : 2.0;
    }
  }

  // 3. Coincidencia con la pregunta (peso 1.5)
  for (const t of queryTokens) {
    if (sentenceTokens.has(t)) {
      score += t.length >= 6 ? 2.5 : 1.5;
    }
  }

  // 4. Bonus de frase literal continua si contiene fragmentos de 3 o más palabras de la respuesta
  if (cleanAnswerText && cleanAnswerText.length >= 8) {
    const normSentence = sentence.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normAnswer = cleanAnswerText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (normSentence.includes(normAnswer.slice(0, 30))) {
      score += 20.0; // Bonificación decisiva si contiene el cuerpo de la respuesta correcta
    } else {
      // Subcadenas de 3 palabras contiguas
      const ansWords = normAnswer.split(/\s+/).filter(w => w.length >= 3);
      for (let i = 0; i < ansWords.length - 2; i++) {
        const trigram = `${ansWords[i]} ${ansWords[i+1]} ${ansWords[i+2]}`;
        if (normSentence.includes(trigram)) {
          score += 6.0;
        }
      }
    }
  }

  // 5. Bonus de frase literal de la pregunta (si contiene trigramas clave del enunciado)
  if (cleanQuestionText && cleanQuestionText.length >= 10) {
    const normSentence = sentence.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normQuery = cleanQuestionText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qWords = normQuery.split(/\s+/).filter(w => w.length >= 3 && !SPANISH_STOPWORDS.has(w));
    for (let i = 0; i < qWords.length - 1; i++) {
      const bigram = `${qWords[i]} ${qWords[i+1]}`;
      if (normSentence.includes(bigram)) {
        score += 3.5;
      }
    }
  }

  // Normalización suave para evitar sesgo extremo por longitud desmedida
  const lengthDampener = Math.min(1.2, Math.max(0.7, 40 / Math.max(1, sentenceTokens.size)));
  return score * lengthDampener;
}

/**
 * Extrae la cita o pasaje textual exacto (1 a 3 oraciones contiguas) más representativo
 * resaltando en negrita la zona nuclear exacta que fundamenta la pregunta.
 */
export function extractSpecificPassage(params: {
  fullText: string;
  question: string;
  correctAnswer?: string;
  concept?: string;
  explanation?: string;
}): SpecificPassageResult {
  const { fullText, question, correctAnswer = '', concept = '' } = params;

  const sentences = splitDocumentIntoSentences(fullText);
  if (sentences.length === 0) {
    const fallback = fullText.slice(0, 300).trim();
    return {
      excerpt: fallback,
      highlightedExcerpt: fallback ? `**${fallback}**` : '',
      score: 0,
      matchQuality: 'low',
      sentenceIndices: [],
      allSentences: [],
      bestSentenceIndex: -1,
    };
  }

  const queryTokens = extractMeaningfulTokens(question);
  const answerTokens = extractMeaningfulTokens(correctAnswer);
  const conceptTokens = extractMeaningfulTokens(concept);

  const scores = sentences.map(s =>
    scoreSentence(s, queryTokens, answerTokens, conceptTokens, correctAnswer, question)
  );

  let bestIdx = 0;
  let maxScore = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > maxScore) {
      maxScore = scores[i];
      bestIdx = i;
    }
  }

  // Construir una ventana coherente de 1 a 3 oraciones contiguas
  const selectedIndices = [bestIdx];

  // Evaluar oración anterior si aporta contexto o continuidad
  if (bestIdx > 0 && scores[bestIdx - 1] > 2.0 && sentences[bestIdx - 1].length < 180) {
    selectedIndices.unshift(bestIdx - 1);
  }

  // Evaluar oración siguiente si aporta datos complementarios
  if (bestIdx < sentences.length - 1 && scores[bestIdx + 1] > 2.0 && selectedIndices.length < 3) {
    selectedIndices.push(bestIdx + 1);
  }

  const rawExcerpt = selectedIndices.map(i => sentences[i]).join(' ');

  // Determinar calidad del emparejamiento
  const matchQuality: 'high' | 'medium' | 'low' =
    maxScore >= 8 ? 'high' : maxScore >= 3.5 ? 'medium' : 'low';

  // Resaltado de la zona clave en negrita (**oración**):
  // La oración con mayor puntuación (bestIdx) es la zona exacta que responde y fundamenta la pregunta.
  // Se formatea en negrita (**...**) mientras las oraciones adyacentes sirven de contexto natural no resaltado.
  const highlightedParts: string[] = [];
  for (const idx of selectedIndices) {
    const cleanSentence = sentences[idx].replace(/\*\*/g, '').trim();
    if (idx === bestIdx || (scores[idx] >= 8.0 && scores[idx] >= maxScore * 0.8)) {
      highlightedParts.push(`**${cleanSentence}**`);
    } else {
      highlightedParts.push(cleanSentence);
    }
  }
  const highlightedExcerpt = highlightedParts.join(' ');

  return {
    excerpt: rawExcerpt,
    highlightedExcerpt,
    score: maxScore,
    matchQuality,
    sentenceIndices: selectedIndices,
    allSentences: sentences,
    bestSentenceIndex: bestIdx,
  };
}

/**
 * Escanea la totalidad de fragmentos del kit para hallar aquel con mayor anclaje textual directo
 */
export function findBestChunkAndExcerpt(params: {
  chunks: DocumentChunk[];
  question: string;
  correctAnswer?: string;
  concept?: string;
  preferredChunkId?: string;
}): { bestChunk: DocumentChunk | null; passage: SpecificPassageResult } {
  const { chunks, question, correctAnswer = '', concept = '', preferredChunkId } = params;

  if (!chunks || chunks.length === 0) {
    const emptyResult = extractSpecificPassage({
      fullText: '',
      question,
      correctAnswer,
      concept,
    });
    return { bestChunk: null, passage: emptyResult };
  }

  // 1. Evaluar chunk preferido si existe
  let preferredChunk = preferredChunkId ? chunks.find(c => c.id === preferredChunkId) : null;
  let preferredPassage: SpecificPassageResult | null = null;

  if (preferredChunk) {
    preferredPassage = extractSpecificPassage({
      fullText: preferredChunk.text,
      question,
      correctAnswer,
      concept,
    });
  }

  // 2. Escanear todos los fragmentos exhaustivamente para garantizar que NUNCA se elija
  // un chunk erróneo solo porque el preferido tuvo una coincidencia débil o marginal
  let topChunk: DocumentChunk = preferredChunk || chunks[0];
  let topPassage: SpecificPassageResult = preferredPassage || extractSpecificPassage({
    fullText: topChunk.text,
    question,
    correctAnswer,
    concept,
  });

  for (const chunk of chunks) {
    if (preferredChunk && chunk.id === preferredChunk.id) continue;

    const candidatePassage = extractSpecificPassage({
      fullText: chunk.text,
      question,
      correctAnswer,
      concept,
    });

    if (candidatePassage.score > topPassage.score) {
      topPassage = candidatePassage;
      topChunk = chunk;
      // Solo terminar anticipadamente si encontramos una coincidencia casi perfecta
      if (topPassage.score >= 35.0) break;
    }
  }

  return { bestChunk: topChunk, passage: topPassage };
}

/**
 * Normaliza y busca la posición aproximada de un extracto dentro de un texto más amplio
 */
export function findNormalizedSubstringIndex(haystack: string, needle: string): number {
  if (!haystack || !needle) return -1;
  const directIdx = haystack.indexOf(needle);
  if (directIdx !== -1) return directIdx;

  // Normalizar secuencias de espacios en blanco
  const cleanNeedle = needle.replace(/\*\*/g, '').trim();
  const normHaystack = haystack.toLowerCase().replace(/\s+/g, ' ');
  const normNeedle = cleanNeedle.toLowerCase().replace(/\s+/g, ' ').trim();
  const normIdx = normHaystack.indexOf(normNeedle);
  if (normIdx !== -1) {
    const ratio = haystack.length / Math.max(1, normHaystack.length);
    return Math.floor(normIdx * ratio);
  }

  // Probar con los primeros 35 caracteres limpios
  const prefix = normNeedle.slice(0, 35).trim();
  if (prefix.length >= 12) {
    const prefixIdx = normHaystack.indexOf(prefix);
    if (prefixIdx !== -1) {
      const ratio = haystack.length / Math.max(1, normHaystack.length);
      return Math.floor(prefixIdx * ratio);
    }
  }

  // Probar con las primeras palabras significativas de más de 4 letras
  const words = normNeedle.split(/\s+/).filter(w => w.length >= 4).slice(0, 3);
  if (words.length >= 2) {
    const phrase = words.join(' ');
    const phraseIdx = normHaystack.indexOf(phrase);
    if (phraseIdx !== -1) {
      const ratio = haystack.length / Math.max(1, normHaystack.length);
      return Math.floor(phraseIdx * ratio);
    }
  }

  return -1;
}

/**
 * Deduce con máxima precisión la página o diapositiva real a partir del texto y el extracto,
 * corrigiendo cualquier desfase de índice o metadatos desactualizados en kits existentes.
 */
export function resolveRealPageNumber(
  fullText?: string,
  excerpt?: string,
  fallbackPage?: number,
  allChunks?: DocumentChunk[]
): number {
  // 1. Si tenemos el extracto y el texto completo, buscar la posición del extracto y la etiqueta anterior más cercana
  if (excerpt && fullText) {
    const cleanExcerpt = excerpt.replace(/\*\*/g, '').trim();
    const matchPos = findNormalizedSubstringIndex(fullText, cleanExcerpt);
    if (matchPos !== -1) {
      const textBefore = fullText.slice(0, matchPos + 100);
      const matches = [...textBefore.matchAll(/(?:\[Página\s+(\d+)\]|Diapositiva\s+(\d+)|Página\s+(\d+))/gi)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const page = parseInt(lastMatch[1] || lastMatch[2] || lastMatch[3], 10);
        if (!isNaN(page) && page > 0) return page;
      }
    }
  }

  // 2. Si el extracto contiene explícitamente una etiqueta de página
  if (excerpt) {
    const matches = [...excerpt.matchAll(/(?:\[Página\s+(\d+)\]|Diapositiva\s+(\d+)|Página\s+(\d+))/gi)];
    if (matches.length > 0) {
      const page = parseInt(matches[0][1] || matches[0][2] || matches[0][3], 10);
      if (!isNaN(page) && page > 0) return page;
    }
  }

  // 3. Si fullText contiene etiquetas explícitas de página
  if (fullText) {
    const matches = [...fullText.matchAll(/(?:\[Página\s+(\d+)\]|Diapositiva\s+(\d+)|Página\s+(\d+))/gi)];
    if (matches.length > 0) {
      if (matches.length === 1) {
        const page = parseInt(matches[0][1] || matches[0][2] || matches[0][3], 10);
        if (!isNaN(page) && page > 0) return page;
      } else {
        const matchPos = excerpt ? findNormalizedSubstringIndex(fullText, excerpt.replace(/\*\*/g, '')) : -1;
        if (matchPos !== -1) {
          const textBefore = fullText.slice(0, matchPos + 80);
          const matchesBefore = [...textBefore.matchAll(/(?:\[Página\s+(\d+)\]|Diapositiva\s+(\d+)|Página\s+(\d+))/gi)];
          if (matchesBefore.length > 0) {
            const page = parseInt(matchesBefore[matchesBefore.length - 1][1] || matchesBefore[matchesBefore.length - 1][2] || matchesBefore[matchesBefore.length - 1][3], 10);
            if (!isNaN(page) && page > 0) return page;
          }
        }
        const page = parseInt(matches[0][1] || matches[0][2] || matches[0][3], 10);
        if (!isNaN(page) && page > 0) return page;
      }
    }
  }

  // 4. Si allChunks está disponible, escanear si algún chunk contiene el extracto y tiene pageOrSlide
  if (allChunks && allChunks.length > 0 && excerpt) {
    const cleanExcerpt = excerpt.replace(/\*\*/g, '').trim();
    for (const chk of allChunks) {
      if (chk.text && findNormalizedSubstringIndex(chk.text, cleanExcerpt) !== -1) {
        const chkPos = findNormalizedSubstringIndex(chk.text, cleanExcerpt);
        const textBefore = chk.text.slice(0, chkPos + 100);
        const matches = [...textBefore.matchAll(/(?:\[Página\s+(\d+)\]|Diapositiva\s+(\d+)|Página\s+(\d+))/gi)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          const page = parseInt(lastMatch[1] || lastMatch[2] || lastMatch[3], 10);
          if (!isNaN(page) && page > 0) return page;
        }
        if (typeof chk.pageOrSlide === 'number' && chk.pageOrSlide > 0) {
          return chk.pageOrSlide;
        }
      }
    }
  }

  // 5. Fallback a fallbackPage provisto
  if (typeof fallbackPage === 'number' && fallbackPage > 0) {
    return fallbackPage;
  }

  // 6. Garantía absoluta: devolver 1 para que nunca sea undefined
  return 1;
}
