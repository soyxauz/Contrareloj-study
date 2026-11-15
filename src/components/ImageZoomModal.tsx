import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import { useTheme } from '../services/themeService';
import { cleanImageBlackBackground } from '../utils/imageCleaner';

export interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  onDelete?: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title = 'Visualización de Imagen',
  subtitle,
  caption,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  currentIndex,
  totalCount,
  onDelete
}) => {
  const { theme } = useTheme();
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [sanitizedUrl, setSanitizedUrl] = useState<string>(imageUrl);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zoomBadgeRef = useRef<HTMLSpanElement>(null);

  // Mantener referencias frescas para eventos nativos sin re-renders
  const zoomRef = useRef<number>(1);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const isInteractingRef = useRef<boolean>(false);

  const rafId = useRef<number | null>(null);
  const debounceSyncTimer = useRef<number | null>(null);

  // Garantizar fondo blanco puro en la imagen (eliminando negros de transparencia JPEG)
  useEffect(() => {
    let isCurrent = true;
    if (imageUrl) {
      setSanitizedUrl(imageUrl);
      cleanImageBlackBackground(imageUrl).then((cleaned) => {
        if (isCurrent && cleaned) {
          setSanitizedUrl(cleaned);
        }
      });
    }
    return () => {
      isCurrent = false;
    };
  }, [imageUrl]);

  // Actualiza la posición y escala de la imagen directamente en el DOM mediante GPU
  const applyTransform = useCallback((newX: number, newY: number, newZoom: number, animate = false) => {
    panRef.current = { x: newX, y: newY };
    zoomRef.current = newZoom;

    if (imgRef.current) {
      imgRef.current.style.transition = animate ? 'transform 180ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none';
      imgRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(${newZoom})`;
    }

    if (zoomBadgeRef.current) {
      zoomBadgeRef.current.textContent = `${Math.round(newZoom * 100)}%`;
    }

    if (debounceSyncTimer.current) {
      window.clearTimeout(debounceSyncTimer.current);
    }
    debounceSyncTimer.current = window.setTimeout(() => {
      setZoomLevel(newZoom);
      setPan({ x: newX, y: newY });
    }, 100);
  }, []);

  // Restablecer zoom al abrir o al cambiar de imagen
  useEffect(() => {
    if (isOpen) {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = 1;
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
      isDraggingRef.current = false;
      isInteractingRef.current = false;
      if (imgRef.current) {
        imgRef.current.style.transition = 'none';
        imgRef.current.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
      }
      if (zoomBadgeRef.current) {
        zoomBadgeRef.current.textContent = '100%';
      }
    }
  }, [isOpen, imageUrl]);

  // Controles de zoom
  const handleZoomIn = useCallback(() => {
    const next = Math.min(5, Math.round((zoomRef.current + 0.5) * 10) / 10);
    applyTransform(panRef.current.x, panRef.current.y, next, true);
  }, [applyTransform]);

  const handleZoomOut = useCallback(() => {
    const next = Math.max(1, Math.round((zoomRef.current - 0.5) * 10) / 10);
    const newX = next === 1 ? 0 : panRef.current.x;
    const newY = next === 1 ? 0 : panRef.current.y;
    applyTransform(newX, newY, next, true);
  }, [applyTransform]);

  const handleResetZoom = useCallback(() => {
    applyTransform(0, 0, 1, true);
  }, [applyTransform]);

  // Arrastre con ratón (Pan)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current <= 1) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    isInteractingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panRef.current };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || zoomRef.current <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      applyTransform(panStartRef.current.x + dx, panStartRef.current.y + dy, zoomRef.current, false);
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    setTimeout(() => {
      isInteractingRef.current = false;
    }, 80);
  };

  // Clic sobre la imagen: alternar entre 1x y 2x
  const handleImageClick = (e: React.MouseEvent) => {
    if (isInteractingRef.current) return;
    if (zoomRef.current === 1) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - (rect.left + rect.width / 2);
        const offsetY = e.clientY - (rect.top + rect.height / 2);
        applyTransform(-offsetX * 0.8, -offsetY * 0.8, 2, true);
      } else {
        applyTransform(0, 0, 2, true);
      }
    } else {
      handleResetZoom();
    }
  };

  // Zoom focalizado con rueda de ratón (Wheel)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isOpen) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const currentZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      const nextZoom = Math.min(5, Math.max(1, Math.round(currentZoom * factor * 100) / 100));
      if (nextZoom === currentZoom) return;

      if (nextZoom === 1) {
        applyTransform(0, 0, 1, true);
        return;
      }

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const scaleChange = nextZoom / currentZoom;
      const newX = mouseX - (mouseX - panRef.current.x) * scaleChange;
      const newY = mouseY - (mouseY - panRef.current.y) * scaleChange;

      applyTransform(newX, newY, nextZoom, false);
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, [isOpen, applyTransform]);

  // Navegación por teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleResetZoom();
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleResetZoom, hasPrev, onPrev, hasNext, onNext]);

  // Bloquear scroll de la página mientras el modal está activo
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-6xl max-h-[94vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl transition-transform duration-160 ease-out ${
          theme === 'dark'
            ? 'bg-zinc-950/98 border-white/20 shadow-black/90'
            : theme === 'kitty'
            ? 'bg-pink-950/98 border-pink-400/40 shadow-pink-950/40'
            : 'bg-white border-slate-300 shadow-slate-900/40'
        }`}
        style={{
          boxShadow:
            theme === 'dark'
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 20px 40px -15px rgba(0,0,0,0.9)'
              : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Visor */}
        <div className={`shrink-0 px-4 sm:px-6 py-3 border-b flex items-center justify-between gap-3 ${
          theme === 'dark'
            ? 'bg-zinc-900/95 border-zinc-800 text-white'
            : theme === 'kitty'
            ? 'bg-pink-900/90 border-pink-800 text-white'
            : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}>
          {/* Título y Subtítulo */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold truncate tracking-tight">
                {title}
              </h3>
              {totalCount && totalCount > 1 && currentIndex !== undefined && (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-zinc-300 border border-white/10 tabular-nums">
                  {currentIndex + 1} / {totalCount}
                </span>
              )}
            </div>
            {subtitle && (
              <p className={`text-xs truncate mt-0.5 ${
                theme === 'dark' ? 'text-zinc-400' : theme === 'kitty' ? 'text-pink-200' : 'text-slate-500'
              }`}>
                {subtitle}
              </p>
            )}
          </div>

          {/* Barra de Acciones y Controles de Zoom */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Indicador de Zoom */}
            <span
              ref={zoomBadgeRef}
              className={`hidden sm:inline-block px-2.5 py-1 rounded-xl text-xs font-bold border tabular-nums ${
                theme === 'dark'
                  ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300'
                  : theme === 'kitty'
                  ? 'bg-pink-100 border-pink-200 text-pink-700'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {Math.round(zoomLevel * 100)}%
            </span>

            {/* Alejar Zoom */}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              title="Alejar (-)"
              className={`p-2 rounded-xl border transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                theme === 'dark'
                  ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/10'
                  : theme === 'kitty'
                  ? 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-zinc-950 hover:bg-slate-100 shadow-xs'
              }`}
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            {/* Restablecer Zoom */}
            <button
              type="button"
              onClick={handleResetZoom}
              disabled={zoomLevel === 1}
              title="Restablecer vista (0 o R)"
              className={`p-2 rounded-xl border transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                theme === 'dark'
                  ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/10'
                  : theme === 'kitty'
                  ? 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-zinc-950 hover:bg-slate-100 shadow-xs'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Acercar Zoom */}
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 5}
              title="Acercar (+)"
              className={`p-2 rounded-xl border transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                theme === 'dark'
                  ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/10'
                  : theme === 'kitty'
                  ? 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-zinc-950 hover:bg-slate-100 shadow-xs'
              }`}
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="h-5 w-px bg-white/10 mx-0.5 hidden sm:block" />

            {/* Descargar Imagen */}
            {sanitizedUrl && (
              <a
                href={sanitizedUrl}
                download="figura-documento.jpg"
                title="Descargar imagen en alta resolución con fondo limpio"
                className={`p-2 rounded-xl border transition-colors active:scale-95 ${
                  theme === 'dark'
                    ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/10'
                    : theme === 'kitty'
                    ? 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:text-zinc-950 hover:bg-slate-100 shadow-xs'
                }`}
              >
                <Download className="w-4 h-4" />
              </a>
            )}

            {/* Eliminar de la Galería */}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('¿Deseas eliminar esta figura del material de estudio?')) {
                    onDelete();
                    onClose();
                  }
                }}
                title="Eliminar figura del kit"
                className={`p-2 rounded-xl border transition-colors active:scale-95 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500/30'
                    : 'bg-rose-50 border-rose-200 text-rose-600 hover:text-rose-700 hover:bg-rose-100 shadow-xs'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Cerrar Visor */}
            <button
              type="button"
              onClick={onClose}
              title="Cerrar visor (Escape)"
              className={`p-2 rounded-xl border transition-colors active:scale-95 cursor-pointer ${
                theme === 'dark'
                  ? 'text-zinc-400 hover:text-white hover:bg-white/[0.05] border-white/[0.08]'
                  : theme === 'kitty'
                  ? 'text-pink-700 hover:text-pink-950 hover:bg-pink-100/70 border-pink-200 shadow-xs'
                  : 'text-slate-600 hover:text-zinc-950 hover:bg-slate-100 border-slate-200 shadow-xs'
              }`}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Visor */}
        <div className="relative flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Área Central de Visualización y Zoom: Fondo Blanco Puro */}
          <div
            ref={containerRef}
            className="relative flex-1 min-h-0 min-w-0 bg-white overflow-hidden flex items-center justify-center p-4 cursor-default select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Botón Imagen Anterior */}
            {hasPrev && onPrev && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrev();
                }}
                title="Imagen anterior (Flecha izquierda)"
                className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full border shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-zinc-900/90 hover:bg-violet-600 border-zinc-700 text-white'
                    : theme === 'kitty'
                    ? 'bg-white/95 hover:bg-pink-50 border-pink-200 text-pink-700 shadow-pink-200/50'
                    : 'bg-white/95 hover:bg-slate-100 border-slate-300 text-zinc-900 shadow-slate-300/60'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Botón Imagen Siguiente */}
            {hasNext && onNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                title="Imagen siguiente (Flecha derecha)"
                className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full border shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-zinc-900/90 hover:bg-violet-600 border-zinc-700 text-white'
                    : theme === 'kitty'
                    ? 'bg-white/95 hover:bg-pink-50 border-pink-200 text-pink-700 shadow-pink-200/50'
                    : 'bg-white/95 hover:bg-slate-100 border-slate-300 text-zinc-900 shadow-slate-300/60'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* Contenedor Centrado de la Imagen */}
            <div className="flex items-center justify-center w-full h-full pointer-events-none">
              {sanitizedUrl ? (
                <img
                  ref={imgRef}
                  src={sanitizedUrl}
                  alt={caption || title}
                  style={{
                    transform: 'translate3d(0px, 0px, 0) scale(1)',
                    transformOrigin: 'center center',
                    willChange: 'transform',
                  }}
                  className={`max-h-[70vh] sm:max-h-[74vh] max-w-full object-contain rounded-xl pointer-events-auto bg-white p-2 ${
                    zoomLevel > 1
                      ? isDragging
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                      : 'cursor-zoom-in'
                  }`}
                  onClick={handleImageClick}
                  draggable={false}
                />
              ) : (
                <div className="text-center text-slate-500 space-y-2 pointer-events-auto">
                  <ImageIcon className="w-12 h-12 mx-auto opacity-40" />
                  <p className="text-xs">No se pudo cargar la imagen seleccionada.</p>
                </div>
              )}
            </div>

            {/* Indicador de ayuda al usuario */}
            <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10 px-3.5 py-1 rounded-full border text-[11px] font-medium shadow-md ${
              theme === 'dark'
                ? 'bg-slate-900/85 border-slate-700 text-white'
                : theme === 'kitty'
                ? 'bg-white/90 border-pink-200 text-pink-900 shadow-pink-200/40'
                : 'bg-white/95 border-slate-300 text-slate-800 shadow-slate-200/50'
            }`}>
              {zoomLevel > 1
                ? 'Rueda para zoom focalizado'
                : 'Gira la rueda del ratón o haz clic para ampliar'}
            </div>
          </div>
        </div>

        {/* Pie del Visor con Descripción / Caption */}
        {caption && (
          <div className={`shrink-0 px-4 sm:px-6 py-3 border-t text-xs flex items-start gap-2.5 ${
            theme === 'dark'
              ? 'bg-thea-surfaceLight/80 border-thea-border/80 text-slate-300'
              : theme === 'kitty'
              ? 'bg-pink-50/50 border-pink-100 text-pink-900'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <span className={`font-semibold shrink-0 ${theme === 'kitty' ? 'text-pink-600 font-bold' : 'text-rose-600 font-bold dark:text-violet-300'}`}>
              Descripción:
            </span>
            <p className="leading-relaxed line-clamp-2">{caption}</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
