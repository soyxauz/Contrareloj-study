import React from 'react';
import { Check, CheckCircle2, XCircle } from 'lucide-react';
import { FormattedText } from '../FormattedText';
import { useTheme } from '../../services/themeService';

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
  const { theme } = useTheme();

  return (
    <div className="space-y-4 mb-8">
      <p className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
        Selecciona una o más respuestas válidas y presiona &quot;Comprobar Selección&quot;:
      </p>
      <div className="space-y-3">
        {safeOptions.map((option, idx) => {
          const isSelected = selectedMultiIndices.includes(idx);
          const isCorrect = safeCorrectIndices.includes(idx);

          let optionStyles = theme === 'light'
            ? 'thea-glass-pill thea-glass-pill-hover border text-zinc-950 hover:-translate-y-0.5'
            : theme === 'kitty'
            ? 'thea-glass-pill thea-glass-pill-hover border text-zinc-950 hover:-translate-y-0.5'
            : 'border-[#881337]/40 bg-[#1e0711]/75 hover:bg-[#2c0b19]/90 hover:border-[#be123c]/60 text-slate-100 shadow-md shadow-[#28030d]/30 hover:-translate-y-0.5';

          if (isSelected && !isAnswered) {
            optionStyles = theme === 'light'
              ? 'border-zinc-900 bg-white/95 text-zinc-950 ring-2 ring-zinc-900 shadow-md'
              : theme === 'kitty'
              ? 'border-pink-500 bg-pink-50/90 text-pink-950 ring-2 ring-pink-500 shadow-md'
              : 'border-[#be123c]/70 bg-[#3d0e23]/90 text-white shadow-lg shadow-[#4c0519]/40 ring-1 ring-[#be123c]/50';
          }
          if (isAnswered) {
            if (isCorrect && isSelected) {
              optionStyles = theme === 'dark'
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30 animate-cardCorrect'
                : 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/30 animate-cardCorrect shadow-sm';
            } else if (!isCorrect && isSelected) {
              optionStyles = theme === 'dark'
                ? 'border-rose-500/60 bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30 animate-cardError'
                : 'border-rose-500 bg-rose-50 text-rose-950 ring-1 ring-rose-500/30 animate-cardError shadow-sm';
            } else if (isCorrect && !isSelected) {
              optionStyles = theme === 'dark'
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30'
                : 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-500/30';
            } else {
              optionStyles = theme === 'light'
                ? 'border-slate-200 bg-slate-100/50 text-slate-400 opacity-40'
                : theme === 'kitty'
                ? 'border-pink-100 bg-pink-50/30 text-pink-300 opacity-40'
                : 'border border-[#4c0519]/30 bg-[#14040b]/40 text-slate-500 opacity-40';
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
                  isSelected
                    ? (theme === 'dark' ? 'bg-white border-white text-zinc-950 font-bold shadow-sm' : theme === 'kitty' ? 'bg-pink-500 border-pink-500 text-white font-bold' : 'bg-zinc-900 border-zinc-900 text-white font-bold')
                    : (theme === 'dark' ? 'border-white/20 bg-white/[0.04]' : theme === 'kitty' ? 'border-pink-300 bg-pink-50/50' : 'border-slate-300 bg-slate-100')
                }`}>
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <span className="text-sm font-medium">
                  <FormattedText text={option} inlineOnly={true} />
                </span>
              </div>

              {isAnswered && isCorrect && isSelected && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              {isAnswered && !isCorrect && isSelected && (
                <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
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
          className={`active-press w-full py-3 rounded-xl font-bold text-sm shadow-md transition-[transform,background-color] duration-150 cursor-pointer tabular-nums disabled:opacity-40 ${
            theme === 'dark'
              ? 'bg-white hover:bg-zinc-200 text-zinc-950 glass-specular'
              : theme === 'kitty'
              ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/25'
              : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm'
          }`}
        >
          Comprobar Selección ({selectedMultiIndices.length} seleccionada{selectedMultiIndices.length !== 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
};
