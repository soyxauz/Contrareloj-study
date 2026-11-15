import React, { useState } from 'react';
import { GitBranch, Check } from 'lucide-react';
import { useTheme } from '../services/themeService';
import { buildTheaHierarchicalUrl } from '../utils/hierarchicalLink';

export interface HierarchicalLinkPillProps {
  mode: 'study' | 'smartStudy';
  kitId: string;
  subtopic?: string;
  className?: string;
  preferFullUrlOnCopy?: boolean;
}

/**
 * Píldora de enlace jerárquico de acceso inspirada en Thea (Astra AI)
 * Réplica visual exacta de las capturas con icono de bifurcación (⑂),
 * tipografía monoespaciada tabular y retroalimentación táctil de 120 FPS.
 */
export const HierarchicalLinkPill: React.FC<HierarchicalLinkPillProps> = ({
  mode,
  kitId,
  subtopic,
  className = '',
  preferFullUrlOnCopy = true,
}) => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const { contrarelojDisplayUrl, absoluteUrl } = buildTheaHierarchicalUrl(mode, kitId, subtopic);
  const displayUrl = contrarelojDisplayUrl;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = preferFullUrlOnCopy ? absoluteUrl : displayUrl;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Clic para copiar enlace jerárquico de acceso:\n${displayUrl}`}
      aria-label="Copiar enlace jerárquico de acceso"
      className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono select-none cursor-pointer backdrop-blur-md transition-[background-color,border-color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${
        theme === 'light'
          ? 'bg-slate-100/95 hover:bg-slate-200/90 border border-slate-300/80 text-sky-700 shadow-xs'
          : theme === 'kitty'
          ? 'bg-pink-100/90 hover:bg-pink-200/90 border border-pink-300 text-pink-700 shadow-xs'
          : 'bg-black/60 hover:bg-black/80 border border-white/10 hover:border-white/20 text-sky-400 shadow-sm'
      } ${className}`}
      style={{
        boxShadow:
          theme === 'light'
            ? '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)'
            : theme === 'kitty'
            ? '0 1px 2px rgba(236,72,153,0.12), inset 0 1px 0 rgba(255,255,255,0.9)'
            : '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <GitBranch
        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-160 group-hover:scale-110 ${
          copied
            ? 'text-emerald-400'
            : theme === 'light'
            ? 'text-slate-600'
            : theme === 'kitty'
            ? 'text-pink-600'
            : 'text-white/80'
        }`}
      />

      <span className="truncate max-w-[210px] sm:max-w-[320px] font-medium tracking-tight">
        {displayUrl}
      </span>

      {copied ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 font-sans ml-0.5 animate-fadeIn">
          <Check className="w-3 h-3 stroke-[3]" />
          <span>Copiado</span>
        </span>
      ) : null}
    </button>
  );
};
