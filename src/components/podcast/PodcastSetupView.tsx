import React from 'react';
import type { PodcastFormat, PodcastDuration } from '../../types';
import {
  Sparkles,
  Clock,
  Headphones,
  Volume2,
  Settings2,
  Loader2,
  Check,
} from 'lucide-react';
import { PODCAST_FORMAT_OPTIONS, PODCAST_DURATION_OPTIONS } from './podcastConstants';
import { AZURE_EDGE_VOICES } from '../../services/azureEdgeTtsService';
import { useTheme } from '../../services/themeService';

export interface PodcastSetupViewProps {
  selectedFormat: PodcastFormat;
  onSelectFormat: (f: PodcastFormat) => void;
  selectedDuration: PodcastDuration;
  onSelectDuration: (d: PodcastDuration) => void;
  orientationInput: string;
  onOrientationChange: (val: string) => void;
  voiceEngine: 'edge' | 'browser';
  edgeSofiaVoice: string;
  edgeMateoVoice: string;
  isGenerating: boolean;
  error?: string | null;
  onOpenVoiceModal: () => void;
  onGeneratePodcast: () => void;
  children?: React.ReactNode;
}

const ORIENTATION_PRESETS = [
  {
    label: 'Examen riguroso',
    prompt:
      'Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.',
  },
  {
    label: 'Debate ameno',
    prompt:
      'Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.',
  },
  {
    label: 'Explicación pedagógica',
    prompt:
      'Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.',
  },
];

export const PodcastSetupView: React.FC<PodcastSetupViewProps> = ({
  selectedFormat,
  onSelectFormat,
  selectedDuration,
  onSelectDuration,
  orientationInput,
  onOrientationChange,
  voiceEngine,
  edgeSofiaVoice,
  edgeMateoVoice,
  isGenerating,
  error,
  onOpenVoiceModal,
  onGeneratePodcast,
  children,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isKitty = theme === 'kitty';

  const surfaceClass = isDark
    ? 'bg-[#0e0b16]/95 border-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.5),0_12px_32px_-4px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)]'
    : 'thea-glass-card text-zinc-950';

  const headingText = isDark ? 'text-white' : isKitty ? 'text-pink-950' : 'text-zinc-950';
  const mutedText = isDark ? 'text-zinc-400' : isKitty ? 'text-pink-900/75' : 'text-slate-600';
  const dividerBorder = isDark ? 'border-white/[0.07]' : isKitty ? 'border-pink-200/60' : 'border-slate-200/70';

  const cardClasses = (selected: boolean) =>
    selected
      ? isDark
        ? 'border-white/40 bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
        : isKitty
        ? 'border-pink-500 bg-pink-50/75 backdrop-blur-md text-pink-950 shadow-xs ring-1 ring-pink-500'
        : 'border-zinc-900 bg-white/85 backdrop-blur-md text-zinc-950 shadow-xs ring-1 ring-zinc-900'
      : isDark
      ? 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 text-zinc-300'
      : isKitty
      ? 'thea-glass-pill thea-glass-pill-hover text-pink-950'
      : 'thea-glass-pill thea-glass-pill-hover text-zinc-800';

  const sofiaName = (AZURE_EDGE_VOICES.find((v) => v.id === edgeSofiaVoice)?.name || 'Elvira').replace(/\s*Neural\b/i, '');
  const mateoName = (AZURE_EDGE_VOICES.find((v) => v.id === edgeMateoVoice)?.name || 'Álvaro').replace(/\s*Neural\b/i, '');

  return (
    <div className="h-full w-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="min-h-full max-w-6xl mx-auto px-3.5 sm:px-6 pt-3 sm:pt-4 pb-24 lg:pb-5 flex flex-col justify-start lg:justify-center animate-fadeIn">
        {/* Encabezado compacto sin ruido */}
        <header className="text-center lg:text-left lg:flex lg:items-baseline lg:justify-between gap-4 mb-3 sm:mb-4">
          <h1 className={`text-xl sm:text-2xl font-extrabold tracking-tight ${headingText}`}>
            Personaliza tu Episodio Educativo
          </h1>
          <p className={`text-xs sm:text-sm mt-1 lg:mt-0 ${mutedText}`}>
            Configura formato, duración y enfoque para Sofía y Mateo.
          </p>
        </header>

        {/* Contenedor Studio Widescreen 7/5: cabe completo en escritorio y fluye con scroll en móvil */}
        <section className={`rounded-2xl sm:rounded-3xl border p-4 sm:p-5 lg:p-6 ${surfaceClass}`}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
            {/* COLUMNA IZQUIERDA (7/12): Formato + Duración */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-4">
              {/* SECCIÓN 1: FORMATO */}
              <div>
                <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${mutedText}`}>
                  Formato del episodio
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PODCAST_FORMAT_OPTIONS.map((f) => {
                    const isSelected = selectedFormat === f.id;
                    const IconComponent = f.icon;
                    return (
                      <button
                        key={`pre-format-${f.id}`}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectFormat(f.id)}
                        className={`p-3.5 rounded-2xl border text-left cursor-pointer flex flex-col justify-between transition-[transform,background-color,border-color] duration-160 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 ${
                          isKitty ? 'focus-visible:ring-pink-500' : isDark ? 'focus-visible:ring-white/60' : 'focus-visible:ring-zinc-900'
                        } ${cardClasses(isSelected)}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? isKitty
                                    ? 'bg-pink-500 text-white'
                                    : isDark
                                    ? 'bg-white text-zinc-950'
                                    : 'bg-zinc-900 text-white'
                                  : isDark
                                  ? 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
                                  : isKitty
                                  ? 'bg-pink-50 text-pink-600 border border-pink-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className={`font-bold text-sm block truncate ${headingText}`}>
                                {f.title}
                              </span>
                              <span className={`text-[11px] font-medium block ${mutedText}`}>
                                {f.badge}
                              </span>
                            </div>
                          </div>

                          <span
                            aria-hidden="true"
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-160 ${
                              isSelected
                                ? isKitty
                                  ? 'border-pink-500 bg-pink-500 text-white'
                                  : isDark
                                  ? 'border-white bg-white text-zinc-950'
                                  : 'border-zinc-900 bg-zinc-900 text-white'
                                : isDark
                                ? 'border-white/20 bg-zinc-900'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                        </div>

                        <p className={`text-xs leading-snug ${mutedText}`}>
                          {f.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECCIÓN 2: DURACIÓN */}
              <div className={`pt-4 border-t ${dividerBorder}`}>
                <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 ${mutedText}`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duración estimada</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PODCAST_DURATION_OPTIONS.map((d) => {
                    const isSelected = selectedDuration === d.id;
                    return (
                      <button
                        key={`pre-duration-${d.id}`}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectDuration(d.id)}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-[transform,background-color,border-color] duration-160 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 ${
                          isKitty ? 'focus-visible:ring-pink-500' : isDark ? 'focus-visible:ring-white/60' : 'focus-visible:ring-zinc-900'
                        } ${cardClasses(isSelected)}`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className={`font-bold text-sm ${headingText}`}>{d.title}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums shrink-0 ${
                              isSelected
                                ? isKitty
                                  ? 'bg-pink-500 text-white'
                                  : isDark
                                  ? 'bg-white/15 text-white border border-white/20'
                                  : 'bg-zinc-900 text-white'
                                : isDark
                                ? 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
                                : isKitty
                                ? 'bg-pink-50 text-pink-700 border border-pink-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {d.subtitle}
                          </span>
                        </div>
                        <p className={`text-[11px] leading-snug ${mutedText}`}>{d.detail}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA (5/12): Orientación, Voces y Acción principal */}
            <div className={`lg:col-span-5 flex flex-col gap-4 pt-4 border-t lg:pt-0 lg:border-t-0 lg:border-l lg:pl-6 ${dividerBorder}`}>
              {/* SECCIÓN 3: ORIENTACIÓN PERSONALIZADA */}
              <div className="flex-1 flex flex-col">
                <label
                  htmlFor="podcast-orientation-input"
                  className={`text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 ${mutedText}`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Orientación personalizada (opcional)</span>
                </label>

                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {ORIENTATION_PRESETS.map((preset) => {
                    const isPresetActive = orientationInput.trim() === preset.prompt;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={isPresetActive}
                        onClick={() => onOrientationChange(preset.prompt)}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-[transform,background-color,border-color] duration-160 ease-out active:scale-[0.97] ${
                          isPresetActive
                            ? isKitty
                              ? 'bg-pink-500 border-pink-500 text-white'
                              : isDark
                              ? 'bg-white/15 border-white/35 text-white'
                              : 'bg-zinc-900 border-zinc-900 text-white'
                            : isDark
                            ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300 hover:text-white'
                            : isKitty
                            ? 'bg-pink-50/70 hover:bg-pink-100/80 border-pink-200 text-pink-900'
                            : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  id="podcast-orientation-input"
                  rows={3}
                  value={orientationInput}
                  onChange={(e) => onOrientationChange(e.target.value)}
                  placeholder="Ej.: prioriza mecanismos clave, contrasta ventajas/desventajas o enfócate en preguntas de examen..."
                  className={`w-full flex-1 min-h-[88px] lg:min-h-[140px] rounded-2xl border p-3 text-base sm:text-xs leading-relaxed resize-none focus:outline-none transition-colors duration-160 ${
                    isDark
                      ? 'bg-[#090314]/90 border-white/[0.09] text-white placeholder-zinc-500 focus:border-white/35'
                      : isKitty
                      ? 'bg-pink-50/35 border-pink-200 text-pink-950 placeholder-pink-400 focus:border-pink-400'
                      : 'bg-slate-50 border-slate-200 text-zinc-950 placeholder-slate-400 focus:border-zinc-400'
                  }`}
                />
              </div>

              {/* SECCIÓN 4: VOCES + CTA */}
              <div className="space-y-3 shrink-0">
                <div
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-2xl border ${
                    isDark
                      ? 'bg-white/[0.025] border-white/[0.08]'
                      : isKitty
                      ? 'bg-pink-50/45 border-pink-200/80'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                        isDark
                          ? 'bg-white/[0.07] border-white/15 text-zinc-200'
                          : isKitty
                          ? 'bg-white border-pink-200 text-pink-600'
                          : 'bg-white border-slate-200 text-zinc-800'
                      }`}
                    >
                      {voiceEngine === 'edge' ? (
                        <Headphones className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-xs font-bold block truncate ${headingText}`}>
                        {voiceEngine === 'edge' ? 'Azure Neural (Edge)' : 'Voces del Navegador'}
                      </span>
                      <p className={`text-[11px] truncate ${mutedText}`}>
                        {voiceEngine === 'edge'
                          ? `Sofía: ${sofiaName} • Mateo: ${mateoName}`
                          : 'Sofía (1.25x) • Mateo (0.68x)'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenVoiceModal}
                    className={`w-full sm:w-auto justify-center px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-[transform,background-color,border-color] duration-160 ease-out active:scale-[0.97] ${
                      isDark
                        ? 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-zinc-200'
                        : isKitty
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-800'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-zinc-800'
                    }`}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Configurar Voces</span>
                  </button>
                </div>

                {error && !isGenerating && (
                  <div
                    role="alert"
                    className={`p-3 rounded-2xl border text-xs leading-relaxed ${
                      isDark
                        ? 'border-rose-500/30 bg-rose-950/35 text-rose-200'
                        : 'border-rose-300 bg-rose-50 text-rose-800'
                    }`}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={onGeneratePodcast}
                  disabled={isGenerating}
                  className={`w-full py-3.5 px-5 rounded-2xl font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-[transform,background-color,box-shadow] duration-160 ease-out active:scale-[0.985] ${
                    isKitty
                      ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/20'
                      : isDark
                      ? 'bg-white hover:bg-zinc-200 text-zinc-950'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generando Guión y Diálogo de Podcast con IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generar Podcast con IA</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {children}
      </div>
    </div>
  );
};
