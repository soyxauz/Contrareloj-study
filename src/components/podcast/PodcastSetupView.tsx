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
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
          CONFIGURACIÓN PREVIA DEL PODCAST
        </span>
        <h1 className="text-xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
          Personaliza tu Episodio Educativo
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
          Elige el formato de análisis, la duración estimada y el enfoque temático con el que Sofía y Mateo repasarán este material de estudio.
        </p>
      </div>

      <div className="bg-[#0e0b16]/95 border border-white/[0.08] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] space-y-5 sm:space-y-6">
        {/* SECCIÓN 1: FORMATO */}
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Formato</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
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
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative group active:scale-[0.985] ${
                    isSelected
                      ? 'border-white/40 bg-white/[0.06] shadow-sm'
                      : 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] text-zinc-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-white text-zinc-950 font-bold' : 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
                        }`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-sm text-white block">{f.title}</span>
                          <span className="text-[10px] text-zinc-400 font-semibold">{f.badge}</span>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-white bg-white text-zinc-950' : 'border-white/20 bg-zinc-900'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {f.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 2: DURACIÓN */}
        <div className="pt-4 border-t border-white/[0.06]">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span>Duración del Podcast</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
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
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative active:scale-[0.985] ${
                    isSelected
                      ? 'border-white/40 bg-white/[0.06] shadow-sm'
                      : 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-white">{d.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
                      isSelected ? 'bg-white/10 text-white border border-white/20' : 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
                    }`}>
                      {d.subtitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    {d.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 3: ORIENTACIÓN Y ENFOQUE */}
        <div className="pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-zinc-400" />
              <span>Orientación Personalizada (Opcional)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2.5">
            <button
              type="button"
              onClick={() => onOrientationChange('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
              className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              Examen riguroso
            </button>
            <button
              type="button"
              onClick={() => onOrientationChange('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
              className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              Debate ameno
            </button>
            <button
              type="button"
              onClick={() => onOrientationChange('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
              className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              Explicación pedagógica
            </button>
          </div>

          <textarea
            rows={2}
            value={orientationInput}
            onChange={(e) => onOrientationChange(e.target.value)}
            placeholder="Instrucciones adicionales para el podcast (ej: haz énfasis en los antecedentes históricos, debate las ventajas y desventajas, prepara para un quiz...)"
            className="w-full bg-[#090314]/90 border border-white/[0.08] rounded-2xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 resize-none leading-relaxed transition-colors"
          />
        </div>

        {/* SECCIÓN 4: MOTOR Y VOCES */}
        <div className="pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.025] p-4 rounded-2xl border border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              voiceEngine === 'edge' ? 'bg-white/10 border-white/15 text-zinc-200' : 'bg-white/[0.05] border-white/10 text-zinc-300'
            }`}>
              {voiceEngine === 'edge' ? <Headphones className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  {voiceEngine === 'edge' ? 'Azure Neural (Microsoft Edge)' : 'Voces del Navegador'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {voiceEngine === 'edge'
                  ? `Sofía: ${AZURE_EDGE_VOICES.find(v => v.id === edgeSofiaVoice)?.name || 'Elvira'} • Mateo: ${AZURE_EDGE_VOICES.find(v => v.id === edgeMateoVoice)?.name || 'Álvaro'}`
                  : 'Modulación acústica: Sofía (1.25x) y Mateo (0.68x)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenVoiceModal}
            className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto active:scale-95"
          >
            <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Configurar Voces</span>
          </button>
        </div>

        {/* BOTÓN PRINCIPAL DE GENERACIÓN */}
        <div className="pt-3">
          <button
            onClick={onGeneratePodcast}
            disabled={isGenerating}
            className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-extrabold text-sm sm:text-base shadow-xl transition-all active:scale-[0.985] flex items-center justify-center gap-2.5 cursor-pointer"
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
