import React from 'react';
import { Compass, X } from 'lucide-react';

export interface ImageHotspot {
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
  hint?: string;
}

export interface ImageLabelingRendererProps {
  diagramTitle?: string;
  imageUrl?: string;
  topic?: string;
  explanation?: string;
  imageHotspots?: ImageHotspot[];
  imageWordBank?: string[];
  placedImageLabels: Record<string, string>;
  imageLabelChecked: boolean;
  activeLabelChip: string | null;
  isAnswered: boolean;
  onPlaceImageLabel: (hotspotId: string, label: string) => void;
  onRemoveImageLabel: (hotspotId: string) => void;
  onSetActiveLabelChip: (chip: string | null) => void;
  onCheckImageLabel: () => void;
}

export const ImageLabelingRenderer: React.FC<ImageLabelingRendererProps> = ({
  diagramTitle,
  imageUrl,
  topic = '',
  explanation = '',
  imageHotspots,
  imageWordBank,
  placedImageLabels,
  imageLabelChecked,
  activeLabelChip,
  isAnswered,
  onPlaceImageLabel,
  onRemoveImageLabel,
  onSetActiveLabelChip,
  onCheckImageLabel,
}) => {
  const effectiveHotspots: ImageHotspot[] = imageHotspots || [
    { id: 'pin-1', label: topic, xPercent: 30, yPercent: 35, hint: 'Fase 1' },
    { id: 'pin-2', label: explanation.slice(0, 20), xPercent: 70, yPercent: 65, hint: 'Fase 2' },
  ];

  const effectiveWordBank = imageWordBank || imageHotspots?.map(h => h.label) || [];

  return (
    <div className="space-y-6 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400 font-medium">
          Arrastra o selecciona un cuadro de texto del banco inferior y colócalo en el punto correspondiente del esquema:
        </p>
        {diagramTitle && (
          <span className="text-xs font-bold text-violet-300 px-2.5 py-1 rounded-lg bg-violet-950/40 border border-violet-500/30">
            {diagramTitle}
          </span>
        )}
      </div>

      {/* Canvas contenedor de la imagen o esquema pedagogico */}
      <div className="relative w-full rounded-2xl bg-gradient-to-br from-slate-950 via-thea-surface to-slate-900 border border-thea-border overflow-hidden min-h-[300px] sm:min-h-[360px] p-4 flex items-center justify-center shadow-inner select-none">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={diagramTitle || 'Diagrama de estudio'}
            className="max-h-80 object-contain mx-auto rounded-xl opacity-90"
          />
        ) : (
          <div className="w-full h-72 rounded-xl border border-dashed border-violet-500/30 bg-violet-950/15 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-300 mb-1">
              <Compass className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold text-slate-200">
              {diagramTitle || topic}
            </span>
            <span className="text-xs text-slate-400 max-w-sm">
              Ubica los cuadros de texto en las posiciones esquemáticas del diagrama.
            </span>
          </div>
        )}

        {/* Hotspots interactivos ubicados sobre el lienzo */}
        {effectiveHotspots.map((hotspot, hIdx) => {
          const placed = placedImageLabels[hotspot.id];
          const isCorrect = imageLabelChecked && placed?.trim().toLowerCase() === hotspot.label.trim().toLowerCase();

          let pinStyles = 'bg-violet-950/90 border-violet-400 text-violet-200 hover:border-violet-300 hover:scale-105';
          if (placed && !imageLabelChecked) {
            pinStyles = 'bg-indigo-600 text-white border-white shadow-lg shadow-indigo-900/50';
          }
          if (imageLabelChecked) {
            pinStyles = isCorrect
              ? 'bg-emerald-900/90 border-emerald-400 text-emerald-200 shadow-emerald-950/50'
              : 'bg-rose-900/90 border-rose-400 text-rose-200 shadow-rose-950/50';
          }

          return (
            <div
              key={hotspot.id}
              style={{
                left: `${Math.min(85, Math.max(12, hotspot.xPercent))}%`,
                top: `${Math.min(85, Math.max(12, hotspot.yPercent))}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onClick={() => {
                if (activeLabelChip) {
                  onPlaceImageLabel(hotspot.id, activeLabelChip);
                } else if (placed) {
                  onRemoveImageLabel(hotspot.id);
                }
              }}
              className={`absolute z-20 px-3 py-1.5 rounded-xl border backdrop-blur-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md max-w-[200px] truncate ${pinStyles}`}
              title={placed ? 'Clic para retirar cuadro' : (activeLabelChip ? `Colocar "${activeLabelChip}" aquí` : 'Toca una ficha de abajo para colocarla aquí')}
            >
              <span className="w-4 h-4 rounded-full bg-black/40 text-[10px] flex items-center justify-center shrink-0">
                {hIdx + 1}
              </span>
              <span className="truncate">
                {placed || (activeLabelChip ? 'Toca para ubicar' : (hotspot.hint || `Punto ${hIdx + 1}`))}
              </span>
              {placed && !isAnswered && (
                <X className="w-3 h-3 text-slate-300 hover:text-white shrink-0 ml-0.5" />
              )}
            </div>
          );
        })}
      </div>

      {/* Banco de Fichas / Cuadros de texto para mover */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Banco de Cuadros de Texto:
          </span>
          {activeLabelChip && (
            <span className="text-xs text-amber-300 font-medium">
              Ficha activa: <strong>{activeLabelChip}</strong> (toca un punto en la imagen)
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {effectiveWordBank.map((term, tIdx) => {
            const isUsed = Object.values(placedImageLabels).includes(term);
            const isSelected = activeLabelChip === term;

            return (
              <button
                key={tIdx}
                type="button"
                disabled={isAnswered || isUsed}
                onClick={() => onSetActiveLabelChip(isSelected ? null : term)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isUsed
                    ? 'opacity-30 border-thea-border bg-thea-surfaceLight text-slate-600 line-through'
                    : isSelected
                    ? 'border-amber-400 bg-amber-950/50 text-amber-200 ring-2 ring-amber-400 shadow-md scale-105'
                    : 'border-thea-border bg-thea-surfaceLight text-slate-200 hover:border-violet-500 hover:text-white hover:bg-violet-950/40 active:scale-95'
                }`}
              >
                <span>{term}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!isAnswered && (
        <button
          type="button"
          disabled={
            (effectiveHotspots.length || 2) > Object.keys(placedImageLabels).length
          }
          onClick={onCheckImageLabel}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
        >
          Comprobar Ubicaciones ({Object.keys(placedImageLabels).length}/{effectiveHotspots.length || 2})
        </button>
      )}
    </div>
  );
};
