/**
 * Sanitizador de conceptos y definiciones de Flashcards
 * Garantiza que las definiciones sean SOLO EL CONCEPTO PURO, sin viñetas (•, -, *),
 * sin listas enumeradas ni fragmentos truncados, y traduce símbolos y fórmulas LaTeX
 * a caracteres Unicode legibles y limpios para evitar errores de transcripción visual.
 */

export function cleanLatexSymbols(str: string): string {
  if (!str) return '';
  let res = str;

  // 1. Quitar comandos de texto LaTeX envolventes (soporta barras simples o dobles)
  res = res.replace(/\\+(text|mathrm|mathbf|mathit)\{([^}]+)\}/g, '$2');

  // 2. Iones y fórmulas químicas/fisiológicas frecuentes
  res = res.replace(/\\*text\{K\}\^\{?\+?\}?/gi, 'K⁺')
           .replace(/\bK\^\{?\+?\}?/g, 'K⁺')
           .replace(/\\*text\{Na\}\^\{?\+?\}?/gi, 'Na⁺')
           .replace(/\bNa\^\{?\+?\}?/g, 'Na⁺')
           .replace(/\\*text\{Ca\}\^\{?2\+\}?/gi, 'Ca²⁺')
           .replace(/\bCa\^\{?2\+\}?/g, 'Ca²⁺')
           .replace(/\\*text\{Mg\}\^\{?2\+\}?/gi, 'Mg²⁺')
           .replace(/\bMg\^\{?2\+\}?/g, 'Mg²⁺')
           .replace(/\\*text\{Cl\}\^\{?\-?\}?/gi, 'Cl⁻')
           .replace(/\bCl\^\{?\-?\}?/g, 'Cl⁻')
           .replace(/\\*text\{H\}\^\{?\+?\}?/gi, 'H⁺')
           .replace(/\bH\^\{?\+?\}?/g, 'H⁺')
           .replace(/\\*text\{HCO\}_3\^\{?\-?\}?/gi, 'HCO₃⁻')
           .replace(/\bHCO_3\^\{?\-?\}?/g, 'HCO₃⁻')
           .replace(/\bO_2\b/g, 'O₂')
           .replace(/\bCO_2\b/g, 'CO₂');

  // 3. Letras griegas frecuentes (soporta barras simples o múltiples \\)
  res = res.replace(/\\+alpha\b/gi, 'α')
           .replace(/\\+beta\b/gi, 'β')
           .replace(/\\+gamma\b/g, 'γ')
           .replace(/\\+Gamma\b/g, 'Γ')
           .replace(/\\+delta\b/g, 'δ')
           .replace(/\\+Delta\b/g, 'Δ')
           .replace(/\\+epsilon\b/gi, 'ε')
           .replace(/\\+zeta\b/gi, 'ζ')
           .replace(/\\+eta\b/gi, 'η')
           .replace(/\\+theta\b/gi, 'θ')
           .replace(/\\+lambda\b/g, 'λ')
           .replace(/\\+Lambda\b/g, 'Λ')
           .replace(/\\+mu\b/g, 'µ')
           .replace(/\\+pi\b/g, 'π')
           .replace(/\\+sigma\b/g, 'σ')
           .replace(/\\+Sigma\b/g, 'Σ')
           .replace(/\\+omega\b/g, 'ω')
           .replace(/\\+Omega\b/g, 'Ω');

  // 4. Símbolos matemáticos y flechas
  res = res.replace(/\\+uparrow\b/g, '↑')
           .replace(/\\+downarrow\b/g, '↓')
           .replace(/\\+rightarrow\b/g, '→')
           .replace(/\\+to\b/g, '→')
           .replace(/\\+leftarrow\b/g, '←')
           .replace(/\\+leftrightarrow\b/g, '↔')
           .replace(/\\+le(q)?\b/g, '≤')
           .replace(/\\+ge(q)?\b/g, '≥')
           .replace(/\\+pm\b/g, '±')
           .replace(/\\+neq\b/g, '≠')
           .replace(/\\+approx\b/g, '≈')
           .replace(/\\+times\b/g, '×')
           .replace(/\\+cdot\b/g, '·');

  // 5. Superíndices y subíndices numéricos simples
  res = res.replace(/\^\{\+?\}/g, '⁺')
           .replace(/\^\{\-?\}/g, '⁻')
           .replace(/\^2\b/g, '²')
           .replace(/\^3\b/g, '³')
           .replace(/_1\b/g, '₁')
           .replace(/_2\b/g, '₂')
           .replace(/_3\b/g, '₃')
           .replace(/_4\b/g, '₄');

  // 6. Eliminar delimitadores $ de fórmulas LaTeX para que no aparezcan como $β$ o $K⁺$
  res = res.replace(/\$+/g, '');

  // 7. Limpiar barras invertidas residuales antes de letras si quedaron
  res = res.replace(/\\+([a-zA-Z]+)/g, '$1');

  return res.trim();
}

export function cleanConceptTerm(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();
  clean = cleanLatexSymbols(clean);
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

  // 1. Convertir LaTeX a símbolos limpios
  clean = cleanLatexSymbols(clean);

  // 2. Quitar viñetas iniciales (•, ●, ▪, -, *, etc.)
  clean = clean.replace(/^[•●▪▫◦\s*-]+/, '').trim();

  // 3. Si contiene viñetas en medio (ej. "Concepto nuclear. • Segunda viñeta..."),
  // cortar en la primera viñeta para quedarnos ESTRICTAMENTE con el concepto nuclear.
  if (/[•●▪▫◦]/.test(clean)) {
    const parts = clean.split(/[•●▪▫◦]/);
    if (parts[0] && parts[0].trim().length >= 15) {
      clean = parts[0].trim();
    } else {
      clean = clean.replace(/[•●▪▫◦]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // 4. Eliminar viñetas de nueva línea tipo markdown (\n- o \n*)
  if (/\n\s*[-*•]/.test(clean)) {
    const lines = clean.split(/\n\s*[-*•]/);
    if (lines[0] && lines[0].trim().length >= 15) {
      clean = lines[0].trim();
    } else {
      clean = clean.replace(/\n\s*[-*•]\s+/g, '. ').replace(/\s+/g, ' ').trim();
    }
  }

  // 5. Limpiar espacios redundantes y saltos de línea múltiples
  clean = clean.replace(/\s+/g, ' ').trim();

  // 6. Quitar puntos suspensivos cortados residuales al final (ej: "beta. • L...")
  clean = clean.replace(/(\s*[.]{2,}|…)+$/, '').trim();

  // 7. Si termina en una preposición/conjunción cortada (ej: "secreción de"), quitar la palabra cortada
  clean = clean.replace(/\b(de|y|o|en|a|con|por|para|del|que|al)\s*$/i, '').trim();

  // 8. Asegurar punto final limpio si termina en carácter alfanumérico
  if (clean && !/[.!?]$/.test(clean)) {
    clean += '.';
  }

  return clean;
}
