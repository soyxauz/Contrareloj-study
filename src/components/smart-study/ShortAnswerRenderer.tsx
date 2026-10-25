import React from 'react';
import { Loader2, Send } from 'lucide-react';
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
  const wordCount = shortAnswerInput.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-4 mb-6 sm:mb-8">
      <div className="p-5 rounded-3xl bg-thea-surfaceLight/60 border border-thea-border space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            Escribe tu respuesta analítica / técnica:
          </label>
          <span className="text-[11px] font-semibold text-violet-300 bg-violet-950/60 px-2.5 py-0.5 rounded-full border border-violet-500/30">
            Respuesta Abierta Corta
          </span>
        </div>
        <textarea
          rows={3}
          disabled={isAnswered || isEvaluatingShortAnswer}
          value={shortAnswerInput}
          onChange={e => onInputChange(e.target.value)}
          placeholder="Escribe una respuesta fundamentada de 1 a 4 líneas. La IA evaluará la similitud conceptual y los puntos clave con la respuesta modelo..."
          className="w-full bg-thea-bg border border-thea-border rounded-2xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-y disabled:opacity-60"
        />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{wordCount} palabras</span>
          {!isAnswered && (
            <button
              type="button"
              disabled={!shortAnswerInput.trim() || isEvaluatingShortAnswer}
              onClick={onSubmit}
              className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer flex items-center gap-2 active:scale-95"
            >
              {isEvaluatingShortAnswer ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
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
        <div className="p-4 sm:p-5 rounded-2xl bg-violet-950/20 border border-violet-500/30 text-xs space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200">Similitud Conceptual con el Modelo:</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                shortAnswerEvalResult.similarity >= 65
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {shortAnswerEvalResult.similarity}% de coincidencia
            </span>
          </div>
          <p className="text-violet-200 leading-relaxed">
            <strong className="text-white">Diagnóstico de la IA:</strong> {shortAnswerEvalResult.feedback}
          </p>
          <div className="p-3 rounded-xl bg-thea-surface border border-thea-border space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">
              Respuesta modelo de referencia:
            </span>
            <span className="text-slate-200 font-medium">
              {idealAnswerOrExplanation}
            </span>
          </div>
          {shortAnswerEvalResult.keyPointsCovered.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Puntos cubiertos:</span>
              {shortAnswerEvalResult.keyPointsCovered.map((kp, kIdx) => (
                <span
                  key={kIdx}
                  className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]"
                >
                  {kp}
                </span>
              ))}
            </div>
          )}
          {shortAnswerEvalResult.keyPointsMissed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Puntos que faltaron:</span>
              {shortAnswerEvalResult.keyPointsMissed.map((kp, kIdx) => (
                <span
                  key={kIdx}
                  className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]"
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
