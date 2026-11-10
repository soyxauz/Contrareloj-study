import React from 'react';
import { Headphones, RotateCcw, AlertCircle, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../services/themeService';

export interface PodcastReplacingCardProps {
  formatTitle: string;
  durationSubtitle: string;
  isGenerating: boolean;
  error: string | null;
  onRetry: () => void;
  onCancelRestore: () => void;
}

const WAVE_DELAYS_MS = [0, 120, 240, 360, 180];

export const PodcastReplacingCard: React.FC<PodcastReplacingCardProps> = ({
  formatTitle,
  durationSubtitle,
  isGenerating,
  error,
  onRetry,
  onCancelRestore,
}) => {
  const { theme } = useTheme();
  const isError = Boolean(error) && !isGenerating;

  const surfaceClass =
    theme === 'light'
      ? 'bg-white border-slate-200 text-zinc-950 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_28px_-4px_rgba(15,23,42,0.08)]'
      : theme === 'kitty'
      ? 'bg-white border-pink-200 text-zinc-950 shadow-[0_2px_8px_-1px_rgba(244,114,182,0.22),0_12px_28px_-4px_rgba(244,114,182,0.16)]'
      : 'bg-[#0e0b16]/95 border-white/[0.08] text-white shadow-[0_1px_2px_rgba(0,0,0,0.5),0_12px_32px_-4px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)]';

  const pillClass =
    theme === 'light'
      ? 'bg-slate-100 border-slate-200 text-slate-700'
      : theme === 'kitty'
      ? 'bg-pink-50 border-pink-200 text-pink-700'
      : 'bg-white/[0.05] border-white/[0.1] text-zinc-300';

  const waveColorClass =
    theme === 'kitty'
      ? 'bg-pink-500'
      : theme === 'light'
      ? 'bg-rose-600'
      : 'bg-gradient-to-t from-violet-500 to-rose-400';

  return (
    <div className="max-w-5xl w-full mx-auto px-3 sm:px-6 py-2 sm:py-3 h-full flex flex-col justify-center min-h-[340px]">
      <div
        role="status"
        aria-live="polite"
        aria-busy={isGenerating}
        className={`rounded-2xl sm:rounded-3xl border p-6 sm:p-10 relative overflow-hidden flex flex-col items-center justify-center text-center max-w-xl w-full mx-auto animate-podcast-panel-enter ${surfaceClass}`}
      >
        {isError ? (
          <>
            <div
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-4 ${
                theme === 'dark'
                  ? 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}
            >
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-base sm:text-lg font-bold tracking-tight mb-1.5">
              No se pudo reemplazar el episodio
            </h3>
            <p
              className={`text-xs sm:text-sm leading-relaxed max-w-md mb-6 ${
                theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'
              }`}
            >
              {error}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
              <button
                type="button"
                onClick={onCancelRestore}
                className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-[0.97] transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  theme === 'dark'
                    ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300 hover:text-white'
                    : theme === 'kitty'
                    ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-900'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver al episodio anterior</span>
              </button>

              <button
                type="button"
                onClick={onRetry}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-[0.97] transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  theme === 'kitty'
                    ? 'bg-pink-500 hover:bg-pink-600 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className={`w-14 h-14 rounded-2xl border flex items-end justify-center gap-1 px-2.5 pb-3.5 mb-5 ${
                theme === 'dark'
                  ? 'bg-white/[0.04] border-white/[0.1]'
                  : theme === 'kitty'
                  ? 'bg-pink-50 border-pink-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
              aria-hidden="true"
            >
              {WAVE_DELAYS_MS.map((delayMs, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-6 rounded-full animate-podcast-wave-bar ${waveColorClass}`}
                  style={{ animationDelay: `${delayMs}ms` }}
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 mb-2.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${pillClass}`}
              >
                <Headphones className="w-3 h-3" />
                <span>Reemplazando episodio</span>
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${pillClass}`}>
                {formatTitle}
              </span>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold tabular-nums ${pillClass}`}>
                {durationSubtitle}
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-extrabold tracking-tight mb-1.5">
              Generando nuevo episodio...
            </h3>
            <p
              className={`text-xs sm:text-sm leading-relaxed max-w-md mb-5 ${
                theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'
              }`}
            >
              Sofía y Alex están redactando un guion completamente nuevo. Aparecerá aquí en cuanto esté listo.
            </p>

            <div
              className={`w-48 sm:w-56 h-1.5 rounded-full overflow-hidden relative ${
                theme === 'dark' ? 'bg-white/10' : theme === 'kitty' ? 'bg-pink-100' : 'bg-slate-200'
              }`}
            >
              <div
                className={`w-2/5 h-full rounded-full animate-podcast-sheen ${
                  theme === 'kitty'
                    ? 'bg-gradient-to-r from-pink-400 via-pink-500 to-rose-400'
                    : 'bg-gradient-to-r from-violet-500 via-rose-500 to-indigo-400'
                }`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
