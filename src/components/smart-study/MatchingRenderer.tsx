import React from 'react';
import { Check, X } from 'lucide-react';
import { FormattedText } from '../FormattedText';

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
  return (
    <div className="space-y-6 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-300 font-medium">
          Haz clic en un concepto numerado de la izquierda y luego en su definición correspondiente a la derecha:
        </p>
        {matchingChecked && (
          <span className="text-xs font-bold text-violet-300 bg-violet-950/70 px-3 py-1 rounded-full border border-violet-500/40">
            Solución: {correctMatchingFormula}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Left Column: Terms */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-violet-300 uppercase tracking-wider block">
              Conceptos ({matchingPairs.length})
            </span>
            <span className="text-[11px] text-slate-400">Paso 1: Selecciona concepto</span>
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

            let borderStyles = 'border-thea-border bg-thea-surfaceLight/40 hover:border-violet-500/60';
            if (isActive) borderStyles = 'border-violet-400 bg-violet-950/50 ring-2 ring-violet-500 shadow-md';
            if (isPaired && !matchingChecked) borderStyles = 'border-indigo-500/60 bg-indigo-950/30';
            if (matchingChecked) {
              borderStyles = isMatchCorrect
                ? 'border-emerald-500 bg-emerald-950/30 animate-cardCorrect'
                : 'border-rose-500 bg-rose-950/30 animate-cardError';
            }

            return (
              <button
                key={leftIdx}
                type="button"
                disabled={isAnswered}
                onClick={() => onTermClick(pair.term)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-150 ease-out flex items-center justify-between gap-3 cursor-pointer ${borderStyles}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-violet-600/30 border border-violet-500/40 text-violet-200 font-extrabold text-xs flex items-center justify-center shrink-0">
                    {leftNum}
                  </span>
                  <span className="font-semibold text-sm text-white truncate sm:text-wrap">
                    <FormattedText text={pair.term} inlineOnly={true} />
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {!matchingChecked && isPaired && pairedRightNum && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                      Unido con [{pairedRightNum}]
                    </span>
                  )}

                  {matchingChecked && (
                    isMatchCorrect ? (
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        {leftNum}:{correctRightNum} (Correcto)
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/30 text-rose-300 border border-rose-400/40 flex items-center gap-1">
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
            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
              Definiciones / Roles ({shuffledDefinitions.length})
            </span>
            <span className="text-[11px] text-slate-400">Paso 2: Empareja con definición</span>
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

            let borderStyles = 'border-thea-border bg-thea-surfaceLight/40 hover:border-violet-500/60';
            if (pairedTerm && !matchingChecked) borderStyles = 'border-indigo-500/60 bg-indigo-950/30';
            if (matchingChecked) {
              borderStyles = isMatchCorrect
                ? 'border-emerald-500 bg-emerald-950/30 animate-cardCorrect'
                : 'border-rose-500 bg-rose-950/30 animate-cardError';
            }

            return (
              <button
                key={rightIdx}
                type="button"
                disabled={isAnswered}
                onClick={() => onDefClick(def)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-150 ease-out flex items-start justify-between gap-3 cursor-pointer ${borderStyles}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-200 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {rightNum}
                  </span>
                  <span className="text-xs text-slate-200 leading-relaxed">
                    <FormattedText text={def} inlineOnly={true} />
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {!matchingChecked && pairedLeftNum && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-600/40 text-violet-200 border border-violet-400/30 shrink-0">
                      Unido a [{pairedLeftNum}]
                    </span>
                  )}

                  {matchingChecked && (
                    isMatchCorrect ? (
                      <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        {pairedLeftNum}:{rightNum}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/30 text-rose-300 border border-rose-400/40 shrink-0 flex items-center gap-1">
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
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-sm shadow-lg shadow-violet-900/30 transition-all cursor-pointer"
        >
          Comprobar Emparejamientos ({Object.keys(matchingPairsMap).length}/{matchingPairs.length || 4})
        </button>
      )}
    </div>
  );
};
