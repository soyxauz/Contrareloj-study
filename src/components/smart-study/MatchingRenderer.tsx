import React from 'react';
import { Check, X } from 'lucide-react';
import { FormattedText } from '../FormattedText';
import { maskTermInDefinition } from '../flashcards/flashcardSanitizer';
import { useTheme } from '../../services/themeService';

export interface MatchingPairItem {
  term: string;
  definition: string;
}

export interface MatchingRendererProps {
  matchingPairs: MatchingPairItem[];
  shuffledDefinitions: string[];
  matchingPairsMap: Record<string, string>;
  matchingChecked: boolean;
  activeMatchingTerm: string | null;
  correctMatchingFormula: string;
  isAnswered: boolean;
  onTermClick: (term: string) => void;
  onDefClick: (def: string) => void;
  onCheckMatching: () => void;
}

export const MatchingRenderer: React.FC<MatchingRendererProps> = ({
  matchingPairs,
  shuffledDefinitions,
  matchingPairsMap,
  matchingChecked,
  activeMatchingTerm,
  correctMatchingFormula,
  isAnswered,
  onTermClick,
  onDefClick,
  onCheckMatching,
}) => {
  const { theme } = useTheme();

  return (
    <div className="space-y-3 mb-3 sm:mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className={`text-xs font-medium ${
          theme === 'kitty' ? 'text-pink-900' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
        }`}>
          Haz clic en un concepto numerado de la izquierda y luego en su definición correspondiente a la derecha:
        </p>
        {matchingChecked && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full border shadow-xs ${
            theme === 'kitty'
              ? 'bg-pink-100 text-pink-700 border-pink-300'
              : theme === 'light'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'text-violet-300 bg-violet-950/70 border-violet-500/40'
          }`}>
            Solución: {correctMatchingFormula}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left Column: Terms */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              theme === 'kitty' ? 'text-pink-700 font-black' : theme === 'light' ? 'text-indigo-700 font-black' : 'text-violet-300'
            }`}>
              Conceptos ({matchingPairs.length})
            </span>
            <span className={`text-[11px] ${
              theme === 'kitty' ? 'text-pink-600/80' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Paso 1: Selecciona concepto
            </span>
          </div>
          {matchingPairs.map((pair, leftIdx) => {
            const leftNum = leftIdx + 1;
            const isPaired = Boolean(matchingPairsMap[pair.term]);
            const isActive = activeMatchingTerm === pair.term;
            const pairedDef = matchingPairsMap[pair.term];
            const pairedRightIdx = shuffledDefinitions.findIndex(d => d === pairedDef);
            const pairedRightNum = pairedRightIdx >= 0 ? pairedRightIdx + 1 : null;

            const correctRightIdx = shuffledDefinitions.findIndex(d => d === pair.definition);
            const correctRightNum = correctRightIdx >= 0 ? correctRightIdx + 1 : null;
            const isMatchCorrect = matchingChecked && isPaired && matchingPairsMap[pair.term] === pair.definition;

            let borderStyles = '';
            if (theme === 'kitty') {
              borderStyles = 'border-pink-200 bg-white hover:border-pink-300 hover:bg-pink-50/40 text-pink-950 shadow-xs';
              if (isActive) borderStyles = 'border-2 border-pink-500 bg-pink-100/70 ring-2 ring-pink-300 shadow-md text-pink-950';
              if (isPaired && !matchingChecked) borderStyles = 'border-2 border-pink-300 bg-pink-50/80 text-pink-950 shadow-xs';
              if (matchingChecked) {
                borderStyles = isMatchCorrect
                  ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-950 shadow-xs animate-cardCorrect'
                  : 'border-2 border-rose-400 bg-rose-50 text-rose-950 shadow-xs animate-cardError';
              }
            } else if (theme === 'light') {
              borderStyles = 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-900 shadow-xs';
              if (isActive) borderStyles = 'border-2 border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 shadow-md text-slate-900';
              if (isPaired && !matchingChecked) borderStyles = 'border-2 border-indigo-200 bg-indigo-50/50 text-slate-900 shadow-xs';
              if (matchingChecked) {
                borderStyles = isMatchCorrect
                  ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-950 shadow-xs animate-cardCorrect'
                  : 'border-2 border-rose-400 bg-rose-50 text-rose-950 shadow-xs animate-cardError';
              }
            } else {
              borderStyles = 'border-[#881337]/40 bg-[#1e0711]/75 hover:border-[#be123c]/60 hover:bg-[#2c0b19]/90 text-slate-100';
              if (isActive) borderStyles = 'border-violet-400 bg-violet-950/50 ring-2 ring-violet-500 shadow-md text-white';
              if (isPaired && !matchingChecked) borderStyles = 'border-indigo-500/60 bg-indigo-950/30 text-white';
              if (matchingChecked) {
                borderStyles = isMatchCorrect
                  ? 'border-emerald-500 bg-emerald-950/30 text-emerald-200 animate-cardCorrect'
                  : 'border-rose-500 bg-rose-950/30 text-rose-200 animate-cardError';
              }
            }

            return (
              <button
                key={leftIdx}
                type="button"
                disabled={isAnswered}
                onClick={() => onTermClick(pair.term)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-colors duration-150 active:scale-[0.985] flex items-center justify-between gap-3 cursor-pointer ${borderStyles}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-7 h-7 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 border ${
                    theme === 'kitty'
                      ? 'bg-pink-100 text-pink-700 border-pink-300'
                      : theme === 'light'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-violet-600/30 border-violet-500/40 text-violet-200'
                  }`}>
                    {leftNum}
                  </span>
                  <span className={`font-semibold text-[15px] truncate sm:text-wrap leading-snug ${
                    theme === 'kitty' ? 'text-pink-950 font-bold' : theme === 'light' ? 'text-slate-900 font-bold' : 'text-white'
                  }`}>
                    <FormattedText text={pair.term} inlineOnly={true} />
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {!matchingChecked && isPaired && pairedRightNum && (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-xs ${
                      theme === 'kitty'
                        ? 'bg-pink-200 text-pink-900 border-pink-300'
                        : theme === 'light'
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        : 'bg-indigo-500/30 text-indigo-200 border-indigo-400/40'
                    }`}>
                      Unido con [{pairedRightNum}]
                    </span>
                  )}

                  {matchingChecked && (
                    isMatchCorrect ? (
                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border flex items-center gap-1 shadow-xs ${
                        theme === 'dark'
                          ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400/40'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        {leftNum}:{correctRightNum} (Correcto)
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 shadow-xs ${
                        theme === 'dark'
                          ? 'bg-rose-500/30 text-rose-300 border-rose-400/40'
                          : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}>
                        <X className="w-3.5 h-3.5 stroke-[3]" />
                        Tu: {pairedRightNum ? `${leftNum}:${pairedRightNum}` : 'Sin unión'} • Iba con {leftNum}:{correctRightNum}
                      </span>
                    )
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Definitions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              theme === 'kitty' ? 'text-pink-700 font-black' : theme === 'light' ? 'text-purple-700 font-black' : 'text-purple-300'
            }`}>
              Definiciones / Roles ({shuffledDefinitions.length})
            </span>
            <span className={`text-[11px] ${
              theme === 'kitty' ? 'text-pink-600/80' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Paso 2: Empareja con definición
            </span>
          </div>
          {shuffledDefinitions.map((def, rightIdx) => {
            const rightNum = rightIdx + 1;
            const pairedTerm = Object.keys(matchingPairsMap).find(t => matchingPairsMap[t] === def);
            const pairedLeftIdx = pairedTerm
              ? matchingPairs.findIndex(p => p.term === pairedTerm) ?? -1
              : -1;
            const pairedLeftNum = pairedLeftIdx >= 0 ? pairedLeftIdx + 1 : null;

            const correctPair = matchingPairs.find(p => p.definition === def);
            const correctLeftIdx = correctPair
              ? matchingPairs.findIndex(p => p.term === correctPair.term) ?? -1
              : -1;
            const correctLeftNum = correctLeftIdx >= 0 ? correctLeftIdx + 1 : null;

            const isMatchCorrect = matchingChecked && pairedTerm && correctPair?.term === pairedTerm;
            const displayDef = correctPair ? maskTermInDefinition(correctPair.term, def) : def;

            let borderStyles = '';
            if (theme === 'kitty') {
              borderStyles = 'border-pink-200 bg-white hover:border-pink-300 hover:bg-pink-50/40 text-pink-950 shadow-xs';
              if (pairedTerm && !matchingChecked) borderStyles = 'border-2 border-pink-300 bg-pink-50/80 text-pink-950 shadow-xs';
              if (matchingChecked) {
                borderStyles = isMatchCorrect
                  ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-950 shadow-xs animate-cardCorrect'
                  : 'border-2 border-rose-400 bg-rose-50 text-rose-950 shadow-xs animate-cardError';
              }
            } else if (theme === 'light') {
              borderStyles = 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-900 shadow-xs';
              if (pairedTerm && !matchingChecked) borderStyles = 'border-2 border-purple-200 bg-purple-50/50 text-slate-900 shadow-xs';
              if (matchingChecked) {
                borderStyles = isMatchCorrect
                  ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-950 shadow-xs animate-cardCorrect'
                  : 'border-2 border-rose-400 bg-rose-50 text-rose-950 shadow-xs animate-cardError';
              }
            } else {
              borderStyles = 'border-[#881337]/40 bg-[#1e0711]/75 hover:border-[#be123c]/60 hover:bg-[#2c0b19]/90 text-slate-100';
              if (pairedTerm && !matchingChecked) borderStyles = 'border-indigo-500/60 bg-indigo-950/30 text-white';
              if (matchingChecked) {
                borderStyles = isMatchCorrect
                  ? 'border-emerald-500 bg-emerald-950/30 text-emerald-200 animate-cardCorrect'
                  : 'border-rose-500 bg-rose-950/30 text-rose-200 animate-cardError';
              }
            }

            return (
              <button
                key={rightIdx}
                type="button"
                disabled={isAnswered}
                onClick={() => onDefClick(def)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-colors duration-150 active:scale-[0.985] flex items-start justify-between gap-3 cursor-pointer ${borderStyles}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`w-7 h-7 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5 border ${
                    theme === 'kitty'
                      ? 'bg-pink-100 text-pink-700 border-pink-300'
                      : theme === 'light'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-purple-600/30 border-purple-500/40 text-purple-200'
                  }`}>
                    {rightNum}
                  </span>
                  <span className={`text-[13px] sm:text-sm leading-relaxed ${
                    theme === 'kitty' ? 'text-pink-900 font-medium' : theme === 'light' ? 'text-slate-700 font-normal' : 'text-slate-200'
                  }`}>
                    <FormattedText text={displayDef} inlineOnly={true} />
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {!matchingChecked && pairedLeftNum && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 shadow-xs ${
                      theme === 'kitty'
                        ? 'bg-pink-200 text-pink-900 border-pink-300'
                        : theme === 'light'
                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                        : 'bg-violet-600/40 text-violet-200 border-violet-400/30'
                    }`}>
                      Unido a [{pairedLeftNum}]
                    </span>
                  )}

                  {matchingChecked && (
                    isMatchCorrect ? (
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 shadow-xs ${
                        theme === 'dark'
                          ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400/40'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        {pairedLeftNum}:{rightNum}
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 shadow-xs ${
                        theme === 'dark'
                          ? 'bg-rose-500/30 text-rose-300 border-rose-400/40'
                          : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}>
                        Iba con [{correctLeftNum}]
                      </span>
                    )
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!isAnswered && (
        <button
          type="button"
          disabled={Object.keys(matchingPairsMap).length < (matchingPairs.length || 4)}
          onClick={onCheckMatching}
          className={`w-full py-2.5 sm:py-3 rounded-xl disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm shadow-md transition-transform duration-160 ease-out active:scale-[0.985] cursor-pointer ${
            theme === 'kitty'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 shadow-pink-300/40'
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-900/30'
          }`}
        >
          Comprobar Emparejamientos ({Object.keys(matchingPairsMap).length}/{matchingPairs.length || 4})
        </button>
      )}
    </div>
  );
};
