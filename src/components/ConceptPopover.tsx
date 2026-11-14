import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Layers } from 'lucide-react';
import { useTheme } from '../services/themeService';
import type { GlossaryConcept } from '../utils/glossaryExtractor';

export interface ConceptPopoverProps {
  concept: GlossaryConcept | null;
  targetRect: DOMRect | null;
  onClose: () => void;
}

export const ConceptPopover: React.FC<ConceptPopoverProps> = ({
  concept,
  targetRect,
  onClose,
}) => {
  const { theme } = useTheme();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  // Calcular posición exacta con ajuste dinámico a la pantalla
  useLayoutEffect(() => {
    if (!targetRect || !concept) {
      setCoords(null);
      return;
    }

    const popoverEl = popoverRef.current;
    const popoverWidth = popoverEl ? popoverEl.offsetWidth : 320;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 160;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // Decidir si va arriba o abajo del término
    const spaceBelow = viewportHeight - targetRect.bottom;
    const placeBelow = spaceBelow >= popoverHeight + 16 || targetRect.top < popoverHeight + 16;
    const placement = placeBelow ? 'bottom' : 'top';

    // Coordenada vertical
    let top = 0;
    if (placement === 'bottom') {
      top = targetRect.bottom + scrollY + 10;
    } else {
      top = targetRect.top + scrollY - popoverHeight - 10;
    }

    // Coordenada horizontal (centrado sobre la palabra, con márgenes de 14px en los bordes)
    const targetCenterX = targetRect.left + scrollX + targetRect.width / 2;
    const rawLeft = targetCenterX - popoverWidth / 2;
    const left = Math.max(14 + scrollX, Math.min(scrollX + viewportWidth - popoverWidth - 14, rawLeft));

    // Posición de la flecha con respecto a la caja del popover
    const arrowLeft = Math.max(16, Math.min(popoverWidth - 16, targetCenterX - left));

    setCoords({
      top,
      left,
      arrowLeft,
      placement,
    });
  }, [targetRect, concept]);

  // Cerrar al hacer clic fuera o con tecla Escape
  useEffect(() => {
    if (!concept) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Bloquear eventos residuales inmediatos al abrir
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [concept, onClose]);

  if (!concept || !targetRect) return null;

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Definición de ${concept.term}`}
      className={`absolute z-[99999] w-[310px] sm:w-[360px] rounded-2xl p-4 sm:p-4.5 backdrop-blur-xl animate-fadeIn select-text ${
        coords ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${
        theme === 'light'
          ? 'bg-white/95 border border-slate-200/90 text-slate-900'
          : theme === 'kitty'
          ? 'bg-pink-50/95 border border-pink-200/90 text-pink-950'
          : 'bg-[#16102b]/95 border border-white/[0.12] text-white'
      }`}
      style={{
        top: coords ? `${coords.top}px` : '-9999px',
        left: coords ? `${coords.left}px` : '-9999px',
        boxShadow:
          theme === 'light'
            ? '0 16px 36px -6px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)'
            : theme === 'kitty'
            ? '0 16px 36px -6px rgba(236,72,153,0.18), 0 2px 8px rgba(236,72,153,0.1), inset 0 1px 0 rgba(255,255,255,0.95)'
            : '0 18px 44px -8px rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {/* Flecha conectora / Pointer hacia la palabra subrayada */}
      {coords && (
        <div
          className={`absolute w-3 h-3 rotate-45 pointer-events-none ${
            coords.placement === 'bottom'
              ? '-top-1.5 border-t border-l'
              : '-bottom-1.5 border-b border-r'
          } ${
            theme === 'light'
              ? 'bg-white border-slate-200/90'
              : theme === 'kitty'
              ? 'bg-pink-50 border-pink-200/90'
              : 'bg-[#16102b] border-white/[0.12]'
          }`}
          style={{
            left: `${coords.arrowLeft}px`,
            transform: 'translateX(-50%) rotate(45deg)',
          }}
        />
      )}

      {/* Cabecera: Título del Concepto + Botón Cerrar (✕) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm sm:text-[15px] leading-snug tracking-tight">
            {concept.term}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar definición"
          className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 -mr-1 -mt-1 active-press ${
            theme === 'light'
              ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              : theme === 'kitty'
              ? 'text-pink-400 hover:text-pink-700 hover:bg-pink-100'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <X className="w-4 h-4 stroke-[2.2]" />
        </button>
      </div>

      {/* Línea divisoria sutil */}
      <div
        className={`w-full h-px my-2.5 ${
          theme === 'light'
            ? 'bg-slate-200/80'
            : theme === 'kitty'
            ? 'bg-pink-200/80'
            : 'bg-white/[0.08]'
        }`}
      />

      {/* Cuerpo de la Definición */}
      <div className="space-y-2">
        <p
          className={`text-xs sm:text-[13px] leading-relaxed font-normal ${
            theme === 'light'
              ? 'text-slate-700'
              : theme === 'kitty'
              ? 'text-pink-900/90'
              : 'text-slate-200'
          }`}
        >
          {concept.definition}
        </p>

        {/* Micro-etiqueta de origen del concepto */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {concept.source === 'flashcard' ? (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                theme === 'light'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : theme === 'kitty'
                  ? 'bg-pink-100 text-pink-700 border border-pink-200'
                  : 'bg-violet-950/60 text-violet-300 border border-violet-500/30'
              }`}
            >
              <Layers className="w-2.5 h-2.5" />
              <span>Flashcard del Kit</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                theme === 'light'
                  ? 'bg-slate-100 text-slate-700 border border-slate-200'
                  : theme === 'kitty'
                  ? 'bg-pink-100/70 text-pink-700 border border-pink-200'
                  : 'bg-white/[0.05] text-slate-300 border border-white/10'
              }`}
            >
              <BookOpen className="w-2.5 h-2.5" />
              <span>Glosario de la Guía</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
