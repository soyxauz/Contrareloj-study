import type { StudyKit } from '../types';

export interface GlossaryConcept {
  term: string;
  definition: string;
  source?: 'flashcard' | 'guide';
}

/**
 * Escapa caracteres especiales de expresiones regulares.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Palabras comunes, etiquetas estructurales o términos de secciones médicas/académicas
 * que NUNCA deben marcarse como conceptos de glosario.
 */
const EXCLUDED_TERMS = new Set([
  // Artículos y preposiciones
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'para', 'con', 'por', 'sobre', 'entre', 'hacia', 'sin', 'tras', 'durante', 'hasta',

  // Secciones y estructura de guías
  'resumen', 'introduccion', 'introducción', 'conclusion', 'conclusión',
  'caso clinico', 'caso clínico', 'casos clinicos', 'casos clínicos',
  'farmacocinetica', 'farmacocinética', 'farmacodinamia',
  'mecanismo', 'mecanismos', 'mecanismo de accion', 'mecanismo de acción',
  'efectos adversos', 'efectos secundarios', 'efectos colaterales', 'reacciones adversas',
  'contraindicaciones', 'contraindicacion', 'contraindicación',
  'tratamiento', 'tratamientos', 'diagnostico', 'diagnóstico',
  'clasificacion', 'clasificación', 'definicion', 'definición',
  'nota', 'notas', 'importante', 'atencion', 'atención', 'ejemplo', 'ejemplos', 'tabla', 'tablas',
  'nivel 1', 'nivel 2', 'nivel 3', 'fisiopatologia', 'fisiopatología', 'fisiopatologico', 'fisiopatológico',
  'clinica', 'clínica', 'cuadro clinico', 'cuadro clínico', 'manifestaciones clinicas', 'manifestaciones clínicas',
  'etiologia', 'etiología', 'epidemiologia', 'epidemiología',
  'patogenia', 'prevencion', 'prevención', 'pronostico', 'pronóstico',
  'generalidades', 'factores de riesgo', 'criterios',

  // Propiedades / Metadatos de medicamentos o enfermedades
  'inicio', 'inicio de accion', 'inicio de acción',
  'pico', 'pico de accion', 'pico de acción', 'pico de action',
  'duracion', 'duración', 'vida media',
  'uso', 'usos', 'uso clinico', 'uso clínico', 'indicacion', 'indicación', 'indicaciones',
  'administracion', 'administración', 'via', 'vía', 'via de administracion', 'vía de administración',
  'dosis', 'dosificacion', 'dosificación', 'posologia', 'posología',
  'eliminacion', 'eliminación', 'absorcion', 'absorción', 'metabolismo', 'distribucion', 'distribución',
  'excrecion', 'excreción', 'biodisponibilidad',
  'hepatico', 'hepático', 'renal', 'periferico', 'periférico', 'intestinal', 'gastrointestinal',
  'gastrointestinales', 'cardiaco', 'cardíaco', 'pulmonar', 'cerebral', 'neurologico', 'neurológico',
  'hematologico', 'hematológico',
  'fase', 'fases', 'tipo', 'tipos', 'subtipo', 'subtipos',
  'caracteristicas', 'características', 'propiedades', 'funcion', 'función', 'funciones',
  'sintoma', 'síntoma', 'sintomas', 'síntomas', 'signo', 'signos',
  'complicaciones', 'toxicidad', 'interacciones', 'precauciones',
  'paciente', 'pacientes', 'adulto', 'adultos', 'pediatrico', 'pediátrico',
  'hombre', 'mujer', 'embarazo', 'lactancia',
  'resultado', 'resultados', 'hallazgo', 'hallazgos', 'laboratorio',
  'estudio', 'estudios', 'metodo', 'método', 'tecnica', 'técnica',
  'objetivo', 'objetivos', 'clave', 'puntos clave', 'aspectos clave',
  'subtema', 'tema', 'modulo', 'módulo', 'pregunta', 'preguntas', 'respuesta', 'respuestas',
]);

/**
 * Valida si un término es un concepto legítimo y coherente.
 */
function isValidConceptTerm(term: string): boolean {
  const clean = term.trim();
  const lower = clean.toLowerCase();

  // Longitud razonable
  if (clean.length < 3 || clean.length > 55) return false;

  // No debe estar en la lista de términos excluidos
  if (EXCLUDED_TERMS.has(lower)) return false;

  // No debe terminar en preposiciones ni signos de puntuación colgantes
  if (/(?:\s+(?:de|del|en|y|o|con|sin|por|para|a)|[:;.,-])$/i.test(clean)) return false;

  // No debe empezar con palabras de sección o viñetas
  if (/^(?:paso|punto|seccion|sección|capitulo|capítulo|figura|imagen)\s+/i.test(clean)) return false;

  // Si es una sola palabra:
  const words = clean.split(/\s+/);
  if (words.length === 1) {
    // Si tiene menos de 4 letras y no es una sigla médica en mayúsculas (ej: NPH, IDO, HLA)
    if (clean.length < 4 && !/^[A-Z0-9-]{2,5}$/.test(clean)) {
      return false;
    }
    // Palabras genéricas en español de una sola palabra
    if (/^(?:caso|dosis|forma|medio|mayor|menor|total|parte|nivel|grado|grupo|clase|efecto|tiempo|salud|enfermedad|vida)$/i.test(clean)) {
      return false;
    }
  }

  // Máximo 5 palabras
  if (words.length > 5) return false;

  return true;
}

/**
 * Limpia y recorta una definición para que siempre termine en una oración completa con punto final,
 * evitando cortes abruptos como "lo que c...".
 */
function cleanDefinitionSentence(rawDef: string): string {
  let def = rawDef.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Si la definición empieza con guiones o dos puntos residuales
  def = def.replace(/^[:\s\-•]+/, '').trim();

  // Buscar el cierre de la primera o segunda oración completa (punto seguido de espacio o fin)
  const sentenceMatches = def.match(/^(.+?\.)(?:\s+[A-ZÁÉÍÓÚ]|$)/);
  if (sentenceMatches && sentenceMatches[1].length >= 30) {
    def = sentenceMatches[1].trim();
  } else if (def.length > 250) {
    // Si no tiene punto antes de 250 caracteres, cortar en el último espacio antes del límite y añadir punto
    const truncated = def.substring(0, 240);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 120) {
      def = truncated.substring(0, lastSpace).trim() + '.';
    } else {
      def = truncated.trim() + '.';
    }
  }

  // Asegurar que termine en punto final si no tiene puntuación de cierre
  if (!/[.!?]$/.test(def)) {
    def += '.';
  }

  return def;
}

/**
 * Extrae conceptos glosario del StudyKit combinando:
 * 1. Flashcards existentes (tipo concepto, excluyendo preguntas o frases genéricas).
 * 2. Pares "Término: Definición" encontrados en la Guía de Estudio con filtros estrictos.
 */
export function extractGlossaryConcepts(kit: StudyKit, markdownText?: string): GlossaryConcept[] {
  const map = new Map<string, GlossaryConcept>();

  // 1. Extraer de Flashcards del Kit
  if (kit.flashcards && Array.isArray(kit.flashcards)) {
    for (const card of kit.flashcards) {
      if (!card || !card.term || !card.definition) continue;
      const rawTerm = card.term.trim();
      const rawDef = card.definition.trim();

      // Descartar si es una pregunta
      if (card.type === 'question' || /^\s*[¿?]/.test(rawTerm) || /\?\s*$/.test(rawTerm)) continue;

      // Limpiar marcas markdown residuales en el término
      const cleanTerm = rawTerm.replace(/^[#*_\s]+|[#*_\s:]+$/g, '').trim();
      if (!isValidConceptTerm(cleanTerm)) continue;
      if (rawDef.length < 10) continue;

      const lower = cleanTerm.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, {
          term: cleanTerm,
          definition: cleanDefinitionSentence(rawDef),
          source: 'flashcard',
        });
      }
    }
  }

  // 2. Extraer de la Guía de Estudio (patrones viñeta "**Término:** Definición")
  const text = markdownText || kit.studyGuideMarkdown || '';
  if (text) {
    // Patrón 1: Viñetas con concepto en negrita seguido de dos puntos y descripción completa de la línea
    // Ej: "• **Sincitiotrofoblasto:** Principal componente del trofoblasto..."
    const bulletRegex = /(?:^|\n)\s*[-*•]\s+\*\*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s/(),.-]{3,50})\*\*:\s+([^\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = bulletRegex.exec(text)) !== null) {
      const rawTerm = match[1].trim();
      const rawDef = match[2].trim();
      const cleanTerm = rawTerm.replace(/^[#*_\s]+|[#*_\s:]+$/g, '').trim();

      if (isValidConceptTerm(cleanTerm) && rawDef.length >= 15) {
        const lower = cleanTerm.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, {
            term: cleanTerm,
            definition: cleanDefinitionSentence(rawDef),
            source: 'guide',
          });
        }
      }
    }

    // Patrón 2: Definiciones explícitas en párrafos (ej: "**Ley de Laplace:** La tensión en la pared...")
    const directRegex = /(?:^|\n)\s*\*\*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s/(),.-]{3,45}):\*\*\s+([A-ZÁÉÍÓÚ][^\n]+)/g;
    while ((match = directRegex.exec(text)) !== null) {
      const rawTerm = match[1].trim();
      const rawDef = match[2].trim();
      const cleanTerm = rawTerm.replace(/^[#*_\s]+|[#*_\s:]+$/g, '').trim();

      if (isValidConceptTerm(cleanTerm) && rawDef.length >= 20) {
        const lower = cleanTerm.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, {
            term: cleanTerm,
            definition: cleanDefinitionSentence(rawDef),
            source: 'guide',
          });
        }
      }
    }
  }

  // Ordenar por longitud de término descendente para que "Sincitiotrofoblasto" se evalúe antes que "Trofoblasto"
  return Array.from(map.values()).sort((a, b) => b.term.length - a.term.length);
}

/**
 * Crea una expresión regular segura para encontrar los conceptos en texto usando fronteras Unicode.
 */
export function buildGlossaryMatcherRegex(concepts: GlossaryConcept[]): RegExp | null {
  if (!concepts || concepts.length === 0) return null;

  // Filtrar y escapar términos válidos
  const escapedTerms = concepts
    .map(c => escapeRegex(c.term))
    .filter(Boolean);

  if (escapedTerms.length === 0) return null;

  // Fronteras de palabra Unicode para no cortar palabras acentuadas en español (ej: "célula", "óvulo")
  const pattern = `(?<![\\p{L}\\p{N}])(${escapedTerms.join('|')})(?![\\p{L}\\p{N}])`;
  return new RegExp(pattern, 'giu');
}
