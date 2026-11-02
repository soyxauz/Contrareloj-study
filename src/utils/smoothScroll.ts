/**
 * Motor de desplazamiento inercial ultraligero a 120 FPS con física continua desacoplada del frame-rate.
 * - Cero dependencias externas y 0% de uso de CPU en reposo.
 * - Amortiguación exponencial continua (damp) que elimina al 100% los microtirones y microsaltos.
 * - Multiplicador de velocidad ágil con aceleración dinámica para desplazamiento rápido y sin esfuerzo.
 * - Aislamiento estricto de modales: bloquea el scroll de la página de fondo cuando cualquier modal/ajuste está abierto.
 * - Respeta contenedores con scroll interno independiente (listas, modales, editores de código).
 */

let targetY = 0;
let currentY = 0;
let isRunning = false;
let rafId: number | null = null;
let isInitialized = false;
let lastFrameTime = 0;

// Constantes de física continua y velocidad reactiva
const LAMBDA = 15.0; // Tasa de convergencia exponencial continua (~180ms de respuesta ágil y sedosa)
const BASE_MULTIPLIER = 1.35; // Desplazamiento más rápido y eficiente por cada muesca de rueda
let lastWheelTimestamp = 0;
let lastWheelDirection = 0;
let velocityBoost = 1.0;

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
  return Boolean(
    document.querySelector('.fixed.inset-0, [role="dialog"], [aria-modal="true"]')
  );
}

/**
 * Verifica si un elemento hijo tiene recorrido pendiente para desplazarse internamente.
 */
function isScrollableElement(element: HTMLElement | null, deltaY: number): boolean {
  if (!element || element === document.body || element === document.documentElement) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const isScrollable = overflowY === 'auto' || overflowY === 'scroll';

  if (isScrollable && element.scrollHeight > element.clientHeight) {
    const isAtTop = element.scrollTop <= 0 && deltaY < 0;
    const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1 && deltaY > 0;
    if (!isAtTop && !isAtBottom) {
      return true;
    }
  }

  return isScrollableElement(element.parentElement, deltaY);
}

/**
 * Bucle de animación impulsado por delta de tiempo real (Time-Delta Exponential Damping).
 * Garantiza fluidez absoluta a 60Hz, 120Hz, 144Hz o 240Hz sin microtirones ni saltos discretos.
 */
function tick(currentTime: number) {
  if (!lastFrameTime) {
    lastFrameTime = currentTime;
  }

  const dt = Math.min((currentTime - lastFrameTime) / 1000, 0.05); // Límite de seguridad de 50ms
  lastFrameTime = currentTime;

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  targetY = Math.max(0, Math.min(targetY, maxScroll));

  const diff = targetY - currentY;

  // Umbral de resolución sub-píxel para reposo absoluto sin gasto de ciclos de CPU
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
  // Permitir gestos nativos de zoom con Ctrl
  if (e.ctrlKey) return;

  const targetEl = e.target as HTMLElement | null;

  // 1. Candado estricto para modales (Ajustes de IA, Drive, Autenticación, etc.)
  // Si cualquier modal está abierto o el puntero está dentro de un elemento fijo:
  if (isAnyModalOpen() || isInsideFixedOrModal(targetEl)) {
    // Si el contenedor interno del modal puede desplazarse, permitir que el navegador haga scroll interno natural
    if (isScrollableElement(targetEl, e.deltaY)) {
      return;
    }
    // Si llegó al tope del modal o el cursor está en el fondo/cabecera, bloquear el evento
    // para que JAMÁS se mueva la página principal de atrás
    e.preventDefault();
    return;
  }

  // 2. Si el usuario está sobre una sublista normal de la página con scroll propio, respetarla
  if (isScrollableElement(targetEl, e.deltaY)) {
    return;
  }

  // 3. Desplazamiento de la página principal: evitar saltos por pasos de Windows
  e.preventDefault();

  const now = performance.now();
  const direction = Math.sign(e.deltaY);

  // Aceleración dinámica para desplazamientos rápidos y eficientes
  if (now - lastWheelTimestamp < 120 && direction === lastWheelDirection) {
    velocityBoost = Math.min(velocityBoost + 0.18, 1.85);
  } else {
    velocityBoost = 1.0;
  }
  lastWheelTimestamp = now;
  lastWheelDirection = direction;

  if (!isRunning) {
    targetY = window.scrollY;
    currentY = window.scrollY;
  }

  let delta = e.deltaY * BASE_MULTIPLIER * velocityBoost;
  if (e.deltaMode === 1) delta *= 24; // Modo líneas
  else if (e.deltaMode === 2) delta *= window.innerHeight; // Modo páginas

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  targetY = Math.max(0, Math.min(targetY + delta, maxScroll));

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
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  }
}
