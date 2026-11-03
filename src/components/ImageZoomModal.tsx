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
  Image as ImageIcon
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
  totalCount
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

  // Aplicar transformación 3D acelerada por hardware directa al nodo DOM
  const applyTransform = useCallback((x: number, y: number, zoom: number, animate = false) => {
    if (imgRef.current) {
      imgRef.current.style.transition = animate
        ? 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)'
        : 'none';
      imgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
    }
    if (zoomBadgeRef.current) {
      zoomBadgeRef.current.textContent = `${Math.round(zoom * 100)}%`;
    }
  }, []);

  // Sincronizar estado React de forma diferida (debounced) para no degradar los 120 FPS
  const scheduleStateSync = useCallback((zoom: number, nextPan: { x: number; y: number }) => {
    if (debounceSyncTimer.current !== null) {
      window.clearTimeout(debounceSyncTimer.current);
    }
    debounceSyncTimer.current = window.setTimeout(() => {
      setZoomLevel(zoom);
      setPan(nextPan);
      debounceSyncTimer.current = null;
    }, 120);
  }, []);

  // Resetear zoom y paneo cada vez que cambia la imagen o se abre el modal
  useEffect(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    isInteractingRef.current = false;
    applyTransform(0, 0, 1, false);
  }, [imageUrl, isOpen, applyTransform]);

  // Bloquear scroll de fondo de forma limpia
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Funciones de control de zoom mediante botones con animación elástica suave
  const handleZoomIn = useCallback(() => {
    const next = Math.min(Number((zoomRef.current + 0.35).toFixed(2)), 4.0);
    zoomRef.current = next;
    applyTransform(panRef.current.x, panRef.current.y, next, true);
    setZoomLevel(next);
  }, [applyTransform]);

  const handleZoomOut = useCallback(() => {
    const next = Math.max(Number((zoomRef.current - 0.35).toFixed(2)), 0.5);
    zoomRef.current = next;
    if (next <= 1) {
      panRef.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
      applyTransform(0, 0, next, true);
    } else {
      applyTransform(panRef.current.x, panRef.current.y, next, true);
    }
    setZoomLevel(next);
  }, [applyTransform]);

  const handleResetZoom = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
    applyTransform(0, 0, 1, true);
  }, [applyTransform]);

  // Control mediante teclado
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleResetZoom, hasPrev, hasNext, onPrev, onNext]);

  // Soporte de 120 FPS para rueda del ratón con actualización DOM directa sin re-renders
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    let pendingWheelEvent: WheelEvent | null = null;
    let wheelRaf: number | null = null;

    const processWheel = () => {
      if (!pendingWheelEvent) return;
      const e = pendingWheelEvent;
      pendingWheelEvent = null;

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      const rawStep = -e.deltaY * 0.0035;
      const clampedStep = Math.min(Math.max(rawStep, -0.45), 0.45);
      const newZoom = Math.min(Math.max(Number((currentZoom + clampedStep).toFixed(2)), 0.5), 4.5);

      if (newZoom === currentZoom) return;

      if (newZoom <= 1) {
        zoomRef.current = newZoom;
        panRef.current = { x: 0, y: 0 };
        applyTransform(0, 0, newZoom, false);
        scheduleStateSync(newZoom, { x: 0, y: 0 });
        return;
      }

      const rect = container.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);

      const ratio = newZoom / currentZoom;
      const newPanX = Math.round(cx - (cx - currentPan.x) * ratio);
      const newPanY = Math.round(cy - (cy - currentPan.y) * ratio);

      zoomRef.current = newZoom;
      panRef.current = { x: newPanX, y: newPanY };
      applyTransform(newPanX, newPanY, newZoom, false);
      scheduleStateSync(newZoom, { x: newPanX, y: newPanY });
    };

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pendingWheelEvent = e;
      isInteractingRef.current = true;

      if (wheelRaf === null) {
        wheelRaf = requestAnimationFrame(() => {
          wheelRaf = null;
          processWheel();
        });
      }
    };

    container.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheelNative);
      if (wheelRaf !== null) cancelAnimationFrame(wheelRaf);
    };
  }, [isOpen, applyTransform, scheduleStateSync]);

  // Arrastre a 120 FPS sin repaints ni layout thrashing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current <= 1) return;
    if (e.button !== 0) return;
    setIsDragging(true);
    isDraggingRef.current = true;
    isInteractingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panRef.current };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || zoomRef.current <= 1) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const nextX = panStartRef.current.x + deltaX;
    const nextY = panStartRef.current.y + deltaY;

    panRef.current = { x: nextX, y: nextY };

    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        applyTransform(panRef.current.x, panRef.current.y, zoomRef.current, false);
      });
    }
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      setIsDragging(false);
      isDraggingRef.current = false;
      isInteractingRef.current = false;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      setPan({ ...panRef.current });
    }
  };

  const handleImageClick = () => {
    if (Math.abs(panRef.current.x - panStartRef.current.x) > 6 || Math.abs(panRef.current.y - panStartRef.current.y) > 6) {
      return;
    }
    if (zoomRef.current === 1) {
      const target = 1.75;
      zoomRef.current = target;
      applyTransform(0, 0, target, true);
      setZoomLevel(target);
    } else if (zoomRef.current < 2.5) {
      const target = 2.8;
      zoomRef.current = target;
      applyTransform(panRef.current.x, panRef.current.y, target, true);
      setZoomLevel(target);
    } else {
      handleResetZoom();
    }
  };

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const zoomPercent = Math.round(zoomLevel * 100);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/70 select-none animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-5xl h-[92vh] flex flex-col border rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden ${
          theme === 'dark'
            ? 'bg-[#0e0b16] border-white/10 text-white'
            : theme === 'kitty'
            ? 'bg-white border-pink-200 text-zinc-950 shadow-pink-200/40'
            : 'bg-white border-slate-200 text-zinc-950 shadow-slate-200/60'
        }`}
      >
        {/* Cabecera del Visor */}
        <div className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
          theme === 'dark'
            ? 'border-white/[0.06] bg-white/[0.02]'
            : theme === 'kitty'
            ? 'border-pink-100 bg-pink-50/70'
            : 'border-slate-100 bg-slate-50/90'
        }`}>
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
              theme === 'dark'
                ? 'bg-white/[0.04] border-white/10 text-zinc-300'
                : theme === 'kitty'
                ? 'bg-pink-100 border-pink-200 text-pink-700'
                : 'bg-rose-50 border-rose-200 text-rose-600'
            }`}>
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-sm sm:text-base font-bold truncate max-w-xs sm:max-w-md tracking-tight ${
                  theme === 'dark' ? 'text-white' : 'text-zinc-950'
                }`}>
                  {title}
                </h3>
                {currentIndex !== undefined && totalCount && totalCount > 1 && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border tabular-nums ${
                    theme === 'dark'
                      ? 'bg-white/[0.05] text-zinc-300 border-white/10'
                      : theme === 'kitty'
                      ? 'bg-pink-100 text-pink-800 border-pink-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {currentIndex + 1} / {totalCount}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className={`text-[11px] sm:text-xs truncate ${
                  theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
                }`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Barra de herramientas de Zoom y Acciones */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Controles de Zoom */}
            <div className={`flex items-center rounded-xl p-1 gap-1 border ${
              theme === 'dark'
                ? 'bg-white/[0.025] border-white/[0.08]'
                : theme === 'kitty'
                ? 'bg-pink-50/50 border-pink-200'
                : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                title="Alejar (-)"
                className={`p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95 cursor-pointer ${
                  theme === 'dark'
                    ? 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                    : theme === 'kitty'
                    ? 'text-pink-700 hover:text-pink-950 hover:bg-pink-100/60'
                    : 'text-slate-700 hover:text-zinc-950 hover:bg-white'
                }`}
              >
                <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <span
                ref={zoomBadgeRef}
                className={`text-[11px] font-bold px-1.5 min-w-[42px] text-center font-mono tabular-nums ${
                  theme === 'dark'
                    ? 'text-zinc-200'
                    : theme === 'kitty'
                    ? 'text-pink-900'
                    : 'text-zinc-950'
                }`}
              >
                {zoomPercent}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 4.0}
                title="Acercar (+)"
                className={`p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95 cursor-pointer ${
                  theme === 'dark'
                    ? 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                    : theme === 'kitty'
                    ? 'text-pink-700 hover:text-pink-950 hover:bg-pink-100/60'
                    : 'text-slate-700 hover:text-zinc-950 hover:bg-white'
                }`}
              >
                <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                title="Restablecer tamaño (0 o R)"
                className={`p-1.5 rounded-lg transition-colors active:scale-95 cursor-pointer ${
                  theme === 'dark'
                    ? 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                    : theme === 'kitty'
                    ? 'text-pink-700 hover:text-pink-950 hover:bg-pink-100/60'
                    : 'text-slate-700 hover:text-zinc-950 hover:bg-white'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

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

        {/* Área Central de Visualización y Zoom: Fondo Blanco Puro en todos los temas */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 bg-white overflow-hidden flex items-center justify-center p-4 cursor-default select-none"
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
              className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full border shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
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
              className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full border shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
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
              ? 'Rueda para zoom focalizado • Arrastra para mover a 120 FPS'
              : 'Gira la rueda del ratón o haz clic para ampliar'}
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
