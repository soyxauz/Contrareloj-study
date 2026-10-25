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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
      {safeOptions.map((option, idx) => {
        const isSelected = selectedOption === idx;
        const isCorrect = idx === safeCorrectIndex;

        let cardClasses = 'bg-thea-surface/90 border border-thea-border hover:border-violet-500/50 hover:bg-thea-surfaceLight text-slate-200 active:scale-[0.985]';
        let badgeClasses = 'bg-thea-surfaceLight text-violet-200 border border-thea-border/80';

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = 'border-2 border-emerald-500 bg-emerald-950/80 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] ring-1 ring-emerald-500/40 animate-cardCorrect';
            badgeClasses = 'bg-emerald-500 text-white scale-105';
          } else if (isSelected) {
            cardClasses = 'border-2 border-rose-500 bg-rose-950/60 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] ring-1 ring-rose-500/40 animate-cardError';
            badgeClasses = 'bg-rose-500 text-white scale-105';
          } else {
            cardClasses = 'border border-thea-border bg-thea-surface/90 text-slate-400 opacity-60';
            badgeClasses = 'bg-thea-surfaceLight text-violet-300/60';
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
            className={`w-full text-left p-4 sm:p-5 rounded-2xl transition-all duration-150 ease-out flex items-center gap-3.5 sm:gap-4 group cursor-pointer ${cardClasses}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 transition-all duration-150 ${badgeClasses}`}>
              {isAnswered && isCorrect ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : isAnswered && isSelected ? (
                <X className="w-4 h-4 stroke-[3]" />
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>
            <span className="font-medium text-sm sm:text-base leading-snug flex-1">
              <FormattedText text={option} inlineOnly={true} />
            </span>
          </button>
        );
      })}
    </div>
  );
};
