import { useState, useEffect, useCallback } from 'react';
import { authService } from './authService';
import { googleDriveService } from './googleDriveService';
import { HELLO_KITTY_PNG_DATA_URL } from '../utils/kittyAsset';

export type ThemeMode = 'dark' | 'light' | 'kitty';

export const THEME_STORAGE_KEY = 'thea_theme_mode';

const DEFAULT_CLOCK_FAVICON_DATA_URL = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%20fill='none'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0%25'%20y1='0%25'%20x2='100%25'%20y2='100%25'%3E%3Cstop%20offset='0%25'%20stop-color='%238b5cf6'/%3E%3Cstop%20offset='100%25'%20stop-color='%234f46e5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='64'%20height='64'%20rx='16'%20fill='url(%23g)'/%3E%3Ccircle%20cx='32'%20cy='32'%20r='21'%20stroke='%23ffffff'%20stroke-width='4.5'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3Cpolyline%20points='32%2017%2032%2032%2043%2038'%20stroke='%23ffffff'%20stroke-width='4.5'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3Ccircle%20cx='32'%20cy='32'%20r='2.5'%20fill='%23ffffff'/%3E%3C/svg%3E";

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    if (typeof document !== 'undefined') {
      const domTheme = document.documentElement.getAttribute('data-theme') as ThemeMode;
      if (domTheme === 'light' || domTheme === 'kitty' || domTheme === 'dark') {
        return domTheme;
      }
    }
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'kitty' || saved === 'dark') {
      return saved;
    }
  } catch (e) {
    console.warn('[ThemeService] Error al leer el tema local:', e);
  }
  return 'dark';
}

export function applyThemeToDom(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.remove('dark', 'light', 'kitty');
  root.classList.add(theme);

  // Metatag theme-color para navegadores móviles y desktop
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) {
    metaThemeColor = document.createElement('meta');
    metaThemeColor.setAttribute('name', 'theme-color');
    document.head.appendChild(metaThemeColor);
  }
  if (theme === 'kitty') {
    metaThemeColor.setAttribute('content', '#fff0f5');
    document.title = 'Kitty Study';
  } else if (theme === 'light') {
    metaThemeColor.setAttribute('content', '#f8f9fb');
    document.title = 'Contrareloj Study';
  } else {
    metaThemeColor.setAttribute('content', '#0d0408');
    document.title = 'Contrareloj Study';
  }

  // Favicon dinámico: Hello Kitty auténtica en Modo Kitty, Reloj en Modo Claro/Oscuro
  const iconLinks = document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]');
  const targetFavicon = theme === 'kitty' ? HELLO_KITTY_PNG_DATA_URL : DEFAULT_CLOCK_FAVICON_DATA_URL;
  const targetType = theme === 'kitty' ? 'image/png' : 'image/svg+xml';

  if (iconLinks.length > 0) {
    iconLinks.forEach((link) => {
      link.type = targetType;
      link.href = targetFavicon;
    });
  } else {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = targetType;
    link.href = targetFavicon;
    document.head.appendChild(link);
  }
}

export function setStoredTheme(theme: ThemeMode, syncToDrive = true): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn('[ThemeService] Error al guardar el tema local:', e);
  }

  applyThemeToDom(theme);

  window.dispatchEvent(
    new CustomEvent('thea_theme_changed', {
      detail: { theme },
    })
  );

  if (syncToDrive) {
    try {
      const user = authService.getCurrentUser();
      if (user && user.id && (googleDriveService.isLinked() || googleDriveService.getValidAccessToken())) {
        googleDriveService.pushProgressToDrive(user.id).catch((err) => {
          console.warn('[ThemeService] Error sincronizando tema a Drive:', err);
        });
      }
    } catch (err) {
      console.warn('[ThemeService] Error al disparar guardado de tema en Drive:', err);
    }
  }
}

export function initTheme(): ThemeMode {
  const theme = getStoredTheme();
  applyThemeToDom(theme);
  window.dispatchEvent(
    new CustomEvent('thea_theme_changed', {
      detail: { theme },
    })
  );
  return theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail && customEvent.detail.theme) {
        setThemeState(customEvent.detail.theme);
      } else {
        setThemeState(getStoredTheme());
      }
    };

    window.addEventListener('thea_theme_changed', handleThemeChange);

    // Observer para cambios directos de atributo en el elemento <html>
    let observer: MutationObserver | null = null;
    if (typeof document !== 'undefined') {
      observer = new MutationObserver(() => {
        const currentDom = document.documentElement.getAttribute('data-theme') as ThemeMode;
        if (currentDom === 'light' || currentDom === 'kitty' || currentDom === 'dark') {
          setThemeState(currentDom);
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }

    return () => {
      window.removeEventListener('thea_theme_changed', handleThemeChange);
      if (observer) observer.disconnect();
    };
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme, true);
  }, []);

  return { theme, setTheme };
}
