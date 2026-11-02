/**
 * Motor de desplazamiento inercial de alta fidelidad a 120 FPS sin microtirones.
 * 
 * Principios físicos aplicados:
 * 1. Amortiguación de impulsos continuos (Continuous Impulse Accumulator):
 *    Las muescas discretas de la rueda del ratón entran a un acumulador continuo que se
 *    descarga suavemente de forma exponencial, eliminando los saltos bruscos de aceleración (jerk)
 *    entre muesca y muesca.
 * 2. Cadencia dinámica reactiva:
 *    Aceleración inercial progresiva en giros rápidos de rueda para recorrer documentos largos
 *    sin fatiga, con corte instantáneo de inercia opuesta al invertir la dirección.
 * 3. Soporte nativo para scroll horizontal sin intercepciones no deseadas.
 * 4. Aislamiento estricto de modales: bloquea al 100% el fondo cuando hay modales o diálogos activos.
 * 5. 0% de uso de CPU cuando no hay movimiento (el bucle RAF se cancela de inmediato).
 */

let targetY = 0;
let currentY = 0;
let inputQueue = 0;
let isRunning = false;
let rafId: number | null = null;
let isInitialized = false;
let lastFrameTime = 0;
let isProgrammaticScroll = false;
let lastWheelTime = 0;
let cadenceTicks = 0;

// Constantes físicas calibradas según el estándar de Apple / Emil Kowalski
const LERP_LAMBDA = 24.0;      // Tasa de convergencia continua (~110ms de respuesta instantánea y sedosa)
const QUEUE_LAMBDA = 48.0;     // Descarga ágil del impulso de la rueda (55% en frame 1) eliminando latencia inicial
const SCROLL_MULTIPLIER = 1.72; // Multiplicador de avance cómodo y rápido por muesca

/**
 * Obtiene la altura desplazable máxima actual de forma instantánea.
 */
function getMaxScroll(): number {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 0;
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

/**
 * Detecta si el cursor se encuentra dentro de un modal, panel flotante o diálogo con fondo fijo.
 */
function isInsideFixedOrModal(target: HTMLElement | null): boolean {
  if (!target) return false;
  return Boolean(
    target.closest('.fixed.inset-0, [role="dialog"], [aria-modal="true"], [data-modal]')
  );
}

/**
 * Detecta si hay algún modal o superposición de pantalla completa actualmente abierta en el DOM.
 */
function isAnyModalOpen(): boolean {
  if (typeof document === 'undefined') return false;
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

  // Comprobación ultrarrápida O(1): si no hay desbordamiento físico vertical, saltar estilos computados
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
 * Bucle de física continua en tiempo real (120 FPS sin microtirones).
 */
function tick(currentTime: number) {
  if (!lastFrameTime) {
    lastFrameTime = currentTime;
  }

  // Intervalo delta seguro (máximo 50ms para evitar saltos en caídas de framerate del sistema)
  const dt = Math.min((currentTime - lastFrameTime) / 1000, 0.05);
  lastFrameTime = currentTime;

  const maxScroll = getMaxScroll();

  // 1. Descarga continua y suave del acumulador de rueda
  const dischargeFactor = 1 - Math.exp(-QUEUE_LAMBDA * dt);
  const deltaToApply = inputQueue * dischargeFactor;
  inputQueue -= deltaToApply;
  targetY = Math.max(0, Math.min(targetY + deltaToApply, maxScroll));

  // 2. Convergencia continua de la posición visual actual hacia el objetivo
  const lerpFactor = 1 - Math.exp(-LERP_LAMBDA * dt);
  currentY += (targetY - currentY) * lerpFactor;
  currentY = Math.max(0, Math.min(currentY, maxScroll));

  // 3. Umbral de reposo absoluto
  if (Math.abs(targetY - currentY) < 0.25 && Math.abs(inputQueue) < 0.25) {
    currentY = targetY;
    inputQueue = 0;
    isProgrammaticScroll = true;
    window.scrollTo({ top: currentY, left: 0, behavior: 'instant' });
    isProgrammaticScroll = false;
    isRunning = false;
    rafId = null;
    lastFrameTime = 0;
    return;
  }

  // 4. Aplicar desplazamiento instantáneo renderizado por hardware
  isProgrammaticScroll = true;
  window.scrollTo({ top: currentY, left: 0, behavior: 'instant' });
  isProgrammaticScroll = false;

  rafId = requestAnimationFrame(tick);
}

/**
 * Manejador de eventos de rueda con absorción inercial continua.
 */
function onWheel(e: WheelEvent) {
  if (e.ctrlKey) return;

  // Permitir desplazamiento horizontal natural sin interferencias
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  if (e.deltaY === 0) return;

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

  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 24;
  else if (e.deltaMode === 2) delta *= window.innerHeight;

  // Corte instantáneo de inercia al invertir la dirección de scroll
  if ((delta > 0 && (targetY < currentY || inputQueue < -2)) || (delta < 0 && (targetY > currentY || inputQueue > 2))) {
    inputQueue = 0;
    targetY = currentY;
    cadenceTicks = 0;
  }

  // Cadencia dinámica: si el usuario gira la rueda consecutivamente en ráfagas rápidas (<140ms),
  // se aplica un multiplicador de aceleración inercial progresivo para recorrer páginas largas sin esfuerzo.
  const now = performance.now();
  const timeSinceLast = now - lastWheelTime;
  lastWheelTime = now;

  if (timeSinceLast < 140) {
    cadenceTicks = Math.min(cadenceTicks + 1, 5);
  } else {
    cadenceTicks = 0;
  }

  const cadenceBoost = 1 + cadenceTicks * 0.12;
  delta *= (SCROLL_MULTIPLIER * cadenceBoost);

  if (!isRunning) {
    currentY = window.scrollY;
    targetY = window.scrollY;
    inputQueue = 0;
  }

  // Acumular el impulso de manera continua
  inputQueue += delta;

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
  if (isProgrammaticScroll) return;

  if (!isRunning) {
    targetY = window.scrollY;
    currentY = window.scrollY;
    inputQueue = 0;
  }
}

/**
 * Inicializa el escuchador de scroll inercial continuo.
 */
export function initUltraLightSmoothScroll(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }

  targetY = window.scrollY;
  currentY = window.scrollY;
  inputQueue = 0;
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
    inputQueue = 0;
  };
}

/**
 * Restablece la posición de desplazamiento inmediatamente y cancela cualquier animación en curso.
 */
export function resetUltraLightSmoothScroll(y: number = 0) {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  isRunning = false;
  lastFrameTime = 0;
  inputQueue = 0;
  targetY = y;
  currentY = y;
  if (typeof window !== 'undefined') {
    isProgrammaticScroll = true;
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    isProgrammaticScroll = false;
  }
}

/**
 * Indica si el motor de desplazamiento inercial se encuentra actualmente activo en un frame de animación.
 * Permite a las tareas en segundo plano (como sincronización con Google Drive) pausar operaciones pesadas
 * para no degradar los 120 FPS de fluidez de la interfaz.
 */
export function isSmoothScrollActive(): boolean {
  return isRunning;
}
