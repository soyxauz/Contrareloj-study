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

        let cardClasses = 'bg-white/[0.035] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.1] hover:border-white/20 text-slate-200 glass-specular hover:-translate-y-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_-4px_rgba(0,0,0,0.4)]';
        let iconClasses = isVerdadero ? 'text-emerald-400' : 'text-rose-400';
        let iconBgClasses = isVerdadero ? 'bg-emerald-500/10 border-emerald-500/20 backdrop-blur-md shadow-[inset_0_1px_0_rgba(52,211,153,0.2)]' : 'bg-rose-500/10 border-rose-500/20 backdrop-blur-md shadow-[inset_0_1px_0_rgba(251,113,133,0.2)]';

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = 'border border-emerald-500/50 bg-emerald-500/[0.12] backdrop-blur-xl text-white shadow-[inset_0_1px_0_rgba(52,211,153,0.3),0_8px_32px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30 animate-cardCorrect';
            iconClasses = 'text-emerald-300';
            iconBgClasses = 'bg-emerald-500 text-zinc-950 font-bold border-emerald-400 scale-105 shadow-[0_2px_12px_rgba(16,185,129,0.4)]';
          } else if (isSelected) {
            cardClasses = 'border border-rose-500/50 bg-rose-500/[0.12] backdrop-blur-xl text-rose-100 shadow-[inset_0_1px_0_rgba(251,113,133,0.3),0_8px_32px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/30 animate-cardError';
            iconClasses = 'text-rose-300';
            iconBgClasses = 'bg-rose-500 text-white font-bold border-rose-400 scale-105 shadow-[0_2px_12px_rgba(244,63,94,0.4)]';
          } else {
            cardClasses = 'border border-white/[0.04] bg-white/[0.01] backdrop-blur-sm text-slate-500 opacity-40 shadow-none';
            iconClasses = 'text-slate-600';
            iconBgClasses = 'bg-white/[0.02] border-white/[0.04] shadow-none';
          }
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={isAnswered}
            style={{ animationDelay: `${idx * 40}ms` }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectOption(idx);
            }}
            className={`animate-stagger-item active-press w-full py-8 sm:py-10 px-6 rounded-3xl transition-[transform,background-color,border-color,box-shadow,opacity] duration-150 ease-out flex flex-col items-center justify-center gap-3 cursor-pointer ${cardClasses}`}
          >
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all shadow-sm ${iconBgClasses}`}>
              {isVerdadero ? (
                <Check className={`w-7 h-7 stroke-[2.5] ${iconClasses}`} />
              ) : (
                <X className={`w-7 h-7 stroke-[2.5] ${iconClasses}`} />
              )}
            </div>
            <span className="font-bold text-lg sm:text-xl tracking-tight text-white">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
