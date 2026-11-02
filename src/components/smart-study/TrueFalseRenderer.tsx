import React from 'react';
import { Check, X } from 'lucide-react';
import { useTheme } from '../../services/themeService';

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
  const { theme } = useTheme();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
      {['Verdadero', 'Falso'].map((label, idx) => {
        const isSelected = selectedOption === idx;
        const isCorrect = idx === safeCorrectIndex;
        const isVerdadero = idx === 0;

        let cardClasses = theme === 'light'
          ? 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-zinc-950 shadow-sm hover:-translate-y-0.5'
          : theme === 'kitty'
          ? 'bg-white hover:bg-pink-50/60 border border-pink-200 hover:border-pink-300 text-zinc-950 shadow-sm shadow-pink-100/50 hover:-translate-y-0.5'
          : 'bg-[#1e0711]/75 hover:bg-[#2c0b19]/90 border border-[#881337]/40 hover:border-[#be123c]/60 text-slate-100 shadow-md shadow-[#28030d]/30 hover:-translate-y-0.5';

        let iconClasses = isVerdadero
          ? (theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')
          : (theme === 'dark' ? 'text-rose-400' : theme === 'kitty' ? 'text-pink-600' : 'text-rose-600');

        let iconBgClasses = isVerdadero
          ? (theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200')
          : (theme === 'dark' ? 'bg-rose-500/10 border-rose-500/20' : theme === 'kitty' ? 'bg-pink-100/70 border-pink-200' : 'bg-rose-50 border-rose-200');

        if (isAnswered) {
          if (isCorrect) {
            cardClasses = theme === 'dark'
              ? 'border border-emerald-500/60 bg-emerald-500/10 text-white shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30 animate-cardCorrect'
              : 'border border-emerald-500 bg-emerald-50 text-emerald-950 shadow-md ring-1 ring-emerald-500/30 animate-cardCorrect';
            iconClasses = theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700';
            iconBgClasses = 'bg-emerald-500 text-zinc-950 font-bold border-emerald-400 scale-105';
          } else if (isSelected) {
            cardClasses = theme === 'dark'
              ? 'border border-rose-500/60 bg-rose-500/10 text-rose-100 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/30 animate-cardError'
              : 'border border-rose-500 bg-rose-50 text-rose-950 shadow-md ring-1 ring-rose-500/30 animate-cardError';
            iconClasses = 'text-white';
            iconBgClasses = 'bg-rose-500 text-white font-bold border-rose-400 scale-105';
          } else {
            cardClasses = theme === 'light'
              ? 'border border-slate-200 bg-slate-100/60 text-slate-400 opacity-40'
              : theme === 'kitty'
              ? 'border border-pink-100 bg-pink-50/40 text-pink-300 opacity-40'
              : 'border border-[#4c0519]/30 bg-[#14040b]/40 text-slate-500 opacity-40';
            iconClasses = 'text-slate-400';
            iconBgClasses = 'bg-transparent border-transparent';
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
            <span className={`font-bold text-lg sm:text-xl tracking-tight ${
              theme === 'dark' ? 'text-white' : 'text-zinc-950'
            }`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
