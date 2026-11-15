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

/**
 * Icono vectorial oficial estilizado de Google Lens
 */
const GoogleLensIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" stroke="#EA4335" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" stroke="#4285F4" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" stroke="#34A853" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" stroke="#FBBC05" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="12" r="3.2" stroke="#4285F4" strokeWidth="2" />
    <circle cx="12" cy="12" r="1.4" fill="#4285F4" />
  </svg>
);

/**
 * Copia una imagen local o base64 al portapapeles del sistema como PNG nativo
 */
const copyImageToClipboard = async (src: string): Promise<boolean> => {
  if (typeof window === 'undefined' || !navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': blob,
              }),
            ]);
            resolve(true);
          } catch (err) {
            console.warn('Fallo al escribir en el portapapeles:', err);
            resolve(false);
          }
        }, 'image/png');
      } catch (err) {
        console.warn('Fallo en procesamiento de canvas:', err);
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
};

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
  const [lensNotification, setLensNotification] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [isLensProcessing, setIsLensProcessing] = useState<boolean>(false);

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

  // Búsqueda visual en Google Lens (Híbrido inteligente: URL directa o copiado a portapapeles)
  const handleGoogleLens = useCallback(async () => {
    if (!sanitizedUrl || isLensProcessing) return;

    const isHttpUrl = sanitizedUrl.startsWith('http://') || sanitizedUrl.startsWith('https://');

    if (isHttpUrl) {
      const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(sanitizedUrl)}`;
      window.open(lensUrl, '_blank', 'noopener,noreferrer');
      setLensNotification({
        type: 'info',
        message: 'Abriendo Google Lens con la imagen del servidor...',
      });
      setTimeout(() => {
        setLensNotification(null);
      }, 4000);
      return;
    }

    // Para imágenes locales (base64 o blob URLs extraídas de PDF / diapositivas)
    setIsLensProcessing(true);
    setLensNotification({
      type: 'info',
      message: 'Copiando figura y abriendo Google Lens...',
    });

    try {
      const copied = await copyImageToClipboard(sanitizedUrl);
      window.open('https://lens.google.com/', '_blank', 'noopener,noreferrer');
      if (copied) {
        setLensNotification({
          type: 'success',
          message: '¡Figura copiada al portapapeles! Presiona Ctrl+V en la pestaña de Google Lens que se abrió.',
        });
      } else {
        setLensNotification({
          type: 'info',
          message: 'Abriendo Google Lens. Puedes pegar o arrastrar la imagen descargada.',
        });
      }
    } catch {
      window.open('https://lens.google.com/', '_blank', 'noopener,noreferrer');
      setLensNotification({
        type: 'info',
        message: 'Abriendo Google Lens para búsqueda visual.',
      });
    } finally {
      setIsLensProcessing(false);
      setTimeout(() => {
        setLensNotification(null);
      }, 6500);
    }
  }, [sanitizedUrl, isLensProcessing]);

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

            {/* Buscar con Google Lens */}
            {sanitizedUrl && (
              <button
                type="button"
                onClick={handleGoogleLens}
                disabled={isLensProcessing}
                title="Buscar con Google Lens (Copia imagen y abre Google Lens para pegar con Ctrl+V)"
                className={`p-2 rounded-xl border flex items-center gap-1.5 transition-transform duration-150 ease-out active:scale-[0.97] cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20'
                    : theme === 'kitty'
                    ? 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:text-zinc-950 hover:bg-slate-100 shadow-xs'
                }`}
              >
                <GoogleLensIcon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline text-xs font-semibold">Google Lens</span>
              </button>
            )}

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

        {/* Notificación de Google Lens */}
        {lensNotification && (
          <div
            className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-[92%] sm:max-w-md px-4 py-2.5 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-medium transition-transform duration-160 ease-out backdrop-blur-md animate-in fade-in zoom-in-95 ${
              theme === 'dark'
                ? 'bg-zinc-950/95 border-white/20 text-white shadow-black/80'
                : theme === 'kitty'
                ? 'bg-pink-950/95 border-pink-400/50 text-white shadow-pink-950/40'
                : 'bg-zinc-900/95 border-zinc-700 text-white shadow-zinc-900/50'
            }`}
          >
            <GoogleLensIcon className="w-4 h-4 shrink-0" />
            <span className="flex-1 leading-snug">{lensNotification.message}</span>
            <button
              type="button"
              onClick={() => setLensNotification(null)}
              className="p-1 rounded-md hover:bg-white/10 active:scale-95 transition-transform text-white/70 hover:text-white cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
              ? 'Rueda para zoom focalizado'
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
