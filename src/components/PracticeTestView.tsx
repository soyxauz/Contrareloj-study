import React, { useState, useEffect } from 'react';
import type { StudyKit, Question, ShortAnswerEvaluation } from '../types';
import { QuestionPrompt } from './QuestionPrompt';
import {
  FileCheck2,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Flag,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Award,
  Loader2,
  CheckCheck,
} from 'lucide-react';
import { generateSpecializedExamQuestions, evaluateShortAnswer } from '../services/aiService';
import confetti from 'canvas-confetti';

interface PracticeTestViewProps {
  kit: StudyKit;
}

export const PracticeTestView: React.FC<PracticeTestViewProps> = ({ kit }) => {
  const [testState, setTestState] = useState<'config' | 'taking' | 'results'>('config');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [customInstructions, setCustomInstructions] = useState<string>(
    'Enfócate en preguntas de razonamiento crítico, trampas conceptuales y aplicaciones especializadas de examen'
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(15);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15 * 60);
  const [formatPreference, setFormatPreference] = useState<'all' | 'multiple-choice' | 'short-answer'>('all');

  const [activeTestQuestions, setActiveTestQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number | string>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});

  // Estados de generación y evaluación especializada
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [isEvaluatingAnswers, setIsEvaluatingAnswers] = useState(false);
  const [shortAnswerEvals, setShortAnswerEvals] = useState<Record<number, ShortAnswerEvaluation>>({});
  const [manualOverrides, setManualOverrides] = useState<Record<number, boolean>>({});

  // Temporizador de cuenta regresiva
  useEffect(() => {
    let timer: any;
    if (testState === 'taking' && secondsRemaining > 0) {
      timer = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            handleFinishTest();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [testState, secondsRemaining]);

  const handleStartTest = async () => {
    setIsGeneratingTest(true);
    try {
      const generated = await generateSpecializedExamQuestions(
        kit.sourceText || kit.description,
        questionCount,
        kit.category || 'General',
        customInstructions,
        formatPreference,
        kit.chunks
      );

      setActiveTestQuestions(generated);
      setUserAnswers({});
      setFlagged({});
      setShortAnswerEvals({});
      setManualOverrides({});
      setCurrentIdx(0);
      setSecondsRemaining(timeLimitMinutes * 60);
      setTestState('taking');
    } catch (err) {
      console.warn('[PracticeTestView] Error al generar examen especializado:', err);
      // Fallback con las preguntas existentes del kit
      const pool = kit.questions.filter(q => q.options && q.options.length > 0);
      const effectivePool = pool.length > 0 ? pool : kit.questions;
      const fallbackList: Question[] = [];
      for (let i = 0; i < questionCount; i++) {
        const base = effectivePool[i % effectivePool.length];
        const isShort = formatPreference === 'short-answer' || (formatPreference === 'all' && i % 2 === 1);
        fallbackList.push({
          ...base,
          id: `test-q-${i + 1}`,
          type: isShort ? 'short-answer' : 'multiple-choice',
          question: i >= effectivePool.length ? `[Variación ${i + 1}] ${base.question}` : base.question,
          options: isShort ? undefined : base.options || ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
          correctIndex: isShort ? undefined : base.correctIndex ?? 0,
          idealAnswer: isShort ? (base.options ? base.options[base.correctIndex ?? 0] : base.explanation) : undefined,
          rubric: isShort ? 'Evaluar precisión del concepto nuclear.' : undefined,
          acceptableAnswers: isShort && base.options ? [base.options[base.correctIndex ?? 0]] : undefined,
        });
      }
      setActiveTestQuestions(fallbackList);
      setUserAnswers({});
      setFlagged({});
      setShortAnswerEvals({});
      setManualOverrides({});
      setCurrentIdx(0);
      setSecondsRemaining(timeLimitMinutes * 60);
      setTestState('taking');
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const handleFinishTest = async () => {
    setIsEvaluatingAnswers(true);
    const evals: Record<number, ShortAnswerEvaluation> = {};

    try {
      const evaluationPromises = activeTestQuestions.map(async (q, idx) => {
        if (q.type === 'short-answer') {
          const studentAns = String(userAnswers[idx] || '');
          const ideal = q.idealAnswer || q.explanation || '';
          const ev = await evaluateShortAnswer(
            studentAns,
            ideal,
            q.question,
            q.rubric,
            q.acceptableAnswers
          );
          evals[idx] = ev;
        }
      });

      await Promise.all(evaluationPromises);
      setShortAnswerEvals(evals);
    } catch (err) {
      console.warn('[handleFinishTest] Error evaluando respuestas abiertas:', err);
    } finally {
      setIsEvaluatingAnswers(false);
      setTestState('results');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  };

  const isQuestionCorrect = (q: Question, idx: number): boolean => {
    if (manualOverrides[idx] === true) return true;
    if (q.type === 'short-answer') {
      const ev = shortAnswerEvals[idx];
      return Boolean(ev && ev.isCorrect);
    }
    const userChoice = userAnswers[idx];
    const targetIdx = Number(q.correctIndex ?? 0);
    return userChoice !== undefined && Number(userChoice) === targetIdx;
  };

  // Cálculo de puntaje
  const correctCount = activeTestQuestions.filter((q, idx) => isQuestionCorrect(q, idx)).length;
  const scorePercent = Math.round((correctCount / (activeTestQuestions.length || 1)) * 100);

  const currentQ = activeTestQuestions[currentIdx];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Encabezado del Simulador */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white">
              SIMULADOR ESPECIALIZADO
            </span>
            <span className="text-xs text-slate-400 font-medium">
              Rama académica: {kit.category || 'General'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-violet-400" />
            <span>Simulador de Pruebas & Exámenes</span>
          </h1>
        </div>
      </div>

      {/* ── 1. CONFIGURACIÓN DEL EXAMEN ────────────────────────────────────────── */}
      {testState === 'config' && (
        <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Configurar Nuevo Examen Académico</h3>
            <p className="text-xs sm:text-sm text-slate-400">
              La IA generará un examen riguroso adaptado a la disciplina y contenidos específicos de tu documento.
            </p>
          </div>

          {/* Formato de Preguntas */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Formato de Preguntas:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setFormatPreference('all')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  formatPreference === 'all'
                    ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-900/30'
                    : 'bg-thea-surfaceLight border-thea-border text-slate-300 hover:border-violet-400'
                }`}
              >
                <div className="text-xs font-bold mb-0.5">Formato Mixto</div>
                <div className="text-[11px] opacity-80">Opción Múltiple + Abiertas Cortas</div>
              </button>
              <button
                type="button"
                onClick={() => setFormatPreference('multiple-choice')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  formatPreference === 'multiple-choice'
                    ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-900/30'
                    : 'bg-thea-surfaceLight border-thea-border text-slate-300 hover:border-violet-400'
                }`}
              >
                <div className="text-xs font-bold mb-0.5">Solo Opción Múltiple</div>
                <div className="text-[11px] opacity-80">4 alternativas con discriminación fina</div>
              </button>
              <button
                type="button"
                onClick={() => setFormatPreference('short-answer')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  formatPreference === 'short-answer'
                    ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-900/30'
                    : 'bg-thea-surfaceLight border-thea-border text-slate-300 hover:border-violet-400'
                }`}
              >
                <div className="text-xs font-bold mb-0.5">Respuestas Abiertas Cortas</div>
                <div className="text-[11px] opacity-80">Evaluación conceptual con IA</div>
              </button>
            </div>
          </div>

          {/* Número de Preguntas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Número de Preguntas:
              </label>
            </div>
            <div className="grid grid-cols-5 gap-2.5">
              {[5, 10, 20, 30, 50].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`py-3 rounded-2xl border text-sm font-bold transition-all ${
                    questionCount === count
                      ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-900/30'
                      : 'bg-thea-surfaceLight border-thea-border text-slate-300 hover:border-violet-400'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Instrucciones Personalizadas */}
          <div className="p-5 rounded-2xl bg-thea-surfaceLight border border-thea-border">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Instrucciones Pedagógicas de Examen:
              </label>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Guía a la IA sobre el enfoque específico de tu examen (ej. "enfócate en diagnóstico diferencial", "simula preguntas de oposición o certificación", "incluye supuestos prácticos").
            </p>
            <input
              type="text"
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              className="w-full bg-thea-bg border border-thea-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Límite de Tiempo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Límite de Tiempo:
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {[5, 10, 15, 30].map(min => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setTimeLimitMinutes(min)}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    timeLimitMinutes === min
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-thea-surfaceLight border-thea-border text-slate-300 hover:border-indigo-400'
                  }`}
                >
                  {min} minutos
                </button>
              ))}
            </div>
          </div>

          {/* Botón de Inicio */}
          <div className="pt-4">
            <button
              onClick={handleStartTest}
              disabled={isGeneratingTest}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-amber-500 hover:scale-[1.01] transition-all text-white font-extrabold text-base shadow-xl shadow-violet-900/40 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingTest ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-amber-300" />
                  <span>Diseñando Examen Académico con IA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  <span>Comenzar Examen ({questionCount} preguntas)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── 2. REALIZACIÓN DEL EXAMEN ─────────────────────────────────────────── */}
      {testState === 'taking' && currentQ && (
        <div className="space-y-6">
          {/* Barra superior con cronómetro y progreso */}
          <div className="bg-thea-surface border border-thea-border rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-white">
                Pregunta {currentIdx + 1} de {activeTestQuestions.length}
              </span>
              <button
                onClick={() => setFlagged(prev => ({ ...prev, [currentIdx]: !prev[currentIdx] }))}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  flagged[currentIdx]
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-white'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{flagged[currentIdx] ? 'Marcada para revisar' : 'Marcar'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>
                {Math.floor(secondsRemaining / 60)}:
                {(secondsRemaining % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Tarjeta de la Pregunta */}
          <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-violet-950/60 border border-violet-500/30 text-violet-300">
                {currentQ.type === 'short-answer' ? 'Pregunta Abierta Corta' : 'Opción Múltiple'}
              </span>
              {currentQ.topic && (
                <span className="text-[11px] text-slate-400">
                  {currentQ.topic}
                </span>
              )}
            </div>

            <QuestionPrompt
              as="h3"
              text={currentQ.question || ''}
              topic={currentQ.topic}
              className="text-lg sm:text-xl mb-6 leading-relaxed text-white font-medium"
            />

            {/* Renderizado condicional según el tipo de pregunta */}
            {currentQ.type === 'short-answer' ? (
              <div className="space-y-4 mb-8">
                <div className="p-4 rounded-2xl bg-thea-surfaceLight/50 border border-thea-border">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Tu Respuesta Técnica / Explicación:
                  </label>
                  <textarea
                    rows={4}
                    value={String(userAnswers[currentIdx] || '')}
                    onChange={e => setUserAnswers(prev => ({ ...prev, [currentIdx]: e.target.value }))}
                    placeholder="Escribe tu respuesta de forma precisa (2 a 4 oraciones). La IA evaluará la similitud conceptual con el modelo..."
                    className="w-full bg-thea-bg border border-thea-border rounded-xl p-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-y"
                  />
                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                    <span>Sé conciso e incluye términos clave relevantes.</span>
                    <span>{String(userAnswers[currentIdx] || '').trim().split(/\s+/).filter(Boolean).length} palabras</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-8">
                {(currentQ.options || []).map((option, optIdx) => (
                  <button
                    key={optIdx}
                    onClick={() => setUserAnswers(prev => ({ ...prev, [currentIdx]: optIdx }))}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer ${
                      userAnswers[currentIdx] === optIdx
                        ? 'border-violet-500 bg-violet-950/40 text-white ring-2 ring-violet-500/30'
                        : 'border-thea-border bg-thea-surfaceLight/60 text-slate-300 hover:border-violet-500/40'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        userAnswers[currentIdx] === optIdx
                          ? 'bg-violet-600 text-white'
                          : 'bg-thea-surface border border-thea-border text-slate-400'
                      }`}
                    >
                      {String.fromCharCode(65 + optIdx)}
                    </div>
                    <span className="font-medium text-sm sm:text-base">{option}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Controles de Navegación */}
            <div className="flex items-center justify-between pt-4 border-t border-thea-border">
              <button
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(prev => prev - 1)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              {currentIdx < activeTestQuestions.length - 1 ? (
                <button
                  onClick={() => setCurrentIdx(prev => prev + 1)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md shadow-violet-900/30 cursor-pointer"
                >
                  <span>Siguiente</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleFinishTest}
                  disabled={isEvaluatingAnswers}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-900/40 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isEvaluatingAnswers ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Evaluando con IA...</span>
                    </>
                  ) : (
                    <span>Finalizar y Calificar</span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Navegador rápido de preguntas */}
          <div className="flex flex-wrap gap-2 justify-center p-4 bg-thea-surface rounded-2xl border border-thea-border">
            {activeTestQuestions.map((_, idx) => {
              const isAnswered = userAnswers[idx] !== undefined && String(userAnswers[idx]).trim() !== '';
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIdx(idx)}
                  className={`w-8 h-8 rounded-xl font-bold text-xs transition-all relative cursor-pointer ${
                    currentIdx === idx ? 'ring-2 ring-white scale-110 z-10' : ''
                  } ${
                    isAnswered
                      ? 'bg-violet-600 text-white'
                      : 'bg-thea-surfaceLight border border-thea-border text-slate-400'
                  }`}
                >
                  {idx + 1}
                  {flagged[idx] && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-1 ring-thea-bg" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. PANTALLA DE RESULTADOS Y EVALUACIÓN DE LA IA ────────────────────── */}
      {testState === 'results' && (
        <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-fadeIn">
          {/* Resumen del Examen */}
          <div className="text-center py-4">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-rose-500 p-0.5 mx-auto mb-4 shadow-xl shadow-amber-500/20">
              <div className="w-full h-full bg-thea-bg rounded-[22px] flex items-center justify-center">
                <Award className="w-10 h-10 text-amber-400" />
              </div>
            </div>

            <h2 className="text-3xl font-extrabold text-white mb-1">¡Examen Académico Completado!</h2>
            <p className="text-sm text-slate-400 mb-6">
              Has respondido correctamente <span className="text-emerald-400 font-bold">{correctCount}</span> de{' '}
              <span className="text-white font-bold">{activeTestQuestions.length}</span> preguntas.
            </p>

            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-thea-surfaceLight border border-thea-border text-2xl font-black text-amber-300">
              <span>Puntaje: {scorePercent}%</span>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                {scorePercent >= 80 ? 'EXCELENTE (A+)' : scorePercent >= 60 ? 'APROBADO (B)' : 'NECESITA REPASO'}
              </span>
            </div>
          </div>

          {/* Botón para nuevo test */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setTestState('config')}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm shadow-lg shadow-violet-900/40 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Configurar Nuevo Test</span>
            </button>
          </div>

          {/* Revisión Detallada con Retroalimentación de IA */}
          <div className="space-y-4 pt-6 border-t border-thea-border">
            <h3 className="font-bold text-lg text-white">Revisión de Preguntas y Evaluación de IA:</h3>
            {activeTestQuestions.map((q, idx) => {
              const correct = isQuestionCorrect(q, idx);
              const userChoice = userAnswers[idx];
              const isOverridden = manualOverrides[idx] === true;
              const shortEval = shortAnswerEvals[idx];

              return (
                <div
                  key={idx}
                  className={`p-5 rounded-2xl border transition-all ${
                    correct
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-400">Pregunta {idx + 1}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-thea-surface border border-thea-border text-slate-300">
                        {q.type === 'short-answer' ? 'Abierta Corta' : 'Opción Múltiple'}
                      </span>
                      {isOverridden && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" />
                          ¡Tenía razón! (Aprobada por el estudiante)
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-bold flex items-center gap-1 ${
                        correct ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {correct ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {correct ? 'Correcta' : 'Incorrecta'}
                    </span>
                  </div>

                  <QuestionPrompt as="h4" text={q.question} topic={q.topic} className="text-sm sm:text-base mb-3" />

                  {/* Detalle para Preguntas Abiertas Cortas */}
                  {q.type === 'short-answer' ? (
                    <div className="space-y-3 mb-3">
                      {/* Similitud conceptual badge */}
                      {shortEval && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-300">Similitud Conceptual:</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                              shortEval.similarity >= 65
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            {shortEval.similarity}%
                          </span>
                        </div>
                      )}

                      <div className="text-xs space-y-1.5 p-3 rounded-xl bg-thea-surface border border-thea-border">
                        <div>
                          <span className="font-semibold text-slate-400 block mb-0.5">Tu respuesta escrita:</span>
                          <span className="text-white font-medium">
                            {userChoice ? String(userChoice) : 'Sin responder'}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-thea-border/60">
                          <span className="font-semibold text-emerald-400 block mb-0.5">
                            Respuesta modelo esperada:
                          </span>
                          <span className="text-emerald-200">
                            {q.idealAnswer || q.explanation}
                          </span>
                        </div>
                      </div>

                      {/* Retroalimentación de la IA y puntos clave */}
                      {shortEval && (
                        <div className="text-xs p-3 rounded-xl bg-violet-950/25 border border-violet-500/30 space-y-2">
                          {shortEval.feedback && (
                            <p className="text-violet-200 leading-relaxed">
                              <strong>Evaluación de la IA:</strong> {shortEval.feedback}
                            </p>
                          )}
                          {shortEval.keyPointsCovered.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-400 text-[11px]">Puntos cubiertos:</span>
                              {shortEval.keyPointsCovered.map((kp, kIdx) => (
                                <span
                                  key={kIdx}
                                  className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]"
                                >
                                  {kp}
                                </span>
                              ))}
                            </div>
                          )}
                          {shortEval.keyPointsMissed.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-400 text-[11px]">Puntos que faltaron:</span>
                              {shortEval.keyPointsMissed.map((kp, kIdx) => (
                                <span
                                  key={kIdx}
                                  className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px]"
                                >
                                  {kp}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Botón "¡Tenía razón!" estilo Thea para reclasificación manual */}
                      {!correct && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setManualOverrides(prev => ({ ...prev, [idx]: true }))}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>¡Tenía razón! (Marcar como correcta)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Detalle para Opción Múltiple */
                    <div className="text-xs text-slate-300 space-y-1 mb-3">
                      <div>
                        Tu respuesta:{' '}
                        <span className="font-semibold text-white">
                          {userChoice !== undefined && q.options ? q.options[Number(userChoice)] : 'Sin responder'}
                        </span>
                      </div>
                      {!correct && (
                        <div className="text-emerald-400">
                          Respuesta correcta:{' '}
                          <span className="font-semibold">
                            {q.options && q.options[Number(q.correctIndex ?? 0)]
                              ? q.options[Number(q.correctIndex ?? 0)]
                              : 'Ver explicación'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-slate-400 bg-thea-surface p-3 rounded-xl border border-thea-border">
                    <span className="font-semibold text-slate-300">Explicación Académica:</span> {q.explanation}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
