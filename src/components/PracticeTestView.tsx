import React, { useState, useEffect } from 'react';
import type { StudyKit, Question } from '../types';
import { QuestionPrompt } from './QuestionPrompt';
import { FileCheck2, Clock, Sparkles, CheckCircle2, XCircle, Flag, ArrowLeft, ArrowRight, RotateCcw, Award } from 'lucide-react';
import confetti from 'canvas-confetti';

interface PracticeTestViewProps {
  kit: StudyKit;
}

export const PracticeTestView: React.FC<PracticeTestViewProps> = ({ kit }) => {
  const [testState, setTestState] = useState<'config' | 'taking' | 'results'>('config');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [customInstructions, setCustomInstructions] = useState<string>('Enfócate en preguntas de razonamiento crítico y aplicaciones de examen');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(15);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15 * 60);

  const [activeTestQuestions, setActiveTestQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});

  // Countdown timer
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

  const handleStartTest = () => {
    // Generate questions by sampling questions with options
    const pool = kit.questions.filter(q => q.options && q.options.length > 0);
    const effectivePool = pool.length > 0 ? pool : kit.questions.map(q => ({
      ...q,
      options: q.options || ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
      correctIndex: q.correctIndex ?? 0
    }));

    const generated: Question[] = [];
    for (let i = 0; i < questionCount; i++) {
      const base = effectivePool[i % effectivePool.length];
      generated.push({
        ...base,
        id: `test-q-${i + 1}`,
        question: i >= effectivePool.length ? `[Variación ${i + 1}] ${base.question}` : base.question,
        options: base.options || ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
        correctIndex: base.correctIndex ?? 0
      });
    }
    setActiveTestQuestions(generated);
    setUserAnswers({});
    setFlagged({});
    setCurrentIdx(0);
    setSecondsRemaining(timeLimitMinutes * 60);
    setTestState('taking');
  };

  const handleFinishTest = () => {
    setTestState('results');
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Calculate score
  const correctCount = activeTestQuestions.filter(
    (q, idx) => userAnswers[idx] !== undefined && Number(userAnswers[idx]) === Number(q.correctIndex ?? 0)
  ).length;
  const scorePercent = Math.round((correctCount / (activeTestQuestions.length || 1)) * 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* View Header */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white">
              SIMULADOR ABIERTO
            </span>
            <span className="text-xs text-slate-400 font-medium">Exámenes ilimitados y personalizables</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-violet-400" />
            <span>Simulador de Pruebas & Exámenes</span>
          </h1>
        </div>
      </div>

      {testState === 'config' && (
        <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Configurar Nuevo Examen de Práctica</h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Configura el número de preguntas, tiempo e instrucciones pedagógicas a la medida de tu estudio.
            </p>
          </div>

          {/* Question Count Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Número de Preguntas:
              </label>
              <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                Sin límite de preguntas
              </span>
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

          {/* Custom Instructions */}
          <div className="p-5 rounded-2xl bg-thea-surfaceLight border border-thea-border">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Instrucciones Personalizadas:
              </label>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Guía a la IA sobre cómo redactar las preguntas de tu examen (ej. "incluye preguntas con trampas conceptuales", "simula formato USMLE").
            </p>
            <input
              type="text"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              className="w-full bg-thea-bg border border-thea-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Time Limit */}
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

          {/* Start Test Button */}
          <div className="pt-4">
            <button
              onClick={handleStartTest}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-amber-500 hover:scale-[1.01] transition-all text-white font-extrabold text-base shadow-xl shadow-violet-900/40 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span>Comenzar Examen ({questionCount} preguntas)</span>
            </button>
          </div>
        </div>
      )}

      {testState === 'taking' && (
        <div className="space-y-6">
          {/* Top Bar with Timer and Progress */}
          <div className="bg-thea-surface border border-thea-border rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-white">
                Pregunta {currentIdx + 1} de {activeTestQuestions.length}
              </span>
              <button
                onClick={() => setFlagged(prev => ({ ...prev, [currentIdx]: !prev[currentIdx] }))}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-colors ${
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

          {/* Question Card */}
          <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-8 shadow-xl">
            <QuestionPrompt
              as="h3"
              text={activeTestQuestions[currentIdx]?.question || ''}
              topic={activeTestQuestions[currentIdx]?.topic}
              className="text-xl mb-6 leading-relaxed"
            />

            <div className="space-y-3 mb-8">
              {(activeTestQuestions[currentIdx]?.options || []).map((option, optIdx) => (
                <button
                  key={optIdx}
                  onClick={() => setUserAnswers(prev => ({ ...prev, [currentIdx]: optIdx }))}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                    userAnswers[currentIdx] === optIdx
                      ? 'border-violet-500 bg-violet-950/40 text-white ring-2 ring-violet-500/30'
                      : 'border-thea-border bg-thea-surfaceLight/60 text-slate-300 hover:border-violet-500/40'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                    userAnswers[currentIdx] === optIdx
                      ? 'bg-violet-600 text-white'
                      : 'bg-thea-surface border border-thea-border text-slate-400'
                  }`}>
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <span className="font-medium text-sm sm:text-base">{option}</span>
                </button>
              ))}
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-thea-border">
              <button
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(prev => prev - 1)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              {currentIdx < activeTestQuestions.length - 1 ? (
                <button
                  onClick={() => setCurrentIdx(prev => prev + 1)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md shadow-violet-900/30"
                >
                  <span>Siguiente</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleFinishTest}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-900/40"
                >
                  Finalizar y Calificar
                </button>
              )}
            </div>
          </div>

          {/* Quick Question Grid Navigator */}
          <div className="flex flex-wrap gap-2 justify-center p-4 bg-thea-surface rounded-2xl border border-thea-border">
            {activeTestQuestions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIdx(idx)}
                className={`w-8 h-8 rounded-xl font-bold text-xs transition-all relative ${
                  currentIdx === idx
                    ? 'ring-2 ring-white scale-110 z-10'
                    : ''
                } ${
                  userAnswers[idx] !== undefined
                    ? 'bg-violet-600 text-white'
                    : 'bg-thea-surfaceLight border border-thea-border text-slate-400'
                }`}
              >
                {idx + 1}
                {flagged[idx] && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-1 ring-thea-bg" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {testState === 'results' && (
        <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-fadeIn">
          {/* Results Summary */}
          <div className="text-center py-4">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-rose-500 p-0.5 mx-auto mb-4 shadow-xl shadow-amber-500/20">
              <div className="w-full h-full bg-thea-bg rounded-[22px] flex items-center justify-center">
                <Award className="w-10 h-10 text-amber-400" />
              </div>
            </div>

            <h2 className="text-3xl font-extrabold text-white mb-1">
              ¡Examen Completado!
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Has respondido correctamente <span className="text-emerald-400 font-bold">{correctCount}</span> de <span className="text-white font-bold">{activeTestQuestions.length}</span> preguntas.
            </p>

            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-thea-surfaceLight border border-thea-border text-2xl font-black text-amber-300">
              <span>Puntaje: {scorePercent}%</span>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                {scorePercent >= 80 ? 'EXCELENTE (A+)' : scorePercent >= 60 ? 'APROBADO (B)' : 'NECESITA REPASO'}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setTestState('config')}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm shadow-lg shadow-violet-900/40"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Configurar Nuevo Test</span>
            </button>
          </div>

          {/* Detailed Question Review */}
          <div className="space-y-4 pt-6 border-t border-thea-border">
            <h3 className="font-bold text-lg text-white">Revisión de Preguntas y Explicaciones:</h3>
            {activeTestQuestions.map((q, idx) => {
              const userChoice = userAnswers[idx];
              const targetIdx = Number(q.correctIndex ?? 0);
              const isCorrect = userChoice !== undefined && Number(userChoice) === targetIdx;
              return (
                <div
                  key={idx}
                  className={`p-5 rounded-2xl border ${
                    isCorrect ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-400">Pregunta {idx + 1}</span>
                    <span className={`text-xs font-bold flex items-center gap-1 ${
                      isCorrect ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {isCorrect ? 'Correcta' : 'Incorrecta'}
                    </span>
                  </div>
                  <QuestionPrompt
                    as="h4"
                    text={q.question}
                    topic={q.topic}
                    className="text-sm sm:text-base mb-3"
                  />
                  <div className="text-xs text-slate-300 space-y-1 mb-3">
                    <div>Tu respuesta: <span className="font-semibold text-white">{userChoice !== undefined && q.options ? q.options[userChoice] : 'Sin responder'}</span></div>
                    {!isCorrect && (
                      <div className="text-emerald-400">Respuesta correcta: <span className="font-semibold">{q.options && q.options[targetIdx] ? q.options[targetIdx] : 'Ver explicación'}</span></div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 bg-thea-surface p-3 rounded-xl border border-thea-border">
                    <span className="font-semibold text-slate-300">Explicación:</span> {q.explanation}
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
