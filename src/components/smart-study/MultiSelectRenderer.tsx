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

          let optionStyles = 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-200';
          if (isSelected && !isAnswered) {
            optionStyles = 'border-violet-500 bg-violet-950/30 text-white ring-1 ring-violet-500';
          }
          if (isAnswered) {
            if (isCorrect && isSelected) {
              optionStyles = 'border-emerald-500 bg-emerald-950/40 text-emerald-200 ring-1 ring-emerald-500 animate-cardCorrect';
            } else if (!isCorrect && isSelected) {
              optionStyles = 'border-rose-500 bg-rose-950/40 text-rose-200 ring-1 ring-rose-500 animate-cardError';
            } else if (isCorrect && !isSelected) {
              optionStyles = 'border-amber-500 bg-amber-950/30 text-amber-200 ring-1 ring-amber-500/60';
            } else {
              optionStyles = 'border-thea-border/40 text-slate-500 opacity-40';
            }
          }

          return (
            <button
              key={idx}
              type="button"
              disabled={isAnswered}
              onClick={() => onToggleIndex(idx)}
              className={`w-full text-left p-4 rounded-2xl border transition-all duration-150 ease-out flex items-center justify-between cursor-pointer ${optionStyles}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                  isSelected ? 'bg-violet-600 border-violet-500 text-white' : 'border-slate-500 bg-thea-surface'
                }`}>
                  {isSelected && <Check className="w-3.5 h-3.5" />}
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
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
        >
          Comprobar Selección ({selectedMultiIndices.length} seleccionada{selectedMultiIndices.length !== 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
};
