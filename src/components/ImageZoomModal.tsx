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
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Mantener referencias frescas para eventos nativos sin reenganchar listeners
  const zoomRef = useRef<number>(zoomLevel);
  zoomRef.current = zoomLevel;
  const panRef = useRef<{ x: number; y: number }>(pan);
  panRef.current = pan;

  // Resetear zoom y paneo cada vez que cambia la imagen o se abre el modal
  useEffect(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }, [imageUrl, isOpen]);

  // Bloquear el scroll de la página de fondo mientras el visor está abierto
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Funciones de control de zoom con límites seguros
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 3.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(Number((prev - 0.25).toFixed(2)), 0.5);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Control mediante atajos de teclado
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

  // Soporte completo para zoom con la rueda del ratón (focalizado en la posición del puntero)
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      // Paso proporcional según velocidad o desplazamiento de la rueda/trackpad
      const rawStep = -e.deltaY * 0.002;
      const clampedStep = Math.min(Math.max(rawStep, -0.35), 0.35);
      const newZoom = Math.min(Math.max(Number((currentZoom + clampedStep).toFixed(2)), 0.5), 4.0);

      if (newZoom === currentZoom) return;

      if (newZoom <= 1) {
        setZoomLevel(newZoom);
        setPan({ x: 0, y: 0 });
        return;
      }

      // Zoom focalizado: centrar la ampliación en la coordenada exacta del cursor
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);

      const ratio = newZoom / currentZoom;
      const newPanX = cx - (cx - currentPan.x) * ratio;
      const newPanY = cy - (cy - currentPan.y) * ratio;

      setZoomLevel(newZoom);
      setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
    };

    container.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheelNative);
    };
  }, [isOpen]);

  // Arrastre suave para mover la imagen cuando hay zoom activo
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    if (e.button !== 0) return; // Solo botón principal izquierdo
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + deltaX,
      y: panStartRef.current.y + deltaY
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Clic en la imagen para ciclar entre niveles de zoom
  const handleImageClick = () => {
    // Si hubo arrastre significativo, no cambiar zoom
    if (Math.abs(pan.x - panStartRef.current.x) > 5 || Math.abs(pan.y - panStartRef.current.y) > 5) {
      return;
    }
    if (zoomLevel === 1) {
      setZoomLevel(1.5);
    } else if (zoomLevel === 1.5) {
      setZoomLevel(2.2);
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md select-none animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-thea-surface border border-thea-border/80 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Cabecera del Visor */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-thea-border/80 bg-thea-surfaceLight/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400 shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                  {title}
                </h3>
                {currentIndex !== undefined && totalCount && totalCount > 1 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    {currentIndex + 1} / {totalCount}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Barra de herramientas de Zoom y Acciones */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Controles de Zoom */}
            <div className="flex items-center bg-thea-bg/80 border border-thea-border rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                title="Alejar (-)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <span className="text-[11px] font-bold text-violet-300 px-1.5 min-w-[42px] text-center font-mono">
                {zoomPercent}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3.5}
                title="Acercar (+)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                title="Restablecer tamaño (0 o R)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            {/* Descargar Imagen */}
            {imageUrl && (
              <a
                href={imageUrl}
                download="figura-documento.png"
                title="Descargar imagen en alta resolución"
                className="p-2 rounded-xl bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-white hover:bg-violet-600 hover:border-violet-500 transition-colors"
              >
                <Download className="w-4 h-4" />
              </a>
            )}

            {/* Cerrar Visor */}
            <button
              type="button"
              onClick={onClose}
              title="Cerrar visor (Escape)"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight border border-thea-border/60 transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Área Central de Visualización y Zoom */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 bg-black/80 overflow-hidden flex items-center justify-center p-4 cursor-default select-none"
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
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-thea-surface/90 hover:bg-violet-600 border border-thea-border text-white shadow-xl flex items-center justify-center transition-all hover:scale-105"
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
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-thea-surface/90 hover:bg-violet-600 border border-thea-border text-white shadow-xl flex items-center justify-center transition-all hover:scale-105"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Contenedor Centrado de la Imagen */}
          <div className="flex items-center justify-center w-full h-full pointer-events-none">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={caption || title}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
                className={`max-h-[68vh] sm:max-h-[72vh] max-w-full object-contain rounded-lg shadow-2xl pointer-events-auto bg-white p-3 ${
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
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] text-slate-300">
            {zoomLevel > 1
              ? 'Rueda del ratón para zoom focalizado | Arrastra para mover | Clic para ciclar'
              : 'Gira la rueda del ratón o haz clic en la imagen para ampliar'}
          </div>
        </div>

        {/* Pie del Visor con Descripción / Caption */}
        {caption && (
          <div className="shrink-0 px-4 sm:px-6 py-3 bg-thea-surfaceLight/80 border-t border-thea-border/80 text-xs text-slate-300 flex items-start gap-2.5">
            <span className="font-semibold text-violet-300 shrink-0">Descripción:</span>
            <p className="leading-relaxed text-slate-200 line-clamp-2">{caption}</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
