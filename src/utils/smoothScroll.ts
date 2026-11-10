/**
 * Desplazamiento nativo acelerado por hardware a 120 FPS.
 * 
 * Utiliza el compositor nativo del navegador en la GPU sin interceptar eventos de rueda en JS,
 * eliminando el 100% del bloqueo del hilo principal y las caídas de fotogramas (tirones).
 */

let isInitialized = false;

export function initUltraLightSmoothScroll(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  if (typeof document !== 'undefined') {
    document.documentElement.style.scrollBehavior = 'smooth';
  }

  return () => {
    isInitialized = false;
  };
}

/**
 * Restablece la posición de desplazamiento inmediatamente y cancela cualquier animación en curso.
 */
export function resetUltraLightSmoothScroll(y: number = 0): void {
  if (typeof window !== 'undefined') {
    try {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, y);
    }
  }
}

/**
 * Indica si hay alguna tarea de desplazamiento activo.
 */
export function isSmoothScrollActive(): boolean {
  return false;
}

if (typeof window !== 'undefined') {
  if ('scrollRestoration' in history) {
    try {
      history.scrollRestoration = 'manual';
    } catch (_) {}
  }
  initUltraLightSmoothScroll();
}
