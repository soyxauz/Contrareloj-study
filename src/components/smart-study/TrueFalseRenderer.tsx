import React from 'react';
import { Check, X } from 'lucide-react';

export interface TrueFalseRendererProps {
  selectedOption: number | null;
  safeCorrectIndex: number;
  isAnswered: boolean;
  onSelectOption: (idx: number) => void;
}

export const TrueFalseRenderer: React.FC<TrueFalseRendererProps> = ({
  selectedOption,
  safeCorrectIndex,
  isAnswered,
  onSelectOption,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
      {['Verdadero', 'Falso'].map((label, idx) => {
        const isSelected = selectedOption === idx;
        const isCorrect = idx === safeCorrectIndex;
        const isVerdadero = idx === 0;

        let cardClasses = 'bg-[#181138]/90 border border-[#2b2053] hover:border-violet-500/60 hover:bg-[#20174a] text-slate-200 hover:scale-[1.02] active:scale-98';
        let iconClasses = isVerdadero ? 'text-emerald-400' : 'text-rose-400';
        let iconBgClasses = isVerdadero ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30';

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = 'border-2 border-emerald-400 bg-[#10252b]/95 text-white shadow-[0_0_24px_rgba(52,211,153,0.4)] ring-2 ring-emerald-400/50 animate-cardCorrect';
            iconClasses = 'text-emerald-300';
            iconBgClasses = 'bg-emerald-500/25 border-emerald-400 scale-105';
          } else if (isSelected) {
            cardClasses = 'border-2 border-rose-500 bg-rose-950/60 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.35)] ring-2 ring-rose-500/50 animate-cardError';
            iconClasses = 'text-rose-300';
            iconBgClasses = 'bg-rose-500/25 border-rose-400 scale-105';
          } else {
            cardClasses = 'border-[#221742]/50 bg-[#120a2a]/40 text-slate-500 opacity-40';
            iconClasses = 'text-slate-600';
            iconBgClasses = 'bg-slate-800/30 border-slate-700/30';
          }
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={isAnswered}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectOption(idx);
            }}
            className={`w-full py-8 sm:py-10 px-6 rounded-3xl transition-all duration-150 ease-out flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg ${cardClasses}`}
          >
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all ${iconBgClasses}`}>
              {isVerdadero ? (
                <Check className={`w-7 h-7 stroke-[2.5] ${iconClasses}`} />
              ) : (
                <X className={`w-7 h-7 stroke-[2.5] ${iconClasses}`} />
              )}
            </div>
            <span className="font-bold text-lg sm:text-xl tracking-wide">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
