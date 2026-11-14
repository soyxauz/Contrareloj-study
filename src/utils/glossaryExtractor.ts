import type { StudyKit } from '../types';

export interface GlossaryConcept {
  term: string;
  definition: string;
  source: 'flashcard' | 'guide';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Metadatos, etiquetas de sección o palabras genéricas que NUNCA deben ser conceptos clave.
 */
const EXCLUDED_TERMS = new Set([
  // Artículos y conectores
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'para', 'con', 'por', 'sobre', 'entre', 'hacia', 'sin', 'tras', 'durante', 'hasta',

  // Etiquetas estructurales de guías Thea
  'concepto critico', 'concepto crítico', 'perla clave', 'perlas clave',
  'pregunta trampa', 'preguntas trampa', 'respuesta correcta', 'respuesta incorrecta',
  'regla nemotecnica', 'regla nemotécnica', 'regla mnemotecnica', 'regla mnemotécnica',
  'error frecuente', 'errores frecuentes', 'claves de examen', 'claves del examen',
  'cuadro comparativo', 'tabla comparativa', 'resumen ejecutivo',
  'resumen', 'introduccion', 'introducción', 'conclusion', 'conclusión',
  'nota', 'notas', 'importante', 'atencion', 'atención', 'ejemplo', 'ejemplos', 'tabla', 'tablas',
  'nivel 1', 'nivel 2', 'nivel 3', 'modulo', 'módulo', 'subtema', 'tema',

  // Términos estructurales médicos y clínicos (que solos no son conceptos específicos)
  'clinica', 'clínica', 'cuadro clinico', 'cuadro clínico', 'manifestaciones clinicas', 'manifestaciones clínicas',
  'fisiopatologia', 'fisiopatología', 'etiologia', 'etiología', 'epidemiologia', 'epidemiología',
  'diagnostico', 'diagnóstico', 'tratamiento', 'tratamientos', 'patogenia',
  'farmacocinetica', 'farmacocinética', 'farmacodinamia', 'farmacodinamica', 'farmacodinámica',
  'mecanismo', 'mecanismos', 'mecanismo de accion', 'mecanismo de acción',
  'efectos adversos', 'efectos secundarios', 'efectos colaterales', 'reacciones adversas',
  'contraindicaciones', 'contraindicacion', 'contraindicación',
  'clasificacion', 'clasificación', 'definicion', 'definición',
  'inicio', 'inicio de accion', 'inicio de acción',
  'pico', 'pico de accion', 'pico de acción', 'duracion', 'duración', 'vida media',
  'uso', 'usos', 'uso clinico', 'uso clínico', 'indicaciones', 'indicacion', 'indicación',
  'administracion', 'administración', 'dosis', 'dosificacion', 'dosificación', 'posologia', 'posología',
  'eliminacion', 'eliminación', 'absorcion', 'absorción', 'metabolismo', 'distribucion', 'distribución',
  'hepatico', 'hepático', 'renal', 'periferico', 'periférico', 'intestinal',
  'sintoma', 'síntoma', 'sintomas', 'síntomas', 'signo', 'signos',
  'complicaciones', 'toxicidad', 'interacciones', 'precauciones',
  'paciente', 'pacientes', 'adulto', 'adultos', 'pediatrico', 'pediátrico',
  'hombre', 'mujer', 'embarazo', 'lactancia',
  'resultado', 'resultados', 'hallazgo', 'hallazgos', 'laboratorio',
  'estudio', 'estudios', 'metodo', 'método', 'tecnica', 'técnica',
  'objetivo', 'objetivos', 'aspectos clave', 'puntos clave',
  'pregunta', 'preguntas', 'respuesta', 'respuestas',
  'caso', 'casos', 'caso clinico', 'caso clínico', 'casos clinicos', 'casos clínicos',
]);

/**
 * Valida si un término califica como concepto real para resaltar en Thea.
 */
function isValidConceptTerm(term: string): boolean {
  const clean = term.trim().replace(/^[:\s\-\–—*•#]+|[:\s\-\–—*•#]+$/g, '');
  const lower = clean.toLowerCase();

  if (clean.length < 3 || clean.length > 50) return false;
  if (EXCLUDED_TERMS.has(lower)) return false;

  // No debe terminar en conectores colgantes ni dos puntos
  if (/(?:\s+(?:de|del|en|y|o|con|sin|por|para|a)|[:;.,-])$/i.test(clean)) return false;

  // No debe ser una etiqueta de paso o numeración
  if (/^(?:paso|punto|seccion|sección|capitulo|capítulo|figura|imagen)\s+/i.test(clean)) return false;

  // Si es una sola palabra:
  const words = clean.split(/\s+/);
  if (words.length === 1) {
    // Si tiene menos de 4 letras, solo permitir acrónimos en mayúsculas (ej: 1RM, NPH, IDO, HLA, ATP)
    if (clean.length < 4 && !/^[A-Z0-9-]{2,5}$/.test(clean)) {
      return false;
    }
    // Palabras genéricas en español de una sola palabra que no constituyen concepto
    if (/^(?:caso|dosis|forma|medio|mayor|menor|total|parte|nivel|grado|grupo|clase|efecto|tiempo|salud|enfermedad|vida|fuerza|resistencia|carga|flato|ruido|ruidos)$/i.test(clean)) {
      return false;
    }
  }

  return true;
}

/**
 * Limpia y recorta de forma inteligente una definición a 1 o 2 oraciones completas,
 * garantizando que NUNCA termine abruptamente en medio de una palabra o frase (ej: "...lo que c").
 */
function cleanDefinitionSentence(rawDef: string): string {
  let def = rawDef.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  def = def.replace(/^[:\s\-\–—•]+/, '').trim();

  // 1. Si contiene fórmulas KaTeX ($...$ o $$...$$), preservar la integridad de los delimitadores
  // Buscar cortes naturales en puntos de oración (. seguido de espacio y mayúscula o fin)
  const sentences = def.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (sentences && sentences.length > 0) {
    let result = '';
    for (let i = 0; i < Math.min(2, sentences.length); i++) {
      const cand = result + sentences[i];
      // Si la primera oración es suficientemente rica (>= 30 caracteres), con 1 o 2 oraciones es perfecto
      if (cand.length <= 320) {
        result = cand;
      } else {
        if (!result) result = sentences[0];
        break;
      }
    }
    if (result.trim()) {
      return result.trim();
    }
  }

  // 2. Si no tenía puntuación estándar de cierre, buscar último espacio antes de 240 caracteres
  if (def.length > 250) {
    const truncated = def.substring(0, 240);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 120) {
      def = truncated.substring(0, lastSpace).trim() + '.';
    } else {
      def = truncated.trim() + '.';
    }
  }

  if (!/[.!?]$/.test(def)) {
    def += '.';
  }

  return def;
}

/**
 * Extrae conceptos de estudio de alta relevancia pedagógica basándose en la arquitectura de Thea (Astra AI):
 * 1. Flashcards oficiales del kit (prioridad máxima).
 * 2. Viñetas explícitas de definición en la guía (`* **Término:** Explicación` o `- **Término**: Explicación`).
 * 3. Encabezados de definición (`#### Definición de [Concepto]`).
 *
 * Excluye estrictamente encabezados clínicos (Clínica, Tratamiento, Fisiopatología) y no rompe títulos H1-H4.
 */
export function extractGlossaryConcepts(kit: StudyKit, markdownText?: string): GlossaryConcept[] {
  const map = new Map<string, GlossaryConcept>();

  // 1. Extraer de Flashcards del Kit (Prioridad 1 en Thea)
  if (kit.flashcards && Array.isArray(kit.flashcards)) {
    for (const card of kit.flashcards) {
      if (!card || !card.term || !card.definition) continue;

      const rawTerm = card.term.trim();
      const rawDef = card.definition.trim();

      // Descartar si es una pregunta
      if (card.type === 'question' || /^\s*[¿?]/.test(rawTerm) || /\?\s*$/.test(rawTerm)) continue;

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

  // 2. Extraer de la Guía de Estudio en Markdown
  const text = markdownText || kit.studyGuideMarkdown || '';
  if (text) {
    // Patrón A: Viñetas o citas con negrita (dos puntos adentro o afuera de los asteriscos)
    // Ejemplos Thea:
    // "* **Zona de Fuerza:** 1 a 5 repeticiones..."
    // "- **Tensión Mecánica**: Predomina con cargas altas..."
    // "> **Principio de Henneman:** Las unidades motoras..."
    const bulletOrQuoteRegex = /(?:^|\n)\s*[-*•>]+\s+\*\*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s/(),.-]{3,45}?)(?::\*\*|\*\*[:\s—–-])\s*([^\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = bulletOrQuoteRegex.exec(text)) !== null) {
      const cleanTerm = match[1].trim().replace(/^[:\s\-]+|[:\s\-]+$/g, '');
      const rawDef = match[2].trim();

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

    // Patrón B: Subtítulos de Definición ("#### Definición del Continuo de Repeticiones\nEs el modelo...")
    const defHeaderRegex = /(?:^|\n)#{2,4}\s+Definici[oó]n\s+(?:de\s+la|del|de\s+los|de\s+las|de)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s]{3,45})\s*\n+([A-ZÁÉÍÓÚ][^\n]{15,})/gi;
    while ((match = defHeaderRegex.exec(text)) !== null) {
      const cleanTerm = match[1].trim().replace(/^[:\s\-]+|[:\s\-]+$/g, '');
      const rawDef = match[2].trim();

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
  }

  // Ordenar por longitud de término descendente para que "Continuo de Repeticiones" se evalúe antes que "Repeticiones"
  return Array.from(map.values()).sort((a, b) => b.term.length - a.term.length);
}

/**
 * Genera una RegExp para encontrar ocurrencias completas de los conceptos en texto plano.
 * Usa fronteras de palabra que soportan caracteres acentuados en español.
 */
export function buildGlossaryMatcherRegex(glossary: GlossaryConcept[]): RegExp | null {
  if (!glossary || glossary.length === 0) return null;

  // Filtrar y ordenar por longitud de término descendente
  const terms = glossary
    .map(g => g.term.trim())
    .filter(t => t.length >= 3)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return null;

  const escaped = terms.map(escapeRegex).join('|');

  // Fronteras seguras Unicode para español
  return new RegExp(`(?<=^|[^A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ])(${escaped})(?=$|[^A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ])`, 'gi');
}
