import type { Question } from '../types';

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
  currentIndex: number
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
        i.concept === question.topic
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

    // Programar reaparición intercalada (Interleaving: 2 o 3 preguntas más adelante)
    const scheduledIndex = currentIndex + 3;
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
 * Obtiene la siguiente pregunta considerando intervenciones socráticas pendientes listas
 */
export function resolveNextSocraticTarget(
  profile: SocraticSessionProfile,
  currentIndex: number
): SocraticIntervention | null {
  const ready = profile.interventions.find(
    i => i.status === 'ready' && Boolean(i.reformulatedQuestion) && i.scheduledAtQuestionIndex <= currentIndex
  );
  return ready || null;
}
