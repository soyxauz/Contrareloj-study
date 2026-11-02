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
      <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.035] backdrop-blur-xl border border-white/[0.1] text-base sm:text-lg leading-loose text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_32px_-4px_rgba(0,0,0,0.4)]">
        {effectiveTemplateSentence.split(/(\{\d+\})/).map((part, pIdx) => {
          const match = part.match(/\{(\d+)\}/);
          if (match) {
            const slotIdx = parseInt(match[1], 10);
            const placed = placedChips[slotIdx];
            const isCorrectSlot = dragDropChecked && placed?.trim().toLowerCase() === effectiveBlanksCorrect?.[slotIdx]?.trim().toLowerCase();

            let slotBorder = 'border-dashed border-white/20 bg-white/[0.04] backdrop-blur-md text-slate-300';
            if (placed) slotBorder = 'border-solid border-white/40 bg-white/[0.09] backdrop-blur-xl text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]';
            if (dragDropChecked) {
              slotBorder = isCorrectSlot ? 'border-emerald-500/50 bg-emerald-500/[0.12] backdrop-blur-xl text-emerald-200 shadow-[inset_0_1px_0_rgba(52,211,153,0.3)] animate-cardCorrect' : 'border-rose-500/50 bg-rose-500/[0.12] backdrop-blur-xl text-rose-200 shadow-[inset_0_1px_0_rgba(251,113,133,0.3)] animate-cardError';
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
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2.5">
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
                className={`active-press px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                  isUsed
                    ? 'opacity-30 border-white/[0.04] bg-white/[0.01] text-slate-600 line-through'
                    : 'border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md text-slate-200 hover:text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
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
          className="active-press w-full py-3.5 rounded-2xl bg-white hover:bg-zinc-200 disabled:opacity-40 text-zinc-950 font-bold text-sm shadow-lg transition-colors cursor-pointer"
        >
          Comprobar Respuestas
        </button>
      )}
    </div>
  );
};
