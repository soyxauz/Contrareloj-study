import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '../services/themeService';
import type { StudyKit, PodcastFormat, PodcastDuration } from '../types';
import {
  Plus,
  Play,
  Pause,
  RotateCcw,
  Headphones,
    Loader2,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import { generateAIPodcast } from '../services/aiService';

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function formatSeconds(totalSecs: number): string {
  const mins = Math.floor(totalSecs / 60);
  const secs = Math.floor(totalSecs % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
import {
  getPodcastSettings,
  savePodcastSettings,
} from '../services/geminiAudioService';
import {
  AZURE_EDGE_VOICES,
  type AzureEdgeVoiceOption,
  synthesizeAzureEdgeSpeech,
  prefetchAzureEdgeSpeech,
  preloadEntireAzurePodcast,
  clearAzureAudioCache,
} from '../services/azureEdgeTtsService';
import { googleDriveService } from '../services/googleDriveService';
import {
  ConfirmReplacePodcastModal,
  PodcastVoiceModal,
  PodcastSetupView,
  PodcastTranscriptView,
  PODCAST_FORMAT_OPTIONS,
  PODCAST_DURATION_OPTIONS,
} from './podcast';

export { PODCAST_FORMAT_OPTIONS, PODCAST_DURATION_OPTIONS };

interface PodcastViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const PodcastView: React.FC<PodcastViewProps> = ({ kit, onUpdateKit }) => {
  const initialPosition = useMemo(() => {
    try {
      const raw = localStorage.getItem(`thea_podcast_pos_${kit.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          typeof parsed.lineIndex === 'number' &&
          typeof parsed.wordIndexInSegment === 'number' &&
          typeof parsed.globalIndex === 'number'
        ) {
          const maxLine = (kit.podcast?.dialogue?.length || 1) - 1;
          const safeLine = Math.max(0, Math.min(maxLine, parsed.lineIndex));
          return {
            lineIndex: safeLine,
            wordIndexInSegment: Math.max(0, parsed.wordIndexInSegment),
            globalIndex: Math.max(0, parsed.globalIndex),
          };
        }
      }
    } catch (_) {}
    return { lineIndex: 0, wordIndexInSegment: 0, globalIndex: 0 };
  }, [kit.id, kit.podcast?.dialogue?.length]);

  const [isPlaying, setIsPlaying] = useState(false);
  const { theme } = useTheme();
  const [currentLineIndex, setCurrentLineIndex] = useState(initialPosition.lineIndex);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => getPodcastSettings().playbackSpeed || 1);
  const [activeTab, setActiveTab] = useState<'player' | 'transcript'>('player');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Motor de voz: 'edge' (Azure Neural Oficial) | 'browser' (Voz Local)
  const [voiceEngine, setVoiceEngine] = useState<'edge' | 'browser'>(() => {
    const ps = getPodcastSettings();
    return ps.voiceEngine === 'browser' ? 'browser' : 'edge';
  });
  const [edgeSofiaVoice, setEdgeSofiaVoice] = useState<string>(() => getPodcastSettings().edgeSofiaVoice || 'es-ES-ElviraNeural');
  const [edgeMateoVoice, setEdgeMateoVoice] = useState<string>(() => getPodcastSettings().edgeMateoVoice || 'es-ES-AlvaroNeural');
  const [localSofiaVoice, setLocalSofiaVoice] = useState<string>(() => getPodcastSettings().localSofiaVoice || '');
  const [localMateoVoice, setLocalMateoVoice] = useState<string>(() => getPodcastSettings().localMateoVoice || '');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceModalTab, setVoiceModalTab] = useState<'azure' | 'browser' | 'new_episode'>('azure');
  const [showConfirmReplaceModal, setShowConfirmReplaceModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<PodcastFormat>('detailed');
  const [selectedDuration, setSelectedDuration] = useState<PodcastDuration>('normal');
  const [orientationInput, setOrientationInput] = useState<string>(() => getPodcastSettings().orientation || '');
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  const isPlayingRef = useRef(isPlaying);
  const currentLineIndexRef = useRef(currentLineIndex);
  const playbackSpeedRef = useRef(playbackSpeed);
  const isMutedRef = useRef(isMuted);
  const isManualInterruptionRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voiceEngineRef = useRef(voiceEngine);
  const synthesisRetryCountRef = useRef(0);

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

  useEffect(() => {
    voiceEngineRef.current = voiceEngine;
  }, [voiceEngine]);

  // Duración total calculada en segundos del podcast
  const totalDurationSecs = useMemo(() => {
    if (!kit.podcast?.dialogue || kit.podcast.dialogue.length === 0) return 60;
    const parsedDuration = parseTimeToSeconds(kit.podcast.duration || '');
    if (parsedDuration > 0) return parsedDuration;
    const lastItem = kit.podcast.dialogue[kit.podcast.dialogue.length - 1];
    const lastStartSec = parseTimeToSeconds(lastItem.time || '');
    const estimatedLastSegSec = Math.max(15, lastItem.text.split(/\s+/).length * 0.4);
    return Math.max(60, Math.round(lastStartSec + estimatedLastSegSec));
  }, [kit.podcast?.dialogue, kit.podcast?.duration]);

  // Tiempo continuo actual en segundos (resolución continua para animación ultra-suave a 60fps)
  const [currentPlaybackSecs, setCurrentPlaybackSecs] = useState<number>(() => {
    if (initialPosition.lineIndex && kit.podcast?.dialogue?.[initialPosition.lineIndex]) {
      return parseTimeToSeconds(kit.podcast.dialogue[initialPosition.lineIndex].time || '0:00');
    }
    return 0;
  });
  const currentPlaybackSecsRef = useRef<number>(currentPlaybackSecs);

  // Estados y referencias para navegación y resaltado sincronizado
  const [currentWordIndexInSegment, setCurrentWordIndexInSegment] = useState(initialPosition.wordIndexInSegment);
  const [currentGlobalWordIndex, setCurrentGlobalWordIndex] = useState(initialPosition.globalIndex);
  const currentWordIndexRef = useRef(initialPosition.wordIndexInSegment);
  const currentGlobalWordIndexRef = useRef(initialPosition.globalIndex);
  const speakDialogueLineRef = useRef<((index: number, startWordIdx?: number) => void) | null>(null);

  // Control de arrastre y desplazamiento del scrubber suave
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const isAudioSeekingRef = useRef(false);
  const loadedAudioSegmentRef = useRef<number>(-1);
  const preloadedNextAudioRef = useRef<{ index: number; audio: HTMLAudioElement } | null>(null);

  // Helper síncrono para mantener estado y referencias siempre alineados en el mismo tick
  const setWordPosition = useCallback((globalIdx: number, segIdx: number, wordInSegIdx: number, secs?: number) => {
    currentGlobalWordIndexRef.current = globalIdx;
    currentWordIndexRef.current = wordInSegIdx;
    currentLineIndexRef.current = segIdx;

    setCurrentGlobalWordIndex(globalIdx);
    setCurrentWordIndexInSegment(wordInSegIdx);
    setCurrentLineIndex(segIdx);

    const safeSecs = secs !== undefined ? secs : currentPlaybackSecsRef.current;

    try {
      localStorage.setItem(`thea_podcast_pos_${kit.id}`, JSON.stringify({
        lineIndex: segIdx,
        wordIndexInSegment: wordInSegIdx,
        globalIndex: globalIdx,
        playbackSecs: safeSecs,
      }));
    } catch (_) {}
  }, [kit.id]);

  useEffect(() => {
    currentWordIndexRef.current = currentWordIndexInSegment;
  }, [currentWordIndexInSegment]);

  useEffect(() => {
    currentGlobalWordIndexRef.current = currentGlobalWordIndex;
  }, [currentGlobalWordIndex]);

  // Escuchar sincronización reactiva en tiempo real (desde la nube o ajustes)
  useEffect(() => {
    const handleSettingsChanged = () => {
      const fresh = getPodcastSettings();
      if (fresh.playbackSpeed && fresh.playbackSpeed !== playbackSpeedRef.current) {
        setPlaybackSpeed(fresh.playbackSpeed);
        playbackSpeedRef.current = fresh.playbackSpeed;
      }
      if (fresh.voiceEngine) {
        setVoiceEngine(fresh.voiceEngine === 'browser' ? 'browser' : 'edge');
      }
      if (fresh.edgeSofiaVoice) setEdgeSofiaVoice(fresh.edgeSofiaVoice);
      if (fresh.edgeMateoVoice) setEdgeMateoVoice(fresh.edgeMateoVoice);
      if (fresh.localSofiaVoice !== undefined) setLocalSofiaVoice(fresh.localSofiaVoice);
      if (fresh.localMateoVoice !== undefined) setLocalMateoVoice(fresh.localMateoVoice);
      if (fresh.orientation !== undefined) setOrientationInput(fresh.orientation);
    };

    window.addEventListener('contrareloj_podcast_settings_changed', handleSettingsChanged);
    window.addEventListener('thea_ai_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('contrareloj_podcast_settings_changed', handleSettingsChanged);
      window.removeEventListener('thea_ai_settings_changed', handleSettingsChanged);
    };
  }, []);

  // Detener de forma limpia y unificada cualquier reproducción (HTML5 Audio o SpeechSynthesis)
  const stopCurrentAudio = useCallback((dismantle: boolean = false) => {
    if (audioPlayerRef.current) {
      const audio = audioPlayerRef.current;
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onerror = null;
      audio.onplay = null;
      audio.onloadedmetadata = null;
      audio.pause();
      if (dismantle) {
        audio.src = '';
        audio.load();
        audioPlayerRef.current = null;
      }
    }
    if (preloadedNextAudioRef.current?.audio) {
      const nextAudio = preloadedNextAudioRef.current.audio;
      nextAudio.ontimeupdate = null;
      nextAudio.onended = null;
      nextAudio.onerror = null;
      nextAudio.onplay = null;
      nextAudio.onloadedmetadata = null;
      nextAudio.pause();
      if (dismantle) {
        nextAudio.src = '';
        nextAudio.load();
        preloadedNextAudioRef.current = null;
      }
    }
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current.onboundary = null;
      if (dismantle) {
        currentUtteranceRef.current = null;
      }
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    setIsAudioActive(false);
    setIsSynthesizing(false);
  }, []);

  // Al desmontar la vista de podcast (cambio de sección en la app)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isManualInterruptionRef.current = true;
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopCurrentAudio(true);
    };
  }, [stopCurrentAudio]);



  // Escuchar evento explícito de detención global desde el enrutador de la aplicación
  useEffect(() => {
    const handleStopRequest = () => {
      isManualInterruptionRef.current = true;
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopCurrentAudio(true);
    };

    window.addEventListener('thea_podcast_stop_request', handleStopRequest);
    return () => {
      window.removeEventListener('thea_podcast_stop_request', handleStopRequest);
    };
  }, [stopCurrentAudio]);

  const podcast = kit.podcast;

  // Pre-sintetizar proactivamente los primeros turnos al cargar para arranque instantáneo (0ms)
  useEffect(() => {
    if (!podcast?.dialogue || podcast.dialogue.length === 0) return;
    const firstItem = podcast.dialogue[0];
    const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(firstItem.speaker);

    if (voiceEngine === 'edge') {
      const voice = isFemale ? (edgeSofiaVoice || 'es-ES-ElviraNeural') : (edgeMateoVoice || 'es-ES-AlvaroNeural');
      synthesizeAzureEdgeSpeech(firstItem.text, voice)
        .then((url) => {
          if (isMountedRef.current) {
            const firstAudio = new Audio();
            firstAudio.preload = 'auto';
            firstAudio.src = url;
            firstAudio.load();
            preloadedNextAudioRef.current = { index: 0, audio: firstAudio };

            // Pre-cargar en paralelo los siguientes 3 turnos para reproducción continua y sin pausas
            preloadEntireAzurePodcast(podcast.dialogue, edgeSofiaVoice, edgeMateoVoice, 1, 4);
          }
        })
        .catch((err) => {
          console.warn('[PodcastView] Error en precarga inicial Azure Neural Turno 0:', err);
        });
    }
  }, [podcast?.dialogue, voiceEngine, edgeSofiaVoice, edgeMateoVoice]);

  // Mapeo exhaustivo de todas las palabras del podcast para scrubber palabra por palabra
  const allWords = useMemo(() => {
    if (!podcast?.dialogue) return [];
    const list: { segmentIndex: number; wordIndexInSegment: number; globalIndex: number; word: string }[] = [];
    podcast.dialogue.forEach((item, sIdx) => {
      const clean = item.text
        .replace(/[*_#`~[\]]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[$]/g, '')
        .trim();
      const words = clean ? clean.split(/\s+/).filter(Boolean) : ['...'];
      words.forEach((w, wIdx) => {
        list.push({
          segmentIndex: sIdx,
          wordIndexInSegment: wIdx,
          globalIndex: list.length,
          word: w,
        });
      });
    });
    return list;
  }, [podcast?.dialogue]);

  const segmentStartGlobalIndices = useMemo(() => {
    if (!podcast?.dialogue) return [];
    const offsets: number[] = [];
    let count = 0;
    podcast.dialogue.forEach((item) => {
      offsets.push(count);
      const clean = item.text
        .replace(/[*_#`~[\]]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[$]/g, '')
        .trim();
      const words = clean ? clean.split(/\s+/).filter(Boolean) : ['...'];
      count += words.length;
    });
    return offsets;
  }, [podcast?.dialogue]);

  const currentItem = podcast?.dialogue ? (podcast.dialogue[currentLineIndex] || podcast.dialogue[0]) : null;

  const currentSegmentWords = useMemo(() => {
    if (!currentItem?.text) return [];
    const clean = currentItem.text
      .replace(/[*_#`~[\]]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[$]/g, '')
      .trim();
    return clean ? clean.split(/\s+/).filter(Boolean) : [];
  }, [currentItem?.text]);

  // Tiempo formateado actual (ej. "3:13")
  const currentTimeDisplay = useMemo(() => {
    return formatSeconds(Math.floor(currentPlaybackSecs));
  }, [currentPlaybackSecs]);

  // Porcentaje fluido de 0% a 100% para la barra interactiva
  const progressPercent = useMemo(() => {
    if (totalDurationSecs <= 0) return 0;
    const pct = (currentPlaybackSecs / totalDurationSecs) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [currentPlaybackSecs, totalDurationSecs]);

  // Bucle de sincronización continua a 60 FPS durante la reproducción
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    const updateSmoothTick = () => {
      if (
        isMountedRef.current &&
        !isScrubbingRef.current &&
        !isAudioSeekingRef.current &&
        audioPlayerRef.current
      ) {
        const audio = audioPlayerRef.current;
        if (!audio.paused && audio.duration && Number.isFinite(audio.duration)) {
          const segStart = parseTimeToSeconds(podcast?.dialogue?.[currentLineIndexRef.current]?.time || '0:00');
          const exact = segStart + audio.currentTime;
          currentPlaybackSecsRef.current = exact;
          setCurrentPlaybackSecs(exact);
        }
      }
      animId = requestAnimationFrame(updateSmoothTick);
    };
    animId = requestAnimationFrame(updateSmoothTick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, podcast?.dialogue]);

  // Sincronizar tiempo base cuando cambia el segmento si no se está arrastrando
  useEffect(() => {
    if (isScrubbingRef.current) return;
    if (!podcast?.dialogue) return;
    const segStart = parseTimeToSeconds(podcast.dialogue[currentLineIndex]?.time || '0:00');
    currentPlaybackSecsRef.current = segStart;
    setCurrentPlaybackSecs(segStart);
  }, [currentLineIndex, podcast?.dialogue]);

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
    const timer1 = setTimeout(populateVoices, 200);
    const timer2 = setTimeout(populateVoices, 800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
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
      setTimeout(() => {
        try {
          if (ctx.state !== 'closed') {
            ctx.close().catch(() => {});
          }
        } catch {}
      }, 650);
    } catch {
      // AudioContext opcional y no bloqueante
    }
  }, []);

  // Seleccionar la voz y modulación acústica adecuada con emotividad y máxima diferenciación
  const getSpeakerAcoustics = useCallback((speakerName: string, text: string = '') => {
    const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(speakerName);
    const esVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
    const candidateVoices = esVoices.length > 0 ? esVoices : voices;

    const isQuestion = text.includes('?');
    const isExclamatory = text.includes('!');

    const normalizeStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const femaleKeywords = [
      'helena', 'elena', 'laura', 'elvira', 'dalia', 'salome', 'paloma',
      'sabina', 'monica', 'lucia', 'marta', 'victoria', 'female', 'mujer',
      'zira', 'maria', 'conchita', 'penelope', 'sofia', 'carmen'
    ];
    const maleKeywords = [
      'pablo', 'alvaro', 'jorge', 'gonzalo', 'alonso', 'carlos', 'diego',
      'david', 'raul', 'enrique', 'miguel', 'manuel', 'antonio', 'male', 'hombre'
    ];

    if (isFemale) {
      let selectedVoice: SpeechSynthesisVoice | undefined;

      // 1. Si el usuario seleccionó una voz local específica para Sofía
      if (localSofiaVoice) {
        selectedVoice = candidateVoices.find(v => v.name === localSofiaVoice);
      }

      // 2. Si se había seleccionado una voz de Edge que esté presente en el navegador
      if (!selectedVoice && edgeSofiaVoice) {
        const edgeBase = normalizeStr(edgeSofiaVoice.replace(/^es-[A-Z]{2}-/, '').replace('Neural', ''));
        selectedVoice = candidateVoices.find(v => normalizeStr(v.name).includes(edgeBase));
      }

      // 3. Buscar cualquier voz femenina identificada por palabras clave
      if (!selectedVoice) {
        selectedVoice = candidateVoices.find(v => femaleKeywords.some(kw => normalizeStr(v.name).includes(kw)));
      }

      // 4. Si aún no hay match, tomar la primera voz disponible
      if (!selectedVoice && candidateVoices.length > 0) {
        selectedVoice = candidateVoices[0];
      }

      // Modulación acústica femenina: tono alto, brillante y vivaz (pitch 1.25)
      const basePitch = 1.25;
      const pitchMod = isQuestion ? 0.05 : isExclamatory ? 0.04 : 0;
      const rateMod = isExclamatory ? 1.05 : 1.02;

      return {
        voice: selectedVoice,
        pitch: Math.min(1.6, basePitch + pitchMod),
        rateFactor: rateMod,
        voiceName: selectedVoice?.name ? `${selectedVoice.name.replace(/^(Microsoft|Google)\s*/i, '').split('-')[0].trim()} (Sofía)` : 'Voz Femenina (Sofía)',
      };
    } else {
      let selectedVoice: SpeechSynthesisVoice | undefined;

      // 1. Si el usuario seleccionó una voz local específica para Mateo
      if (localMateoVoice) {
        selectedVoice = candidateVoices.find(v => v.name === localMateoVoice);
      }

      // 2. Si se había seleccionado una voz de Edge que esté presente en el navegador
      if (!selectedVoice && edgeMateoVoice) {
        const edgeBase = normalizeStr(edgeMateoVoice.replace(/^es-[A-Z]{2}-/, '').replace('Neural', ''));
        selectedVoice = candidateVoices.find(v => normalizeStr(v.name).includes(edgeBase));
      }

      // 3. Buscar cualquier voz masculina identificada por palabras clave
      if (!selectedVoice) {
        selectedVoice = candidateVoices.find(v => maleKeywords.some(kw => normalizeStr(v.name).includes(kw)));
      }

      // 4. Si no hay voz masculina dedicada pero hay más de una voz en el sistema, usar una voz diferente a la de Sofía
      if (!selectedVoice && candidateVoices.length > 1) {
        const sofiaVoiceMatch = localSofiaVoice
          ? candidateVoices.find(v => v.name === localSofiaVoice)
          : candidateVoices.find(v => femaleKeywords.some(kw => normalizeStr(v.name).includes(kw)));
        const alternative = candidateVoices.find(v => v !== sofiaVoiceMatch);
        if (alternative) selectedVoice = alternative;
      }

      // 5. Fallback a la primera voz disponible
      if (!selectedVoice && candidateVoices.length > 0) {
        selectedVoice = candidateVoices[0];
      }

      // Modulación acústica masculina: tono grave, barítono profundo (pitch 0.68)
      const basePitch = 0.68;
      const pitchMod = isQuestion ? 0.04 : isExclamatory ? 0.03 : 0;
      const rateMod = isExclamatory ? 0.98 : 0.93;

      return {
        voice: selectedVoice,
        pitch: Math.max(0.55, basePitch + pitchMod),
        rateFactor: rateMod,
        voiceName: selectedVoice?.name ? `${selectedVoice.name.replace(/^(Microsoft|Google)\s*/i, '').split('-')[0].trim()} (Mateo)` : 'Voz Masculina (Mateo)',
      };
    }
  }, [voices, localSofiaVoice, localMateoVoice, edgeSofiaVoice, edgeMateoVoice]);

  // Avanzar a la siguiente intervención de diálogo
  const advanceToNextLine = useCallback((fromIndex: number) => {
    if (!isMountedRef.current || isManualInterruptionRef.current || !isPlayingRef.current) return;
    if (!podcast?.dialogue) return;

    if (fromIndex < podcast.dialogue.length - 1) {
      const nextSeg = fromIndex + 1;
      const nextGlobal = segmentStartGlobalIndices[nextSeg] || 0;
      setWordPosition(nextGlobal, nextSeg, 0);

      // Deslizar ventana de precarga para los próximos turnos de diálogo
      if (voiceEngineRef.current === 'edge') {
        preloadEntireAzurePodcast(podcast.dialogue, edgeSofiaVoice, edgeMateoVoice, nextSeg);
      }

      speakDialogueLineRef.current?.(nextSeg, 0);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsAudioActive(false);
      setWordPosition(0, 0, 0);
    }
  }, [podcast?.dialogue, segmentStartGlobalIndices, setWordPosition, edgeSofiaVoice, edgeMateoVoice]);

  // Reproducir vocalmente mediante el motor del navegador (fallback local) con inicio por palabra
  const speakBrowserDialogueLine = useCallback((
    index: number,
    cleanText: string,
    speakerName: string,
    startWordIdx: number = 0
  ) => {
    if (!isMountedRef.current || !isPlayingRef.current || isManualInterruptionRef.current) return;
    if (!('speechSynthesis' in window)) return;
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current.onboundary = null;
    }
    window.speechSynthesis.cancel();

    const rawWords = cleanText.split(/\s+/).filter(Boolean);
    const safeWordIdx = Math.max(0, Math.min(rawWords.length - 1, startWordIdx));
    const textToSpeak = rawWords.slice(safeWordIdx).join(' ');

    if (!textToSpeak.trim()) {
      advanceToNextLine(index);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    currentUtteranceRef.current = utterance;
    loadedAudioSegmentRef.current = index;

    const { voice, pitch, rateFactor } = getSpeakerAcoustics(speakerName, cleanText);

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

    // Seguimiento sincronizado palabra por palabra en el navegador
    utterance.onboundary = (e) => {
      if (!isMountedRef.current || isScrubbingRef.current || isManualInterruptionRef.current || !isPlayingRef.current) return;
      if (e.name === 'word') {
        const textSoFar = textToSpeak.slice(0, e.charIndex);
        const spokenWordCount = textSoFar.trim() ? textSoFar.trim().split(/\s+/).length : 0;
        const currentWord = Math.min(rawWords.length - 1, safeWordIdx + spokenWordCount);
        const baseGlobal = segmentStartGlobalIndices[index] || 0;
        setWordPosition(baseGlobal + currentWord, index, currentWord);
      }
    };

    utterance.onend = () => {
      setIsAudioActive(false);
      if (isMountedRef.current && isPlayingRef.current && !isManualInterruptionRef.current) {
        setTimeout(() => {
          if (isMountedRef.current && isPlayingRef.current && !isManualInterruptionRef.current) {
            advanceToNextLine(index);
          }
        }, 250);
      }
    };

    utterance.onerror = (e) => {
      setIsAudioActive(false);
      if (e.error === 'interrupted' || e.error === 'canceled' || isManualInterruptionRef.current || !isMountedRef.current) return;
      console.warn('[Podcast TTS] Error en síntesis de voz local:', e);
      if (isMountedRef.current && isPlayingRef.current && !isManualInterruptionRef.current) {
        setTimeout(() => {
          if (isMountedRef.current && isPlayingRef.current && !isManualInterruptionRef.current) {
            advanceToNextLine(index);
          }
        }, 600);
      }
    };

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  }, [getSpeakerAcoustics, advanceToNextLine, segmentStartGlobalIndices, setWordPosition]);

  // Reproducir vocalmente una línea del diálogo con soporte para Azure Neural TTS y Fallback local
  const speakDialogueLine = useCallback(async (index: number, startWordIdx: number = 0) => {
    if (!isMountedRef.current || isManualInterruptionRef.current) return;
    if (!podcast || !podcast.dialogue || !podcast.dialogue[index]) return;

    const isPreloaded = Boolean(
      preloadedNextAudioRef.current && preloadedNextAudioRef.current.index === index
    );

    if (!isPreloaded) {
      stopCurrentAudio();
    } else if (audioPlayerRef.current) {
      audioPlayerRef.current.ontimeupdate = null;
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
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

    const rawWords = cleanText.split(/\s+/).filter(Boolean);
    const safeWordIdx = Math.max(0, Math.min(rawWords.length - 1, startWordIdx));
    const baseGlobal = segmentStartGlobalIndices[index] || 0;
    setWordPosition(baseGlobal + safeWordIdx, index, safeWordIdx);

    if (isMutedRef.current) {
      const remainingWords = rawWords.slice(safeWordIdx);
      const durationMs = Math.max(1500, Math.min(8000, (remainingWords.length * 400) / playbackSpeedRef.current));
      setIsAudioActive(true);
      const timer = setTimeout(() => {
        setIsAudioActive(false);
        if (isMountedRef.current && isPlayingRef.current && !isManualInterruptionRef.current) {
          advanceToNextLine(index);
        }
      }, durationMs);
      return () => clearTimeout(timer);
    }

    // Ruta 1: Motor Neuronal Azure (Edge Neural TTS)
    if (voiceEngineRef.current === 'edge') {
      const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(item.speaker);
      const targetVoice = isFemale ? (edgeSofiaVoice || 'es-ES-ElviraNeural') : (edgeMateoVoice || 'es-ES-AlvaroNeural');

      try {
        let audio: HTMLAudioElement;
        let audioUrl: string;

        // Si ya teníamos este segmento pre-cargado en memoria, usar el elemento Audio directamente (0ms latencia)
        if (preloadedNextAudioRef.current && preloadedNextAudioRef.current.index === index) {
          audio = preloadedNextAudioRef.current.audio;
          audioUrl = audio.src;
          preloadedNextAudioRef.current = null;
        } else {
          setIsSynthesizing(true);
          audioUrl = await synthesizeAzureEdgeSpeech(cleanText, targetVoice);
          setIsSynthesizing(false);

          if (!isMountedRef.current || !isPlayingRef.current || isManualInterruptionRef.current) {
            return;
          }

          audio = audioPlayerRef.current || new Audio();
          if (audio.src !== audioUrl) {
            audio.src = audioUrl;
          }
        }

        audioPlayerRef.current = audio;
        loadedAudioSegmentRef.current = index;
        audio.playbackRate = playbackSpeedRef.current;
        audio.muted = isMutedRef.current;

        // Iniciar de inmediato la pre-síntesis y pre-carga en memoria del SIGUIENTE turno de diálogo con prioridad alta
        if (podcast.dialogue[index + 1]) {
          const nextIdx = index + 1;
          const nextItem = podcast.dialogue[nextIdx];
          const nextClean = nextItem.text
            .replace(/[*_#`~[\]]/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[$]/g, '')
            .trim();
          const nextIsFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(nextItem.speaker);
          const nextVoice = nextIsFemale ? (edgeSofiaVoice || 'es-ES-ElviraNeural') : (edgeMateoVoice || 'es-ES-AlvaroNeural');

          synthesizeAzureEdgeSpeech(nextClean, nextVoice)
            .then((nextUrl) => {
              if (isMountedRef.current && isPlayingRef.current && !isManualInterruptionRef.current) {
                const nextAudio = new Audio();
                nextAudio.preload = 'auto';
                nextAudio.src = nextUrl;
                nextAudio.load();
                preloadedNextAudioRef.current = { index: nextIdx, audio: nextAudio };
              }
            })
            .catch((err) => {
              console.warn('[AzureEdgeTTS] Error en pre-carga silenciosa del siguiente parlamento:', err);
            });
        }

        // Si se especificó una palabra inicial dentro del segmento, saltar a ese punto exacto
        const setAudioTimeFromWord = () => {
          if (audio && audio.duration && Number.isFinite(audio.duration) && rawWords.length > 0) {
            const targetTime = (safeWordIdx / rawWords.length) * audio.duration;
            if (Math.abs(audio.currentTime - targetTime) > 0.15) {
              audio.currentTime = targetTime;
            }
          }
        };

        audio.onloadedmetadata = setAudioTimeFromWord;
        if (audio.readyState >= 1) {
          setAudioTimeFromWord();
        }

        audio.onplay = () => {
          setIsAudioActive(true);
          synthesisRetryCountRef.current = 0;
          setSynthesisError(null);
        };

        let hasAdvancedThisLine = false;
        const triggerAdvance = () => {
          if (!isMountedRef.current || hasAdvancedThisLine || !isPlayingRef.current || isManualInterruptionRef.current) return;
          hasAdvancedThisLine = true;
          advanceToNextLine(index);
        };

        // Seguimiento continuo palabra por palabra con el reloj de audio
        audio.ontimeupdate = () => {
          if (!isMountedRef.current || isScrubbingRef.current || isAudioSeekingRef.current || isManualInterruptionRef.current) return;
          if (!isPlayingRef.current) return;
          if (audio && audio.duration && Number.isFinite(audio.duration) && rawWords.length > 0) {
            const ratio = Math.max(0, Math.min(0.999, audio.currentTime / audio.duration));
            const currentW = Math.floor(ratio * rawWords.length);
            setWordPosition(baseGlobal + currentW, index, currentW);

            // Transición imperceptible entre Host y Tutor al concluir la locución
            if (
              audio.duration > 0.8 &&
              audio.currentTime >= audio.duration - 0.05 &&
              preloadedNextAudioRef.current &&
              preloadedNextAudioRef.current.index === index + 1
            ) {
              triggerAdvance();
            }
          }
        };

        audio.onended = () => {
          setIsAudioActive(false);
          triggerAdvance();
        };

        audio.onerror = (err) => {
          if (!isMountedRef.current || isManualInterruptionRef.current || isScrubbingRef.current || !isPlayingRef.current) {
            setIsAudioActive(false);
            return;
          }
          console.warn('[AudioPlayer] Error en reproducción de audio Azure Neural:', err);
          setIsAudioActive(false);
          setIsSynthesizing(false);
          if (synthesisRetryCountRef.current < 2) {
            synthesisRetryCountRef.current += 1;
            setSynthesisError('Reintentando conexión con Azure Neural...');
            setTimeout(() => {
              if (isMountedRef.current && isPlayingRef.current) {
                speakDialogueLine(index, safeWordIdx);
              }
            }, 800);
          } else {
            setSynthesisError('Conexión con Azure Neural inestable. Haz clic en Reproducir para reintentar.');
            setIsPlaying(false);
          }
        };

        if (!isMountedRef.current || !isPlayingRef.current || isManualInterruptionRef.current) {
          audio.pause();
          setIsAudioActive(false);
          return;
        }

        try {
          await audio.play();
        } catch (playErr: unknown) {
          const isAbort =
            playErr instanceof Error &&
            (playErr.name === 'AbortError' ||
              playErr.message.includes('interrupted') ||
              playErr.message.includes('pause'));
          if (!isMountedRef.current || isAbort || isManualInterruptionRef.current || isScrubbingRef.current || !isPlayingRef.current) {
            setIsAudioActive(false);
            return;
          }
          throw playErr;
        }
        return;
      } catch (err: unknown) {
        setIsSynthesizing(false);
        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' ||
            err.message.includes('interrupted') ||
            err.message.includes('pause'));
        if (!isMountedRef.current || isAbort || isManualInterruptionRef.current || isScrubbingRef.current || !isPlayingRef.current) {
          setIsAudioActive(false);
          return;
        }
        console.warn('[NeuralTTS] Error en síntesis de voz neuronal:', err);
        setIsAudioActive(false);

        if (synthesisRetryCountRef.current < 2) {
          synthesisRetryCountRef.current += 1;
          setSynthesisError('Reintentando enlace con voz Azure Neural...');
          setTimeout(() => {
            if (isMountedRef.current && isPlayingRef.current) {
              speakDialogueLine(index, safeWordIdx);
            }
          }, 800);
        } else {
          setSynthesisError('No se pudo conectar con Azure Neural. Haz clic en Reproducir para reintentar.');
          setIsPlaying(false);
        }
        return;
      }
    }

    // Ruta 2: Motor del Navegador (SpeechSynthesis) solo si el usuario seleccionó expresamente 'browser'
    speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
  }, [podcast, edgeSofiaVoice, edgeMateoVoice, stopCurrentAudio, speakBrowserDialogueLine, advanceToNextLine, segmentStartGlobalIndices, setWordPosition]);

  // Mantener referencia mutable siempre actualizada
  speakDialogueLineRef.current = speakDialogueLine;

  // Cambio de velocidad sin reiniciar el guion ni la posición de palabra
  const handleSpeedChange = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed);
    playbackSpeedRef.current = newSpeed;

    const updated = savePodcastSettings({ playbackSpeed: newSpeed });
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = newSpeed;
    }

    // Si está usando el sintetizador del navegador local (SpeechSynthesis), recrear el utterance con la nueva velocidad
    if (voiceEngineRef.current === 'browser' && isPlayingRef.current) {
      isManualInterruptionRef.current = true;
      stopCurrentAudio();
      setTimeout(() => {
        isManualInterruptionRef.current = false;
        speakDialogueLineRef.current?.(currentLineIndexRef.current, currentWordIndexRef.current);
      }, 50);
    }
  };

  // Cambiar motor de voz de forma dinámica y reactiva
  const handleSwitchEngine = (newEngine: 'edge' | 'browser') => {
    setVoiceEngine(newEngine);
    voiceEngineRef.current = newEngine;
    stopCurrentAudio();
    setSynthesisError(null);
    const updated = savePodcastSettings({ voiceEngine: newEngine });
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
    }
    if (isPlayingRef.current) {
      setTimeout(() => {
        speakDialogueLineRef.current?.(currentLineIndexRef.current, currentWordIndexRef.current);
      }, 80);
    }
  };

  // Preescucha de una voz con su modulación correspondiente (Sofía: aguda 1.25x / Mateo: grave 0.68x)
  const previewLocalVoice = (e: React.MouseEvent, voice: SpeechSynthesisVoice, gender: 'female' | 'male') => {
    e.stopPropagation();
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    stopCurrentAudio();
    const isSofia = gender === 'female';
    const cleanName = voice.name.replace(/^(Microsoft|Google)\s*/i, '').split('-')[0].trim();
    const sampleText = isSofia
      ? `¡Hola! Soy Sofía con la voz de ${cleanName}. Vamos a repasar juntos hoy.`
      : `¡Y yo soy Mateo con la voz de ${cleanName}! Profundizaremos en cada concepto.`;
    const utt = new SpeechSynthesisUtterance(sampleText);
    utt.voice = voice;
    utt.lang = voice.lang;
    utt.pitch = isSofia ? 1.25 : 0.68;
    utt.rate = isSofia ? 1.05 : 0.93;
    window.speechSynthesis.speak(utt);
  };

  // Preescucha para la asignación automática inteligente
  const previewAutomaticLocalSample = (e: React.MouseEvent, gender: 'female' | 'male') => {
    e.stopPropagation();
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    stopCurrentAudio();
    const isSofia = gender === 'female';
    const speakerName = isSofia ? 'Sofía' : 'Mateo';
    const acoustics = getSpeakerAcoustics(speakerName, isSofia ? '¡Hola!' : '¡Y yo soy Mateo!');
    const sampleText = isSofia
      ? '¡Hola! Soy Sofía con modulación automática inteligente. ¡Vamos a repasar juntos hoy!'
      : '¡Y yo soy Mateo con modulación automática inteligente! Profundizaremos en cada concepto.';
    const utt = new SpeechSynthesisUtterance(sampleText);
    if (acoustics.voice) {
      utt.voice = acoustics.voice;
      utt.lang = acoustics.voice.lang;
    } else {
      utt.lang = 'es-ES';
    }
    utt.pitch = acoustics.pitch;
    utt.rate = acoustics.rateFactor;
    window.speechSynthesis.speak(utt);
  };

  // Preescucha individual de una voz de Azure Neural en el catálogo
  const previewAzureVoiceSample = async (e: React.MouseEvent, voiceOption: AzureEdgeVoiceOption) => {
    e.stopPropagation();
    setIsTestingVoice(true);
    stopCurrentAudio();
    const isFemale = voiceOption.gender === 'female';
    const cleanName = voiceOption.name.replace(' Neural', '');
    const sampleText = isFemale
      ? `¡Hola! Soy ${cleanName} con la voz natural y emotiva de Microsoft Azure.`
      : `¡Hola! Soy ${cleanName} con la voz natural y emotiva de Microsoft Azure.`;
    try {
      const testUrl = await synthesizeAzureEdgeSpeech(sampleText, voiceOption.id);
      let audio = audioPlayerRef.current;
      if (!audio) {
        audio = new Audio();
        audioPlayerRef.current = audio;
      }
      audio.src = testUrl;
      audio.playbackRate = 1;
      audio.onended = () => setIsTestingVoice(false);
      audio.onerror = () => setIsTestingVoice(false);
      await audio.play();
    } catch (err: unknown) {
      setIsTestingVoice(false);
      const msg = err instanceof Error ? err.message : String(err);
      alert('Error al reproducir voz Azure Neural: ' + (msg || 'Error de conexión'));
    }
  };

  // Probar la voz configurada activa (para Sofía o Mateo) en el modal
  const testVoiceSample = async (speaker: 'sofia' | 'mateo') => {
    setIsTestingVoice(true);
    stopCurrentAudio();

    const isSofia = speaker === 'sofia';
    const text = isSofia
      ? `¡Hola! Soy Sofía en ${theme === 'kitty' ? 'Kitty Study' : 'Contrareloj Study'}. ¡Me alegra mucho que estemos repasando juntos hoy!`
      : '¡Y yo soy Mateo! Vamos a profundizar en cada concepto para que apruebes con la máxima nota.';

    if (voiceEngine === 'edge') {
      try {
        const voice = isSofia ? edgeSofiaVoice : edgeMateoVoice;
        const testUrl = await synthesizeAzureEdgeSpeech(text, voice);
        let audio = audioPlayerRef.current;
        if (!audio) {
          audio = new Audio();
          audioPlayerRef.current = audio;
        }
        audio.src = testUrl;
        audio.playbackRate = 1;
        audio.onended = () => setIsTestingVoice(false);
        audio.onerror = () => setIsTestingVoice(false);
        await audio.play();
      } catch (err: unknown) {
        setIsTestingVoice(false);
        const msg = err instanceof Error ? err.message : String(err);
        alert('Fallo al probar la voz de Azure Neural: ' + (msg || 'Error de conexión'));
      }
    } else {
      if (!('speechSynthesis' in window)) {
        setIsTestingVoice(false);
        alert('Tu navegador no soporta síntesis de voz.');
        return;
      }
      const speakerName = isSofia ? 'Sofía' : 'Mateo';
      const acoustics = getSpeakerAcoustics(speakerName, text);
      const utt = new SpeechSynthesisUtterance(text);
      if (acoustics.voice) {
        utt.voice = acoustics.voice;
        utt.lang = acoustics.voice.lang;
      } else {
        utt.lang = 'es-ES';
      }
      utt.pitch = acoustics.pitch;
      utt.rate = acoustics.rateFactor;
      utt.onend = () => setIsTestingVoice(false);
      utt.onerror = () => setIsTestingVoice(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
    }
  };

  // Navegar a una palabra global específica en el podcast
  const seekToGlobalWord = useCallback((targetGlobalIndex: number, forcePlay?: boolean) => {
    if (allWords.length === 0) return;
    const safeGlobal = Math.max(0, Math.min(allWords.length - 1, targetGlobalIndex));
    const target = allWords[safeGlobal];
    if (!target) return;

    // Actualizar estado y refs de inmediato de forma síncrona
    setWordPosition(safeGlobal, target.segmentIndex, target.wordIndexInSegment);

    const willPlay = forcePlay !== undefined ? forcePlay : isPlayingRef.current;
    const isSameLoadedSegment = loadedAudioSegmentRef.current === target.segmentIndex;

    // Si estamos en el mismo segmento ya cargado y tenemos audio HTML5 ya disponible con duración
    const audio = audioPlayerRef.current;
    if (voiceEngineRef.current === 'edge' && audio && isSameLoadedSegment && audio.duration && Number.isFinite(audio.duration)) {
      const segmentWords = podcast?.dialogue[target.segmentIndex]
        ? podcast.dialogue[target.segmentIndex].text.replace(/[*_#`~[\]]/g, '').trim().split(/\s+/).filter(Boolean)
        : [];
      const totalWords = segmentWords.length || 1;
      const targetTime = (target.wordIndexInSegment / totalWords) * audio.duration;

      isManualInterruptionRef.current = true;
      isAudioSeekingRef.current = true;

      const finishSeek = () => {
        audio.removeEventListener('seeked', finishSeek);
        setTimeout(() => {
          isAudioSeekingRef.current = false;
          isManualInterruptionRef.current = false;
        }, 120);
      };
      audio.addEventListener('seeked', finishSeek, { once: true });

      audio.currentTime = Math.max(0, Math.min(audio.duration - 0.05, targetTime));

      // Fallback por si 'seeked' no se dispara (ej. si currentTime ya era muy similar)
      setTimeout(() => {
        isAudioSeekingRef.current = false;
        isManualInterruptionRef.current = false;
      }, 350);

      if (willPlay) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        if (audio.paused) {
          audio.play().catch(console.warn);
        }
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
        audio.pause();
      }
      return;
    }

    // Si cambiamos de segmento o estamos con SpeechSynthesis
    isManualInterruptionRef.current = true;
    stopCurrentAudio();
    loadedAudioSegmentRef.current = -1;

    setTimeout(() => {
      isManualInterruptionRef.current = false;
      if (willPlay) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        speakDialogueLineRef.current?.(target.segmentIndex, target.wordIndexInSegment);
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    }, 60);
  }, [allWords, podcast?.dialogue, setWordPosition, stopCurrentAudio]);

  // Navegar a un segundo específico en el podcast de forma continua y suave
  const seekToTime = useCallback((targetSecs: number, forcePlay?: boolean) => {
    if (!podcast?.dialogue || podcast.dialogue.length === 0) return;
    const safeSecs = Math.max(0, Math.min(totalDurationSecs, targetSecs));
    currentPlaybackSecsRef.current = safeSecs;
    setCurrentPlaybackSecs(safeSecs);

    // Encontrar qué segmento corresponde al segundo destino
    let targetSegIdx = 0;
    for (let i = 0; i < podcast.dialogue.length; i++) {
      const segStart = parseTimeToSeconds(podcast.dialogue[i].time || '0:00');
      if (segStart <= safeSecs) {
        targetSegIdx = i;
      } else {
        break;
      }
    }

    const segStartSecs = parseTimeToSeconds(podcast.dialogue[targetSegIdx].time || '0:00');
    const offsetInSeg = Math.max(0, safeSecs - segStartSecs);

    const segWords = podcast.dialogue[targetSegIdx].text
      .replace(/[*_#`~[\]]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[$]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const nextSeg = podcast.dialogue[targetSegIdx + 1];
    const nextSegStart = nextSeg ? parseTimeToSeconds(nextSeg.time) : (segStartSecs + Math.max(10, segWords.length * 0.4));
    const segDuration = Math.max(1, nextSegStart - segStartSecs);
    const wordRatio = Math.max(0, Math.min(0.99, offsetInSeg / segDuration));
    const approxWordIdx = Math.floor(wordRatio * segWords.length);

    const baseGlobal = segmentStartGlobalIndices[targetSegIdx] || 0;
    setWordPosition(baseGlobal + approxWordIdx, targetSegIdx, approxWordIdx, safeSecs);

    const willPlay = forcePlay !== undefined ? forcePlay : isPlayingRef.current;
    const audio = audioPlayerRef.current;
    const isSameLoadedSegment = loadedAudioSegmentRef.current === targetSegIdx;

    if (voiceEngineRef.current === 'edge' && audio && isSameLoadedSegment && audio.duration && Number.isFinite(audio.duration)) {
      isManualInterruptionRef.current = true;
      isAudioSeekingRef.current = true;

      const finishSeek = () => {
        audio.removeEventListener('seeked', finishSeek);
        setTimeout(() => {
          isAudioSeekingRef.current = false;
          isManualInterruptionRef.current = false;
        }, 120);
      };
      audio.addEventListener('seeked', finishSeek, { once: true });
      audio.currentTime = Math.max(0, Math.min(audio.duration - 0.05, offsetInSeg));

      setTimeout(() => {
        isAudioSeekingRef.current = false;
        isManualInterruptionRef.current = false;
      }, 350);

      if (willPlay) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        if (audio.paused) {
          audio.play().catch(console.warn);
        }
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
        audio.pause();
      }
      return;
    }

    isManualInterruptionRef.current = true;
    stopCurrentAudio();
    loadedAudioSegmentRef.current = -1;

    setTimeout(() => {
      isManualInterruptionRef.current = false;
      if (willPlay) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        speakDialogueLineRef.current?.(targetSegIdx, approxWordIdx);
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    }, 60);
  }, [podcast?.dialogue, totalDurationSecs, segmentStartGlobalIndices, setWordPosition, stopCurrentAudio]);

  // Avanzar o retroceder segundos (ej. -10s o +10s)
  const handleSkipSeconds = useCallback((deltaSecs: number) => {
    const target = currentPlaybackSecsRef.current + deltaSecs;
    seekToTime(target);
  }, [seekToTime]);

  // Control interactivo del slider continuo
  const handleProgressPointerDown = useCallback(() => {
    isManualInterruptionRef.current = true;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    wasPlayingBeforeScrubRef.current = isPlayingRef.current;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAudioActive(false);
  }, []);

  const handleProgressChange = useCallback((stepVal: number) => {
    if (totalDurationSecs <= 0) return;
    const ratio = Math.max(0, Math.min(1, stepVal / 1000));
    const targetSecs = ratio * totalDurationSecs;
    currentPlaybackSecsRef.current = targetSecs;
    setCurrentPlaybackSecs(targetSecs);

    if (podcast?.dialogue) {
      let previewSeg = 0;
      for (let i = 0; i < podcast.dialogue.length; i++) {
        if (parseTimeToSeconds(podcast.dialogue[i].time || '0:00') <= targetSecs) {
          previewSeg = i;
        } else {
          break;
        }
      }
      if (previewSeg !== currentLineIndexRef.current) {
        currentLineIndexRef.current = previewSeg;
        setCurrentLineIndex(previewSeg);
      }
    }
  }, [totalDurationSecs, podcast?.dialogue]);

  const handleProgressPointerUp = useCallback((e?: React.SyntheticEvent | Event) => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    setIsScrubbing(false);

    let targetSecs = currentPlaybackSecsRef.current;
    if (e && 'target' in e && (e.target as HTMLInputElement)?.value !== undefined) {
      const inputVal = Number((e.target as HTMLInputElement).value);
      if (!isNaN(inputVal) && totalDurationSecs > 0) {
        targetSecs = (Math.max(0, Math.min(1000, inputVal)) / 1000) * totalDurationSecs;
      }
    }

    const shouldResume = wasPlayingBeforeScrubRef.current;
    seekToTime(targetSecs, shouldResume);
  }, [seekToTime, totalDurationSecs]);

  // Listener global de pointerup para asegurar que si el usuario suelta fuera de la barra, se consolide el salto
  useEffect(() => {
    if (!isScrubbing) return;

    const onGlobalPointerUp = () => {
      handleProgressPointerUp();
    };

    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
    };
  }, [isScrubbing, handleProgressPointerUp]);



  // Adelantar o atrasar a un segmento completo
  const handleSeek = useCallback((targetIndex: number) => {
    if (!podcast?.dialogue) return;
    const safeIdx = Math.max(0, Math.min(podcast.dialogue.length - 1, targetIndex));
    const targetGlobal = segmentStartGlobalIndices[safeIdx] || 0;
    seekToGlobalWord(targetGlobal);
  }, [podcast?.dialogue, segmentStartGlobalIndices, seekToGlobalWord]);

  const handleSkipBackward = () => {
    if (currentLineIndexRef.current > 0) {
      handleSeek(currentLineIndexRef.current - 1);
    }
  };

  const handleSkipForward = () => {
    if (podcast?.dialogue && currentLineIndexRef.current < podcast.dialogue.length - 1) {
      handleSeek(currentLineIndexRef.current + 1);
    }
  };

  // Temporizador anti-congelamiento de SpeechSynthesis en Chromium
  useEffect(() => {
    if (!isPlaying || voiceEngineRef.current !== 'browser') return;
    const interval = setInterval(() => {
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Alternar reproducción
  const handleTogglePlay = useCallback(() => {
    setSynthesisError(null);
    synthesisRetryCountRef.current = 0;
    if (isPlayingRef.current) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      isManualInterruptionRef.current = true;
      stopCurrentAudio();
      setTimeout(() => {
        isManualInterruptionRef.current = false;
      }, 50);
    } else {
      if (currentLineIndexRef.current === 0 && currentWordIndexRef.current === 0 && !isMutedRef.current) {
        playIntroChime();
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      isManualInterruptionRef.current = false;
      speakDialogueLineRef.current?.(currentLineIndexRef.current, currentWordIndexRef.current);
    }
  }, [stopCurrentAudio, playIntroChime]);

  // Control de reproducción por teclado: Espacio (Play/Pausa) y Flechas (Adelantar / Retroceder 10s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está interactuando con inputs, textareas, selects o elementos editables
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        Boolean(activeElement?.getAttribute('contenteditable'));

      if (isInputFocused) return;

      // Ignorar si hay algún modal abierto
      if (showVoiceModal || showConfirmReplaceModal) return;

      // No ejecutar si no hay podcast o si aún se está generando
      if (!podcast || isGenerating) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkipSeconds(10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSkipSeconds(-10);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    handleTogglePlay,
    handleSkipSeconds,
    showVoiceModal,
    showConfirmReplaceModal,
    podcast,
    isGenerating,
  ]);

  // Reiniciar episodio desde el principio
  const handleRestart = () => {
    setSynthesisError(null);
    synthesisRetryCountRef.current = 0;
    isManualInterruptionRef.current = true;
    stopCurrentAudio();
    loadedAudioSegmentRef.current = -1;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = 0;
    }
    currentPlaybackSecsRef.current = 0;
    setCurrentPlaybackSecs(0);
    setWordPosition(0, 0, 0, 0);

    setTimeout(() => {
      isManualInterruptionRef.current = false;
      if (isPlayingRef.current && !isMutedRef.current) {
        playIntroChime();
        speakDialogueLineRef.current?.(0, 0);
      }
    }, 60);
  };

  // Alternar silencio sin reiniciar posición ni parar innecesariamente en audio HTML5
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.muted = nextMuted;
    }
    if (isPlaying) {
      if (nextMuted) {
        if (voiceEngineRef.current === 'browser') {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
        }
      } else {
        if (voiceEngineRef.current === 'browser') {
          speakDialogueLineRef.current?.(currentLineIndexRef.current, currentWordIndexRef.current);
        }
      }
    }
  };

  const handleCloseVoiceModal = () => {
    stopCurrentAudio(true);
    setIsTestingVoice(false);
    setShowVoiceModal(false);
    const updated = savePodcastSettings({ orientation: orientationInput.trim() });
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
    }
  };

  const handleGeneratePodcast = async (overrideOptions?: {
    format?: PodcastFormat;
    duration?: PodcastDuration;
    orientation?: string;
    isReplacement?: boolean;
  }) => {
    setIsGenerating(true);
    setSynthesisError(null);

    const activeFormat = overrideOptions?.format || selectedFormat;
    const activeDuration = overrideOptions?.duration || selectedDuration;
    const activeOrientation =
      (overrideOptions?.orientation !== undefined ? overrideOptions.orientation : orientationInput) ||
      getPodcastSettings().orientation;

    if (overrideOptions?.isReplacement) {
      stopCurrentAudio(true);
      try {
        localStorage.removeItem(`thea_podcast_pos_${kit.id}`);
        await clearAzureAudioCache();
      } catch (err) {
        console.warn('Error al limpiar caché de audio:', err);
      }
      setCurrentLineIndex(0);
      currentLineIndexRef.current = 0;
      setCurrentPlaybackSecs(0);
      currentPlaybackSecsRef.current = 0;
      setWordPosition(0, 0, 0, 0);
    }

    try {
      const fullSourceText = [
        kit.sourceText,
        kit.studyGuideMarkdown,
        ...(kit.sourceMaterials?.map((m) => m.rawText) || []),
        kit.description,
      ]
        .filter(Boolean)
        .join('\n\n---\n\n')
        .slice(0, 70000);

      const generated = await generateAIPodcast(
        fullSourceText,
        kit.title,
        kit.category,
        {
          format: activeFormat,
          duration: activeDuration,
          orientation: activeOrientation,
          previousPodcast: kit.podcast || undefined,
        }
      );
      if (generated && onUpdateKit) {
        onUpdateKit({ ...kit, podcast: generated });
      }
      if (generated?.dialogue && generated.dialogue.length > 0) {
        const firstItem = generated.dialogue[0];
        const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(firstItem.speaker);
        if (voiceEngine === 'edge') {
          const voice = isFemale ? edgeSofiaVoice : edgeMateoVoice;
          synthesizeAzureEdgeSpeech(firstItem.text, voice)
            .then((url) => {
              if (isMountedRef.current) {
                const firstAudio = new Audio();
                firstAudio.preload = 'auto';
                firstAudio.src = url;
                firstAudio.load();
                preloadedNextAudioRef.current = { index: 0, audio: firstAudio };

                if (generated.dialogue[1]) {
                  const secondItem = generated.dialogue[1];
                  const secondIsFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(secondItem.speaker);
                  const secondVoice = secondIsFemale ? edgeSofiaVoice : edgeMateoVoice;
                  prefetchAzureEdgeSpeech(secondItem.text, secondVoice);
                }
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.error(e);
      setSynthesisError('Error al generar el guión del podcast. Por favor inténtalo de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderConfirmReplaceModal = () => (
    <ConfirmReplacePodcastModal
      show={showConfirmReplaceModal}
      formatTitle={PODCAST_FORMAT_OPTIONS.find((f) => f.id === selectedFormat)?.title || 'Personalizado'}
      durationSubtitle={PODCAST_DURATION_OPTIONS.find((d) => d.id === selectedDuration)?.subtitle || 'Normal'}
      onClose={() => setShowConfirmReplaceModal(false)}
      onConfirm={async () => {
        setShowConfirmReplaceModal(false);
        setShowVoiceModal(false);
        await handleGeneratePodcast({
          format: selectedFormat,
          duration: selectedDuration,
          orientation: orientationInput,
          isReplacement: true,
        });
      }}
    />
  );

  const renderVoiceModal = () => (
    <PodcastVoiceModal
      show={showVoiceModal}
      voiceModalTab={voiceModalTab}
      onTabChange={setVoiceModalTab}
      voiceEngine={voiceEngine}
      onSwitchEngine={handleSwitchEngine}
      onClose={handleCloseVoiceModal}
      voices={voices}
      edgeSofiaVoice={edgeSofiaVoice}
      onSelectEdgeSofiaVoice={setEdgeSofiaVoice}
      edgeMateoVoice={edgeMateoVoice}
      onSelectEdgeMateoVoice={setEdgeMateoVoice}
      localSofiaVoice={localSofiaVoice}
      onSelectLocalSofiaVoice={setLocalSofiaVoice}
      localMateoVoice={localMateoVoice}
      onSelectLocalMateoVoice={setLocalMateoVoice}
      isTestingVoice={isTestingVoice}
      onPreviewAzureVoice={previewAzureVoiceSample}
      onPreviewLocalVoice={previewLocalVoice}
      onPreviewAutomaticLocalSample={previewAutomaticLocalSample}
      onTestVoiceSample={testVoiceSample}
      selectedFormat={selectedFormat}
      onSelectFormat={setSelectedFormat}
      selectedDuration={selectedDuration}
      onSelectDuration={setSelectedDuration}
      orientationInput={orientationInput}
      onOrientationChange={setOrientationInput}
      onRequestConfirmReplace={() => setShowConfirmReplaceModal(true)}
      isGenerating={isGenerating}
    />
  );

  const speeds = [0.75, 1, 1.25, 1.5, 2];

  if (!podcast || !podcast.dialogue || podcast.dialogue.length === 0) {
    return (
      <PodcastSetupView
        selectedFormat={selectedFormat}
        onSelectFormat={setSelectedFormat}
        selectedDuration={selectedDuration}
        onSelectDuration={setSelectedDuration}
        orientationInput={orientationInput}
        onOrientationChange={setOrientationInput}
        voiceEngine={voiceEngine}
        edgeSofiaVoice={edgeSofiaVoice}
        edgeMateoVoice={edgeMateoVoice}
        isGenerating={isGenerating}
        onOpenVoiceModal={() => {
          setVoiceModalTab(voiceEngine === "edge" ? "azure" : "browser");
          setShowVoiceModal(true);
        }}
        onGeneratePodcast={() => handleGeneratePodcast()}
      >
        {renderVoiceModal()}
        {renderConfirmReplaceModal()}
      </PodcastSetupView>
    );
  }

  if (!currentItem) return null;
  const speakerAcoustics = getSpeakerAcoustics(currentItem.speaker, currentItem.text);

  return (
    <div className="max-w-4xl w-full mx-auto px-3 sm:px-6 py-1.5 sm:py-2.5 h-full flex flex-col min-h-0 overflow-hidden animate-fadeIn">
      {/* Badge Header & Controls Bar */}
      <div className="mb-2 pb-2 border-b border-thea-border shrink-0">
        {/* Fila 1: Título y Selector de Pestañas */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] sm:text-xs uppercase font-extrabold px-1.5 sm:px-2 py-0.5 rounded bg-violet-600 text-white shrink-0">
                PODCAST EDUCATIVO
              </span>
              <span className="text-[11px] sm:text-xs text-slate-400 font-medium truncate hidden sm:inline">
                Recap de audio con síntesis vocal emotiva
              </span>
            </div>
            <h1 className={`text-base sm:text-xl font-bold flex items-center gap-1.5 sm:gap-2 truncate ${
              theme === 'dark' ? 'text-white' : 'text-zinc-950'
            }`}>
              <Headphones className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
              <span className="truncate">{theme === 'kitty' ? 'Kitty Review Podcast' : 'Contrareloj Review Podcast'}</span>
            </h1>
          </div>

          {/* Selector de Pestañas [Reproductor | Transcripción] */}
          <div className={`flex items-center gap-1 rounded-xl p-1 text-xs shrink-0 border ${
            theme === 'light'
              ? 'bg-slate-100/80 border-slate-200'
              : theme === 'kitty'
              ? 'bg-pink-100/60 border-pink-200'
              : 'bg-thea-surface border-thea-border'
          }`}>
            <button
              type="button"
              onClick={() => setActiveTab('player')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer text-xs ${
                activeTab === 'player'
                  ? (theme === 'light' ? 'bg-white text-zinc-950 shadow-xs border border-slate-200' : theme === 'kitty' ? 'bg-white text-pink-700 shadow-xs border border-pink-200' : 'bg-white/10 text-white shadow-sm border border-white/10')
                  : (theme === 'light' ? 'text-slate-600 hover:text-zinc-950' : theme === 'kitty' ? 'text-pink-600/80 hover:text-pink-950' : 'text-zinc-400 hover:text-white')
              }`}
            >
              Reproductor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transcript')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer text-xs ${
                activeTab === 'transcript'
                  ? (theme === 'light' ? 'bg-white text-zinc-950 shadow-xs border border-slate-200' : theme === 'kitty' ? 'bg-white text-pink-700 shadow-xs border border-pink-200' : 'bg-white/10 text-white shadow-sm border border-white/10')
                  : (theme === 'light' ? 'text-slate-600 hover:text-zinc-950' : theme === 'kitty' ? 'text-pink-600/80 hover:text-pink-950' : 'text-zinc-400 hover:text-white')
              }`}
            >
              Transcripción
            </button>
          </div>
        </div>

        {/* Fila 2: Motor de Voz y Acciones */}
        <div className="mt-1.5 pt-1.5 border-t border-thea-border/40 flex items-center justify-between gap-2 flex-wrap">
          {/* Selector de Motor de Voz Dinámico (Azure Neural vs Sistema) */}
          <div className={`flex items-center rounded-xl p-0.5 text-xs gap-0.5 border ${
            theme === 'light'
              ? 'bg-slate-100/90 border-slate-200'
              : theme === 'kitty'
              ? 'bg-pink-100/70 border-pink-200'
              : 'bg-white/[0.025] border-white/[0.08]'
          }`}>
            <button
              type="button"
              onClick={() => handleSwitchEngine('edge')}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer text-[11px] sm:text-xs ${
                voiceEngine === 'edge'
                  ? theme === 'light'
                    ? 'bg-white text-zinc-950 border border-slate-200 shadow-xs'
                    : theme === 'kitty'
                    ? 'bg-white text-pink-700 border border-pink-200 shadow-xs'
                    : 'bg-white/10 border border-white/15 text-zinc-100 shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-zinc-950'
                  : theme === 'kitty'
                  ? 'text-pink-600/80 hover:text-pink-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Azure Neural: Voces oficiales de Microsoft Azure."
            >
              <Headphones className="w-3.5 h-3.5 shrink-0" />
              <span>Azure Neural</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchEngine('browser')}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer text-[11px] sm:text-xs ${
                voiceEngine === 'browser'
                  ? theme === 'light'
                    ? 'bg-white text-zinc-950 border border-slate-200 shadow-xs'
                    : theme === 'kitty'
                    ? 'bg-white text-pink-700 border border-pink-200 shadow-xs'
                    : 'bg-white/10 border border-white/15 text-zinc-100 shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-zinc-950'
                  : theme === 'kitty'
                  ? 'text-pink-600/80 hover:text-pink-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Voz del Sistema: Síntesis local offline del navegador"
            >
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span>Voz Local</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setVoiceModalTab('azure');
                setShowVoiceModal(true);
              }}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer active:scale-95 ${
                theme === 'light'
                  ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-xs'
                  : theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700 shadow-xs'
                  : 'bg-white/[0.025] hover:bg-white/[0.06] border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
              title="Configuración de Voces, Locutores y Enfoque"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceModalTab('new_episode');
                setShowVoiceModal(true);
              }}
              className={`px-2.5 py-1 rounded-xl border font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.985] ${
                theme === 'light'
                  ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900 shadow-xs'
                  : theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-900 shadow-xs'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.12] text-zinc-200 hover:text-white'
              }`}
              title="Crear un nuevo episodio con otras configuraciones de formato y duración"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Nuevo Episodio</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'player' ? (
        <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
          {/* Main Visual Player Card */}
          <div className={`flex-1 min-h-0 flex flex-col justify-between rounded-2xl sm:rounded-3xl p-3 sm:p-5 relative overflow-hidden border ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-zinc-950 shadow-sm'
              : theme === 'kitty'
              ? 'bg-white border-pink-200 text-zinc-950 shadow-sm shadow-pink-100/50'
              : 'bg-[#0e0b16]/95 border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]'
          }`}>
            {/* Background Glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Episode Title Row (Compact Header) */}
            <div className="relative z-10 mb-2 shrink-0 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${
                    theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
                  }`}>
                    REPASO DE AUDIO DINÁMICO
                  </span>
                  {podcast.format && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      theme === 'dark'
                        ? 'bg-white/[0.05] text-zinc-300 border-white/[0.08]'
                        : theme === 'kitty'
                        ? 'bg-pink-100 text-pink-700 border-pink-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {podcast.format === 'detailed'
                        ? 'Información detallada'
                        : podcast.format === 'brief'
                        ? 'Breve'
                        : podcast.format === 'critique'
                        ? 'Crítica'
                        : 'Debate'}
                    </span>
                  )}
                  {podcast.durationMode && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      theme === 'dark'
                        ? 'bg-white/[0.05] text-zinc-300 border-white/[0.08]'
                        : theme === 'kitty'
                        ? 'bg-pink-100 text-pink-700 border-pink-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {podcast.durationMode === 'short'
                        ? 'Corto (-2 min)'
                        : podcast.durationMode === 'normal'
                        ? 'Normal (4-6 min)'
                        : 'Largo (10-30 min)'}
                    </span>
                  )}
                </div>
                <h2 className={`text-sm sm:text-base md:text-lg font-extrabold leading-snug tracking-tight truncate ${
                  theme === 'dark' ? 'text-white' : 'text-zinc-950'
                }`}>
                  {podcast.title}
                </h2>
              </div>
              <span className={`text-[10px] sm:text-[11px] tabular-nums shrink-0 font-medium ${
                theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
              }`}>
                Duración: {podcast.duration}
              </span>
            </div>

            {/* Alerta visible si la síntesis de voz experimenta un error */}
            {synthesisError && (
              <div className="mb-2 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-lg animate-fadeIn shrink-0">
                <span className="flex-1 leading-relaxed font-medium text-left truncate">
                  {synthesisError}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowVoiceModal(true)}
                    className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-zinc-200 hover:text-white font-semibold text-[11px]"
                  >
                    Ajustes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSynthesisError(null);
                      handleTogglePlay();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-[11px] active:scale-95"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {/* ── 2 COLUMNAS: IZQUIERDA = PRESENTADORES & DIÁLOGO | DERECHA = CONTROLES ARMONIOSOS ── */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-5 flex-1 min-h-0 items-center relative z-10">
              {/* COLUMNA IZQUIERDA: Presentadores y Burbuja Activa */}
              <div className="md:col-span-7 flex flex-col justify-between h-full min-h-0 space-y-2">
                {/* Host Cards + Equalizer Waveform Row */}
                <div className="flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    {podcast.hosts.map((host, idx) => {
                      const isCurrentHostSpeaking =
                        isPlaying &&
                        isAudioActive &&
                        currentItem.speaker.toLowerCase().includes(host.name.split(' ')[0].toLowerCase());

                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border flex items-center justify-center font-bold text-xs sm:text-sm shadow-sm transition-all duration-300 relative ${
                            isCurrentHostSpeaking
                              ? theme === 'dark'
                                ? 'border-white/40 ring-4 ring-white/10 scale-105 shadow-white/5 bg-white/10 text-white'
                                : 'border-pink-400 ring-4 ring-pink-300/40 scale-105 bg-pink-100 text-pink-700'
                              : theme === 'dark'
                              ? 'border-white/[0.08] bg-white/[0.03] text-zinc-300 opacity-70'
                              : 'border-slate-200 bg-slate-100 text-zinc-800 opacity-80'
                          }`}>
                            {host.name.charAt(0)}
                            {isCurrentHostSpeaking && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
                            )}
                          </div>
                          <div className="text-left">
                            <div className={`text-[11px] font-bold leading-tight ${
                              theme === 'dark' ? 'text-white' : 'text-zinc-950'
                            }`}>{host.name}</div>
                            <div className={`text-[9px] leading-tight ${
                              theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
                            }`}>{host.role}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Equalizer Waveform */}
                  <div className="flex items-center gap-1 h-5 shrink-0">
                    {[12, 35, 60, 85, 45, 70, 95, 50, 30, 65, 90, 40, 20].map((height, i) => (
                      <div
                        key={i}
                        style={{
                          height: isPlaying && isAudioActive
                            ? `${Math.max(20, Math.min(100, height * (Math.sin(i * 0.8 + currentLineIndex * 2) + 1.2) * 0.6))}%`
                            : '20%',
                        }}
                        className={`w-1 rounded-full transition-all duration-300 ${
                          isPlaying && isAudioActive
                            ? theme === 'kitty' ? 'bg-gradient-to-t from-pink-500 to-rose-400' : 'bg-gradient-to-t from-violet-500 to-zinc-100'
                            : theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Current Active Dialogue Bubble */}
                <div className={`rounded-xl sm:rounded-2xl p-2.5 sm:p-3 shadow-inner text-left flex-1 min-h-0 flex flex-col justify-between border ${
                  theme === 'dark'
                    ? 'bg-white/[0.03] border-white/[0.08]'
                    : theme === 'kitty'
                    ? 'bg-pink-50/70 border-pink-200'
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-1.5 shrink-0">
                    <span className={`font-bold text-xs flex items-center gap-1.5 ${
                      theme === 'dark' ? 'text-zinc-200' : 'text-zinc-950'
                    }`}>
                      <Volume2 className={`w-3.5 h-3.5 ${isAudioActive ? 'text-violet-400 animate-pulse' : theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'}`} />
                      {currentItem.speaker}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {voiceEngine === 'edge' ? (
                        isSynthesizing ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 animate-pulse ${
                            theme === 'dark' ? 'bg-white/[0.05] border-white/10 text-zinc-300' : 'bg-pink-100 border-pink-200 text-pink-700'
                          }`}>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="hidden sm:inline">Sintetizando...</span>
                          </span>
                        ) : (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 font-medium ${
                            theme === 'dark' ? 'bg-white/[0.05] border-white/10 text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            <Headphones className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>Azure ({/(sofia|chica|mujer|host\b|estudiante)/i.test(currentItem.speaker) ? (AZURE_EDGE_VOICES.find(v => v.id === edgeSofiaVoice)?.name || 'Elvira') : (AZURE_EDGE_VOICES.find(v => v.id === edgeMateoVoice)?.name || 'Álvaro')})</span>
                          </span>
                        )
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 font-medium ${
                          theme === 'dark' ? 'bg-white/[0.05] border-white/10 text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}>
                          <Headphones className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="truncate max-w-[100px]">{speakerAcoustics.voiceName}</span>
                        </span>
                      )}
                      <span className={`text-[10px] sm:text-[11px] font-mono tabular-nums ${
                        theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
                      }`}>
                        {currentItem.time}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs sm:text-sm font-medium leading-relaxed flex flex-wrap gap-x-1.5 gap-y-0.5 select-none overflow-y-auto max-h-20 sm:max-h-24 modal-smooth-scroll pr-1">
                    {currentSegmentWords.map((word, wIdx) => {
                      const isCurrent = wIdx === currentWordIndexInSegment;
                      const isPast = wIdx < currentWordIndexInSegment;
                      return (
                        <span
                          key={wIdx}
                          onClick={() => {
                            const baseGlobal = segmentStartGlobalIndices[currentLineIndex] || 0;
                            seekToGlobalWord(baseGlobal + wIdx);
                          }}
                          className={`cursor-pointer transition-colors duration-150 ${
                            theme === 'dark'
                              ? isCurrent
                                ? 'text-white font-bold underline decoration-violet-400'
                                : isPast
                                ? 'text-zinc-400 hover:text-white'
                                : 'text-zinc-500 hover:text-white'
                              : isCurrent
                              ? 'text-zinc-950 font-black bg-pink-100/90 px-1 rounded'
                              : isPast
                              ? 'text-zinc-600 hover:text-zinc-950'
                              : 'text-zinc-400 hover:text-zinc-950'
                          }`}
                          title={`Saltar a la palabra "${word}"`}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA: Controles de Reproducción Armoniosos */}
              <div className="md:col-span-5 flex flex-col justify-between h-full min-h-0 border-t md:border-t-0 md:border-l border-thea-border/40 md:pl-5 pt-3 md:pt-0 space-y-3">
                {/* 1. Scrubber Line */}
                <div className="w-full">
                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono mb-1 tabular-nums">
                    <span className={`font-semibold text-xs ${
                      theme === 'dark' ? 'text-zinc-100' : 'text-zinc-950 font-bold'
                    }`}>{currentTimeDisplay}</span>
                    <span className={`font-medium font-sans ${
                      theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
                    }`}>
                      Segmento {currentLineIndex + 1} de {podcast.dialogue.length}
                    </span>
                    <span className={theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}>{podcast.duration}</span>
                  </div>

                  <div className="relative flex items-center group py-1.5">
                    <div className={`w-full h-1.5 group-hover:h-2 rounded-full overflow-hidden transition-all duration-150 relative ${
                      theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'
                    }`}>
                      <div
                        className={`h-full rounded-full ${
                          theme === 'kitty'
                            ? 'bg-gradient-to-r from-pink-500 via-rose-400 to-pink-300'
                            : 'bg-gradient-to-r from-violet-500 via-indigo-500 to-zinc-200'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border border-zinc-300 shadow-md transition-transform group-hover:scale-125 pointer-events-none"
                      style={{ left: `${progressPercent}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      step={1}
                      value={Math.round(progressPercent * 10)}
                      onPointerDown={handleProgressPointerDown}
                      onChange={(e) => handleProgressChange(Number(e.target.value))}
                      onPointerUp={handleProgressPointerUp}
                      onKeyUp={handleProgressPointerUp}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      title="Arrastra para avanzar o retroceder suavemente en el podcast"
                    />
                  </div>
                </div>

                {/* 2. Botones Primarios de Reproducción */}
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleRestart}
                    className={`p-2 rounded-xl border transition-colors cursor-pointer active:scale-95 ${
                      theme === 'dark'
                        ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-400 hover:text-white'
                        : theme === 'kitty'
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                    title="Reiniciar podcast desde el principio"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipBackward}
                    disabled={currentLineIndex === 0}
                    className={`p-2 rounded-xl border transition-colors cursor-pointer active:scale-95 disabled:opacity-30 ${
                      theme === 'dark'
                        ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-400 hover:text-white'
                        : theme === 'kitty'
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                    title="Atrasar al segmento anterior"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSkipSeconds(-10)}
                    disabled={currentPlaybackSecs <= 0}
                    className={`px-2 py-1 rounded-xl border transition-all cursor-pointer flex items-center gap-0.5 font-semibold text-xs font-mono tabular-nums active:scale-95 disabled:opacity-30 ${
                      theme === 'dark'
                        ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300 hover:text-white'
                        : theme === 'kitty'
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                    title="Retroceder 10 segundos"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>-10s</span>
                  </button>

                  {/* Play / Pausa Botón Central */}
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className={`w-11 h-11 sm:w-13 sm:h-13 rounded-2xl active:scale-95 transition-transform duration-150 shadow-xl flex items-center justify-center font-bold cursor-pointer shrink-0 ${
                      theme === 'kitty'
                        ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/25'
                        : theme === 'light'
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25'
                        : 'bg-white hover:bg-zinc-200 text-zinc-950'
                    }`}
                    title={isPlaying ? 'Pausar' : 'Reproducir'}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSkipSeconds(10)}
                    disabled={currentPlaybackSecs >= totalDurationSecs}
                    className={`px-2 py-1 rounded-xl border transition-all cursor-pointer flex items-center gap-0.5 font-semibold text-xs font-mono tabular-nums active:scale-95 disabled:opacity-30 ${
                      theme === 'dark'
                        ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300 hover:text-white'
                        : theme === 'kitty'
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                    title="Adelantar 10 segundos"
                  >
                    <span>+10s</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipForward}
                    disabled={currentLineIndex >= podcast.dialogue.length - 1}
                    className={`p-2 rounded-xl border transition-colors cursor-pointer active:scale-95 disabled:opacity-30 ${
                      theme === 'dark'
                        ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-400 hover:text-white'
                        : theme === 'kitty'
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                    title="Adelantar al siguiente segmento"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* 3. Controles Secundarios: Silenciar y Velocidad */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-thea-border/40">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-colors cursor-pointer text-xs active:scale-95 ${
                      isMuted
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                        : theme === 'dark'
                        ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-zinc-400 hover:text-white'
                        : theme === 'kitty'
                        ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-900 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-xs'
                    }`}
                    title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
                  >
                    {isMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[11px] font-medium">{isMuted ? 'Mudo' : 'Sonido'}</span>
                  </button>

                  <div className={`flex items-center gap-0.5 rounded-xl p-0.5 text-xs border ${
                    theme === 'dark' ? 'bg-white/[0.025] border-white/[0.08]' : theme === 'kitty' ? 'bg-pink-50 border-pink-200' : 'bg-slate-100 border-slate-200'
                  }`}>
                    {speeds.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSpeedChange(s)}
                        className={`px-1.5 sm:px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer text-[10px] sm:text-xs tabular-nums active:scale-95 ${
                          playbackSpeed === s
                            ? theme === 'kitty'
                              ? 'bg-pink-500 text-white shadow-sm'
                              : theme === 'light'
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'bg-white text-zinc-950 shadow-sm'
                            : theme === 'dark'
                            ? 'text-zinc-400 hover:text-white'
                            : 'text-slate-600 hover:text-zinc-950'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto modal-smooth-scroll">
          <PodcastTranscriptView
            dialogue={podcast.dialogue}
            currentLineIndex={currentLineIndex}
            onSelectLine={(idx) => {
              handleSeek(idx);
              setIsPlaying(true);
              setActiveTab('player');
            }}
          />
        </div>
      )}

      {renderVoiceModal()}
      {renderConfirmReplaceModal()}
    </div>
  );
};
