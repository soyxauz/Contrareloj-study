import React from 'react';
import { Check, X } from 'lucide-react';
import { FormattedText } from '../FormattedText';

export interface MultipleChoiceRendererProps {
  safeOptions: string[];
  safeCorrectIndex: number;
  selectedOption: number | null;
  isAnswered: boolean;
  onSelectOption: (idx: number) => void;
}

export const MultipleChoiceRenderer: React.FC<MultipleChoiceRendererProps> = ({
  safeOptions,
  safeCorrectIndex,
  selectedOption,
  isAnswered,
  onSelectOption,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 mb-6 sm:mb-8">
      {safeOptions.map((option, idx) => {
        const isSelected = selectedOption === idx;
        const isCorrect = idx === safeCorrectIndex;

        let cardClasses = 'bg-white/[0.035] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.1] hover:border-white/20 text-slate-200 glass-specular hover:-translate-y-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_-4px_rgba(0,0,0,0.4)]';
        let badgeClasses = 'bg-white/[0.06] backdrop-blur-md text-slate-200 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]';

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = 'border border-emerald-500/50 bg-emerald-500/[0.12] backdrop-blur-xl text-white shadow-[inset_0_1px_0_rgba(52,211,153,0.3),0_8px_32px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30 animate-cardCorrect';
            badgeClasses = 'bg-emerald-500 text-zinc-950 font-bold border border-emerald-400 shadow-[0_2px_10px_rgba(16,185,129,0.4)]';
          } else if (isSelected) {
            cardClasses = 'border border-rose-500/50 bg-rose-500/[0.12] backdrop-blur-xl text-white shadow-[inset_0_1px_0_rgba(251,113,133,0.3),0_8px_32px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/30 animate-cardError';
            badgeClasses = 'bg-rose-500 text-white font-bold border border-rose-400 shadow-[0_2px_10px_rgba(244,63,94,0.4)]';
          } else {
            cardClasses = 'border border-white/[0.04] bg-white/[0.01] backdrop-blur-sm text-slate-500 opacity-40 shadow-none';
            badgeClasses = 'bg-white/[0.02] text-slate-600 border border-white/[0.04] shadow-none';
          }
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={isAnswered}
            style={{ animationDelay: `${idx * 30}ms` }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectOption(idx);
            }}
            className={`animate-stagger-item active-press w-full text-left p-4 sm:p-5 rounded-2xl transition-[transform,background-color,border-color,box-shadow,opacity] duration-150 ease-out flex items-center gap-3.5 sm:gap-4 group cursor-pointer ${cardClasses}`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 tabular-nums transition-[transform,background-color,border-color] duration-150 shadow-sm ${badgeClasses}`}>
              {isAnswered && isCorrect ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : isAnswered && isSelected ? (
                <X className="w-4 h-4 stroke-[3]" />
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>
            <span className="font-medium text-sm sm:text-base leading-snug flex-1 text-slate-200 group-hover:text-white transition-colors">
              <FormattedText text={option} inlineOnly={true} />
            </span>
          </button>
        );
      })}
    </div>
  );
};
