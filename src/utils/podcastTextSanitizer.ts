/**
 * Utilidad compartida de limpieza y normalización de texto para guiones y síntesis de voz de Podcast.
 * Evita que los motores TTS (Azure Edge Neural / Web Speech API) pronuncien nombres de símbolos en inglés
 * como "right arrow" / "it arrow", entidades HTML, comandos LaTeX o marcas Markdown.
 */

const RIGHT_ARROW_PATTERN = /(?:&[rR]arr;|&rightarrow;|&Rightarrow;|\\(?:longrightarrow|Longrightarrow|rightarrow|Rightarrow|implies|mapsto)\b|\\to\b|(?:--|==|-|=)>|[→➔➜➝➞➡⟶⟹⇒↦⇢⇨⇝↣])/g;
const LEFT_ARROW_PATTERN = /(?:&[lL]arr;|&leftarrow;|&Leftarrow;|\\(?:longleftarrow|Longleftarrow|leftarrow|Leftarrow)\b|<(?:--|-)|[←⇐⟵⟸⇠])/g;
const BIDI_ARROW_PATTERN = /(?:&[hH]arr;|&leftrightarrow;|&Leftrightarrow;|\\(?:longleftrightarrow|Longleftrightarrow|leftrightarrow|Leftrightarrow)\b|<->|<-->|<=>|[↔⇔⟷⟺⇄⇆])/g;
const ENGLISH_ARROW_NAME_PATTERN = /\b(?:rightwards?|leftwards?|upwards?|downwards?|bidirectional|left-right|right|left|up|down)\s+arrow(?!\s+function)\b/gi;
const ANY_UNICODE_ARROW_PATTERN = /[\u2190-\u21FF\u2794-\u27BF\u2B00-\u2B7F]/g;

/** Reglas reutilizables para que los prompts de IA redacten guiones de audio libres de flechas y símbolos. */
export const PODCAST_SPOKEN_SCRIPT_RULES = `REGLAS ESTRICTAS DE LOCUCIÓN (GUION HABLADO 100% NATURAL):
- PROHIBIDO usar flechas de cualquier tipo ("→", "<-", "->", "=>", "↔", "↑", "↓", "\\rightarrow", etc.), emojis, viñetas ni formato Markdown ("**", "__", "#", backticks).
- Expresa siempre relaciones causales, direcciones y variaciones con conectores naturales en español hablado (ej. "lo que lleva a", "produce", "hacia", "aumenta", "disminuye", "mayor o igual que") en lugar de abreviaturas simbólicas.`;

/**
 * Convierte flechas, símbolos matemáticos, entidades y marcas de formato en texto limpio y natural
 * listo tanto para mostrarse en la transcripción como para leerse en voz alta en español sin artefactos.
 */
export function sanitizePodcastText(rawText: string): string {
  if (!rawText) return '';

  let clean = String(rawText)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' y ')
    // Desenvolver helpers LaTeX comunes sin perder su contenido
    .replace(/\\(?:text|textbf|textit|mathrm|mathbf)\{([^}]*)\}/g, '$1')
    // Eliminar delimitadores LaTeX y formato Markdown
    .replace(/\\(?:\(|\)|\[|\])/g, '')
    .replace(/[*_#`~[\]$]/g, '')
    // Viñetas, checkmarks y emojis decorativos
    .replace(/[•●◦▪▫▸▹►❖✓✔✕✗✖★☆◆◇■□🔹🔸📌💡✅❌⚠️🎯📖🎧🔊]/g, ' ');

  // Flechas bidireccionales entre términos ("A ↔ B" -> "A y B")
  clean = clean.replace(BIDI_ARROW_PATTERN, ' y ');

  // Flechas de subida/bajada antes de limpiar el resto de flechas Unicode:
  // Si precede un sustantivo real (no conjunciones ni preposiciones como "y", "o", "en", "con"), usar "aumento de / disminución de".
  clean = clean
    .replace(
      /\s*(?:↑|⇑|\\uparrow\b|&uarr;)\s*(?=(?!(?:y|e|o|u|ni|que|pero|con|sin|por|para|en|a|de|al|del)\b)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{2,})/gi,
      ' aumento de '
    )
    .replace(/\s*(?:↑|⇑|\\uparrow\b|&uarr;)/g, ' en aumento')
    .replace(
      /\s*(?:↓|⇓|\\downarrow\b|&darr;)\s*(?=(?!(?:y|e|o|u|ni|que|pero|con|sin|por|para|en|a|de|al|del)\b)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{2,})/gi,
      ' disminución de '
    )
    .replace(/\s*(?:↓|⇓|\\downarrow\b|&darr;)/g, ' en descenso');

  // Flechas derechas e izquierdas contextuales:
  // Si ya hay verbo causal o preposición justo antes (ej. "lleva a → necrosis"), no duplicar conector ni coma.
  clean = clean.replace(
    new RegExp(
      `(^|[({\\[:;"'«¿¡]|\\b(?:a|al|hacia|en|para|por|con|de|del|sin|y|o|e|u|hasta|como|produc(?:e|en|ir|iendo)|caus(?:a|an|ar|ando)|gener(?:a|an|ar|ando)|provoc(?:a|an|ar|ando)|induc(?:e|en|ir|iendo)|estimul(?:a|an)|activ(?:a|an)|inhib(?:e|en)|conduc(?:e|en|iendo)\\s+a|llev(?:a|an|ando)\\s+a|result(?:a|an)\\s+en|da(?:n)?\\s+lugar\\s+a|origin(?:a|an)|desencaden(?:a|an)|implic(?:a|an)|signific(?:a|an)))\\s*(?:${RIGHT_ARROW_PATTERN.source}|${LEFT_ARROW_PATTERN.source})\\s*`,
      'gi'
    ),
    (_, prefix) => (prefix ? `${prefix} ` : '')
  );

  // Flechas remanentes entre conceptos ("obstrucción → isquemia" -> "obstrucción, isquemia")
  clean = clean
    .replace(new RegExp(`\\s*(?:${RIGHT_ARROW_PATTERN.source}|${LEFT_ARROW_PATTERN.source})\\s*`, 'g'), ', ')
    // Si el texto traía nombres literales heredados en inglés ("right arrow" / "left arrow")
    .replace(ENGLISH_ARROW_NAME_PATTERN, ', ')
    // Barrido final garantizado sobre cualquier glifo Unicode de flecha restante
    .replace(ANY_UNICODE_ARROW_PATTERN, ', ')
    // Operadores comunes que los motores TTS españoles pueden leer en inglés
    .replace(/≥|>=/g, ' mayor o igual que ')
    .replace(/≤|<=/g, ' menor o igual que ')
    .replace(/≠/g, ' diferente de ')
    .replace(/≈/g, ' aproximadamente ')
    .replace(/±/g, ' más o menos ')
    // Normalizar puntuación y espacios tras sustituciones
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/([,;:])\s*,+/g, '$1')
    .replace(/([.!?¿¡])\s*,+/g, '$1 ')
    .replace(/\s*,\s+(?=(?:y|e|o|u|hacia)\b)/gi, ' ')
    .replace(/^\s*[,;:\-–—]+\s*/, '')
    .replace(/\s*[,;]+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return clean;
}
