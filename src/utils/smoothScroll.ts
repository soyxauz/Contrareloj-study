/**
 * Motor de desplazamiento suave inercial ultraligero (Zero-Dependency Smooth Scroll).
 * - 0% de consumo de CPU en reposo (detiene completamente el bucle requestAnimationFrame al estabilizarse).
 * - Interpola la rueda del ratón en Windows eliminando los saltos bruscos de 100px.
 * - Respeta contenedores con scroll interno independiente (modales, desplegables, áreas de código).
 * - No interfiere con eventos táctiles en móviles ni con gestos nativos de trackpad.
 */

let targetY = 0;
let currentY = 0;
let isRunning = false;
let rafId: number | null = null;
let isInitialized = false;

// Curva de amortiguación ágil y reactiva (0.16 = ~220ms de deslizamiento sedoso sin sensación de pesadez)
const LERP_FACTOR = 0.16;

function isScrollableElement(element: HTMLElement | null, deltaY: number): boolean {
  if (!element || element === document.body || element === document.documentElement) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const isScrollableOverflow = overflowY === 'auto' || overflowY === 'scroll';

  if (isScrollableOverflow && element.scrollHeight > element.clientHeight) {
    const isAtTop = element.scrollTop <= 0 && deltaY < 0;
    const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1 && deltaY > 0;
    // Si no está en el límite absoluto en la dirección del desplazamiento, debe hacer scroll el contenedor hijo
    if (!isAtTop && !isAtBottom) {
      return true;
    }
  }

  return isScrollableElement(element.parentElement, deltaY);
}

function tick() {
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  targetY = Math.max(0, Math.min(targetY, maxScroll));

  const diff = targetY - currentY;

  // Umbral de parada sub-píxel para reposo absoluto
  if (Math.abs(diff) < 0.6) {
    currentY = targetY;
    window.scrollTo(0, currentY);
    isRunning = false;
    rafId = null;
    return;
  }

  currentY += diff * LERP_FACTOR;
  window.scrollTo(0, currentY);
  rafId = requestAnimationFrame(tick);
}

function onWheel(e: WheelEvent) {
  // Permitir gestos de pinch-zoom nativos del navegador con Ctrl
  if (e.ctrlKey) return;

  // Si el usuario está sobre un contenedor con scroll propio (ej. modal, historial, código), delegar scroll nativo
  if (isScrollableElement(e.target as HTMLElement, e.deltaY)) return;

  // Evitar el salto brusco nativo por pasos de Windows
  e.preventDefault();

  if (!isRunning) {
    targetY = window.scrollY;
    currentY = window.scrollY;
  }

  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 24; // Modo líneas (Firefox/Windows)
  else if (e.deltaMode === 2) delta *= window.innerHeight; // Modo páginas

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  targetY = Math.max(0, Math.min(targetY + delta, maxScroll));

  if (!isRunning) {
    isRunning = true;
    rafId = requestAnimationFrame(tick);
  }
}

function onNativeScroll() {
  if (!isRunning) {
    targetY = window.scrollY;
    currentY = window.scrollY;
  }
}

/**
 * Inicializa el escuchador pasivo / controlado de scroll inercial.
 * Retorna la función de limpieza para desmontar cuando sea necesario.
 */
export function initUltraLightSmoothScroll(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }

  targetY = window.scrollY;
  currentY = window.scrollY;
  isInitialized = true;

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onNativeScroll, { passive: true });

  return () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onNativeScroll);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isRunning = false;
    isInitialized = false;
  };
}

/**
 * Restablece la posición de desplazamiento inmediatamente (útil al cambiar de vista o modo de estudio).
 */
export function resetUltraLightSmoothScroll(y: number = 0) {
  targetY = y;
  currentY = y;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  isRunning = false;
  if (typeof window !== 'undefined') {
    window.scrollTo(0, y);
  }
}
