import React, { useMemo } from 'react';
import { FormattedText } from './FormattedText';

export interface QuestionPromptProps {
  text: string;
  topic?: string;
  className?: string;
  inlineOnly?: boolean;
  as?: 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'p';
}

/**
 * Aplica formato Markdown de énfasis a la parte nuclear o clave del enunciado,
 * garantizando que la parte importante sea negrita (font-extrabold / text-white)
 * y la contextual sea legible pero no negrita ni delgada (font-medium / text-slate-200).
 */
function getEmphasizedQuestionMarkdown(text: string, topic?: string): string {
  if (!text) return '';
  // Sanitizar marcadores de plantilla residuales ({0}, {1}) para que nunca se muestren como código crudo
  const sanitized = text.replace(/\{(\d+)\}/g, (_m, num) => `[Espacio ${Number(num) + 1}]`);
  const trimmed = sanitized.trim();

  // 1. Si el texto ya tiene negritas explícitas en Markdown (**...** o __...__), respetarlas
  if (/\*\*[\s\S]+?\*\*|__[\s\S]+?__/.test(trimmed)) {
    return trimmed;
  }

  // 2. Prefijos con dos puntos (ej: "Caso Clínico:", "Aplicación Intermedia:", "Análisis Relacional:")
  const prefixMatch = trimmed.match(/^([A-Za-zÁÉÍÓÚáéíóúñ\s]{3,30}:)\s+(.+)$/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const rest = prefixMatch[2];
    return `${prefix} ${getEmphasizedQuestionMarkdown(rest, topic)}`;
  }

  // 3. Conceptos en comillas (ej: ¿Qué función desempeña "hemoglobina" en el contexto...?)
  if (/["«][^"»]{2,60}["»]/.test(trimmed)) {
    return trimmed.replace(/(["«][^"»]{2,60}["»])/g, '**$1**');
  }

  // 4. Viñeta clínica o contexto previo antes de la pregunta directa (más de 15 caracteres de contexto)
  const qMarkIndex = trimmed.indexOf('¿');
  if (qMarkIndex > 15) {
    const rawContext = trimmed.slice(0, qMarkIndex);
    const questionPart = trimmed.slice(qMarkIndex).trim();
    const separator = rawContext.includes('\n') ? '\n\n' : ' ';
    const context = rawContext.trim();
    return `${context}${separator}**${questionPart}**`;
  }

  // 5. Coincidencia con el tema o concepto evaluado si fue provisto
  if (topic && topic.trim().length >= 3) {
    const cleanTopic = topic.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const topicRegex = new RegExp(`(\\b(?:el|la|los|las|un|una|del|de la)?\\s*)(${cleanTopic})\\b`, 'i');
    if (topicRegex.test(trimmed)) {
      return trimmed.replace(topicRegex, (_m, prefix, matchedTopic) => {
        return `${prefix}**${matchedTopic}**`;
      });
    }
  }

  // 6. Preguntas directas que inician con signo de interrogación "¿"
  if (trimmed.startsWith('¿')) {
    const framePatterns = [
      /^(¿(?:de acuerdo con|según|conforme a|en base a)\s+[^,]+,\s*)(.+)(\?)$/i,
      /^(¿(?:cuál de las siguientes opciones|cuál de los siguientes|cuáles de los siguientes)\s+(?:describe|es|corresponde|define|representa)?\s*)(.+)(\?)$/i,
      /^(¿(?:cuál|cuáles)\s+(?:es|son)\s+)(.+)(\?)$/i,
      /^(¿(?:qué|en qué)\s+(?:función|rol|mecanismo|organelo|estructura|proceso|fase|etapa)\s+(?:cumple|desempeña|tiene|se localiza|participa)?\s*)(.+)(\?)$/i,
      /^(¿(?:cómo|dónde|por qué|cuándo)\s+(?:se define|se lleva a cabo|se produce|actúa|opera|funciona)?\s*)(.+)(\?)$/i,
      /^(¿(?:qué|cómo|por qué|cuál|dónde)\s+(?:es|son|pasa|ocurre)\s+)(.+)(\?)$/i,
      /^(¿[^\s]+\s+[^\s]+\s+)(.+)(\?)$/i,
    ];

    for (const pat of framePatterns) {
      const m = trimmed.match(pat);
      if (m && m[2] && m[2].trim().length >= 3) {
        return `${m[1]}**${m[2]}**${m[3] || ''}`;
      }
    }
  }

  // 7. Enunciados imperativos o de selección
  const imperativeMatch = trimmed.match(/^(Selecciona|Identifica|Determina|Empareja|Indica|Señala|Elige|Ordena)\s+([^:]+)(:?)$/i);
  if (imperativeMatch) {
    const verb = imperativeMatch[1];
    const rest = imperativeMatch[2];
    const colon = imperativeMatch[3] || '';
    const sobreMatch = rest.match(/^(.+?\b(?:sobre|respecto a|en relación con|con|para)\s+)(.+)$/i);
    if (sobreMatch) {
      return `${verb} ${sobreMatch[1]}**${sobreMatch[2]}**${colon}`;
    }
    return `${verb} **${rest}**${colon}`;
  }

  // 8. Respaldo general: resaltar el núcleo predicativo tras conectores comunes
  const connectorMatch = trimmed.match(/^(.+?\b(?:de|del|en|sobre|para|con)\s+)(.+)$/i);
  if (connectorMatch && connectorMatch[1].length >= 12 && connectorMatch[2].length >= 6) {
    return `${connectorMatch[1]}**${connectorMatch[2]}**`;
  }

  return trimmed;
}

export const QuestionPrompt: React.FC<QuestionPromptProps> = ({
  text,
  topic,
  className = '',
  inlineOnly = false,
  as: Component = 'div',
}) => {
  const formattedMarkdown = useMemo(() => {
    return getEmphasizedQuestionMarkdown(text, topic);
  }, [text, topic]);

  return (
    <Component
      className={`font-medium text-slate-200 tracking-normal select-text leading-snug [&_strong]:font-extrabold [&_strong]:text-white [&_strong]:tracking-normal [&_b]:font-extrabold [&_b]:text-white ${className}`}
    >
      <FormattedText text={formattedMarkdown} inlineOnly={inlineOnly} />
    </Component>
  );
};
