/**
 * Motor de desplazamiento inercial ultraligero a 120 FPS de alto rendimiento.
 * Optimizaciones críticas aplicadas:
 * - Eliminación de Layout Thrashing: la altura máxima (maxScroll) se almacena en caché y no se recalcula en cada cuadro de RAF.
 * - Amortiguación continua temporal (Time-Delta Damping) independiente del refresco del monitor (60Hz / 120Hz / 144Hz / 240Hz).
 * - Multiplicador de velocidad ágil (1.45x) con impulso inercial dinámico para avanzar rápidamente con suavidad absoluta.
 * - Aislamiento estricto de modales: bloquea al 100% el desplazamiento de la página de fondo cuando cualquier modal/ajuste está en pantalla.
 * - 0% de uso de CPU cuando no se está desplazando la pantalla (cancela el bucle RAF al instante).
 */

let targetY = 0;
let currentY = 0;
let isRunning = false;
let rafId: number | null = null;
let isInitialized = false;
let lastFrameTime = 0;
let cachedMaxScroll = 0;

// Constantes de física continua y velocidad de desplazamiento
const LAMBDA = 19.5; // Tasa de convergencia exponencial continua (~140ms de respuesta veloz, sedosa y sin lag)
const BASE_MULTIPLIER = 1.45; // Desplazamiento más ágil y eficiente por cada muesca de rueda
let lastWheelTimestamp = 0;
let lastWheelDirection = 0;
let velocityBoost = 1.0;

function updateMaxScrollCache() {
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    cachedMaxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }
}

/**
 * Detecta si el cursor se encuentra dentro de un modal, panel flotante o diálogo con fondo fijo.
 */
function isInsideFixedOrModal(target: HTMLElement | null): boolean {
  if (!target) return false;
  return Boolean(
    target.closest('.fixed, [role="dialog"], [aria-modal="true"], [data-modal]')
  );
}

/**
 * Detecta si hay algún modal o superposición de pantalla completa actualmente abierta en el DOM.
 */
function isAnyModalOpen(): boolean {
  if (document.body.style.overflow === 'hidden') return true;
  return Boolean(
    document.querySelector('.fixed.inset-0, [role="dialog"], [aria-modal="true"]')
  );
}

/**
 * Verifica si un elemento hijo tiene recorrido pendiente para desplazarse internamente.
 * Optimizado a O(1): comprueba scrollHeight > clientHeight antes de llamar a getComputedStyle.
 */
function isScrollableElement(element: HTMLElement | null, deltaY: number, depth = 0): boolean {
  if (!element || element === document.body || element === document.documentElement || depth > 8) {
    return false;
  }

  // Comprobación ultrarrápida O(1): si no hay desbordamiento físico vertical, saltar getComputedStyle
  if (element.scrollHeight > element.clientHeight + 1) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const isAtTop = element.scrollTop <= 0 && deltaY < 0;
      const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1 && deltaY > 0;
      if (!isAtTop && !isAtBottom) {
        return true;
      }
    }
  }

  return isScrollableElement(element.parentElement, deltaY, depth + 1);
}

/**
 * Bucle de animación impulsado por delta de tiempo real con altura en caché (cero repintados sincrónicos forzados).
 */
function tick(currentTime: number) {
  if (!lastFrameTime) {
    lastFrameTime = currentTime;
  }

  const dt = Math.min((currentTime - lastFrameTime) / 1000, 0.05);
  lastFrameTime = currentTime;

  targetY = Math.max(0, Math.min(targetY, cachedMaxScroll));
  const diff = targetY - currentY;

  // Umbral de resolución sub-píxel para reposo absoluto
  if (Math.abs(diff) < 0.25) {
    currentY = targetY;
    window.scrollTo({ top: currentY, left: 0, behavior: 'instant' });
    isRunning = false;
    rafId = null;
    lastFrameTime = 0;
    velocityBoost = 1.0;
    return;
  }

  // Ecuación de amortiguación exponencial continua Apple / Three.js
  const factor = 1 - Math.exp(-LAMBDA * dt);
  currentY += diff * factor;

  window.scrollTo({ top: currentY, left: 0, behavior: 'instant' });
  rafId = requestAnimationFrame(tick);
}

/**
 * Manejador de eventos de rueda con aceleración progresiva y bloqueo estricto en modales.
 */
function onWheel(e: WheelEvent) {
  if (e.ctrlKey) return;

  const targetEl = e.target as HTMLElement | null;

  // Candado estricto para modales (Ajustes de IA, Google Drive, Autenticación, etc.)
  if (isAnyModalOpen() || isInsideFixedOrModal(targetEl)) {
    // Si el contenedor interno del modal puede desplazarse, permitir que el navegador haga scroll interno natural
    if (isScrollableElement(targetEl, e.deltaY)) {
      return;
    }
    // Bloquear el evento en los límites para que JAMÁS se mueva la página principal de atrás
    e.preventDefault();
    return;
  }

  // Si el usuario está sobre una sublista normal de la página con scroll propio, respetarla
  if (isScrollableElement(targetEl, e.deltaY)) {
    return;
  }

  e.preventDefault();

  const now = performance.now();
  const direction = Math.sign(e.deltaY);

  // Aceleración dinámica de muesca para desplazamientos rápidos y eficientes
  if (now - lastWheelTimestamp < 120 && direction === lastWheelDirection) {
    velocityBoost = Math.min(velocityBoost + 0.2, 2.0);
  } else {
    velocityBoost = 1.0;
  }
  lastWheelTimestamp = now;
  lastWheelDirection = direction;

  if (!isRunning) {
    targetY = window.scrollY;
    currentY = window.scrollY;
    updateMaxScrollCache();
  }

  let delta = e.deltaY * BASE_MULTIPLIER * velocityBoost;
  if (e.deltaMode === 1) delta *= 24;
  else if (e.deltaMode === 2) delta *= window.innerHeight;

  targetY = Math.max(0, Math.min(targetY + delta, cachedMaxScroll));

  if (!isRunning) {
    isRunning = true;
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

/**
 * Sincroniza la posición si el usuario utiliza la barra de desplazamiento manual o teclas.
 */
function onNativeScroll() {
  if (!isRunning) {
    targetY = window.scrollY;
    currentY = window.scrollY;
  }
}

/**
 * Inicializa el escuchador de scroll inercial suave.
 */
export function initUltraLightSmoothScroll(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }

  targetY = window.scrollY;
  currentY = window.scrollY;
  updateMaxScrollCache();
  isInitialized = true;

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onNativeScroll, { passive: true });
  window.addEventListener('resize', updateMaxScrollCache, { passive: true });

  return () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onNativeScroll);
    window.removeEventListener('resize', updateMaxScrollCache);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isRunning = false;
    isInitialized = false;
    lastFrameTime = 0;
  };
}

/**
 * Restablece la posición de desplazamiento inmediatamente y cancela cualquier animación en curso.
 */
export function resetUltraLightSmoothScroll(y: number = 0) {
  targetY = y;
  currentY = y;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  isRunning = false;
  lastFrameTime = 0;
  velocityBoost = 1.0;
  updateMaxScrollCache();
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  }
}
