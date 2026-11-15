import React from 'react';
import { Loader2, Send } from 'lucide-react';
import { useTheme } from '../../services/themeService';
import type { ShortAnswerEvaluation } from '../../types';

export interface ShortAnswerRendererProps {
  shortAnswerInput: string;
  isAnswered: boolean;
  isEvaluatingShortAnswer: boolean;
  shortAnswerEvalResult: ShortAnswerEvaluation | null;
  idealAnswerOrExplanation?: string;
  onInputChange: (val: string) => void;
  onSubmit: () => void;
}

export const ShortAnswerRenderer: React.FC<ShortAnswerRendererProps> = ({
  shortAnswerInput,
  isAnswered,
  isEvaluatingShortAnswer,
  shortAnswerEvalResult,
  idealAnswerOrExplanation = '',
  onInputChange,
  onSubmit,
}) => {
  const { theme } = useTheme();
  const wordCount = shortAnswerInput.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-2.5 mb-3 sm:mb-4">
      <div className={`p-3.5 sm:p-4 rounded-2xl border space-y-2.5 shadow-lg ${
        theme === 'kitty'
          ? 'bg-white/95 border-pink-200 text-pink-950 shadow-pink-100/50'
          : theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-slate-100/50'
          : 'bg-[#1e0711]/75 border-[#881337]/40 shadow-[#28030d]/30 glass-specular'
      }`}>
        <div className="flex items-center justify-between">
          <label className={`block text-xs font-semibold uppercase tracking-wider ${
            theme === 'kitty' ? 'text-pink-900 font-bold' : theme === 'light' ? 'text-slate-700 font-bold' : 'text-slate-300'
          }`}>
            Escribe tu respuesta analítica / técnica:
          </label>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-xs ${
            theme === 'kitty'
              ? 'bg-pink-100 text-pink-700 border-pink-300'
              : theme === 'light'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'text-rose-300 bg-[#881337]/30 border-[#9f1239]/40'
          }`}>
            Respuesta Abierta Corta
          </span>
        </div>
        <textarea
          rows={2}
          disabled={isAnswered || isEvaluatingShortAnswer}
          value={shortAnswerInput}
          onChange={e => onInputChange(e.target.value)}
          placeholder="Escribe una respuesta fundamentada de 1 a 4 líneas. La IA evaluará la similitud conceptual y los puntos clave con la respuesta modelo..."
          className={`w-full rounded-xl p-3 text-xs sm:text-sm focus:outline-none transition-colors resize-y disabled:opacity-60 border ${
            theme === 'kitty'
              ? 'bg-pink-50/50 border-pink-200 focus:border-pink-500 text-pink-950 placeholder-pink-400/80'
              : theme === 'light'
              ? 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400'
              : 'bg-[#12030a]/60 border-[#881337]/35 focus:border-[#be123c]/60 text-white placeholder-slate-500'
          }`}
        />
        <div className={`flex items-center justify-between text-xs tabular-nums ${
          theme === 'kitty' ? 'text-pink-600 font-medium' : theme === 'light' ? 'text-slate-500 font-medium' : 'text-slate-400'
        }`}>
          <span>{wordCount} palabras</span>
          {!isAnswered && (
            <button
              type="button"
              disabled={!shortAnswerInput.trim() || isEvaluatingShortAnswer}
              onClick={onSubmit}
              className={`active-press px-6 py-2.5 rounded-xl disabled:opacity-40 font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer flex items-center gap-2 ${
                theme === 'kitty'
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-pink-300/40'
                  : theme === 'light'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200/50'
                  : 'bg-white hover:bg-zinc-200 text-zinc-950'
              }`}
            >
              {isEvaluatingShortAnswer ? (
                <>
                  <Loader2 className={`w-4 h-4 animate-spin ${theme === 'dark' ? 'text-zinc-950' : 'text-white'}`} />
                  <span>Evaluando con IA...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Comprobar Respuesta</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Desglose de Evaluación de IA */}
      {isAnswered && shortAnswerEvalResult && (
        <div className={`p-4 sm:p-5 rounded-2xl border text-[13px] space-y-3 animate-fadeIn ${
          theme === 'kitty'
            ? 'bg-white border-pink-200 text-pink-950 shadow-xs'
            : theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900 shadow-xs'
            : 'bg-white/[0.02] border-white/[0.08] text-slate-300'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              Similitud Conceptual con el Modelo:
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums border ${
                shortAnswerEvalResult.similarity >= 65
                  ? theme === 'dark'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-xs'
                  : theme === 'dark'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-rose-100 text-rose-900 border-rose-300 shadow-xs'
              }`}
            >
              {shortAnswerEvalResult.similarity}% de coincidencia
            </span>
          </div>
          <p className={`text-[13px] sm:text-sm leading-relaxed ${
            theme === 'dark' ? 'text-slate-300' : 'text-slate-800'
          }`}>
            <strong className={theme === 'dark' ? 'text-white' : 'text-slate-950 font-black'}>
              Diagnóstico de la IA:
            </strong>{' '}
            {shortAnswerEvalResult.feedback}
          </p>
          <div className={`p-3.5 rounded-xl border space-y-1 ${
            theme === 'kitty'
              ? 'bg-pink-50/70 border-pink-200'
              : theme === 'light'
              ? 'bg-slate-50 border-slate-200'
              : 'bg-white/[0.02] border-white/[0.06]'
          }`}>
            <span className={`text-[10px] uppercase font-bold block tracking-wider ${
              theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
            }`}>
              Respuesta modelo de referencia:
            </span>
            <span className={`text-[13px] sm:text-sm font-medium ${
              theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
            }`}>
              {idealAnswerOrExplanation}
            </span>
          </div>
          {shortAnswerEvalResult.keyPointsCovered.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                Puntos cubiertos:
              </span>
              {shortAnswerEvalResult.keyPointsCovered.map((kp, kIdx) => (
                <span
                  key={kIdx}
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
                    theme === 'dark'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {kp}
                </span>
              ))}
            </div>
          )}
          {shortAnswerEvalResult.keyPointsMissed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                Puntos que faltaron:
              </span>
              {shortAnswerEvalResult.keyPointsMissed.map((kp, kIdx) => (
                <span
                  key={kIdx}
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
                    theme === 'dark'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  {kp}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
