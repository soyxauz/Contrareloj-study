import type { Question, QuestionType } from '../types';

/**
 * Expresiones regulares para detectar opciones de relleno, tautológicas o vacías
 * como "Opción A", "Opción B", "Literal C", "Alternativa 1", "Option A", "a)", etc.
 */
const PLACEHOLDER_OPTION_REGEX =
  /^(opci[oó]n|option|literal|alternativa|inciso|respuesta|choice)(\s+adicional)?\s*([a-e0-9\.\)\:\-])*$/i;

const SINGLE_LETTER_REGEX = /^[a-e][\.\)\:\-]?$/i;

/**
 * Determina si el texto de una opción es un comodín o marcador de posición sin contenido sustantivo.
 */
export function isPlaceholderOption(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;

  if (SINGLE_LETTER_REGEX.test(trimmed)) return true;
  if (PLACEHOLDER_OPTION_REGEX.test(trimmed)) return true;

  // Fragmentos huérfanos que terminan en dos puntos o frases como "las siguientes:"
  if (/^(?:las|los)\s+siguientes:?$/i.test(trimmed)) return true;
  if (/^(?:las|los)\s+anteriores:?$/i.test(trimmed)) return true;
  if (/^las siguientes$/i.test(trimmed)) return true;
  if (trimmed.endsWith(':') && trimmed.length < 35) return true;

  const lower = trimmed.toLowerCase();
  if (
    lower === 'texto de la opción' ||
    lower === 'texto de la opcion' ||
    lower === 'default option' ||
    lower === 'opción por defecto' ||
    lower === 'opcion por defecto' ||
    lower === 'respuesta aquí' ||
    lower === 'respuesta aqui' ||
    lower === 'distractor' ||
    lower === 'distractor 1' ||
    lower === 'distractor 2' ||
    lower === 'distractor 3' ||
    lower === 'opción' ||
    lower === 'opcion' ||
    lower === 'undefined' ||
    lower === 'null'
  ) {
    return true;
  }

  return false;
}

/**
 * Valida si el enunciado de la pregunta tiene suficiente sustancia académica y no está truncado.
 */
export function isValidQuestionStem(stem: string | null | undefined): boolean {
  if (typeof stem !== 'string') return false;
  const trimmed = stem.trim();
  if (trimmed.length < 12) return false;

  // Enunciados puramente genéricos o preámbulos vacíos sin contenido real
  const lower = trimmed.toLowerCase();
  if (
    lower === 'selecciona la opción correcta:' ||
    lower === 'selecciona la opcion correcta:' ||
    lower === 'selecciona la opción correcta' ||
    lower === 'selecciona la respuesta correcta:' ||
    lower === 'elige la opción correcta:' ||
    lower === 'pregunta 1:' ||
    lower === 'pregunta:' ||
    /^(?:análisis crítico:\s*)?evalúa la rigurosidad conceptual de la siguiente proposición:?\s*$/i.test(lower) ||
    /^(?:análisis crítico:\s*)?evalúa si la siguiente proposición es fidedigna o incurre en error conceptual:?\s*$/i.test(lower)
  ) {
    return false;
  }

  // Verificación de enunciado amputado o truncado al final
  if (/[(\[{/]\s*$/.test(trimmed)) return false;
  if (/\b(?:debido a que|porque|puesto que|dado que|es decir)\s*[:?]?$/i.test(trimmed)) return false;

  // Si hace alusión a "este paciente" o "el caso clínico", debe contener un escenario mínimo de al menos 45 caracteres
  if (
    /\b(?:este paciente|el paciente descrito|dicho paciente|el caso anterior|la paciente de|el cuadro expuesto)\b/i.test(
      trimmed
    ) &&
    trimmed.length < 45
  ) {
    return false;
  }

  return true;
}

/**
 * Retorna la razón por la que una pregunta NO cumple el estándar de calidad, o null si es válida.
 */
export function explainQuestionNonCompliance(q: any): string | null {
  if (!q || typeof q !== 'object') return 'Objeto de pregunta nulo o inválido';
  if (!q.id) return 'La pregunta carece de identificador (id)';
  if (!isValidQuestionStem(q.question)) return 'El enunciado de la pregunta es demasiado corto, genérico o está incompleto';

  const type: QuestionType = q.type || 'multiple-choice';

  if (type === 'multiple-choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return `Tipo multiple-choice requiere al menos 2 opciones (tiene ${q.options?.length || 0})`;
    }
    for (let i = 0; i < q.options.length; i++) {
      if (isPlaceholderOption(q.options[i])) {
        return `La opción ${i + 1} ("${q.options[i]}") es un marcador de posición no admisible`;
      }
    }
    // Verificar duplicados exactos
    const unique = new Set(q.options.map((o: string) => (typeof o === 'string' ? o.trim().toLowerCase() : '')));
    if (unique.size !== q.options.length) {
      return 'Existen opciones duplicadas en la pregunta';
    }
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      return `Índice de respuesta correcta inválido (${q.correctIndex})`;
    }
    return null;
  }

  if (type === 'multi-select') {
    const opts = q.options || q.options_multiples;
    if (!Array.isArray(opts) || opts.length < 3) {
      return `Tipo multi-select requiere al menos 3 opciones (tiene ${opts?.length || 0})`;
    }
    for (let i = 0; i < opts.length; i++) {
      if (isPlaceholderOption(opts[i])) {
        return `La opción multi-select ${i + 1} ("${opts[i]}") es un marcador de posición ('Opción A/B', etc.) no admisible`;
      }
    }
    const unique = new Set(opts.map((o: string) => (typeof o === 'string' ? o.trim().toLowerCase() : '')));
    if (unique.size !== opts.length) {
      return 'Existen opciones multi-select duplicadas';
    }
    const correct = Array.isArray(q.correctIndices)
      ? q.correctIndices
      : Array.isArray(q.indices_correctos)
      ? q.indices_correctos
      : [];
    if (correct.length === 0) {
      return 'Pregunta multi-select sin ningún índice correcto configurado';
    }
    return null;
  }

  if (type === 'true-false') {
    const trimmed = (q.question || '').trim();
    if (trimmed.length < 15) return 'Enunciado de Verdadero/Falso demasiado corto';
    if (/^(?:¿cu[aá]l|selecciona|qu[eé] opci[oó]n|indica la opci[oó]n)\b/i.test(trimmed)) {
      return 'Pregunta marcada como Verdadero/Falso pero redactada como selección múltiple';
    }
    return null;
  }

  if (type === 'matching') {
    const pairs = q.matchingPairs || q.pares_emparejamiento;
    if (!Array.isArray(pairs) || pairs.length < 2) {
      return `Tipo matching requiere al menos 2 pares de conceptos (tiene ${pairs?.length || 0})`;
    }
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const term = (p?.term || p?.termino || '').trim();
      const def = (p?.definition || p?.definicion || '').trim();
      if (term.length < 2 || def.length < 3) {
        return `Par ${i + 1} con término o definición demasiado cortos`;
      }
      if (/^(?:elemento|concepto|termino|término)\s*\d+$/i.test(term)) {
        return `Par ${i + 1} tiene término de relleno ("${term}")`;
      }
      if (/^(?:fase|etapa|definici[oó]n)\s*\d+$/i.test(def)) {
        return `Par ${i + 1} tiene definición de relleno ("${def}")`;
      }
    }
    return null;
  }

  if (type === 'drag-drop') {
    const template = q.templateSentence || q.oracion_plantilla || '';
    if (!template.includes('{0}') && !template.includes('____')) {
      return 'Pregunta drag-drop sin marcador de hueco {0} en la oración plantilla';
    }
    const blanks = q.blanksCorrect || q.huecos_correctos;
    if (!Array.isArray(blanks) || blanks.length === 0) {
      return 'Pregunta drag-drop sin palabras correctas para los huecos';
    }
    const bank = q.wordBank || q.banco_palabras;
    if (!Array.isArray(bank) || bank.length < blanks.length) {
      return 'Banco de palabras insuficiente para drag-drop';
    }
    return null;
  }

  if (type === 'image-labeling') {
    const hotspots = q.imageHotspots;
    if (!Array.isArray(hotspots) || hotspots.length < 2) {
      return 'Pregunta de diagrama/imagen con menos de 2 puntos interactivos';
    }
    return null;
  }

  if (type === 'short-answer') {
    const ideal = (q.idealAnswer || '').trim();
    const keys = Array.isArray(q.keyPoints) ? q.keyPoints : [];
    if (ideal.length < 5 && keys.length === 0) {
      return 'Pregunta de respuesta corta sin respuesta modelo ni puntos clave';
    }
    return null;
  }

  return null;
}

/**
 * Validador estricto: ¿Cumple esta pregunta el estándar de calidad pedagógica para salir al usuario?
 */
export function isQuestionCompliantWithStandard(q: unknown): q is Question {
  return explainQuestionNonCompliance(q) === null;
}

/**
 * Limpia y normaliza el texto de una opción eliminando prefijos de numeración/letras,
 * viñetas y marcadores espurios ("Literal C)", "Opción A:", "• B.", etc.).
 */
export function sanitizeOptionText(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  let t = raw.trim();
  // Eliminar viñetas
  t = t.replace(/^[•●▪-]\s*/, '');
  // Reemplazar comillas tipográficas angulares
  t = t.replace(/\u00AB/g, '"').replace(/\u00BB/g, '"');
  // Eliminar prefijos tipo "Literal A)", "Opción B:", "Alternativa 1)", "Inciso C -"
  t = t.replace(/^(?:Literal|Opción|Opcion|Alternativa|Inciso|Respuesta)\s+[A-Ea-e0-9][:.\s-)\/]\s*/i, '');
  // Eliminar marcadores directos "(A)", "[A]", "A)", "A.", "A -", "**A)**", etc.
  t = t.replace(/^(?:\*\*)?(?:\([A-Ea-e0-9]\)|\[[A-Ea-e0-9]\]|[A-Ea-e0-9][\).:\-])(?:\*\*)?\s+/, '');
  // Segunda pasada por si había combinaciones como "Opción A) Texto"
  t = t.replace(/^(?:Literal|Opción|Opcion|Alternativa|Inciso|Respuesta)\s+[A-Ea-e0-9][:.\s-)\/]\s*/i, '');
  return t.trim();
}

/**
 * Repara y normaliza la estructura completa de una pregunta pedagógica.
 * Corrige enunciados huérfanos, rescata afirmaciones directas de Verdadero/Falso,
 * limpia opciones de distractores espurios, invierte pares de emparejamiento desbalanceados
 * y garantiza congruencia entre tipo y opciones.
 */
export function repairQuestionStructure(q: Question): Question {
  if (!q || typeof q !== 'object') return q;

  let currentType: QuestionType = q.type || 'multiple-choice';
  let promptText = String(q.question || '').trim();

  // 1. Limpieza de preámbulos, metatexto y fórmulas redundantes
  promptText = promptText
    .replace(/[•●▪]/g, '')
    .replace(/\u00AB/g, '"')
    .replace(/\u00BB/g, '"')
    .replace(/^Análisis Crítico:\s*Evalúa la rigurosidad conceptual de la siguiente proposición:?\s*/i, '')
    .replace(/^Análisis Crítico:\s*Evalúa si la siguiente proposición es fidedigna o incurre en error conceptual:?\s*/i, '')
    .replace(/^Evalúa la veracidad de la siguiente afirmación fundamental según el texto:?\s*/i, '')
    .replace(/^Evalúa la veracidad de la siguiente afirmación:?\s*/i, '')
    .replace(/\s*según el (?:texto|documento|material)\??/gi, '')
    .replace(/\s*conforme al (?:texto|documento)\??/gi, '')
    .trim();

  // 2. Normalización y limpieza de opciones
  let cleanOptions: string[] = [];
  if (Array.isArray(q.options)) {
    cleanOptions = q.options
      .map(sanitizeOptionText)
      .filter(o => o.length > 0 && !isPlaceholderOption(o));
  }

  // Detección de si es Verdadero / Falso
  const isTFOptions = cleanOptions.length === 2 &&
    cleanOptions.some(o => /^verdadero$/i.test(o)) &&
    cleanOptions.some(o => /^falso$/i.test(o));

  if (currentType === 'true-false' || isTFOptions) {
    currentType = 'true-false';
    let assertion = '';
    const quotedMatch = promptText.match(/(?:describe con mayor precisión a|sobre|respecto a|acerca de)\s*["“«](.+?)["”»]\??/i) ||
      promptText.match(/^¿(?:cuál de las siguientes opciones|es verdadero o falso que)\s+["“«](.+?)["”»]\??/i) ||
      promptText.match(/["“«](.+?)["”»]/);

    if (quotedMatch && quotedMatch[1] && quotedMatch[1].trim().length > 10) {
      assertion = quotedMatch[1].trim();
    } else {
      // Limpiar prefijos de pregunta retórica para dejar la afirmación directa
      assertion = promptText
        .replace(/^¿(?:es\s+verdadero\s+o\s+falso\s+que|es\s+correcto\s+afirmar\s+que)\s+/i, '')
        .replace(/\?$/, '')
        .trim();
    }

    if (!assertion || assertion.length < 10) {
      if (q.idealAnswer && q.idealAnswer.trim().length > 10 && !/\bcu[aá]l\b/i.test(q.idealAnswer)) {
        assertion = q.idealAnswer.trim();
      } else if (q.explanation) {
        const cleanExpl = q.explanation
          .replace(/### Búsqueda en Google:[\s\S]*?(?=\*\*Fundamentación|\n\n[A-Z]|\n\n$|$)/i, '')
          .replace(/^[*\s]*(Verdadero|Falso|Opción [A-D]|Justificación|Fundamentación):?\s*/i, '')
          .trim();
        const firstSentence = cleanExpl.split(/\.\s+/)[0]?.trim();
        if (firstSentence && firstSentence.length > 15) {
          assertion = firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
        }
      }
    }

    let finalAssertion = assertion || promptText;
    finalAssertion = finalAssertion.replace(/^["'“«]+|["'”»]+$/g, '').trim();
    const formattedAssertion = `"${finalAssertion}"`;

    let cIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
    if (cIndex !== 0 && cIndex !== 1) cIndex = 0;

    return {
      ...q,
      type: 'true-false',
      question: formattedAssertion,
      options: ['Verdadero', 'Falso'],
      correctIndex: cIndex,
    };
  }

  // 3. Si tiene opciones de multiple-choice (al menos 2 opciones sustantivas)
  if (cleanOptions.length >= 2) {
    if (!promptText.includes('?') && !/^(identifica|selecciona|indica|señala|determina|empareja|ordena|completa|cuál|qué|cómo|dónde|por qué|cuándo|en qué|de qué|a qué)\b/i.test(promptText)) {
      if (promptText.length > 0) {
        promptText = `¿Cuál de las siguientes opciones describe con mayor precisión a ${promptText}?`;
      } else {
        promptText = q.topic ? `¿Cuáles son las características principales de ${q.topic}?` : '¿Cuál de las siguientes opciones es la correcta?';
      }
    }

    let cIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
    if (cIndex < 0 || cIndex >= cleanOptions.length) {
      cIndex = 0;
    }

    return {
      ...q,
      type: currentType,
      question: promptText,
      options: cleanOptions,
      correctIndex: cIndex,
    };
  }

  // 4. Normalización de emparejamiento (matching)
  if (currentType === 'matching' || Array.isArray(q.matchingPairs)) {
    const rawPairs = q.matchingPairs || (q as any).pares_emparejamiento;
    if (Array.isArray(rawPairs)) {
      const sanitizedPairs = rawPairs.map((p: any) => {
        let term = String(p.term || p.termino || '').trim();
        let def = String(p.definition || p.definicion || (p as any).def || '').trim();
        // Inversión semántica: si el término es largo (definición) y la definición es corta (término/concepto), invertirlos
        if (term.split(/\s+/).length > 5 && def.split(/\s+/).length <= 4) {
          const temp = term;
          term = def;
          def = temp;
        }
        return { term, definition: def };
      }).filter(p => p.term.length >= 2 && p.definition.length >= 3 && !/^(?:concepto|término|elemento)\s*\d+$/i.test(p.term));

      return {
        ...q,
        type: 'matching',
        question: promptText.includes('?') || promptText.length >= 15 ? promptText : 'Empareja cada concepto clave con su definición o propiedad correspondiente:',
        matchingPairs: sanitizedPairs,
      };
    }
  }

  // 5. Normalización de arrastrar y soltar (drag-drop)
  if (currentType === 'drag-drop') {
    let template = q.templateSentence || (q as any).oracion_plantilla || '';
    if (!template && /\{\d+\}/.test(promptText)) {
      template = promptText;
      promptText = 'Arrastra y coloca los conceptos en los espacios correspondientes para completar el enunciado:';
    }
    return {
      ...q,
      type: 'drag-drop',
      question: promptText.length >= 15 ? promptText : 'Completa los espacios en blanco del siguiente enunciado:',
      templateSentence: template,
    };
  }

  return {
    ...q,
    question: promptText,
    options: cleanOptions.length > 0 ? cleanOptions : q.options,
  };
}

/**
 * Filtra una lista de preguntas excluyendo terminantemente cualquier pregunta
 * que contenga "Opción A/B/C/D", enunciados incompletos o estructuras defectuosas.
 * Aplica previamente la reparación estructural para salvar preguntas válidas con defectos menores.
 */
export function filterCompliantQuestions(questions: Question[] | null | undefined): Question[] {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  return questions
    .map(q => repairQuestionStructure(q))
    .filter((q): q is Question => {
      const qCandidate = q as unknown;
      const isValid = isQuestionCompliantWithStandard(qCandidate);
      if (!isValid) {
        const qAny = q as any;
        const reason = explainQuestionNonCompliance(qAny);
        console.warn(`[QuestionStandard] Pregunta descartada (${qAny?.id || 'sin-id'}): ${reason}`);
      }
      return isValid;
    });
}
