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
  onOpenVoiceModal: () => void;
  onGeneratePodcast: () => void;
  children?: React.ReactNode;
}

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
  onOpenVoiceModal,
  onGeneratePodcast,
  children,
}) => {
  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-2 sm:pt-6 pb-32 sm:pb-12 animate-fadeIn">
      {/* Encabezado */}
      <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2 sm:mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Configuración Previa del Podcast
        </div>
        <h1 className="text-xl sm:text-3xl font-extrabold text-white mb-2">
          Personaliza tu Episodio Educativo
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Elige el formato de análisis, la duración estimada y el enfoque temático con el que Sofía y Mateo repasarán este material de estudio.
        </p>
      </div>

      <div className="bg-thea-surface border border-thea-border rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl space-y-5 sm:space-y-6">
        {/* SECCIÓN 1: FORMATO */}
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Formato</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Personaliza tu resumen de audio eligiendo el formato que mejor se adapte a tus necesidades.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PODCAST_FORMAT_OPTIONS.map((f) => {
              const isSelected = selectedFormat === f.id;
              const IconComponent = f.icon;
              return (
                <div
                  key={`pre-format-${f.id}`}
                  onClick={() => onSelectFormat(f.id)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative group ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                      : 'border-thea-border bg-thea-surfaceLight/40 hover:bg-thea-surfaceLight/80 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-thea-surface text-slate-400 border border-thea-border'
                        }`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-sm text-white block">{f.title}</span>
                          <span className="text-[10px] text-amber-300/80 font-semibold">{f.badge}</span>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600 bg-thea-bg'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {f.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 2: DURACIÓN */}
        <div className="pt-4 border-t border-thea-border">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-400" />
              <span>Duración del Podcast</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecciona la extensión deseada según el tiempo que tengas disponible para estudiar.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PODCAST_DURATION_OPTIONS.map((d) => {
              const isSelected = selectedDuration === d.id;
              return (
                <div
                  key={`pre-duration-${d.id}`}
                  onClick={() => onSelectDuration(d.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    isSelected
                      ? 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                      : 'border-thea-border bg-thea-surfaceLight/40 hover:bg-thea-surfaceLight/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-white">{d.title}</span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-violet-500/30 text-violet-200 border border-violet-400/50' : 'bg-thea-bg text-slate-400 border border-thea-border'
                    }`}>
                      {d.subtitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    {d.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 3: ORIENTACIÓN Y ENFOQUE */}
        <div className="pt-4 border-t border-thea-border">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Orientación Personalizada (Opcional)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2.5">
            <button
              type="button"
              onClick={() => onOrientationChange('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
              className="px-2.5 py-1 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
            >
              Examen riguroso
            </button>
            <button
              type="button"
              onClick={() => onOrientationChange('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
              className="px-2.5 py-1 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs text-slate-300 hover:text-violet-300 transition-colors cursor-pointer"
            >
              Debate ameno
            </button>
            <button
              type="button"
              onClick={() => onOrientationChange('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
              className="px-2.5 py-1 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              Explicación pedagógica
            </button>
          </div>

          <textarea
            rows={2}
            value={orientationInput}
            onChange={(e) => onOrientationChange(e.target.value)}
            placeholder="Instrucciones adicionales para el podcast (ej: haz énfasis en los antecedentes históricos, debate las ventajas y desventajas, prepara para un quiz...)"
            className="w-full bg-thea-bg border border-thea-border rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"
          />
        </div>

        {/* SECCIÓN 4: MOTOR Y VOCES */}
        <div className="pt-4 border-t border-thea-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-thea-surfaceLight/30 p-4 rounded-2xl border border-thea-border">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              voiceEngine === 'edge' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-violet-600/20 border-violet-500/40 text-violet-400'
            }`}>
              {voiceEngine === 'edge' ? <Headphones className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  {voiceEngine === 'edge' ? 'Azure Neural (Microsoft Edge)' : 'Voces del Navegador'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {voiceEngine === 'edge'
                  ? `Sofía: ${AZURE_EDGE_VOICES.find(v => v.id === edgeSofiaVoice)?.name || 'Elvira'} • Mateo: ${AZURE_EDGE_VOICES.find(v => v.id === edgeMateoVoice)?.name || 'Álvaro'}`
                  : 'Modulación acústica: Sofía (1.25x) y Mateo (0.68x)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenVoiceModal}
            className="px-3.5 py-1.5 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Settings2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Configurar Voces</span>
          </button>
        </div>

        {/* BOTÓN PRINCIPAL DE GENERACIÓN */}
        <div className="pt-3">
          <button
            onClick={onGeneratePodcast}
            disabled={isGenerating}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-50 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-amber-900/30 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2.5 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generando Guión y Diálogo de Podcast con IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generar Podcast con IA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {children}
    </div>
  );
};
