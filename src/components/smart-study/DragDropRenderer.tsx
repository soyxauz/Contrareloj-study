import React from 'react';
import { X, Check } from 'lucide-react';
import { useTheme } from '../../services/themeService';

export interface DragDropRendererProps {
  effectiveTemplateSentence: string;
  effectiveBlanksCorrect: string[];
  effectiveWordBank: string[];
  placedChips: (string | null)[];
  dragDropChecked: boolean;
  isAnswered: boolean;
  draggedChip: string | null;
  onSetDraggedChip: (chip: string | null) => void;
  onPlaceChip: (chip: string, slotIdx?: number) => void;
  onRemovePlacedChip: (slotIdx: number) => void;
  onCheckDragDrop: () => void;
}

export const DragDropRenderer: React.FC<DragDropRendererProps> = ({
  effectiveTemplateSentence,
  effectiveBlanksCorrect,
  effectiveWordBank,
  placedChips,
  dragDropChecked,
  isAnswered,
  draggedChip,
  onSetDraggedChip,
  onPlaceChip,
  onRemovePlacedChip,
  onCheckDragDrop,
}) => {
  const { theme } = useTheme();

  return (
    <div className="space-y-3 sm:space-y-3.5 mb-3 sm:mb-4 w-full max-w-full min-w-0">
      <p className="text-xs sm:text-[13px] text-slate-300 font-medium">
        Haz clic o arrastra las fichas de abajo para rellenar los espacios correspondientes:
      </p>

      {/* Template sentence with interactive slots */}
      <div className={`p-3.5 sm:p-4 rounded-2xl border text-[15px] sm:text-[16px] leading-relaxed shadow-inner w-full max-w-full min-w-0 break-words ${
        theme === 'kitty'
          ? 'bg-white/95 border-pink-200 text-pink-950 shadow-pink-100/50'
          : theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-slate-100/50'
          : 'bg-thea-surfaceLight/70 border-thea-border text-slate-100'
      }`}>
        {effectiveTemplateSentence.split(/(\{\d+\})/).map((part, pIdx) => {
          const match = part.match(/\{(\d+)\}/);
          if (match) {
            const slotIdx = parseInt(match[1], 10);
            const placed = placedChips[slotIdx];
            const isCorrectSlot = dragDropChecked && placed?.trim().toLowerCase() === effectiveBlanksCorrect?.[slotIdx]?.trim().toLowerCase();

            let slotBorder = theme === 'kitty'
              ? 'border-dashed border-pink-300 bg-pink-50/70 text-pink-700'
              : theme === 'light'
              ? 'border-dashed border-slate-300 bg-slate-50 text-slate-700'
              : 'border-dashed border-violet-400/80 bg-violet-950/30 text-violet-300';

            if (placed) {
              slotBorder = theme === 'kitty'
                ? 'border-solid border-pink-400 bg-pink-100 text-pink-900 font-bold shadow-xs'
                : theme === 'light'
                ? 'border-solid border-indigo-300 bg-indigo-50 text-indigo-900 font-bold shadow-xs'
                : 'border-solid border-violet-500 bg-violet-600/30 text-white font-bold';
            }

            if (dragDropChecked) {
              slotBorder = isCorrectSlot
                ? theme === 'dark'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 animate-cardCorrect'
                  : 'border-emerald-500 bg-emerald-100 text-emerald-900 font-bold animate-cardCorrect shadow-xs'
                : theme === 'dark'
                ? 'border-rose-500 bg-rose-950/40 text-rose-200 animate-cardError'
                : 'border-rose-500 bg-rose-100 text-rose-900 font-bold animate-cardError shadow-xs';
            }

            return (
              <button
                key={pIdx}
                type="button"
                disabled={isAnswered}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedChip) onPlaceChip(draggedChip, slotIdx);
                }}
                onClick={() => placed && onRemovePlacedChip(slotIdx)}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 mx-1 rounded-xl border text-xs sm:text-sm font-semibold transition-colors duration-150 cursor-pointer ${slotBorder}`}
              >
                <span>{placed || `[ Espacio ${slotIdx + 1} ]`}</span>
                {placed && !isAnswered && <X className={`w-3 h-3 ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'}`} />}
              </button>
            );
          }
          return <span key={pIdx}>{part}</span>;
        })}
      </div>

      {/* Word Bank */}
      <div>
        <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${
          theme === 'kitty' ? 'text-pink-700 font-black' : theme === 'light' ? 'text-indigo-700 font-black' : 'text-violet-300'
        }`}>
          Banco de Fichas (<span className="tabular-nums">{effectiveWordBank.length}</span>):
        </span>
        <div className="flex flex-wrap gap-2">
          {effectiveWordBank.map((chip, cIdx) => {
            const chipClean = chip.trim().toLowerCase();
            // Soporte robusto de multiplicidad: si un token aparece múltiples veces en el banco,
            // verificar cuántas ocurrencias de este token específico han sido colocadas en los slots.
            const countInBankSoFar = effectiveWordBank
              .slice(0, cIdx + 1)
              .filter(c => c && c.trim().toLowerCase() === chipClean).length;
            const countPlaced = placedChips
              .filter(c => c && c.trim().toLowerCase() === chipClean).length;
            const isUsed = countPlaced >= countInBankSoFar;

            return (
              <button
                key={cIdx}
                type="button"
                disabled={isAnswered || isUsed}
                draggable={!isAnswered && !isUsed}
                onDragStart={() => onSetDraggedChip(chip)}
                onDragEnd={() => onSetDraggedChip(null)}
                onClick={() => onPlaceChip(chip)}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-[13px] font-semibold border transition-[transform,colors,opacity] duration-160 ease-out active:scale-[0.985] cursor-pointer ${
                  isUsed
                    ? theme === 'kitty'
                      ? 'opacity-30 border-pink-200 bg-pink-50 text-pink-400 line-through cursor-not-allowed'
                      : theme === 'light'
                      ? 'opacity-30 border-slate-200 bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                      : 'opacity-30 border-thea-border bg-thea-surfaceLight text-slate-600 line-through cursor-not-allowed'
                    : theme === 'kitty'
                    ? 'border-pink-200 bg-white hover:border-pink-400 hover:bg-pink-50 text-pink-950 shadow-xs'
                    : theme === 'light'
                    ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs'
                    : 'border-thea-border bg-thea-surfaceLight text-slate-200 hover:border-violet-500 hover:text-white hover:bg-violet-950/40'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Oración completa con las palabras correctas (Exclusivo para este tipo de preguntas) ── */}
      {(dragDropChecked || isAnswered) && (
        <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-lg animate-fadeIn ${
          theme === 'kitty'
            ? 'bg-pink-50/90 border-pink-200 text-pink-950 shadow-pink-100/50'
            : theme === 'light'
            ? 'bg-emerald-50/90 border-emerald-300 text-slate-900 shadow-emerald-100/50'
            : 'bg-emerald-950/30 border-emerald-500/40 text-slate-100 shadow-black/40 ring-1 ring-emerald-500/20'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              theme === 'kitty' ? 'bg-pink-500 text-white' : 'bg-emerald-500 text-slate-950'
            }`}>
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
              theme === 'kitty' ? 'text-pink-600' : 'text-emerald-400'
            }`}>
              Oración completa con las palabras correctas:
            </span>
          </div>

          <p className={`text-[14px] sm:text-[15px] leading-relaxed ${
            theme === 'kitty' ? 'text-pink-950 font-medium' : theme === 'light' ? 'text-slate-800 font-medium' : 'text-slate-100'
          }`}>
            {effectiveTemplateSentence.split(/(\{\d+\})/).map((part, pIdx) => {
              const match = part.match(/\{(\d+)\}/);
              if (match) {
                const slotIdx = parseInt(match[1], 10);
                const correctWord = effectiveBlanksCorrect?.[slotIdx] || '';
                return (
                  <strong
                    key={pIdx}
                    className={`inline-flex items-center px-2 py-0.5 mx-1 rounded-lg text-xs sm:text-sm font-bold shadow-xs ${
                      theme === 'kitty'
                        ? 'bg-pink-100 border border-pink-300 text-pink-700'
                        : theme === 'light'
                        ? 'bg-emerald-100 border border-emerald-400 text-emerald-900'
                        : 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                    }`}
                  >
                    {correctWord}
                  </strong>
                );
              }
              return <span key={pIdx}>{part}</span>;
            })}
          </p>
        </div>
      )}

      {!isAnswered && (
        <button
          type="button"
          disabled={placedChips.some(c => c === null) || placedChips.length < effectiveBlanksCorrect.length}
          onClick={onCheckDragDrop}
          className={`w-full py-2.5 sm:py-3 rounded-xl disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm shadow-md transition-transform duration-160 ease-out active:scale-[0.985] cursor-pointer ${
            theme === 'kitty'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 shadow-pink-300/40'
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-900/30'
          }`}
        >
          Comprobar Respuestas
        </button>
      )}
    </div>
  );
};
