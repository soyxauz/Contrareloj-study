import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { StudyKit, PodcastFormat, PodcastDuration } from '../types';
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
  ChevronLeft,
  ChevronRight,
  Settings2,
  Check,
  X,
  AlertTriangle,
  Trash2,
  Clock,
  BookOpen,
  Zap,
  Award,
  MessageSquare,
  RefreshCw,
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

export const PODCAST_FORMAT_OPTIONS: {
  id: PodcastFormat;
  title: string;
  description: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}[] = [
  {
    id: 'detailed',
    title: 'Información detallada',
    description: 'Una animada conversación entre dos presentadores que analizan y conectan temas de tus fuentes.',
    badge: 'Recomendado',
    icon: BookOpen,
    accentColor: 'amber',
  },
  {
    id: 'brief',
    title: 'Breve',
    description: 'Un resumen breve que sirve para que captes rápidamente las ideas principales de tus fuentes.',
    badge: 'Rápido',
    icon: Zap,
    accentColor: 'blue',
  },
  {
    id: 'critique',
    title: 'Crítica',
    description: 'Una revisión experta de tus fuentes, con comentarios constructivos para ayudarte a mejorar tu material.',
    badge: 'Evaluación',
    icon: Award,
    accentColor: 'rose',
  },
  {
    id: 'debate',
    title: 'Debate',
    description: 'Un debate reflexivo entre dos presentadores que arroja luz sobre diferentes perspectivas de tus fuentes.',
    badge: 'Perspectivas',
    icon: MessageSquare,
    accentColor: 'violet',
  },
];

export const PODCAST_DURATION_OPTIONS: {
  id: PodcastDuration;
  title: string;
  subtitle: string;
  detail: string;
}[] = [
  {
    id: 'short',
    title: 'Corto',
    subtitle: '-2 minutos',
    detail: '6 a 8 turnos rápidos (~200 palabras), ideal para un repaso ultra rápido.',
  },
  {
    id: 'normal',
    title: 'Normal',
    subtitle: '4 a 6 minutos',
    detail: '14 a 18 turnos equilibrados (~700 palabras), análisis completo del tema.',
  },
  {
    id: 'long',
    title: 'Largo',
    subtitle: '10 a 30 minutos',
    detail: 'Explicación exhaustiva y profunda (10 a 30 min, hasta 43 min máx). Desglose paso a paso sin bajar de 10 min.',
  },
];

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
      ? '¡Hola! Soy Sofía en Contrareloj Study. ¡Me alegra mucho que estemos repasando juntos hoy!'
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

  const renderConfirmReplaceModal = () => {
    if (!showConfirmReplaceModal) return null;
    const formatObj = PODCAST_FORMAT_OPTIONS.find((f) => f.id === selectedFormat);
    const durationObj = PODCAST_DURATION_OPTIONS.find((d) => d.id === selectedDuration);

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
        <div className="bg-thea-surface border border-rose-500/40 rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-4 relative mb-14 sm:mb-0">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-white mb-2">
              ¿Reemplazar y generar nuevo episodio?
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Se eliminará el episodio de podcast actual y todo su audio precalculado para generar un nuevo episodio con formato{' '}
              <span className="text-amber-300 font-bold">{formatObj?.title || 'Personalizado'}</span> y duración{' '}
              <span className="text-violet-300 font-bold">{durationObj?.subtitle || 'Normal'}</span>.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowConfirmReplaceModal(false)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={async () => {
                setShowConfirmReplaceModal(false);
                setShowVoiceModal(false);
                await handleGeneratePodcast({
                  format: selectedFormat,
                  duration: selectedDuration,
                  orientation: orientationInput,
                  isReplacement: true,
                });
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 text-xs font-black transition-all shadow-lg shadow-rose-950/40 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Sí, reemplazar</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderVoiceModal = () => {
    if (!showVoiceModal) return null;
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
              onClick={handleCloseVoiceModal}
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
                setVoiceModalTab('azure');
                handleSwitchEngine('edge');
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
                setVoiceModalTab('browser');
                handleSwitchEngine('browser');
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
              onClick={() => setVoiceModalTab('new_episode')}
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
                            setEdgeSofiaVoice(v.id);
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
                              onClick={(e) => previewAzureVoiceSample(e, v)}
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
                            setEdgeMateoVoice(v.id);
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
                              onClick={(e) => previewAzureVoiceSample(e, v)}
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
                          setLocalSofiaVoice('');
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
                        setLocalSofiaVoice('');
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
                          onClick={(e) => previewAutomaticLocalSample(e, 'female')}
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
                            setLocalSofiaVoice(v.name);
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
                              onClick={(e) => previewLocalVoice(e, v, 'female')}
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
                          setLocalMateoVoice('');
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
                        setLocalMateoVoice('');
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
                          onClick={(e) => previewAutomaticLocalSample(e, 'male')}
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
                            setLocalMateoVoice(v.name);
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
                              onClick={(e) => previewLocalVoice(e, v, 'male')}
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
                          onClick={() => setSelectedFormat(f.id)}
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
                          onClick={() => setSelectedDuration(d.id)}
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
                      onClick={() => setOrientationInput('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
                      className="px-2 py-0.5 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[10px] text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      Examen riguroso
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientationInput('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
                      className="px-2 py-0.5 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[10px] text-slate-300 hover:text-violet-300 transition-colors cursor-pointer"
                    >
                      Debate ameno
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientationInput('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
                      className="px-2 py-0.5 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[10px] text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      Explicación pedagógica
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={orientationInput}
                    onChange={(e) => setOrientationInput(e.target.value)}
                    placeholder="Instrucciones adicionales para la IA en este nuevo episodio..."
                    className="w-full bg-thea-bg border border-thea-border rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed font-sans"
                  />
                </div>

                {/* Botones de Acción */}
                <div className="pt-3 border-t border-thea-border flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleCloseVoiceModal}
                    className="px-4 py-2 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowConfirmReplaceModal(true)}
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
                      onClick={() => testVoiceSample('sofia')}
                      className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-amber-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                    >
                      {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                      <span>Probar Sofía</span>
                    </button>

                    <button
                      type="button"
                      disabled={isTestingVoice}
                      onClick={() => testVoiceSample('mateo')}
                      className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-violet-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                    >
                      {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-violet-400" />}
                      <span>Probar Mateo</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseVoiceModal}
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

  const speeds = [0.75, 1, 1.25, 1.5, 2];

  if (!podcast || !podcast.dialogue || podcast.dialogue.length === 0) {
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
                    onClick={() => setSelectedFormat(f.id)}
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
                    onClick={() => setSelectedDuration(d.id)}
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
                onClick={() => setOrientationInput('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
                className="px-2.5 py-1 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Examen riguroso
              </button>
              <button
                type="button"
                onClick={() => setOrientationInput('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
                className="px-2.5 py-1 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs text-slate-300 hover:text-violet-300 transition-colors cursor-pointer"
              >
                Debate ameno
              </button>
              <button
                type="button"
                onClick={() => setOrientationInput('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
                className="px-2.5 py-1 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                Explicación pedagógica
              </button>
            </div>

            <textarea
              rows={2}
              value={orientationInput}
              onChange={(e) => setOrientationInput(e.target.value)}
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
              onClick={() => {
                setVoiceModalTab(voiceEngine === 'edge' ? 'azure' : 'browser');
                setShowVoiceModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Settings2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Configurar Voces</span>
            </button>
          </div>

          {/* BOTÓN PRINCIPAL DE GENERACIÓN */}
          <div className="pt-3">
            <button
              onClick={() => handleGeneratePodcast()}
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

        {renderVoiceModal()}
        {renderConfirmReplaceModal()}
      </div>
    );
  }

  if (!currentItem) return null;
  const speakerAcoustics = getSpeakerAcoustics(currentItem.speaker, currentItem.text);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-2 sm:pt-6 pb-32 sm:pb-12 animate-fadeIn">
      {/* Badge Header & Controls Bar */}
      <div className="mb-4 sm:mb-6 pb-3 sm:pb-6 border-b border-thea-border">
        {/* Fila 1: Título y Selector de Pestañas */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
              <span className="text-[10px] sm:text-xs uppercase font-extrabold px-1.5 sm:px-2 py-0.5 rounded bg-violet-600 text-white shrink-0">
                PODCAST EDUCATIVO
              </span>
              <span className="text-[11px] sm:text-xs text-slate-400 font-medium truncate hidden sm:inline">
                Recap de audio con síntesis vocal emotiva
              </span>
            </div>
            <h1 className="text-base sm:text-2xl font-bold text-white flex items-center gap-1.5 sm:gap-2 truncate">
              <Headphones className="w-4 h-4 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
              <span className="truncate">Contrareloj Review Podcast</span>
            </h1>
          </div>

          {/* Selector de Pestañas [Reproductor | Transcripción] */}
          <div className="flex items-center gap-1 bg-thea-surface border border-thea-border rounded-xl p-1 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('player')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium transition-all cursor-pointer text-xs ${
                activeTab === 'player' ? 'bg-violet-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reproductor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transcript')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium transition-all cursor-pointer text-xs ${
                activeTab === 'transcript' ? 'bg-violet-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Transcripción
            </button>
          </div>
        </div>

        {/* Fila 2: Motor de Voz y Acciones */}
        <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-thea-border/40 flex items-center justify-between gap-2 flex-wrap">
          {/* Selector de Motor de Voz Dinámico (Azure Neural vs Sistema) */}
          <div className="flex items-center bg-thea-surface border border-thea-border rounded-xl p-0.5 text-xs gap-0.5">
            <button
              type="button"
              onClick={() => handleSwitchEngine('edge')}
              className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer text-[11px] sm:text-xs ${
                voiceEngine === 'edge'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Azure Neural: Voces oficiales de Microsoft Azure."
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Azure Neural</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchEngine('browser')}
              className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer text-[11px] sm:text-xs ${
                voiceEngine === 'browser'
                  ? 'bg-violet-600/20 border border-violet-500/40 text-violet-300 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Voz del Sistema: Síntesis local offline del navegador"
            >
              <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
              className="p-1.5 sm:p-2 rounded-xl bg-thea-surface border border-thea-border text-slate-400 hover:text-amber-300 hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              title="Configuración de Voces, Locutores y Enfoque"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceModalTab('new_episode');
                setShowVoiceModal(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-violet-500/20 hover:from-amber-500/30 hover:to-violet-500/30 border border-amber-500/30 hover:border-amber-400/50 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Crear un nuevo episodio con otras configuraciones de formato y duración"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Nuevo Episodio</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'player' ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Main Visual Player Card */}
          <div className="bg-gradient-to-b from-thea-surface to-thea-bg border border-thea-border rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl relative overflow-hidden text-center">
            {/* Background Glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

            {/* Episode Title */}
            <div className="relative z-10 mb-3 sm:mb-6">
              <div className="flex items-center justify-center gap-1.5 mb-1.5 sm:mb-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-bold text-violet-400 uppercase tracking-wider">
                  REPASO DE AUDIO DINÁMICO
                </span>
                {podcast.format && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
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
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                    {podcast.durationMode === 'short'
                      ? 'Corto (-2 min)'
                      : podcast.durationMode === 'normal'
                      ? 'Normal (4-6 min)'
                      : 'Largo (10-30 min)'}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-white mb-1 sm:mb-2 leading-snug">
                {podcast.title}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Duración: {podcast.duration} • Generado a partir de tus materiales
              </p>
            </div>

            {/* Host Cards */}
            <div className="flex justify-center items-center gap-4 sm:gap-6 mb-3 sm:mb-6 relative z-10">
              {podcast.hosts.map((host, idx) => {
                const isCurrentHostSpeaking =
                  isPlaying &&
                  isAudioActive &&
                  currentItem.speaker.toLowerCase().includes(host.name.split(' ')[0].toLowerCase());

                return (
                  <div key={idx} className="flex flex-col items-center">
                    <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-thea-surfaceLight border-2 flex items-center justify-center font-bold text-base sm:text-xl text-violet-300 shadow-xl transition-all duration-300 relative ${
                      isCurrentHostSpeaking
                        ? 'border-amber-400 ring-4 ring-amber-400/20 scale-105 shadow-amber-500/20'
                        : 'border-thea-border opacity-70'
                    }`}>
                      {host.name.charAt(0)}
                      {isCurrentHostSpeaking && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[11px] sm:text-xs font-bold text-white mt-1.5">{host.name}</span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400">{host.role}</span>
                  </div>
                );
              })}
            </div>

            {/* Animated Audio Equalizer Waveform */}
            <div className="flex items-center justify-center gap-1 sm:gap-1.5 h-7 sm:h-12 mb-3 sm:mb-6 relative z-10">
              {[12, 28, 45, 60, 32, 50, 75, 90, 65, 40, 20, 55, 80, 45, 30, 65, 85, 50, 35, 70, 40, 25].map((height, i) => (
                <div
                  key={i}
                  style={{
                    height: isPlaying && isAudioActive
                      ? `${Math.max(20, Math.min(100, height * (Math.sin(i * 0.8 + currentLineIndex * 2) + 1.2) * 0.6))}%`
                      : '15%',
                  }}
                  className={`w-1 sm:w-1.5 rounded-full transition-all duration-300 ${
                    isPlaying && isAudioActive ? 'bg-gradient-to-t from-violet-500 to-amber-400' : 'bg-thea-border'
                  }`}
                />
              ))}
            </div>

            {/* Alerta visible si la síntesis de voz experimenta un error */}
            {synthesisError && (
              <div className="mb-3 max-w-2xl mx-auto px-3.5 py-2.5 rounded-xl sm:rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg animate-fadeIn">
                <span className="flex-1 leading-relaxed font-medium text-left">
                  {synthesisError}
                </span>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowVoiceModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-thea-surfaceLight border border-amber-500/40 text-amber-300 hover:text-white font-semibold transition-all cursor-pointer text-xs"
                  >
                    Ajustes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSynthesisError(null);
                      handleTogglePlay();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all cursor-pointer text-xs"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {/* Current Active Dialogue Bubble */}
            <div className="bg-thea-surfaceLight/80 backdrop-blur border border-thea-border rounded-xl sm:rounded-2xl p-3.5 sm:p-5 mb-3 sm:mb-6 max-w-2xl mx-auto shadow-inner text-left relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                  <Volume2 className={`w-3.5 h-3.5 ${isAudioActive ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
                  {currentItem.speaker}
                </span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {voiceEngine === 'edge' ? (
                    isSynthesizing ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center gap-1 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="hidden sm:inline">Sintetizando voz neuronal...</span>
                        <span className="sm:hidden">Sintetizando...</span>
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-600/25 border border-cyan-500/35 text-cyan-300 flex items-center gap-1 font-medium">
                        <Headphones className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="hidden sm:inline">Azure Neural ({/(sofia|chica|mujer|host\b|estudiante)/i.test(currentItem.speaker) ? (AZURE_EDGE_VOICES.find(v => v.id === edgeSofiaVoice)?.name || 'Elvira') : (AZURE_EDGE_VOICES.find(v => v.id === edgeMateoVoice)?.name || 'Álvaro')})</span>
                        <span className="sm:hidden">Azure ({/(sofia|chica|mujer|host\b|estudiante)/i.test(currentItem.speaker) ? (AZURE_EDGE_VOICES.find(v => v.id === edgeSofiaVoice)?.name.replace(' Neural', '') || 'Elvira') : (AZURE_EDGE_VOICES.find(v => v.id === edgeMateoVoice)?.name.replace(' Neural', '') || 'Álvaro')})</span>
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 font-medium">
                      <Headphones className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate max-w-[100px] sm:max-w-none">{speakerAcoustics.voiceName}</span>
                    </span>
                  )}
                  <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono">
                    {currentItem.time}
                  </span>
                </div>
              </div>
              <div className="text-xs sm:text-base font-medium leading-relaxed flex flex-wrap gap-x-1.5 gap-y-1 select-none max-h-24 sm:max-h-36 overflow-y-auto pr-1">
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
                        isCurrent
                          ? 'text-white font-bold'
                          : isPast
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-500 hover:text-white'
                      }`}
                      title={`Saltar a la palabra "${word}"`}
                    >
                      {word}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* ── LÍNEA DE TIEMPO INTERACTIVA ULTRA-FLUIDA (SMOOTH SCRUBBER) ── */}
            <div className="max-w-2xl mx-auto mb-3 sm:mb-6 px-1 sm:px-2 relative z-10">
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono text-slate-400 mb-1.5 sm:mb-2.5">
                <span className="font-semibold text-amber-400 text-xs sm:text-sm">{currentTimeDisplay}</span>
                <span className="text-slate-300 font-medium text-[11px] sm:text-xs font-sans">
                  Segmento {currentLineIndex + 1} de {podcast.dialogue.length}
                </span>
                <span className="text-slate-400">{podcast.duration}</span>
              </div>

              {/* Slider interactivo suave a 60fps con track visual y perla dorada */}
              <div className="relative flex items-center group py-2">
                {/* Pista de fondo con glow sutil */}
                <div className="w-full h-2 group-hover:h-2.5 bg-slate-800/90 rounded-full overflow-hidden transition-all duration-150 relative">
                  {/* Pista de relleno suave con gradiente ámbar */}
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Thumb perla brillante deslizante */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/60 transition-transform group-hover:scale-125 pointer-events-none"
                  style={{ left: `${progressPercent}%` }}
                />

                {/* Input nativo transparente para control táctil y ratón con 1000 pasos */}
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

            {/* Controles de Reproducción y Navegación en 2 Filas */}
            <div className="max-w-2xl mx-auto space-y-2.5 sm:space-y-3 relative z-10">
              {/* Fila 1: Botones Primarios de Reproducción */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-3">
                {/* Reiniciar */}
                <button
                  type="button"
                  onClick={handleRestart}
                  className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Reiniciar podcast desde el principio"
                >
                  <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Segmento Anterior */}
                <button
                  type="button"
                  onClick={handleSkipBackward}
                  disabled={currentLineIndex === 0}
                  className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                  title="Atrasar al segmento anterior"
                >
                  <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Retroceder 10 Segundos */}
                <button
                  type="button"
                  onClick={() => handleSkipSeconds(-10)}
                  disabled={currentPlaybackSecs <= 0}
                  className="px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl sm:rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-amber-400 hover:border-amber-400/40 disabled:opacity-30 transition-all cursor-pointer flex items-center gap-1 font-bold text-xs font-mono"
                  title="Retroceder 10 segundos"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  <span>-10s</span>
                </button>

                {/* Play / Pausa Botón Central */}
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-amber-500 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-violet-900/40 flex items-center justify-center text-white font-bold cursor-pointer shrink-0"
                  title={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 sm:w-7 sm:h-7 fill-white" />
                  ) : (
                    <Play className="w-5 h-5 sm:w-7 sm:h-7 fill-white ml-0.5" />
                  )}
                </button>

                {/* Adelantar 10 Segundos */}
                <button
                  type="button"
                  onClick={() => handleSkipSeconds(10)}
                  disabled={currentPlaybackSecs >= totalDurationSecs}
                  className="px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl sm:rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-amber-400 hover:border-amber-400/40 disabled:opacity-30 transition-all cursor-pointer flex items-center gap-1 font-bold text-xs font-mono"
                  title="Adelantar 10 segundos"
                >
                  <span>+10s</span>
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                </button>

                {/* Segmento Siguiente */}
                <button
                  type="button"
                  onClick={handleSkipForward}
                  disabled={currentLineIndex >= podcast.dialogue.length - 1}
                  className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                  title="Adelantar al siguiente segmento"
                >
                  <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Fila 2: Controles Secundarios (Silenciar y Velocidad) */}
              <div className="flex items-center justify-between sm:justify-center gap-2 sm:gap-4 pt-2 border-t border-thea-border/40">
                {/* Mute */}
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border transition-colors cursor-pointer text-xs ${
                    isMuted
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      : 'bg-thea-surface hover:bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-white'
                  }`}
                  title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                  <span className="text-[11px] font-medium">{isMuted ? 'Mudo' : 'Sonido'}</span>
                </button>

                {/* Speed Controller */}
                <div className="flex items-center gap-0.5 sm:gap-1 bg-thea-surface border border-thea-border rounded-xl p-0.5 sm:p-1 text-xs">
                  {speeds.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSpeedChange(s)}
                      className={`px-1.5 py-1 sm:px-2.5 sm:py-1 rounded-lg font-bold transition-colors cursor-pointer text-[10px] sm:text-xs ${
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
        </div>
      ) : (
        /* Full Transcript View */
        <div className="bg-thea-surface border border-thea-border rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-thea-border">
            <h3 className="font-bold text-white text-sm sm:text-base">Transcripción Completa del Episodio</h3>
            <span className="text-xs text-amber-400 font-semibold">{podcast.dialogue.length} intervenciones</span>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {podcast.dialogue.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  handleSeek(idx);
                  setIsPlaying(true);
                  setActiveTab('player');
                }}
                className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
                  currentLineIndex === idx
                    ? 'border-amber-500/50 bg-amber-500/10 shadow-md ring-1 ring-amber-500/30'
                    : 'border-thea-border/60 bg-thea-surfaceLight/40 hover:bg-thea-surfaceLight'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-violet-300">{item.speaker}</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono">{item.time}</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {renderVoiceModal()}
      {renderConfirmReplaceModal()}
    </div>
  );
};
