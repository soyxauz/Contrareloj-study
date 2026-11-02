import React from 'react';
import { Check, X } from 'lucide-react';
import { FormattedText } from '../FormattedText';
import { useTheme } from '../../services/themeService';

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
  const { theme } = useTheme();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 mb-6 sm:mb-8">
      {safeOptions.map((option, idx) => {
        const isSelected = selectedOption === idx;
        const isCorrect = idx === safeCorrectIndex;

        let cardClasses = theme === 'light'
          ? 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-zinc-950 shadow-sm hover:-translate-y-0.5'
          : theme === 'kitty'
          ? 'bg-white hover:bg-pink-50/60 border border-pink-200 hover:border-pink-300 text-zinc-950 shadow-sm shadow-pink-100/50 hover:-translate-y-0.5'
          : 'bg-[#1e0711]/75 hover:bg-[#2c0b19]/90 border border-[#881337]/40 hover:border-[#be123c]/60 text-slate-100 shadow-md shadow-[#28030d]/30 hover:-translate-y-0.5';

        let badgeClasses = theme === 'light'
          ? 'bg-slate-100 text-slate-700 border border-slate-200 group-hover:bg-slate-200'
          : theme === 'kitty'
          ? 'bg-pink-100 text-pink-700 border border-pink-200 group-hover:bg-pink-200'
          : 'bg-[#881337]/30 text-rose-200 border border-[#9f1239]/50 group-hover:bg-[#881337]/50 group-hover:text-white group-hover:border-[#be123c]/70';

        let textClasses = theme === 'dark' ? 'text-slate-200 group-hover:text-white' : 'text-zinc-900 group-hover:text-black';

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = theme === 'dark'
              ? 'border border-emerald-500/60 bg-emerald-500/10 text-white shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30 animate-cardCorrect'
              : 'border border-emerald-500 bg-emerald-50 text-emerald-950 shadow-md ring-1 ring-emerald-500/30 animate-cardCorrect';
            badgeClasses = 'bg-emerald-500 text-zinc-950 font-bold border border-emerald-400';
            textClasses = theme === 'dark' ? 'text-white' : 'text-emerald-950 font-semibold';
          } else if (isSelected) {
            cardClasses = theme === 'dark'
              ? 'border border-rose-500/60 bg-rose-500/10 text-white shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/30 animate-cardError'
              : 'border border-rose-500 bg-rose-50 text-rose-950 shadow-md ring-1 ring-rose-500/30 animate-cardError';
            badgeClasses = 'bg-rose-500 text-white font-bold border border-rose-400';
            textClasses = theme === 'dark' ? 'text-white' : 'text-rose-950 font-semibold';
          } else {
            cardClasses = theme === 'light'
              ? 'border border-slate-200 bg-slate-100/60 text-slate-400 opacity-40'
              : theme === 'kitty'
              ? 'border border-pink-100 bg-pink-50/40 text-pink-300 opacity-40'
              : 'border border-[#4c0519]/30 bg-[#14040b]/40 text-slate-500 opacity-40';
            badgeClasses = 'bg-transparent text-slate-400 border border-slate-200/40';
            textClasses = 'text-slate-400';
          }
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={isAnswered}
            style={{
              animationDelay: `${idx * 30}ms`,
              boxShadow: theme === 'dark'
                ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px -2px rgba(40, 3, 13, 0.4)'
                : undefined
            }}
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
            <span className={`font-medium text-sm sm:text-base leading-snug flex-1 transition-colors ${textClasses}`}>
              <FormattedText text={option} inlineOnly={true} />
            </span>
          </button>
        );
      })}
    </div>
  );
};
