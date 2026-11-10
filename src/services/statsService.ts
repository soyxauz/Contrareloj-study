import type { StudyKit, SmartStudySessionState } from '../types';
import { authService } from './authService';
import { safeLocalStorageSetItem } from './storageService';

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

function extractHistoryEpoch(h: any): number {
  if (!h || typeof h !== 'object') return 0;
  if (typeof h.timestampEpoch === 'number' && Number.isFinite(h.timestampEpoch) && h.timestampEpoch > 0) {
    return h.timestampEpoch;
  }
  const match = typeof h.id === 'string' ? h.id.match(/^hist-(\d+)/) : null;
  if (match && match[1]) {
    const val = parseInt(match[1], 10);
    if (Number.isFinite(val) && val > 0) return val;
  }
  if (h.timestamp) {
    const parsed = Date.parse(h.timestamp);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      const epoch = extractHistoryEpoch(h);
      if (epoch > 0) {
        dates.add(toLocalDateKey(new Date(epoch)));
      }
    }
  }

  if (dates.size === 0) return 0;

  const now = new Date();
  const today = toLocalDateKey(now);
  const yesterday = toLocalDateKey(new Date(now.getTime() - 86400000));

  // Si no hay actividad ni hoy ni ayer, la racha activa se reinició
  if (!dates.has(today) && !dates.has(yesterday)) {
    return 0;
  }

  let streak = 0;
  let checkDate = dates.has(today) ? now : new Date(now.getTime() - 86400000);

  while (true) {
    const key = toLocalDateKey(checkDate);
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

export function clearBookStatsCache(): void {
  bookStatsFastCache.clear();
}

if (typeof window !== 'undefined') {
  const clearCache = () => bookStatsFastCache.clear();
  window.addEventListener('thea_session_saved', clearCache);
  window.addEventListener('thea_progress_synced', clearCache);
  window.addEventListener('thea_flashcard_saved', clearCache);
}

/**
 * Calcula las estadísticas reales no inventadas de un libro o Study Kit específico.
 */
export function getBookRealStats(kit: StudyKit, userId: string | null = null): BookStats {
  const session = authService.getSmartStudySession(userId, kit.id);
  const flashcardProgress = authService.getFlashcardProgress(userId, kit.id);
  const fcMasteryCount = flashcardProgress?.masteryMap
    ? Object.values(flashcardProgress.masteryMap).filter(v => v === 'mastered').length
    : 0;
  const cacheKey = `${userId || 'g'}_${kit.id}_${session?.level || 1}_${session?.levelCorrectCount || 0}_${session?.questionsAnsweredTotal || 0}_${session?.history?.length || 0}_${session?.lastUpdated || 0}_${(session as any)?.resetAt || 0}_${fcMasteryCount}_${flashcardProgress?.updatedAt || 0}_${flashcardProgress?.resetAt || 0}_${kit.updatedAt || 0}`;
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

  const hasHydratedQuestions = Boolean(kit.questions && kit.questions.length > 0);
  const fastSnap = (!session && !hasHydratedQuestions)
    ? getGlobalStatsSnapshot(userId)?.booksMap?.[kit.id]
    : undefined;
  const level = (session?.level as 1 | 2 | 3) || (fastSnap?.level as 1 | 2 | 3) || 1;
  const levelNames = {
    1: 'Nivel 1: Retención & Fundamentos',
    2: 'Nivel 2: Razonamiento & Análisis',
    3: 'Nivel 3: Casos Prácticos & Síntesis'
  };

  const levelTarget = 25;
  const levelCorrectCount = (session?.levelCorrectCounts && typeof session.levelCorrectCounts[level] === 'number')
    ? session.levelCorrectCounts[level]
    : (typeof session?.levelCorrectCount === 'number'
        ? session.levelCorrectCount
        : (fastSnap?.levelCorrectCount || 0));
  const smartStudyProgressPercent = fastSnap && !session
    ? fastSnap.smartStudyProgressPercent
    : Math.min(100, Math.round((levelCorrectCount / levelTarget) * 100));

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

  // Determinar última fecha de estudio (history está ordenado descendente: índice 0 es el más reciente)
  let lastStudiedDate: string | undefined = undefined;
  const latestHistoryEpoch = history.length > 0 ? extractHistoryEpoch(history[0]) : 0;
  const lastActivityEpoch = latestHistoryEpoch || session?.lastUpdated || 0;
  if (lastActivityEpoch > 0) {
    try {
      lastStudiedDate = new Date(lastActivityEpoch).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      lastStudiedDate = undefined;
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

export interface BookSnapshotItem {
  level: 1 | 2 | 3;
  levelCorrectCount: number;
  smartStudyProgressPercent: number;
  questionsAnswered: number;
  accuracy: number;
}

export const SNAPSHOT_ACTIVE_KEY = 'thea_global_stats_snap_active';
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
  booksMap?: Record<string, BookSnapshotItem>;
}

/**
 * Guarda un resumen ultra compacto en LocalStorage y Cookie para persistencia instantanea en 0ms.
 * Respeta siempre la verdad actual de las sesiones cargadas para no mezclar aciertos entre niveles ni resucitar reinicios.
 */
export function saveGlobalStatsSnapshot(
  stats: GlobalStats,
  userId: string | null = null,
  options?: { hasHydratedContent?: boolean; sessionKitIds?: Set<string> }
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${SNAPSHOT_KEY_PREFIX}${userId || 'guest'}`;
    const prevSnap = getGlobalStatsSnapshot(userId);
    const hasHydratedContent = options?.hasHydratedContent ?? stats.totalQuestions > 0;

    // Proteccion contra arranque frio: si aun no hay contenido hidratado y el snapshot previo tenia datos, no pisar con ceros.
    if (!hasHydratedContent && prevSnap && (prevSnap.totalAnswered > 0 || prevSnap.totalQuestions > 0)) {
      return;
    }

    const booksMap: Record<string, BookSnapshotItem> = {};
    if (Array.isArray(stats.booksSummary)) {
      for (const b of stats.booksSummary) {
        if (!b || !b.kitId) continue;
        const hasAuthoritativeSession = options?.sessionKitIds ? options.sessionKitIds.has(b.kitId) : true;
        const prevB = prevSnap?.booksMap?.[b.kitId];
        if (!hasAuthoritativeSession && b.questionsAnswered === 0 && b.level === 1 && b.levelCorrectCount === 0 && prevB) {
          booksMap[b.kitId] = { ...prevB };
        } else {
          booksMap[b.kitId] = {
            level: b.level,
            levelCorrectCount: b.levelCorrectCount,
            smartStudyProgressPercent: b.smartStudyProgressPercent,
            questionsAnswered: b.questionsAnswered,
            accuracy: b.accuracy,
          };
        }
      }
    }

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
      booksMap,
    };
    const serialized = JSON.stringify(snap);

    // 1. Guardar con clave de usuario y clave activa universal
    safeLocalStorageSetItem(key, serialized);
    safeLocalStorageSetItem(SNAPSHOT_ACTIVE_KEY, serialized);

    // 2. Respaldo en cookie de 365 dias para garantizar lectura sincrona antes del inicio de JS
    try {
      document.cookie = `${key}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `${SNAPSHOT_ACTIVE_KEY}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  } catch {}
}

/**
 * Recupera el resumen persistente instantaneo desde LocalStorage o Cookie en 0ms.
 */
export function getGlobalStatsSnapshot(userId: string | null = null): GlobalStatsSnapshot | null {
  if (typeof window === 'undefined') return null;
  const candidateKeys: string[] = [];
  if (userId) {
    candidateKeys.push(`${SNAPSHOT_KEY_PREFIX}${userId}`);
  }
  candidateKeys.push(SNAPSHOT_ACTIVE_KEY);
  candidateKeys.push(`${SNAPSHOT_KEY_PREFIX}guest`);

  // 1. Intentar LocalStorage en orden de prioridad
  for (const k of candidateKeys) {
    try {
      const stored = localStorage.getItem(k);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.totalQuestions === 'number') {
          return parsed;
        }
      }
    } catch {}
  }

  // 2. Intentar Cookie fallback
  for (const k of candidateKeys) {
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${k}=([^;]*)`));
      if (match && match[1]) {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        if (parsed && typeof parsed.totalQuestions === 'number') {
          return parsed;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Calcula las estadísticas globales de toda la biblioteca de libros del usuario.
 */
export function getGlobalRealStats(kits: StudyKit[], userId: string | null = null): GlobalStats {
  const booksSummary = kits.map(k => getBookRealStats(k, userId));
  const sessions = kits.map(k => authService.getSmartStudySession(userId, k.id));
  const sessionKitIds = new Set<string>();
  const hydratedKitIds = new Set<string>();
  kits.forEach((k, idx) => {
    if (sessions[idx]) sessionKitIds.add(k.id);
    if ((k.questions && k.questions.length > 0) || (k.flashcards && k.flashcards.length > 0)) {
      hydratedKitIds.add(k.id);
    }
  });
  const hasHydratedContent = hydratedKitIds.size > 0 || sessionKitIds.size > 0;

  const totalBooks = kits.length;
  let totalQuestions = booksSummary.reduce((acc, b) => acc + b.totalQuestions, 0);
  let totalAnswered = booksSummary.reduce((acc, b) => acc + b.questionsAnswered, 0);
  let totalCorrect = booksSummary.reduce((acc, b) => acc + b.correctAnswers, 0);

  let totalFlashcards = booksSummary.reduce((acc, b) => acc + b.flashcardsTotal, 0);
  let totalFlashcardsMastered = booksSummary.reduce((acc, b) => acc + b.flashcardsMastered, 0);
  const totalAssets = booksSummary.reduce((acc, b) => acc + b.assetsCount, 0);
  const totalWords = booksSummary.reduce((acc, b) => acc + b.wordCount, 0);
  const totalErrorsReinforced = booksSummary.reduce((acc, b) => acc + b.errorsReinforced, 0);

  let realStreakDays = calculateRealStreak(sessions);
  let activeBooksCount = booksSummary.filter(b => b.questionsAnswered > 0).length;

  // Solo usar snapshot como respaldo en arranque en frío antes de hidratar IndexedDB/sesiones,
  // nunca sobreescribiendo kits con sesión o preguntas reales ya cargadas.
  const cachedSnap = getGlobalStatsSnapshot(userId);
  const isColdStart = totalBooks === 0 || !hasHydratedContent;
  if (cachedSnap && isColdStart) {
    if (totalQuestions === 0 && cachedSnap.totalQuestions > 0) {
      totalQuestions = cachedSnap.totalQuestions;
    }
    if (totalFlashcards === 0 && cachedSnap.totalFlashcards > 0) {
      totalFlashcards = cachedSnap.totalFlashcards;
    }
    if (totalFlashcardsMastered < cachedSnap.totalFlashcardsMastered) {
      totalFlashcardsMastered = cachedSnap.totalFlashcardsMastered;
    }
    if (realStreakDays < cachedSnap.realStreakDays) {
      realStreakDays = cachedSnap.realStreakDays;
    }
    if (totalAnswered < cachedSnap.totalAnswered && cachedSnap.totalAnswered > 0) {
      totalAnswered = cachedSnap.totalAnswered;
      totalCorrect = Math.max(totalCorrect, cachedSnap.totalCorrect);
    }
    if (activeBooksCount === 0 && cachedSnap.activeBooksCount > 0) {
      activeBooksCount = cachedSnap.activeBooksCount;
    }

    if (cachedSnap.booksMap) {
      for (const book of booksSummary) {
        if (sessionKitIds.has(book.kitId) || hydratedKitIds.has(book.kitId)) continue;
        const snapB = cachedSnap.booksMap[book.kitId];
        if (snapB && book.questionsAnswered === 0 && book.level === 1 && book.levelCorrectCount === 0) {
          book.questionsAnswered = snapB.questionsAnswered;
          book.level = snapB.level;
          book.levelCorrectCount = snapB.levelCorrectCount;
          book.smartStudyProgressPercent = snapB.smartStudyProgressPercent;
          if (snapB.accuracy > 0) {
            book.accuracy = snapB.accuracy;
          }
        }
      }
    }
  }

  const overallAccuracy = totalAnswered > 0
    ? Math.round((totalCorrect / totalAnswered) * 1000) / 10
    : (isColdStart ? (cachedSnap?.overallAccuracy || 0) : 0);

  const result: GlobalStats = {
    totalBooks: isColdStart ? Math.max(totalBooks, cachedSnap?.totalBooks || 0) : totalBooks,
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

  if (hasHydratedContent) {
    saveGlobalStatsSnapshot(result, userId, { hasHydratedContent, sessionKitIds });
  }

  return result;
}
