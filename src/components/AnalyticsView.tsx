import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { StudyKit, Question } from '../types';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Flame,
  Award,
  Clock,
  Brain,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Check,
  ChevronRight,
  Target,
  FileCheck2,
  RotateCcw,
  EyeOff,
  Lock,
  Unlock,
  X,
} from 'lucide-react';
import { getBookRealStats, getGlobalRealStats, type BookStats } from '../services/statsService';
import { authService } from '../services/authService';
import { FormattedText } from './FormattedText';
import { QuestionPrompt } from './QuestionPrompt';

interface AnalyticsViewProps {
  currentKit?: StudyKit;
  kits?: StudyKit[];
  onSelectKit?: (kit: StudyKit) => void;
  userId?: string | null;
  onNavigateToSmartStudy?: (kit: StudyKit) => void;
  // Fallback para compatibilidad
  kit?: StudyKit;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  currentKit,
  kits: initialKits,
  onSelectKit,
  userId = null,
  onNavigateToSmartStudy,
  kit: fallbackKit,
}) => {
  // Resolver libro activo y lista de libros
  const effectiveCurrentKit = currentKit || fallbackKit;
  const kits = useMemo(() => {
    if (initialKits && initialKits.length > 0) return initialKits;
    if (effectiveCurrentKit) return [effectiveCurrentKit];
    return [];
  }, [initialKits, effectiveCurrentKit]);

  const [selectedKitId, setSelectedKitId] = useState<string>(
    effectiveCurrentKit?.id || (kits[0]?.id ?? '')
  );

  // Modo de visualización: 'book' (Detalle por Libro) o 'global' (Resumen Global)
  const [viewMode, setViewMode] = useState<'book' | 'global'>('book');

  // Sub-pestaña dentro del detalle del libro: 'topics' (Desglose por Temas), 'history' (Historial de Intentos), 'questions' (Banco de Preguntas)
  const [bookSubTab, setBookSubTab] = useState<'topics' | 'history' | 'questions'>('topics');

  // Filtro de historial
  const [historyFilter, setHistoryFilter] = useState<'all' | 'correct' | 'incorrect'>('all');

  // Preguntas desbloqueadas voluntariamente en el banco de preguntas
  const [revealedIds, setRevealedIds] = useState<string[]>(() => {
    return authService.getRevealedQuestionIds(userId, effectiveCurrentKit?.id || (kits[0]?.id ?? ''));
  });

  // Pregunta pendiente de confirmación en el seguro
  const [questionToUnlock, setQuestionToUnlock] = useState<Question | null>(null);

  // Bloquear el scroll de fondo y permitir cerrar con Escape mientras el modal seguro está abierto
  useEffect(() => {
    if (!questionToUnlock) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuestionToUnlock(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [questionToUnlock]);

  // Filtro del Banco de Preguntas ('all' | 'solved' | 'censored' | 'unlocked')
  const [questionBankFilter, setQuestionBankFilter] = useState<'all' | 'solved' | 'censored' | 'unlocked'>('all');

  // Encontrar el libro seleccionado actualmente
  const activeKit = useMemo(() => {
    const found = kits.find(k => k.id === selectedKitId);
    return found || effectiveCurrentKit || kits[0];
  }, [kits, selectedKitId, effectiveCurrentKit]);

  // Calcular estadísticas reales del libro activo
  const bookStats: BookStats | null = useMemo(() => {
    if (!activeKit) return null;
    return getBookRealStats(activeKit, userId);
  }, [activeKit, userId]);

  // Calcular estadísticas globales de todos los libros
  const globalStats = useMemo(() => {
    return getGlobalRealStats(kits, userId);
  }, [kits, userId]);

  // Sesión en tiempo real del libro activo
  const session = useMemo(() => {
    if (!activeKit) return null;
    return authService.getSmartStudySession(userId, activeKit.id);
  }, [activeKit, userId]);

  const historyItems = useMemo(() => {
    if (!session || !session.history || !Array.isArray(session.history)) return [];
    const items = [...session.history];
    items.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
    if (historyFilter === 'correct') return items.filter(i => i.isCorrect);
    if (historyFilter === 'incorrect') return items.filter(i => !i.isCorrect);
    return items;
  }, [session, historyFilter]);

  // Sincronizar preguntas reveladas al cambiar de libro
  useEffect(() => {
    if (activeKit) {
      setRevealedIds(authService.getRevealedQuestionIds(userId, activeKit.id));
    }
  }, [activeKit, userId]);

  // Conteos calculados del Banco de Preguntas
  const questionBankCounts = useMemo(() => {
    if (!activeKit) return { total: 0, solved: 0, censored: 0, unlocked: 0 };
    let solved = 0;
    let unlocked = 0;
    let censored = 0;

    for (const q of activeKit.questions) {
      const related = session?.history?.filter(h => h.questionId === q.id || h.questionText === q.question) || [];
      if (related.length > 0) {
        solved++;
      } else if (revealedIds.includes(q.id)) {
        unlocked++;
      } else {
        censored++;
      }
    }
    return {
      total: activeKit.questions.length,
      solved,
      censored,
      unlocked,
    };
  }, [activeKit, session, revealedIds]);

  // Preguntas filtradas para el Banco de Preguntas
  const filteredBankQuestions = useMemo(() => {
    if (!activeKit) return [];
    return activeKit.questions.filter(q => {
      const related = session?.history?.filter(h => h.questionId === q.id || h.questionText === q.question) || [];
      const isSolved = related.length > 0;
      const isUnlocked = revealedIds.includes(q.id);

      if (questionBankFilter === 'solved') return isSolved;
      if (questionBankFilter === 'censored') return !isSolved && !isUnlocked;
      if (questionBankFilter === 'unlocked') return !isSolved && isUnlocked;
      return true;
    });
  }, [activeKit, session, revealedIds, questionBankFilter]);

  if (!activeKit || !bookStats) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-400">
        <BookOpen className="w-12 h-12 text-violet-400 mx-auto mb-3" />
        <p className="text-lg font-semibold text-white">No hay libros cargados para mostrar estadísticas.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 animate-fadeIn">
      {/* ── Encabezado Principal y Selector de Modo ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/30">
              MÉTRICAS VERIFICADAS
            </span>
            <span className="text-xs text-slate-400 font-medium">Estadísticas reales basadas en tu actividad y contenido</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-violet-400" />
            <span>Estadísticas de Mis Libros</span>
          </h1>
        </div>

        {/* Selector de Vista: Detalle por Libro vs Resumen Global */}
        <div className="flex items-center p-1 rounded-xl bg-thea-surface border border-thea-border shrink-0 self-start md:self-auto shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('book')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'book'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Detalle por Libro</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('global')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'global'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Resumen Global ({kits.length})</span>
          </button>
        </div>
      </div>

      {/* ── VISTA 1: DETALLE POR LIBRO ──────────────────────────────────────── */}
      {viewMode === 'book' && (
        <div className="space-y-6">
          {/* Selector Horizontal de Libros */}
          {kits.length > 1 && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Seleccionar Libro / Study Kit:
              </span>
              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                {kits.map(k => {
                  const isSelected = k.id === selectedKitId;
                  const kStats = getBookRealStats(k, userId);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => {
                        setSelectedKitId(k.id);
                        if (onSelectKit) onSelectKit(k);
                      }}
                      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border text-left shrink-0 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-r from-violet-600/30 to-indigo-600/20 border-violet-500 shadow-md shadow-violet-950/40 text-white'
                          : 'bg-thea-surface border-thea-border text-slate-400 hover:border-thea-border/80 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${k.color} flex items-center justify-center text-white shrink-0 shadow-xs text-xs font-bold`}>
                        {k.title.charAt(0).toUpperCase()}
                      </div>
                      <div className="max-w-[200px] truncate">
                        <span className="text-xs font-bold block truncate text-slate-100">{k.title}</span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {k.category} • {kStats.questionsAnswered}/{kStats.totalQuestions} resp.
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tarjeta de Resumen del Libro Activo */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950/50 via-thea-surface to-indigo-950/40 border border-thea-border p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${activeKit.color} flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-violet-950/50 shrink-0`}>
                  {activeKit.title.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-violet-600/40 text-violet-200 border border-violet-500/40">
                      {activeKit.category}
                    </span>
                    {bookStats.lastStudiedDate ? (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-violet-400" />
                        Último estudio: {bookStats.lastStudiedDate}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-400/90 font-medium">
                        Sin sesiones de estudio registradas
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">{activeKit.title}</h2>
                </div>
              </div>

              {onNavigateToSmartStudy && (
                <button
                  type="button"
                  onClick={() => onNavigateToSmartStudy(activeKit)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-violet-900/40 cursor-pointer shrink-0 self-stretch sm:self-auto justify-center"
                >
                  <Brain className="w-4 h-4" />
                  <span>Estudiar este Libro</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Micro-métricas estructurales del libro */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-thea-border/60">
              <div className="text-left">
                <span className="text-[11px] text-slate-400 block font-medium">Palabras Analizadas</span>
                <span className="text-sm sm:text-base font-extrabold text-white">
                  {bookStats.wordCount.toLocaleString()}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-slate-400 block font-medium">Fragmentos (Chunks RAG)</span>
                <span className="text-sm sm:text-base font-extrabold text-violet-300">
                  {bookStats.chunksCount}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-slate-400 block font-medium">Imágenes & Figuras</span>
                <span className="text-sm sm:text-base font-extrabold text-pink-300">
                  {bookStats.assetsCount}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-slate-400 block font-medium">Flashcards del Libro</span>
                <span className="text-sm sm:text-base font-extrabold text-amber-300">
                  {bookStats.flashcardsMastered} / {bookStats.flashcardsTotal} dominadas
                </span>
              </div>
            </div>
          </div>

          {/* Cuadrícula de KPIs Reales de Aprendizaje */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* KPI 1: Preguntas Respondidas */}
            <div className="p-4 sm:p-5 rounded-2xl bg-thea-surface border border-thea-border shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-semibold">Preguntas Respondidas</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {bookStats.questionsAnswered}
                <span className="text-xs text-slate-500 font-normal ml-1">/ {bookStats.totalQuestions}</span>
              </div>
              <div className="mt-2 w-full h-1.5 rounded-full bg-thea-bg overflow-hidden border border-thea-border/40">
                <div
                  style={{
                    width: `${bookStats.totalQuestions > 0 ? Math.min(100, Math.round((bookStats.questionsAnswered / bookStats.totalQuestions) * 100)) : 0}%`
                  }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1.5 block">
                {bookStats.totalQuestions > 0
                  ? `${Math.round((bookStats.questionsAnswered / bookStats.totalQuestions) * 100)}% del banco cubierto`
                  : 'Sin preguntas'}
              </span>
            </div>

            {/* KPI 2: Precisión Promedio Real */}
            <div className="p-4 sm:p-5 rounded-2xl bg-thea-surface border border-thea-border shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-semibold">Precisión Real</span>
                <Award className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400">
                {bookStats.questionsAnswered > 0 ? `${bookStats.accuracy}%` : '—'}
              </div>
              <div className="mt-2 w-full h-1.5 rounded-full bg-thea-bg overflow-hidden border border-thea-border/40">
                <div
                  style={{ width: `${bookStats.accuracy}%` }}
                  className="h-full bg-amber-400 rounded-full"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1.5 block">
                {bookStats.questionsAnswered > 0
                  ? `${bookStats.correctAnswers} aciertos de ${bookStats.questionsAnswered}`
                  : 'Aún no evaluado'}
              </span>
            </div>

            {/* KPI 3: Nivel Socrático Alcanzado */}
            <div className="p-4 sm:p-5 rounded-2xl bg-thea-surface border border-thea-border shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-semibold">Nivel Pedagógico</span>
                <Brain className="w-4 h-4 text-violet-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-violet-300">
                Nivel {bookStats.level}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block font-medium truncate">
                {bookStats.levelName}
              </span>
              <span className="text-[10px] text-violet-400 mt-0.5 block">
                {bookStats.level === 1 && 'Fundamentos y definiciones'}
                {bookStats.level === 2 && 'Análisis y comparaciones'}
                {bookStats.level === 3 && 'Casos prácticos de examen'}
              </span>
            </div>

            {/* KPI 4: Errores Reforzados */}
            <div className="p-4 sm:p-5 rounded-2xl bg-thea-surface border border-thea-border shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-semibold">Refuerzo Socrático</span>
                <RotateCcw className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-cyan-300">
                {bookStats.errorsReinforced}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block font-medium">
                Conceptos recuperados
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Verificados tras fallos previos
              </span>
            </div>
          </div>

          {/* Sub-Navegación del Libro: Temas Reales | Historial de Intentos | Banco de Preguntas */}
          <div className="flex items-center gap-2 border-b border-thea-border pb-3">
            <button
              type="button"
              onClick={() => setBookSubTab('topics')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                bookSubTab === 'topics'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-thea-surface border border-thea-border text-slate-400 hover:text-white'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Desglose por Temas Reales ({bookStats.topicsMastery.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setBookSubTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                bookSubTab === 'history'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-thea-surface border border-thea-border text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Historial de Respuestas ({bookStats.historyCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setBookSubTab('questions')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                bookSubTab === 'questions'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-thea-surface border border-thea-border text-slate-400 hover:text-white'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Banco de Preguntas ({bookStats.totalQuestions})</span>
            </button>
          </div>

          {/* ── SUB-PESTAÑA 1: DESGLOSE POR TEMAS REALES DEL LIBRO ─────────────── */}
          {bookSubTab === 'topics' && (
            <div className="bg-thea-surface border border-thea-border rounded-3xl p-5 sm:p-7 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-thea-border gap-2">
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-violet-400" />
                    <span>Dominio por Área de Conocimiento del Libro</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mapeo de retención calculado exclusivamente sobre los capítulos y temas presentes en este libro.
                  </p>
                </div>
                <span className="text-xs text-violet-300 font-semibold px-2.5 py-1 rounded-lg bg-violet-950/40 border border-violet-500/30 self-start sm:self-auto">
                  {bookStats.topicsMastery.length} Temas Identificados
                </span>
              </div>

              {bookStats.topicsMastery.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">No se encontraron temas categorizados en este material.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bookStats.topicsMastery.map((item, idx) => {
                    const isUnstarted = item.attempts === 0;
                    const isMastered = item.status === 'mastered';
                    const isNeedsReview = item.status === 'needs-review';

                    return (
                      <div
                        key={idx}
                        className="p-3.5 sm:p-4 rounded-2xl bg-thea-bg/70 border border-thea-border/80 hover:border-violet-500/40 transition-all space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">{item.topic}</span>
                            {/* Badges de estado */}
                            {isUnstarted && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-medium border border-slate-700">
                                Sin practicar
                              </span>
                            )}
                            {isMastered && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-300 font-semibold border border-emerald-500/30">
                                Dominado
                              </span>
                            )}
                            {isNeedsReview && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-300 font-semibold border border-rose-500/30">
                                Requiere refuerzo
                              </span>
                            )}
                            {item.status === 'in-progress' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-950/60 text-amber-300 font-semibold border border-amber-500/30">
                                En progreso
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                            {isUnstarted ? (
                              <span>{item.totalQuestions} preguntas en el banco</span>
                            ) : (
                              <span>
                                {item.correct}/{item.attempts} correctas ({item.accuracy}%)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Barra de progreso */}
                        <div className="w-full h-2 rounded-full bg-thea-surface overflow-hidden border border-thea-border/60">
                          {isUnstarted ? (
                            <div className="h-full w-0" />
                          ) : (
                            <div
                              style={{ width: `${item.accuracy}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isMastered
                                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                  : isNeedsReview
                                  ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                                  : 'bg-gradient-to-r from-violet-600 to-amber-400'
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── SUB-PESTAÑA 2: HISTORIAL DE RESPUESTAS DEL USUARIO ─────────────── */}
          {bookSubTab === 'history' && (
            <div className="bg-thea-surface border border-thea-border rounded-3xl p-5 sm:p-7 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-thea-border gap-3">
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg">
                    Historial Real de Intentos
                  </h3>
                  <p className="text-xs text-slate-400">
                    Registro cronológico verificado de cada respuesta dada en las sesiones de Smart Study.
                  </p>
                </div>

                {/* Filtro de aciertos / fallos */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-thea-bg border border-thea-border text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      historyFilter === 'all' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todas ({session?.history?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('correct')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      historyFilter === 'correct' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Correctas ({session?.history?.filter(h => h.isCorrect).length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('incorrect')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      historyFilter === 'incorrect' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Fallidas ({session?.history?.filter(h => !h.isCorrect).length || 0})
                  </button>
                </div>
              </div>

              {historyItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">
                    No hay intentos registrados con el filtro seleccionado.
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Inicia una sesión de Smart Study en este libro para registrar tu desempeño y tasa de acierto real.
                  </p>
                  {onNavigateToSmartStudy && (
                    <button
                      type="button"
                      onClick={() => onNavigateToSmartStudy(activeKit)}
                      className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Comenzar Smart Study Ahora</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-thea-border/60">
                  {historyItems.map((item, idx) => (
                    <div key={item.id || idx} className="py-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[11px] font-bold text-violet-400 px-2 py-0.5 rounded bg-violet-950/40 border border-violet-500/20">
                              {item.topic || 'General'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Nivel {item.level || 1} • {item.difficulty || 'media'}
                            </span>
                            {item.timestamp && (
                              <span className="text-[10px] text-slate-500">
                                {new Date(item.timestamp).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                          </div>
                          <div className="text-sm">
                            <QuestionPrompt text={item.questionText} topic={item.topic} inlineOnly={true} />
                          </div>
                        </div>

                        <span
                          className={`text-xs px-2.5 py-1 rounded-lg shrink-0 font-bold flex items-center gap-1 ${
                            item.isCorrect
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {item.isCorrect ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {item.isCorrect ? 'Correcta' : 'Fallida'}
                        </span>
                      </div>

                      {/* Explicación y respuesta del usuario */}
                      <div className="p-3 rounded-xl bg-thea-bg/60 border border-thea-border/60 text-xs space-y-1">
                        <div className="text-slate-400">
                          <strong className="text-slate-300">Tu respuesta:</strong> {item.userAnswer || 'No especificada'}
                        </div>
                        {!item.isCorrect && item.correctAnswer && (
                          <div className="text-emerald-400">
                            <strong className="text-emerald-300">Respuesta correcta:</strong> {item.correctAnswer}
                          </div>
                        )}
                        {item.explanation && (
                          <div className="text-slate-300 mt-1.5 pt-1.5 border-t border-thea-border/40">
                            <FormattedText text={item.explanation} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SUB-PESTAÑA 3: BANCO DE PREGUNTAS DEL LIBRO ───────────────────── */}
          {bookSubTab === 'questions' && (
            <div className="bg-thea-surface border border-thea-border rounded-3xl p-5 sm:p-7 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-thea-border gap-3">
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-violet-400" />
                    <span>Banco de Preguntas del Libro</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Solo se muestran nítidas las preguntas ya resueltas. Las demás se muestran censuradas para preservar el reto académico.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-emerald-300 font-semibold px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                    {questionBankCounts.solved} Resueltas
                  </span>
                  <span className="text-xs text-amber-300 font-semibold px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30">
                    {questionBankCounts.censored} Censuradas
                  </span>
                  {questionBankCounts.unlocked > 0 && (
                    <span className="text-xs text-violet-300 font-semibold px-2.5 py-1 rounded-lg bg-violet-950/40 border border-violet-500/30">
                      {questionBankCounts.unlocked} Reveladas
                    </span>
                  )}
                </div>
              </div>

              {/* Filtros de Estado del Banco */}
              <div className="flex items-center gap-2 mb-6 pb-2 overflow-x-auto text-xs">
                <button
                  type="button"
                  onClick={() => setQuestionBankFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    questionBankFilter === 'all'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-thea-bg border border-thea-border text-slate-400 hover:text-white'
                  }`}
                >
                  Todas ({questionBankCounts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionBankFilter('solved')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    questionBankFilter === 'solved'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-thea-bg border border-thea-border text-slate-400 hover:text-white'
                  }`}
                >
                  Ya Resueltas ({questionBankCounts.solved})
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionBankFilter('censored')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    questionBankFilter === 'censored'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-thea-bg border border-thea-border text-slate-400 hover:text-white'
                  }`}
                >
                  Censuradas ({questionBankCounts.censored})
                </button>
                {questionBankCounts.unlocked > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuestionBankFilter('unlocked')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                      questionBankFilter === 'unlocked'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-thea-bg border border-thea-border text-slate-400 hover:text-white'
                    }`}
                  >
                    Reveladas ({questionBankCounts.unlocked})
                  </button>
                )}
              </div>

              {filteredBankQuestions.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">No hay preguntas que coincidan con este filtro.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBankQuestions.map((q, idx) => {
                    const relatedHistory = session?.history?.filter(h => h.questionId === q.id || h.questionText === q.question) || [];
                    const lastAttempt = relatedHistory.length > 0 ? relatedHistory[relatedHistory.length - 1] : null;
                    const isSolved = Boolean(lastAttempt);
                    const isRevealed = revealedIds.includes(q.id);
                    const isUnlocked = isSolved || isRevealed;

                    return (
                      <div
                        key={q.id || idx}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                          isSolved
                            ? 'bg-thea-bg/40 border-thea-border/80 hover:border-violet-500/40'
                            : isRevealed
                            ? 'bg-amber-950/15 border-amber-500/30 shadow-xs'
                            : 'bg-thea-bg/70 border-thea-border/60 hover:border-amber-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-violet-300 px-2.5 py-0.5 rounded-md bg-violet-950/60 border border-violet-500/30">
                              {q.topic || 'General'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Dificultad: {q.difficulty === 'easy' ? 'Fácil' : q.difficulty === 'medium' ? 'Intermedio' : 'Difícil'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Tipo: {q.type || 'multiple-choice'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isSolved ? (
                              <span
                                className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 ${
                                  lastAttempt?.isCorrect
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                    : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                                }`}
                              >
                                {lastAttempt?.isCorrect ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Dominada</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Por Reforzar</span>
                                  </>
                                )}
                              </span>
                            ) : isRevealed ? (
                              <span className="text-[11px] px-2.5 py-1 rounded-lg font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <Unlock className="w-3.5 h-3.5 text-amber-400" />
                                <span>Revelada en banco (no suma avance)</span>
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-slate-900/80 text-slate-400 border border-thea-border/80 flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-slate-500" />
                                  <span>Censurada</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQuestionToUnlock(q)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                                  title="Presiona el ojo de censura para ver la pregunta aún no resuelta"
                                >
                                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Revelar</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Enunciado de la Pregunta */}
                        {isUnlocked ? (
                          <div className="text-sm leading-relaxed mt-2">
                            <QuestionPrompt text={q.question} topic={q.topic} inlineOnly={true} />
                          </div>
                        ) : (
                          /* Efecto desenfoque blur moderno con texto velado */
                          <div className="relative mt-2 p-2 rounded-xl bg-black/20 overflow-hidden group">
                            <div className="filter blur-sm select-none opacity-30 pointer-events-none transition-all duration-300 text-sm">
                              <QuestionPrompt text={q.question} topic={q.topic} inlineOnly={true} />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
                              <button
                                type="button"
                                onClick={() => setQuestionToUnlock(q)}
                                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#1b113b] hover:bg-[#251752] border border-amber-500/40 text-amber-300 text-xs font-bold shadow-lg transition-all cursor-pointer transform hover:scale-105"
                              >
                                <EyeOff className="w-4 h-4 text-amber-400" />
                                <span>Pregunta no resuelta censurada • Clic para desbloquear</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Solución y Respuesta (para resueltas o desbloqueadas por el usuario) */}
                        {isUnlocked && (
                          <div className="mt-3 p-3.5 rounded-xl bg-violet-950/25 border border-violet-500/20 text-xs space-y-1.5 animate-fadeIn">
                            <div className="flex items-start gap-1.5 font-bold text-emerald-300">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="mr-1">Respuesta Correcta:</span>
                                <span className="text-slate-100 font-normal">
                                  {q.type === 'true-false'
                                    ? (q.correctIndex === 0 ? 'Verdadero' : 'Falso')
                                    : q.type === 'matching' && q.matchingPairs
                                    ? q.matchingPairs.map(p => `${p.term} → ${p.definition}`).join(' | ')
                                    : q.type === 'drag-drop' && q.blanksCorrect
                                    ? q.blanksCorrect.join(', ')
                                    : (q.options?.[q.correctIndex || 0] || 'Opción correcta')}
                                </span>
                              </div>
                            </div>

                            {q.explanation && (
                              <div className="text-[11px] text-slate-300 leading-relaxed border-t border-violet-500/15 pt-1.5">
                                <strong className="text-violet-300">Fundamentación Pedagógica:</strong>{' '}
                                <FormattedText text={q.explanation} inlineOnly={true} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── VISTA 2: RESUMEN GLOBAL DE TODOS MIS LIBROS ─────────────────────── */}
      {viewMode === 'global' && (
        <div className="space-y-6">
          {/* Banner de KPIs Globales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1">Libros Totales</span>
              <div className="text-2xl font-black text-white">{globalStats.totalBooks}</div>
              <span className="text-[10px] text-violet-400 font-medium">En biblioteca</span>
            </div>

            <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1">Racha Real</span>
              <div className="text-2xl font-black text-orange-400 flex items-center gap-1">
                <Flame className="w-5 h-5 fill-orange-500" />
                <span>{globalStats.realStreakDays} {globalStats.realStreakDays === 1 ? 'día' : 'días'}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Actividad continua</span>
            </div>

            <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1">Preguntas Globales</span>
              <div className="text-2xl font-black text-white">{globalStats.totalQuestions}</div>
              <span className="text-[10px] text-emerald-400 font-medium">{globalStats.totalAnswered} respondidas</span>
            </div>

            <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1">Precisión General</span>
              <div className="text-2xl font-black text-amber-400">
                {globalStats.totalAnswered > 0 ? `${globalStats.overallAccuracy}%` : '—'}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{globalStats.totalCorrect} aciertos</span>
            </div>

            <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1">Flashcards Dominadas</span>
              <div className="text-2xl font-black text-pink-300">
                {globalStats.totalFlashcardsMastered}
                <span className="text-xs text-slate-500 font-normal ml-1">/ {globalStats.totalFlashcards}</span>
              </div>
              <span className="text-[10px] text-pink-400 font-medium">Memorización activa</span>
            </div>

            <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border">
              <span className="text-[11px] text-slate-400 font-semibold block mb-1">Palabras Analizadas</span>
              <div className="text-2xl font-black text-cyan-300">
                {globalStats.totalWords > 1000 ? `${Math.round(globalStats.totalWords / 1000)}k` : globalStats.totalWords}
              </div>
              <span className="text-[10px] text-cyan-400 font-medium">{globalStats.totalAssets} imágenes RAG</span>
            </div>
          </div>

          {/* Tabla Comparativa de Todos los Libros */}
          <div className="bg-thea-surface border border-thea-border rounded-3xl p-5 sm:p-7 shadow-xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-thea-border">
              <div>
                <h3 className="font-bold text-white text-base sm:text-lg">
                  Tabla Comparativa de Libros y Materias
                </h3>
                <p className="text-xs text-slate-400">
                  Desempeño y volumen de contenido real para cada uno de tus libros.
                </p>
              </div>
              <span className="text-xs text-violet-300 font-semibold px-2.5 py-1 rounded-lg bg-violet-950/40 border border-violet-500/30">
                {globalStats.booksSummary.length} Libros
              </span>
            </div>

            <div className="space-y-3">
              {globalStats.booksSummary.map((b) => (
                <div
                  key={b.kitId}
                  className="p-4 sm:p-5 rounded-2xl bg-thea-bg/70 border border-thea-border/80 hover:border-violet-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${b.color} flex items-center justify-center text-white font-bold shrink-0 shadow-sm`}>
                      {b.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-thea-surface border border-thea-border text-slate-300">
                          {b.category}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {b.totalQuestions} preguntas • {b.flashcardsTotal} cards
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white truncate">{b.title}</h4>
                    </div>
                  </div>

                  {/* Estadísticas de avance */}
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0 justify-between md:justify-end">
                    <div className="text-left md:text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Respondidas</span>
                      <span className="text-xs sm:text-sm font-extrabold text-white">
                        {b.questionsAnswered} / {b.totalQuestions}
                      </span>
                    </div>

                    <div className="text-left md:text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Precisión</span>
                      <span className="text-xs sm:text-sm font-extrabold text-amber-400">
                        {b.questionsAnswered > 0 ? `${b.accuracy}%` : '—'}
                      </span>
                    </div>

                    <div className="text-left md:text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Nivel</span>
                      <span className="text-xs sm:text-sm font-extrabold text-violet-300">
                        Nivel {b.level}
                      </span>
                    </div>

                    {/* Botón para ver detalle del libro */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKitId(b.kitId);
                        const targetKit = kits.find(k => k.id === b.kitId);
                        if (targetKit && onSelectKit) onSelectKit(targetKit);
                        setViewMode('book');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Ver Métricas</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SEGURO: CONFIRMAR VER PREGUNTA NO RESUELTA ──────────────── */}
      {questionToUnlock &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
            onClick={(e) => {
              if (e.target === e.currentTarget) setQuestionToUnlock(null);
            }}
          >
            <div className="bg-[#181138] border border-amber-500/50 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative text-center">
              <button
                type="button"
                onClick={() => setQuestionToUnlock(null)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border transition-colors cursor-pointer"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-amber-400 shadow-inner">
                <EyeOff className="w-7 h-7" />
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 leading-snug">
                ¿Seguro que quieres ver la pregunta que aún no has resuelto?
              </h3>

              <p className="text-xs sm:text-sm text-amber-200/90 bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 mb-6 leading-relaxed font-medium">
                (no sumará porcentaje de avance al progreso)
              </p>

              <div className="text-left bg-thea-surface/80 border border-thea-border/80 rounded-xl p-3.5 mb-6 text-xs text-slate-300 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-400">Tema:</span>
                  <span className="text-violet-300 font-semibold">{questionToUnlock.topic || 'General'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-400">Dificultad:</span>
                  <span className="text-slate-200 capitalize">
                    {questionToUnlock.difficulty === 'easy' ? 'Fácil' : questionToUnlock.difficulty === 'medium' ? 'Intermedio' : 'Difícil'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuestionToUnlock(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 font-bold text-xs sm:text-sm transition-all cursor-pointer"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    authService.markQuestionAsRevealed(userId, activeKit.id, questionToUnlock.id);
                    setRevealedIds(prev => [...prev, questionToUnlock.id]);
                    setQuestionToUnlock(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-900/30 transition-all cursor-pointer"
                >
                  Sí
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
