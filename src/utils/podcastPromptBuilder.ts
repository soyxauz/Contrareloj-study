import type { PodcastDuration, PodcastEpisode, PodcastFormat } from '../types';
import { PODCAST_SPOKEN_SCRIPT_RULES } from './podcastTextSanitizer';

export interface PodcastLengthPlan {
  durationMode: PodcastDuration;
  minMinutes: number;
  targetMinutes: number;
  maxMinutes: number;
  minWords: number;
  targetWords: number;
  actsCount: number;
  turnsPerActRange: [number, number];
  wordsPerTurnRange: [number, number];
  maxTokensPerAct: number;
  defaultDurationLabel: string;
  explicitMinutesRequested: number | null;
}

export interface PodcastPromptBuildContext {
  title: string;
  category: string;
  fullMaterial: string;
  selectedFormat: PodcastFormat;
  plan: PodcastLengthPlan;
  customOrientation: string;
  translationDirective: string;
  previousPodcast?: PodcastEpisode;
  openingStyle: string;
}

export interface DialogueTurnDraft {
  speaker: string;
  text: string;
}

/**
 * Estima la duración real hablada en segundos usando exactamente la misma tasa
 * del reproductor y cálculo de línea de tiempo (~140 palabras/min + pausa).
 */
export function computeDialogueDurationSecs(dialogue: Array<{ text: string }>): number {
  let total = 0;
  for (const item of dialogue) {
    const words = (item.text || '').trim().split(/\s+/).filter(Boolean).length;
    if (words > 0) {
      total += Math.max(4, Math.round(words * 0.43 + 1.2));
    }
  }
  return total;
}

export function countDialogueWords(dialogue: Array<{ text: string }>): number {
  let words = 0;
  for (const item of dialogue) {
    words += (item.text || '').trim().split(/\s+/).filter(Boolean).length;
  }
  return words;
}

/**
 * Extrae una duración explícita (en minutos) si el usuario la escribió en el cuadro de texto
 * (por ejemplo: "20 minutos", "15-25 min", "media hora", "cuarto de hora", "2 mins").
 */
export function parseRequestedMinutesFromOrientation(orientation: string): number | null {
  const clean = (orientation || '').trim();
  if (!clean) return null;

  // Rango explícito: "15 a 25 minutos", "20-30 min"
  const rangeMatch = clean.match(/\b(\d{1,2})\s*(?:a|-|y|hasta)\s*(\d{1,2})\s*(?:min(?:uto)?s?)\b/i);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a && a >= 1 && b <= 60) {
      return Math.min(43, Math.round((a + b) / 2));
    }
  }

  // Número explícito en minutos: "20 minutos", "15 min", "3 mins"
  const singleMatch = clean.match(/\b(\d{1,2})\s*(?:min(?:uto)?s?)\b/i);
  if (singleMatch) {
    const mins = Number(singleMatch[1]);
    if (Number.isFinite(mins) && mins >= 1 && mins <= 60) {
      return Math.min(43, mins);
    }
  }

  if (/\bmedia\s+hora\b/i.test(clean)) return 30;
  if (/\bcuarto\s+de\s+hora\b/i.test(clean)) return 15;
  if (/\buna?\s+hora\b/i.test(clean)) return 43;
  if (/\b(?:cuarenta)\s+minutos?\b/i.test(clean)) return 40;
  if (/\b(?:treinta)\s+minutos?\b/i.test(clean)) return 30;
  if (/\b(?:veinte)\s+minutos?\b/i.test(clean)) return 20;
  if (/\b(?:quince)\s+minutos?\b/i.test(clean)) return 15;
  if (/\b(?:diez)\s+minutos?\b/i.test(clean)) return 10;

  return null;
}

/**
 * Construye el plan matemático y estructural de extensión acorde al selector
 * de duración, el volumen del material y las peticiones en el cuadro de texto.
 */
export function computePodcastLengthPlan(
  selectedDuration: PodcastDuration,
  customOrientation: string,
  materialLength: number,
  selectedFormat: PodcastFormat
): PodcastLengthPlan {
  const cleanOrientation = (customOrientation || '').trim();
  const explicitMinutes = parseRequestedMinutesFromOrientation(cleanOrientation);
  const asksExhaustive =
    selectedFormat === 'detailed' ||
    /(todo|literalmente|detallado|exhaustivo|a fondo|completo|profundo|minucioso|cada punto|sin resumir|extenso|largo|amplio)/i.test(
      cleanOrientation
    );
  const asksShort =
    /(muy corto|super corto|súper corto|ultracorto|express|relámpago|relampago|en\s*1\s*min|en\s*2\s*min)/i.test(
      cleanOrientation
    );

  // Si el usuario escribió un tiempo exacto en el cuadro de texto, este manda
  if (explicitMinutes !== null) {
    if (explicitMinutes <= 3) {
      const targetWords = Math.max(180, Math.round(explicitMinutes * 145));
      return {
        durationMode: 'short',
        minMinutes: Math.max(1, explicitMinutes - 0.5),
        targetMinutes: explicitMinutes,
        maxMinutes: explicitMinutes + 0.5,
        minWords: Math.round(targetWords * 0.8),
        targetWords,
        actsCount: 1,
        turnsPerActRange: [6, 9],
        wordsPerTurnRange: [28, 45],
        maxTokensPerAct: 2200,
        defaultDurationLabel: `${explicitMinutes}:00 min`,
        explicitMinutesRequested: explicitMinutes,
      };
    }

    if (explicitMinutes <= 7) {
      const targetWords = Math.round(explicitMinutes * 145);
      return {
        durationMode: 'normal',
        minMinutes: Math.max(3.5, explicitMinutes - 1),
        targetMinutes: explicitMinutes,
        maxMinutes: explicitMinutes + 1.5,
        minWords: Math.round(targetWords * 0.82),
        targetWords,
        actsCount: 1,
        turnsPerActRange: [14, 18],
        wordsPerTurnRange: [45, 65],
        maxTokensPerAct: 5000,
        defaultDurationLabel: `${explicitMinutes}:00 min`,
        explicitMinutesRequested: explicitMinutes,
      };
    }

    const minMins = Math.max(8, explicitMinutes - 2);
    const maxMins = Math.min(43, explicitMinutes + 3);
    const targetWords = Math.round(explicitMinutes * 142);
    const minWords = Math.round(minMins * 135);
    const actsCount = Math.max(2, Math.min(5, Math.ceil(targetWords / 680)));
    return {
      durationMode: 'long',
      minMinutes: minMins,
      targetMinutes: explicitMinutes,
      maxMinutes: maxMins,
      minWords,
      targetWords,
      actsCount,
      turnsPerActRange: [10, 14],
      wordsPerTurnRange: [65, 110],
      maxTokensPerAct: 5500,
      defaultDurationLabel: `${explicitMinutes}:00 min`,
      explicitMinutesRequested: explicitMinutes,
    };
  }

  if (asksShort && selectedDuration !== 'long') {
    return {
      durationMode: 'short',
      minMinutes: 1.3,
      targetMinutes: 2,
      maxMinutes: 2.5,
      minWords: 185,
      targetWords: 270,
      actsCount: 1,
      turnsPerActRange: [6, 8],
      wordsPerTurnRange: [30, 45],
      maxTokensPerAct: 2200,
      defaultDurationLabel: '2:00 min',
      explicitMinutesRequested: null,
    };
  }

  if (selectedDuration === 'short') {
    return {
      durationMode: 'short',
      minMinutes: 1.3,
      targetMinutes: 2,
      maxMinutes: 2.5,
      minWords: 185,
      targetWords: 270,
      actsCount: 1,
      turnsPerActRange: [6, 8],
      wordsPerTurnRange: [30, 45],
      maxTokensPerAct: 2200,
      defaultDurationLabel: '2:00 min',
      explicitMinutesRequested: null,
    };
  }

  if (selectedDuration === 'long') {
    let minMinutes = 11;
    let targetMinutes = 15;
    let maxMinutes = 22;
    let actsCount = 3;

    if (materialLength > 36000) {
      minMinutes = 16;
      targetMinutes = 22;
      maxMinutes = 32;
      actsCount = 4;
    } else if (materialLength > 18000 || asksExhaustive) {
      minMinutes = 13;
      targetMinutes = 18;
      maxMinutes = 26;
      actsCount = 3;
    }

    const minWords = Math.round(minMinutes * 135);
    const targetWords = Math.round(targetMinutes * 142);

    return {
      durationMode: 'long',
      minMinutes,
      targetMinutes,
      maxMinutes,
      minWords,
      targetWords,
      actsCount,
      turnsPerActRange: [11, 15],
      wordsPerTurnRange: [65, 110],
      maxTokensPerAct: 5500,
      defaultDurationLabel: `${targetMinutes}:00 min`,
      explicitMinutesRequested: null,
    };
  }

  // Normal (4–6 min)
  return {
    durationMode: 'normal',
    minMinutes: 4,
    targetMinutes: 5,
    maxMinutes: 6.5,
    minWords: 540,
    targetWords: 750,
    actsCount: 1,
    turnsPerActRange: [14, 18],
    wordsPerTurnRange: [45, 65],
    maxTokensPerAct: 5000,
    defaultDurationLabel: '5:00 min',
    explicitMinutesRequested: null,
  };
}

/**
 * Recorta el fragmento relevante del material de estudio para el acto indicado,
 * asegurando cobertura progresiva de todo el temario cuando el texto es extenso.
 */
export function sliceMaterialForAct(fullMaterial: string, actIndex: number, actsCount: number): string {
  const clean = (fullMaterial || '').trim();
  if (!clean) return '';
  const maxSliceChars = 15000;
  if (actsCount <= 1 || clean.length <= maxSliceChars) {
    return clean.slice(0, maxSliceChars);
  }

  const chunkSpan = Math.ceil(clean.length / actsCount);
  const overlap = Math.min(1800, Math.round(chunkSpan * 0.2));
  const rawStart = Math.max(0, actIndex * chunkSpan - (actIndex > 0 ? overlap : 0));
  const rawEnd = Math.min(clean.length, (actIndex + 1) * chunkSpan + (actIndex < actsCount - 1 ? overlap : 0));
  return clean.slice(rawStart, Math.min(rawStart + maxSliceChars, rawEnd));
}

function buildFormatDirective(selectedFormat: PodcastFormat, durationMode: PodcastDuration): string {
  const depthHint =
    durationMode === 'long'
      ? 'Desarrollo profundo multi-acto con ejemplos reales, analogías, mecanismos paso a paso y conexión exhaustiva de subtemas.'
      : durationMode === 'short'
      ? 'Síntesis condensada, directa y sin rodeos.'
      : 'Conversación pedagógica equilibrada con ejemplos concretos.';

  switch (selectedFormat) {
    case 'brief':
      return `FORMATO: BREVE (SÍNTESIS DIRECTA) — ${depthHint}
- Foco: Definiciones fundamentales, ideas nucleares y conclusiones prácticas sin paja.`;
    case 'critique':
      return `FORMATO: CRÍTICA Y EVALUACIÓN EXPERTA — ${depthHint}
- Foco: Puntos fuertes del material, trampas conceptuales habituales en exámenes, sesgos y dominio práctico.`;
    case 'debate':
      return `FORMATO: DEBATE REFLEXIVO — ${depthHint}
- Foco: Sofia y Alex contrastan enfoques (teoría vs práctica, ventajas vs limitaciones), se cuestionan cordialmente y sintetizan conclusiones.`;
    case 'detailed':
    default:
      return `FORMATO: INFORMACIÓN DETALLADA — ${depthHint}
- Cobertura: Desglosa mecanismos, causas, consecuencias, fórmulas y relaciones del material con rigor pedagógico en español hablado natural.`;
  }
}

function buildOrientationBlock(customOrientation: string): string {
  if (!customOrientation) return '';
  return `MANDATO PRIORITARIO DEL USUARIO (OBLIGATORIO — MANDA SOBRE TODO EL GUION):
El estudiante escribió explícitamente estas instrucciones en el cuadro de texto:
"""
${customOrientation}
"""
REGLA DE OBEDIENCIA ESTRICTA:
1. Cada decisión de tono, enfoque temático, ejemplos, énfasis o exclusiones debe obedecer literalmente esta petición.
2. Si el usuario pidió enfocarse en ciertos subtemas, casos prácticos, preguntas de examen o estilo narrativo, dedícales el protagonismo principal del diálogo.
3. Si el usuario especificó extensión o duración en su texto, respeta esa extensión al pie de la letra.`;
}

function buildPreviousEpisodeDirective(previousPodcast?: PodcastEpisode): string {
  if (!previousPodcast) return '';
  const prevTitle = previousPodcast.title || '';
  const prevFirstSpeaker = previousPodcast.dialogue?.[0]?.speaker || 'Sofia';
  const prevFirstLine = previousPodcast.dialogue?.[0]?.text || '';
  const prevSample = previousPodcast.dialogue?.slice(0, 3).map((d) => `${d.speaker}: "${d.text}"`).join(' | ') || '';

  return `REGLA DE NO REPETICIÓN RESPECTO AL EPISODIO PREVIO ("${prevTitle}"):
- Antes comenzó ${prevFirstSpeaker} diciendo: "${prevFirstLine}". Muestra previa: ${prevSample}
- PROHIBIDO repetir la misma apertura, ejemplos, analogías o secuencia. Empieza con ${prevFirstSpeaker === 'Sofia' ? 'Alex' : 'Sofia'} o entra 'in medias res' con un caso o pregunta nueva.`;
}

export function buildPodcastActPrompts(
  ctx: PodcastPromptBuildContext,
  actIndex: number,
  priorTurns: DialogueTurnDraft[]
): { systemPrompt: string; userPrompt: string } {
  const { title, category, fullMaterial, selectedFormat, plan, customOrientation, translationDirective, previousPodcast, openingStyle } = ctx;
  const actsCount = plan.actsCount;
  const isFirstAct = actIndex === 0;
  const isFinalAct = actIndex === actsCount - 1;
  const [minTurns, maxTurns] = plan.turnsPerActRange;
  const [minTurnWords, maxTurnWords] = plan.wordsPerTurnRange;
  const targetActWords = Math.round(plan.targetWords / actsCount);
  const actMaterial = sliceMaterialForAct(fullMaterial, actIndex, actsCount);

  const lastTurn = priorTurns[priorTurns.length - 1];
  const nextSpeaker = lastTurn?.speaker === 'Sofia' ? 'Alex' : 'Sofia';
  const recentTranscript = priorTurns
    .slice(-4)
    .map((t) => `${t.speaker}: "${t.text}"`)
    .join('\n');

  const formatDirective = buildFormatDirective(selectedFormat, plan.durationMode);
  const orientationBlock = buildOrientationBlock(customOrientation);
  const prevDirective = isFirstAct ? buildPreviousEpisodeDirective(previousPodcast) : '';

  const actMission =
    actsCount === 1
      ? `MISIÓN DEL EPISODIO COMPLETO (${plan.durationMode === 'short' ? 'CORTO' : 'NORMAL'}):
- Objetivo de duración real: ${plan.minMinutes} a ${plan.maxMinutes} minutos (~${plan.targetWords} palabras reales, mínimo ${plan.minWords} palabras).
- Genera entre ${minTurns} y ${maxTurns} intervenciones en total.
- Extensión de CADA intervención: entre ${minTurnWords} y ${maxTurnWords} palabras (${plan.durationMode === 'short' ? 'frases concisas y directas al núcleo' : 'desarrollo conversacional claro con ejemplos'}).
- Apertura sugerida: ${openingStyle}
- Cierra el episodio con una síntesis memorables al final.`
      : isFirstAct
      ? `MISIÓN DEL ACTO 1 DE ${actsCount} (APERTURA E INMERSIÓN PROFUNDA — EPISODIO LARGO DE ${plan.targetMinutes} MIN):
- Este es SOLO el Acto 1 de un episodio largo dividido en ${actsCount} actos.
- Extensión OBLIGATORIA de este Acto 1: genera entre ${minTurns} y ${maxTurns} intervenciones largas (~${targetActWords} palabras solo en este acto).
- CADA intervención DEBE tener entre ${minTurnWords} y ${maxTurnWords} palabras: prohíbe turnos cortos de 1–2 líneas. Expliquen mecanismos paso a paso, ejemplos y analogías detalladas.
- Apertura sugerida: ${openingStyle}
- PROHIBIDO DESPEDIRSE O CONCLUIR EL EPISODIO EN ESTE ACTO: termina este bloque dejando un puente natural abierto hacia la siguiente parte del tema.`
      : isFinalAct
      ? `MISIÓN DEL ACTO ${actIndex + 1} DE ${actsCount} (SÍNTESIS AVANZADA, MATICES Y CIERRE — EPISODIO LARGO DE ${plan.targetMinutes} MIN):
- CONTINÚA exactamente donde terminó el acto previo (empieza hablando ${nextSpeaker}). NO vuelvas a saludar ni repetir la introducción ni reexplicar lo ya dicho.
- Extensión OBLIGATORIA de este Acto final: genera entre ${minTurns} y ${maxTurns} intervenciones extensas (~${targetActWords} palabras).
- CADA intervención DEBE tener entre ${minTurnWords} y ${maxTurnWords} palabras: profundiza los temas finales del bloque, aborda errores frecuentes o preguntas trampa y realiza un cierre sólido del episodio.`
      : `MISIÓN DEL ACTO ${actIndex + 1} DE ${actsCount} (DESARROLLO PROFUNDO Y CASOS PRÁCTICOS — EPISODIO LARGO DE ${plan.targetMinutes} MIN):
- CONTINÚA exactamente la conversación previa (empieza hablando ${nextSpeaker}). PROHIBIDO volver a saludar, repetir introducciones o resumir el principio.
- Extensión OBLIGATORIA de este Acto intermedio: genera entre ${minTurns} y ${maxTurns} intervenciones extensas (~${targetActWords} palabras).
- CADA intervención DEBE tener entre ${minTurnWords} y ${maxTurnWords} palabras: desglosa a fondo los conceptos asignados a esta sección con ejemplos aplicados, contrastes y preguntas mutuas.
- PROHIBIDO DESPEDIRSE O CERRAR EL EPISODIO AQUÍ: deja el hilo listo para continuar en el Acto ${actIndex + 2}.`;

  const systemPrompt = `Eres el guionista principal del podcast educativo Contrareloj Review (locutores: Sofia y Alex).
Genera un guion conversacional 100% en español hablado natural, riguroso y pedagógico.

${orientationBlock ? orientationBlock + '\n\n' : ''}${actMission}

${formatDirective}

${prevDirective ? prevDirective + '\n\n' : ''}${translationDirective}

${PODCAST_SPOKEN_SCRIPT_RULES}

RESPONDE ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "podcast": {
    "title": "Repaso: ${title}",
    "duration": "${plan.defaultDurationLabel}",
    "dialogue": [
      { "speaker": "${isFirstAct ? 'Sofia' : nextSpeaker}", "text": "..." }
    ]
  }
}`;

  const continuationContext = !isFirstAct && recentTranscript
    ? `\nÚLTIMAS INTERVENCIONES DEL ACTO ANTERIOR (continúa de inmediato desde aquí con ${nextSpeaker}):\n${recentTranscript}\n`
    : '';

  const orientationReminder = customOrientation
    ? `\nINSTRUCCIÓN OBLIGATORIA DEL USUARIO A CUMPLIR SIN EXCEPCIÓN:\n"${customOrientation}"\n`
    : '';

  const userPrompt = `Tema del kit: "${title}" (${category}) | Modo de duración: "${plan.durationMode}" (objetivo total episodio: ~${plan.targetMinutes} min, ~${plan.targetWords} palabras) | Formato: "${selectedFormat}" | Parte ${actIndex + 1}/${actsCount}.${orientationReminder}${continuationContext}
MATERIAL DE ESTUDIO ASIGNADO PARA ESTA PARTE (${actMaterial.length} caracteres):
${actMaterial}
${orientationReminder}
Redacta ahora la parte ${actIndex + 1}/${actsCount} en JSON con ${minTurns}–${maxTurns} turnos de ${minTurnWords}–${maxTurnWords} palabras cada uno (~${targetActWords} palabras en total en esta respuesta):`;

  return { systemPrompt, userPrompt };
}

export function buildDeficitContinuationPrompts(
  ctx: PodcastPromptBuildContext,
  currentDialogue: DialogueTurnDraft[],
  currentWords: number,
  currentSecs: number,
  continuationIndex: number
): { systemPrompt: string; userPrompt: string } {
  const { title, category, fullMaterial, selectedFormat, plan, customOrientation, translationDirective } = ctx;
  const remainingWords = Math.max(320, Math.min(900, plan.minWords - currentWords + 180));
  const targetTurns = Math.max(6, Math.min(12, Math.round(remainingWords / 75)));
  const lastTurn = currentDialogue[currentDialogue.length - 1];
  const nextSpeaker = lastTurn?.speaker === 'Sofia' ? 'Alex' : 'Sofia';
  const recentTranscript = currentDialogue
    .slice(-4)
    .map((t) => `${t.speaker}: "${t.text}"`)
    .join('\n');

  // Elegir una ventana distinta del material para no repetir conceptos previos
  const sliceOffset = Math.min(
    Math.max(0, fullMaterial.length - 12000),
    Math.round((fullMaterial.length * ((continuationIndex % 3) + 1)) / 4)
  );
  const focusSlice = fullMaterial.slice(sliceOffset, sliceOffset + 14000);
  const orientationBlock = buildOrientationBlock(customOrientation);

  const systemPrompt = `Eres el guionista principal del podcast Contrareloj Review (Sofia y Alex).
El borrador actual solo alcanza ${Math.round(currentSecs / 60)} min (${currentWords} palabras), muy por debajo del mínimo pedido de ${plan.minMinutes} min (${plan.minWords} palabras).
Tu tarea es redactar una CONTINUACIÓN INMEDIATA que amplíe la profundidad del episodio SIN repetir lo ya conversado y cumpliendo todas las instrucciones del usuario.

${orientationBlock ? orientationBlock + '\n\n' : ''}REGLAS DE CONTINUACIÓN:
- Empieza hablando ${nextSpeaker}, retomando el hilo sin saludos ni re-presentaciones.
- Genera entre ${targetTurns} y ${targetTurns + 3} intervenciones sustanciales (75 a 120 palabras cada una, aportando ~${remainingWords} palabras nuevas).
- Profundiza detalles técnicos pendientes del material, compara conceptos clave, plantea ejemplos o preguntas tipo examen y cierra con fluidez.
- Formato activo: ${selectedFormat}.

${translationDirective}

${PODCAST_SPOKEN_SCRIPT_RULES}

Responde ÚNICAMENTE con JSON válido:
{
  "podcast": {
    "title": "Repaso: ${title}",
    "dialogue": [
      { "speaker": "${nextSpeaker}", "text": "..." }
    ]
  }
}`;

  const userPrompt = `Tema: "${title}" (${category}).
${customOrientation ? `INSTRUCCIÓN OBLIGATORIA DEL USUARIO:\n"${customOrientation}"\n` : ''}
ÚLTIMAS LÍNEAS YA GRABADAS (continúa justo después sin repetir nada):
${recentTranscript}

MATERIAL PARA SEGUIR PROFUNDIZANDO:
${focusSlice}

Genera las ${targetTurns}–${targetTurns + 3} nuevas intervenciones extensas (~${remainingWords} palabras nuevas) en JSON:`;

  return { systemPrompt, userPrompt };
}
