import React from 'react';
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

export interface PodcastVoiceModalProps {
  show: boolean;
  voiceModalTab: 'azure' | 'browser' | 'new_episode';
  onTabChange: (tab: 'azure' | 'browser' | 'new_episode') => void;
  voiceEngine: 'edge' | 'browser';
  onSwitchEngine: (engine: 'edge' | 'browser') => void;
  onClose: () => void;
  voices: SpeechSynthesisVoice[];
  edgeSofiaVoice: string;
  onSelectEdgeSofiaVoice: (id: string) => void;
  edgeMateoVoice: string;
  onSelectEdgeMateoVoice: (id: string) => void;
  localSofiaVoice: string;
  onSelectLocalSofiaVoice: (name: string) => void;
  localMateoVoice: string;
  onSelectLocalMateoVoice: (name: string) => void;
  isTestingVoice: boolean;
  onPreviewAzureVoice: (e: React.MouseEvent, v: AzureEdgeVoiceOption) => void;
  onPreviewLocalVoice: (e: React.MouseEvent, v: SpeechSynthesisVoice, gender: 'female' | 'male') => void;
  onPreviewAutomaticLocalSample: (e: React.MouseEvent, gender: 'female' | 'male') => void;
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
  voiceEngine,
  onSwitchEngine,
  onClose,
  voices,
  edgeSofiaVoice,
  onSelectEdgeSofiaVoice,
  edgeMateoVoice,
  onSelectEdgeMateoVoice,
  localSofiaVoice,
  onSelectLocalSofiaVoice,
  localMateoVoice,
  onSelectLocalMateoVoice,
  isTestingVoice,
  onPreviewAzureVoice,
  onPreviewLocalVoice,
  onPreviewAutomaticLocalSample,
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
  if (!show) return null;

  const esVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
  const candidateVoices = esVoices.length > 0 ? esVoices : voices;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-thea-surface border border-thea-border rounded-2xl sm:rounded-3xl p-4 sm:p-7 max-w-2xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl relative text-left mb-14 sm:mb-0">
        {/* Encabezado del Modal */}
        <div className="flex items-center justify-between pb-4 border-b border-thea-border mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              voiceModalTab === 'new_episode'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : voiceEngine === 'edge'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-violet-600/20 border-violet-500/40 text-violet-400'
            }`}>
              {voiceModalTab === 'new_episode' ? (
                <Sparkles className="w-5 h-5" />
              ) : voiceEngine === 'edge' ? (
                <Headphones className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {voiceModalTab === 'new_episode'
                  ? 'Crear Nuevo Episodio de Podcast'
                  : 'Configuración de Voces y Locutores'}
              </h3>
              <p className="text-xs text-slate-400">
                {voiceModalTab === 'new_episode'
                  ? 'Configura un formato o duración distinta para este material'
                  : 'Personaliza el motor acústico para Sofía y Mateo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de Selección del Modal: Azure Neural | Voces Locales | Nuevo Episodio */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-thea-surfaceLight/80 border border-thea-border rounded-2xl mb-4">
          <button
            type="button"
            onClick={() => {
              onTabChange('azure');
              onSwitchEngine('edge');
            }}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              voiceModalTab === 'azure'
                ? 'bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Headphones className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-left hidden sm:block">
              <div className="font-bold">Azure Neural</div>
              <div className="text-[10px] font-normal text-emerald-400/90">Voces Oficiales</div>
            </div>
            <span className="sm:hidden text-xs font-bold">Azure</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onTabChange('browser');
              onSwitchEngine('browser');
            }}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              voiceModalTab === 'browser'
                ? 'bg-violet-600/25 border border-violet-500/50 text-violet-300 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-4 h-4 text-violet-400 shrink-0" />
            <div className="text-left hidden sm:block">
              <div className="font-bold">Voces Locales</div>
              <div className="text-[10px] font-normal text-violet-400/90">Navegador offline</div>
            </div>
            <span className="sm:hidden text-xs font-bold">Locales</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('new_episode')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              voiceModalTab === 'new_episode'
                ? 'bg-amber-500/25 border border-amber-500/50 text-amber-300 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-left hidden sm:block">
              <div className="font-bold">Nuevo Episodio</div>
              <div className="text-[10px] font-normal text-amber-400/90">Reemplazar podcast</div>
            </div>
            <span className="sm:hidden text-xs font-bold">Nuevo</span>
          </button>
        </div>

        <div className="space-y-4">
          {/* PESTAÑA 1: AZURE NEURAL */}
          {voiceModalTab === 'azure' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-emerald-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Headphones className="w-4 h-4 text-emerald-400" />
                    Microsoft Azure Neural Voices (Edge TTS)
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Voces neuronales auténticas de Microsoft Azure con entonación natural, cadencia humana y emoción conversacional. Todo el audio se precarga automáticamente en segundo plano y se almacena en IndexedDB para respuesta a 0ms sin pausas.
                </p>
              </div>

              {/* Sofía */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Voz de Sofía (Host Principal)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold lowercase">
                      femenina • azure neural
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
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
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-white">{v.name.replace(' Neural', '')}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-thea-bg border border-thea-border text-amber-300 font-medium">
                                {v.country}
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-1">{v.tone}</p>
                          {v.roleHint && <span className="text-[10px] text-amber-400/90 block mt-0.5 font-medium">{v.roleHint}</span>}
                        </div>
                        <div className="flex justify-end mt-2">
                          <button
                            type="button"
                            disabled={isTestingVoice}
                            onClick={(e) => onPreviewAzureVoice(e, v)}
                            className="px-2.5 py-1 rounded-lg bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-[10px] text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40"
                            title={`Escuchar muestra de ${v.name}`}
                          >
                            <Volume2 className="w-3 h-3 text-amber-400" />
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
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Voz de Mateo (Co-Host Analítico)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold lowercase">
                      masculina • azure neural
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
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
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm text-white">{v.name.replace(' Neural', '')}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-thea-bg border border-thea-border text-violet-300 font-medium">
                                {v.country}
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-1">{v.tone}</p>
                          {v.roleHint && <span className="text-[10px] text-violet-400/90 block mt-0.5 font-medium">{v.roleHint}</span>}
                        </div>
                        <div className="flex justify-end mt-2">
                          <button
                            type="button"
                            disabled={isTestingVoice}
                            onClick={(e) => onPreviewAzureVoice(e, v)}
                            className="px-2.5 py-1 rounded-lg bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-[10px] text-violet-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40"
                            title={`Escuchar muestra de ${v.name}`}
                          >
                            <Volume2 className="w-3 h-3 text-violet-400" />
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

          {/* PESTAÑA 2: VOCES LOCALES */}
          {voiceModalTab === 'browser' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-emerald-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Headphones className="w-4 h-4 text-emerald-400" />
                    Síntesis Vocal Local ({candidateVoices.length} voces disponibles)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    Ilimitado
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  THEA modula automáticamente los registros: Sofía en tono agudo vivaz (1.25x) y Mateo en barítono grave (0.68x). Puedes seleccionar una voz instalada específica para cada uno o usar la asignación automática recomendada.
                </p>
              </div>

              {/* Sofía Local */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Voz para Sofía (Host Principal)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold lowercase">
                      femenina • pitch 1.25
                    </span>
                  </label>
                  {localSofiaVoice && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectLocalSofiaVoice('');
                        const updated = savePodcastSettings({ localSofiaVoice: '' });
                        if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                          googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                        }
                      }}
                      className="text-[11px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                    >
                      Restablecer a automática
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  <div
                    onClick={() => {
                      onSelectLocalSofiaVoice('');
                      const updated = savePodcastSettings({ localSofiaVoice: '' });
                      if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                        googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                      }
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      !localSofiaVoice
                        ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                        : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-white">Automática Inteligente</span>
                      {!localSofiaVoice && <Check className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Asignación óptima detectada con modulación femenina 1.25x.
                    </p>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => onPreviewAutomaticLocalSample(e, 'female')}
                        className="px-2 py-1 rounded-lg bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-[10px] text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                        title="Escuchar muestra automática de Sofía"
                      >
                        <Volume2 className="w-3 h-3 text-amber-400" />
                        <span>Escuchar</span>
                      </button>
                    </div>
                  </div>

                  {candidateVoices.map((v) => {
                    const isSelected = localSofiaVoice === v.name;
                    const cleanName = v.name
                      .replace(/^(Microsoft|Google|Apple)\s*/i, '')
                      .replace(/\s*-\s*(Spanish|español|Spain|Mexico|United States).*$/i, '')
                      .trim() || v.name;
                    return (
                      <div
                        key={`sofia-${v.name}`}
                        onClick={() => {
                          onSelectLocalSofiaVoice(v.name);
                          const updated = savePodcastSettings({ localSofiaVoice: v.name });
                          if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                            googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                          }
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-white">{cleanName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-thea-bg border border-thea-border text-slate-400 font-mono">
                              {v.lang}
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mb-2 truncate" title={v.name}>
                          {v.name}
                        </p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => onPreviewLocalVoice(e, v, 'female')}
                            className="px-2 py-1 rounded-lg bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-[10px] text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                            title={`Escuchar a Sofía con la voz de ${cleanName}`}
                          >
                            <Volume2 className="w-3 h-3 text-amber-400" />
                            <span>Escuchar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mateo Local */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Voz para Mateo (Co-Host Analítico)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold lowercase">
                      masculina • pitch 0.68
                    </span>
                  </label>
                  {localMateoVoice && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectLocalMateoVoice('');
                        const updated = savePodcastSettings({ localMateoVoice: '' });
                        if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                          googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                        }
                      }}
                      className="text-[11px] text-slate-400 hover:text-violet-300 underline cursor-pointer"
                    >
                      Restablecer a automática
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  <div
                    onClick={() => {
                      onSelectLocalMateoVoice('');
                      const updated = savePodcastSettings({ localMateoVoice: '' });
                      if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                        googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                      }
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      !localMateoVoice
                        ? 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                        : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-white">Automática Inteligente</span>
                      {!localMateoVoice && <Check className="w-4 h-4 text-violet-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Asignación masculina o barítono grave modulado a 0.68x.
                    </p>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => onPreviewAutomaticLocalSample(e, 'male')}
                        className="px-2 py-1 rounded-lg bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-[10px] text-violet-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                        title="Escuchar muestra automática de Mateo"
                      >
                        <Volume2 className="w-3 h-3 text-violet-400" />
                        <span>Escuchar</span>
                      </button>
                    </div>
                  </div>

                  {candidateVoices.map((v) => {
                    const isSelected = localMateoVoice === v.name;
                    const cleanName = v.name
                      .replace(/^(Microsoft|Google|Apple)\s*/i, '')
                      .replace(/\s*-\s*(Spanish|español|Spain|Mexico|United States).*$/i, '')
                      .trim() || v.name;
                    return (
                      <div
                        key={`mateo-${v.name}`}
                        onClick={() => {
                          onSelectLocalMateoVoice(v.name);
                          const updated = savePodcastSettings({ localMateoVoice: v.name });
                          if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                            googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                          }
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-white">{cleanName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-thea-bg border border-thea-border text-slate-400 font-mono">
                              {v.lang}
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mb-2 truncate" title={v.name}>
                          {v.name}
                        </p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => onPreviewLocalVoice(e, v, 'male')}
                            className="px-2 py-1 rounded-lg bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-[10px] text-violet-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                            title={`Escuchar a Mateo con la voz de ${cleanName}`}
                          >
                            <Volume2 className="w-3 h-3 text-violet-400" />
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

          {/* PESTAÑA 3: NUEVO EPISODIO */}
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
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Elige un nuevo formato y duración para generar otra perspectiva sobre tus fuentes de estudio. El episodio actual y los audios en caché se borrarán para dar paso al nuevo guión.
                </p>
              </div>

              {/* Formato */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Formato del Podcast
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium">Estilo NotebookLM</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PODCAST_FORMAT_OPTIONS.map((f) => {
                    const isSelected = selectedFormat === f.id;
                    const IconComp = f.icon;
                    return (
                      <div
                        key={`modal-fmt-${f.id}`}
                        onClick={() => onSelectFormat(f.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                                isSelected ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-thea-bg text-slate-400 border border-thea-border'
                              }`}>
                                <IconComp className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-bold text-sm text-white">{f.title}</span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
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
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                  Duración del Podcast
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PODCAST_DURATION_OPTIONS.map((d) => {
                    const isSelected = selectedDuration === d.id;
                    return (
                      <div
                        key={`modal-dur-${d.id}`}
                        onClick={() => onSelectDuration(d.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                            : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-white">{d.title}</span>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-violet-500/30 text-violet-200' : 'bg-thea-bg text-slate-400'
                          }`}>
                            {d.subtitle}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug">
                          {d.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Orientación */}
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                  Orientación Personalizada (Opcional)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => onOrientationChange('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
                    className="px-2 py-0.5 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[10px] text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    Examen riguroso
                  </button>
                  <button
                    type="button"
                    onClick={() => onOrientationChange('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
                    className="px-2 py-0.5 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[10px] text-slate-300 hover:text-violet-300 transition-colors cursor-pointer"
                  >
                    Debate ameno
                  </button>
                  <button
                    type="button"
                    onClick={() => onOrientationChange('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
                    className="px-2 py-0.5 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[10px] text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    Explicación pedagógica
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={orientationInput}
                  onChange={(e) => onOrientationChange(e.target.value)}
                  placeholder="Instrucciones adicionales para la IA en este nuevo episodio..."
                  className="w-full bg-thea-bg border border-thea-border rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed font-sans"
                />
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 border-t border-thea-border flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={onRequestConfirmReplace}
                  disabled={isGenerating}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs transition-all shadow-lg shadow-amber-900/30 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Crear y reemplazar episodio actual</span>
                </button>
              </div>
            </div>
          )}

          {/* SECCIÓN INFERIOR PARA PESTAÑAS AZURE Y BROWSER (BOTONES DE PRUEBA) */}
          {voiceModalTab !== 'new_episode' && (
            <div className="pt-3 border-t border-thea-border">
              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    disabled={isTestingVoice}
                    onClick={() => onTestVoiceSample('sofia')}
                    className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-amber-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                    <span>Probar Sofía</span>
                  </button>

                  <button
                    type="button"
                    disabled={isTestingVoice}
                    onClick={() => onTestVoiceSample('mateo')}
                    className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-violet-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-violet-400" />}
                    <span>Probar Mateo</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
