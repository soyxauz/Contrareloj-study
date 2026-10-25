import React from 'react';
import { X } from 'lucide-react';

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
  return (
    <div className="space-y-6 mb-8">
      <p className="text-xs text-slate-300 font-medium">
        Haz clic o arrastra las fichas de abajo para rellenar los espacios correspondientes:
      </p>

      {/* Template sentence with interactive slots */}
      <div className="p-5 sm:p-6 rounded-2xl bg-thea-surfaceLight/70 border border-thea-border text-base sm:text-lg leading-loose text-slate-100 shadow-inner">
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
                className={`inline-flex items-center gap-1.5 px-3 py-1 mx-1.5 rounded-xl border text-sm transition-all duration-150 ease-out cursor-pointer ${slotBorder}`}
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
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                  isUsed
                    ? 'opacity-30 border-thea-border bg-thea-surfaceLight text-slate-600 line-through'
                    : 'border-thea-border bg-thea-surfaceLight text-slate-200 hover:border-violet-500 hover:text-white hover:bg-violet-950/40 active:scale-95'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      {!isAnswered && (
        <button
          type="button"
          disabled={placedChips.some(c => c === null) || placedChips.length < effectiveBlanksCorrect.length}
          onClick={onCheckDragDrop}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-sm shadow-lg shadow-violet-900/30 transition-all cursor-pointer"
        >
          Comprobar Respuestas
        </button>
      )}
    </div>
  );
};
