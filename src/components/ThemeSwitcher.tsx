import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../services/themeService';

// Adorable SVG Icon for Kitty Mode (Hello Kitty classic hair bow)
const KittyBowIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    {/* Hello Kitty Iconic Bow */}
    <circle cx="12" cy="12" r="3" />
    <path d="M12 12 C9.5 8 4 6.5 4 11 C4 15 9.5 13.5 12 12 Z" />
    <path d="M12 12 C14.5 8 20 6.5 20 11 C20 15 14.5 13.5 12 12 Z" />
  </svg>
);

interface ThemeSwitcherProps {
  currentTheme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
  className?: string;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  currentTheme,
  onSelectTheme,
  className = '',
}) => {
  return (
    <div
      role="radiogroup"
      aria-label="Selector de Tema de Interfaz"
      className={`inline-flex items-center p-0.5 sm:p-1 rounded-xl bg-thea-surfaceLight/80 border border-thea-border shadow-sm shrink-0 ${className}`}
    >
      {/* 1. Botón Modo Oscuro (Luna) */}
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === 'dark'}
        onClick={() => onSelectTheme('dark')}
        title="Modo Oscuro (Fondo profundo & Bordeaux)"
        className={`active-press p-1.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
          currentTheme === 'dark'
            ? 'bg-rose-950/70 text-rose-200 border border-rose-500/30 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        <span className="hidden xl:inline text-[11px] font-medium">Oscuro</span>
      </button>

      {/* 2. Botón Modo Claro (Sol) */}
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === 'light'}
        onClick={() => onSelectTheme('light')}
        title="Modo Claro (Fondo limpio y texto oscuro de alto contraste)"
        className={`active-press p-1.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
          currentTheme === 'light'
            ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="hidden xl:inline text-[11px] font-medium">Claro</span>
      </button>

      {/* 3. Botón Modo Kitty (Rosa y Blanco) */}
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === 'kitty'}
        onClick={() => onSelectTheme('kitty')}
        title="Modo Kitty (Rosa pastel, blanco nítido y Kitty Study)"
        className={`active-press p-1.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
          currentTheme === 'kitty'
            ? 'bg-pink-500 text-white border border-pink-400 shadow-sm shadow-pink-500/20'
            : 'text-pink-400 hover:text-pink-300 hover:bg-pink-500/10'
        }`}
      >
        <KittyBowIcon className="w-3.5 h-3.5" />
        <span className="hidden xl:inline text-[11px] font-medium">Kitty</span>
      </button>
    </div>
  );
};
