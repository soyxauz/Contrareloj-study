import React from 'react';
import { createPortal } from 'react-dom';
import type { PodcastFormat, PodcastDuration } from '../../types';
import {
  Sparkles,
  Headphones,
  Volume2,
  X,
  Check,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { PODCAST_FORMAT_OPTIONS, PODCAST_DURATION_OPTIONS } from './podcastConstants';
import {
  AZURE_EDGE_VOICES,
  type AzureEdgeVoiceOption,
} from '../../services/azureEdgeTtsService';
import { savePodcastSettings } from '../../services/geminiAudioService';
import { googleDriveService } from '../../services/googleDriveService';
import { useTheme } from '../../services/themeService';

export interface PodcastVoiceModalProps {
  show: boolean;
  voiceModalTab: 'azure' | 'new_episode';
  onTabChange: (tab: 'azure' | 'new_episode') => void;
  onClose: () => void;
  edgeSofiaVoice: string;
  onSelectEdgeSofiaVoice: (id: string) => void;
  edgeMateoVoice: string;
  onSelectEdgeMateoVoice: (id: string) => void;
  isTestingVoice: boolean;
  onPreviewAzureVoice: (e: React.MouseEvent, v: AzureEdgeVoiceOption) => void;
  onTestVoiceSample: (speaker: 'sofia' | 'mateo') => void;
  selectedFormat: PodcastFormat;
  onSelectFormat: (f: PodcastFormat) => void;
  selectedDuration: PodcastDuration;
  onSelectDuration: (d: PodcastDuration) => void;
  orientationInput: string;
  onOrientationChange: (val: string) => void;
  onRequestConfirmReplace: () => void;
  isGenerating: boolean;
}

export const PodcastVoiceModal: React.FC<PodcastVoiceModalProps> = ({
  show,
  voiceModalTab,
  onTabChange,
  onClose,
  edgeSofiaVoice,
  onSelectEdgeSofiaVoice,
  edgeMateoVoice,
  onSelectEdgeMateoVoice,
  isTestingVoice,
  onPreviewAzureVoice,
  onTestVoiceSample,
  selectedFormat,
  onSelectFormat,
  selectedDuration,
  onSelectDuration,
  orientationInput,
  onOrientationChange,
  onRequestConfirmReplace,
  isGenerating,
}) => {
  const { theme } = useTheme();
  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-modal-backdrop">
      <div className={`border rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col shadow-2xl relative text-left overflow-hidden animate-modal-card ${
        theme === 'dark'
          ? 'bg-thea-surface border-thea-border text-white'
          : 'thea-glass-modal text-zinc-950'
      }`}>
        {/* Encabezado fijo del Modal */}
        <div className={`p-4 sm:p-6 pb-3.5 border-b shrink-0 flex items-center justify-between ${
          theme === 'dark' ? 'border-thea-border' : theme === 'kitty' ? 'border-pink-100' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              voiceModalTab === 'new_episode'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-500'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500'
            }`}>
              {voiceModalTab === 'new_episode' ? (
                <Sparkles className="w-5 h-5" />
              ) : (
                <Headphones className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-950'}`}>
                {voiceModalTab === 'new_episode'
                  ? 'Crear Nuevo Episodio de Podcast'
                  : 'Configuración de Voces Azure Neural'}
              </h3>
              <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                {voiceModalTab === 'new_episode'
                  ? 'Configura un formato o duración distinta para este material'
                  : 'Personaliza las voces neuronales oficiales para Sofía y Mateo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors duration-150 cursor-pointer active:scale-95 ${
              theme === 'dark'
                ? 'text-slate-400 hover:text-white hover:bg-thea-surfaceLight'
                : 'text-slate-500 hover:text-zinc-950 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas fijas de Selección */}
        <div className={`px-4 sm:px-6 py-2.5 border-b shrink-0 ${
          theme === 'dark' ? 'border-thea-border' : theme === 'kitty' ? 'border-pink-100' : 'border-slate-100'
        }`}>
          <div className={`grid grid-cols-2 gap-2 p-1.5 border rounded-2xl ${
            theme === 'dark'
              ? 'bg-thea-surfaceLight/80 border-thea-border'
              : theme === 'kitty'
              ? 'bg-pink-50 border-pink-200'
              : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              type="button"
              onClick={() => onTabChange('azure')}
              className={`py-2 px-3 rounded-xl font-bold text-xs transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.985] flex items-center justify-center gap-2 cursor-pointer ${
                voiceModalTab === 'azure'
                  ? theme === 'dark'
                    ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-300 shadow-sm'
                    : 'bg-emerald-100/90 border border-emerald-400 text-emerald-900 shadow-sm'
                  : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-zinc-950'
              }`}
            >
              <Headphones className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`} />
              <div className="text-left hidden sm:block">
                <div className="font-bold">Azure Neural</div>
                <div className={`text-[10px] font-normal ${theme === 'dark' ? 'text-emerald-400/90' : 'text-emerald-800'}`}>Voces Oficiales</div>
              </div>
              <span className="sm:hidden text-xs font-bold">Azure</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('new_episode')}
              className={`py-2 px-3 rounded-xl font-bold text-xs transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.985] flex items-center justify-center gap-2 cursor-pointer ${
                voiceModalTab === 'new_episode'
                  ? theme === 'dark'
                    ? 'bg-amber-500/20 border border-amber-500/45 text-amber-300 shadow-sm'
                    : 'bg-amber-100/90 border border-amber-400 text-amber-900 shadow-sm'
                  : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-zinc-950'
              }`}
            >
              <Sparkles className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`} />
              <div className="text-left hidden sm:block">
                <div className="font-bold">Nuevo Episodio</div>
                <div className={`text-[10px] font-normal ${theme === 'dark' ? 'text-amber-400/90' : 'text-amber-800'}`}>Reemplazar podcast</div>
              </div>
              <span className="sm:hidden text-xs font-bold">Nuevo</span>
            </button>
          </div>
        </div>

        {/* Cuerpo con Scroll Hardware-Accelerated a 120 FPS */}
        <div className="flex-1 min-h-0 overflow-y-auto modal-smooth-scroll overscroll-contain p-4 sm:p-6 space-y-4">
          {/* PESTAÑA 1: AZURE NEURAL */}
          {voiceModalTab === 'azure' && (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                theme === 'dark'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <Headphones className="w-4 h-4 text-emerald-500" />
                    Microsoft Azure Neural Voices (Edge TTS)
                  </span>
                </div>
                <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  Voces neuronales auténticas de Microsoft Azure con entonación natural, cadencia humana y emoción conversacional. Todo el audio se precarga automáticamente en segundo plano y se almacena en IndexedDB para respuesta a 0ms sin pausas.
                </p>
              </div>

              {/* Sofía */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    theme === 'dark' ? 'text-slate-300' : 'text-slate-800'
                  }`}>
                    <span>Voz de Sofía (Host Principal)</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold lowercase ${
                      theme === 'dark'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-amber-100 text-amber-900 border-amber-200'
                    }`}>
                      femenina • azure neural
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AZURE_EDGE_VOICES.filter(v => v.gender === 'female').map((v) => {
                    const isSelected = edgeSofiaVoice === v.id;
                    return (
                      <div
                        key={`edge-sofia-${v.id}`}
                        onClick={() => {
                          onSelectEdgeSofiaVoice(v.id);
                          const updated = savePodcastSettings({ edgeSofiaVoice: v.id });
                          if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                            googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                          }
                        }}
                        className={`p-3 rounded-2xl border text-left transition-colors duration-150 active:scale-[0.985] cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? theme === 'kitty'
                              ? 'border-pink-500 bg-pink-50 text-pink-950 shadow-md ring-1 ring-pink-500/40'
                              : theme === 'light'
                              ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-md ring-1 ring-amber-500/40'
                              : 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                            : theme === 'kitty'
                            ? 'border-pink-200 bg-pink-50/40 hover:bg-pink-50 text-slate-700'
                            : theme === 'light'
                            ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold text-sm ${theme === 'dark' ? 'text-white' : 'text-zinc-950'}`}>
                              {v.name.replace(' Neural', '')}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                theme === 'dark'
                                  ? 'bg-thea-bg border-thea-border text-amber-300'
                                  : 'bg-white border-slate-200 text-amber-700 shadow-xs'
                              }`}>
                                {v.country}
                              </span>
                              {isSelected && <Check className={`w-4 h-4 ${theme === 'kitty' ? 'text-pink-600' : 'text-amber-500'}`} />}
                            </div>
                          </div>
                          <p className={`text-[11px] line-clamp-1 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                            {v.tone}
                          </p>
                          {v.roleHint && (
                            <span className={`text-[10px] block mt-0.5 font-medium ${theme === 'kitty' ? 'text-pink-600' : 'text-amber-600 dark:text-amber-400/90'}`}>
                              {v.roleHint}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-end mt-2">
                          <button
                            type="button"
                            disabled={isTestingVoice}
                            onClick={(e) => onPreviewAzureVoice(e, v)}
                            className={`px-2.5 py-1 rounded-lg border text-[10px] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40 ${
                              theme === 'dark'
                                ? 'bg-thea-surface hover:bg-thea-surfaceLight border-thea-border text-amber-300 hover:text-white'
                                : 'bg-white hover:bg-slate-100 border-slate-200 text-amber-800 hover:text-amber-950 shadow-xs'
                            }`}
                            title={`Escuchar muestra de ${v.name}`}
                          >
                            <Volume2 className="w-3 h-3 text-amber-500" />
                            <span>Escuchar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mateo */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    theme === 'dark' ? 'text-slate-300' : 'text-slate-800'
                  }`}>
                    <span>Voz de Mateo (Co-Host Analítico)</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold lowercase ${
                      theme === 'dark'
                        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                        : 'bg-violet-100 text-violet-900 border-violet-200'
                    }`}>
                      masculina • azure neural
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AZURE_EDGE_VOICES.filter(v => v.gender === 'male').map((v) => {
                    const isSelected = edgeMateoVoice === v.id;
                    return (
                      <div
                        key={`edge-mateo-${v.id}`}
                        onClick={() => {
                          onSelectEdgeMateoVoice(v.id);
                          const updated = savePodcastSettings({ edgeMateoVoice: v.id });
                          if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                            googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                          }
                        }}
                        className={`p-3 rounded-2xl border text-left transition-colors duration-150 active:scale-[0.985] cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? theme === 'kitty'
                              ? 'border-pink-500 bg-pink-50 text-pink-950 shadow-md ring-1 ring-pink-500/40'
                              : theme === 'light'
                              ? 'border-violet-500 bg-violet-50 text-violet-950 shadow-md ring-1 ring-violet-500/40'
                              : 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                            : theme === 'kitty'
                            ? 'border-pink-200 bg-pink-50/40 hover:bg-pink-50 text-slate-700'
                            : theme === 'light'
                            ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold text-sm ${theme === 'dark' ? 'text-white' : 'text-zinc-950'}`}>
                              {v.name.replace(' Neural', '')}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                theme === 'dark'
                                  ? 'bg-thea-bg border-thea-border text-violet-300'
                                  : 'bg-white border-slate-200 text-violet-700 shadow-xs'
                              }`}>
                                {v.country}
                              </span>
                              {isSelected && <Check className={`w-4 h-4 ${theme === 'kitty' ? 'text-pink-600' : 'text-violet-500'}`} />}
                            </div>
                          </div>
                          <p className={`text-[11px] line-clamp-1 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                            {v.tone}
                          </p>
                          {v.roleHint && (
                            <span className={`text-[10px] block mt-0.5 font-medium ${theme === 'kitty' ? 'text-pink-600' : 'text-violet-600 dark:text-violet-400/90'}`}>
                              {v.roleHint}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-end mt-2">
                          <button
                            type="button"
                            disabled={isTestingVoice}
                            onClick={(e) => onPreviewAzureVoice(e, v)}
                            className={`px-2.5 py-1 rounded-lg border text-[10px] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40 ${
                              theme === 'dark'
                                ? 'bg-thea-surface hover:bg-thea-surfaceLight border-thea-border text-violet-300 hover:text-white'
                                : 'bg-white hover:bg-slate-100 border-slate-200 text-violet-800 hover:text-violet-950 shadow-xs'
                            }`}
                            title={`Escuchar muestra de ${v.name}`}
                          >
                            <Volume2 className="w-3 h-3 text-violet-500" />
                            <span>Escuchar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: NUEVO EPISODIO */}
          {voiceModalTab === 'new_episode' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-amber-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Crear un nuevo episodio y reemplazar el actual
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    Regeneración
                  </span>
                </div>
                <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>
                  Elige un nuevo formato y duración para generar otra perspectiva sobre tus fuentes de estudio. El episodio actual y los audios en caché se borrarán para dar paso al nuevo guión.
                </p>
              </div>

              {/* Formato */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}`}>
                    Formato del Podcast
                  </label>
                  <span className={`text-[10px] font-semibold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>Estilo NotebookLM</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PODCAST_FORMAT_OPTIONS.map((f) => {
                    const isSelected = selectedFormat === f.id;
                    const IconComp = f.icon;
                    return (
                      <div
                        key={`modal-fmt-${f.id}`}
                        onClick={() => onSelectFormat(f.id)}
                        className={`p-3 rounded-2xl border text-left transition-colors duration-150 active:scale-[0.985] cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? theme === 'kitty'
                              ? 'border-pink-500 bg-pink-50 text-pink-950 shadow-md ring-1 ring-pink-500/40'
                              : theme === 'light'
                              ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-md ring-1 ring-amber-500/40'
                              : 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                            : theme === 'kitty'
                            ? 'border-pink-200 bg-pink-50/40 hover:bg-pink-50 text-slate-700'
                            : theme === 'light'
                            ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                                isSelected
                                  ? (theme === 'kitty' ? 'bg-pink-500 text-white font-bold' : 'bg-amber-400 text-slate-950 font-bold')
                                  : (theme === 'dark' ? 'bg-thea-bg text-slate-400 border border-thea-border' : 'bg-slate-200 text-slate-700')
                              }`}>
                                <IconComp className="w-3.5 h-3.5" />
                              </div>
                              <span className={`font-bold text-sm ${
                                theme === 'dark' ? 'text-white' : 'text-zinc-950'
                              }`}>{f.title}</span>
                            </div>
                            {isSelected && <Check className={`w-4 h-4 ${theme === 'kitty' ? 'text-pink-600' : 'text-amber-500'}`} />}
                          </div>
                          <p className={`text-[11px] leading-relaxed ${
                            theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                          }`}>
                            {f.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Duración */}
              <div>
                <label className={`text-xs font-bold uppercase tracking-wider block mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}`}>
                  Duración del Podcast
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PODCAST_DURATION_OPTIONS.map((d) => {
                    const isSelected = selectedDuration === d.id;
                    return (
                      <div
                        key={`modal-dur-${d.id}`}
                        onClick={() => onSelectDuration(d.id)}
                        className={`p-3 rounded-2xl border text-left transition-colors duration-150 active:scale-[0.985] cursor-pointer ${
                          isSelected
                            ? theme === 'kitty'
                              ? 'border-pink-500 bg-pink-50 text-pink-950 shadow-md ring-1 ring-pink-500/40'
                              : theme === 'light'
                              ? 'border-violet-500 bg-violet-50 text-violet-950 shadow-md ring-1 ring-violet-500/40'
                              : 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                            : theme === 'kitty'
                            ? 'border-pink-200 bg-pink-50/40 hover:bg-pink-50 text-slate-700'
                            : theme === 'light'
                            ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-bold text-xs ${
                            theme === 'dark' ? 'text-white' : 'text-zinc-950'
                          }`}>{d.title}</span>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                            isSelected
                              ? (theme === 'kitty' ? 'bg-pink-100 text-pink-700' : 'bg-violet-500/30 text-violet-200')
                              : (theme === 'dark' ? 'bg-thea-bg text-slate-400' : 'bg-slate-200 text-slate-700')
                          }`}>
                            {d.subtitle}
                          </span>
                        </div>
                        <p className={`text-[10px] leading-snug ${
                          theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          {d.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Orientación */}
              <div>
                <label className={`text-xs font-bold uppercase tracking-wider block mb-1.5 ${
                  theme === 'dark' ? 'text-slate-300' : 'text-slate-700 font-bold'
                }`}>
                  Orientación Personalizada (Opcional)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => onOrientationChange('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer border ${
                      theme === 'dark'
                        ? 'bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border-thea-border text-slate-300 hover:text-amber-300'
                        : theme === 'kitty'
                        ? 'bg-pink-50 hover:bg-pink-100/70 border-pink-200 text-pink-700'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    Examen riguroso
                  </button>
                  <button
                    type="button"
                    onClick={() => onOrientationChange('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer border ${
                      theme === 'dark'
                        ? 'bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border-thea-border text-slate-300 hover:text-violet-300'
                        : theme === 'kitty'
                        ? 'bg-pink-50 hover:bg-pink-100/70 border-pink-200 text-pink-700'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    Debate ameno
                  </button>
                  <button
                    type="button"
                    onClick={() => onOrientationChange('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer border ${
                      theme === 'dark'
                        ? 'bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border-thea-border text-slate-300 hover:text-emerald-300'
                        : theme === 'kitty'
                        ? 'bg-pink-50 hover:bg-pink-100/70 border-pink-200 text-pink-700'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    Explicación pedagógica
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={orientationInput}
                  onChange={(e) => onOrientationChange(e.target.value)}
                  placeholder="Instrucciones adicionales para la IA en este nuevo episodio..."
                  className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none leading-relaxed font-sans ${
                    theme === 'dark'
                      ? 'bg-thea-bg border-thea-border text-white placeholder-slate-500'
                      : theme === 'kitty'
                      ? 'bg-pink-50/50 border-pink-200 text-zinc-950 placeholder-pink-300'
                      : 'bg-slate-50 border-slate-200 text-zinc-950 placeholder-slate-400'
                  }`}
                />
              </div>

            </div>
          )}
        </div>

        {/* Pie de Acciones Fijo (Siempre Visible, 120 FPS sin repaint de sombra) */}
        <div className={`p-4 sm:p-6 py-3 border-t shrink-0 flex items-center justify-between gap-3 ${
          theme === 'dark'
            ? 'border-thea-border bg-thea-surface'
            : theme === 'kitty'
            ? 'border-pink-200/60 bg-pink-50/40'
            : 'border-slate-200/70 bg-white/40'
        }`}>
          {voiceModalTab === 'new_episode' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors duration-150 active:scale-[0.985] ${
                  theme === 'dark'
                    ? 'bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border-thea-border text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                }`}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={onRequestConfirmReplace}
                disabled={isGenerating}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 active:scale-[0.985] disabled:opacity-50 text-slate-950 font-extrabold text-xs transition-transform duration-150 shadow-lg shadow-amber-900/30 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Crear y reemplazar episodio actual</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  disabled={isTestingVoice}
                  onClick={() => onTestVoiceSample('sofia')}
                  className={`px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border text-xs font-semibold transition-colors duration-150 active:scale-[0.985] disabled:opacity-40 cursor-pointer flex items-center gap-1.5 ${
                    theme === 'dark'
                      ? 'bg-thea-surfaceLight border-thea-border hover:border-amber-400 text-slate-300 hover:text-white'
                      : theme === 'kitty'
                      ? 'bg-white border-pink-200 hover:border-pink-400 text-pink-900 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800 shadow-xs'
                  }`}
                >
                  {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-amber-500" />}
                  <span>Probar Sofía</span>
                </button>

                <button
                  type="button"
                  disabled={isTestingVoice}
                  onClick={() => onTestVoiceSample('mateo')}
                  className={`px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border text-xs font-semibold transition-colors duration-150 active:scale-[0.985] disabled:opacity-40 cursor-pointer flex items-center gap-1.5 ${
                    theme === 'dark'
                      ? 'bg-thea-surfaceLight border-thea-border hover:border-violet-400 text-slate-300 hover:text-white'
                      : theme === 'kitty'
                      ? 'bg-white border-pink-200 hover:border-pink-400 text-pink-900 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800 shadow-xs'
                  }`}
                >
                  {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-violet-500" />}
                  <span>Probar Mateo</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl font-bold text-xs transition-colors duration-150 active:scale-[0.985] cursor-pointer text-white shadow-md ${
                  theme === 'kitty' ? 'bg-pink-500 hover:bg-pink-600' : 'bg-violet-600 hover:bg-violet-500'
                }`}
              >
                Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
