import type { DocumentAsset, DocumentChunk, Question, RagEvidenceItem } from '../types';

/**
 * Motor de Extracción RAG de Alta Precisión
 * Identifica, puntúa y extrae el párrafo específico del documento fuente y resalta
 * quirúrgicamente ÚNICAMENTE la oración o cláusula exacta que fundamenta o responde
 * cada formato de pregunta, calculando con fidelidad la página o diapositiva real.
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
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'mas', 'pero', 'sus', 'le', 'ya', 'o',
  'fue', 'este', 'ha', 'sí', 'porque', 'esta', 'son', 'entre', 'está', 'esta', 'cuando', 'muy',
  'sin', 'sobre', 'ser', 'tiene', 'también', 'tambien', 'me', 'hasta', 'hay', 'donde', 'quien',
  'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros',
  'ese', 'eso', 'ante', 'ellos', 'esto', 'mí', 'mi', 'antes', 'algunos', 'qué', 'cuál', 'cuáles',
  'cómo', 'cuándo', 'dónde', 'quién', 'quiénes', 'the', 'of', 'and', 'in', 'to', 'a',
  'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'at', 'by', 'this', 'be', 'from',
  'or', 'an', 'cual', 'cuales', 'indica', 'senala', 'selecciona', 'opcion', 'opciones',
  'siguiente', 'siguientes', 'respecto', 'relacion', 'afirmacion', 'enunciado', 'pregunta',
  'verdadero', 'falso', 'correcta', 'correcto', 'incorrecta', 'incorrecto', 'respuesta',
  'principio', 'fundamento', 'criterio', 'evidencia', 'texto', 'documento', 'material'
]);

const GENERIC_BOILERPLATE =
  /^(american|diabetes|association|ada|asociacion|mellitus|capitulo|segun|cual|siguientes|paciente|diagnostico|tratamiento|clinico|clinica|estudio|tema|concepto)$/i;

/**
 * Repara textos de PDF con saltos de línea con guión (de-hyphenation) y artefactos de OCR
 */
export function cleanDocumentText(text: string): string {
  if (!text) return '';
  return text
    .replace(/(\b[a-zA-ZáéíóúñÁÉÍÓÚÑ]{2,})-\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ]{2,}\b)/g, (_m, p1, p2) => p1 + p2)
    .replace(/q11elas/gi, 'que las')
    .replace(/autoin1nune/gi, 'autoinmune')
    .replace(/cuau\s*[·.]\s*o/gi, 'cuatro')
    .replace(/f[aá]rn,acos/gi, 'fármacos');
}

/**
 * Repara palabras cortadas por guión en PDF y variantes fonéticas/OCR para indexación sin alterar la fidelidad visual.
 */
function normalizeOcrForMatching(text: string): string {
  if (!text) return '';
  return cleanDocumentText(text)
    .replace(/\brn([aáeéiíoóuú])/gi, 'm$1')
    .replace(/([a-záéíóúñ])111([a-záéíóúñ])/gi, '$1m$2')
    .replace(/([a-záéíóúñ])n1([a-záéíóúñ])/gi, '$1m$2')
    .replace(/([a-záéíóúñ])1([a-záéíóúñ])/gi, '$1i$2')
    .replace(/([a-záéíóúñ])j([a-záéíóúñ])/gi, (_m, a, b) => (a === 'm' || b === 'n' ? `${a}i${b}` : `${a}j${b}`))
    .replace(/\b[1lIi]\s*nsul\s*in\s*a\b/gi, 'insulina')
    .replace(/\binter\s+media\b/gi, 'intermedia')
    .replace(/\bgla\s+rgina\b/gi, 'glargina')
    .replace(/\bli\s+spro\b/gi, 'lispro')
    .replace(/\bglul\s+isina\b/gi, 'glulisina')
    .replace(/\bprotam1na\b/gi, 'protamina')
    .replace(/\bsulfoni\s*lureas\b/gi, 'sulfonilureas')
    .replace(/\bantid\s*iab[eé]ticos\b/gi, 'antidiabéticos');
}

function normalizeForMatch(text: string): string {
  return normalizeOcrForMatching(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Penaliza fragmentos con alta proporción de ruido OCR de diagramas/fórmulas químicas rotas (ej. "~ s 21 Cys 20,.-- @)")
 * para favorecer párrafos legibles del documento sobre etiquetas fragmentadas de figuras.
 */
function computeOcrNoiseMultiplier(text: string): number {
  if (!text || text.length < 40) return 1.0;
  const junkSymbols = (text.match(/[~\\|@#$^_{}]/g) || []).length;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 6) return 1.0;
  const shortNumericTokens = tokens.filter(t => /^[\d.,'\-~()\/\\]+$|^[a-zA-Z]$/.test(t)).length;
  const shortRatio = shortNumericTokens / tokens.length;

  if (junkSymbols >= 4 || (shortRatio >= 0.42 && tokens.length >= 12)) {
    return 0.14;
  }
  if (junkSymbols >= 2 || (shortRatio >= 0.30 && tokens.length >= 12)) {
    return 0.45;
  }
  return 1.0;
}

const GENERIC_DOMAIN_WORDS = new Set([
  'insulina', 'insulinas', 'analogo', 'analogos', 'farmaco', 'farmacos', 'medicamento',
  'diabetes', 'mellitus', 'glucosa', 'glucemia', 'glicemia', 'accion', 'efecto', 'inicio',
  'duracion', 'pico', 'maximo', 'perfil', 'farmacocinetico', 'farmacocinetica', 'mecanismo',
  'tratamiento', 'terapia', 'caracteristica', 'caracteristicas', 'funcion', 'patologia',
  'enfermedad', 'sindrome', 'paciente', 'pacientes', 'via', 'subcutanea', 'oral',
  'administracion', 'dosis', 'tipo', 'tipos', 'nivel', 'niveles', 'criterio', 'criterios',
  'rapida', 'rapido', 'lenta', 'lento', 'intermedia', 'prolongada', 'ultrarrapida', 'corta',
  'tabla', 'tablas', 'figura', 'figuras', 'esquema', 'cuadro', 'grafico', 'capitulo',
  'pagina', 'seccion', 'articulo', 'apartado', 'adaptado', 'diferencia', 'ejemplo'
]);

const KNOWN_DISCRIMINATING_ENTITY_REGEX =
  /\b(?:lispro|aspart|glulisina|glargina|detemir|degludec|regular|cristalina|nph|protamina|metformina|glibenclamida|glipizida|glimepirida|gliclazida|repaglinida|nateglinida|pioglitazona|rosiglitazona|sitagliptina|vildagliptina|saxagliptina|linagliptina|exenatida|liraglutida|semaglutida|dulaglutida|empagliflozina|dapagliflozina|canagliflozina|acarbosa|miglitol|pramlintida|glucagon|somatostatina|amilina|incretina|tiazolidindiona|biguanida|sulfonilurea|glinida|foxo1|pepck|ampk|glut4|glut2|sglt2|dpp4|glp1)\b/gi;

/**
 * Extrae las entidades discriminadoras nucleares (ej. "nph", "glargina", "lispro", "metformina", "foxo1", "akt")
 * evitando palabras genéricas del tema para impedir que fármacos hermanos se confundan entre sí.
 */
function extractDiscriminatingEntities(questionText: string, concept: string = ''): Set<string> {
  const combined = `${concept || ''} ${questionText || ''}`.trim();
  if (!combined) return new Set();

  const entities = new Set<string>();

  // 1. Siglas o identificadores en mayúsculas / alfanuméricos específicos (NPH, GLP-1, DPP-4, FOXO1, PEPCK, AMPK, SGLT2)
  const acronymMatches = combined.match(/\b[A-ZÁÉÍÓÚÑ][A-Z0-9\-]{1,10}\b/g) || [];
  for (const acr of acronymMatches) {
    const norm = normalizeForMatch(acr);
    if (norm.length >= 2 && !SPANISH_STOPWORDS.has(norm) && !GENERIC_DOMAIN_WORDS.has(norm)) {
      entities.add(norm);
    }
  }

  // 2. Entidades farmacológicas/moleculares conocidas aunque aparezcan en minúsculas dentro de la pregunta
  const normCombined = normalizeForMatch(combined);
  const specificMatches = normCombined.match(KNOWN_DISCRIMINATING_ENTITY_REGEX) || [];
  for (const sm of specificMatches) {
    if (!GENERIC_DOMAIN_WORDS.has(sm)) {
      entities.add(sm);
    }
  }

  // 3. Sustantivos discriminadores del tema (concepto evaluado) que no son palabras genéricas ni de relleno
  if (concept && concept.trim().length >= 3) {
    const cTokens = normalizeForMatch(concept).split(/\s+/).filter(Boolean);
    for (const w of cTokens) {
      const clean = w.replace(/[^a-z0-9]/g, '');
      if (
        clean.length >= 3 &&
        !SPANISH_STOPWORDS.has(clean) &&
        !GENERIC_BOILERPLATE.test(clean) &&
        !GENERIC_DOMAIN_WORDS.has(clean) &&
        !/^\d+$/.test(clean)
      ) {
        entities.add(clean);
      }
    }
  }

  return entities;
}

/**
 * Normaliza y divide un fragmento documental en oraciones coherentes preservando abreviaturas y líneas/viñetas
 */
export function splitDocumentIntoSentences(text: string): string[] {
  if (!text) return [];

  let protectedText = text
    .replace(/\r\n/g, '\n')
    .replace(/(^|\n)\s*(#{1,6}\s+[^\n]+)/g, '$1\n\n$2\n\n');

  for (const [pattern, placeholder] of ABBREVIATION_PLACEHOLDERS) {
    protectedText = protectedText.replace(pattern, placeholder);
  }

  // Segmentar por fin de oración, saltos de párrafo, o saltos de línea de viñetas/ítems de diapositiva
  const rawSegments = protectedText
    .split(/(?:(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚÑ"«0-9(•\-])|\n\s*\n|\n(?=\s*(?:[•●▪\-*]|\d+[.)]|[A-ZÁÉÍÓÚÑ])))/)
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
    clean = clean.replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ').trim();
    if (clean.length >= 8) {
      restored.push(clean);
    }
  }

  if (restored.length === 0) {
    return text.split(/\n+/).map(s => s.replace(/^#{1,6}\s+/, '').trim()).filter(s => s.length >= 8);
  }

  return restored;
}

/**
 * Divide un bloque en subunidades preservando el separador original (\n vs espacio) para reconstrucción exacta
 */
function splitIntoPreservedUnits(text: string): Array<{ text: string; sepBefore: string }> {
  if (!text) return [];

  let protectedText = text.replace(/\r\n/g, '\n');
  for (const [pattern, placeholder] of ABBREVIATION_PLACEHOLDERS) {
    protectedText = protectedText.replace(pattern, placeholder);
  }

  // Cortar por fin de oración, doble salto de línea, salto tras puntuación o salto hacia nueva línea/viñeta de diapositiva
  // sin romper saltos blandos de PDF (ej. palabras en minúscula o tras preposiciones colgantes)
  const SPLIT_TOKEN = '<<<UNIT_SEP>>>';
  const DANGLING_CONNECTOR = /\b(?:de|del|la|el|los|las|un|una|unos|unas|en|con|por|para|y|o|a|al|e|u|ni|que|como|sobre|entre|hasta|hacia|desde|durante|mediante|tras|según|sin)$/i;

  const marked = protectedText.replace(
    /(?<=[.?!])(\s+)(?=[A-ZÁÉÍÓÚÑ"«0-9(•\-*])|(\n\s*\n+)|(\n+)(?=\s*(?:[•●▪\-*]|\d+[.)]|[A-ZÁÉÍÓÚÑ]))/g,
    (fullMatch, ws, dblNl, nlBeforeItem, offset: number, fullStr: string) => {
      if (ws || dblNl) {
        return `${SPLIT_TOKEN}${ws || dblNl}${SPLIT_TOKEN}`;
      }
      if (nlBeforeItem) {
        const beforeTrim = fullStr.slice(0, offset).trimEnd();
        const afterTrim = fullStr.slice(offset + fullMatch.length).trimStart();
        const endsWithPunct = /[.?!:;]$/.test(beforeTrim);
        const startsBullet = /^(?:[•●▪\-*]|\d+[.)])\s/.test(afterTrim);
        const isDangling = !endsWithPunct && !startsBullet && (beforeTrim.endsWith(',') || DANGLING_CONNECTOR.test(beforeTrim));
        if (!isDangling) {
          return `${SPLIT_TOKEN}${nlBeforeItem}${SPLIT_TOKEN}`;
        }
      }
      return fullMatch;
    }
  );

  const restorePlaceholders = (s: string): string => {
    let clean = s;
    for (const [, placeholder, original] of ABBREVIATION_PLACEHOLDERS) {
      if (placeholder === '$1__DOT__$2') {
        clean = clean.replace(/__DOT__/g, '.');
      } else {
        clean = clean.split(placeholder).join(original);
      }
    }
    return clean;
  };

  const chunks = marked.split(SPLIT_TOKEN);
  const units: Array<{ text: string; sepBefore: string }> = [];
  let pendingSep = '';

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i];
    if (i % 2 === 1) {
      pendingSep = part;
    } else {
      const trimmed = restorePlaceholders(part).trim();
      if (trimmed) {
        units.push({
          text: trimmed,
          sepBefore: units.length === 0 ? '' : (pendingSep || ' '),
        });
      }
      pendingSep = '';
    }
  }

  if (units.length === 0 && text.trim()) {
    return [{ text: text.trim(), sepBefore: '' }];
  }
  return units;
}

/**
 * Normaliza términos médicos para equiparar variantes fonéticas y sinónimos clínicos
 */
export function normalizeMedicalTerm(token: string): string {
  if (!token) return '';
  const clean = token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^gl[ui]c[oas][sc]ila\w*$/.test(clean) || /^gl[ui]cad\w*$/.test(clean)) return 'norm_glucosilad';
  if (/^(hb)?[-_]?a1c$/i.test(clean)) return 'norm_hba1c';
  if (/^hemoglobin\w*$/.test(clean)) return 'norm_hemoglobina';
  if (/^gl[ui]c[eo]m\w*$/.test(clean) || /^glucos\w*$/.test(clean)) return 'norm_glucosa';
  if (/^estatin\w*$/.test(clean)) return 'norm_estatina';
  if (/^oatp\w*$/.test(clean)) return 'norm_oatp1b1';
  if (/^hmg[-_]?coa\w*$/.test(clean)) return 'norm_hmgcoa';
  if (/^cyp\w*$/.test(clean)) return 'norm_cyp';
  if (/^miopat\w*$/.test(clean)) return 'norm_miopatia';
  if (/^hipotiroid\w*$/.test(clean)) return 'norm_hipotiroidismo';
  if (/^peptid\w*$/.test(clean)) return 'norm_peptido';
  return clean;
}

/**
 * Extrae tokens sustantivos sin acentos ni stopwords, con normalización médica y de-hyphenation
 */
export function extractMeaningfulTokens(text: string): Set<string> {
  if (!text) return new Set();

  const ocrClean = normalizeOcrForMatching(text);
  const normalized = ocrClean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ');

  const words = normalized
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, '').trim())
    .filter(w => {
      if (SPANISH_STOPWORDS.has(w)) return false;
      // Permitir números clave (dosis, años, horas: "24", "15", "2") aunque tengan 1-2 dígitos
      if (/^\d+$/.test(w)) return w.length >= 1;
      return w.length >= 3;
    });

  const result = new Set<string>();
  for (const w of words) {
    result.add(w);
    const medNorm = normalizeMedicalTerm(w);
    if (medNorm && medNorm !== w) {
      result.add(medNorm);
    }
    // Si quedó algún dígito residual entre letras por OCR (ej. protam1na), indexar también variante 'i' y 'm'
    if (/[a-z]1[a-z]/.test(w)) {
      result.add(w.replace(/1/g, 'i'));
      result.add(w.replace(/1/g, 'm'));
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

export interface HighlightTarget {
  answerText: string;
  questionText?: string;
  concept?: string;
  exactCitation?: string;
  requiredTokens?: Set<string>;
}

/**
 * Limpia marcas técnicas [Página X] / [Diapositiva X] del texto visible de un párrafo sin destruir saltos de línea
 */
export function cleanVisibleParagraphMarkers(text: string): string {
  if (!text) return '';
  return cleanDocumentText(text)
    .replace(/\r\n/g, '\n')
    .replace(/\[(?:Página|Diapositiva)\s+\d+\]\s*/gi, '')
    .replace(/^=== MATERIAL DE ESTUDIO\s+\d+:[^\n]+===\s*/gim, '')
    .replace(/(\*{1,2}|_{1,2})#{1,6}\s*/g, '$1')
    .replace(/(^|\n)\s*#{1,6}\s*/g, '$1')
    // Unir saltos de línea blandos de columnas/PDF cuando continúa en minúscula sin ser viñeta
    .replace(/(?<![.!?:;\n])\n(?=[a-záéíóúñ(,])/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Puntúa una unidad o cláusula frente a un objetivo de respuesta específico
 */
function scoreUnitAgainstTarget(
  unit: string,
  target: HighlightTarget,
  answerTokens: Set<string>,
  queryTokens: Set<string>,
  conceptTokens: Set<string>
): { score: number; answerMatches: number } {
  const unitTokens = extractMeaningfulTokens(unit);
  if (unitTokens.size === 0) return { score: 0, answerMatches: 0 };

  let score = 0;
  let answerMatches = 0;
  const normUnit = normalizeForMatch(unit);

  // 1. Tokens específicos de la respuesta (peso dominante)
  for (const t of answerTokens) {
    if (unitTokens.has(t)) {
      const isSpecific = /^\d+$/.test(t) || t.length >= 6 || t.startsWith('norm_');
      score += isSpecific ? 36.0 : 24.0;
      answerMatches++;
    }
  }

  // 2. Tokens obligatorios (ej. términos exactos en drag-drop o término del par en matching)
  if (target.requiredTokens && target.requiredTokens.size > 0) {
    let reqMatched = 0;
    for (const rt of target.requiredTokens) {
      if (unitTokens.has(rt)) {
        score += 42.0;
        reqMatched++;
        answerMatches++;
      }
    }
    if (reqMatched === target.requiredTokens.size) {
      score += 55.0; // Todas las piezas requeridas en la misma unidad
    }
  }

  // 3. Coincidencia de frase / bigramas literales de la respuesta
  if (target.answerText && target.answerText.length >= 4) {
    const normAnswer = normalizeForMatch(target.answerText);
    if (normAnswer.length >= 8 && normUnit.includes(normAnswer.slice(0, 28))) {
      score += 75.0;
      answerMatches += 2;
    } else {
      const ansWords = normAnswer
        .split(/\s+/)
        .filter(w => (w.length >= 3 || /^\d+$/.test(w)) && !SPANISH_STOPWORDS.has(w));
      for (let i = 0; i < ansWords.length - 1; i++) {
        const bigram = `${ansWords[i]} ${ansWords[i + 1]}`;
        if (normUnit.includes(bigram)) {
          score += 24.0;
          answerMatches++;
        }
      }
    }
  }

  // 4. Coincidencia de entidades discriminadoras nucleares (ej. "NPH", "FOXO1", "glargina", "lispro")
  // Evita confundir fármacos o conceptos hermanos que comparten vocabulario farmacéutico genérico ("insulina", "subcutánea", "horas")
  const discEntities = extractDiscriminatingEntities(target.questionText || '', target.concept || '');
  let discMatches = 0;
  for (const dt of discEntities) {
    if (unitTokens.has(dt) || normUnit.includes(dt)) {
      score += 110.0;
      discMatches++;
      answerMatches++;
    }
  }

  // 5. Coincidencia de concepto evaluado (ayuda a desambiguar cuando dos líneas mencionan números parecidos)
  for (const t of conceptTokens) {
    if (unitTokens.has(t)) {
      const weight = GENERIC_DOMAIN_WORDS.has(t) ? 1.0 : t.startsWith('norm_') ? 8.0 : 5.0;
      score += weight;
    }
  }

  // 6. Coincidencia con cita exacta si la provee la IA (peso menor que la respuesta directa para no apagar discriminación sub-oracional)
  if (target.exactCitation && target.exactCitation.length >= 10) {
    const normCit = normalizeForMatch(target.exactCitation);
    if (normUnit.includes(normCit.slice(0, 30)) || normCit.includes(normUnit.slice(0, 30))) {
      score += 14.0;
    }
  }

  // 7. Tokens discriminadores de la pregunta (bajo peso para evitar resaltar premisas sin respuesta)
  for (const t of queryTokens) {
    if (unitTokens.has(t)) {
      score += GENERIC_BOILERPLATE.test(t) || GENERIC_DOMAIN_WORDS.has(t) ? 0.2 : 1.5;
    }
  }

  // Si la pregunta evalúa específicamente una entidad discriminadora (ej. "NPH"), pero esta unidad NO la menciona
  // y en cambio menciona otra variante farmacológica/sustantiva competidora ("regular", "lispro", "aspart"), penalizar fuerte
  if (discEntities.size > 0 && discMatches === 0) {
    const SIBLING_ENTITIES = /\b(?:regular|cristalina|lispro|aspart|glulisina|glargina|detemir|degludec|nph|metformina|glibenclamida|glipizida|sitagliptina|exenatida|liraglutida|empagliflozina|pioglitazona)\b/i;
    if (SIBLING_ENTITIES.test(normUnit)) {
      score *= 0.08;
    } else {
      score *= 0.45;
    }
  }

  // Penalización severa si la oración NO contiene ningún token de la respuesta esperada
  if ((answerTokens.size > 0 || (target.requiredTokens && target.requiredTokens.size > 0)) && answerMatches === 0) {
    score = Math.min(0.4, score * 0.05);
  }

  // Penalización por ruido OCR de diagramas químicos / figuras escaneadas rotas
  score *= computeOcrNoiseMultiplier(unit);

  return { score, answerMatches };
}

/**
 * Aisla y envuelve en **...** ÚNICAMENTE la cláusula más específica dentro de una oración o línea larga
 * cuando existen delimitadores claros (`:`, `;`, `, mientras que`, etc.) y un segmento concentra la respuesta.
 */
function isolateClauseHighlightInUnit(
  cleanUnit: string,
  targets: Array<{ target: HighlightTarget; answerTokens: Set<string>; queryTokens: Set<string>; conceptTokens: Set<string> }>
): string {
  // Conservar eventual prefijo de viñeta ("• ", "- ", "1. ") fuera de la negrita para mayor limpieza visual
  const bulletMatch = cleanUnit.match(/^([•●▪\-*]\s+|\d+[.)]\s+)/);
  const bulletPrefix = bulletMatch ? bulletMatch[1] : '';
  const body = bulletPrefix ? cleanUnit.slice(bulletPrefix.length) : cleanUnit;

  // Caso especial: prefijo tipo etiqueta "Concepto clave: explicación real..." -> intentar aislar el cuerpo si ahí está la respuesta
  const colonIdx = body.indexOf(': ');
  if (colonIdx > 2 && colonIdx < 55 && body.length > colonIdx + 22) {
    const head = body.slice(0, colonIdx + 1); // "Concepto clave:"
    const tail = body.slice(colonIdx + 2);
    const tailScore = targets.reduce((acc, item) => {
      return acc + scoreUnitAgainstTarget(tail, item.target, item.answerTokens, item.queryTokens, item.conceptTokens).score;
    }, 0);
    const headScore = targets.reduce((acc, item) => {
      return acc + scoreUnitAgainstTarget(head, item.target, item.answerTokens, item.queryTokens, item.conceptTokens).score;
    }, 0);

    // Si el cuerpo tras los dos puntos concentra la respuesta (o es definición/mecanismo), resaltar solo el cuerpo tras ": "
    if (tailScore > 0 && tailScore >= headScore * 1.15) {
      const refinedTail = isolateSubClause(tail, targets);
      return `${bulletPrefix}${head} ${refinedTail}`;
    }
  }

  // Para unidades largas o párrafos de 1 sola oración, intentar corte por delimitadores sintácticos fuertes
  if (body.length >= 75) {
    return `${bulletPrefix}${isolateSubClause(body, targets)}`;
  }

  return wrapCleanBold(body, bulletPrefix);
}

function wrapCleanBold(span: string, prefix: string = ''): string {
  const leadWs = span.match(/^\s*/)?.[0] || '';
  const trailWs = span.match(/\s*$/)?.[0] || '';
  const core = span.trim();
  if (!core) return `${prefix}${span}`;
  // Sacar puntuación terminal externa para resaltar limpio sin romper renderizado
  const punctMatch = core.match(/^([\s\S]*?)([.;:,!?]*)$/);
  const inner = punctMatch ? punctMatch[1].trim() : core;
  const punct = punctMatch ? punctMatch[2] : '';
  if (!inner || inner.length < 3) return `${prefix}${span}`;
  return `${prefix}${leadWs}**${inner}**${punct}${trailWs}`;
}

function isolateSubClause(
  body: string,
  targets: Array<{ target: HighlightTarget; answerTokens: Set<string>; queryTokens: Set<string>; conceptTokens: Set<string> }>
): string {
  // 1. Si es una tabla PDF aplastada sin puntos/saltos (ej. "Tabla 37-2 ... Insulina lispro 15 min ... Insulina aspart 10 min ..."),
  // aislar ÚNICAMENTE la fila específica que responde en lugar de iluminar toda la tabla
  const SPLIT_MARKER = '<<<CL_SEP>>>';
  let delimited = body;

  const isFlattenedTable =
    body.length > 150 &&
    /(?:Tabla\s+\d+|INICIO\s+EFECTO|DURACI[OÓ]N|[1I]\s*nsul\s*in\s*a\s+(?:li\s*spro|aspart|glul\s*isina|regular|NPH|gla\s*rgina|detemir))/i.test(body);

  if (isFlattenedTable) {
    delimited = body.replace(
      /(?<!^)\s+(?=(?:An[aá]logos?\s+de\s+acci[oó]n|[1I]\s*nsul\s*in\s*as?\s+de\s+acci[oó]n|[1I]\s*nsul\s*in\s*a\s+(?:li\s*spro|aspart|glul\s*isina|regular|NPH|gla\s*rgina|detemir|degludec)|Adaptado\s+de\b))/gi,
      (m) => `${SPLIT_MARKER}${m}${SPLIT_MARKER}`
    );
  }

  // 2. Dividir también por delimitadores sintácticos fuertes (; y conectores explicativos)
  if (!delimited.includes(SPLIT_MARKER)) {
    delimited = body.replace(
      /(;\s+|(?<=[^0-9]),\s+(?=(?:mientras\s+que|a\s+diferencia\s+de|sin\s+embargo|aunque|debido\s+a|ya\s+que|puesto\s+que|lo\s+cual|los\s+cuales|las\s+cuales|la\s+cual|el\s+cual|donde|cuya|cuyo|por\s+lo\s+que|pero\s+el\s+hecho|excepto|salvo|siendo|mediante|produc[ei]|inhib[ei]|activ[ao]|induc[ei]|reduc[ei]|aument[ao]|mediad[ao]|caracteriz[aá]ndose|presenta)\b)|(?<=.{35}),\s+(?=.{22,}))/gi,
      (m) => `${SPLIT_MARKER}${m}${SPLIT_MARKER}`
    );
  }

  const rawParts = delimited.split(SPLIT_MARKER);
  if (rawParts.length < 3) {
    // Sin cláusulas claras suficientemente largas: resaltar la oración/parte completa limpiamente
    return wrapCleanBold(body);
  }

  const clauses: Array<{ text: string; sepBefore: string }> = [];
  let sep = '';
  for (let i = 0; i < rawParts.length; i++) {
    if (i % 2 === 1) {
      sep = rawParts[i];
    } else if (rawParts[i].length > 0) {
      clauses.push({ text: rawParts[i], sepBefore: clauses.length === 0 ? '' : sep });
      sep = '';
    }
  }

  if (clauses.length < 2) return wrapCleanBold(body);

  const clauseScores = clauses.map(c =>
    targets.reduce((acc, item) => {
      return acc + scoreUnitAgainstTarget(c.text, item.target, item.answerTokens, item.queryTokens, item.conceptTokens).score;
    }, 0)
  );

  let bestClauseIdx = 0;
  let bestScore = -1;
  let secondBest = -1;
  for (let i = 0; i < clauseScores.length; i++) {
    if (clauseScores[i] > bestScore) {
      secondBest = bestScore;
      bestScore = clauseScores[i];
      bestClauseIdx = i;
    } else if (clauseScores[i] > secondBest) {
      secondBest = clauseScores[i];
    }
  }

  const winClause = clauses[bestClauseIdx];
  // Aislar ÚNICAMENTE si una cláusula específica domina claramente la respuesta y no deja fragmentos microscópicos
  if (
    bestScore > 0 &&
    winClause.text.trim().length >= 16 &&
    winClause.text.trim().length <= body.length * 0.8 &&
    (secondBest <= 0 || bestScore >= secondBest * 1.35)
  ) {
    return clauses
      .map((c, idx) => `${c.sepBefore}${idx === bestClauseIdx ? wrapCleanBold(c.text) : c.text}`)
      .join('');
  }

  return wrapCleanBold(body);
}

/**
 * Resalta dentro de un párrafo específico ÚNICAMENTE la oración o cláusula exacta que dice la respuesta.
 * Para múltiples objetivos (ej. multi-select o drag-drop multi-cláusula en 1 párrafo), marca la unidad exacta de cada objetivo.
 */
export function highlightAnswerInParagraph(
  paragraphText: string,
  targets: HighlightTarget[]
): {
  cleanParagraph: string;
  highlightedParagraph: string;
  bestSpanText: string;
  bestScore: number;
} {
  // Eliminar marcas Markdown preexistentes y tags de página redundantes en vista
  const rawClean = cleanVisibleParagraphMarkers(paragraphText).replace(/\*{2,}/g, '').trim();
  if (!rawClean) {
    return { cleanParagraph: '', highlightedParagraph: '', bestSpanText: '', bestScore: 0 };
  }

  const validTargets = targets.filter(t =>
    (t.answerText && t.answerText.trim().length > 0) ||
    (t.requiredTokens && t.requiredTokens.size > 0) ||
    (t.exactCitation && t.exactCitation.trim().length >= 8)
  );

  if (validTargets.length === 0) {
    return {
      cleanParagraph: rawClean,
      highlightedParagraph: rawClean,
      bestSpanText: rawClean,
      bestScore: 0,
    };
  }

  const compiledTargets = validTargets.map(target => ({
    target,
    answerTokens: extractMeaningfulTokens(target.answerText),
    queryTokens: extractMeaningfulTokens(target.questionText || ''),
    conceptTokens: extractMeaningfulTokens(target.concept || ''),
  }));

  const units = splitIntoPreservedUnits(rawClean);
  if (units.length === 0) {
    return {
      cleanParagraph: rawClean,
      highlightedParagraph: wrapCleanBold(rawClean),
      bestSpanText: rawClean,
      bestScore: 0,
    };
  }

  // Asignar a cada objetivo su unidad ganadora individual (permite resaltar 2 partes distintas para 2 respuestas correctas en multi-select)
  const winningTargetsByUnit = new Map<number, typeof compiledTargets>();
  let globalBestScore = 0;
  let globalBestSpan = units[0].text;

  for (const item of compiledTargets) {
    let bestIdx = 0;
    let maxScore = -1;
    for (let i = 0; i < units.length; i++) {
      // Evitar seleccionar como respuesta líneas puramente de título o rótulo ("Tabla 37-2.", "Figura 37-1.") si existen oraciones descriptivas
      const trimmedUnitText = units[i].text.trim();
      const isPureShortTitle =
        units.length > 1 &&
        trimmedUnitText.length < 52 &&
        (/^(?:Tabla|Figura|Cuadro|Esquema|Gr[aá]fico|Cap[ií]tulo|Secci[oó]n)\s+[\dA-Za-z.\-]+$/i.test(trimmedUnitText) ||
          (!/[.?!:]/.test(trimmedUnitText) && i === 0));
      const penalty = isPureShortTitle ? 0.12 : 1.0;

      const { score } = scoreUnitAgainstTarget(
        units[i].text,
        item.target,
        item.answerTokens,
        item.queryTokens,
        item.conceptTokens
      );
      const effective = score * penalty;
      if (effective > maxScore) {
        maxScore = effective;
        bestIdx = i;
      }
    }

    if (maxScore > globalBestScore) {
      globalBestScore = maxScore;
      globalBestSpan = units[bestIdx].text;
    }

    const list = winningTargetsByUnit.get(bestIdx) || [];
    list.push(item);
    winningTargetsByUnit.set(bestIdx, list);
  }

  const rebuilt = units
    .map((u, idx) => {
      const assigned = winningTargetsByUnit.get(idx);
      if (!assigned || assigned.length === 0) {
        return `${u.sepBefore}${u.text}`;
      }
      return `${u.sepBefore}${isolateClauseHighlightInUnit(u.text, assigned)}`;
    })
    .join('');

  return {
    cleanParagraph: rawClean,
    highlightedParagraph: rebuilt,
    bestSpanText: globalBestSpan,
    bestScore: globalBestScore,
  };
}

export interface ExtractedParagraph {
  heading?: string;
  body: string;
  rawParagraph: string;
}

/**
 * Segmenta un chunk o documento en párrafos reales coherentes manteniendo su jerarquía y sin fusionar diapositivas.
 */
export function splitTextIntoParagraphs(text: string): ExtractedParagraph[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n');

  const rawBlocks = normalized
    .split(/(?=(?:^|\n)(?:##\s+Diapositiva\s+\d+|\[Página\s+\d+\]|\[Diapositiva\s+\d+\]|=== MATERIAL DE ESTUDIO|#{1,3}\s+)|\[Página\s+\d+\]|\[Diapositiva\s+\d+\]|##\s+Diapositiva\s+\d+|\n\s*\n+)/g)
    .map(b => b.trim())
    .filter(Boolean);

  const paragraphs: ExtractedParagraph[] = [];
  let pendingHeading: string | undefined = undefined;
  let pendingPagePrefix = '';

  for (const block of rawBlocks) {
    // Bloque que es únicamente una etiqueta [Página N] o [Diapositiva N]
    if (/^(?:\[?(?:Página|Diapositiva)\s+\d+\]?|=== MATERIAL DE ESTUDIO[^\n]*===)\s*$/i.test(block)) {
      pendingPagePrefix = `${pendingPagePrefix ? pendingPagePrefix + '\n' : ''}${block}`;
      continue;
    }

    // Extraer posible encabezado inicial dentro del bloque
    const lines = block.split('\n');
    let startIdx = 0;
    let blockHeading: string | undefined = undefined;

    for (let i = 0; i < Math.min(2, lines.length); i++) {
      const l = lines[i].trim();
      if (/^\[(?:Página|Diapositiva)\s+\d+\]$/i.test(l)) {
        pendingPagePrefix = `${pendingPagePrefix ? pendingPagePrefix + '\n' : ''}${l}`;
        startIdx = i + 1;
        continue;
      }
      if (/^#{1,6}\s+/.test(l)) {
        blockHeading = l.replace(/^#{1,6}\s+/, '').trim();
        startIdx = i + 1;
      }
    }

    const bodyLines = lines.slice(startIdx).join('\n').trim();
    const effectiveHeading = blockHeading || pendingHeading;

    // Si era solo un título sin contenido debajo, guardarlo para adjuntarlo al siguiente párrafo real
    if (!bodyLines || bodyLines.length < 15) {
      if (blockHeading) {
        pendingHeading = blockHeading;
      } else if (bodyLines && bodyLines.length <= 70 && !/[.?!]$/.test(bodyLines)) {
        pendingHeading = bodyLines;
      } else if (bodyLines) {
        paragraphs.push({
          heading: effectiveHeading,
          body: bodyLines,
          rawParagraph: `${pendingPagePrefix ? pendingPagePrefix + '\n' : ''}${block}`,
        });
        pendingHeading = undefined;
        pendingPagePrefix = '';
      }
      continue;
    }

    paragraphs.push({
      heading: effectiveHeading,
      body: bodyLines,
      rawParagraph: `${pendingPagePrefix ? pendingPagePrefix + '\n' : ''}${block}`,
    });
    pendingHeading = undefined;
    pendingPagePrefix = '';
  }

  return paragraphs;
}

/**
 * Dada una colección de párrafos y criterios objetivo, selecciona el párrafo específico completo
 * (recortando de forma natural a una ventana de ~3-5 oraciones SOLO si el bloque original es descomunal, ej. > 800 chars).
 */
function selectBestParagraphFromChunk(
  chunkText: string,
  targets: HighlightTarget[],
  preferredTerm?: string
): {
  heading?: string;
  paragraphBody: string;
  rawAnchorForPage: string;
  highlightedParagraph: string;
  bestSpanText: string;
  score: number;
  matchQuality: 'high' | 'medium' | 'low';
} {
  let paragraphs = splitTextIntoParagraphs(chunkText);
  if (paragraphs.length === 0) {
    paragraphs = [{ body: chunkText.trim(), rawParagraph: chunkText.trim() }];
  }

  const compiled = targets.map(t => ({
    target: t,
    answerTokens: extractMeaningfulTokens(t.answerText),
    queryTokens: extractMeaningfulTokens(t.questionText || ''),
    conceptTokens: extractMeaningfulTokens(t.concept || ''),
  }));

  const preferredTokens = preferredTerm ? extractMeaningfulTokens(preferredTerm) : new Set<string>();
  const globalDiscEntities = new Set<string>();
  for (const t of targets) {
    for (const e of extractDiscriminatingEntities(t.questionText || '', t.concept || '')) {
      globalDiscEntities.add(e);
    }
  }

  let bestParaIdx = 0;
  let maxParaScore = -1;

  for (let i = 0; i < paragraphs.length; i++) {
    const pText = `${paragraphs[i].heading ? paragraphs[i].heading + ' ' : ''}${paragraphs[i].body}`;
    let paraScore = 0;

    // Puntuar tomando el máximo/suma de sus mejores oraciones para cada target
    const units = splitIntoPreservedUnits(pText);
    for (const item of compiled) {
      let bestUnitScore = 0;
      for (const u of units) {
        const { score } = scoreUnitAgainstTarget(
          u.text,
          item.target,
          item.answerTokens,
          item.queryTokens,
          item.conceptTokens
        );
        if (score > bestUnitScore) bestUnitScore = score;
      }
      paraScore += bestUnitScore;
    }

    const pTokens = extractMeaningfulTokens(pText);
    const normPara = normalizeForMatch(pText);

    // Bonus fuerte si contiene explícitamente el término emparejado buscado
    if (preferredTokens.size > 0) {
      const normTerm = normalizeForMatch(preferredTerm || '');
      let prefMatches = 0;
      for (const pt of preferredTokens) {
        if (pTokens.has(pt)) prefMatches++;
      }
      if (normTerm.length >= 3 && normPara.includes(normTerm)) {
        paraScore += 90.0;
      } else if (prefMatches > 0) {
        paraScore += 55.0 * (prefMatches / preferredTokens.size);
      }
    }

    // Bonus/penalización por entidad discriminadora nuclear (evita elegir "insulina regular" si pregunta por "NPH")
    if (globalDiscEntities.size > 0) {
      let discHits = 0;
      for (const de of globalDiscEntities) {
        if (pTokens.has(de) || normPara.includes(de)) discHits++;
      }
      if (discHits > 0) {
        paraScore += 120.0 * (discHits / globalDiscEntities.size);
      } else {
        paraScore *= 0.25;
      }
    }

    // Penalizar fuertemente bloques con ruido OCR de diagramas químicos / fórmulas rotas
    paraScore *= computeOcrNoiseMultiplier(pText);

    if (paraScore > maxParaScore) {
      maxParaScore = paraScore;
      bestParaIdx = i;
    }
  }

  const chosen = paragraphs[bestParaIdx];
  let paragraphBody = chosen.body;

  // Si un bloque proviene de texto sin formato o PDF antiguo aplastado (> 780 chars o > 6 oraciones),
  // acotarlo a un párrafo específico natural (ventana de 3 a 5 oraciones alrededor de la evidencia)
  if (paragraphBody.length > 780) {
    const units = splitIntoPreservedUnits(paragraphBody);
    if (units.length > 5) {
      let bestUnitIdx = 0;
      let maxUnitScore = -1;
      for (let i = 0; i < units.length; i++) {
        const unitScore = compiled.reduce((sum, item) => {
          return sum + scoreUnitAgainstTarget(
            units[i].text,
            item.target,
            item.answerTokens,
            item.queryTokens,
            item.conceptTokens
          ).score;
        }, 0);
        if (unitScore > maxUnitScore) {
          maxUnitScore = unitScore;
          bestUnitIdx = i;
        }
      }
      let start = Math.max(0, bestUnitIdx - 1);
      let end = Math.min(units.length - 1, bestUnitIdx + 2);
      const sliceText = units.slice(start, end + 1).map((u, idx) => (idx === 0 ? u.text : `${u.sepBefore}${u.text}`)).join('');
      paragraphBody = `${start > 0 ? '… ' : ''}${sliceText.trim()}${end < units.length - 1 ? ' …' : ''}`;
    }
  }

  const hl = highlightAnswerInParagraph(paragraphBody, targets);
  const effectiveScore = Math.max(maxParaScore, hl.bestScore);
  const matchQuality: 'high' | 'medium' | 'low' =
    effectiveScore >= 30 ? 'high' : effectiveScore >= 8 ? 'medium' : 'low';

  return {
    heading: chosen.heading,
    paragraphBody: hl.cleanParagraph || paragraphBody,
    rawAnchorForPage: chosen.rawParagraph || hl.bestSpanText || paragraphBody,
    highlightedParagraph: hl.highlightedParagraph || paragraphBody,
    bestSpanText: hl.bestSpanText,
    score: effectiveScore,
    matchQuality,
  };
}

/**
 * Puntúa una oración individual (compatibilidad con llamadores existentes)
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
  const { score } = scoreUnitAgainstTarget(
    sentence,
    {
      answerText: cleanAnswerText,
      questionText: cleanQuestionText,
      exactCitation,
    },
    answerTokens,
    queryTokens,
    conceptTokens
  );

  // Bonus por cita textual exacta en extractSpecificPassage legacy
  let total = score;
  if (exactCitation && exactCitation.length >= 8) {
    const normSentence = normalizeForMatch(sentence);
    const normCitation = normalizeForMatch(exactCitation);
    if (normSentence.includes(normCitation.slice(0, 30)) || normCitation.includes(normSentence.slice(0, 30))) {
      total += 160.0;
    } else {
      const citTokens = extractMeaningfulTokens(exactCitation);
      const sentTokens = extractMeaningfulTokens(sentence);
      let citMatches = 0;
      for (const t of citTokens) {
        if (sentTokens.has(t)) citMatches++;
      }
      if (citMatches > 0 && citTokens.size > 0) {
        const ratio = citMatches / citTokens.size;
        if (ratio >= 0.35) total += 110.0 * ratio;
      }
    }
  }

  const sentenceTokens = extractMeaningfulTokens(sentence);
  const lengthDampener = Math.min(1.2, Math.max(0.7, 40 / Math.max(1, sentenceTokens.size)));
  return total * lengthDampener;
}

/**
 * Extrae el párrafo específico más representativo resaltando ÚNICAMENTE la parte que responde la pregunta.
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
    const fallback = cleanVisibleParagraphMarkers(fullText.slice(0, 350));
    const hl = highlightAnswerInParagraph(fallback, [{ answerText: correctAnswer || question, questionText: question, concept, exactCitation }]);
    return {
      excerpt: hl.cleanParagraph || fallback,
      highlightedExcerpt: hl.highlightedParagraph || fallback,
      score: 0,
      matchQuality: 'low',
      sentenceIndices: [],
      allSentences: [],
      bestSentenceIndex: -1,
    };
  }

  const paraResult = selectBestParagraphFromChunk(fullText, [
    {
      answerText: correctAnswer || exactCitation || question,
      questionText: question,
      concept,
      exactCitation,
    },
  ]);

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

  const composedExcerpt = paraResult.heading && !paraResult.paragraphBody.startsWith(paraResult.heading)
    ? `${paraResult.heading}\n${paraResult.paragraphBody}`
    : paraResult.paragraphBody;
  const composedHighlighted = paraResult.heading && !paraResult.highlightedParagraph.startsWith(paraResult.heading)
    ? `${paraResult.heading}\n${paraResult.highlightedParagraph}`
    : paraResult.highlightedParagraph;

  return {
    excerpt: composedExcerpt,
    highlightedExcerpt: composedHighlighted,
    score: Math.max(maxScore, paraResult.score),
    matchQuality: paraResult.matchQuality,
    sentenceIndices: [bestIdx],
    allSentences: sentences,
    bestSentenceIndex: bestIdx,
  };
}

/**
 * Escanea la totalidad de fragmentos del kit para hallar aquel con mayor anclaje textual directo.
 */
export function findBestChunkAndExcerpt(params: {
  chunks: DocumentChunk[];
  question: string;
  correctAnswer?: string;
  concept?: string;
  preferredChunkId?: string;
  exactCitation?: string;
  preferredTerm?: string;
}): { bestChunk: DocumentChunk | null; passage: SpecificPassageResult } {
  const {
    chunks,
    question,
    correctAnswer = '',
    concept = '',
    preferredChunkId,
    exactCitation = '',
    preferredTerm = '',
  } = params;

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
  const preferredTokens = preferredTerm ? extractMeaningfulTokens(preferredTerm) : new Set<string>();
  const discEntities = extractDiscriminatingEntities(question, concept);

  const evaluateChunk = (chunk: DocumentChunk) => {
    const passage = extractSpecificPassage({
      fullText: chunk.text,
      question,
      correctAnswer,
      concept,
      exactCitation,
    });

    let chunkBonus = 0;
    const normChunk = normalizeForMatch(chunk.text);
    const chunkTokens = extractMeaningfulTokens(chunk.text);

    // 1. Afinidad con término clave obligatorio (determinante en matching multi-fragmento)
    if (preferredTerm && preferredTerm.trim().length >= 2) {
      const normPref = normalizeForMatch(preferredTerm);
      if (normPref.length >= 3 && normChunk.includes(normPref)) {
        chunkBonus += 180.0;
      } else if (preferredTokens.size > 0) {
        let pMatch = 0;
        for (const t of preferredTokens) {
          if (chunkTokens.has(t)) pMatch++;
        }
        if (pMatch > 0) chunkBonus += 120.0 * (pMatch / preferredTokens.size);
      }
    }

    // 1b. Entidades discriminadoras nucleares de la pregunta/concepto (ej. "NPH", "FOXO1", "glargina")
    if (discEntities.size > 0) {
      let discHits = 0;
      for (const de of discEntities) {
        if (chunkTokens.has(de) || normChunk.includes(de)) discHits++;
      }
      if (discHits > 0) {
        chunkBonus += 170.0 * (discHits / discEntities.size);
      }
    }

    // 2. Bonus si contiene la cita textual exacta
    if (exactCitation && exactCitation.trim().length >= 10) {
      const normCit = normalizeForMatch(exactCitation);
      if (normChunk.includes(normCit.slice(0, 28)) || normCit.includes(normChunk.slice(0, 28))) {
        chunkBonus += 420.0;
      } else if (citationTokens.size > 0) {
        let citMatch = 0;
        for (const t of citationTokens) {
          if (chunkTokens.has(t)) citMatch++;
        }
        if (citMatch >= 2) {
          chunkBonus += 220.0 * (citMatch / citationTokens.size);
        }
      }
    }

    // 3. Bonus si el fragmento contiene términos y bigramas de la respuesta correcta
    if (answerTokens.size > 0) {
      let matchCount = 0;
      for (const t of answerTokens) {
        if (chunkTokens.has(t)) matchCount++;
      }
      if (matchCount > 0) {
        chunkBonus += 160.0 * (matchCount / answerTokens.size);
      }
    }

    // Penalización si no contiene tokens de respuesta ni término ni cita ni entidad discriminadora
    let effectiveScore = passage.score + chunkBonus;
    if ((answerTokens.size > 0 || preferredTokens.size > 0 || (exactCitation && exactCitation.length >= 10)) && chunkBonus === 0) {
      effectiveScore = Math.min(2.5, effectiveScore * 0.1);
    }

    // Desfavorecer fragmentos con alto ruido OCR de esquemas rotos
    effectiveScore *= computeOcrNoiseMultiplier(chunk.text);

    return { chunk, passage, effectiveScore };
  };

  let bestEvaluation: { chunk: DocumentChunk; passage: SpecificPassageResult; effectiveScore: number } | null = null;

  for (const chunk of chunks) {
    const evalResult = evaluateChunk(chunk);
    if (!bestEvaluation || evalResult.effectiveScore > bestEvaluation.effectiveScore) {
      bestEvaluation = evalResult;
    }
  }

  if (preferredChunkId && bestEvaluation) {
    const preferredChunk = chunks.find(c => c.id === preferredChunkId);
    if (preferredChunk && preferredChunk.id !== bestEvaluation.chunk.id) {
      const prefTokens = extractMeaningfulTokens(preferredChunk.text);
      const prefHasAnswer =
        (answerTokens.size > 0 && [...answerTokens].some(t => prefTokens.has(t))) ||
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
    passage: bestEvaluation
      ? bestEvaluation.passage
      : extractSpecificPassage({ fullText: chunks[0].text, question, correctAnswer, concept, exactCitation }),
  };
}

/**
 * Normaliza y busca la posición aproximada de un extracto dentro de un texto más amplio
 */
export function findNormalizedSubstringIndex(haystack: string, needle: string): number {
  if (!haystack || !needle) return -1;

  // Limpiar marcas de encabezado/página para ubicar directamente la prosa real dentro del documento
  const strippedNeedle = cleanVisibleParagraphMarkers(needle).replace(/\*\*/g, '').replace(/…/g, '').trim();
  const candidates = [strippedNeedle, needle.replace(/\*\*/g, '').trim()].filter(Boolean);

  for (const cand of candidates) {
    const directIdx = haystack.indexOf(cand);
    if (directIdx !== -1) return directIdx;

    const normHaystack = haystack.toLowerCase().replace(/\s+/g, ' ');
    const normNeedle = cand.toLowerCase().replace(/\s+/g, ' ').trim();
    const normIdx = normHaystack.indexOf(normNeedle);
    if (normIdx !== -1) {
      const ratio = haystack.length / Math.max(1, normHaystack.length);
      return Math.floor(normIdx * ratio);
    }

    const prefix = normNeedle.slice(0, 40).trim();
    if (prefix.length >= 12) {
      const prefixIdx = normHaystack.indexOf(prefix);
      if (prefixIdx !== -1) {
        const ratio = haystack.length / Math.max(1, normHaystack.length);
        return Math.floor(prefixIdx * ratio);
      }
    }

    // Buscar usando una sub-frase intermedia significativa si los primeros caracteres tenían guiones/viñetas
    const words = normNeedle.split(/\s+/).filter(w => w.length >= 4);
    if (words.length >= 4) {
      for (let start = 0; start <= Math.min(3, words.length - 3); start++) {
        const subPhrase = words.slice(start, start + 4).join(' ');
        const subIdx = normHaystack.indexOf(subPhrase);
        if (subIdx !== -1) {
          const ratio = haystack.length / Math.max(1, normHaystack.length);
          return Math.floor(subIdx * ratio);
        }
      }
    }
  }

  return -1;
}

/**
 * Etiquetas ESTRUCTURALES reales de página/diapositiva insertadas por el extractor de PDF/PPTX/DOCX.
 * Impide que referencias casuales dentro de la prosa (ej: "ver pág. 12 del libro") secuestren el número de página.
 */
const STRICT_PAGE_MARKER_REGEX =
  /(?:\[Página\s+(\d+)\]|\[Diapositiva\s+(\d+)\]|##\s*Diapositiva\s+(\d+)\b|(?:^|\n)\s*(?:Página|Diapositiva)\s+(\d+)\b(?=\s*(?::|\n|$)))/gi;

const WEAK_PAGE_REF_REGEX =
  /(?:\bDiapositiva\s+(\d+)|\bPágina\s+(\d+)|\bP[aá]g\.?\s*(\d+)|\bSlide\s+(\d+)|\bPage\s+(\d+))/gi;

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
 * Deduce con máxima precisión la página o diapositiva real a partir del texto estructurado,
 * los chunks originales del documento y el extracto, evitando falsos positivos por menciones en prosa.
 */
export function resolveRealPageNumber(
  fullText?: string,
  excerpt?: string,
  fallbackPage?: number,
  allChunks?: DocumentChunk[]
): number {
  const cleanExcerpt = excerpt ? excerpt.replace(/\*\*/g, '').trim() : '';

  // 1. Si el propio extracto comienza con una etiqueta estructural explícita (ej. "[Página 4]\n..." o "## Diapositiva 4: ...")
  if (cleanExcerpt) {
    const headSlice = cleanExcerpt.slice(0, 80);
    const strictHead = [...headSlice.matchAll(STRICT_PAGE_MARKER_REGEX)];
    if (strictHead.length > 0) {
      const page = extractPageNumberFromMatch(strictHead[0]);
      if (page && page > 0) return page;
    }
  }

  // 2. Prioridad máxima: etiqueta estructural que precede inmediatamente al extracto dentro de fullText
  if (cleanExcerpt && fullText) {
    const matchPos = findNormalizedSubstringIndex(fullText, cleanExcerpt);
    if (matchPos !== -1) {
      const textBefore = fullText.slice(0, Math.max(1, matchPos + 4));
      const strictBefore = [...textBefore.matchAll(STRICT_PAGE_MARKER_REGEX)];
      if (strictBefore.length > 0) {
        const page = extractPageNumberFromMatch(strictBefore[strictBefore.length - 1]);
        if (page && page > 0) return page;
      }
    }
  }

  // 3. Buscar el chunk específico en allChunks (documento original) que contiene el extracto
  if (allChunks && allChunks.length > 0 && cleanExcerpt) {
    for (const chk of allChunks) {
      if (!chk.text) continue;
      const chkPos = findNormalizedSubstringIndex(chk.text, cleanExcerpt);
      if (chkPos !== -1) {
        const textBefore = chk.text.slice(0, Math.max(1, chkPos + 4));
        const strictInChk = [...textBefore.matchAll(STRICT_PAGE_MARKER_REGEX)];
        if (strictInChk.length > 0) {
          const page = extractPageNumberFromMatch(strictInChk[strictInChk.length - 1]);
          if (page && page > 0) return page;
        }
        if (typeof chk.pageOrSlide === 'number' && chk.pageOrSlide > 0) {
          return chk.pageOrSlide;
        }
      }
    }
  }

  // 4. Si fullText completo tiene etiquetas estructurales (ej. bloque de una única diapositiva/página)
  if (fullText) {
    const strictAll = [...fullText.matchAll(STRICT_PAGE_MARKER_REGEX)];
    if (strictAll.length > 0) {
      const page = extractPageNumberFromMatch(strictAll[0]);
      if (page && page > 0) return page;
    }
  }

  // 5. Fallback confiable del chunk asociado (metadata real de pageOrSlide generada por chunkDocument)
  if (typeof fallbackPage === 'number' && fallbackPage > 0) {
    return fallbackPage;
  }

  // 6. Último recurso: referencias débiles en prosa
  const refSource = cleanExcerpt || fullText || '';
  if (refSource) {
    const weakMatches = [...refSource.matchAll(WEAK_PAGE_REF_REGEX)];
    if (weakMatches.length > 0) {
      const page = extractPageNumberFromMatch(weakMatches[0]);
      if (page && page > 0) return page;
    }
  }

  return 1;
}

/**
 * Construye una cadena limpia de hechos correctivos cuando una pregunta de Verdadero/Falso es FALSA,
 * removiendo palabras meta como "Falso", "incorrecto", etc., para anclar en la evidencia real que refuta.
 */
function buildTrueFalseRefutationQuery(q: Question): string {
  const parts: string[] = [];
  if (q.sourceExcerpt && q.sourceExcerpt.trim().length >= 12) {
    parts.push(q.sourceExcerpt.trim());
  }
  if (q.googleOverview?.bullets && Array.isArray(q.googleOverview.bullets)) {
    for (const b of q.googleOverview.bullets.slice(0, 2)) {
      const cleanB = b
        .replace(/^(?:verdadero|falso|respuesta exacta|la afirmación es incorrecta|diferenciación conceptual)[:\s-]*/i, '')
        .trim();
      if (cleanB.length >= 15) parts.push(cleanB);
    }
  } else if (q.explanation) {
    const cleanExp = q.explanation
      .replace(/### Búsqueda en Google:[\s\S]*?(?=\n\n|$)/i, '')
      .replace(/\b(?:verdadero|falso|incorrecta|refuta|error conceptual)\b/gi, '')
      .trim();
    if (cleanExp.length >= 15) parts.push(cleanExp.slice(0, 220));
  }
  return parts.join(' ').trim();
}

function findMatchingAssetForChunk(
  chunk: DocumentChunk | null,
  question: Question,
  assets: DocumentAsset[] = [],
  resolvedPage?: number
): DocumentAsset | undefined {
  if (question.sourceAsset) {
    // Asegurar coherencia de página: nunca vincular una figura de pág. X debajo de un párrafo de pág. Y
    if (!resolvedPage || !question.sourceAsset.pageOrSlide || question.sourceAsset.pageOrSlide === resolvedPage) {
      return question.sourceAsset;
    }
  }
  if (chunk?.assetIds && chunk.assetIds.length > 0 && assets.length > 0) {
    return assets.find(a => chunk.assetIds!.includes(a.id) && (!resolvedPage || !a.pageOrSlide || a.pageOrSlide === resolvedPage));
  }
  return undefined;
}

/**
 * Resuelve la evidencia documental RAG completa y específica para CUALQUIER tipo de pregunta:
 * - multiple-choice, true-false (V o F), short-answer, drag-drop, multi-select, matching.
 * Retorna una lista ordenada de evidencias con su párrafo específico, resaltado quirúrgico de la
 * parte exacta de la respuesta y página/diapositiva exacta calculada sobre las fuentes reales.
 */
export function resolveQuestionRagEvidences(params: {
  question: Question;
  chunks: DocumentChunk[];
  assets?: DocumentAsset[];
  overrideAnswers?: string[];
}): RagEvidenceItem[] {
  const { question, chunks, assets = [], overrideAnswers } = params;
  const qType = question.type || 'multiple-choice';

  // Asegurar un pool mínimo si aún no hay chunks externos (usando el texto incrustado en la pregunta)
  const effectiveChunks: DocumentChunk[] = [...chunks];
  if (effectiveChunks.length === 0 && question.sourceChunkText) {
    effectiveChunks.push({
      id: question.sourceChunkId || 'q-embedded-chunk',
      chunkIndex: 0,
      pageOrSlide: question.sourcePageOrSlide,
      text: question.sourceChunkText,
      tokenCount: Math.ceil(question.sourceChunkText.length / 4),
    });
  }

  // Utilidad interna para resolver 1 fragmento individual con párrafo completo + highlight quirúrgico + página real
  const resolveSingleEvidence = (args: {
    label?: string;
    term?: string;
    definition?: string;
    queryText: string;
    answerText: string;
    concept?: string;
    exactCitation?: string;
    preferredChunkId?: string;
    preferredTerm?: string;
    requiredTokens?: Set<string>;
    fallbackPage?: number;
  }): RagEvidenceItem => {
    if (effectiveChunks.length === 0) {
      const fallbackText = args.exactCitation || question.explanation || '';
      const hl = highlightAnswerInParagraph(fallbackText, [
        {
          answerText: args.answerText,
          questionText: args.queryText,
          concept: args.concept,
          exactCitation: args.exactCitation,
          requiredTokens: args.requiredTokens,
        },
      ]);
      return {
        id: args.preferredChunkId || 'rag-fallback',
        label: args.label,
        term: args.term,
        definition: args.definition,
        chunkId: args.preferredChunkId,
        text: hl.cleanParagraph || fallbackText,
        excerpt: hl.bestSpanText || hl.cleanParagraph || fallbackText,
        highlightedExcerpt: hl.highlightedParagraph || fallbackText,
        pageOrSlide: args.fallbackPage || question.sourcePageOrSlide || 1,
        matchQuality: hl.bestScore >= 15 ? 'medium' : 'low',
        asset: question.sourceAsset,
      };
    }

    const { bestChunk } = findBestChunkAndExcerpt({
      chunks: effectiveChunks,
      question: args.queryText,
      correctAnswer: args.answerText,
      concept: args.concept,
      preferredChunkId: args.preferredChunkId,
      exactCitation: args.exactCitation,
      preferredTerm: args.preferredTerm,
    });

    const targetChunk = bestChunk || effectiveChunks[0];
    const para = selectBestParagraphFromChunk(
      targetChunk.text,
      [
        {
          answerText: args.answerText,
          questionText: args.queryText,
          concept: args.concept,
          exactCitation: args.exactCitation,
          requiredTokens: args.requiredTokens,
        },
      ],
      args.preferredTerm
    );

    const resolvedPage = resolveRealPageNumber(
      targetChunk.text,
      para.rawAnchorForPage || para.paragraphBody || args.exactCitation,
      targetChunk.pageOrSlide || args.fallbackPage,
      effectiveChunks
    );

    const displayHighlighted = para.heading && !para.highlightedParagraph.startsWith(para.heading)
      ? `${para.heading}\n${para.highlightedParagraph}`
      : para.highlightedParagraph;
    const displayPlain = para.heading && !para.paragraphBody.startsWith(para.heading)
      ? `${para.heading}\n${para.paragraphBody}`
      : para.paragraphBody;

    // Verificar honestamente si las entidades discriminadoras nucleares de la pregunta realmente están en el texto encontrado
    const discEntities = extractDiscriminatingEntities(args.queryText, args.concept || '');
    let honestQuality = para.matchQuality;
    if (discEntities.size > 0 && !args.term) {
      const normFound = normalizeForMatch(displayPlain);
      const foundTokens = extractMeaningfulTokens(displayPlain);
      const hasDiscMatch = [...discEntities].some(de => foundTokens.has(de) || normFound.includes(de));
      if (!hasDiscMatch) {
        honestQuality = 'low';
      }
    }

    return {
      id: targetChunk.id,
      label: args.label,
      term: args.term,
      definition: args.definition,
      chunkId: targetChunk.id,
      heading: para.heading || targetChunk.heading,
      text: displayPlain,
      excerpt: para.bestSpanText || displayPlain,
      highlightedExcerpt: displayHighlighted,
      pageOrSlide: resolvedPage || 1,
      matchQuality: honestQuality,
      asset: findMatchingAssetForChunk(targetChunk, question, assets, resolvedPage),
    };
  };

  // ── 1. MATCHING (Emparejar): Múltiples fragmentos individuales, cada uno con su párrafo y página exacta ──
  if (qType === 'matching' && Array.isArray(question.matchingPairs) && question.matchingPairs.length > 0) {
    return question.matchingPairs.map((pair, idx) => {
      const cleanTerm = pair.term.trim();
      const cleanDef = pair.definition.trim();
      const reqTokens = extractMeaningfulTokens(cleanTerm);
      return resolveSingleEvidence({
        label: `Par ${idx + 1}: ${cleanTerm}`,
        term: cleanTerm,
        definition: cleanDef,
        queryText: `${cleanTerm}: ${cleanDef}`,
        answerText: `${cleanTerm} ${cleanDef}`,
        concept: cleanTerm,
        preferredTerm: cleanTerm,
        requiredTokens: reqTokens,
        fallbackPage: question.sourcePageOrSlide,
      });
    });
  }

  // ── 2. MULTI-SELECT: Múltiples respuestas correctas (fusiona si caen en mismo párrafo; apila si están en distintos párrafos/páginas) ──
  if (qType === 'multi-select') {
    const indices = Array.isArray(question.correctIndices) && question.correctIndices.length > 0
      ? question.correctIndices
      : (typeof question.correctIndex === 'number' ? [question.correctIndex] : []);
    const opts = Array.isArray(question.options) ? question.options : [];
    const selectedAnswers = (
      overrideAnswers && overrideAnswers.length > 0
        ? overrideAnswers
        : indices.map(i => opts[i]).filter(Boolean)
    );

    if (selectedAnswers.length > 1) {
      const perOptionItems = selectedAnswers.map(ans =>
        resolveSingleEvidence({
          label: `Opción correcta: ${ans}`,
          queryText: question.question,
          answerText: ans,
          concept: question.topic,
          exactCitation: question.sourceExcerpt,
          preferredChunkId: question.sourceChunkId,
          fallbackPage: question.sourcePageOrSlide,
        })
      );

      // Agrupar tarjetas que cayeron en exactamente el mismo párrafo y página para resaltar varias cláusulas dentro del mismo párrafo
      const mergedMap = new Map<string, { item: RagEvidenceItem; answers: string[]; targets: HighlightTarget[] }>();
      for (let i = 0; i < perOptionItems.length; i++) {
        const it = perOptionItems[i];
        const ans = selectedAnswers[i];
        const key = `${it.pageOrSlide}::${it.text.slice(0, 90)}`;
        const targetObj: HighlightTarget = {
          answerText: ans,
          questionText: question.question,
          concept: question.topic,
          exactCitation: question.sourceExcerpt,
        };
        const existing = mergedMap.get(key);
        if (existing) {
          existing.answers.push(ans);
          existing.targets.push(targetObj);
        } else {
          mergedMap.set(key, { item: it, answers: [ans], targets: [targetObj] });
        }
      }

      const consolidated: RagEvidenceItem[] = [];
      for (const group of mergedMap.values()) {
        if (group.targets.length > 1) {
          const reHighlighted = highlightAnswerInParagraph(group.item.text, group.targets);
          consolidated.push({
            ...group.item,
            label: `Opciones correctas respaldadas (${group.answers.length}): ${group.answers.join(' · ')}`,
            highlightedExcerpt: reHighlighted.highlightedParagraph,
          });
        } else {
          consolidated.push(group.item);
        }
      }
      return consolidated;
    }
  }

  // ── 3. TRUE-FALSE: Distinguir si la afirmación es Verdadera o Falsa para no buscar nunca la palabra "Verdadero"/"Falso" ──
  if (qType === 'true-false') {
    const cleanStatement = (question.question || '').replace(/^["'“«]+|["'”»]+$/g, '').trim();
    const isFalse = question.correctIndex === 1;

    if (isFalse) {
      const refutationFact = buildTrueFalseRefutationQuery(question);
      const effectiveAnswer = refutationFact || cleanStatement;
      const subjectTokens = extractMeaningfulTokens(`${question.topic || ''} ${cleanStatement.split(/\s+/).slice(0, 6).join(' ')}`);
      return [
        resolveSingleEvidence({
          label: 'Afirmación Falsa — Evidencia documental que la refuta',
          queryText: `${question.topic || ''} ${cleanStatement}`,
          answerText: effectiveAnswer,
          concept: question.topic,
          exactCitation: question.sourceExcerpt || refutationFact,
          preferredChunkId: question.sourceChunkId,
          requiredTokens: subjectTokens,
          fallbackPage: question.sourcePageOrSlide,
        }),
      ];
    }

    return [
      resolveSingleEvidence({
        label: 'Afirmación Verdadera — Evidencia textual',
        queryText: cleanStatement,
        answerText: cleanStatement,
        concept: question.topic,
        exactCitation: question.sourceExcerpt,
        preferredChunkId: question.sourceChunkId,
        fallbackPage: question.sourcePageOrSlide,
      }),
    ];
  }

  // ── 4. DRAG-DROP: Reconstruir oración completa + tokens obligatorios de blanksCorrect ──
  if (qType === 'drag-drop') {
    const blanks = Array.isArray(question.blanksCorrect) ? question.blanksCorrect.filter(Boolean) : [];
    let completed = question.templateSentence || question.question || '';
    blanks.forEach((b, idx) => {
      completed = completed.replace(new RegExp(`\\{${idx}\\}`, 'g'), b);
    });
    const reqTokens = extractMeaningfulTokens(blanks.join(' '));
    const mainItem = resolveSingleEvidence({
      label: blanks.length > 0 ? `Términos clave completados: ${blanks.join(' · ')}` : undefined,
      queryText: completed,
      answerText: `${completed} ${blanks.join(' ')}`,
      concept: question.topic,
      exactCitation: question.sourceExcerpt || completed,
      preferredChunkId: question.sourceChunkId,
      requiredTokens: reqTokens,
      fallbackPage: question.sourcePageOrSlide,
    });

    // Verificar si algún hueco no aparece en el párrafo principal (ej. comparación entre 2 páginas)
    if (blanks.length >= 2 && effectiveChunks.length > 1) {
      const mainNorm = normalizeForMatch(mainItem.text);
      const missingBlanks = blanks.filter(b => {
        const toks = extractMeaningfulTokens(b);
        return toks.size > 0 && ![...toks].some(t => mainNorm.includes(t));
      });
      if (missingBlanks.length > 0) {
        const extra = resolveSingleEvidence({
          label: `Evidencia complementaria para hueco: ${missingBlanks.join(' · ')}`,
          queryText: `${question.topic || ''} ${missingBlanks.join(' ')}`,
          answerText: `${missingBlanks.join(' ')} ${completed}`,
          concept: missingBlanks[0],
          preferredTerm: missingBlanks[0],
          requiredTokens: extractMeaningfulTokens(missingBlanks.join(' ')),
          fallbackPage: question.sourcePageOrSlide,
        });
        if (extra.text.slice(0, 80) !== mainItem.text.slice(0, 80)) {
          return [mainItem, extra];
        }
      }
    }

    return [mainItem];
  }

  // ── 5. SHORT-ANSWER: Anclar en idealAnswer + keyPoints ──
  if (qType === 'short-answer') {
    const ideal = (question.idealAnswer || '').trim();
    const keys = Array.isArray(question.keyPoints) ? question.keyPoints.join(' ') : '';
    const answerText = `${ideal} ${keys}`.trim() || question.explanation || question.question;
    return [
      resolveSingleEvidence({
        label: ideal ? `Respuesta modelo: ${ideal}` : undefined,
        queryText: question.question,
        answerText,
        concept: question.topic,
        exactCitation: question.sourceExcerpt,
        preferredChunkId: question.sourceChunkId,
        fallbackPage: question.sourcePageOrSlide,
      }),
    ];
  }

  // ── 6. MULTIPLE-CHOICE (Estándar y default) ──
  const answerStr =
    (overrideAnswers && overrideAnswers[0]) ||
    (Array.isArray(question.options) && typeof question.correctIndex === 'number'
      ? question.options[question.correctIndex]
      : '') ||
    question.idealAnswer ||
    '';

  return [
    resolveSingleEvidence({
      queryText: question.question,
      answerText: answerStr,
      concept: question.topic,
      exactCitation: question.sourceExcerpt,
      preferredChunkId: question.sourceChunkId,
      fallbackPage: question.sourcePageOrSlide,
    }),
  ];
}
