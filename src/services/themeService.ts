import { useState, useEffect, useCallback } from 'react';
import { authService } from './authService';
import { googleDriveService } from './googleDriveService';

export type ThemeMode = 'dark' | 'light' | 'kitty';

export const THEME_STORAGE_KEY = 'thea_theme_mode';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
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
    return () => {
      window.removeEventListener('thea_theme_changed', handleThemeChange);
    };
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme, true);
  }, []);

  return { theme, setTheme };
}
