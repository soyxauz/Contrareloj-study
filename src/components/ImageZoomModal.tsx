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
  Trash2,
  ExternalLink
} from 'lucide-react';
import { useTheme } from '../services/themeService';
import { cleanImageBlackBackground } from '../utils/imageCleaner';
import { LensInspectorPanel } from './LensInspectorPanel';

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
 * Recorta una región normalizada (0..1) de una imagen mediante canvas
 */
const cropImageRegion = (
  imgEl: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number }
): string => {
  try {
    const canvas = document.createElement('canvas');
    const natW = imgEl.naturalWidth || imgEl.width || 400;
    const natH = imgEl.naturalHeight || imgEl.height || 400;

    const sx = Math.max(0, Math.floor(rect.x * natW));
    const sy = Math.max(0, Math.floor(rect.y * natH));
    const sw = Math.min(natW - sx, Math.max(10, Math.ceil(rect.width * natW)));
    const sh = Math.min(natH - sy, Math.max(10, Math.ceil(rect.height * natH)));

    canvas.width = Math.max(sw, 10);
    canvas.height = Math.max(sh, 10);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Error al recortar región de imagen:', err);
    return '';
  }
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

  // Estados para selección interactiva y escaneo Google Lens nativo
  const [isLensModeActive, setIsLensModeActive] = useState<boolean>(false);
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [, setIsDraggingLens] = useState<boolean>(false);
  const [croppedDataUrl, setCroppedDataUrl] = useState<string>('');
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const lensStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Resetear estados de Lens cada vez que cambia la imagen o se abre/cierra el modal
  useEffect(() => {
    setIsLensModeActive(false);
    setSelectionRect(null);
    setCroppedDataUrl('');
    setIsInspectorOpen(false);
  }, [imageUrl, isOpen]);

  // Ejecuta la búsqueda nativa en Google Lens mediante carga directa multipart/form-data
  const triggerNativeGoogleLens = useCallback((rect?: { x: number; y: number; width: number; height: number } | null) => {
    if (!imgRef.current) return;
    const targetRect = rect && rect.width > 0.02 && rect.height > 0.02
      ? rect
      : { x: 0, y: 0, width: 1, height: 1 };

    const canvas = document.createElement('canvas');
    const natW = imgRef.current.naturalWidth || imgRef.current.width || 400;
    const natH = imgRef.current.naturalHeight || imgRef.current.height || 400;

    const sx = Math.max(0, Math.floor(targetRect.x * natW));
    const sy = Math.max(0, Math.floor(targetRect.y * natH));
    const sw = Math.min(natW - sx, Math.max(10, Math.ceil(targetRect.width * natW)));
    const sh = Math.min(natH - sy, Math.max(10, Math.ceil(targetRect.height * natH)));

    canvas.width = Math.max(sw, 10);
    canvas.height = Math.max(sh, 10);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    setLensNotification({
      type: 'info',
      message: 'Abriendo Google Lens en pestaña nueva...',
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      try {
        const file = new File([blob], 'recorte-figura.png', { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://lens.google.com/upload';
        form.enctype = 'multipart/form-data';
        form.target = '_blank';

        const input = document.createElement('input');
        input.type = 'file';
        input.name = 'encoded_image';
        input.files = dt.files;
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();
        setTimeout(() => {
          if (form.parentNode) {
            form.parentNode.removeChild(form);
          }
          setLensNotification(null);
        }, 1500);
      } catch (err) {
        console.warn('Fallo en formulario Lens, abriendo ventana alternativa:', err);
        window.open('https://lens.google.com/', '_blank');
        setLensNotification(null);
      }
    }, 'image/png');
  }, []);

  // Abre el Inspector Google Lens integrado con el recorte seleccionado
  const openInspectorWithCrop = useCallback(
    (rectToCrop?: { x: number; y: number; width: number; height: number } | null) => {
      if (!imgRef.current) return;
      const targetRect =
        rectToCrop && rectToCrop.width > 0.02 && rectToCrop.height > 0.02
          ? rectToCrop
          : selectionRect && selectionRect.width > 0.02 && selectionRect.height > 0.02
          ? selectionRect
          : { x: 0, y: 0, width: 1, height: 1 };

      setSelectionRect(targetRect);
      const cropped = cropImageRegion(imgRef.current, targetRect);
      if (cropped) {
        setCroppedDataUrl(cropped);
        setIsInspectorOpen(true);
        setIsLensModeActive(false);
      }
    },
    [selectionRect]
  );

  // Alternar el modo de selección interactiva Lens con recuadro inicial pre-centrado y ajustable
  const toggleLensMode = useCallback(() => {
    if (isLensModeActive) {
      setIsLensModeActive(false);
      setSelectionRect(null);
    } else {
      handleResetZoom();
      setIsInspectorOpen(false);
      setIsLensModeActive(true);
      // Inicializar recuadro centrado para que el usuario pueda redimensionar de inmediato
      setSelectionRect({ x: 0.15, y: 0.15, width: 0.7, height: 0.7 });
    }
  }, [isLensModeActive, handleResetZoom]);

  // Seleccionar la figura entera para análisis
  const handleSelectFullImage = useCallback(() => {
    const fullRect = { x: 0, y: 0, width: 1, height: 1 };
    setSelectionRect(fullRect);
    openInspectorWithCrop(fullRect);
  }, [openInspectorWithCrop]);

  // Manejador para redimensionar o mover el recuadro de selección sin mover la imagen
  const handleResizeHandleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    handleType: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'move'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectionRect || !imgRef.current) return;

    const overlay = imgRef.current.parentElement;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialRect = { ...selectionRect };

    const onMouseMove = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();

      const deltaX = (ev.clientX - startClientX) / rect.width;
      const deltaY = (ev.clientY - startClientY) / rect.height;

      let { x, y, width, height } = initialRect;

      switch (handleType) {
        case 'move': {
          x = Math.max(0, Math.min(1 - width, initialRect.x + deltaX));
          y = Math.max(0, Math.min(1 - height, initialRect.y + deltaY));
          break;
        }
        case 'se': {
          width = Math.max(0.04, Math.min(1 - x, initialRect.width + deltaX));
          height = Math.max(0.04, Math.min(1 - y, initialRect.height + deltaY));
          break;
        }
        case 'nw': {
          const maxDeltaX = initialRect.width - 0.04;
          const maxDeltaY = initialRect.height - 0.04;
          const clampedDeltaX = Math.min(maxDeltaX, Math.max(-initialRect.x, deltaX));
          const clampedDeltaY = Math.min(maxDeltaY, Math.max(-initialRect.y, deltaY));
          x = initialRect.x + clampedDeltaX;
          y = initialRect.y + clampedDeltaY;
          width = initialRect.width - clampedDeltaX;
          height = initialRect.height - clampedDeltaY;
          break;
        }
        case 'ne': {
          const maxDeltaY = initialRect.height - 0.04;
          const clampedDeltaY = Math.min(maxDeltaY, Math.max(-initialRect.y, deltaY));
          y = initialRect.y + clampedDeltaY;
          height = initialRect.height - clampedDeltaY;
          width = Math.max(0.04, Math.min(1 - x, initialRect.width + deltaX));
          break;
        }
        case 'sw': {
          const maxDeltaX = initialRect.width - 0.04;
          const clampedDeltaX = Math.min(maxDeltaX, Math.max(-initialRect.x, deltaX));
          x = initialRect.x + clampedDeltaX;
          width = initialRect.width - clampedDeltaX;
          height = Math.max(0.04, Math.min(1 - y, initialRect.height + deltaY));
          break;
        }
        case 'n': {
          const maxDeltaY = initialRect.height - 0.04;
          const clampedDeltaY = Math.min(maxDeltaY, Math.max(-initialRect.y, deltaY));
          y = initialRect.y + clampedDeltaY;
          height = initialRect.height - clampedDeltaY;
          break;
        }
        case 's': {
          height = Math.max(0.04, Math.min(1 - y, initialRect.height + deltaY));
          break;
        }
        case 'w': {
          const maxDeltaX = initialRect.width - 0.04;
          const clampedDeltaX = Math.min(maxDeltaX, Math.max(-initialRect.x, deltaX));
          x = initialRect.x + clampedDeltaX;
          width = initialRect.width - clampedDeltaX;
          break;
        }
        case 'e': {
          width = Math.max(0.04, Math.min(1 - x, initialRect.width + deltaX));
          break;
        }
      }

      setSelectionRect({ x, y, width, height });
    };

    const onMouseUp = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
  };

  // Manejador táctil para redimensionar o mover en pantallas táctiles
  const handleResizeHandleTouchStart = (
    e: React.TouchEvent<HTMLDivElement>,
    handleType: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'move'
  ) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    if (!selectionRect || !imgRef.current) return;

    const overlay = imgRef.current.parentElement;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();

    const touch = e.touches[0];
    const startClientX = touch.clientX;
    const startClientY = touch.clientY;
    const initialRect = { ...selectionRect };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      ev.stopPropagation();

      const t = ev.touches[0];
      const deltaX = (t.clientX - startClientX) / rect.width;
      const deltaY = (t.clientY - startClientY) / rect.height;

      let { x, y, width, height } = initialRect;

      switch (handleType) {
        case 'move': {
          x = Math.max(0, Math.min(1 - width, initialRect.x + deltaX));
          y = Math.max(0, Math.min(1 - height, initialRect.y + deltaY));
          break;
        }
        case 'se': {
          width = Math.max(0.04, Math.min(1 - x, initialRect.width + deltaX));
          height = Math.max(0.04, Math.min(1 - y, initialRect.height + deltaY));
          break;
        }
        case 'nw': {
          const maxDeltaX = initialRect.width - 0.04;
          const maxDeltaY = initialRect.height - 0.04;
          const clampedDeltaX = Math.min(maxDeltaX, Math.max(-initialRect.x, deltaX));
          const clampedDeltaY = Math.min(maxDeltaY, Math.max(-initialRect.y, deltaY));
          x = initialRect.x + clampedDeltaX;
          y = initialRect.y + clampedDeltaY;
          width = initialRect.width - clampedDeltaX;
          height = initialRect.height - clampedDeltaY;
          break;
        }
        case 'ne': {
          const maxDeltaY = initialRect.height - 0.04;
          const clampedDeltaY = Math.min(maxDeltaY, Math.max(-initialRect.y, deltaY));
          y = initialRect.y + clampedDeltaY;
          height = initialRect.height - clampedDeltaY;
          width = Math.max(0.04, Math.min(1 - x, initialRect.width + deltaX));
          break;
        }
        case 'sw': {
          const maxDeltaX = initialRect.width - 0.04;
          const clampedDeltaX = Math.min(maxDeltaX, Math.max(-initialRect.x, deltaX));
          x = initialRect.x + clampedDeltaX;
          width = initialRect.width - clampedDeltaX;
          height = Math.max(0.04, Math.min(1 - y, initialRect.height + deltaY));
          break;
        }
        case 'n': {
          const maxDeltaY = initialRect.height - 0.04;
          const clampedDeltaY = Math.min(maxDeltaY, Math.max(-initialRect.y, deltaY));
          y = initialRect.y + clampedDeltaY;
          height = initialRect.height - clampedDeltaY;
          break;
        }
        case 's': {
          height = Math.max(0.04, Math.min(1 - y, initialRect.height + deltaY));
          break;
        }
        case 'w': {
          const maxDeltaX = initialRect.width - 0.04;
          const clampedDeltaX = Math.min(maxDeltaX, Math.max(-initialRect.x, deltaX));
          x = initialRect.x + clampedDeltaX;
          width = initialRect.width - clampedDeltaX;
          break;
        }
        case 'e': {
          width = Math.max(0.04, Math.min(1 - x, initialRect.width + deltaX));
          break;
        }
      }

      setSelectionRect({ x, y, width, height });
    };

    const onTouchEnd = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', onTouchEnd, true);
    };

    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    window.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
  };

  // Evento mouse down sobre el lienzo de Lens para trazar un nuevo recuadro
  const handleLensMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const startX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const startY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    lensStartRef.current = { x: startX, y: startY };
    const initialSelection = selectionRect;
    let isRealDrag = false;

    const onMouseMoveWindow = (ev: MouseEvent) => {
      const curX = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const curY = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));

      const w = Math.abs(curX - lensStartRef.current.x);
      const h = Math.abs(curY - lensStartRef.current.y);

      if (!isRealDrag && (w > 0.02 || h > 0.02)) {
        isRealDrag = true;
        setIsDraggingLens(true);
      }

      if (isRealDrag) {
        const x = Math.min(lensStartRef.current.x, curX);
        const y = Math.min(lensStartRef.current.y, curY);
        setSelectionRect({ x, y, width: w, height: h });
      }
    };

    const onMouseUpWindow = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMoveWindow, true);
      window.removeEventListener('mouseup', onMouseUpWindow, true);
      setIsDraggingLens(false);

      if (!isRealDrag) {
        // No hubo arrastre real: restaurar la selección previa para que no se colapse a 0
        if (initialSelection) {
          setSelectionRect(initialSelection);
        }
        return;
      }

      const curX = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const curY = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));

      const x = Math.min(lensStartRef.current.x, curX);
      const y = Math.min(lensStartRef.current.y, curY);
      const width = Math.abs(curX - lensStartRef.current.x);
      const height = Math.abs(curY - lensStartRef.current.y);

      if (width > 0.03 && height > 0.03) {
        setSelectionRect({ x, y, width, height });
      } else if (initialSelection) {
        setSelectionRect(initialSelection);
      }
    };

    window.addEventListener('mousemove', onMouseMoveWindow, true);
    window.addEventListener('mouseup', onMouseUpWindow, true);
  };

  // Evento touch start sobre el lienzo de Lens
  const handleLensTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const touch = e.touches[0];
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const startX = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const startY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));

    lensStartRef.current = { x: startX, y: startY };
    const initialSelection = selectionRect;
    let isRealDrag = false;

    const onTouchMoveWindow = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      const curX = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
      const curY = Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height));

      const w = Math.abs(curX - lensStartRef.current.x);
      const h = Math.abs(curY - lensStartRef.current.y);

      if (!isRealDrag && (w > 0.02 || h > 0.02)) {
        isRealDrag = true;
        setIsDraggingLens(true);
      }

      if (isRealDrag) {
        const x = Math.min(lensStartRef.current.x, curX);
        const y = Math.min(lensStartRef.current.y, curY);
        setSelectionRect({ x, y, width: w, height: h });
      }
    };

    const onTouchEndWindow = (ev: TouchEvent) => {
      window.removeEventListener('touchmove', onTouchMoveWindow, true);
      window.removeEventListener('touchend', onTouchEndWindow, true);
      setIsDraggingLens(false);

      if (!isRealDrag) {
        if (initialSelection) {
          setSelectionRect(initialSelection);
        }
        return;
      }

      if (ev.changedTouches.length !== 1) return;
      const t = ev.changedTouches[0];
      const curX = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
      const curY = Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height));

      const x = Math.min(lensStartRef.current.x, curX);
      const y = Math.min(lensStartRef.current.y, curY);
      const width = Math.abs(curX - lensStartRef.current.x);
      const height = Math.abs(curY - lensStartRef.current.y);

      if (width > 0.03 && height > 0.03) {
        setSelectionRect({ x, y, width, height });
      } else if (initialSelection) {
        setSelectionRect(initialSelection);
      }
    };

    window.addEventListener('touchmove', onTouchMoveWindow, true);
    window.addEventListener('touchend', onTouchEndWindow, true);
  };

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
    if (zoomRef.current <= 1 || isLensModeActive) return;
    if (e.button !== 0) return;
    setIsDragging(true);
    isDraggingRef.current = true;
    isInteractingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panRef.current };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || zoomRef.current <= 1 || isLensModeActive) return;

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
        className={`relative w-full max-w-5xl h-[92vh] flex flex-col border rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 ease-out ${
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

            {/* Escanear / Buscar con Google Lens nativo */}
            {sanitizedUrl && (
              <button
                type="button"
                onClick={toggleLensMode}
                title={
                  isLensModeActive
                    ? 'Desactivar modo selección Lens'
                    : 'Seleccionar área para buscar en Google Lens'
                }
                className={`p-2 rounded-xl border flex items-center gap-1.5 transition-all duration-150 ease-out active:scale-[0.97] cursor-pointer ${
                  isLensModeActive
                    ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/50'
                    : theme === 'dark'
                    ? 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20'
                    : theme === 'kitty'
                    ? 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:text-zinc-950 hover:bg-slate-100 shadow-xs'
                }`}
              >
                <GoogleLensIcon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline text-xs font-semibold">
                  {isLensModeActive ? 'Modo Selección' : 'Google Lens'}
                </span>
                {isLensModeActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}
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

        {/* Cuerpo del Visor: Imagen a la izquierda + Panel Inspector Lens a la derecha */}
        <div className="relative flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Área Central de Visualización y Zoom: Fondo Blanco Puro en todos los temas */}
          <div
            ref={containerRef}
            className="relative flex-1 min-h-0 min-w-0 bg-white overflow-hidden flex items-center justify-center p-4 cursor-default select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Banner flotante de ayuda cuando el modo Lens está activo */}
            {isLensModeActive && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-zinc-950/90 text-white border border-white/20 text-xs font-semibold shadow-2xl flex items-center gap-2 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <GoogleLensIcon className="w-3.5 h-3.5" />
                <span>Arrastra sobre la figura para seleccionar un área</span>
                <button
                  type="button"
                  onClick={handleSelectFullImage}
                  className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-[10px] font-bold text-white transition-colors cursor-pointer"
                >
                  Toda la figura
                </button>
                <button
                  type="button"
                  onClick={() => setIsLensModeActive(false)}
                  className="p-0.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
                  title="Cancelar selección"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Botón Imagen Anterior */}
            {hasPrev && onPrev && !isLensModeActive && (
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
            {hasNext && onNext && !isLensModeActive && (
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
                <div className="relative inline-block pointer-events-auto max-h-[70vh] sm:max-h-[74vh] max-w-full">
                  <img
                    ref={imgRef}
                    src={sanitizedUrl}
                    alt={caption || title}
                    style={{
                      transform: 'translate3d(0px, 0px, 0) scale(1)',
                      transformOrigin: 'center center',
                      willChange: 'transform',
                    }}
                    className={`max-h-[70vh] sm:max-h-[74vh] max-w-full object-contain rounded-xl bg-white p-2 block ${
                      isLensModeActive
                        ? 'cursor-crosshair'
                        : zoomLevel > 1
                        ? isDragging
                          ? 'cursor-grabbing'
                          : 'cursor-grab'
                        : 'cursor-zoom-in'
                    }`}
                    onClick={!isLensModeActive ? handleImageClick : undefined}
                    draggable={false}
                  />

                  {/* Capa Interactiva de Escaneo Google Lens */}
                  {isLensModeActive && (
                    <div
                      className="absolute inset-0 z-20 cursor-crosshair select-none touch-none"
                      onMouseDown={handleLensMouseDown}
                      onTouchStart={handleLensTouchStart}
                    >
                      {/* Rectángulo de selección estilo Google Circle to Search / Assistant */}
                      {selectionRect && (
                        <div
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          className="absolute border border-white/90 rounded-2xl transition-transform duration-75 select-none"
                          style={{
                            left: `${selectionRect.x * 100}%`,
                            top: `${selectionRect.y * 100}%`,
                            width: `${selectionRect.width * 100}%`,
                            height: `${selectionRect.height * 100}%`,
                            boxShadow:
                              '0 0 0 9999px rgba(0, 0, 0, 0.45), 0 0 25px rgba(66, 133, 244, 0.6), 0 0 15px rgba(234, 67, 53, 0.5)',
                          }}
                        >
                          {/* Área interior para mover el recuadro sin mover la imagen */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'move')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'move')}
                            className="absolute inset-2 cursor-move pointer-events-auto z-20"
                            title="Arrastra para mover la selección"
                          />

                          {/* 4 Esquinas en colores oficiales Google (Handles diagonales) */}
                          {/* Superior Izquierda - Rojo */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'nw')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'nw')}
                            className="absolute -top-2.5 -left-2.5 w-6 h-6 border-t-[4px] border-l-[4px] border-[#EA4335] rounded-tl-xl drop-shadow-[0_0_10px_rgba(234,67,53,0.9)] cursor-nwse-resize z-30 pointer-events-auto"
                            title="Redimensionar esquina superior izquierda"
                          />
                          {/* Superior Derecha - Azul */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'ne')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'ne')}
                            className="absolute -top-2.5 -right-2.5 w-6 h-6 border-t-[4px] border-r-[4px] border-[#4285F4] rounded-tr-xl drop-shadow-[0_0_10px_rgba(66,133,244,0.9)] cursor-nesw-resize z-30 pointer-events-auto"
                            title="Redimensionar esquina superior derecha"
                          />
                          {/* Inferior Derecha - Amarillo */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'se')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'se')}
                            className="absolute -bottom-2.5 -right-2.5 w-6 h-6 border-b-[4px] border-r-[4px] border-[#FBBC05] rounded-br-xl drop-shadow-[0_0_10px_rgba(251,188,5,0.9)] cursor-nwse-resize z-30 pointer-events-auto"
                            title="Redimensionar esquina inferior derecha"
                          />
                          {/* Inferior Izquierda - Verde */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'sw')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'sw')}
                            className="absolute -bottom-2.5 -left-2.5 w-6 h-6 border-b-[4px] border-l-[4px] border-[#34A853] rounded-bl-xl drop-shadow-[0_0_10px_rgba(52,168,83,0.9)] cursor-nesw-resize z-30 pointer-events-auto"
                            title="Redimensionar esquina inferior izquierda"
                          />

                          {/* 4 Puntos de ajuste en los bordes (Handles cardinales) */}
                          {/* Borde Superior */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'n')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'n')}
                            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-3 bg-white/95 border border-black/30 rounded-full cursor-ns-resize z-30 pointer-events-auto shadow-md hover:scale-110 active:scale-95 transition-transform"
                            title="Ajustar altura superior"
                          />
                          {/* Borde Inferior */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 's')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 's')}
                            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 bg-white/95 border border-black/30 rounded-full cursor-ns-resize z-30 pointer-events-auto shadow-md hover:scale-110 active:scale-95 transition-transform"
                            title="Ajustar altura inferior"
                          />
                          {/* Borde Izquierdo */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'w')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'w')}
                            className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 bg-white/95 border border-black/30 rounded-full cursor-ew-resize z-30 pointer-events-auto shadow-md hover:scale-110 active:scale-95 transition-transform"
                            title="Ajustar ancho izquierdo"
                          />
                          {/* Borde Derecho */}
                          <div
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, 'e')}
                            onTouchStart={(e) => handleResizeHandleTouchStart(e, 'e')}
                            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-white/95 border border-black/30 rounded-full cursor-ew-resize z-30 pointer-events-auto shadow-md hover:scale-110 active:scale-95 transition-transform"
                            title="Ajustar ancho derecho"
                          />

                          {/* Barra de Acción Directa Flotante de Google Lens */}
                          <div
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-zinc-950/95 text-white border border-white/20 rounded-2xl shadow-2xl z-40 backdrop-blur-xl pointer-events-auto whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
                          >
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                openInspectorWithCrop(selectionRect);
                              }}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-transform cursor-pointer"
                              title="Abrir análisis y explicación de Google Lens en el panel lateral"
                            >
                              <GoogleLensIcon className="w-3.5 h-3.5" />
                              <span>Buscar con Google Lens</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerNativeGoogleLens(selectionRect);
                              }}
                              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-zinc-200 rounded-xl text-xs font-semibold active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
                              title="Abrir en pestaña nueva de Google Lens"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="hidden sm:inline">Google Lens Web</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFullImage();
                              }}
                              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-zinc-200 rounded-xl text-xs font-semibold active:scale-95 transition-transform cursor-pointer"
                            >
                              Toda la figura
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsLensModeActive(false);
                                setSelectionRect(null);
                              }}
                              className="p-1.5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl active:scale-95 transition-transform cursor-pointer"
                              title="Cancelar selección"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Highlight estático del recorte cuando el inspector está abierto */}
                  {!isLensModeActive && isInspectorOpen && selectionRect && (
                    <div
                      className="absolute border border-white/90 rounded-2xl pointer-events-none"
                      style={{
                        left: `${selectionRect.x * 100}%`,
                        top: `${selectionRect.y * 100}%`,
                        width: `${selectionRect.width * 100}%`,
                        height: `${selectionRect.height * 100}%`,
                        boxShadow:
                          '0 0 0 9999px rgba(0, 0, 0, 0.45), 0 0 25px rgba(66, 133, 244, 0.6), 0 0 15px rgba(234, 67, 53, 0.5)',
                      }}
                    >
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-[3.5px] border-l-[3.5px] border-[#EA4335] rounded-tl-xl drop-shadow-[0_0_8px_rgba(234,67,53,0.8)]" />
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-[3.5px] border-r-[3.5px] border-[#4285F4] rounded-tr-xl drop-shadow-[0_0_8px_rgba(66,133,244,0.8)]" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-[3.5px] border-r-[3.5px] border-[#FBBC05] rounded-br-xl drop-shadow-[0_0_8px_rgba(251,188,5,0.8)]" />
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-[3.5px] border-l-[3.5px] border-[#34A853] rounded-bl-xl drop-shadow-[0_0_8px_rgba(52,168,83,0.8)]" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-500 space-y-2 pointer-events-auto">
                  <ImageIcon className="w-12 h-12 mx-auto opacity-40" />
                  <p className="text-xs">No se pudo cargar la imagen seleccionada.</p>
                </div>
              )}
            </div>

            {/* Indicador de ayuda al usuario */}
            {!isLensModeActive && (
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
            )}
          </div>

          {/* Panel Lateral Derecho: Inspector Google Lens con IA */}
          {isInspectorOpen && croppedDataUrl && (
            <LensInspectorPanel
              isOpen={isInspectorOpen}
              onClose={() => {
                setIsInspectorOpen(false);
                setSelectionRect(null);
              }}
              onNewCrop={() => {
                setIsInspectorOpen(false);
                handleResetZoom();
                setIsLensModeActive(true);
                setSelectionRect({ x: 0.15, y: 0.15, width: 0.7, height: 0.7 });
              }}
              onSelectFullImage={() => {
                openInspectorWithCrop({ x: 0, y: 0, width: 1, height: 1 });
              }}
              onOpenExternalLens={() => triggerNativeGoogleLens(selectionRect)}
              croppedDataUrl={croppedDataUrl}
              context={{ title, subtitle, caption }}
            />
          )}
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
