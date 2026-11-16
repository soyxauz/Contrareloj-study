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
 * Repara textos de PDF con saltos de línea con guión (de-hyphenation) y artefactos de OCR
 */
export function cleanDocumentText(text: string): string {
  if (!text) return '';
  return text
    // Reparar palabras cortadas por salto de línea con guión (ej. farmaco- lógico -> farmacológico, hemo- globina -> hemoglobina)
    .replace(/(\b[a-zA-ZáéíóúñÁÉÍÓÚÑ]{2,})-\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ]{2,}\b)/g, (_m, p1, p2) => p1 + p2)
    // Normalizar ligaduras y errores OCR comunes
    .replace(/q11elas/gi, 'que las')
    .replace(/autoin1nune/gi, 'autoinmune')
    .replace(/cuau\s*[·.]\s*o/gi, 'cuatro')
    .replace(/f[aá]rn,acos/gi, 'fármacos');
}

/**
 * Normaliza términos médicos para equiparar variantes fonéticas y sinónimos clínicos
 * (ej. glucosilada <-> glicosilada <-> glicocilada <-> glicada, HbA1c <-> A1C, glucemia <-> glicemia <-> glucosa,
 * oatp1b1, estatinas, miopatía, hipotiroidismo, péptido C, etc.)
 */
export function normalizeMedicalTerm(token: string): string {
  if (!token) return '';
  const clean = token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^gl[ui]c[oas][sc]ila\w*$/.test(clean) || /^gl[ui]cad\w*$/.test(clean)) {
    return 'norm_glucosilad';
  }
  if (/^(hb)?[-_]?a1c$/i.test(clean)) {
    return 'norm_hba1c';
  }
  if (/^hemoglobin\w*$/.test(clean)) {
    return 'norm_hemoglobina';
  }
  if (/^gl[ui]c[eo]m\w*$/.test(clean) || /^glucos\w*$/.test(clean)) {
    return 'norm_glucosa';
  }
  if (/^estatin\w*$/.test(clean)) {
    return 'norm_estatina';
  }
  if (/^oatp\w*$/.test(clean)) {
    return 'norm_oatp1b1';
  }
  if (/^hmg[-_]?coa\w*$/.test(clean)) {
    return 'norm_hmgcoa';
  }
  if (/^cyp\w*$/.test(clean)) {
    return 'norm_cyp';
  }
  if (/^miopat\w*$/.test(clean)) {
    return 'norm_miopatia';
  }
  if (/^hipotiroid\w*$/.test(clean)) {
    return 'norm_hipotiroidismo';
  }
  if (/^peptid\w*$/.test(clean)) {
    return 'norm_peptido';
  }
  return clean;
}

/**
 * Extrae tokens sustantivos sin acentos ni stopwords, con normalización médica y de-hyphenation
 */
export function extractMeaningfulTokens(text: string): Set<string> {
  if (!text) return new Set();

  const cleaned = cleanDocumentText(text);
  const normalized = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[^a-z0-9áéíóúñ\s-]/g, ' ');

  const words = normalized
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !SPANISH_STOPWORDS.has(w));

  const result = new Set<string>();
  for (const w of words) {
    result.add(w);
    const medNorm = normalizeMedicalTerm(w);
    if (medNorm && medNorm !== w) {
      result.add(medNorm);
    }
  }

  return result;
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
  cleanQuestionText: string = '',
  exactCitation: string = ''
): number {
  const sentenceTokens = extractMeaningfulTokens(sentence);
  if (sentenceTokens.size === 0) return 0;

  let score = 0;
  let answerMatches = 0;

  // 0. Coincidencia con la cita textual exacta del modelo o pregunta (prioridad absoluta suprema)
  if (exactCitation && exactCitation.length >= 8) {
    const normSentence = cleanDocumentText(sentence).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normCitation = cleanDocumentText(exactCitation).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normSentence.includes(normCitation.slice(0, 30)) || normCitation.includes(normSentence.slice(0, 30))) {
      score += 200.0;
      answerMatches += 2;
    } else {
      const citTokens = extractMeaningfulTokens(exactCitation);
      let citMatches = 0;
      for (const t of citTokens) {
        if (sentenceTokens.has(t)) citMatches++;
      }
      if (citMatches > 0 && citTokens.size > 0) {
        const ratio = citMatches / citTokens.size;
        if (ratio >= 0.35) {
          score += 140.0 * ratio;
          answerMatches++;
        }
      }
    }
  }

  // 1. Coincidencia con tokens de la respuesta correcta (prioridad dominante)
  for (const t of answerTokens) {
    if (sentenceTokens.has(t)) {
      score += t.startsWith('norm_') ? 35.0 : 25.0; // Ponderación dominante para términos de respuesta
      answerMatches++;
    }
  }

  // 2. Bonus de frase literal continua de la respuesta
  if (cleanAnswerText && cleanAnswerText.length >= 5) {
    const normSentence = cleanDocumentText(sentence).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normAnswer = cleanDocumentText(cleanAnswerText).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (normSentence.includes(normAnswer.slice(0, 25))) {
      score += 50.0; // Coincidencia textual directa con el enunciado de la respuesta
      answerMatches++;
    } else {
      const ansWords = normAnswer.split(/\s+/).filter(w => w.length >= 3 && !SPANISH_STOPWORDS.has(w));
      for (let i = 0; i < ansWords.length - 1; i++) {
        const bigram = `${ansWords[i]} ${ansWords[i+1]}`;
        if (normSentence.includes(bigram)) {
          score += 18.0;
          answerMatches++;
        }
      }
    }
  }

  // 3. Coincidencia con el concepto evaluado
  for (const t of conceptTokens) {
    if (sentenceTokens.has(t)) {
      score += t.startsWith('norm_') ? 4.0 : 2.5;
    }
  }

  // 4. Coincidencia con la pregunta (filtrando boilerplate genérico)
  const GENERIC_BOILERPLATE = /^(american|diabetes|association|ada|asociacion|mellitus|capitulo|segun|cual|siguientes|paciente|diagnostico)$/i;
  for (const t of queryTokens) {
    if (sentenceTokens.has(t)) {
      if (GENERIC_BOILERPLATE.test(t)) {
        score += 0.2; // Muy bajo para no distorsionar con introducciones generales
      } else {
        score += t.length >= 6 ? 4.0 : 2.5; // Alto para términos específicos (ej. 2009, criterio, meses)
      }
    }
  }

  // 5. Bonus de frase literal de la pregunta (solo trigramas específicos)
  if (cleanQuestionText && cleanQuestionText.length >= 10) {
    const normSentence = cleanDocumentText(sentence).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normQuery = cleanDocumentText(cleanQuestionText).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qWords = normQuery.split(/\s+/).filter(w => w.length >= 3 && !SPANISH_STOPWORDS.has(w) && !GENERIC_BOILERPLATE.test(w));
    for (let i = 0; i < qWords.length - 1; i++) {
      const bigram = `${qWords[i]} ${qWords[i+1]}`;
      if (normSentence.includes(bigram)) {
        score += 4.0;
      }
    }
  }

  // 6. PENALIZACIÓN CRÍTICA: Si la pregunta tiene una respuesta objetivo o cita esperada, pero esta oración
  // NO contiene NINGÚN token de la respuesta ni de la cita, su puntuación se restringe severamente para que
  // párrafos introductorios generales jamás puedan vencer a la evidencia real de la respuesta.
  if ((answerTokens.size > 0 || (exactCitation && exactCitation.length >= 8)) && answerMatches === 0) {
    score = Math.min(0.5, score * 0.05);
  }

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
  exactCitation?: string;
}): SpecificPassageResult {
  const { fullText, question, correctAnswer = '', concept = '', exactCitation = '' } = params;

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
    scoreSentence(s, queryTokens, answerTokens, conceptTokens, correctAnswer, question, exactCitation)
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
    maxScore >= 8 ? 'high' : maxScore >= 3.0 ? 'medium' : 'low';

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
 * Escanea la totalidad de fragmentos del kit para hallar aquel con mayor anclaje textual directo,
 * priorizando de forma absoluta los fragmentos que contienen la respuesta correcta o la cita de la IA.
 */
export function findBestChunkAndExcerpt(params: {
  chunks: DocumentChunk[];
  question: string;
  correctAnswer?: string;
  concept?: string;
  preferredChunkId?: string;
  exactCitation?: string;
}): { bestChunk: DocumentChunk | null; passage: SpecificPassageResult } {
  const { chunks, question, correctAnswer = '', concept = '', preferredChunkId, exactCitation = '' } = params;

  if (!chunks || chunks.length === 0) {
    const emptyResult = extractSpecificPassage({
      fullText: '',
      question,
      correctAnswer,
      concept,
      exactCitation,
    });
    return { bestChunk: null, passage: emptyResult };
  }

  const answerTokens = extractMeaningfulTokens(correctAnswer);
  const citationTokens = exactCitation ? extractMeaningfulTokens(exactCitation) : new Set<string>();

  const evaluateChunk = (chunk: DocumentChunk) => {
    const passage = extractSpecificPassage({
      fullText: chunk.text,
      question,
      correctAnswer,
      concept,
      exactCitation,
    });

    let chunkBonus = 0;

    // 1. Bonus determinante si el fragmento contiene la cita textual exacta
    if (exactCitation && exactCitation.trim().length >= 10) {
      const normChunk = cleanDocumentText(chunk.text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normCit = cleanDocumentText(exactCitation).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normChunk.includes(normCit.slice(0, 25)) || normCit.includes(normChunk.slice(0, 25))) {
        chunkBonus += 500.0;
      } else if (citationTokens.size > 0) {
        const chunkTokens = extractMeaningfulTokens(chunk.text);
        let citMatch = 0;
        for (const t of citationTokens) {
          if (chunkTokens.has(t)) citMatch++;
        }
        if (citMatch >= 2) {
          chunkBonus += 250.0 * (citMatch / citationTokens.size);
        }
      }
    }

    // 2. Bonus decisivo si el fragmento contiene los términos de la respuesta correcta
    if (answerTokens.size > 0) {
      const chunkTokens = extractMeaningfulTokens(chunk.text);
      let matchCount = 0;
      for (const t of answerTokens) {
        if (chunkTokens.has(t)) matchCount++;
      }
      if (matchCount > 0) {
        chunkBonus += 150.0 * (matchCount / answerTokens.size);
      }
    }

    // 3. Penalización si el chunk no contiene la respuesta ni la cita textual
    let effectiveScore = passage.score + chunkBonus;
    if ((answerTokens.size > 0 || (exactCitation && exactCitation.length >= 10)) && chunkBonus === 0) {
      effectiveScore = Math.min(2.5, effectiveScore * 0.1);
    }

    return {
      chunk,
      passage,
      effectiveScore,
    };
  };

  let bestEvaluation: { chunk: DocumentChunk; passage: SpecificPassageResult; effectiveScore: number } | null = null;

  for (const chunk of chunks) {
    const evalResult = evaluateChunk(chunk);
    if (!bestEvaluation || evalResult.effectiveScore > bestEvaluation.effectiveScore) {
      bestEvaluation = evalResult;
    }
  }

  // Si había un preferredChunk y su score es equivalente o superior al mejor, mantenerlo por afinidad de origen
  // ÚNICAMENTE si el preferredChunk también contiene evidencia o tokens de la respuesta o la cita exacta
  if (preferredChunkId && bestEvaluation) {
    const preferredChunk = chunks.find(c => c.id === preferredChunkId);
    if (preferredChunk && preferredChunk.id !== bestEvaluation.chunk.id) {
      const prefTokens = extractMeaningfulTokens(preferredChunk.text);
      const prefHasAnswer = (answerTokens.size > 0 && [...answerTokens].some(t => prefTokens.has(t))) ||
                            (citationTokens.size > 0 && [...citationTokens].some(t => prefTokens.has(t)));
      if (prefHasAnswer) {
        const prefEval = evaluateChunk(preferredChunk);
        if (prefEval.effectiveScore >= bestEvaluation.effectiveScore * 0.95 && prefEval.effectiveScore >= 20.0) {
          bestEvaluation = prefEval;
        }
      }
    }
  }

  return {
    bestChunk: bestEvaluation ? bestEvaluation.chunk : chunks[0],
    passage: bestEvaluation ? bestEvaluation.passage : extractSpecificPassage({ fullText: chunks[0].text, question, correctAnswer, concept, exactCitation })
  };
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

const PAGE_TAG_REGEX = /(?:\[Página\s+(\d+)\]|\[Diapositiva\s+(\d+)\]|Diapositiva\s+(\d+)|Página\s+(\d+)|P[aá]g\.?\s*(\d+)|Slide\s+(\d+)|Page\s+(\d+)|\b(?:pág|pag|diap|slide|page)\.?\s*(\d+)\b)/gi;

function extractPageNumberFromMatch(match: RegExpMatchArray | RegExpExecArray): number | null {
  for (let i = 1; i < match.length; i++) {
    if (match[i]) {
      const num = parseInt(match[i], 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
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
      // Tomar estrictamente el texto que precede al extracto (hasta matchPos + 5 por si la etiqueta abre el extracto)
      // evitando terminantemente capturar la etiqueta de la página siguiente
      const textBefore = fullText.slice(0, Math.max(1, matchPos + 5));
      const matches = [...textBefore.matchAll(PAGE_TAG_REGEX)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const page = extractPageNumberFromMatch(lastMatch);
        if (page && page > 0) return page;
      }
    }
  }

  // 2. Si el extracto contiene explícitamente una etiqueta de página
  if (excerpt) {
    const matches = [...excerpt.matchAll(PAGE_TAG_REGEX)];
    if (matches.length > 0) {
      const page = extractPageNumberFromMatch(matches[0]);
      if (page && page > 0) return page;
    }
  }

  // 3. Si fullText contiene etiquetas explícitas de página
  if (fullText) {
    const matches = [...fullText.matchAll(PAGE_TAG_REGEX)];
    if (matches.length > 0) {
      if (matches.length === 1) {
        const page = extractPageNumberFromMatch(matches[0]);
        if (page && page > 0) return page;
      } else {
        const matchPos = excerpt ? findNormalizedSubstringIndex(fullText, excerpt.replace(/\*\*/g, '')) : -1;
        if (matchPos !== -1) {
          const textBefore = fullText.slice(0, Math.max(1, matchPos + 5));
          const matchesBefore = [...textBefore.matchAll(PAGE_TAG_REGEX)];
          if (matchesBefore.length > 0) {
            const page = extractPageNumberFromMatch(matchesBefore[matchesBefore.length - 1]);
            if (page && page > 0) return page;
          }
        }
        const page = extractPageNumberFromMatch(matches[0]);
        if (page && page > 0) return page;
      }
    }
  }

  // 4. Si allChunks está disponible, escanear si algún chunk contiene el extracto y tiene pageOrSlide
  if (allChunks && allChunks.length > 0 && excerpt) {
    const cleanExcerpt = excerpt.replace(/\*\*/g, '').trim();
    for (const chk of allChunks) {
      if (chk.text && findNormalizedSubstringIndex(chk.text, cleanExcerpt) !== -1) {
        const chkPos = findNormalizedSubstringIndex(chk.text, cleanExcerpt);
        const textBefore = chk.text.slice(0, Math.max(1, chkPos + 5));
        const matches = [...textBefore.matchAll(PAGE_TAG_REGEX)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          const page = extractPageNumberFromMatch(lastMatch);
          if (page && page > 0) return page;
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
