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
    <div className="space-y-6 mb-8">
      <p className="text-sm text-slate-300 font-medium">
        Haz clic o arrastra las fichas de abajo para rellenar los espacios correspondientes:
      </p>

      {/* Template sentence with interactive slots */}
      <div className="p-5 sm:p-6 rounded-2xl bg-thea-surfaceLight/70 border border-thea-border text-lg sm:text-xl leading-loose text-slate-100 shadow-inner">
        {effectiveTemplateSentence.split(/(\{\d+\})/).map((part, pIdx) => {
          const match = part.match(/\{(\d+)\}/);
          if (match) {
            const slotIdx = parseInt(match[1], 10);
            const placed = placedChips[slotIdx];
            const isCorrectSlot = dragDropChecked && placed?.trim().toLowerCase() === effectiveBlanksCorrect?.[slotIdx]?.trim().toLowerCase();

            let slotBorder = 'border-dashed border-violet-400/80 bg-violet-950/30 text-violet-300';
            if (placed) slotBorder = 'border-solid border-violet-500 bg-violet-600/30 text-white font-bold';
            if (dragDropChecked) {
              slotBorder = isCorrectSlot ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 animate-cardCorrect' : 'border-rose-500 bg-rose-950/40 text-rose-200 animate-cardError';
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
                className={`inline-flex items-center gap-1.5 px-3 py-1 mx-1.5 rounded-xl border text-base transition-colors duration-150 cursor-pointer ${slotBorder}`}
              >
                <span>{placed || `[ Espacio ${slotIdx + 1} ]`}</span>
                {placed && !isAnswered && <X className="w-3 h-3 text-slate-400 hover:text-white" />}
              </button>
            );
          }
          return <span key={pIdx}>{part}</span>;
        })}
      </div>

      {/* Word Bank */}
      <div>
        <span className="text-xs font-bold text-violet-300 uppercase tracking-wider block mb-2.5">
          Banco de Fichas ({effectiveWordBank.length}):
        </span>
        <div className="flex flex-wrap gap-2.5">
          {effectiveWordBank.map((chip, cIdx) => {
            const isUsed = placedChips.includes(chip);
            return (
              <button
                key={cIdx}
                type="button"
                disabled={isAnswered || isUsed}
                draggable={!isAnswered && !isUsed}
                onDragStart={() => onSetDraggedChip(chip)}
                onDragEnd={() => onSetDraggedChip(null)}
                onClick={() => onPlaceChip(chip)}
                className={`px-3.5 py-2 rounded-xl text-sm sm:text-base font-semibold border transition-colors duration-150 active:scale-[0.985] cursor-pointer ${
                  isUsed
                    ? 'opacity-30 border-thea-border bg-thea-surfaceLight text-slate-600 line-through'
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
        <div className={`p-4 sm:p-5 rounded-2xl border shadow-lg animate-fadeIn ${
          theme === 'kitty'
            ? 'bg-pink-50/90 border-pink-200 text-pink-950 shadow-pink-100/50'
            : theme === 'light'
            ? 'bg-emerald-50/90 border-emerald-300 text-slate-900 shadow-emerald-100/50'
            : 'bg-emerald-950/30 border-emerald-500/40 text-slate-100 shadow-black/40 ring-1 ring-emerald-500/20'
        }`}>
          <div className="flex items-center gap-2 mb-2.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              theme === 'kitty' ? 'bg-pink-500 text-white' : 'bg-emerald-500 text-slate-950'
            }`}>
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span className={`text-xs font-extrabold uppercase tracking-wider ${
              theme === 'kitty' ? 'text-pink-600' : 'text-emerald-400'
            }`}>
              Oración completa con las palabras correctas:
            </span>
          </div>

          <p className={`text-lg sm:text-xl leading-relaxed ${
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
                    className={`inline-flex items-center px-2.5 py-0.5 mx-1 rounded-lg font-bold shadow-sm ${
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
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-sm shadow-lg shadow-violet-900/30 transition-transform duration-160 ease-out active:scale-[0.985] cursor-pointer"
        >
          Comprobar Respuestas
        </button>
      )}
    </div>
  );
};
