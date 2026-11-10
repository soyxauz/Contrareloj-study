import React from 'react';
import katex from 'katex';
import { useTheme } from '../services/themeService';

interface FormattedTextProps {
  text: string;
  className?: string;
  inlineOnly?: boolean;
}

/**
 * Renderiza de forma segura una expresión matemática o lógica con KaTeX.
 */
const renderKatexSafe = (math: string, displayMode: boolean = false): string => {
  try {
    return katex.renderToString(math.trim(), {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
    });
  } catch (err) {
    console.warn('[KaTeX Render Warning]', err);
    return math;
  }
};

/**
 * Reemplaza comandos LaTeX sueltos frecuentes si aparecen fuera de delimitadores matemáticos.
 */
const replaceLooseSymbols = (str: string): string => {
  return str
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\\implies\b/g, '⇒')
    .replace(/\\iff\b/g, '⇔')
    .replace(/\\le\b/g, '≤')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\pm\b/g, '±')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\in\b/g, '∈');
};

const cleanPlainGapText = (str: string): string =>
  replaceLooseSymbols(
    str.replace(/(^|\s)\*\*(?=[^\s*])|(?<=[^\s*])\*\*(?=\s|[.,;:!?)]|$)/g, '$1')
  );

const isPlainProseLine = (trimmed: string): boolean =>
  trimmed.length > 0 &&
  !trimmed.includes('|') &&
  !/^(#{1,6}\s|>|```|\$\$|\\\[|[-*•+]\s|\d+\.\s|[-*_]{3,}$)/.test(trimmed);

function balanceMultilineEmphasis(str: string): string {
  const lines = str.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!isPlainProseLine(trimmed)) continue;
    const countI = (trimmed.match(/\*\*/g) || []).length;
    if (countI % 2 === 0) continue;

    // Buscar únicamente la siguiente línea de prosa (permitiendo a lo sumo 1 línea en blanco entre párrafo partido)
    for (let k = i + 1, blanks = 0; k < lines.length; k++) {
      const candTrim = lines[k].trim();
      if (!candTrim) {
        blanks++;
        if (blanks > 1) break;
        continue;
      }
      if (!isPlainProseLine(candTrim)) break;
      const countK = (candTrim.match(/\*\*/g) || []).length;
      if (countK % 2 === 1) {
        lines[i] = `${lines[i].trimEnd()}**`;
        lines[k] = `**${lines[k].trimStart()}`;
        i = k;
        break;
      }
      break;
    }
  }
  return lines.join('\n');
}

/**
 * Parsea y renderiza texto con formato enriquecido eliminando la sintaxis cruda de Markdown (** y #)
 * y renderizando expresiones LaTeX/KaTeX completas (fórmulas, flujos lógicos con flechas y definiciones).
 */
export const FormattedText: React.FC<FormattedTextProps> = ({
  text,
  className = '',
  inlineOnly = false,
}) => {
  const { theme } = useTheme();
  if (!text) return null;

  // Renderizado inline de matemáticas, negrita, cursiva, código y enlaces
  const renderInline = (str: string): React.ReactNode[] => {
    // Regex tokens: $$block$$, \\[block\\], $inline$, \\(inline\\), **negrita**, __negrita__, `código`, *cursiva*, _cursiva_, [link](url)
    const tokenRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`]+`|\*[^*]+?\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\))/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(str)) !== null) {
      // Texto previo sin formato (reemplazando símbolos matemáticos sueltos y limpiando ** huérfanos)
      if (match.index > lastIndex) {
        parts.push(cleanPlainGapText(str.substring(lastIndex, match.index)));
      }

      const token = match[0];

      if (token.startsWith('$$') && token.endsWith('$$')) {
        const math = token.slice(2, -2);
        const html = renderKatexSafe(math, true);
        parts.push(
          <span
            key={`katex-block-${match.index}`}
            className="katex-display-inline my-1 mx-1.5 inline-block text-amber-200"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
        const math = token.slice(2, -2);
        const html = renderKatexSafe(math, true);
        parts.push(
          <span
            key={`katex-block-${match.index}`}
            className="katex-display-inline my-1 mx-1.5 inline-block text-amber-200"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (token.startsWith('$') && token.endsWith('$')) {
        const math = token.slice(1, -1);
        const html = renderKatexSafe(math, false);
        parts.push(
          <span
            key={`katex-inline-${match.index}`}
            className="katex-inline mx-0.5 inline-block text-amber-200 font-sans"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
        const math = token.slice(2, -2);
        const html = renderKatexSafe(math, false);
        parts.push(
          <span
            key={`katex-inline-${match.index}`}
            className="katex-inline mx-0.5 inline-block text-amber-200 font-sans"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        const content = token.slice(2, -2);
        parts.push(
          <strong key={`b-${match.index}`} className={`font-bold tracking-normal ${
            theme === 'kitty' ? 'text-[#be185d]' : theme === 'dark' ? 'text-white' : 'text-zinc-950 font-black'
          }`}>
            {renderInline(content)}
          </strong>
        );
      } else if (token.startsWith('__') && token.endsWith('__')) {
        const content = token.slice(2, -2);
        parts.push(
          <strong key={`b-${match.index}`} className={`font-bold tracking-normal ${
            theme === 'kitty' ? 'text-[#be185d]' : theme === 'dark' ? 'text-white' : 'text-zinc-950 font-black'
          }`}>
            {renderInline(content)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        const content = token.slice(1, -1);
        parts.push(
          <code
            key={`c-${match.index}`}
            className={`px-1.5 py-0.5 rounded-md border font-mono text-[11px] sm:text-xs ${
              theme === 'light'
                ? 'bg-slate-100 border-slate-300 text-indigo-700 font-semibold'
                : theme === 'kitty'
                ? 'bg-pink-100 border-pink-200 text-pink-900 font-semibold'
                : 'bg-thea-surfaceLight border-thea-border/80 text-amber-300'
            }`}
          >
            {content}
          </code>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        const content = token.slice(1, -1);
        parts.push(
          <em key={`i-${match.index}`} className={`italic ${
            theme === 'dark' ? 'text-slate-200' : 'text-zinc-800'
          }`}>
            {renderInline(content)}
          </em>
        );
      } else if (token.startsWith('_') && token.endsWith('_')) {
        const content = token.slice(1, -1);
        parts.push(
          <em key={`i-${match.index}`} className={`italic ${
            theme === 'dark' ? 'text-slate-200' : 'text-zinc-800'
          }`}>
            {renderInline(content)}
          </em>
        );
      } else if (token.startsWith('[') && token.includes('](')) {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          parts.push(
            <a
              key={`a-${match.index}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noreferrer"
              className="text-violet-400 underline underline-offset-2 hover:text-violet-300 transition-colors"
            >
              {linkMatch[1]}
            </a>
          );
        } else {
          parts.push(token);
        }
      } else {
        parts.push(token);
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < str.length) {
      parts.push(cleanPlainGapText(str.substring(lastIndex)));
    }

    return parts.length > 0 ? parts : [cleanPlainGapText(str)];
  };

  if (inlineOnly) {
    return <span className={className}>{renderInline(text)}</span>;
  }

  // Normalizar bloques ```markdown / ```md / ```latex y distribuir énfasis multi-línea (**...\n...**) por línea
  const normalizedInputText = balanceMultilineEmphasis(
    text.replace(/```(?:markdown|md|latex)\s*\n([\s\S]*?)```/gi, '$1')
  );

  // Parseo estructurado por bloques (código, tablas, matemáticas multi-línea, encabezados, citas, listas, párrafos)
  const lines = normalizedInputText.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const tableDelimiterRegex = /^\|?(?:\s*:?[-–—]{2,}:?\s*\|)+\s*(?:\s*:?[-–—]{2,}:?\s*)?\|?$/;

  const splitTableCells = (rowLine: string): string[] => {
    const stripped = rowLine.trim().replace(/^\|/, '').replace(/\|$/, '');
    const cells: string[] = [];
    let current = '';
    let inMath = false;
    for (let idx = 0; idx < stripped.length; idx++) {
      const ch = stripped[idx];
      if (ch === '\\' && idx + 1 < stripped.length && stripped[idx + 1] === '|') {
        current += '|';
        idx++;
        continue;
      }
      if (ch === '$') {
        inMath = !inMath;
      }
      if (ch === '|' && !inMath) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const flushList = (key: string) => {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      blocks.push(
        <ul key={key} className="space-y-1.5 my-3 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className={`flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed ${
              theme === 'dark' ? 'text-slate-300' : 'text-zinc-800'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 shadow-xs ${
                theme === 'light' ? 'bg-indigo-600' : theme === 'kitty' ? 'bg-pink-500' : 'bg-violet-400'
              }`} />
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    } else {
      blocks.push(
        <ol key={key} className="space-y-1.5 my-3 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className={`flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed ${
              theme === 'dark' ? 'text-slate-300' : 'text-zinc-800'
            }`}>
              <span className={`text-xs font-bold font-mono mt-0.5 shrink-0 ${
                theme === 'light' ? 'text-indigo-600' : theme === 'kitty' ? 'text-pink-600' : 'text-amber-400'
              }`}>{idx + 1}.</span>
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Líneas vacías
    if (!trimmed) {
      if (currentList) flushList(`list-${i}`);
      continue;
    }

    // Bloques de código / pseudocódigo cercados (```)
    if (trimmed.startsWith('```')) {
      if (currentList) flushList(`list-${i}`);
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith('```')) {
        codeLines.push(lines[j]);
        j++;
      }
      blocks.push(
        <pre
          key={`code-${i}`}
          className={`my-3 p-3.5 rounded-xl border overflow-x-auto font-mono text-xs leading-relaxed ${
            theme === 'light'
              ? 'bg-slate-100 border-slate-300 text-slate-900'
              : theme === 'kitty'
              ? 'bg-pink-50 border-pink-200 text-pink-950'
              : 'bg-slate-950/90 border-thea-border/70 text-slate-200'
          }`}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i = j;
      continue;
    }

    // Regla horizontal
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(
        <hr
          key={`hr-${i}`}
          className={`my-4 ${
            theme === 'light' ? 'border-slate-200' : theme === 'kitty' ? 'border-pink-200' : 'border-thea-border/80'
          }`}
        />
      );
      continue;
    }

    // Tablas estructuradas en Markdown (con barras laterales o sin barras en los extremos si la siguiente línea es delimitadora)
    const startsWithPipedTable = trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
    const startsUnpipedTable =
      trimmed.includes('|') &&
      !trimmed.startsWith('>') &&
      !trimmed.startsWith('#') &&
      i + 1 < lines.length &&
      tableDelimiterRegex.test(lines[i + 1].trim());

    if (startsWithPipedTable || startsUnpipedTable) {
      if (currentList) flushList(`list-${i}`);

      const tableLines: string[] = [trimmed];
      let j = i + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        if (
          nextTrimmed &&
          nextTrimmed.includes('|') &&
          !nextTrimmed.startsWith('>') &&
          !nextTrimmed.startsWith('#') &&
          !nextTrimmed.startsWith('```')
        ) {
          tableLines.push(nextTrimmed);
          j++;
        } else if (
          !nextTrimmed &&
          j + 1 < lines.length &&
          lines[j + 1].trim().includes('|') &&
          !lines[j + 1].trim().startsWith('>') &&
          !lines[j + 1].trim().startsWith('#') &&
          !(
            tableLines.some(l => tableDelimiterRegex.test(l)) &&
            j + 2 < lines.length &&
            tableDelimiterRegex.test(lines[j + 2].trim())
          )
        ) {
          j++;
        } else {
          break;
        }
      }

      // Buscar la fila delimitadora (ej: | :--- | :--- | :--- | o --- | --- | ---)
      const delimiterIndex = tableLines.findIndex(l => tableDelimiterRegex.test(l));

      if (delimiterIndex !== -1 && tableLines.length >= 2) {
        const headerLines = tableLines.slice(0, delimiterIndex);
        const delimiterLine = tableLines[delimiterIndex];
        const bodyLines = tableLines.slice(delimiterIndex + 1);

        const alignments = splitTableCells(delimiterLine).map(c => {
          const col = c.trim();
          const left = col.startsWith(':');
          const right = col.endsWith(':');
          if (left && right) return 'text-center';
          if (right) return 'text-right';
          return 'text-left';
        });

        const headers = headerLines.length > 0 ? splitTableCells(headerLines[0]) : [];
        const colCount = Math.max(headers.length, alignments.length);
        const rows = bodyLines.map((rowLine) => {
          const parsed = splitTableCells(rowLine);
          while (parsed.length < colCount) parsed.push('');
          return parsed.slice(0, colCount);
        });

        blocks.push(
          <div
            key={`table-block-${i}`}
            className={`my-5 overflow-hidden rounded-2xl border shadow-md transition-colors ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-slate-200/60'
                : theme === 'kitty'
                ? 'bg-white border-pink-200 shadow-pink-100/60'
                : 'bg-slate-950/85 border-thea-border/80 shadow-xl'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                {headers.length > 0 && (
                  <thead className={`border-b transition-colors ${
                    theme === 'light'
                      ? 'bg-slate-100/95 border-slate-200 text-slate-900'
                      : theme === 'kitty'
                      ? 'bg-pink-100/85 border-pink-200 text-pink-950'
                      : 'bg-gradient-to-r from-violet-950/70 via-slate-900/90 to-indigo-950/60 border-thea-border text-violet-300'
                  }`}>
                    <tr>
                      {headers.map((h, colIdx) => (
                        <th
                          key={`th-${i}-${colIdx}`}
                          className={`px-4 py-3.5 font-bold uppercase tracking-wider text-[11px] sm:text-xs border-r last:border-r-0 ${
                            theme === 'light'
                              ? 'border-slate-200 text-slate-800 font-extrabold'
                              : theme === 'kitty'
                              ? 'border-pink-200 text-pink-900 font-extrabold'
                              : 'border-thea-border/30 text-violet-300 font-bold'
                          } ${alignments[colIdx] || 'text-left'}`}
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className={`divide-y transition-colors ${
                  theme === 'light'
                    ? 'divide-slate-200/80'
                    : theme === 'kitty'
                    ? 'divide-pink-100'
                    : 'divide-thea-border/30'
                }`}>
                  {rows.map((row, rIdx) => (
                    <tr
                      key={`tr-${i}-${rIdx}`}
                      className={`transition-colors ${
                        theme === 'light'
                          ? 'odd:bg-slate-50/70 hover:bg-slate-100/80'
                          : theme === 'kitty'
                          ? 'odd:bg-pink-50/40 hover:bg-pink-100/60'
                          : 'odd:bg-slate-900/30 hover:bg-violet-500/10'
                      }`}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={`td-${i}-${rIdx}-${cIdx}`}
                          className={`px-4 py-3 leading-relaxed border-r last:border-r-0 ${
                            theme === 'light'
                              ? 'text-zinc-900 font-medium border-slate-200/70'
                              : theme === 'kitty'
                              ? 'text-zinc-900 font-medium border-pink-100'
                              : 'text-slate-200 border-thea-border/20'
                          } ${alignments[cIdx] || 'text-left'}`}
                        >
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

        i = j - 1;
        continue;
      }
    }

    // Bloque matemático multi-línea ($$\n...\n$$ o \[\n...\n\])
    if (trimmed === '$$' || trimmed === '\\[' || ((trimmed.startsWith('$$') && !trimmed.endsWith('$$')) || (trimmed.startsWith('\\[') && !trimmed.endsWith('\\]')))) {
      if (currentList) flushList(`list-${i}`);
      const closingToken = trimmed.startsWith('$$') ? '$$' : '\\]';
      const firstPart = trimmed.slice(2).trim();
      const mathLines: string[] = firstPart ? [firstPart] : [];
      let j = i + 1;
      while (j < lines.length) {
        const nextT = lines[j].trim();
        if (nextT.endsWith(closingToken)) {
          const tailPart = nextT.slice(0, -2).trim();
          if (tailPart) mathLines.push(tailPart);
          break;
        }
        mathLines.push(lines[j]);
        j++;
      }
      const html = renderKatexSafe(mathLines.join('\n'), true);
      blocks.push(
        <div
          key={`math-multiline-${i}`}
          className={`my-3 p-3.5 sm:p-4 rounded-2xl border overflow-x-auto text-center shadow-xs transition-colors ${
            theme === 'light'
              ? 'bg-slate-50 border-slate-200 text-zinc-900'
              : theme === 'kitty'
              ? 'bg-pink-50/60 border-pink-200 text-zinc-900'
              : 'bg-gradient-to-r from-violet-950/40 via-thea-surface to-indigo-950/30 border-violet-500/30 text-slate-100'
          }`}
        >
          <div
            className={`katex-display-wrapper text-sm sm:text-base inline-block max-w-full ${
              theme === 'light' || theme === 'kitty' ? 'text-zinc-900 font-semibold' : 'text-slate-100'
            }`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      );
      i = j;
      continue;
    }

    // Bloque matemático independiente / Flujo Lógico en línea propia (ej: $$\text{...}$$ o $\text{...}$)
    const isStandaloneMath =
      (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 4) ||
      (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2 && !trimmed.slice(1, -1).includes('$'));

    if (isStandaloneMath) {
      if (currentList) flushList(`list-${i}`);
      const mathContent = trimmed.startsWith('$$')
        ? trimmed.slice(2, -2)
        : trimmed.startsWith('\\[')
        ? trimmed.slice(2, -2)
        : trimmed.slice(1, -1);

      const html = renderKatexSafe(mathContent, true);
      blocks.push(
        <div
          key={`math-block-${i}`}
          className={`my-3 p-3.5 sm:p-4 rounded-2xl border overflow-x-auto text-center shadow-xs transition-colors ${
            theme === 'light'
              ? 'bg-slate-50 border-slate-200 text-zinc-900'
              : theme === 'kitty'
              ? 'bg-pink-50/60 border-pink-200 text-zinc-900'
              : 'bg-gradient-to-r from-violet-950/40 via-thea-surface to-indigo-950/30 border-violet-500/30 text-slate-100'
          }`}
        >
          <div
            className={`katex-display-wrapper text-sm sm:text-base inline-block max-w-full ${
              theme === 'light' || theme === 'kitty' ? 'text-zinc-900 font-semibold' : 'text-slate-100'
            }`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      );
      continue;
    }

    // Encabezados H1 a H4 sin sintaxis #
    if (trimmed.startsWith('# ')) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(
        <h1
          key={`h1-${i}`}
          className={`text-xl sm:text-2xl font-black mt-5 mb-2.5 tracking-tight flex items-center gap-2 ${
            theme === 'light' ? 'text-zinc-950' : theme === 'kitty' ? 'text-pink-600' : 'text-amber-300'
          }`}
        >
          {renderInline(trimmed.replace(/^#\s+/, ''))}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith('## ')) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(
        <h2
          key={`h2-${i}`}
          className={`text-lg sm:text-xl font-extrabold mt-4 mb-2 tracking-tight border-b pb-1 ${
            theme === 'light'
              ? 'text-zinc-950 border-slate-200'
              : theme === 'kitty'
              ? 'text-pink-600 border-pink-200'
              : 'text-violet-300 border-thea-border/40'
          }`}
        >
          {renderInline(trimmed.replace(/^##\s+/, ''))}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith('### ')) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(
        <h3
          key={`h3-${i}`}
          className={`text-base sm:text-lg font-bold mt-3.5 mb-1.5 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900 font-extrabold'
          }`}
        >
          {renderInline(trimmed.replace(/^###\s+/, ''))}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(
        <h4
          key={`h4-${i}`}
          className={`text-sm sm:text-base font-semibold mt-3 mb-1 ${
            theme === 'dark' ? 'text-slate-200' : 'text-zinc-800 font-bold'
          }`}
        >
          {renderInline(trimmed.replace(/^####\s+/, ''))}
        </h4>
      );
      continue;
    }

    // Citas agrupadas (Blockquote multi-línea)
    if (trimmed.startsWith('> ') || trimmed === '>') {
      if (currentList) flushList(`list-${i}`);
      const quoteLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const qTrim = lines[j].trim();
        if (qTrim.startsWith('> ') || qTrim === '>') {
          const textPart = qTrim.replace(/^>\s?/, '');
          if (textPart) quoteLines.push(textPart);
          j++;
        } else {
          break;
        }
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className={`border-l-3 pl-4 pr-3 py-2.5 my-3 rounded-r-xl text-xs sm:text-sm italic leading-relaxed space-y-1 transition-colors ${
            theme === 'light'
              ? 'border-amber-500 bg-amber-50 text-amber-950'
              : theme === 'kitty'
              ? 'border-pink-500 bg-pink-50 text-pink-950'
              : 'border-amber-400 bg-amber-500/10 text-amber-200'
          }`}
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInline(ql)}</p>
          ))}
        </blockquote>
      );
      i = j - 1;
      continue;
    }

    // Listas desordenadas (- item, * item, • item, + item)
    if (/^[-*•+]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*•+]\s+/, '');
      if (!currentList || currentList.type !== 'ul') {
        if (currentList) flushList(`list-${i}`);
        currentList = { type: 'ul', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      continue;
    }

    // Listas ordenadas (1. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      if (!currentList || currentList.type !== 'ol') {
        if (currentList) flushList(`list-${i}`);
        currentList = { type: 'ol', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      continue;
    }

    // Si había una lista acumulada y encontramos un párrafo normal, cerrarla
    if (currentList) flushList(`list-${i}`);

    // Párrafo normal
    blocks.push(
      <p key={`p-${i}`} className={`my-1.5 text-xs sm:text-sm leading-relaxed ${
        theme === 'dark' ? 'text-slate-300' : 'text-zinc-800'
      }`}>
        {renderInline(trimmed)}
      </p>
    );
  }

  if (currentList) {
    flushList(`list-final`);
  }

  return <div className={`formatted-content ${className}`}>{blocks}</div>;
};
