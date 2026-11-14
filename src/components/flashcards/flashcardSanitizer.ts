/**
 * Sanitizador de conceptos y definiciones de Flashcards
 * Garantiza que las definiciones sean SOLO EL CONCEPTO PURO, sin viñetas (•, -, *),
 * sin listas enumeradas ni fragmentos truncados.
 */

export function cleanConceptTerm(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();
  // Quitar viñetas iniciales
  clean = clean.replace(/^[•●▪▫◦\s*-]+/, '').trim();
  // Quitar dos puntos o puntos finales
  clean = clean.replace(/[:.]+$/, '').trim();
  // Quitar signos de pregunta o exclamación si quedaron de enunciados
  clean = clean.replace(/^[¿¡]/, '').replace(/[?!]$/, '').trim();
  return clean;
}

export function cleanConceptDefinition(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();

  // 1. Quitar viñetas iniciales (•, ●, ▪, -, *, etc.)
  clean = clean.replace(/^[•●▪▫◦\s*-]+/, '').trim();

  // 2. Si contiene viñetas en medio (ej. "Concepto nuclear. • Segunda viñeta..."),
  // cortar en la primera viñeta para quedarnos ESTRICTAMENTE con el concepto nuclear.
  if (/[•●▪▫◦]/.test(clean)) {
    const parts = clean.split(/[•●▪▫◦]/);
    if (parts[0] && parts[0].trim().length >= 15) {
      clean = parts[0].trim();
    } else {
      // Si la primera parte era muy corta, limpiar todos los símbolos de viñetas
      clean = clean.replace(/[•●▪▫◦]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // 3. Eliminar viñetas de nueva línea tipo markdown (\n- o \n*)
  if (/\n\s*[-*•]/.test(clean)) {
    const lines = clean.split(/\n\s*[-*•]/);
    if (lines[0] && lines[0].trim().length >= 15) {
      clean = lines[0].trim();
    } else {
      clean = clean.replace(/\n\s*[-*•]\s+/g, '. ').replace(/\s+/g, ' ').trim();
    }
  }

  // 4. Limpiar espacios redundantes y saltos de línea múltiples
  clean = clean.replace(/\s+/g, ' ').trim();

  // 5. Quitar puntos suspensivos cortados residuales al final (ej: "beta. • L...")
  clean = clean.replace(/(\s*[.]{2,}|…)+$/, '').trim();

  // 6. Asegurar punto final limpio si termina en carácter alfanumérico
  if (clean && !/[.!?]$/.test(clean)) {
    clean += '.';
  }

  return clean;
}
