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
 * Palabras comunes o términos estructurales que NO deben marcarse como conceptos glosario.
 */
const EXCLUDED_TERMS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'para', 'con', 'por', 'sobre', 'entre', 'hacia',
  'resumen', 'introduccion', 'introducción', 'conclusion', 'conclusión',
  'caso clinico', 'caso clínico', 'farmacocinetica', 'farmacocinética',
  'mecanismo de accion', 'mecanismo de acción', 'efectos adversos',
  'contraindicaciones', 'tratamiento', 'diagnostico', 'diagnóstico',
  'clasificacion', 'clasificación', 'definicion', 'definición',
  'nota', 'importante', 'atencion', 'atención', 'ejemplo', 'tabla',
  'nivel 1', 'nivel 2', 'nivel 3', 'fisiopatologia', 'fisiopatología',
]);

/**
 * Extrae conceptos glosario del StudyKit combinando:
 * 1. Flashcards existentes (tipo concepto, excluyendo preguntas o frases demasiado largas).
 * 2. Pares "Término: Definición" encontrados en la Guía de Estudio (viñetas con negrita y dos puntos).
 */
export function extractGlossaryConcepts(kit: StudyKit, markdownText?: string): GlossaryConcept[] {
  const map = new Map<string, GlossaryConcept>();

  // 1. Extraer de Flashcards del Kit
  if (kit.flashcards && Array.isArray(kit.flashcards)) {
    for (const card of kit.flashcards) {
      if (!card || !card.term || !card.definition) continue;
      const rawTerm = card.term.trim();
      const rawDef = card.definition.trim();

      // Descartar si es una pregunta o excede longitud razonable de concepto
      if (card.type === 'question' || /^\s*[¿?]/.test(rawTerm) || /\?\s*$/.test(rawTerm)) continue;
      if (rawTerm.length < 3 || rawTerm.length > 55) continue;
      if (rawDef.length < 8) continue;

      // Limpiar marcas markdown residuales en el término
      const cleanTerm = rawTerm.replace(/^\*+|\*+$|^_+|_+$/g, '').trim();
      const lower = cleanTerm.toLowerCase();

      if (EXCLUDED_TERMS.has(lower) || lower.split(/\s+/).length > 6) continue;

      if (!map.has(lower)) {
        map.set(lower, {
          term: cleanTerm,
          definition: rawDef,
          source: 'flashcard',
        });
      }
    }
  }

  // 2. Extraer de la Guía de Estudio (patrones: "**Término:** Definición" o "- **Término:** Definición")
  const text = markdownText || kit.studyGuideMarkdown || '';
  if (text) {
    // Patrón 1: Viñetas con concepto en negrita seguido de dos puntos y descripción
    // Ej: "• **Sincitiotrofoblasto:** Principal componente del trofoblasto..."
    const bulletRegex = /(?:^|\n)\s*[-*•]\s+\*\*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s/(),.-]{3,50})\*\*:\s+([^\n]{12,350})/g;
    let match: RegExpExecArray | null;
    while ((match = bulletRegex.exec(text)) !== null) {
      const rawTerm = match[1].trim();
      const rawDef = match[2].trim();
      const cleanTerm = rawTerm.replace(/^[#*_\s]+|[#*_\s:]+$/g, '').trim();
      const lower = cleanTerm.toLowerCase();

      if (cleanTerm.length >= 3 && cleanTerm.length <= 50 && rawDef.length >= 10) {
        if (!EXCLUDED_TERMS.has(lower) && lower.split(/\s+/).length <= 6 && !map.has(lower)) {
          map.set(lower, {
            term: cleanTerm,
            definition: rawDef,
            source: 'guide',
          });
        }
      }
    }

    // Patrón 2: Definiciones directas en párrafos "**Término:** Explicación"
    const directRegex = /\*\*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s/(),.-]{3,45}):\*\*\s+([A-ZÁÉÍÓÚ][^\n]{15,350})/g;
    while ((match = directRegex.exec(text)) !== null) {
      const rawTerm = match[1].trim();
      const rawDef = match[2].trim();
      const cleanTerm = rawTerm.replace(/^[#*_\s]+|[#*_\s:]+$/g, '').trim();
      const lower = cleanTerm.toLowerCase();

      if (cleanTerm.length >= 3 && cleanTerm.length <= 45 && rawDef.length >= 15) {
        if (!EXCLUDED_TERMS.has(lower) && lower.split(/\s+/).length <= 5 && !map.has(lower)) {
          map.set(lower, {
            term: cleanTerm,
            definition: rawDef,
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
