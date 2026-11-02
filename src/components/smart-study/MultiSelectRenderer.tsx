import React from 'react';
import { Check, CheckCircle2, XCircle } from 'lucide-react';
import { FormattedText } from '../FormattedText';

export interface MultiSelectRendererProps {
  safeOptions: string[];
  safeCorrectIndices: number[];
  selectedMultiIndices: number[];
  isAnswered: boolean;
  onToggleIndex: (idx: number) => void;
  onCheckSelection: () => void;
}

export const MultiSelectRenderer: React.FC<MultiSelectRendererProps> = ({
  safeOptions,
  safeCorrectIndices,
  selectedMultiIndices,
  isAnswered,
  onToggleIndex,
  onCheckSelection,
}) => {
  return (
    <div className="space-y-4 mb-8">
      <p className="text-xs text-slate-400 font-medium">
        Selecciona una o más respuestas válidas y presiona "Comprobar Selección":
      </p>
      <div className="space-y-3">
        {safeOptions.map((option, idx) => {
          const isSelected = selectedMultiIndices.includes(idx);
          const isCorrect = safeCorrectIndices.includes(idx);

          let optionStyles = 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/20 text-slate-200 glass-specular hover:-translate-y-0.5';
          if (isSelected && !isAnswered) {
            optionStyles = 'border-white/30 bg-white/[0.08] text-white shadow-sm ring-1 ring-white/20 glass-specular';
          }
          if (isAnswered) {
            if (isCorrect && isSelected) {
              optionStyles = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30 animate-cardCorrect';
            } else if (!isCorrect && isSelected) {
              optionStyles = 'border-rose-500/60 bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30 animate-cardError';
            } else if (isCorrect && !isSelected) {
              optionStyles = 'border-amber-500/50 bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30';
            } else {
              optionStyles = 'border-white/[0.04] bg-white/[0.01] text-slate-500 opacity-40';
            }
          }

          return (
            <button
              key={idx}
              type="button"
              disabled={isAnswered}
              style={{ animationDelay: `${idx * 30}ms` }}
              onClick={() => onToggleIndex(idx)}
              className={`animate-stagger-item active-press w-full text-left p-4 rounded-2xl border transition-[transform,background-color,border-color,box-shadow,opacity] duration-150 ease-out flex items-center justify-between cursor-pointer ${optionStyles}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-white border-white text-zinc-950 font-bold shadow-sm' : 'border-white/20 bg-white/[0.04]'
                }`}>
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <span className="text-sm font-medium">
                  <FormattedText text={option} inlineOnly={true} />
                </span>
              </div>

              {isAnswered && isCorrect && isSelected && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              {isAnswered && !isCorrect && isSelected && (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {!isAnswered && (
        <button
          type="button"
          disabled={selectedMultiIndices.length === 0}
          onClick={onCheckSelection}
          className="active-press w-full py-3 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-40 text-zinc-950 font-bold text-sm shadow-md glass-specular transition-[transform,background-color] duration-150 cursor-pointer tabular-nums"
        >
          Comprobar Selección ({selectedMultiIndices.length} seleccionada{selectedMultiIndices.length !== 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
};
