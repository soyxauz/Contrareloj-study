import type { StudyKit, SmartStudySessionState } from '../types';
import { authService } from './authService';

export interface TopicMasteryStat {
  topic: string;
  totalQuestions: number;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number; // 0 - 100
  status: 'unstarted' | 'needs-review' | 'in-progress' | 'mastered';
}

export interface BookStats {
  kitId: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  totalQuestions: number;
  questionsAnswered: number;
  correctAnswers: number;
  accuracy: number; // 0.0 to 100.0
  level: 1 | 2 | 3;
  levelName: string;
  levelCorrectCount: number;
  levelTarget: number;
  smartStudyProgressPercent: number;
  errorsReinforced: number;
  flashcardsTotal: number;
  flashcardsMastered: number;
  flashcardsKnown: number;
  flashcardsToLearn: number;
  chunksCount: number;
  assetsCount: number;
  wordCount: number;
  hasPodcast: boolean;
  podcastDuration?: string;
  topicsMastery: TopicMasteryStat[];
  historyCount: number;
  lastStudiedDate?: string;
  studyStatus: 'unstarted' | 'in-progress' | 'proficient' | 'mastered';
}

export interface GlobalStats {
  totalBooks: number;
  totalQuestions: number;
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
  totalFlashcards: number;
  totalFlashcardsMastered: number;
  totalAssets: number;
  totalWords: number;
  totalErrorsReinforced: number;
  realStreakDays: number;
  activeBooksCount: number;
  booksSummary: BookStats[];
}

/**
 * Calcula la racha real de días consecutivos de estudio basándose en los timestamps
 * de las preguntas respondidas registradas en el historial de todas las sesiones.
 */
export function calculateRealStreak(sessions: (SmartStudySessionState | null)[]): number {
  const dates = new Set<string>();

  for (const s of sessions) {
    if (!s || !s.history || !Array.isArray(s.history)) continue;
    for (const h of s.history) {
      if (h.timestamp) {
        try {
          const d = new Date(h.timestamp);
          if (!isNaN(d.getTime())) {
            // Formato YYYY-MM-DD
            const key = d.toISOString().split('T')[0];
            dates.add(key);
          }
        } catch {
          // ignore invalid date
        }
      }
    }
  }

  if (dates.size === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Si no hay actividad ni hoy ni ayer, la racha activa se reinició
  if (!dates.has(today) && !dates.has(yesterday)) {
    return 0;
  }

  let streak = 0;
  let checkDate = dates.has(today) ? new Date() : new Date(Date.now() - 86400000);

  while (true) {
    const key = checkDate.toISOString().split('T')[0];
    if (dates.has(key)) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  return streak;
}

function countWordsFast(text: string): number {
  if (!text) return 0;
  let count = 0;
  let inWord = false;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code <= 32) {
      if (inWord) {
        count++;
        inWord = false;
      }
    } else {
      inWord = true;
    }
  }
  if (inWord) count++;
  return count;
}

const bookStatsFastCache = new Map<string, { stats: BookStats; ts: number }>();

/**
 * Calcula las estadísticas reales no inventadas de un libro o Study Kit específico.
 */
export function getBookRealStats(kit: StudyKit, userId: string | null = null): BookStats {
  const session = authService.getSmartStudySession(userId, kit.id);
  const cacheKey = `${userId || 'g'}_${kit.id}_${session?.level || 1}_${session?.history?.length || 0}_${kit.updatedAt || 0}`;
  const hit = bookStatsFastCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < 4000) {
    return hit.stats;
  }

  const totalQuestions = (kit.questions && kit.questions.length > 0)
    ? kit.questions.length
    : (typeof (kit as any).questionsCount === 'number' ? (kit as any).questionsCount : 0);
  const history = session?.history && Array.isArray(session.history) ? session.history : [];
  const questionsAnswered = session?.questionsAnsweredTotal || history.length;

  const correctAnswers = history.filter(h => h.isCorrect).length;
  const accuracy = questionsAnswered > 0
    ? Math.round((correctAnswers / (history.length || questionsAnswered)) * 1000) / 10
    : 0;

  const level = (session?.level as 1 | 2 | 3) || 1;
  const levelNames = {
    1: 'Nivel 1: Retención & Fundamentos',
    2: 'Nivel 2: Razonamiento & Análisis',
    3: 'Nivel 3: Casos Prácticos & Síntesis'
  };

  const levelTarget = 25;
  const levelCorrectCount = (session?.levelCorrectCounts && typeof session.levelCorrectCounts[level] === 'number')
    ? session.levelCorrectCounts[level]
    : (typeof session?.levelCorrectCount === 'number' ? session.levelCorrectCount : 0);
  const smartStudyProgressPercent = Math.min(100, Math.round((levelCorrectCount / levelTarget) * 100));

  const flashcardProgress = authService.getFlashcardProgress(userId, kit.id);
  const flashcardMap = flashcardProgress?.masteryMap || {};
  const activeFlashcards = (kit.flashcards && kit.flashcards.length > 0)
    ? kit.flashcards
    : (flashcardProgress?.cards || []);

  const flashcardsTotal = activeFlashcards.length > 0
    ? activeFlashcards.length
    : (typeof (kit as any).flashcardsCount === 'number' ? (kit as any).flashcardsCount : 0);
  let flashcardsMastered = 0;
  let flashcardsKnown = 0;
  let flashcardsToLearn = 0;

  if (activeFlashcards.length > 0) {
    activeFlashcards.forEach(f => {
      const termClean = f.term ? f.term.trim() : '';
      const m = (f.id && flashcardMap[f.id]) ||
                (f.term && flashcardMap[f.term]) ||
                (termClean && flashcardMap[termClean]) ||
                (termClean && flashcardMap[termClean.toLowerCase()]) ||
                f.mastery ||
                'to-learn';
      if (m === 'mastered') flashcardsMastered++;
      else if (m === 'known') flashcardsKnown++;
      else flashcardsToLearn++;
    });
  } else if (flashcardMap && typeof flashcardMap === 'object') {
    const values = Object.values(flashcardMap);
    flashcardsMastered = values.filter(v => v === 'mastered').length;
    flashcardsKnown = values.filter(v => v === 'known').length;
    flashcardsToLearn = values.filter(v => v === 'to-learn').length;
  }

  const chunksCount = kit.chunks ? kit.chunks.length : 0;
  const assetsCount = kit.assets ? kit.assets.length : 0;

  // Conteo real de palabras con algoritmo zero-allocation
  let wordCount = 0;
  if (kit.sourceText && kit.sourceText.length > 0) {
    wordCount = countWordsFast(kit.sourceText);
  } else if (kit.chunks && kit.chunks.length > 0) {
    wordCount = kit.chunks.reduce((acc, c) => acc + (c.tokenCount || countWordsFast(c.text)), 0);
  } else if (kit.description) {
    wordCount = countWordsFast(kit.description);
  }

  // Desglose de Dominio por Temas REALES del Libro
  const topicStatsMap = new Map<string, { total: number; attempts: number; correct: number }>();

  // 1. Extraer todos los temas de las preguntas del libro
  if (kit.questions) {
    for (const q of kit.questions) {
      const topicName = (q.topic || 'General').trim();
      const curr = topicStatsMap.get(topicName) || { total: 0, attempts: 0, correct: 0 };
      curr.total += 1;
      topicStatsMap.set(topicName, curr);
    }
  }

  // 2. Extraer temas de los headings de los chunks si no estuviesen en preguntas
  if (kit.chunks) {
    for (const c of kit.chunks) {
      if (c.heading && c.heading.trim().length > 0) {
        const hName = c.heading.trim();
        if (!topicStatsMap.has(hName)) {
          topicStatsMap.set(hName, { total: 0, attempts: 0, correct: 0 });
        }
      }
    }
  }

  // 3. Contabilizar respuestas dadas en el historial por tema
  for (const h of history) {
    const topicName = (h.topic || 'General').trim();
    const curr = topicStatsMap.get(topicName) || { total: 0, attempts: 0, correct: 0 };
    curr.attempts += 1;
    if (h.isCorrect) {
      curr.correct += 1;
    }
    topicStatsMap.set(topicName, curr);
  }

  const topicsMastery: TopicMasteryStat[] = Array.from(topicStatsMap.entries()).map(([topic, data]) => {
    const topicAccuracy = data.attempts > 0 ? Math.round((data.correct / data.attempts) * 100) : 0;
    let status: 'unstarted' | 'needs-review' | 'in-progress' | 'mastered' = 'unstarted';

    if (data.attempts === 0) {
      status = 'unstarted';
    } else if (topicAccuracy >= 80 && data.attempts >= 2) {
      status = 'mastered';
    } else if (topicAccuracy >= 50) {
      status = 'in-progress';
    } else {
      status = 'needs-review';
    }

    return {
      topic,
      totalQuestions: data.total,
      attempts: data.attempts,
      correct: data.correct,
      incorrect: data.attempts - data.correct,
      accuracy: topicAccuracy,
      status
    };
  });

  // Ordenar temas: primero los que tienen intentos (con menor precisión primero para enfocar refuerzo), luego los no iniciados
  topicsMastery.sort((a, b) => {
    if (a.attempts > 0 && b.attempts === 0) return -1;
    if (a.attempts === 0 && b.attempts > 0) return 1;
    if (a.attempts > 0 && b.attempts > 0) return a.accuracy - b.accuracy;
    return a.topic.localeCompare(b.topic);
  });

  // Determinar última fecha de estudio
  let lastStudiedDate: string | undefined = undefined;
  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.timestamp) {
      try {
        lastStudiedDate = new Date(last.timestamp).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        lastStudiedDate = undefined;
      }
    }
  }

  // Estado general del libro
  let studyStatus: 'unstarted' | 'in-progress' | 'proficient' | 'mastered' = 'unstarted';
  if (questionsAnswered === 0) {
    studyStatus = 'unstarted';
  } else if (accuracy >= 85 && questionsAnswered >= 10) {
    studyStatus = 'mastered';
  } else if (accuracy >= 70 && questionsAnswered >= 5) {
    studyStatus = 'proficient';
  } else {
    studyStatus = 'in-progress';
  }

  const resultStats: BookStats = {
    kitId: kit.id,
    title: kit.title,
    category: kit.category,
    description: kit.description,
    icon: kit.icon,
    color: kit.color,
    totalQuestions,
    questionsAnswered,
    correctAnswers,
    accuracy,
    level,
    levelName: levelNames[level],
    levelCorrectCount,
    levelTarget,
    smartStudyProgressPercent,
    errorsReinforced: session?.totalErrorsReinforced || 0,
    flashcardsTotal,
    flashcardsMastered,
    flashcardsKnown,
    flashcardsToLearn,
    chunksCount,
    assetsCount,
    wordCount,
    hasPodcast: Boolean(kit.podcast),
    podcastDuration: kit.podcast?.duration,
    topicsMastery,
    historyCount: history.length,
    lastStudiedDate,
    studyStatus
  };

  bookStatsFastCache.set(cacheKey, { stats: resultStats, ts: Date.now() });
  return resultStats;
}

const SNAPSHOT_KEY_PREFIX = 'thea_global_stats_snap_';

export interface GlobalStatsSnapshot {
  totalBooks: number;
  totalQuestions: number;
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
  totalFlashcards: number;
  totalFlashcardsMastered: number;
  totalAssets: number;
  totalWords: number;
  totalErrorsReinforced: number;
  realStreakDays: number;
  activeBooksCount: number;
  updatedAt: number;
}

/**
 * Guarda un resumen ultra compacto (< 200 bytes) en LocalStorage y Cookie para persistencia instantánea.
 */
export function saveGlobalStatsSnapshot(stats: GlobalStats, userId: string | null = null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${SNAPSHOT_KEY_PREFIX}${userId || 'guest'}`;
    const snap: GlobalStatsSnapshot = {
      totalBooks: stats.totalBooks,
      totalQuestions: stats.totalQuestions,
      totalAnswered: stats.totalAnswered,
      totalCorrect: stats.totalCorrect,
      overallAccuracy: stats.overallAccuracy,
      totalFlashcards: stats.totalFlashcards,
      totalFlashcardsMastered: stats.totalFlashcardsMastered,
      totalAssets: stats.totalAssets,
      totalWords: stats.totalWords,
      totalErrorsReinforced: stats.totalErrorsReinforced,
      realStreakDays: stats.realStreakDays,
      activeBooksCount: stats.activeBooksCount,
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(snap);
    localStorage.setItem(key, serialized);
    // Respaldo en cookie de larga duración para garantizar persistencia síncrona
    document.cookie = `${key}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}

/**
 * Recupera el resumen persistente instantáneo desde LocalStorage o Cookie.
 */
export function getGlobalStatsSnapshot(userId: string | null = null): GlobalStatsSnapshot | null {
  if (typeof window === 'undefined') return null;
  const key = `${SNAPSHOT_KEY_PREFIX}${userId || 'guest'}`;
  try {
    // 1. LocalStorage
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.totalQuestions === 'number') {
        return parsed;
      }
    }
  } catch {}

  try {
    // 2. Cookie fallback
    const match = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
    if (match && match[1]) {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      if (parsed && typeof parsed.totalQuestions === 'number') {
        return parsed;
      }
    }
  } catch {}

  return null;
}

/**
 * Calcula las estadísticas globales de toda la biblioteca de libros del usuario.
 */
export function getGlobalRealStats(kits: StudyKit[], userId: string | null = null): GlobalStats {
  const booksSummary = kits.map(k => getBookRealStats(k, userId));
  const sessions = kits.map(k => authService.getSmartStudySession(userId, k.id));

  const totalBooks = kits.length;
  let totalQuestions = booksSummary.reduce((acc, b) => acc + b.totalQuestions, 0);
  let totalAnswered = booksSummary.reduce((acc, b) => acc + b.questionsAnswered, 0);
  let totalCorrect = booksSummary.reduce((acc, b) => acc + b.correctAnswers, 0);

  let totalFlashcards = booksSummary.reduce((acc, b) => acc + b.flashcardsTotal, 0);
  let totalFlashcardsMastered = booksSummary.reduce((acc, b) => acc + b.flashcardsMastered, 0);
  let totalAssets = booksSummary.reduce((acc, b) => acc + b.assetsCount, 0);
  let totalWords = booksSummary.reduce((acc, b) => acc + b.wordCount, 0);
  let totalErrorsReinforced = booksSummary.reduce((acc, b) => acc + b.errorsReinforced, 0);

  let realStreakDays = calculateRealStreak(sessions);
  let activeBooksCount = booksSummary.filter(b => b.questionsAnswered > 0).length;

  // Si los kits aún se están hidratando desde IndexedDB o red, pero existe un snapshot local guardado:
  const cachedSnap = getGlobalStatsSnapshot(userId);
  if (cachedSnap) {
    if (totalQuestions === 0 && cachedSnap.totalQuestions > 0) {
      totalQuestions = cachedSnap.totalQuestions;
    }
    if (totalFlashcards === 0 && cachedSnap.totalFlashcards > 0) {
      totalFlashcards = cachedSnap.totalFlashcards;
      totalFlashcardsMastered = cachedSnap.totalFlashcardsMastered;
    }
    if (realStreakDays === 0 && cachedSnap.realStreakDays > 0) {
      realStreakDays = cachedSnap.realStreakDays;
    }
    if (totalAnswered === 0 && cachedSnap.totalAnswered > 0) {
      totalAnswered = cachedSnap.totalAnswered;
      totalCorrect = cachedSnap.totalCorrect;
    }
    if (activeBooksCount === 0 && cachedSnap.activeBooksCount > 0) {
      activeBooksCount = cachedSnap.activeBooksCount;
    }
  }

  const overallAccuracy = totalAnswered > 0
    ? Math.round((totalCorrect / totalAnswered) * 1000) / 10
    : (cachedSnap?.overallAccuracy || 0);

  const result: GlobalStats = {
    totalBooks: Math.max(totalBooks, cachedSnap?.totalBooks || 0),
    totalQuestions,
    totalAnswered,
    totalCorrect,
    overallAccuracy,
    totalFlashcards,
    totalFlashcardsMastered,
    totalAssets,
    totalWords,
    totalErrorsReinforced,
    realStreakDays,
    activeBooksCount,
    booksSummary
  };

  // Si tenemos estadísticas calculadas con reactivos o tarjetas válidas, refrescar el snapshot ultraligero
  if (booksSummary.some(b => b.totalQuestions > 0 || b.flashcardsTotal > 0)) {
    saveGlobalStatsSnapshot(result, userId);
  }

  return result;
}
