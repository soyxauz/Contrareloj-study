import type { Question } from '../types';

/**
 * Normaliza una etiqueta de tema eliminando tildes, signos de puntuación y espacios redundantes.
 */
export function normalizeTopicKey(topic?: string): string {
  if (!topic) return '';
  return topic
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar diacríticos/acentos
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Determina si dos temas son idénticos o están estrechamente relacionados (mismo subtema/concepto).
 */
export function isSameOrRelatedTopic(topicA?: string, topicB?: string): boolean {
  const normA = normalizeTopicKey(topicA);
  const normB = normalizeTopicKey(topicB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Si uno está contenido en el otro con suficiente longitud (>= 5 caracteres para evitar coincidencias espurias)
  if (normA.length >= 5 && normB.length >= 5) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
  }

  // Token matching: Si comparten al menos 2 palabras clave significativas (longitud > 4 letras)
  const wordsA = normA.split(' ').filter(w => w.length > 4);
  const wordsB = new Set(normB.split(' ').filter(w => w.length > 4));
  let sharedWords = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) {
      sharedWords++;
      if (sharedWords >= 2) return true;
    }
  }

  return false;
}

/**
 * Comprueba si un tema candidato coincide con alguno de los temas recientemente vistos.
 */
export function isTopicInRecent(candidateTopic?: string, recentTopics: string[] = []): boolean {
  if (!candidateTopic || recentTopics.length === 0) return false;
  const normCand = normalizeTopicKey(candidateTopic);
  if (!normCand) return false;
  return recentTopics.some(rt => isSameOrRelatedTopic(normCand, rt));
}

/**
 * Motor Socrático y Algoritmo de Recuperación Activa (Active Recall)
 * Basado en la arquitectura adaptativa de Thea.study.
 *
 * Características:
 * 1. Medición de partida y calibración basal.
 * 2. Elevación en tiempo real de la complejidad (Bloom 1-2 -> 3-4 -> 5-6).
 * 3. Detección y registro de debilidades conceptuales inmediatas ante fallos.
 * 4. Espaciado dinámico intercalado (Interleaving) con reformulación desde otro ángulo cognitivo.
 */

export interface ConceptMastery {
  concept: string;
  mastery: number; // 0.0 (nulo) a 1.0 (dominio total)
  attempts: number;
  correctCount: number;
  errorCount: number;
  status: 'baseline' | 'learning' | 'weakness' | 'mastered';
  lastAttemptAt: number;
  historyOfAngles: string[];
}

export interface SocraticIntervention {
  id: string;
  concept: string;
  originalQuestionId: string;
  originalQuestionText: string;
  originalUserAnswer: string;
  scheduledAtQuestionIndex: number;
  reformulatedQuestion?: Question;
  status: 'pending' | 'ready' | 'completed';
}

export interface SocraticSessionProfile {
  kitId: string;
  conceptMastery: Record<string, ConceptMastery>;
  interventions: SocraticIntervention[];
  activeComplexityLevel: 1 | 2 | 3;
  baselineCompleted: boolean;
  consecutiveCorrect: number;
  totalQuestionsAnswered: number;
  totalErrorsEncountered: number;
  totalErrorsRecovered: number;
}

/**
 * Inicializa el perfil socrático a partir del kit y sus preguntas
 */
export function createInitialSocraticProfile(
  kitId: string,
  initialQuestions: Question[] = []
): SocraticSessionProfile {
  const conceptMastery: Record<string, ConceptMastery> = {};

  for (const q of initialQuestions) {
    const topic = q.topic || 'Conceptos Fundamentales';
    if (!conceptMastery[topic]) {
      conceptMastery[topic] = {
        concept: topic,
        mastery: 0.2, // Nivel inicial basal
        attempts: 0,
        correctCount: 0,
        errorCount: 0,
        status: 'baseline',
        lastAttemptAt: Date.now(),
        historyOfAngles: [],
      };
    }
  }

  return {
    kitId,
    conceptMastery,
    interventions: [],
    activeComplexityLevel: 1,
    baselineCompleted: false,
    consecutiveCorrect: 0,
    totalQuestionsAnswered: 0,
    totalErrorsEncountered: 0,
    totalErrorsRecovered: 0,
  };
}

/**
 * Procesa la respuesta del estudiante, actualiza el perfil de dominio y programa
 * intervenciones socráticas intercaladas cuando se comete un error.
 */
export function updateSocraticProfileOnAnswer(
  profile: SocraticSessionProfile,
  question: Question,
  isCorrect: boolean,
  userAnswer: string,
  currentIndex: number,
  poolSize?: number
): {
  updatedProfile: SocraticSessionProfile;
  interventionScheduled?: SocraticIntervention;
  levelPromoted?: 1 | 2 | 3;
} {
  const nextProfile: SocraticSessionProfile = {
    ...profile,
    conceptMastery: { ...profile.conceptMastery },
    interventions: [...profile.interventions],
    totalQuestionsAnswered: profile.totalQuestionsAnswered + 1,
  };

  const topicKey = question.topic || 'Conceptos Fundamentales';
  const currentMastery = nextProfile.conceptMastery[topicKey] || {
    concept: topicKey,
    mastery: 0.2,
    attempts: 0,
    correctCount: 0,
    errorCount: 0,
    status: 'baseline',
    lastAttemptAt: Date.now(),
    historyOfAngles: [],
  };

  const attempts = currentMastery.attempts + 1;
  let newMasteryScore = currentMastery.mastery;
  let newStatus: ConceptMastery['status'] = currentMastery.status;
  let scheduled: SocraticIntervention | undefined = undefined;
  let levelPromoted: (1 | 2 | 3) | undefined = undefined;

  // Si la pregunta respondida era una reformulación socrática, marcarla como completada
  if (question.isSocraticReformulation) {
    if (isCorrect) {
      nextProfile.totalErrorsRecovered = profile.totalErrorsRecovered + 1;
      newStatus = 'mastered';
    }
    const intIdx = nextProfile.interventions.findIndex(
      i =>
        (i.reformulatedQuestion && i.reformulatedQuestion.id === question.id) ||
        i.originalQuestionId === question.originalFailedQuestionId ||
        isSameOrRelatedTopic(i.concept, question.topic)
    );
    if (intIdx !== -1) {
      nextProfile.interventions[intIdx] = {
        ...nextProfile.interventions[intIdx],
        status: 'completed',
      };
    }
  } else if (isCorrect) {
    if (newMasteryScore >= 0.75) {
      newStatus = 'mastered';
    } else {
      newStatus = 'learning';
    }
  }

  if (isCorrect) {
    nextProfile.consecutiveCorrect = profile.consecutiveCorrect + 1;
    newMasteryScore = Math.min(1.0, currentMastery.mastery + 0.25);

    // Elevación dinámica de complejidad en tiempo real
    if (
      nextProfile.consecutiveCorrect >= 3 &&
      nextProfile.activeComplexityLevel < 3 &&
      newMasteryScore >= 0.6
    ) {
      const nextLevel = (nextProfile.activeComplexityLevel + 1) as 2 | 3;
      nextProfile.activeComplexityLevel = nextLevel;
      levelPromoted = nextLevel;
      nextProfile.consecutiveCorrect = 0; // Reiniciar racha para calibrar nuevo nivel
    }
  } else {
    // Manejo de Error: Se registra debilidad y se activa el protocolo socrático
    nextProfile.consecutiveCorrect = 0;
    nextProfile.totalErrorsEncountered = profile.totalErrorsEncountered + 1;
    newMasteryScore = Math.max(0.05, currentMastery.mastery - 0.35);
    newStatus = 'weakness';

    // A1: Programar reaparición intercalada con espaciado dinámico inteligente
    // Kits pequeños (< 15 preguntas): 4 a 5 preguntas de separación
    // Kits normales (>= 15 preguntas): 6 a 8 preguntas de separación
    const isSmallKit = poolSize !== undefined && poolSize > 0 && poolSize < 15;
    const baseSpacing = isSmallKit ? 4 : 6;
    const jitter = isSmallKit ? (Math.random() < 0.5 ? 0 : 1) : Math.floor(Math.random() * 3); // 0, 1 o 2 -> 6, 7 u 8
    const targetSpacing = baseSpacing + jitter;

    // A3: Escalonamiento con amortiguador (buffer):
    // Dejar un mínimo de 3 preguntas normales entre intervenciones socráticas consecutivas
    // para evitar ráfagas de preguntas socráticas seguidas si el alumno comete varios fallos.
    const pendingInterventions = nextProfile.interventions.filter(
      i => i.status === 'pending' || i.status === 'ready'
    );
    const maxExistingScheduledIndex = pendingInterventions.length > 0
      ? Math.max(...pendingInterventions.map(i => i.scheduledAtQuestionIndex))
      : currentIndex;

    const scheduledIndex = Math.max(currentIndex + targetSpacing, maxExistingScheduledIndex + 3);
    const interventionId = `socr-int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    scheduled = {
      id: interventionId,
      concept: topicKey,
      originalQuestionId: question.id,
      originalQuestionText: question.question,
      originalUserAnswer: userAnswer,
      scheduledAtQuestionIndex: scheduledIndex,
      status: 'pending',
    };

    nextProfile.interventions.push(scheduled);
  }

  nextProfile.conceptMastery[topicKey] = {
    ...currentMastery,
    mastery: parseFloat(newMasteryScore.toFixed(2)),
    attempts,
    correctCount: currentMastery.correctCount + (isCorrect ? 1 : 0),
    errorCount: currentMastery.errorCount + (isCorrect ? 0 : 1),
    status: newStatus,
    lastAttemptAt: Date.now(),
    historyOfAngles: question.socraticAngle
      ? [...currentMastery.historyOfAngles, question.socraticAngle]
      : currentMastery.historyOfAngles,
  };

  return {
    updatedProfile: nextProfile,
    interventionScheduled: scheduled,
    levelPromoted,
  };
}

/**
 * Obtiene la siguiente intervención socrática lista, respetando:
 * 1. scheduledAtQuestionIndex <= currentIndex
 * 2. Si se especifica excludeTopic, evitar presentar una intervención del mismo tema
 *    que la pregunta recién vista (garantiza variedad temática inmediata).
 */
export function resolveNextSocraticTarget(
  profile: SocraticSessionProfile,
  currentIndex: number,
  excludeTopic?: string
): SocraticIntervention | null {
  const readyInterventions = profile.interventions.filter(
    i => i.status === 'ready' && Boolean(i.reformulatedQuestion) && i.scheduledAtQuestionIndex <= currentIndex
  );

  if (readyInterventions.length === 0) return null;

  if (excludeTopic) {
    const nonMatching = readyInterventions.find(i => !isSameOrRelatedTopic(i.concept, excludeTopic));
    if (nonMatching) return nonMatching;
    // Si la única intervención lista coincide exactamente con el tema recién contestado,
    // postergarla para no repetir tema consecutivamente.
    return null;
  }

  return readyInterventions[0] || null;
}
