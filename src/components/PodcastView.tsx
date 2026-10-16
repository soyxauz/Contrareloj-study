import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { StudyKit } from '../types';
import {
  Play,
  Pause,
  RotateCcw,
  Headphones,
  Sparkles,
  Loader2,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { generateAIPodcast } from '../services/aiService';

interface PodcastViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const PodcastView: React.FC<PodcastViewProps> = ({ kit, onUpdateKit }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'player' | 'transcript'>('player');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const isPlayingRef = useRef(isPlaying);
  const currentLineIndexRef = useRef(currentLineIndex);
  const playbackSpeedRef = useRef(playbackSpeed);
  const isMutedRef = useRef(isMuted);
  const isManualInterruptionRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentLineIndexRef.current = currentLineIndex;
  }, [currentLineIndex]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const podcast = kit.podcast;

  // Cargar catálogo de voces del sintetizador del navegador
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const populateVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available && available.length > 0) {
        setVoices(available);
      }
    };

    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Timbre armónico de introducción al estilo radio/podcast con Web Audio API
  const playIntroChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Nota 1 (C5 - 523.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Nota 2 (G5 - 783.99Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.15);
      gain2.gain.setValueAtTime(0.1, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);
    } catch {
      // AudioContext opcional y no bloqueante
    }
  }, []);

  // Seleccionar la voz y modulación acústica adecuada con emotividad y máxima naturalidad
  const getSpeakerAcoustics = useCallback((speakerName: string, text: string = '') => {
    const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(speakerName);
    const esVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
    const candidateVoices = esVoices.length > 0 ? esVoices : voices;

    // Priorizar voces neuronales/naturales de alta definición (Microsoft Natural, Google, Apple)
    const naturalVoices = candidateVoices.filter(v =>
      /natural|online|google|neural|multilingual|premium/i.test(v.name)
    );

    let selectedVoice: SpeechSynthesisVoice | undefined;

    // Detección de expresividad y emociones a partir del texto
    const isQuestion = text.includes('?');
    const isExclamatory = text.includes('!');

    if (isFemale) {
      const femaleKeywords = [
        'elena', 'elvira', 'dalia', 'paulina', 'sabina', 'monica', 'helena',
        'lucia', 'laura', 'marta', 'victoria', 'female', 'mujer', 'zira',
        'maria', 'conchita', 'penelope'
      ];
      // Intentar primero con voz natural
      selectedVoice = naturalVoices.find(v => femaleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
      if (!selectedVoice) {
        selectedVoice = candidateVoices.find(v => femaleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
      }
      if (!selectedVoice && naturalVoices.length > 0) {
        selectedVoice = naturalVoices[0];
      }
      if (!selectedVoice && candidateVoices.length > 0) {
        selectedVoice = candidateVoices[0];
      }

      // Tono ligeramente más cálido y dinámico para Sofía con inflexión emocional
      const basePitch = 1.08;
      const pitchMod = isQuestion ? 0.05 : isExclamatory ? 0.04 : 0;
      const rateMod = isExclamatory ? 1.04 : 1.01;

      return {
        voice: selectedVoice,
        pitch: Math.min(1.4, basePitch + pitchMod),
        rateFactor: rateMod,
        voiceName: selectedVoice?.name || 'Voz Femenina Estándar',
      };
    } else {
      const maleKeywords = [
        'jorge', 'alvaro', 'pablo', 'carlos', 'diego', 'enrique', 'raul',
        'david', 'male', 'hombre', 'miguel', 'manuel', 'antonio'
      ];
      // Intentar primero con voz natural masculina
      selectedVoice = naturalVoices.find(v => maleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
      if (!selectedVoice) {
        selectedVoice = candidateVoices.find(v => maleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
      }
      if (!selectedVoice && naturalVoices.length > 1) {
        selectedVoice = naturalVoices[naturalVoices.length - 1];
      }
      if (!selectedVoice && candidateVoices.length > 1) {
        selectedVoice = candidateVoices[candidateVoices.length - 1];
      }

      // Tono más resonante y explicativo para Alejandro
      const basePitch = 0.93;
      const pitchMod = isQuestion ? 0.05 : isExclamatory ? 0.03 : 0;
      const rateMod = isExclamatory ? 1.03 : 0.98;

      return {
        voice: selectedVoice,
        pitch: Math.max(0.7, basePitch + pitchMod),
        rateFactor: rateMod,
        voiceName: selectedVoice?.name || 'Voz Masculina Estándar',
      };
    }
  }, [voices]);

  // Avanzar a la siguiente intervención de diálogo
  const advanceToNextLine = useCallback((fromIndex: number) => {
    if (isManualInterruptionRef.current) return;
    if (!podcast?.dialogue) return;

    if (fromIndex < podcast.dialogue.length - 1) {
      setCurrentLineIndex(fromIndex + 1);
    } else {
      setIsPlaying(false);
      setIsAudioActive(false);
      setCurrentLineIndex(0);
    }
  }, [podcast?.dialogue]);

  // Reproducir vocalmente una línea del diálogo
  const speakDialogueLine = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) return;
    if (!podcast || !podcast.dialogue || !podcast.dialogue[index]) return;

    // Desactivar callbacks previos para evitar disparos accidentales
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
    }
    window.speechSynthesis.cancel();

    if (isMutedRef.current) {
      // Modo silencioso: avance temporal calculado según la extensión del texto
      const textLength = podcast.dialogue[index].text.length;
      const durationMs = Math.max(2500, Math.min(8000, (textLength / 18) * 1000 / playbackSpeedRef.current));
      setIsAudioActive(true);
      const timer = setTimeout(() => {
        setIsAudioActive(false);
        if (isPlayingRef.current && !isManualInterruptionRef.current) {
          advanceToNextLine(index);
        }
      }, durationMs);
      return () => clearTimeout(timer);
    }

    const item = podcast.dialogue[index];
    const cleanText = item.text
      .replace(/[*_#`~[\]]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[$]/g, '')
      .trim();

    if (!cleanText) {
      advanceToNextLine(index);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    currentUtteranceRef.current = utterance;

    const { voice, pitch, rateFactor } = getSpeakerAcoustics(item.speaker, cleanText);

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'es-ES';
    }

    utterance.pitch = pitch;
    utterance.rate = Math.max(0.6, Math.min(2.5, playbackSpeedRef.current * rateFactor));

    utterance.onstart = () => {
      setIsAudioActive(true);
    };

    utterance.onend = () => {
      setIsAudioActive(false);
      if (isPlayingRef.current && !isManualInterruptionRef.current) {
        // Pausa conversacional natural de 250ms entre locutores
        setTimeout(() => {
          if (isPlayingRef.current && !isManualInterruptionRef.current) {
            advanceToNextLine(index);
          }
        }, 250);
      }
    };

    utterance.onerror = (e) => {
      setIsAudioActive(false);
      if (e.error === 'interrupted' || e.error === 'canceled' || isManualInterruptionRef.current) return;
      console.warn('[Podcast TTS] Error en síntesis de voz:', e);
      if (isPlayingRef.current && !isManualInterruptionRef.current) {
        setTimeout(() => {
          if (isPlayingRef.current && !isManualInterruptionRef.current) {
            advanceToNextLine(index);
          }
        }, 600);
      }
    };

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    window.speechSynthesis.speak(utterance);
  }, [podcast, getSpeakerAcoustics, advanceToNextLine]);

  // Sincronización del ciclo de vida de reproducción
  useEffect(() => {
    if (isPlaying) {
      speakDialogueLine(currentLineIndex);
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsAudioActive(false);
    }
  }, [isPlaying, currentLineIndex, speakDialogueLine]);

  // Cambio de velocidad sin reiniciar el guion
  const handleSpeedChange = (newSpeed: number) => {
    isManualInterruptionRef.current = true;
    setPlaybackSpeed(newSpeed);
    playbackSpeedRef.current = newSpeed;

    if (isPlaying) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setTimeout(() => {
        isManualInterruptionRef.current = false;
        speakDialogueLine(currentLineIndexRef.current);
      }, 50);
    } else {
      setTimeout(() => {
        isManualInterruptionRef.current = false;
      }, 50);
    }
  };

  // Adelantar o atrasar en la línea de tiempo a un segmento específico
  const handleSeek = (targetIndex: number) => {
    if (!podcast?.dialogue) return;
    const safeIdx = Math.max(0, Math.min(podcast.dialogue.length - 1, targetIndex));
    isManualInterruptionRef.current = true;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setCurrentLineIndex(safeIdx);
    currentLineIndexRef.current = safeIdx;

    setTimeout(() => {
      isManualInterruptionRef.current = false;
      if (isPlayingRef.current) {
        speakDialogueLine(safeIdx);
      }
    }, 60);
  };

  const handleSkipBackward = () => {
    handleSeek(currentLineIndex - 1);
  };

  const handleSkipForward = () => {
    handleSeek(currentLineIndex + 1);
  };

  // Temporizador anti-congelamiento de SpeechSynthesis en Chromium
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Alternar reproducción
  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      isManualInterruptionRef.current = true;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsAudioActive(false);
      setTimeout(() => {
        isManualInterruptionRef.current = false;
      }, 50);
    } else {
      if (currentLineIndex === 0 && !isMuted) {
        playIntroChime();
      }
      setIsPlaying(true);
    }
  };

  // Reiniciar episodio desde el principio
  const handleRestart = () => {
    isManualInterruptionRef.current = true;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCurrentLineIndex(0);
    currentLineIndexRef.current = 0;

    setTimeout(() => {
      isManualInterruptionRef.current = false;
      if (isPlayingRef.current && !isMuted) {
        playIntroChime();
        speakDialogueLine(0);
      }
    }, 60);
  };

  // Alternar silencio
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (isPlaying) {
      if (nextMuted) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      } else {
        speakDialogueLine(currentLineIndex);
      }
    }
  };

  const handleGeneratePodcast = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateAIPodcast(
        kit.sourceText || kit.description,
        kit.title,
        kit.category
      );
      if (generated && onUpdateKit) {
        onUpdateKit({ ...kit, podcast: generated });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const speeds = [0.75, 1, 1.25, 1.5];

  if (!podcast || !podcast.dialogue || podcast.dialogue.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center py-16 px-6 rounded-3xl bg-thea-surface border border-thea-border max-w-xl mx-auto shadow-xl animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-5 text-amber-400">
            <Headphones className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Episodio de Podcast Pendiente</h2>
          <p className="text-sm text-slate-300 mb-8 leading-relaxed">
            Este Study Kit se generó rápidamente centrándose primero en sus preguntas. Puedes generar ahora su episodio de audio-repaso estilo podcast entre Sofia y el Tutor IA Alejandro.
          </p>
          <button
            onClick={handleGeneratePodcast}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-900/30 transition-all transform hover:-translate-y-0.5 cursor-pointer"
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
    );
  }

  const currentItem = podcast.dialogue[currentLineIndex] || podcast.dialogue[0];
  const speakerAcoustics = getSpeakerAcoustics(currentItem.speaker, currentItem.text);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Badge Header */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white">
              PODCAST EDUCATIVO
            </span>
            <span className="text-xs text-slate-400 font-medium">Recap de audio con síntesis vocal emotiva</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Headphones className="w-6 h-6 text-amber-400" />
            <span>Contrareloj Review Podcast</span>
          </h1>
        </div>

        <div className="flex items-center gap-1 bg-thea-surface border border-thea-border rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveTab('player')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'player' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Reproductor
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'transcript' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Transcripción
          </button>
        </div>
      </div>

      {activeTab === 'player' ? (
        <div className="space-y-6">
          {/* Main Visual Player Card */}
          <div className="bg-gradient-to-b from-thea-surface to-thea-bg border border-thea-border rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-center">
            {/* Background Glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

            {/* Episode Title */}
            <div className="relative z-10 mb-6">
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest block mb-2">
                REPASO DE AUDIO DINÁMICO
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                {podcast.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Duración: {podcast.duration} • Generado a partir de tus materiales
              </p>
            </div>

            {/* Host Cards */}
            <div className="flex justify-center items-center gap-6 mb-8 relative z-10">
              {podcast.hosts.map((host, idx) => {
                const isCurrentHostSpeaking =
                  isPlaying &&
                  isAudioActive &&
                  currentItem.speaker.toLowerCase().includes(host.name.split(' ')[0].toLowerCase());

                return (
                  <div key={idx} className="flex flex-col items-center">
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-thea-surfaceLight border-2 flex items-center justify-center font-bold text-xl text-violet-300 shadow-xl transition-all duration-300 relative ${
                      isCurrentHostSpeaking
                        ? 'border-amber-400 ring-4 ring-amber-400/20 scale-105 shadow-amber-500/20'
                        : 'border-thea-border opacity-70'
                    }`}>
                      {host.name.charAt(0)}
                      {isCurrentHostSpeaking && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-white mt-2">{host.name}</span>
                    <span className="text-[10px] text-slate-400">{host.role}</span>
                  </div>
                );
              })}
            </div>

            {/* Animated Audio Equalizer Waveform */}
            <div className="flex items-center justify-center gap-1.5 h-14 mb-6 relative z-10">
              {[12, 28, 45, 60, 32, 50, 75, 90, 65, 40, 20, 55, 80, 45, 30, 65, 85, 50, 35, 70, 40, 25].map((height, i) => (
                <div
                  key={i}
                  style={{
                    height: isPlaying && isAudioActive
                      ? `${Math.max(20, Math.min(100, height * (Math.sin(i * 0.8 + currentLineIndex * 2) + 1.2) * 0.6))}%`
                      : '15%',
                  }}
                  className={`w-1.5 rounded-full transition-all duration-300 ${
                    isPlaying && isAudioActive ? 'bg-gradient-to-t from-violet-500 to-amber-400' : 'bg-thea-border'
                  }`}
                />
              ))}
            </div>

            {/* Current Active Dialogue Bubble */}
            <div className="bg-thea-surfaceLight/80 backdrop-blur border border-thea-border rounded-2xl p-5 mb-6 max-w-2xl mx-auto shadow-inner text-left relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                  <Volume2 className={`w-3.5 h-3.5 ${isAudioActive ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
                  {currentItem.speaker}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-950/70 border border-violet-500/30 text-violet-300">
                    {speakerAcoustics.voiceName.split('-')[0].trim()}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {currentItem.time}
                  </span>
                </div>
              </div>
              <p className="text-sm sm:text-base text-slate-100 font-medium leading-relaxed">
                "{currentItem.text}"
              </p>
            </div>

            {/* ── LÍNEA DE TIEMPO INTERACTIVA (SCRUBBER) ── */}
            <div className="max-w-2xl mx-auto mb-6 px-2 relative z-10">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span className="font-semibold text-amber-400">{currentItem.time}</span>
                <span className="text-[11px] text-slate-500 font-sans">
                  Segmento {currentLineIndex + 1} de {podcast.dialogue.length}
                </span>
                <span>{podcast.duration}</span>
              </div>

              {/* Slider de tiempo interactivo */}
              <div className="relative flex items-center group">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, podcast.dialogue.length - 1)}
                  value={currentLineIndex}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none transition-all group-hover:h-2.5"
                  title="Arrastra para adelantar o atrasar el podcast"
                />
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 relative z-10 flex-wrap">
              <button
                type="button"
                onClick={handleRestart}
                className="p-3 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Reiniciar podcast desde el principio"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleSkipBackward}
                disabled={currentLineIndex === 0}
                className="p-3 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                title="Atrasar al segmento anterior"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-16 h-16 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-amber-500 hover:scale-105 transition-all shadow-xl shadow-violet-900/40 flex items-center justify-center text-white font-bold cursor-pointer"
                title={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-white" /> : <Play className="w-7 h-7 fill-white ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={handleSkipForward}
                disabled={currentLineIndex >= podcast.dialogue.length - 1}
                className="p-3 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                title="Adelantar al siguiente segmento"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className={`p-3 rounded-2xl border transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    : 'bg-thea-surface hover:bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-white'
                }`}
                title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* Speed Controller */}
              <div className="flex items-center gap-1 bg-thea-surface border border-thea-border rounded-2xl p-1 text-xs">
                {speeds.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSpeedChange(s)}
                    className={`px-2.5 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                      playbackSpeed === s ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Full Transcript View */
        <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-thea-border">
            <h3 className="font-bold text-white text-base">Transcripción Completa del Episodio</h3>
            <span className="text-xs text-amber-400 font-semibold">{podcast.dialogue.length} intervenciones</span>
          </div>

          <div className="space-y-4">
            {podcast.dialogue.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  handleSeek(idx);
                  setIsPlaying(true);
                  setActiveTab('player');
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  currentLineIndex === idx
                    ? 'border-amber-500/50 bg-amber-500/10 shadow-md ring-1 ring-amber-500/30'
                    : 'border-thea-border/60 bg-thea-surfaceLight/40 hover:bg-thea-surfaceLight'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-violet-300">{item.speaker}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{item.time}</span>
                </div>
                <p className="text-sm text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
