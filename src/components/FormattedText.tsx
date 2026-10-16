import React from 'react';
import katex from 'katex';

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

/**
 * Parsea y renderiza texto con formato enriquecido eliminando la sintaxis cruda de Markdown (** y #)
 * y renderizando expresiones LaTeX/KaTeX completas (fórmulas, flujos lógicos con flechas y definiciones).
 */
export const FormattedText: React.FC<FormattedTextProps> = ({
  text,
  className = '',
  inlineOnly = false,
}) => {
  if (!text) return null;

  // Renderizado inline de matemáticas, negrita, cursiva, código y enlaces
  const renderInline = (str: string): React.ReactNode[] => {
    // Regex tokens: $$block$$, \\[block\\], $inline$, \\(inline\\), **negrita**, __negrita__, `código`, *cursiva*, _cursiva_, [link](url)
    const tokenRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\*\*[\s\S]+?\*\*|__[\s\S]+?__|`[^`]+`|\*[^*]+?\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\))/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(str)) !== null) {
      // Texto previo sin formato (reemplazando símbolos matemáticos sueltos si hubiese)
      if (match.index > lastIndex) {
        parts.push(replaceLooseSymbols(str.substring(lastIndex, match.index)));
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
          <strong key={`b-${match.index}`} className="font-bold text-white tracking-normal">
            {renderInline(content)}
          </strong>
        );
      } else if (token.startsWith('__') && token.endsWith('__')) {
        const content = token.slice(2, -2);
        parts.push(
          <strong key={`b-${match.index}`} className="font-bold text-white tracking-normal">
            {renderInline(content)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        const content = token.slice(1, -1);
        parts.push(
          <code
            key={`c-${match.index}`}
            className="px-1.5 py-0.5 rounded-md bg-thea-surfaceLight border border-thea-border/80 text-amber-300 font-mono text-[11px] sm:text-xs"
          >
            {content}
          </code>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        const content = token.slice(1, -1);
        parts.push(
          <em key={`i-${match.index}`} className="italic text-slate-200">
            {renderInline(content)}
          </em>
        );
      } else if (token.startsWith('_') && token.endsWith('_')) {
        const content = token.slice(1, -1);
        parts.push(
          <em key={`i-${match.index}`} className="italic text-slate-200">
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
      parts.push(replaceLooseSymbols(str.substring(lastIndex)));
    }

    return parts.length > 0 ? parts : [replaceLooseSymbols(str)];
  };

  if (inlineOnly) {
    return <span className={className}>{renderInline(text)}</span>;
  }

  // Parseo estructurado por bloques (encabezados, listas, citas, bloques matemáticos, párrafos)
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      blocks.push(
        <ul key={key} className="space-y-1.5 my-3 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0 shadow-xs" />
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    } else {
      blocks.push(
        <ol key={key} className="space-y-1.5 my-3 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <span className="text-xs font-bold text-amber-400 font-mono mt-0.5 shrink-0">{idx + 1}.</span>
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

    // Regla horizontal
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(<hr key={`hr-${i}`} className="border-thea-border/80 my-4" />);
      continue;
    }

    // Tablas estructuradas en Markdown (| Col1 | Col2 | Col3 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      if (currentList) flushList(`list-${i}`);

      const tableLines: string[] = [trimmed];
      let j = i + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed.startsWith('|') && nextTrimmed.endsWith('|')) {
          tableLines.push(nextTrimmed);
          j++;
        } else if (!nextTrimmed && j + 1 < lines.length && lines[j + 1].trim().startsWith('|') && lines[j + 1].trim().endsWith('|')) {
          // Saltear líneas en blanco accidentales entre filas de la tabla
          j++;
        } else {
          break;
        }
      }

      // Buscar la fila delimitadora (ej: | :--- | :--- | :--- |)
      const delimiterIndex = tableLines.findIndex(l => /^\|(?:\s*:?-+:?\s*\|)+$/.test(l));

      if (delimiterIndex !== -1 && tableLines.length >= 2) {
        const headerLines = tableLines.slice(0, delimiterIndex);
        const delimiterLine = tableLines[delimiterIndex];
        const bodyLines = tableLines.slice(delimiterIndex + 1);

        const parseRow = (rowLine: string) =>
          rowLine
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(c => c.trim());

        const alignments = delimiterLine
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(c => {
            const col = c.trim();
            const left = col.startsWith(':');
            const right = col.endsWith(':');
            if (left && right) return 'text-center';
            if (right) return 'text-right';
            return 'text-left';
          });

        const headers = headerLines.length > 0 ? parseRow(headerLines[0]) : [];
        const rows = bodyLines.map(parseRow);

        blocks.push(
          <div
            key={`table-block-${i}`}
            className="my-5 overflow-hidden rounded-2xl border border-thea-border/80 bg-slate-950/60 shadow-xl backdrop-blur-xs"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                {headers.length > 0 && (
                  <thead className="bg-gradient-to-r from-violet-950/70 via-slate-900/90 to-indigo-950/60 border-b border-thea-border">
                    <tr>
                      {headers.map((h, colIdx) => (
                        <th
                          key={`th-${i}-${colIdx}`}
                          className={`px-4 py-3.5 font-bold text-violet-300 uppercase tracking-wider text-[11px] sm:text-xs border-r border-thea-border/30 last:border-r-0 ${
                            alignments[colIdx] || 'text-left'
                          }`}
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-thea-border/30">
                  {rows.map((row, rIdx) => (
                    <tr
                      key={`tr-${i}-${rIdx}`}
                      className="hover:bg-violet-500/10 transition-colors odd:bg-slate-900/30"
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={`td-${i}-${rIdx}-${cIdx}`}
                          className={`px-4 py-3 text-slate-200 leading-relaxed border-r border-thea-border/20 last:border-r-0 ${
                            alignments[cIdx] || 'text-left'
                          }`}
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
          className="my-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 via-thea-surface to-indigo-950/30 border border-violet-500/30 overflow-x-auto text-center shadow-xs"
        >
          <div
            className="katex-display-wrapper text-slate-100 text-sm sm:text-base inline-block max-w-full"
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
          className="text-xl sm:text-2xl font-black text-amber-300 mt-5 mb-2.5 tracking-tight flex items-center gap-2"
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
          className="text-lg sm:text-xl font-extrabold text-violet-300 mt-4 mb-2 tracking-tight border-b border-thea-border/40 pb-1"
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
          className="text-base sm:text-lg font-bold text-white mt-3.5 mb-1.5"
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
          className="text-sm sm:text-base font-semibold text-slate-200 mt-3 mb-1"
        >
          {renderInline(trimmed.replace(/^####\s+/, ''))}
        </h4>
      );
      continue;
    }

    // Citas (Blockquote)
    if (trimmed.startsWith('> ')) {
      if (currentList) flushList(`list-${i}`);
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-3 border-amber-400 bg-amber-500/10 pl-4 py-2 my-2.5 rounded-r-xl text-amber-200 text-xs sm:text-sm italic leading-relaxed"
        >
          {renderInline(trimmed.replace(/^>\s+/, ''))}
        </blockquote>
      );
      continue;
    }

    // Listas desordenadas (- item o * item)
    if (/^[-*]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*]\s+/, '');
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
      <p key={`p-${i}`} className="my-1.5 text-xs sm:text-sm leading-relaxed text-slate-300">
        {renderInline(trimmed)}
      </p>
    );
  }

  if (currentList) {
    flushList(`list-final`);
  }

  return <div className={`formatted-content ${className}`}>{blocks}</div>;
};
