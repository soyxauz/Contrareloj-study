import type { StudyKit, Question, Flashcard, PodcastEpisode, DocumentAsset } from '../types';
import {
  generateCompleteAIPedagogicalBatch,
  classifyDocumentWithAI,
  inferContentVisuals,
} from '../services/aiService';
import { detectDocumentLanguage } from '../services/languageService';
import { chunkDocument } from './chunker';
import { LocalVectorStore } from './vectorStore';
import JSZip from 'jszip';

/**
 * ContentProcessor: Motor de generación inteligente de materiales de estudio.
 * Analiza texto crudo y genera preguntas de evaluación de alto valor académico.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeReplaceInsensitive(source: string, target: string, replacement: string): string {
  if (!source || !target) return source;
  try {
    const escaped = escapeRegex(target.trim());
    return source.replace(new RegExp(escaped, 'i'), replacement);
  } catch {
    return source;
  }
}

const sanitizeCache = new Map<string, string>();
const MAX_SANITIZE_CACHE = 16;

/** PDF syntax, metadata and academic header noise filter with memory cache */
export function sanitizeExtractedText(raw: string): string {
  if (!raw) return '';
  const cached = sanitizeCache.get(raw);
  if (cached !== undefined) return cached;

  let cleaned = raw
    // Remove XML/RDF metadata blocks
    .replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, '')
    .replace(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/gi, '')
    .replace(/<\?xpacket[\s\S]*?\?>/gi, '')
    // Remove PDF syntax tokens and object headers
    .replace(/\b\d+\s+\d+\s+obj\b[\s\S]*?\bendobj\b/gi, '')
    .replace(/\b(endstream|endobj|xref|trailer|startxref|stream)\b/gi, '')
    .replace(/%%EOF/g, '')
    .replace(/\/([A-Z][a-zA-Z0-9_]*)/g, '') // PDF dict keys like /FlateDecode, /Length
    // Remove font tables and character sequences like :CDEFGHIJSTUVWXYZ...
    .replace(/:[A-Za-z0-9]{15,}/g, '')
    .replace(/[A-Z]{15,}/g, '')
    // Remove typical administrative course headers, university titles, and teacher titles (preserve page, unit and topic markers)
    .replace(/\b(derecho civil\s+[ivx\d]+|facultad de [^\n]+|universidad [^\n]+|profesor:?[^\n]+|docente:?[^\n]+|abg\.?[^\n]+)\b/gi, ' ')
    // Remove non-printable / control characters (keep common accents & punctuation)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    // Normalize spaces and line breaks
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  if (sanitizeCache.size >= MAX_SANITIZE_CACHE) {
    const firstKey = sanitizeCache.keys().next().value;
    if (firstKey !== undefined) sanitizeCache.delete(firstKey);
  }
  sanitizeCache.set(raw, cleaned);

  return cleaned;
}

/** Checks whether a candidate sentence is genuine readable human text with zero-allocation letter counting */
function isValidSentence(s: string): boolean {
  const len = s.length;
  if (len < 25 || len > 400) return false;

  // Reject PDF / bytecode keywords
  if (/\b(endstream|endobj|xref|trailer|startxref|flatedecode|xpacket|rdf:|xmlns:)\b/i.test(s)) {
    return false;
  }

  // Reject course headers and academic syllabus titles
  if (/\b(derecho civil|facultad de|universidad|profesor|docente|abg\b|unidad \d+|tema \d+|capítulo \d+|página \d+|semestre|año lectivo)\b/i.test(s) && !s.includes('.') && len < 90) {
    return false;
  }

  // Reject sentences that are mostly uppercase headers without lowercase letters
  if (/^[A-ZÁÉÍÓÚÑ0-9\s:.,/-]{15,}$/.test(s) && !/[a-záéíóúñ]/.test(s)) {
    return false;
  }

  const words = s.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 5) return false;

  // Zero-allocation character scanning for letter and vowel ratios
  let letterCount = 0;
  let vowelCount = 0;
  for (let i = 0; i < len; i++) {
    const code = s.charCodeAt(i);
    // Standard Latin letters: A-Z, a-z or accented characters >= 192
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code >= 192) {
      letterCount++;
      const lower = s[i].toLowerCase();
      if (lower === 'a' || lower === 'e' || lower === 'i' || lower === 'o' || lower === 'u' ||
          lower === 'á' || lower === 'é' || lower === 'í' || lower === 'ó' || lower === 'ú') {
        vowelCount++;
      }
    }
  }

  // Check letter ratio (at least 65% of characters should be standard letters/accents)
  if (letterCount / len < 0.65) return false;

  // Check vowel presence (at least 20% vowels out of letters)
  if (vowelCount / (letterCount || 1) < 0.20) return false;

  // Check average word length (natural language is between 2.5 and 15)
  const avgLen = len / words.length;
  if (avgLen < 2.5 || avgLen > 15) return false;

  // Reject sentences with suspiciously long unbroken tokens (hashes, base64)
  if (words.some(w => w.length > 30)) return false;

  return true;
}

function sentences(text: string): string[] {
  const sanitized = sanitizeExtractedText(text);
  return sanitized
    .replace(/\n{2,}/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(isValidSentence);
}

function paragraphs(text: string): string[] {
  const sanitized = sanitizeExtractedText(text);
  return sanitized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 40 && isValidSentence(p.slice(0, 150)));
}

/** Extract key terms: lines that look like "Term: Definition" or bold terms */
function extractKeyTerms(text: string): { term: string; definition: string }[] {
  const pairs: { term: string; definition: string }[] = [];
  const validSents = sentences(text);

  // Pattern 1: "Term: Definition" or "Term - Definition"
  const colonLines = text.match(/^([A-Za-zÁÉÍÓÚñáéíóú\s]{3,35})\s*[:–—-]\s*(.{15,200})/gm) || [];
  for (const line of colonLines) {
    const match = line.match(/^([A-Za-zÁÉÍÓÚñáéíóú\s]{3,35})\s*[:–—-]\s*(.{15,200})/);
    if (match && isValidSentence(match[2])) {
      pairs.push({ term: match[1].trim(), definition: match[2].trim() });
    }
  }

  // Pattern 2: Sentences with definitions
  const defSentences = validSents.filter(s =>
    /\b(is|are|refers to|se define como|significa|consiste en|es el|es la|son los|son las)\b/i.test(s)
  );
  for (const s of defSentences.slice(0, 10)) {
    const m = s.match(/^([A-Za-zÁÉÍÓÚñáéíóú\s]{3,40}?)\s+(is|are|refers to|se define como|significa|consiste en|es el|es la|son los|son las)\s+(.{15,})/i);
    if (m) {
      const cleanTerm = m[1].replace(/^(the|el|la|los|las|un|una)\s+/i, '').trim();
      if (cleanTerm.length >= 3 && cleanTerm.length <= 35) {
        pairs.push({ term: cleanTerm, definition: s.trim() });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return pairs.filter(p => {
    const key = p.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Extract topic headings */
function extractTopics(text: string): string[] {
  const headings = text.match(/^#{1,3}\s+(.+)/gm)?.map(h => h.replace(/^#+\s+/, '').trim()) || [];
  const cleanHeadings = headings.filter(h => h.length >= 4 && h.length <= 60 && !/\bendstream\b/i.test(h));
  if (cleanHeadings.length > 0) return cleanHeadings.slice(0, 8);

  // Fallback: use first 3-5 words of top paragraphs
  const paras = paragraphs(text);
  if (paras.length > 0) {
    return paras.slice(0, 6).map(p => {
      const words = p.split(/\s+/).slice(0, 4).join(' ');
      return words.length > 35 ? words.slice(0, 35) + '…' : words;
    });
  }

  return ['Conceptos Fundamentales', 'Aspectos Clave', 'Aplicación y Análisis', 'Conclusiones'];
}

// ── Domain-Specific Plausible Distractors ─────────────────────────────────

const DOMAIN_DISTRACTORS: Record<string, string[]> = {
  'Biología / Medicina': ['membrana plasmática', 'síntesis de proteínas', 'replicación celular', 'enzima catalizadora', 'ácido desoxirribonucleico', 'metabolismo anaeróbico', 'transcripción genética'],
  'Química': ['enlace covalente', 'reacción exotérmica', 'equilibrio químico', 'solución acuosa', 'oxidación y reducción', 'presión osmótica', 'constante de disociación'],
  'Física': ['conservación del momento', 'energía cinética', 'campo magnético', 'segunda ley de la termodinámica', 'velocidad angular', 'fuerza electromotriz', 'interferencia de ondas'],
  'Matemáticas': ['teorema fundamental', 'función cuadrática', 'derivada parcial', 'matriz inversa', 'convergencia asintótica', 'distribución normal', 'integración por partes'],
  'Historia': ['revolución industrial', 'tratado internacional', 'monarquía parlamentaria', 'periodo colonial', 'movimiento social', 'crisis económica', 'soberanía popular'],
  'Computer Science': ['complejidad algorítmica', 'árbol binario balanceado', 'programación concurrente', 'tabla de dispersión hash', 'memoria dinámica heap', 'patrón de diseño Singleton', 'protocolo TCP/IP'],
  'Psicología': ['condicionamiento operante', 'sesgo cognitivo', 'memoria episódica', 'desarrollo psicosocial', 'neurotransmisor dopaminérgico', 'percepción sensorial'],
  'Derecho': ['principio de legalidad', 'jurisdicción constitucional', 'acto administrativo', 'responsabilidad civil', 'debido proceso legal', 'sujeto de derecho'],
  'General': ['análisis cuantitativo', 'hipótesis de trabajo', 'estructura sistemática', 'evaluación crítica', 'marco conceptual', 'parámetro de referencia']
};

interface SemanticFact {
  subject: string;
  relationType: 'definition' | 'location' | 'function' | 'effect' | 'composition' | 'general';
  predicate: string;
  fullSentence: string;
}

/** Extrae hechos conceptuales estructurados de cualquier texto educativo */
function extractSemanticFacts(text: string): SemanticFact[] {
  const sents = sentences(text);
  const facts: SemanticFact[] = [];

  const patterns = [
    { type: 'definition' as const, regex: /^([A-ZÁÉÍÓÚ][a-záéíóúñA-ZÁÉÍÓÚ\s]{2,40}?)\s+(es|son|se define como|consiste en|constituye|representa)\s+(.+)/i },
    { type: 'location' as const, regex: /^([A-ZÁÉÍÓÚ][a-záéíóúñA-ZÁÉÍÓÚ\s]{2,40}?)\s+(ocurre en|se lleva a cabo en|se realiza en|se localiza en|tiene lugar en)\s+(.+)/i },
    { type: 'function' as const, regex: /^([A-ZÁÉÍÓÚ][a-záéíóúñA-ZÁÉÍÓÚ\s]{2,40}?)\s+(se encarga de|tiene como función|sirve para|actúa como|cataliza|regula|facilita|permite)\s+(.+)/i },
    { type: 'effect' as const, regex: /^([A-ZÁÉÍÓÚ][a-záéíóúñA-ZÁÉÍÓÚ\s]{2,40}?)\s+(genera|produce|descompone|libera|fija|sintetiza|utiliza|transforma)\s+(.+)/i },
    { type: 'composition' as const, regex: /^([A-ZÁÉÍÓÚ][a-záéíóúñA-ZÁÉÍÓÚ\s]{2,40}?)\s+(se compone de|está formado por|contiene|incluye|abarca)\s+(.+)/i },
  ];

  const INVALID_SUBJECT_REGEX = /^(a diferencia|a diferencia de|a diferencia del|por lo tanto|por ende|en consecuencia|sin embargo|no obstante|por otra parte|por otro lado|por el contrario|en cambio|de acuerdo|de acuerdo con|según|según el|asimismo|en efecto|cabe señalar|cabe destacar|es decir|en este sentido|por consiguiente|a saber|en resumen|en conclusión|concepto|nota|ejemplo|caso|artículo|art|además|por ello|en cuanto a|con respecto a|respecto a|dentro de|a través de)\b/i;

  for (const s of sents) {
    // Si la oración empieza con una cláusula de contraste ("A diferencia del comodato, ..."), limpiar la cláusula para hallar el sujeto real
    const cleanSentence = s.replace(/^(a diferencia de(l)?|en contraste con|al igual que|en comparación con)\s+[^,]{3,60},\s*/i, '');

    for (const pat of patterns) {
      const m = cleanSentence.match(pat.regex);
      if (m) {
        const rawSubject = m[1].trim();
        const cleanSubject = rawSubject.replace(/^(el|la|los|las|un|una|unos|unas|este|esta|estos|estas)\s+/i, '').trim();
        const predicate = m[3].replace(/[.]+$/, '').trim();

        // Validar que el sujeto sea un sustantivo o concepto genuino
        if (
          cleanSubject.length >= 3 &&
          cleanSubject.length <= 40 &&
          predicate.length >= 10 &&
          !INVALID_SUBJECT_REGEX.test(cleanSubject) &&
          !cleanSubject.endsWith(' del') &&
          !cleanSubject.endsWith(' de') &&
          !cleanSubject.endsWith(' la') &&
          !cleanSubject.endsWith(' el') &&
          !cleanSubject.endsWith(' al') &&
          !/[(),;:]/.test(cleanSubject)
        ) {
          facts.push({
            subject: cleanSubject,
            relationType: pat.type,
            predicate,
            fullSentence: cleanSentence,
          });
          break;
        }
      }
    }
  }

  // Deduplicar hechos por sujeto
  const seen = new Set<string>();
  return facts.filter(f => {
    const key = f.subject.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Question Generator ───────────────────────────────────────────────────

function generateQuestions(text: string, _count: number, category: string): Question[] {
  const domainFallbacks = DOMAIN_DISTRACTORS[category] || DOMAIN_DISTRACTORS['General'];
  let facts = extractSemanticFacts(text);

  // Si hay pocos hechos extraídos, enriquecer a partir de oraciones válidas
  if (facts.length < 6) {
    const sents = sentences(text);
    for (let i = 0; i < sents.length && facts.length < 12; i++) {
      const s = sents[i];
      const words = s.split(/\s+/);
      if (words.length >= 5) {
        const sub = words.slice(0, 2).join(' ').replace(/^(el|la|los|las)\s+/i, '');
        facts.push({
          subject: sub,
          relationType: 'general',
          predicate: words.slice(2).join(' '),
          fullSentence: s,
        });
      }
    }
  }

  // Si aún así no hay suficientes (texto ultra breve), usar términos de dominio
  if (facts.length === 0) {
    facts = domainFallbacks.slice(0, 8).map(d => ({
      subject: d,
      relationType: 'general',
      predicate: `principio fundamental de estudio en ${category}`,
      fullSentence: `El concepto de ${d} constituye un principio fundamental de estudio en ${category}.`
    }));
  }

  const allPreds = facts.map(f => f.predicate);
  const allSubs = facts.map(f => f.subject);

  const easyQuestions: Question[] = [];
  const mediumQuestions: Question[] = [];
  const hardQuestions: Question[] = [];

  // ── 1. NIVEL 1 (FÁCIL / PRINCIPIANTE): Fundamentos y definiciones directas ──
  // A. MCQ Definición directa
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const distPreds = allPreds.filter((_, idx) => idx !== i).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distPreds.length < 3) {
      distPreds.push(domainFallbacks[distPreds.length % domainFallbacks.length]);
    }
    const options = [f.predicate, ...distPreds].sort(() => Math.random() - 0.5);

    easyQuestions.push({
      id: `q-e-def-${uid()}`,
      type: 'multiple-choice',
      difficulty: 'easy',
      question: `¿Cuál de las siguientes afirmaciones describe con mayor precisión a "${f.subject}" según el texto?`,
      options,
      correctIndex: Math.max(0, options.indexOf(f.predicate)),
      topic: f.subject,
      explanation: `De acuerdo con el material de estudio, "${f.subject}" se caracteriza por: ${f.predicate}.`
    });
  }

  // B. MCQ Identificación de concepto
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const distSubs = allSubs.filter((_, idx) => idx !== i).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distSubs.length < 3) {
      distSubs.push(domainFallbacks[distSubs.length % domainFallbacks.length]);
    }
    const options = [f.subject, ...distSubs].sort(() => Math.random() - 0.5);

    easyQuestions.push({
      id: `q-e-term-${uid()}`,
      type: 'multiple-choice',
      difficulty: 'easy',
      question: `¿Qué concepto clave corresponde exactamente a la siguiente definición o rol?\n\n"${f.predicate}"`,
      options,
      correctIndex: Math.max(0, options.indexOf(f.subject)),
      topic: f.subject,
      explanation: `La descripción corresponde exactamente al concepto de "${f.subject}".`
    });
  }

  // C. Matching básico (Nivel 1)
  if (facts.length >= 4) {
    const slice = facts.slice(0, 4);
    easyQuestions.push({
      id: `q-e-match-${uid()}`,
      type: 'matching',
      difficulty: 'easy',
      question: `Empareja cada concepto básico con su función o definición correspondiente:`,
      matchingPairs: slice.map(s => ({
        term: s.subject,
        definition: s.predicate.length > 85 ? s.predicate.slice(0, 80) + '…' : s.predicate
      })),
      topic: 'Emparejamiento Básico',
      explanation: 'Correspondencias conceptuales correctas:\n' + slice.map(s => `• ${s.subject}: ${s.predicate}`).join('\n')
    });
  }

  // D. True/False básico
  for (let i = 0; i < Math.min(facts.length, 6); i++) {
    const f = facts[i];
    easyQuestions.push({
      id: `q-e-tf-${uid()}`,
      type: 'true-false',
      difficulty: 'easy',
      question: `Evalúa la veracidad de la siguiente afirmación fundamental según el texto:\n\n"${f.fullSentence}"`,
      options: ['Verdadero', 'Falso'],
      correctIndex: 0,
      topic: f.subject,
      explanation: `Verdadero. Esta afirmación concuerda fielmente con lo expuesto en el material de estudio.`
    });
  }

  // Rellenar Easy hasta alcanzar al menos 25 preguntas
  let eIdx = 0;
  while (easyQuestions.length < 25 && facts.length > 0) {
    const f = facts[eIdx % facts.length];
    const distSubs = allSubs.filter((_, idx) => idx !== (eIdx % facts.length)).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distSubs.length < 3) distSubs.push(domainFallbacks[distSubs.length % domainFallbacks.length]);
    const options = [f.subject, ...distSubs].sort(() => Math.random() - 0.5);

    easyQuestions.push({
      id: `q-e-cyc-${uid()}`,
      type: 'multiple-choice',
      difficulty: 'easy',
      question: `Repaso de Fundamentos: ¿A qué elemento hace referencia la siguiente propiedad?\n\n"${f.predicate}"`,
      options,
      correctIndex: Math.max(0, options.indexOf(f.subject)),
      topic: f.subject,
      explanation: `El concepto correcto es "${f.subject}".`
    });
    eIdx++;
  }

  // ── 2. NIVEL 2 (INTERMEDIO): Relaciones, Causalidad, Drag & Drop y Selección Múltiple ──
  // A. Drag & Drop contextual
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const words = f.fullSentence.split(/\s+/);
    if (words.length >= 6) {
      const rawSub = f.subject.split(/\s+/)[0] || '';
      const cleanSub = rawSub.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '');
      const rawPredWord = f.predicate.split(/\s+/).find(w => {
        const clean = w.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '');
        return clean.length >= 4 && clean.toLowerCase() !== cleanSub.toLowerCase();
      }) || 'sistema';
      const cleanPredWord = rawPredWord.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '');

      if (
        cleanSub.length >= 3 &&
        cleanPredWord.length >= 3 &&
        f.fullSentence.toLowerCase().includes(cleanSub.toLowerCase()) &&
        f.fullSentence.toLowerCase().includes(cleanPredWord.toLowerCase())
      ) {
        try {
          const regex1 = new RegExp(`\\b${escapeRegex(cleanSub)}\\b`, 'i');
          const regex2 = new RegExp(`\\b${escapeRegex(cleanPredWord)}\\b`, 'i');

          let templ = f.fullSentence.replace(regex1, '{0}').replace(regex2, '{1}');
          if (templ.includes('{0}') && templ.includes('{1}')) {
            const dist1 = allSubs.find(s => s.toLowerCase() !== cleanSub.toLowerCase()) || domainFallbacks[0];
            const dist2 = domainFallbacks[1] || 'proceso alternativo';

            mediumQuestions.push({
              id: `q-m-drag-${uid()}`,
              type: 'drag-drop',
              difficulty: 'medium',
              question: `Arrastra y coloca las fichas conceptuales en los espacios para completar el principio:`,
              templateSentence: templ,
              blanksCorrect: [cleanSub, cleanPredWord],
              wordBank: [cleanSub, cleanPredWord, dist1, dist2].sort(() => Math.random() - 0.5),
              topic: f.subject,
              explanation: `El principio correcto según el texto es: "${f.fullSentence}".`
            });
          }
        } catch {
          // Si ocurre algún fallo con el patrón, continuar de forma segura
        }
      }
    }
  }

  // B. Selección Múltiple (Multi-Select)
  for (let i = 0; i < Math.floor(facts.length / 2); i++) {
    const f1 = facts[i * 2];
    const f2 = facts[i * 2 + 1];
    if (f1 && f2) {
      const correctStatements = [
        `${f1.subject}: ${f1.predicate}`,
        `${f2.subject}: ${f2.predicate}`
      ];
      const falseStatements = [
        `${f1.subject} actúa exclusivamente inhibiendo o destruyendo todos los procesos del sistema.`,
        `Este principio carece de relevancia biológica o conceptual según lo expuesto en el documento.`
      ];

      const allOpts = [...correctStatements, ...falseStatements].map((txt, idx) => ({ txt, isCorrect: idx < 2 })).sort(() => Math.random() - 0.5);
      const correctIndices = allOpts.map((o, idx) => o.isCorrect ? idx : -1).filter(idx => idx !== -1);

      mediumQuestions.push({
        id: `q-m-ms-${uid()}`,
        type: 'multi-select',
        difficulty: 'medium',
        question: `Selecciona todas las afirmaciones correctas sobre el tema expuesto en el texto:`,
        options: allOpts.map(o => o.txt),
        correctIndices,
        topic: 'Análisis Relacional',
        explanation: `Afirmaciones verdaderas del texto:\n• ${correctStatements.join('\n• ')}`
      });
    }
  }

  // C. Matching intermedio
  if (facts.length >= 8) {
    const slice = facts.slice(4, 8);
    mediumQuestions.push({
      id: `q-m-match-${uid()}`,
      type: 'matching',
      difficulty: 'medium',
      question: `Empareja las siguientes estructuras y mecanismos con su comportamiento documentado:`,
      matchingPairs: slice.map(s => ({
        term: s.subject,
        definition: s.predicate.length > 85 ? s.predicate.slice(0, 80) + '…' : s.predicate
      })),
      topic: 'Mecanismos y Relaciones',
      explanation: 'Correspondencias correctas:\n' + slice.map(s => `• ${s.subject}: ${s.predicate}`).join('\n')
    });
  }

  // D. Causalidad / Funciones MCQs
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const distPreds = allPreds.filter((_, idx) => idx !== i).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distPreds.length < 3) distPreds.push(domainFallbacks[distPreds.length % domainFallbacks.length]);
    const options = [f.predicate, ...distPreds].sort(() => Math.random() - 0.5);

    mediumQuestions.push({
      id: `q-m-caus-${uid()}`,
      type: 'multiple-choice',
      difficulty: 'medium',
      question: `¿Qué función o rol activo desempeña "${f.subject}" en el contexto estudiado?`,
      options,
      correctIndex: Math.max(0, options.indexOf(f.predicate)),
      topic: f.subject,
      explanation: `Función clave documentada: "${f.subject}" ${f.predicate}.`
    });
  }

  // Rellenar Medium hasta alcanzar al menos 25 preguntas
  let mIdx = 0;
  while (mediumQuestions.length < 25 && facts.length > 0) {
    const f = facts[mIdx % facts.length];
    const distPreds = allPreds.filter((_, idx) => idx !== (mIdx % facts.length)).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distPreds.length < 3) distPreds.push(domainFallbacks[distPreds.length % domainFallbacks.length]);
    const options = [f.predicate, ...distPreds].sort(() => Math.random() - 0.5);

    mediumQuestions.push({
      id: `q-m-cyc-${uid()}`,
      type: 'multiple-choice',
      difficulty: 'medium',
      question: `Aplicación Intermedia: ¿Cuál es la implicación directa de "${f.subject}" según el documento?`,
      options,
      correctIndex: Math.max(0, options.indexOf(f.predicate)),
      topic: f.subject,
      explanation: `La implicación directa es: ${f.predicate}.`
    });
    mIdx++;
  }

  // ── 3. NIVEL 3 (DIFÍCIL / EXPERTO): Análisis Crítico, Inversión Conceptual y Escenarios ──
  // A. True/False con inversión conceptual sutil (trampas conceptuales bien explicadas)
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const isFalseVariant = i % 2 === 1;

    if (!isFalseVariant) {
      hardQuestions.push({
        id: `q-h-tf-t-${uid()}`,
        type: 'true-false',
        difficulty: 'hard',
        question: `Análisis Crítico: Evalúa la rigurosidad conceptual de la siguiente proposición:\n\n"${f.fullSentence}"`,
        options: ['Verdadero', 'Falso'],
        correctIndex: 0,
        topic: f.subject,
        explanation: `Verdadero. La afirmación concuerda de manera precisa con el marco conceptual expuesto en el texto.`
      });
    } else {
      const otherSub = allSubs.find(s => s.toLowerCase() !== f.subject.toLowerCase()) || 'un elemento externo';
      const falseSentence = safeReplaceInsensitive(f.fullSentence, f.subject, otherSub);

      hardQuestions.push({
        id: `q-h-tf-f-${uid()}`,
        type: 'true-false',
        difficulty: 'hard',
        question: `Análisis Crítico: Evalúa si la siguiente proposición es fidedigna o incurre en error conceptual:\n\n"${falseSentence}"`,
        options: ['Verdadero', 'Falso'],
        correctIndex: 1,
        topic: f.subject,
        explanation: `Falso. Hay un error de atribución: la función descrita corresponde a "${f.subject}" y NO a "${otherSub}".\nPrincipio verídico: "${f.fullSentence}".`
      });
    }
  }

  // B. Multi-Select de discriminación conceptual avanzada
  for (let i = 0; i < Math.floor(facts.length / 2); i++) {
    const f1 = facts[i * 2];
    const f2 = facts[i * 2 + 1];
    if (f1 && f2) {
      const otherSub = allSubs.find(s => s !== f1.subject && s !== f2.subject) || 'un proceso alternativo';
      const opts = [
        { text: `${f1.subject}: ${f1.predicate}`, correct: true },
        { text: `${f2.subject}: ${f2.predicate}`, correct: true },
        { text: `${otherSub}: opera exactamente de manera inversa cancelando a ${f1.subject}`, correct: false },
        { text: `Ambos fenómenos ocurren sin consumir ni transferir energía en el sistema`, correct: false },
      ].sort(() => Math.random() - 0.5);

      const correctIndices = opts.map((o, idx) => o.correct ? idx : -1).filter(idx => idx !== -1);

      hardQuestions.push({
        id: `q-h-ms-${uid()}`,
        type: 'multi-select',
        difficulty: 'hard',
        question: `Discriminación Técnica: Selecciona TODAS las proposiciones que representen afirmaciones válidas según el material:`,
        options: opts.map(o => o.text),
        correctIndices,
        topic: 'Dominio Crítico',
        explanation: `Las únicas afirmaciones respaldadas por el texto son las que corresponden fielmente a los procesos descritos para ${f1.subject} y ${f2.subject}.`
      });
    }
  }

  // C. Matching avanzado
  if (facts.length >= 4) {
    const slice = facts.slice(0, 4).reverse();
    hardQuestions.push({
      id: `q-h-match-${uid()}`,
      type: 'matching',
      difficulty: 'hard',
      question: `Emparejamiento Experto: Conecta rigurosamente cada componente con su definición o consecuencia técnica:`,
      matchingPairs: slice.map(s => ({
        term: s.subject,
        definition: s.predicate.length > 85 ? s.predicate.slice(0, 80) + '…' : s.predicate
      })),
      topic: 'Dominio Experto',
      explanation: 'Correspondencias técnicas exactas:\n' + slice.map(s => `• ${s.subject}: ${s.predicate}`).join('\n')
    });
  }

  // Rellenar Hard hasta alcanzar al menos 25 preguntas
  let hIdx = 0;
  while (hardQuestions.length < 25 && facts.length > 0) {
    const f = facts[hIdx % facts.length];
    const distPreds = allPreds.filter((_, idx) => idx !== (hIdx % facts.length)).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distPreds.length < 3) distPreds.push(domainFallbacks[distPreds.length % domainFallbacks.length]);
    const options = [f.predicate, ...distPreds].sort(() => Math.random() - 0.5);

    hardQuestions.push({
      id: `q-h-cyc-${uid()}`,
      type: 'multiple-choice',
      difficulty: 'hard',
      question: `Evaluación de Dominio: ¿Qué principio técnico distingue fundamentalmente la acción de "${f.subject}"?`,
      options,
      correctIndex: Math.max(0, options.indexOf(f.predicate)),
      topic: f.subject,
      explanation: `El principio técnico es: "${f.subject}" ${f.predicate}.`
    });
    hIdx++;
  }

  // Barajar y limitar a lote inicial ágil de 20 preguntas en total (7 Fácil, 7 Intermedio, 6 Difícil)
  const shuffledEasy = [...easyQuestions].sort(() => Math.random() - 0.5).slice(0, 7);
  const shuffledMedium = [...mediumQuestions].sort(() => Math.random() - 0.5).slice(0, 7);
  const shuffledHard = [...hardQuestions].sort(() => Math.random() - 0.5).slice(0, 6);

  const finalQuestions = [
    ...shuffledEasy,
    ...shuffledMedium,
    ...shuffledHard
  ];

  return finalQuestions;
}

// ── Flashcard Generator ──────────────────────────────────────────────────

export function generateFlashcards(text: string, count: number): Flashcard[] {
  const keyTerms = extractKeyTerms(text);
  const cards: Flashcard[] = keyTerms.slice(0, count).map(kt => ({
    id: `gen-fc-${uid()}`,
    term: kt.term,
    definition: kt.definition,
    mastery: 'to-learn' as const,
  }));

  // If not enough key terms, generate from valid sentences
  if (cards.length < count) {
    const sents = sentences(text);
    for (let i = 0; i < sents.length && cards.length < count; i++) {
      const s = sents[i];
      const words = s.split(/\s+/);
      if (words.length < 6) continue;
      const term = words.slice(0, 4).join(' ');
      if (cards.some(c => c.term.toLowerCase() === term.toLowerCase())) continue;
      cards.push({
        id: `gen-fc-${uid()}`,
        term: term,
        definition: s,
        mastery: 'to-learn',
      });
    }
  }

  return cards.slice(0, Math.max(count, 4));
}

// ── Study Guide Generator ────────────────────────────────────────────────

export function generateStudyGuide(text: string, title: string): string {
  const topics = extractTopics(text);
  const paras = paragraphs(text);
  const terms = extractKeyTerms(text);

  let guide = `# Guía de Estudio: ${title}\n\n`;
  guide += `> **GENERADO AUTOMÁTICAMENTE** a partir del material procesado.\n\n`;

  // Section 1: Overview
  guide += `## 1. Resumen General\n`;
  if (paras.length > 0) {
    guide += paras.slice(0, 3).join('\n\n') + '\n\n';
  } else {
    guide += `Este kit de estudio reúne los conceptos esenciales extraídos de tus apuntes sobre "${title}".\n\n`;
  }

  // Section 2: Key Topics
  if (topics.length > 0) {
    guide += `## 2. Temas Principales\n`;
    for (let i = 0; i < Math.min(topics.length, 6); i++) {
      guide += `### ${topics[i]}\n`;
      const relatedParas = paras.filter(p =>
        p.toLowerCase().includes(topics[i].toLowerCase().split(' ')[0])
      );
      if (relatedParas.length > 0) {
        guide += relatedParas[0] + '\n\n';
      } else if (paras[i + 1]) {
        guide += paras[i + 1] + '\n\n';
      }
    }
  }

  // Section 3: Key Terms
  if (terms.length > 0) {
    guide += `## 3. Términos Clave para Memorizar\n\n`;
    guide += `| Concepto / Término | Definición y Alcance Pedagógico |\n`;
    guide += `| :--- | :--- |\n`;
    for (const t of terms.slice(0, 10)) {
      guide += `| **${t.term}** | ${t.definition.replace(/\|/g, '-')} |\n`;
    }
    guide += '\n';
  }

  // Section 4: Study Tips
  guide += `## 4. Estrategia de Repaso Recomendada\n`;
  guide += `* Completa las sesiones de **Smart Study** para afianzar el recuerdo activo.\n`;
  guide += `* Revisa las **Flashcards** hasta marcar todos los conceptos como *Dominados*.\n`;
  guide += `* Escucha el **Review Podcast** para repasar pasivamente los puntos clave.\n`;
  guide += `* Realiza un **Examen de Práctica** cronometrado para medir tu retención.\n`;

  return guide;
}

// ── Podcast Generator ────────────────────────────────────────────────────

export function generatePodcast(text: string, title: string): PodcastEpisode {
  const topics = extractTopics(text);
  const terms = extractKeyTerms(text);
  const sents = sentences(text);

  const host = { name: 'Sofia (Host)', role: 'Presentadora', avatar: 'S' };
  const expert = { name: 'Dr. Alex (Tutor IA)', role: 'Especialista Académico', avatar: 'A' };

  const dialogue: { speaker: string; text: string; time: string }[] = [];
  let timeMinutes = 0;

  dialogue.push({
    speaker: host.name,
    text: `¡Hola a todos y bienvenidos a Contrareloj Review Podcast! Hoy repasamos a fondo "${title}". Prepárense para dominar este tema sin rodeos.`,
    time: `${timeMinutes}:00`,
  });
  timeMinutes += 1;

  for (let i = 0; i < Math.min(topics.length, 4); i++) {
    dialogue.push({
      speaker: host.name,
      text: `Entremos de lleno en el punto: ${topics[i]}. Dr. Alex, ¿qué debemos tener presente para el examen?`,
      time: `${timeMinutes}:${(i * 15).toString().padStart(2, '0')}`,
    });

    const relatedSent = sents.find(s =>
      s.toLowerCase().includes(topics[i].toLowerCase().split(' ')[0])
    ) || sents[i % sents.length] || 'Este concepto es nuclear y suele formularse en preguntas de aplicación práctica.';

    dialogue.push({
      speaker: expert.name,
      text: relatedSent,
      time: `${timeMinutes}:${((i * 15) + 20).toString().padStart(2, '0')}`,
    });
    timeMinutes += 1;
  }

  if (terms.length > 0) {
    dialogue.push({
      speaker: host.name,
      text: `Excelente. Repasemos rápidamente las definiciones que no pueden fallar.`,
      time: `${timeMinutes}:00`,
    });
    timeMinutes += 1;

    for (const t of terms.slice(0, 3)) {
      dialogue.push({
        speaker: expert.name,
        text: `${t.term}: ${t.definition}`,
        time: `${timeMinutes}:00`,
      });
    }
  }

  dialogue.push({
    speaker: host.name,
    text: `¡Gran sesión! Con esto tienen una base sólida. Pasen ahora a las Flashcards y al Smart Study para cerrar el repaso. ¡Mucho éxito!`,
    time: `${timeMinutes + 1}:00`,
  });

  return {
    id: `gen-pod-${uid()}`,
    title: `Repaso: ${title}`,
    duration: `${timeMinutes + 1}:30 min`,
    hosts: [host, expert],
    dialogue,
  };
}

// ── Category & Icon Inference ────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, { keywords: string[]; icon: string; color: string }> = {
  'Fisiopatología / Medicina': { keywords: ['fisiopatología', 'fisiopatologia', 'enfermedad', 'patología', 'síntoma', 'músculo', 'muscular', 'diagnóstico', 'clínico', 'paciente', 'terapia', 'farmacología', 'médico'], icon: 'Hospital', color: 'from-emerald-600 to-teal-800' },
  'Biología / Medicina': { keywords: ['biología', 'célula', 'adn', 'proteína', 'gen', 'anatomía', 'fisiología', 'mitocondria', 'organismo', 'salud'], icon: 'Microscope', color: 'from-emerald-500 to-teal-700' },
  'Química': { keywords: ['química', 'molécula', 'reacción', 'átomo', 'enlace', 'ácido', 'base', 'compuesto', 'solución'], icon: 'FlaskConical', color: 'from-cyan-500 to-blue-700' },
  'Física': { keywords: ['física', 'fuerza', 'energía', 'newton', 'onda', 'velocidad', 'aceleración', 'gravedad', 'termodinámica'], icon: 'Atom', color: 'from-blue-500 to-indigo-700' },
  'Matemáticas': { keywords: ['matemática', 'ecuación', 'cálculo', 'integral', 'derivada', 'álgebra', 'geometría', 'teorema', 'número'], icon: 'Calculator', color: 'from-amber-500 to-orange-700' },
  'Historia': { keywords: ['historia', 'guerra', 'revolución', 'imperio', 'siglo', 'tratado', 'presidente', 'constitución', 'batalla'], icon: 'Landmark', color: 'from-yellow-600 to-amber-800' },
  'Literatura': { keywords: ['literatura', 'novela', 'poema', 'autor', 'narrativa', 'poesía', 'cuento', 'personaje', 'ensayo'], icon: 'BookOpen', color: 'from-rose-500 to-pink-700' },
  'Computer Science': { keywords: ['algoritmo', 'programación', 'código', 'software', 'datos', 'javascript', 'python', 'sistema', 'computadora', 'redes'], icon: 'Binary', color: 'from-violet-600 to-indigo-800' },
  'Psicología': { keywords: ['psicología', 'conducta', 'cognitivo', 'mente', 'emoción', 'trastorno', 'personalidad', 'terapia'], icon: 'Brain', color: 'from-purple-500 to-fuchsia-700' },
  'Economía': { keywords: ['economía', 'mercado', 'inflación', 'pib', 'finanzas', 'costo', 'precio', 'empresa', 'demanda', 'oferta'], icon: 'TrendingUp', color: 'from-green-500 to-emerald-700' },
  'Derecho': { keywords: ['derecho', 'ley', 'norma', 'código', 'jurídico', 'tribunal', 'delito', 'civil', 'penal', 'constitucional'], icon: 'Scale', color: 'from-slate-500 to-gray-700' },
};

function inferCategory(text: string, title?: string): { category: string; icon: string; color: string } {
  const lower = text.toLowerCase();
  let bestCategory = 'General';
  let bestScore = 0;

  for (const [cat, config] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = config.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  // Asignar icono y color en base al contenido específico del tema y texto
  const visuals = inferContentVisuals(title || '', text, [], bestCategory);

  return {
    category: bestCategory,
    icon: visuals.icon,
    color: visuals.color,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

export interface ProcessedContent {
  kit: StudyKit;
  stats: {
    inputCharacters: number;
    sentencesDetected: number;
    keyTermsExtracted: number;
    questionsGenerated: number;
    flashcardsGenerated: number;
  };
}

export function processContent(
  rawText: string,
  title: string,
  description?: string,
  assets: DocumentAsset[] = []
): ProcessedContent {
  // First clean and sanitize the input text
  const cleanText = sanitizeExtractedText(rawText);
  const detectedSents = sentences(cleanText);

  if (cleanText.length < 60 || detectedSents.length === 0) {
    throw new Error(
      'El texto proporcionado no contiene suficientes oraciones comprensibles para generar materiales de estudio. ' +
      'Asegúrate de proporcionar contenido educativo legible (notas, párrafos o resúmenes).'
    );
  }

  const { category, icon, color } = inferCategory(cleanText, title);

  // Generar chunks semánticos con enlace de proximidad a activos
  const chunks = chunkDocument(cleanText, assets);
  const vectorStore = new LocalVectorStore(chunks);

  const questionCount = 20;
  const rawQuestions = generateQuestions(cleanText, questionCount, category);
  const questions = [...rawQuestions].sort(() => Math.random() - 0.5);

  // Vincular cada pregunta a su fragmento de origen (RAG) y activo multimodal
  for (const q of questions) {
    const bestChunk = vectorStore.findBestChunk(q.topic + ' ' + q.question);
    if (bestChunk) {
      q.sourceChunkId = bestChunk.id;
      q.sourceChunkText = bestChunk.text;
      q.sourcePageOrSlide = bestChunk.pageOrSlide;
      if (bestChunk.assetIds && bestChunk.assetIds.length > 0) {
        const matchingAsset = assets.find(a => bestChunk.assetIds!.includes(a.id));
        if (matchingAsset) q.sourceAsset = matchingAsset;
      }
    }
  }

  const kit: StudyKit = {
    id: `kit-${uid()}`,
    title,
    category,
    description: description || `Study Kit generado a partir de tu material sobre "${title}".`,
    icon,
    color,
    questions,
    flashcards: [], // Se crean bajo demanda al entrar a la sección
    studyGuideMarkdown: '', // Se crea bajo demanda al entrar a la sección
    podcast: null, // Se crea bajo demanda al entrar a la sección
    sourceText: cleanText,
    chunks,
    assets,
  };

  return {
    kit,
    stats: {
      inputCharacters: cleanText.length,
      sentencesDetected: detectedSents.length,
      keyTermsExtracted: extractKeyTerms(cleanText).length,
      questionsGenerated: questions.length,
      flashcardsGenerated: 0,
    },
  };
}

/**
 * Versión asíncrona que genera primero las preguntas con análisis pedagógico de IA,
 * segmentación semántica de documentos (Chunking RAG) y activos multimodales.
 */
export async function processContentAsync(
  rawText: string,
  title: string,
  description?: string,
  assets: DocumentAsset[] = [],
  onProgress?: (step: string) => void,
  isTitleManuallyEdited: boolean = false
): Promise<ProcessedContent> {
  const cleanText = sanitizeExtractedText(rawText);
  const detectedSents = sentences(cleanText);

  if (cleanText.length < 60 || detectedSents.length === 0) {
    throw new Error(
      'El texto proporcionado no contiene suficientes oraciones comprensibles para generar materiales de estudio. ' +
      'Asegúrate de proporcionar contenido educativo legible (notas, párrafos o resúmenes).'
    );
  }

  // Detección automática del idioma del documento para traducción al español
  const langDetection = detectDocumentLanguage(cleanText);
  if (langDetection.isForeign) {
    onProgress?.(`Documento en ${langDetection.detectedLanguage} detectado. Activando traducción automática al español...`);
  }

  // Generar chunks semánticos e indexar en el almacén vectorial local
  const chunks = chunkDocument(cleanText, assets);
  const vectorStore = new LocalVectorStore(chunks);

  // Clasificación de materia y decisión de tema con IA en base al contenido
  onProgress?.(
    langDetection.isForeign
      ? `Traduciendo y clasificando materia y tema al español con IA (${langDetection.detectedLanguage})...`
      : 'Analizando contenido para clasificar materia y tema con IA...'
  );
  const aiClassification = await classifyDocumentWithAI(cleanText, chunks);

  // Decisión de título (Tema):
  // Si el usuario no lo editó manualmente o si es un nombre de archivo/genérico, la IA decide el tema.
  const isGenericOrFilename =
    !title ||
    title === 'Mi Material de Estudio' ||
    title === 'Página Web' ||
    title === 'Documento' ||
    /\.(pdf|docx|pptx|xml|txt|md|csv|json)$/i.test(title.trim());

  const finalTitle = (!isTitleManuallyEdited || isGenericOrFilename) && aiClassification.tema
    ? aiClassification.tema
    : title || aiClassification.tema;

  const finalCategory = aiClassification.materia || 'General';
  const finalDescription = description || aiClassification.descripcion || `Study Kit de ${finalCategory} sobre "${finalTitle}".`;
  const finalVisuals = aiClassification.icon
    ? { icon: aiClassification.icon, color: aiClassification.color }
    : inferContentVisuals(finalTitle, cleanText, aiClassification.palabrasClave, finalCategory);
  const finalIcon = finalVisuals.icon;
  const finalColor = finalVisuals.color;

  // Generar embeddings densos de Ollama en segundo plano sin bloquear la UI
  vectorStore.generateDenseEmbeddings().catch(() => {});

  // Generar lote de preguntas pedagógicas EXCLUSIVAMENTE generadas por IA
  // Sin mezclas mecánicas ni plantillas sintéticas de relleno
  onProgress?.(
    langDetection.isForeign
      ? `Generando lote de preguntas pedagógicas traducidas y adaptadas al español...`
      : 'Generando el lote de preguntas pedagógicas...'
  );
  const aiQuestions = await generateCompleteAIPedagogicalBatch(cleanText, chunks, onProgress);

  if (!aiQuestions || aiQuestions.length === 0) {
    throw new Error(
      'El motor de IA no devolvió preguntas válidas para el texto analizado.\n\n' +
      'Por favor, reintenta la generación o verifica la conexión con tu modelo de IA.'
    );
  }

  // Vincular RAG y activos multimodales a las preguntas de IA
  for (let idx = 0; idx < aiQuestions.length; idx++) {
    const q = aiQuestions[idx];
    if (!q.sourceChunkId) {
      const best = vectorStore.findBestChunk(q.topic + ' ' + q.question);
      if (best) {
        q.sourceChunkId = best.id;
        q.sourceChunkText = best.text;
        q.sourcePageOrSlide = best.pageOrSlide;
        if (best.assetIds && best.assetIds.length > 0) {
          const matchingAsset = assets.find(a => best.assetIds!.includes(a.id));
          if (matchingAsset) q.sourceAsset = matchingAsset;
        }
      }
    } else if (!q.sourceAsset && assets.length > 0) {
      const chunk = chunks.find(c => c.id === q.sourceChunkId);
      if (chunk && chunk.assetIds && chunk.assetIds.length > 0) {
        const matchingAsset = assets.find(a => chunk.assetIds!.includes(a.id));
        if (matchingAsset) q.sourceAsset = matchingAsset;
      }
    }

    // Asociacion por pagina o distribucion visual si existen activos en el kit
    if (!q.sourceAsset && assets.length > 0) {
      if (q.sourcePageOrSlide) {
        const pageAsset = assets.find(a => a.pageOrSlide === q.sourcePageOrSlide);
        if (pageAsset) q.sourceAsset = pageAsset;
      }
      if (!q.sourceAsset && assets[idx % assets.length]) {
        q.sourceAsset = assets[idx % assets.length];
      }
    }
  }

  // Barajado aleatorio para garantizar variedad impredecible desde la primera pregunta
  const shuffledAiQuestions = [...aiQuestions];
  for (let i = shuffledAiQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledAiQuestions[i], shuffledAiQuestions[j]] = [shuffledAiQuestions[j], shuffledAiQuestions[i]];
  }

  const kit: StudyKit = {
    id: `kit-${uid()}`,
    title: finalTitle,
    category: finalCategory,
    description: finalDescription,
    icon: finalIcon,
    color: finalColor,
    questions: shuffledAiQuestions,
    flashcards: [], // Solo preguntas al inicio; las demás secciones se crean bajo demanda
    studyGuideMarkdown: '',
    podcast: null,
    sourceText: cleanText,
    chunks,
    assets,
    sourceLanguage: langDetection.detectedLanguage,
  };

  return {
    kit,
    stats: {
      inputCharacters: cleanText.length,
      sentencesDetected: detectedSents.length,
      keyTermsExtracted: extractKeyTerms(cleanText).length,
      questionsGenerated: kit.questions.length,
      flashcardsGenerated: 0,
    },
  };
}

// ── Content Extractors (PDF, YouTube, URL, File) ─────────────────────────

// ── Helpers de extracción multimodal ─────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Acceso ultrarrápido a dimensiones con createImageBitmap si está disponible o Image como fallback */
async function getBlobDimensions(blob: Blob): Promise<{ w: number; h: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      const dims = { w: bmp.width, h: bmp.height };
      bmp.close(); // Liberación inmediata de memoria GPU
      return dims;
    } catch {
      return null;
    }
  }
  try {
    const dataUrl = await blobToDataUrl(blob);
    return getImageDimensions(dataUrl);
  } catch {
    return null;
  }
}

function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Detecta si un lienzo de Canvas contiene un color plano (negro sólido, blanco puro o fondo uniforme)
 * para evitar la extracción de máscaras de recorte, separadores o fondos opacos sin valor pedagógico.
 */
function isSolidOrBlankCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const stepX = Math.max(1, Math.floor(w / 6));
    const stepY = Math.max(1, Math.floor(h / 6));
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let allDark = true;
    let allWhite = true;
    let firstR = -1, firstG = -1, firstB = -1;
    let allIdentical = true;
    let sampledCount = 0;

    for (let y = stepY; y < h; y += stepY) {
      for (let x = stepX; x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (a < 20) continue; // Píxel transparente
        sampledCount++;

        // No es casi negro
        if (r > 20 || g > 20 || b > 20) allDark = false;
        // No es casi blanco
        if (r < 235 || g < 235 || b < 235) allWhite = false;

        if (firstR === -1) {
          firstR = r;
          firstG = g;
          firstB = b;
        } else if (Math.abs(r - firstR) > 12 || Math.abs(g - firstG) > 12 || Math.abs(b - firstB) > 12) {
          allIdentical = false;
        }
      }
    }

    if (sampledCount === 0) return true;
    return allDark || allWhite || allIdentical;
  } catch {
    return false;
  }
}

/**
 * Genera una firma precisa de imagen basada en longitud y muestras de contenido
 * para evitar falsos positivos de duplicación sin descartar imágenes distintas.
 */
function getImageSignature(dataUrl: string): string {
  if (!dataUrl) return '';
  const len = dataUrl.length;
  const mid = Math.floor(len / 2);
  const end = Math.max(0, len - 60);
  return `${len}:${dataUrl.slice(mid, mid + 40)}:${dataUrl.slice(end)}`;
}

/**
 * Escanea un buffer binario (PDF, DOC, PPT, XLS, etc.) en busca de imágenes JPEG y PNG incrustadas
 * Utiliza escaneo síncrono ultraveloz de firmas y decodificación paralela con createImageBitmap
 */
async function extractEmbeddedImagesFromBinary(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  maxAssets = 250
): Promise<DocumentAsset[]> {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  let pos = 0;

  // Fase 1: Identificación síncrona de candidatos sin bloquear el event loop con awaits
  const candidates: { start: number; end: number; type: 'image/jpeg' | 'image/png' }[] = [];

  while (pos < len - 8 && candidates.length < maxAssets * 2) {
    // 1. JPEG: SOI (FF D8 FF) hasta EOI (FF D9)
    if (bytes[pos] === 0xFF && bytes[pos + 1] === 0xD8 && bytes[pos + 2] === 0xFF) {
      const start = pos;
      let end = -1;
      let searchPos = start + 3;
      const maxSearch = Math.min(len - 1, start + 25 * 1024 * 1024);
      while (searchPos < maxSearch) {
        if (bytes[searchPos] === 0xFF && bytes[searchPos + 1] === 0xD9) {
          end = searchPos + 2;
          break;
        }
        searchPos++;
      }

      if (end !== -1 && end - start > 800) {
        candidates.push({ start, end, type: 'image/jpeg' });
        pos = end;
        continue;
      }
    }

    // 2. PNG: Firma [137, 80, 78, 71, 13, 10, 26, 10] hasta bloque IEND
    if (
      bytes[pos] === 0x89 &&
      bytes[pos + 1] === 0x50 &&
      bytes[pos + 2] === 0x4E &&
      bytes[pos + 3] === 0x47 &&
      bytes[pos + 4] === 0x0D &&
      bytes[pos + 5] === 0x0A &&
      bytes[pos + 6] === 0x1A &&
      bytes[pos + 7] === 0x0A
    ) {
      const start = pos;
      let end = -1;
      let searchPos = start + 8;
      const maxSearch = Math.min(len - 4, start + 25 * 1024 * 1024);
      while (searchPos < maxSearch) {
        if (
          bytes[searchPos] === 0x49 &&
          bytes[searchPos + 1] === 0x45 &&
          bytes[searchPos + 2] === 0x4E &&
          bytes[searchPos + 3] === 0x44
        ) {
          end = searchPos + 8; // 4 bytes 'IEND' + 4 bytes CRC
          break;
        }
        searchPos++;
      }

      if (end !== -1 && end - start > 400) {
        candidates.push({ start, end, type: 'image/png' });
        pos = end;
        continue;
      }
    }

    pos++;
  }

  // Fase 2: Decodificación y validación concurrente con Promise.all
  const decodedAssets = await Promise.all(
    candidates.map(async (cand) => {
      try {
        const imgBytes = bytes.subarray(cand.start, cand.end);
        const blob = new Blob([imgBytes], { type: cand.type });
        const dims = await getBlobDimensions(blob);

        if (dims && dims.w >= 60 && dims.h >= 60) {
          const dataUrl = await blobToDataUrl(blob);
          return { dataUrl, w: dims.w, h: dims.h };
        }
      } catch {}
      return null;
    })
  );

  const assets: DocumentAsset[] = [];
  const seenSigs = new Set<string>();

  for (const item of decodedAssets) {
    if (!item || assets.length >= maxAssets) continue;
    const sig = getImageSignature(item.dataUrl);
    if (!seenSigs.has(sig)) {
      seenSigs.add(sig);
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl: item.dataUrl,
        caption: `Figura ${assets.length + 1} (${fileName})`,
        contextNearby: `Recurso visual extraído de ${fileName}`,
      });
    }
  }

  return assets;
}

/**
 * Extrae imágenes incrustadas en formato JPEG / PNG desde el buffer binario del documento
 */
async function extractRawJpegsFromPdf(arrayBuffer: ArrayBuffer, fileName: string): Promise<DocumentAsset[]> {
  return extractEmbeddedImagesFromBinary(arrayBuffer, fileName, 250);
}

/**
 * Consulta un objeto de imagen en los almacenes de PDF.js (page.objs, page.commonObjs, pdf.commonObjs)
 */
function getPdfImageObject(page: any, pdf: any, imgKey: string, timeoutMs = 1200): Promise<any> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (obj: any) => {
      if (!resolved) {
        resolved = true;
        resolve(obj);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      if (page.objs && typeof page.objs.get === 'function') {
        page.objs.get(imgKey, (data: any) => {
          if (data) {
            clearTimeout(timer);
            finish(data);
          }
        });
      }
    } catch {}

    try {
      if (page.commonObjs && typeof page.commonObjs.get === 'function') {
        page.commonObjs.get(imgKey, (data: any) => {
          if (data) {
            clearTimeout(timer);
            finish(data);
          }
        });
      }
    } catch {}

    try {
      if (pdf?.commonObjs && typeof pdf.commonObjs.get === 'function') {
        pdf.commonObjs.get(imgKey, (data: any) => {
          if (data) {
            clearTimeout(timer);
            finish(data);
          }
        });
      }
    } catch {}
  });
}

/**
 * Extractor avanzado de texto e imagenes reales para archivos PDF usando PDF.js
 */
async function extractContentFromPDF(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  const arrayBuffer = await file.arrayBuffer();

  // Obtener instancia de pdfjs (global o importada)
  let pdfjs = (window as any).pdfjsLib;
  if (!pdfjs) {
    try {
      pdfjs = await import('pdfjs-dist');
    } catch {
      // ignore
    }
  }

  if (typeof pdfjs !== 'undefined') {
    try {
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }

      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;

      let extracted = '';
      const assets: DocumentAsset[] = [];
      const seenSignatures = new Set<string>();
      const totalPages = pdf.numPages;
      const maxAssets = 300;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let lastY: number | null = null;
        let pageStr = '';

        for (const item of textContent.items as any[]) {
          if (!item.str) continue;
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 8) {
            pageStr += '\n';
          } else if (pageStr.length > 0 && !pageStr.endsWith(' ') && !item.str.startsWith(' ')) {
            pageStr += ' ';
          }
          pageStr += item.str;
          lastY = item.transform[5];
        }

        if (pageStr.trim()) {
          extracted += `\n[Página ${i}]\n` + pageStr.trim() + '\n\n';
        }

        // Extracción exhaustiva de imágenes reales (fotos, figuras y esquemas incrustados)
        try {
          const ops = await page.getOperatorList();
          const fnArray = ops.fnArray;
          const argsArray = ops.argsArray;
          const OPS = pdfjs.OPS || {};

          for (let j = 0; j < fnArray.length && assets.length < maxAssets; j++) {
            const fn = fnArray[j];
            if (
              fn === OPS.paintImageXObject ||
              fn === OPS.paintInlineImageXObject ||
              fn === (OPS as any).paintJpegXObject
            ) {
              const arg = argsArray[j][0];
              let imgObj: any = null;

              if (arg && typeof arg === 'object' && (arg.width || arg.data || arg.bitmap)) {
                imgObj = arg;
              } else if (typeof arg === 'string') {
                imgObj = await getPdfImageObject(page, pdf, arg, 1000);
              }

              if (imgObj) {
                try {
                  const w = imgObj.width || (imgObj.bitmap && imgObj.bitmap.width);
                  const h = imgObj.height || (imgObj.bitmap && imgObj.bitmap.height);
                  // Filtro dimensional estricto: descartar elementos menores a 60x60 (iconos, separadores)
                  if (w >= 60 && h >= 60) {
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      if (imgObj.bitmap) {
                        ctx.drawImage(imgObj.bitmap, 0, 0);
                      } else if (imgObj.data) {
                        const imgDataObj = ctx.createImageData(w, h);
                        if (imgObj.data.length === w * h * 4) {
                          imgDataObj.data.set(imgObj.data);
                        } else if (imgObj.data.length === w * h * 3) {
                          for (let p = 0, q = 0; p < imgObj.data.length; p += 3, q += 4) {
                            imgDataObj.data[q] = imgObj.data[p];
                            imgDataObj.data[q + 1] = imgObj.data[p + 1];
                            imgDataObj.data[q + 2] = imgObj.data[p + 2];
                            imgDataObj.data[q + 3] = 255;
                          }
                        }
                        ctx.putImageData(imgDataObj, 0, 0);
                      } else if (imgObj instanceof Image || (typeof Image !== 'undefined' && imgObj instanceof Image)) {
                        ctx.drawImage(imgObj, 0, 0);
                      }

                      // Descartar rectángulos de color plano, negros sólidos o fondos sin valor pedagógico
                      if (!isSolidOrBlankCanvas(ctx, w, h)) {
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                        if (dataUrl && dataUrl.length > 250) {
                          const sig = getImageSignature(dataUrl);
                          if (!seenSignatures.has(sig)) {
                            seenSignatures.add(sig);
                            assets.push({
                              id: `asset-img-${uid()}`,
                              type: 'image',
                              dataUrl,
                              pageOrSlide: i,
                              caption: `Figura de la página ${i} (${file.name})`,
                              contextNearby: pageStr.slice(0, 200) || `Página ${i}`,
                            });
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // ignore single image decode error
                }
              }
            }
          }
        } catch {
          // ignore operator list error
        }
      }

      // Escaneo directo de imágenes JPEG binarias del PDF para asegurar que ninguna foto se quede sin extraer
      try {
        const rawJpegs = await extractRawJpegsFromPdf(arrayBuffer, file.name);
        for (const raw of rawJpegs) {
          if (assets.length >= maxAssets) break;
          if (raw.dataUrl) {
            const sig = getImageSignature(raw.dataUrl);
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              assets.push(raw);
            }
          }
        }
      } catch {
        // ignore raw jpeg scanning errors
      }

      const cleanText = sanitizeExtractedText(extracted);
      const validSents = sentences(cleanText);

      // Si el texto extraido es corto pero tiene imagenes reales extraidas
      if (cleanText.length < 60 || validSents.length === 0) {
        if (assets.length > 0) {
          const fallbackText = `Documento PDF: ${file.name}. Contiene ${totalPages} pagina(s) y ${assets.length} figura(s) extraida(s) para estudio academico.`;
          return { text: fallbackText, assets };
        }
      }

      if (cleanText.length > 60 && validSents.length > 0) {
        return { text: cleanText, assets };
      }
    } catch (e) {
      console.warn('PDF.js falló al extraer contenido:', e);
    }
  }

  throw new Error(
    `No se pudo extraer texto ni imágenes legibles del archivo PDF "${file.name}".\n\n` +
    `Esto ocurre generalmente cuando el PDF está protegido o corrupto.\n\n` +
    `Solución: Abre el PDF en tu visor habitual, selecciona el texto que deseas estudiar y pégalo en la pestaña "Texto / Notas".`
  );
}

/**
 * Extracts text content from a YouTube URL.
 */
export async function extractFromYouTube(url: string): Promise<{ text: string; title: string }> {
  const idMatch = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!idMatch) throw new Error('URL de YouTube no válida. Asegúrate de pegar el enlace completo del video.');

  const videoId = idMatch[1];

  try {
    const [noembedResult, transcriptResult] = await Promise.allSettled([
      fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`).then(r => r.json()),
      fetch(`https://yt-transcript-api.vercel.app/api?videoId=${videoId}`).then(async r => r.ok ? r.json() : null),
    ]);

    let title = `Video YouTube ${videoId}`;
    if (noembedResult.status === 'fulfilled' && noembedResult.value?.title) {
      title = noembedResult.value.title;
    }

    if (transcriptResult.status === 'fulfilled' && Array.isArray(transcriptResult.value) && transcriptResult.value.length > 0) {
      const text = transcriptResult.value.map((t: { text: string }) => t.text).join(' ');
      const clean = sanitizeExtractedText(text);
      if (clean.length > 50) {
        return { text: clean, title };
      }
    }

    return {
      title,
      text: `El video de YouTube "${title}" aborda los temas descritos en su presentación.\n\n` +
            `Para generar preguntas exactas sobre el contenido del video, copia la transcripción o subtítulos de YouTube y pégalos en la pestaña "Texto / Notas".`,
    };
  } catch {
    return {
      title: `Video YouTube`,
      text: `Material proveniente del video de YouTube (${url}). Pega la transcripción o notas para generar materiales completos.`,
    };
  }
}

/**
 * Extrae texto, tablas e imágenes de un archivo Word (.docx)
 */
async function extractTextFromDocx(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file('word/document.xml');

    if (!docXmlFile) {
      throw new Error('El archivo DOCX no contiene la estructura estándar word/document.xml.');
    }

    const xmlString = await docXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

    const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.documentElement;
    const extractedBlocks: string[] = [];
    const assets: DocumentAsset[] = [];

    // Mapear identificadores de relación rId a rutas de imágenes (word/_rels/document.xml.rels)
    const relsMap = new Map<string, string>();
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      try {
        const relsXml = await relsFile.async('string');
        const relsDoc = parser.parseFromString(relsXml, 'application/xml');
        const relElements = Array.from(relsDoc.getElementsByTagName('Relationship'));
        for (const rel of relElements) {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (id && target) {
            const normalized = target.startsWith('media/') ? `word/${target}` : target.replace(/^\.\.\//, 'word/');
            relsMap.set(id, normalized);
          }
        }
      } catch {}
    }

    // Recorrer párrafos y tablas capturando contexto cercano a imágenes
    const children = Array.from(body.childNodes);
    const imageContextMap = new Map<string, string>();

    for (const node of children) {
      const nodeName = node.nodeName.toLowerCase();
      if (nodeName.endsWith(':p') || nodeName === 'p') {
        const textNodes = Array.from((node as Element).getElementsByTagName('w:t'));
        const paragraphText = textNodes.map(t => t.textContent || '').join('').trim();
        if (paragraphText) extractedBlocks.push(paragraphText);

        const blips = Array.from((node as Element).getElementsByTagName('a:blip'));
        for (const blip of blips) {
          const embedId = blip.getAttribute('r:embed') || blip.getAttribute('r:link');
          if (embedId && relsMap.has(embedId)) {
            imageContextMap.set(relsMap.get(embedId)!, paragraphText);
          }
        }
      } else if (nodeName.endsWith(':tbl') || nodeName === 'tbl') {
        const rows = Array.from((node as Element).getElementsByTagName('w:tr'));
        const tableLines: string[] = [];
        for (const row of rows) {
          const cells = Array.from((row as Element).getElementsByTagName('w:tc'));
          const cellTexts = cells.map(cell => {
            const pNodes = Array.from(cell.getElementsByTagName('w:p'));
            return pNodes.map(p => {
              const tNodes = Array.from(p.getElementsByTagName('w:t'));
              return tNodes.map(t => t.textContent || '').join('');
            }).join(' ').trim();
          });
          tableLines.push(cellTexts.join(' | '));
        }
        if (tableLines.length > 0) {
          const tableContent = tableLines.join('\n');
          extractedBlocks.push(tableContent);
          assets.push({
            id: `asset-tbl-${uid()}`,
            type: 'table',
            caption: 'Tabla extraída del documento Word',
            contextNearby: tableContent.slice(0, 150),
          });
        }
      }
    }

    // Extracción exhaustiva de TODAS las imágenes del zip de Word
    const mediaFiles = Object.keys(zip.files).filter(name =>
      /[\\/]media[\\/][^\\/]+\.(png|jpe?g|webp|gif|bmp|svg|avif|tiff?)$/i.test(name.replace(/\\/g, '/')) ||
      /^media[\\/][^\\/]+\.(png|jpe?g|webp|gif|bmp|svg|avif|tiff?)$/i.test(name.replace(/\\/g, '/'))
    );

    const candidateMedia = mediaFiles;
    const mediaResults = await Promise.all(
      candidateMedia.map(async (mediaPath, i) => {
        const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/png';
        try {
          const b64 = await zip.files[mediaPath].async('base64');
          if (b64.length < 100) return null;

          const dataUrl = `data:${mime};base64,${b64}`;
          const context = imageContextMap.get(mediaPath) || extractedBlocks[Math.min(i * 2, extractedBlocks.length - 1)] || '';
          const captionCandidate =
            context.match(/^(figura|fig\.|ilustración|diagrama|imagen|gráfico|esquema)\s*[:\d][^\n.]*/i)?.[0] ||
            (context.length > 0 && context.length < 80 ? context : `Figura (${file.name})`);

          return { dataUrl, captionCandidate, context };
        } catch {
          return null;
        }
      })
    );

    const seenDocxSigs = new Set<string>();
    for (const item of mediaResults) {
      if (!item) continue;
      const sig = getImageSignature(item.dataUrl);
      if (seenDocxSigs.has(sig)) continue;
      seenDocxSigs.add(sig);

      const count = assets.filter(a => a.type === 'image').length + 1;
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl: item.dataUrl,
        caption: item.captionCandidate.includes('Figura') ? `${item.captionCandidate} ${count}` : item.captionCandidate,
        contextNearby: item.context.slice(0, 200),
      });
    }

    // Escáner binario suplementario si no se encontraron en la estructura zip
    if (assets.filter(a => a.type === 'image').length === 0) {
      try {
        const binaryImages = await extractEmbeddedImagesFromBinary(arrayBuffer, file.name, 20);
        for (const img of binaryImages) {
          if (!assets.some(a => a.dataUrl === img.dataUrl)) {
            assets.push(img);
          }
        }
      } catch {}
    }

    const result = sanitizeExtractedText(extractedBlocks.join('\n\n'));
    return {
      text: result || `Documento Word: ${file.name}. Contiene ${assets.length} elemento(s) visual(es) extraído(s).`,
      assets
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer archivo Word (${file.name}): ${msg}`);
  }
}

/**
 * Extrae diapositivas, notas del orador e imágenes de un archivo PowerPoint (.pptx)
 */
/** Helper to find zip files regardless of Windows/Unix slashes or casing */
function findZipEntry(zip: JSZip, searchPath: string): JSZip.JSZipObject | null {
  const norm = searchPath.replace(/\\/g, '/').toLowerCase();
  for (const [key, file] of Object.entries(zip.files)) {
    if (key.replace(/\\/g, '/').toLowerCase() === norm) {
      return file;
    }
  }
  return null;
}

/** Helper to find multiple zip files matching a regex */
function findZipEntries(zip: JSZip, regex: RegExp): { name: string; file: JSZip.JSZipObject }[] {
  const matches: { name: string; file: JSZip.JSZipObject }[] = [];
  for (const [key, file] of Object.entries(zip.files)) {
    const norm = key.replace(/\\/g, '/');
    if (regex.test(norm)) {
      matches.push({ name: norm, file });
    }
  }
  return matches;
}

async function extractTextFromPptx(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Identificar y ordenar diapositivas en su secuencia real
    // Primero intentar desde ppt/presentation.xml y sus relaciones
    let orderedSlidePaths: string[] = [];
    const presEntry = findZipEntry(zip, 'ppt/presentation.xml');
    const presRelsEntry = findZipEntry(zip, 'ppt/_rels/presentation.xml.rels');

    if (presEntry && presRelsEntry) {
      try {
        const presXml = await presEntry.async('string');
        const presRelsXml = await presRelsEntry.async('string');

        // Mapear rId -> ruta de diapositiva
        const relMap = new Map<string, string>();
        const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi;
        let rMatch;
        while ((rMatch = relRegex.exec(presRelsXml)) !== null) {
          const rId = rMatch[1];
          let target = rMatch[2].replace(/\\/g, '/');
          if (!target.startsWith('ppt/')) {
            target = target.startsWith('slides/') ? `ppt/${target}` : `ppt/slides/${target}`;
          }
          relMap.set(rId, target);
        }

        // Obtener orden de sldId
        const sldIdRegex = /<p:sldId\b[^>]*r:id="([^"]+)"/gi;
        let sMatch;
        while ((sMatch = sldIdRegex.exec(presXml)) !== null) {
          const rId = sMatch[1];
          const target = relMap.get(rId);
          if (target && findZipEntry(zip, target)) {
            orderedSlidePaths.push(target);
          }
        }
      } catch {
        // fallback to filenames
      }
    }

    // Fallback: listar todos los archivos de diapositiva en ppt/slides/slide*.xml
    if (orderedSlidePaths.length === 0) {
      const slideEntries = findZipEntries(zip, /(?:^|[\\/])ppt[\\/]slides[\\/]slide[^\\/]*\.xml$/i);
      slideEntries.sort((a, b) => {
        const numA = parseInt(a.name.match(/slide(\d+)/i)?.[1] || a.name.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.name.match(/slide(\d+)/i)?.[1] || b.name.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });
      orderedSlidePaths = slideEntries.map(e => e.name);
    }

    if (orderedSlidePaths.length === 0) {
      throw new Error('El archivo PowerPoint no contiene diapositivas legibles.');
    }

    // 2. Mapear qué imagen pertenece a qué diapositiva leyendo todos los ppt/slides/_rels/*.rels en paralelo
    const slideImageMap = new Map<string, number>(); // 'image1.png' -> slideNum
    const relFiles = findZipEntries(zip, /(?:^|[\\/])ppt[\\/]slides[\\/]_rels[\\/][^\\/]+\.rels$/i);

    await Promise.all(
      relFiles.map(async (relFile) => {
        try {
          const slideNumMatch = relFile.name.match(/slide(\d+)\.xml\.rels/i);
          const slideNum = slideNumMatch ? parseInt(slideNumMatch[1], 10) : 1;
          const relsXml = await relFile.file.async('string');
          const imgRelRegex = /<Relationship\b[^>]*Target="([^"]+)"[^>]*>/gi;
          let m;
          while ((m = imgRelRegex.exec(relsXml)) !== null) {
            const target = m[1].replace(/\\/g, '/');
            if (/\.(png|jpe?g|webp|gif|bmp|svg|avif|tiff?)$/i.test(target)) {
              const fileNameOnly = target.split('/').pop()?.toLowerCase();
              if (fileNameOnly && !slideImageMap.has(fileNameOnly)) {
                slideImageMap.set(fileNameOnly, slideNum);
              }
            }
          }
        } catch {}
      })
    );

    // 3. Extraer texto exhaustivo de cada diapositiva en paralelo con Promise.all
    const parsedSlides = await Promise.all(
      orderedSlidePaths.map(async (slidePath, i) => {
        const slideNumMatch = slidePath.match(/slide(\d+)/i);
        const slideNum = slideNumMatch ? parseInt(slideNumMatch[1], 10) : (i + 1);
        const slideEntry = findZipEntry(zip, slidePath);
        if (!slideEntry) return null;

        const xmlStr = await slideEntry.async('string');
        const slideLines: string[] = [];

        // A. Extraer por párrafos (<a:p>)
        const pRegex = /<(?:\w+:)?p\b[^>]*>([\s\S]*?)<\/(?:\w+:)?p>/gi;
        let pMatch;
        while ((pMatch = pRegex.exec(xmlStr)) !== null) {
          const pInner = pMatch[1];
          const tRegex = /<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/gi;
          let tMatch;
          const lineParts: string[] = [];
          while ((tMatch = tRegex.exec(pInner)) !== null) {
            const txt = tMatch[1].trim();
            if (txt) lineParts.push(txt);
          }
          const line = lineParts.join(' ').trim();
          if (line && !slideLines.includes(line)) {
            slideLines.push(line);
          }
        }

        // B. Fallback: extraer cualquier texto <*:t> directo si no se detectaron párrafos
        if (slideLines.length === 0) {
          const tAllRegex = /<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/gi;
          let tMatch;
          while ((tMatch = tAllRegex.exec(xmlStr)) !== null) {
            const txt = tMatch[1].trim();
            if (txt && !slideLines.includes(txt)) {
              slideLines.push(txt);
            }
          }
        }

        // C. Buscar notas del orador
        let notesText = '';
        const notesEntry = findZipEntry(zip, `ppt/notesSlides/notesSlide${slideNum}.xml`);
        if (notesEntry) {
          try {
            const notesXml = await notesEntry.async('string');
            const tNotesRegex = /<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/gi;
            const noteParts: string[] = [];
            let nMatch;
            while ((nMatch = tNotesRegex.exec(notesXml)) !== null) {
              const txt = nMatch[1].trim();
              if (txt && txt !== String(slideNum) && !/^diapositiva\s+\d+$/i.test(txt)) {
                noteParts.push(txt);
              }
            }
            if (noteParts.length > 0) {
              notesText = `\n[Notas del orador: ${noteParts.join(' ')}]`;
            }
          } catch {}
        }

        const slideTitle = slideLines[0] || `Diapositiva ${i + 1}`;
        const slideBody = slideLines.slice(1).join('\n') || (slideLines[0] ? '' : '[Diapositiva con esquema/gráfico visual]');
        const fullSlideText = `## Diapositiva ${i + 1}: ${slideTitle}\n${slideBody}${notesText}`.trim();

        return {
          index: i + 1,
          fullSlideText,
          slideLinesText: slideLines.join(' '),
        };
      })
    );

    const slidesContent: string[] = [];
    const slideTextMap = new Map<number, string>();
    for (const item of parsedSlides) {
      if (!item) continue;
      slidesContent.push(item.fullSlideText);
      slideTextMap.set(item.index, item.slideLinesText);
    }

    // 4. Extraer TODAS las imágenes embebidas en cualquier carpeta del PowerPoint (.pptx)
    const mediaEntries = findZipEntries(zip, /\.(png|jpe?g|webp|gif|bmp|svg|avif|tiff?)$/i);
    const rawMediaResults = await Promise.all(
      mediaEntries.map(async (mediaEntry) => {
        const fileNameOnly = mediaEntry.name.split('/').pop()?.toLowerCase() || '';
        const ext = fileNameOnly.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'gif' ? 'image/gif'
          : ext === 'svg' ? 'image/svg+xml'
          : ext === 'webp' ? 'image/webp'
          : ext === 'bmp' ? 'image/bmp'
          : 'image/png';

        try {
          const b64 = await mediaEntry.file.async('base64');
          if (b64.length < 100) return null;
          return { fileNameOnly, mime, b64 };
        } catch {
          return null;
        }
      })
    );

    const assets: DocumentAsset[] = [];
    const processedSignatures = new Set<string>();

    for (const m of rawMediaResults) {
      if (!m) continue;
      const sig = `${m.b64.length}:${m.b64.slice(Math.floor(m.b64.length / 2), Math.floor(m.b64.length / 2) + 40)}:${m.b64.slice(-40)}`;
      if (processedSignatures.has(sig)) continue;
      processedSignatures.add(sig);

      const dataUrl = `data:${m.mime};base64,${m.b64}`;
      const assignedSlide = slideImageMap.get(m.fileNameOnly) || Math.min(assets.length + 1, orderedSlidePaths.length);
      const nearbyText = slideTextMap.get(assignedSlide) || `Diapositiva ${assignedSlide}`;

      assets.push({
        id: `asset-slide-img-${assignedSlide}-${uid()}`,
        type: 'image',
        dataUrl,
        caption: `Diapositiva ${assignedSlide}: Figura / Esquema (${file.name})`,
        pageOrSlide: assignedSlide,
        contextNearby: nearbyText.slice(0, 200),
      });
    }

    const result = sanitizeExtractedText(slidesContent.join('\n\n'));
    return {
      text: result || `Presentación PowerPoint: ${file.name}. Contiene ${orderedSlidePaths.length} diapositivas y ${assets.length} figuras extraídas.`,
      assets
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer archivo PowerPoint (${file.name}): ${msg}`);
  }
}

/**
 * Extrae texto, hojas y gráficos incrustados de un archivo Excel (.xlsx, .xlsm)
 */
async function extractContentFromExcel(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();
    const textBlocks: string[] = [];
    const assets: DocumentAsset[] = [];

    // 1. Extraer cadenas compartidas (sharedStrings.xml)
    const sharedStrings: string[] = [];
    const sstFile = zip.file('xl/sharedStrings.xml');
    if (sstFile) {
      try {
        const sstXml = await sstFile.async('string');
        const sstDoc = parser.parseFromString(sstXml, 'application/xml');
        const siElements = Array.from(sstDoc.getElementsByTagName('si'));
        for (const si of siElements) {
          const tNodes = Array.from(si.getElementsByTagName('t'));
          sharedStrings.push(tNodes.map(t => t.textContent || '').join(' ').trim());
        }
      } catch {}
    }

    // 2. Extraer hojas de cálculo (worksheets/sheet*.xml) en paralelo
    const sheetFiles = Object.keys(zip.files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
    const candidateSheets = sheetFiles.slice(0, 10);
    const sheetResults = await Promise.all(
      candidateSheets.map(async (sheetFile, s) => {
        try {
          const sheetXml = await zip.files[sheetFile].async('string');
          const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
          const rows = Array.from(sheetDoc.getElementsByTagName('row'));
          const rowLines: string[] = [];

          for (const row of rows) {
            const cells = Array.from(row.getElementsByTagName('c'));
            const cellValues: string[] = [];
            for (const cell of cells) {
              const type = cell.getAttribute('t');
              const valNode = cell.getElementsByTagName('v')[0];
              let val = valNode ? (valNode.textContent || '').trim() : '';
              if (type === 's' && val) {
                const idx = parseInt(val, 10);
                val = sharedStrings[idx] || val;
              }
              if (val) cellValues.push(val);
            }
            if (cellValues.length > 0) {
              rowLines.push(cellValues.join(' | '));
            }
          }

          if (rowLines.length > 0) {
            return `### Hoja ${s + 1}\n` + rowLines.slice(0, 100).join('\n');
          }
        } catch {}
        return null;
      })
    );

    for (const b of sheetResults) {
      if (b) textBlocks.push(b);
    }

    // 3. Extraer imágenes y gráficos incrustados en xl/media/ concurrentemente
    const mediaFiles = Object.keys(zip.files).filter(name =>
      /^xl\/media\/.+\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
    );
    const candidateMedia = mediaFiles;
    const mediaResults = await Promise.all(
      candidateMedia.map(async (mediaPath) => {
        const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/png';
        try {
          const b64 = await zip.files[mediaPath].async('base64');
          const dataUrl = `data:${mime};base64,${b64}`;
          const dims = await getImageDimensions(dataUrl);

          if (dims && dims.w > 0 && dims.h > 0) {
            return dataUrl;
          }
        } catch {}
        return null;
      })
    );

    for (const dataUrl of mediaResults) {
      if (!dataUrl) continue;
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl,
        caption: `Gráfico / Esquema ${assets.length + 1} de la hoja de cálculo (${file.name})`,
        contextNearby: textBlocks[0]?.slice(0, 150) || `Datos de la hoja de cálculo ${file.name}`,
      });
    }

    // Escáner binario si no se encontraron en xl/media/
    if (assets.length === 0) {
      try {
        const binImages = await extractEmbeddedImagesFromBinary(arrayBuffer, file.name, 25);
        assets.push(...binImages);
      } catch {}
    }

    const result = sanitizeExtractedText(textBlocks.join('\n\n'));
    return {
      text: result || `Hoja de cálculo Excel: ${file.name}. Contiene datos tabulares y ${assets.length} gráfico(s) extraído(s).`,
      assets
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer archivo Excel (${file.name}): ${msg}`);
  }
}

/**
 * Extrae texto e imágenes de archivos OpenDocument (.odt, .odp, .ods)
 */
async function extractContentFromOpenDocument(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();
    const textBlocks: string[] = [];
    const assets: DocumentAsset[] = [];

    // 1. Extraer texto de content.xml
    const contentFile = zip.file('content.xml');
    if (contentFile) {
      try {
        const xmlStr = await contentFile.async('string');
        const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
        const paras = Array.from(xmlDoc.getElementsByTagName('text:p'));
        for (const p of paras) {
          const text = (p.textContent || '').trim();
          if (text) textBlocks.push(text);
        }
      } catch {}
    }

    // 2. Extraer imágenes de la carpeta estándar Pictures/ en paralelo
    const picFiles = Object.keys(zip.files).filter(name =>
      /^Pictures\/.+\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
    );
    const candidatePics = picFiles.slice(0, 35);
    const picResults = await Promise.all(
      candidatePics.map(async (picPath) => {
        const ext = picPath.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
        try {
          const b64 = await zip.files[picPath].async('base64');
          const dataUrl = `data:${mime};base64,${b64}`;
          const dims = await getImageDimensions(dataUrl);

          if (dims && dims.w >= 60 && dims.h >= 60) {
            return dataUrl;
          }
        } catch {}
        return null;
      })
    );

    for (let i = 0; i < picResults.length; i++) {
      const dataUrl = picResults[i];
      if (!dataUrl) continue;
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl,
        caption: `Figura ${assets.length + 1} del documento (${file.name})`,
        contextNearby: textBlocks[Math.min(i * 2, textBlocks.length - 1)] || file.name,
      });
    }

    if (assets.length === 0) {
      try {
        const binImages = await extractEmbeddedImagesFromBinary(arrayBuffer, file.name, 25);
        assets.push(...binImages);
      } catch {}
    }

    const result = sanitizeExtractedText(textBlocks.join('\n\n'));
    return {
      text: result || `Documento OpenDocument: ${file.name}. Contiene ${assets.length} figura(s) extraída(s).`,
      assets
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer archivo OpenDocument (${file.name}): ${msg}`);
  }
}

/**
 * Extrae texto e ilustraciones de libros electrónicos EPUB (.epub)
 */
async function extractContentFromEpub(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();
    const textBlocks: string[] = [];
    const assets: DocumentAsset[] = [];

    // 1. Extraer capítulos XHTML / HTML en paralelo
    const xhtmlFiles = Object.keys(zip.files).filter(name =>
      /\.(xhtml|html|htm)$/i.test(name) && !/toc\.ncx/i.test(name)
    );
    xhtmlFiles.sort();

    const chapterResults = await Promise.all(
      xhtmlFiles.map(async (xhtmlPath) => {
        try {
          const htmlStr = await zip.files[xhtmlPath].async('string');
          const doc = parser.parseFromString(htmlStr, 'text/html');
          const text = (doc.body?.textContent || '').trim();
          if (text.length > 30) return text;
        } catch {}
        return null;
      })
    );

    for (const ch of chapterResults) {
      if (ch) textBlocks.push(ch);
    }

    // 2. Extraer ilustraciones en paralelo
    const imgFiles = Object.keys(zip.files).filter(name =>
      /\.(png|jpe?g|webp|gif|svg)$/i.test(name) && !/cover/i.test(name)
    );
    const candidateImgs = imgFiles.slice(0, 40);
    const imgResults = await Promise.all(
      candidateImgs.map(async (imgPath) => {
        const ext = imgPath.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
        try {
          const b64 = await zip.files[imgPath].async('base64');
          const dataUrl = `data:${mime};base64,${b64}`;
          const dims = await getImageDimensions(dataUrl);

          if (dims && dims.w >= 60 && dims.h >= 60) {
            return dataUrl;
          }
        } catch {}
        return null;
      })
    );

    for (let i = 0; i < imgResults.length; i++) {
      const dataUrl = imgResults[i];
      if (!dataUrl) continue;
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl,
        caption: `Ilustración ${assets.length + 1} del libro (${file.name})`,
        contextNearby: textBlocks[Math.min(i, textBlocks.length - 1)]?.slice(0, 150) || file.name,
      });
    }

    const result = sanitizeExtractedText(textBlocks.join('\n\n'));
    return {
      text: result || `Libro electrónico EPUB: ${file.name}. Contiene ${assets.length} ilustración(es) extraída(s).`,
      assets
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer archivo EPUB (${file.name}): ${msg}`);
  }
}

/**
 * Extrae texto, imágenes inline y diagramas SVG de archivos HTML (.html, .htm)
 */
async function extractContentFromHtml(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  const rawHtml = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  const assets: DocumentAsset[] = [];

  // Extraer imágenes inline con dataUrl
  const imgElements = Array.from(doc.getElementsByTagName('img'));
  for (let i = 0; i < imgElements.length && assets.length < 30; i++) {
    const img = imgElements[i];
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || `Imagen ${assets.length + 1} del documento web`;

    if (src.startsWith('data:image/')) {
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl: src,
        caption: alt,
        contextNearby: img.parentElement?.textContent?.slice(0, 150) || alt,
      });
    }
  }

  // Extraer diagramas vectoriales SVG
  const svgElements = Array.from(doc.getElementsByTagName('svg'));
  for (let s = 0; s < svgElements.length && assets.length < 30; s++) {
    try {
      const svgXml = new XMLSerializer().serializeToString(svgElements[s]);
      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgXml)}`;
      assets.push({
        id: `asset-img-${uid()}`,
        type: 'image',
        dataUrl,
        caption: `Diagrama vectorial SVG ${s + 1} (${file.name})`,
        contextNearby: svgElements[s].parentElement?.textContent?.slice(0, 150) || 'Diagrama vectorial SVG',
      });
    } catch {}
  }

  const scripts = doc.querySelectorAll('script, style, nav, footer, header');
  scripts.forEach(s => s.remove());
  const cleanText = sanitizeExtractedText(doc.body?.textContent || rawHtml);

  return { text: cleanText, assets };
}

/**
 * Extrae texto e imágenes binarias incrustadas de documentos RTF (.rtf)
 */
async function extractContentFromRtf(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  const rawRtf = await file.text();
  const assets: DocumentAsset[] = [];
  const cleanText = extractTextFromRtf(rawRtf);

  const pictRegex = /\{\\pict[\s\S]*?([0-9a-fA-F\s]{200,})\}/gi;
  let match: RegExpExecArray | null;

  while ((match = pictRegex.exec(rawRtf)) !== null && assets.length < 25) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length >= 200) {
      try {
        const byteLen = hex.length >> 1;
        const bytes = new Uint8Array(byteLen);
        for (let i = 0; i < byteLen; i++) {
          const c1 = hex.charCodeAt(i * 2);
          const c2 = hex.charCodeAt(i * 2 + 1);
          const v1 = c1 >= 97 ? c1 - 87 : c1 >= 65 ? c1 - 55 : c1 - 48;
          const v2 = c2 >= 97 ? c2 - 87 : c2 >= 65 ? c2 - 55 : c2 - 48;
          bytes[i] = (v1 << 4) | v2;
        }

        const subAssets = await extractEmbeddedImagesFromBinary(bytes.buffer, file.name, 1);
        if (subAssets.length > 0) {
          assets.push(subAssets[0]);
        }
      } catch {}
    }
  }

  // Si no se encontraron por pict, intentar escaneo binario
  if (assets.length === 0) {
    try {
      const buffer = await file.arrayBuffer();
      const binImages = await extractEmbeddedImagesFromBinary(buffer, file.name, 15);
      assets.push(...binImages);
    } catch {}
  }

  return { text: cleanText, assets };
}

/**
 * Extrae texto e imágenes inline de archivos Markdown (.md)
 */
async function extractContentFromMarkdown(file: File): Promise<{ text: string; assets: DocumentAsset[] }> {
  const raw = await file.text();
  const assets: DocumentAsset[] = [];

  const imgRegex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(raw)) !== null && assets.length < 25) {
    const alt = match[1] || `Figura ${assets.length + 1} del documento Markdown`;
    const dataUrl = match[2];
    assets.push({
      id: `asset-img-${uid()}`,
      type: 'image',
      dataUrl,
      caption: alt,
      contextNearby: alt,
    });
  }

  const cleanText = sanitizeExtractedText(raw);
  return { text: cleanText, assets };
}

/**
 * Extrae contenido estructurado de archivos XML
 */
async function extractTextFromXml(file: File): Promise<string> {
  const raw = await file.text();
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(raw, 'application/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      return sanitizeExtractedText(raw.replace(/<[^>]+>/g, ' '));
    }

    const walker = document.createTreeWalker(xmlDoc, NodeFilter.SHOW_TEXT);
    const chunks: string[] = [];
    let node = walker.nextNode();
    while (node) {
      const val = (node.nodeValue || '').trim();
      if (val.length > 0) chunks.push(val);
      node = walker.nextNode();
    }
    return sanitizeExtractedText(chunks.join('\n'));
  } catch {
    return sanitizeExtractedText(raw.replace(/<[^>]+>/g, ' '));
  }
}

/**
 * Extrae texto legible de formato RTF
 */
function extractTextFromRtf(rawRtf: string): string {
  let text = rawRtf
    .replace(/\\([a-z]{1,32})(-?\d+)? ?/gi, ' ')
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/[{}]/g, '')
    .trim();
  return sanitizeExtractedText(text);
}

/**
 * Extrae contenido legible de cualquier URL utilizando Jina AI Reader como motor principal
 * con fallback inteligente a proxy CORS y limpieza profunda de HTML.
 */
export async function extractFromURL(url: string): Promise<{ text: string; title: string }> {
  let cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // 1. Intentar con Jina AI Reader (diseñado para LLMs, elimina anuncios, navegación y resuelve CORS)
  try {
    const jinaUrl = `https://r.jina.ai/${cleanUrl}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const markdown = await res.text();
      let title = '';
      const titleMatch = markdown.match(/^Title:\s*(.+)$/m) || markdown.match(/^#\s*(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        try {
          title = new URL(cleanUrl).hostname;
        } catch {
          title = 'Página Web';
        }
      }

      const contentWithoutMeta = markdown
        .replace(/^Title:[\s\S]*?Markdown Content:\s*/i, '')
        .replace(/^URL Source:[\s\S]*?\n/gi, '')
        .replace(/^Published Time:[\s\S]*?\n/gi, '');

      const cleanText = sanitizeExtractedText(contentWithoutMeta);
      if (cleanText.length > 50) {
        return { text: cleanText.slice(0, 50000), title };
      }
    }
  } catch (jinaErr) {
    console.warn('[extractFromURL] Jina Reader falló o agotó tiempo, usando proxy CORS:', jinaErr);
  }

  // 2. Fallback a Proxy CORS (AllOrigins)
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(cleanUrl)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const html = data.contents || '';

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : new URL(cleanUrl).hostname;

      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

      const clean = sanitizeExtractedText(text);
      if (clean.length > 50) {
        return { text: clean.slice(0, 50000), title };
      }
    }
  } catch (proxyErr) {
    console.warn('[extractFromURL] Proxy AllOrigins falló:', proxyErr);
  }

  throw new Error(
    `No fue posible extraer automáticamente el contenido de la URL:\n${cleanUrl}\n\n` +
    `Esto ocurre si el sitio bloquea rastreadores automatizados o requiere inicio de sesión.\n` +
    `Solución: Abre la página en tu navegador, copia el texto que deseas estudiar y pégalo en la pestaña "Texto / Notas".`
  );
}

/**
 * Extrae texto y activos multimodales (imágenes, diagramas, figuras) de cualquier tipo de archivo
 */
export async function extractFromFile(file: File): Promise<{ text: string; title: string; assets?: DocumentAsset[] }> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const title = fileName.replace(/\.[^.]+$/, '');

  // 0. Imágenes directas (.png, .jpg, .jpeg, .webp, .svg, .gif, .bmp, .avif, .tiff)
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif|bmp|avif|tiff?)$/i.test(lowerName)) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Error al leer archivo de imagen "${fileName}"`));
      reader.readAsDataURL(file);
    });

    const asset: DocumentAsset = {
      id: `asset-img-${uid()}`,
      type: 'image',
      dataUrl,
      caption: `Imagen: ${title}`,
      contextNearby: `Recurso visual adjunto: ${fileName}`,
    };

    const text = `Documento visual: ${title} (${fileName}). Ilustración y esquema conceptual de estudio sobre ${title}. Este recurso visual contiene diagramas, conceptos clave y elementos gráficos esenciales para el análisis y evaluación académica del tema.`;

    return { text, title, assets: [asset] };
  }

  // 1. PDF (.pdf)
  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    const pdfData = await extractContentFromPDF(file);
    return { text: pdfData.text, title, assets: pdfData.assets };
  }

  // 2. Word (.docx)
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    const docData = await extractTextFromDocx(file);
    return { text: docData.text, title, assets: docData.assets };
  }

  // 3. PowerPoint (.pptx)
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lowerName.endsWith('.pptx')
  ) {
    const pptData = await extractTextFromPptx(file);
    return { text: pptData.text, title, assets: pptData.assets };
  }

  // 4. Excel (.xlsx, .xlsm, .xltx)
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    /\.(xlsx|xlsm|xltx)$/i.test(lowerName)
  ) {
    const excelData = await extractContentFromExcel(file);
    return { text: excelData.text, title, assets: excelData.assets };
  }

  // 5. OpenDocument (.odt, .odp, .ods)
  if (
    file.type.includes('opendocument') ||
    /\.(odt|odp|ods)$/i.test(lowerName)
  ) {
    const odfData = await extractContentFromOpenDocument(file);
    return { text: odfData.text, title, assets: odfData.assets };
  }

  // 6. Libros electrónicos EPUB (.epub)
  if (file.type === 'application/epub+zip' || lowerName.endsWith('.epub')) {
    const epubData = await extractContentFromEpub(file);
    return { text: epubData.text, title, assets: epubData.assets };
  }

  // 7. Documentos Web HTML (.html, .htm)
  if (file.type === 'text/html' || /\.(html?|xhtml)$/i.test(lowerName)) {
    const htmlData = await extractContentFromHtml(file);
    return { text: htmlData.text, title, assets: htmlData.assets };
  }

  // 8. Documentos RTF (.rtf) con soporte para imágenes {\pict ...} y binarias
  if (file.type === 'application/rtf' || lowerName.endsWith('.rtf')) {
    const rtfData = await extractContentFromRtf(file);
    return { text: rtfData.text, title, assets: rtfData.assets };
  }

  // 9. Markdown (.md) con soporte para imágenes inline
  if (lowerName.endsWith('.md')) {
    const mdData = await extractContentFromMarkdown(file);
    return { text: mdData.text, title, assets: mdData.assets };
  }

  // 10. Formatos binarios clásicos de Office (.doc, .ppt, .xls)
  if (/\.(doc|ppt|xls)$/i.test(lowerName)) {
    try {
      const buffer = await file.arrayBuffer();
      const assets = await extractEmbeddedImagesFromBinary(buffer, fileName, 35);

      const bytes = new Uint8Array(buffer);
      const decoder = new TextDecoder('latin1', { fatal: false });
      const decoded = decoder.decode(bytes);
      const matches = decoded.match(/[\x20-\x7E\t\n\r\xC0-\xFF]{5,}/g) || [];
      const rawAscii = matches.join(' ');
      const clean = sanitizeExtractedText(rawAscii);
      if (clean.length > 50 || assets.length > 0) {
        return {
          text: clean || `Documento Office clásico: ${fileName}. Contiene ${assets.length} figura(s) extraída(s) para estudio.`,
          title,
          assets
        };
      }
    } catch {
      // ignore
    }
  }

  // 11. XML (.xml)
  if (file.type === 'text/xml' || file.type === 'application/xml' || lowerName.endsWith('.xml')) {
    const text = await extractTextFromXml(file);
    return { text, title, assets: [] };
  }

  // 12. CSV / TSV
  if (file.type === 'text/csv' || lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
    const raw = await file.text();
    return { text: sanitizeExtractedText(raw), title, assets: [] };
  }

  // 13. JSON
  if (file.type === 'application/json' || lowerName.endsWith('.json')) {
    const raw = await file.text();
    try {
      const parsed = JSON.parse(raw);
      return { text: JSON.stringify(parsed, null, 2), title, assets: [] };
    } catch {
      return { text: sanitizeExtractedText(raw), title, assets: [] };
    }
  }

  // 14. Texto plano (.txt, .text)
  if (file.type === 'text/plain' || lowerName.endsWith('.txt') || lowerName.endsWith('.text')) {
    const text = await file.text();
    const clean = sanitizeExtractedText(text);
    return { text: clean, title, assets: [] };
  }

  // 15. Fallback universal para cualquier archivo desconocido: escanea texto y buffer binario de imágenes
  try {
    const buffer = await file.arrayBuffer();
    const assets = await extractEmbeddedImagesFromBinary(buffer, fileName, 30);
    const text = await file.text();
    const clean = sanitizeExtractedText(text);

    if (clean.length > 30 || assets.length > 0) {
      return {
        text: clean || `Archivo ${fileName}. Contiene ${assets.length} figura(s) extraída(s) para estudio.`,
        title,
        assets
      };
    }
  } catch {
    // ignore
  }

  throw new Error(
    `Formato de archivo no soportado: "${fileName}".\n\n` +
    `Formatos admitidos: Word (.docx, .doc), PowerPoint (.pptx, .ppt), Excel (.xlsx), OpenDocument (.odt, .odp), EPUB (.epub), PDF (.pdf), HTML (.html), Imágenes (.png, .jpg, .webp, .svg), XML (.xml), TXT (.txt), Markdown (.md), CSV (.csv), JSON (.json).`
  );
}


