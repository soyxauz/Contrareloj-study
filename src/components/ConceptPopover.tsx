import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '../services/themeService';
import type { GlossaryConcept } from '../utils/glossaryExtractor';
import { FormattedText } from './FormattedText';
import {
  getAccurateDefinitionSync,
  fetchGoogleAccurateDefinition,
} from '../services/conceptDefinitionService';

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

  const [definitionText, setDefinitionText] = useState(() => {
    if (!concept) return '';
    return getAccurateDefinitionSync(concept.term, concept.definition);
  });

  useEffect(() => {
    if (!concept) {
      setDefinitionText('');
      return;
    }
    const syncDef = getAccurateDefinitionSync(concept.term, concept.definition);
    setDefinitionText(syncDef);

    // Obtener definición certera estilo Google / Enciclopedia si no estaba en caché
    fetchGoogleAccurateDefinition(concept.term, concept.definition).then((resolved) => {
      if (resolved && resolved !== syncDef) {
        setDefinitionText(resolved);
      }
    });
  }, [concept]);

  // Calcular posición exacta con ajuste dinámico y clamping estricto al viewport
  useLayoutEffect(() => {
    if (!targetRect || !concept) {
      setCoords(null);
      return;
    }

    const popoverEl = popoverRef.current;
    const popoverWidth = popoverEl ? popoverEl.offsetWidth : 350;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 180;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // Espacios disponibles arriba y abajo del elemento subrayado
    const spaceBelow = viewportHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    // Colocar abajo si hay suficiente espacio o si abajo hay más espacio que arriba
    const placeBelow = spaceBelow >= popoverHeight + 16 || spaceBelow >= spaceAbove;
    const placement = placeBelow ? 'bottom' : 'top';

    // Coordenada vertical
    let top = 0;
    if (placement === 'bottom') {
      top = targetRect.bottom + scrollY + 10;
    } else {
      top = targetRect.top + scrollY - popoverHeight - 10;
    }

    // Clamping vertical estricto para que la cabecera, título y botón de cierre nunca queden fuera de la pantalla
    const minTop = scrollY + 14;
    const maxTop = Math.max(minTop, scrollY + viewportHeight - popoverHeight - 14);
    top = Math.max(minTop, Math.min(maxTop, top));

    // Coordenada horizontal (centrado sobre la palabra con márgenes de seguridad de 14px)
    const targetCenterX = targetRect.left + scrollX + targetRect.width / 2;
    const rawLeft = targetCenterX - popoverWidth / 2;
    const left = Math.max(14 + scrollX, Math.min(scrollX + viewportWidth - popoverWidth - 14, rawLeft));

    // Posición de la flecha con respecto a la caja del popover
    const arrowLeft = Math.max(18, Math.min(popoverWidth - 18, targetCenterX - left));

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
      className={`absolute z-[99999] w-[320px] sm:w-[380px] max-h-[85vh] overflow-y-auto rounded-2xl p-4 sm:p-5 backdrop-blur-xl animate-fadeIn select-text ${
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
            ? '0 20px 48px -10px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)'
            : theme === 'kitty'
            ? '0 20px 48px -10px rgba(236,72,153,0.22), 0 2px 8px rgba(236,72,153,0.12), inset 0 1px 0 rgba(255,255,255,0.95)'
            : '0 22px 50px -10px rgba(0,0,0,0.75), 0 2px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {/* Flecha conectora / Pointer hacia la palabra subrayada */}
      {coords && (
        <div
          className={`absolute w-3.5 h-3.5 rotate-45 pointer-events-none ${
            coords.placement === 'bottom'
              ? '-top-2 border-t border-l'
              : '-bottom-2 border-b border-r'
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
          className={`p-1 rounded-lg transition-transform duration-150 cursor-pointer shrink-0 -mr-1 -mt-1 active:scale-95 ${
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

      {/* Cuerpo de la Definición con soporte enriquecido para KaTeX y Markdown */}
      <div
        className={`text-xs sm:text-[13px] leading-relaxed font-normal ${
          theme === 'light'
            ? 'text-slate-700'
            : theme === 'kitty'
            ? 'text-pink-900/90'
            : 'text-slate-200'
        }`}
      >
        <FormattedText text={definitionText || concept.definition} inlineOnly={false} />
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
