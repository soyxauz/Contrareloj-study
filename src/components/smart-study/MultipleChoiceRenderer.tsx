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

        let cardClasses = 'bg-[#1e0711]/75 hover:bg-[#2c0b19]/90 border border-[#881337]/40 hover:border-[#be123c]/60 text-slate-100 shadow-md shadow-[#28030d]/30 hover:-translate-y-0.5';
        let badgeClasses = 'bg-[#881337]/30 text-rose-200 border border-[#9f1239]/50 group-hover:bg-[#881337]/50 group-hover:text-white group-hover:border-[#be123c]/70';

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = 'border border-emerald-500/60 bg-emerald-500/10 text-white shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30 animate-cardCorrect';
            badgeClasses = 'bg-emerald-500 text-zinc-950 font-bold border border-emerald-400';
          } else if (isSelected) {
            cardClasses = 'border border-rose-500/60 bg-rose-500/10 text-white shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/30 animate-cardError';
            badgeClasses = 'bg-rose-500 text-white font-bold border border-rose-400';
          } else {
            cardClasses = 'border border-[#4c0519]/30 bg-[#14040b]/40 text-slate-500 opacity-40';
            badgeClasses = 'bg-white/[0.03] text-slate-600 border border-white/[0.05]';
          }
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={isAnswered}
            style={{ animationDelay: `${idx * 30}ms`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px -2px rgba(40, 3, 13, 0.4)' }}
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
