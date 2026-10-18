import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Settings2,
  Check,
  X,
  ExternalLink,
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
  GEMINI_VOICES,
  getGeminiAudioApiKey,
  synthesizeGeminiSpeech,
  prefetchGeminiSpeech,
  preloadEntirePodcast,
  getPodcastSettings,
  savePodcastSettings,
} from '../services/geminiAudioService';
import {
  AZURE_EDGE_VOICES,
  type AzureEdgeVoiceOption,
  synthesizeAzureEdgeSpeech,
  prefetchAzureEdgeSpeech,
  preloadEntireAzurePodcast,
} from '../services/azureEdgeTtsService';
import { googleDriveService } from '../services/googleDriveService';

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

  // Motor de voz: 'gemini' (Flash Audio AI) | 'edge' (Natural HD / Local) | 'browser' (Local)
  const [voiceEngine, setVoiceEngine] = useState<'gemini' | 'edge' | 'browser'>(() => {
    const ps = getPodcastSettings();
    if (ps.voiceEngine) return ps.voiceEngine;
    return getGeminiAudioApiKey() ? 'gemini' : 'edge';
  });
  const [sofiaVoice, setSofiaVoice] = useState<string>(() => getPodcastSettings().sofiaVoice || 'Aoede');
  const [mateoVoice, setMateoVoice] = useState<string>(() => getPodcastSettings().mateoVoice || 'Puck');
  const [edgeSofiaVoice, setEdgeSofiaVoice] = useState<string>(() => getPodcastSettings().edgeSofiaVoice || 'es-ES-ElviraNeural');
  const [edgeMateoVoice, setEdgeMateoVoice] = useState<string>(() => getPodcastSettings().edgeMateoVoice || 'es-ES-AlvaroNeural');
  const [localSofiaVoice, setLocalSofiaVoice] = useState<string>(() => getPodcastSettings().localSofiaVoice || '');
  const [localMateoVoice, setLocalMateoVoice] = useState<string>(() => getPodcastSettings().localMateoVoice || '');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [orientationInput, setOrientationInput] = useState<string>(() => getPodcastSettings().orientation || '');
  const [orientationSavedFeedback, setOrientationSavedFeedback] = useState(false);
  const [noKeyWarning, setNoKeyWarning] = useState(false);
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

  // Estados y referencias para navegación granular palabra por palabra
  const [currentWordIndexInSegment, setCurrentWordIndexInSegment] = useState(initialPosition.wordIndexInSegment);
  const [currentGlobalWordIndex, setCurrentGlobalWordIndex] = useState(initialPosition.globalIndex);
  const currentWordIndexRef = useRef(initialPosition.wordIndexInSegment);
  const currentGlobalWordIndexRef = useRef(initialPosition.globalIndex);
  const speakDialogueLineRef = useRef<((index: number, startWordIdx?: number) => void) | null>(null);

  // Control de arrastre y desplazamiento del scrubber (evita saltos y bucles de retroceso)
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const isAudioSeekingRef = useRef(false);
  const loadedAudioSegmentRef = useRef<number>(-1);
  const preloadedNextAudioRef = useRef<{ index: number; audio: HTMLAudioElement } | null>(null);

  // Helper síncrono para mantener estado y referencias siempre alineados en el mismo tick
  const setWordPosition = useCallback((globalIdx: number, segIdx: number, wordInSegIdx: number) => {
    currentGlobalWordIndexRef.current = globalIdx;
    currentWordIndexRef.current = wordInSegIdx;
    currentLineIndexRef.current = segIdx;

    setCurrentGlobalWordIndex(globalIdx);
    setCurrentWordIndexInSegment(wordInSegIdx);
    setCurrentLineIndex(segIdx);

    try {
      localStorage.setItem(`thea_podcast_pos_${kit.id}`, JSON.stringify({
        lineIndex: segIdx,
        wordIndexInSegment: wordInSegIdx,
        globalIndex: globalIdx,
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
      if (fresh.voiceEngine) setVoiceEngine(fresh.voiceEngine);
      if (fresh.sofiaVoice) setSofiaVoice(fresh.sofiaVoice);
      if (fresh.mateoVoice) setMateoVoice(fresh.mateoVoice);
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

  // Si el usuario cambia de pestaña en el navegador web o minimiza la ventana
  useEffect(() => {
    const handleVisibilityOrHide = () => {
      if (document.visibilityState === 'hidden') {
        if (isPlayingRef.current) {
          isManualInterruptionRef.current = true;
          isPlayingRef.current = false;
          setIsPlaying(false);
          stopCurrentAudio(false);
          setTimeout(() => {
            if (isMountedRef.current) {
              isManualInterruptionRef.current = false;
            }
          }, 150);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrHide);
    window.addEventListener('pagehide', handleVisibilityOrHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
      window.removeEventListener('pagehide', handleVisibilityOrHide);
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

  // Pre-sintetizar el primer parlamento al cargar para arranque instantáneo (0ms)
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

            // Una vez que el turno 0 esté listo, precargar el turno 1
            if (podcast.dialogue[1]) {
              const secondItem = podcast.dialogue[1];
              const secondIsFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(secondItem.speaker);
              const secondVoice = secondIsFemale ? (edgeSofiaVoice || 'es-ES-ElviraNeural') : (edgeMateoVoice || 'es-ES-AlvaroNeural');
              prefetchAzureEdgeSpeech(secondItem.text, secondVoice);
            }
          }
        })
        .catch((err) => {
          console.warn('[PodcastView] Error en precarga inicial Azure Neural Turno 0:', err);
        });
    } else if (voiceEngine === 'gemini' && getGeminiAudioApiKey()) {
      const voice = isFemale ? sofiaVoice : mateoVoice;
      synthesizeGeminiSpeech(firstItem.text, voice, 'high')
        .then((url) => {
          if (isMountedRef.current) {
            const firstAudio = new Audio();
            firstAudio.preload = 'auto';
            firstAudio.src = url;
            firstAudio.load();
            preloadedNextAudioRef.current = { index: 0, audio: firstAudio };

            // Una vez que el turno 0 esté listo, precargar con baja prioridad el turno 1
            if (podcast.dialogue[1]) {
              const secondItem = podcast.dialogue[1];
              const secondIsFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(secondItem.speaker);
              const secondVoice = secondIsFemale ? sofiaVoice : mateoVoice;
              prefetchGeminiSpeech(secondItem.text, secondVoice, undefined, 'normal');
            }
          }
        })
        .catch((err) => {
          console.warn('[PodcastView] Error en precarga inicial Gemini Turno 0:', err);
        });
    }
  }, [podcast?.dialogue, voiceEngine, edgeSofiaVoice, edgeMateoVoice, sofiaVoice, mateoVoice]);

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

  const currentTimeDisplay = useMemo(() => {
    if (!currentItem || !podcast?.dialogue) return '0:00';
    const startSecs = parseTimeToSeconds(currentItem.time);
    const nextItem = podcast.dialogue[currentLineIndex + 1];
    const nextSecs = nextItem ? parseTimeToSeconds(nextItem.time) : startSecs + Math.max(15, currentSegmentWords.length * 0.4);
    const segDuration = Math.max(2, nextSecs - startSecs);
    const wordRatio = currentSegmentWords.length > 0 ? (currentWordIndexInSegment / currentSegmentWords.length) : 0;
    const currentSecs = Math.round(startSecs + wordRatio * segDuration);
    return formatSeconds(currentSecs);
  }, [currentItem, podcast?.dialogue, currentLineIndex, currentWordIndexInSegment, currentSegmentWords.length]);

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
      } else if (voiceEngineRef.current === 'gemini') {
        preloadEntirePodcast(podcast.dialogue, sofiaVoice, mateoVoice, nextSeg);
      }

      speakDialogueLineRef.current?.(nextSeg, 0);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsAudioActive(false);
      setWordPosition(0, 0, 0);
    }
  }, [podcast?.dialogue, segmentStartGlobalIndices, setWordPosition, edgeSofiaVoice, edgeMateoVoice, sofiaVoice, mateoVoice]);

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

  // Reproducir vocalmente una línea del diálogo con soporte para Gemini Flash Audio TTS y Fallback
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

    // Ruta 1: Motor Neuronal Azure (Edge Neural TTS) o Gemini Flash Audio
    if (voiceEngineRef.current === 'edge' || voiceEngineRef.current === 'gemini') {
      const isEdge = voiceEngineRef.current === 'edge';
      const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(item.speaker);
      const targetVoice = isEdge
        ? (isFemale ? (edgeSofiaVoice || 'es-ES-ElviraNeural') : (edgeMateoVoice || 'es-ES-AlvaroNeural'))
        : (isFemale ? sofiaVoice : mateoVoice);

      if (!isEdge) {
        const hasGeminiKey = Boolean(getGeminiAudioApiKey());
        if (!hasGeminiKey) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          setShowVoiceModal(true);
          setNoKeyWarning(true);
          return;
        }
      }

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
          if (isEdge) {
            audioUrl = await synthesizeAzureEdgeSpeech(cleanText, targetVoice);
          } else {
            audioUrl = await synthesizeGeminiSpeech(cleanText, targetVoice, 'high');
          }
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
          const nextVoice = isEdge
            ? (nextIsFemale ? (edgeSofiaVoice || 'es-ES-ElviraNeural') : (edgeMateoVoice || 'es-ES-AlvaroNeural'))
            : (nextIsFemale ? sofiaVoice : mateoVoice);

          if (isEdge) {
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
          } else {
            synthesizeGeminiSpeech(nextClean, nextVoice, 'normal')
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
                console.warn('[GeminiAudio] Error en pre-carga silenciosa del siguiente parlamento:', err);
              });
          }
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
          console.warn('[AudioPlayer] Error en reproducción de audio:', err);
          setIsAudioActive(false);
          setIsSynthesizing(false);
          setSynthesisError('Error al reproducir audio. Conmutando a voz local...');
          speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
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

        const errMsg = err instanceof Error ? err.message : String(err);
        if (isEdge) {
          setSynthesisError('Error al sintetizar con voz Azure Neural. Conmutando a voz local...');
        } else if (errMsg.includes('API_KEY_SERVICE_BLOCKED') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('403')) {
          setSynthesisError('La clave de Gemini tiene el servicio bloqueado en Google Cloud. Genera una gratis en Google AI Studio (aistudio.google.com/app/apikey). Reproduciendo con voz local...');
        } else if (errMsg.includes('429') || errMsg.includes('Cuota') || errMsg.includes('quota')) {
          setSynthesisError('Límite de cuota de Gemini alcanzado en Google. Reproduciendo con voz local optimizada...');
        } else {
          setSynthesisError('Voz neuronal no disponible. Reproduciendo con voz local...');
        }

        synthesisRetryCountRef.current = 0;
        // Garantizar que SIEMPRE suene el audio sin congelar la interfaz
        speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
        return;
      }
    }

    // Ruta 2: Motor del Navegador (SpeechSynthesis)
    speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
  }, [podcast, sofiaVoice, mateoVoice, edgeSofiaVoice, edgeMateoVoice, stopCurrentAudio, speakBrowserDialogueLine, advanceToNextLine, segmentStartGlobalIndices, setWordPosition]);

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
  const handleSwitchEngine = (newEngine: 'gemini' | 'edge' | 'browser') => {
    if (newEngine === 'gemini' && !getGeminiAudioApiKey()) {
      setShowVoiceModal(true);
      setNoKeyWarning(true);
      return;
    }
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
    } else if (voiceEngine === 'gemini') {
      const activeKey = getGeminiAudioApiKey();
      if (!activeKey) {
        setIsTestingVoice(false);
        setNoKeyWarning(true);
        return;
      }
      try {
        const voice = isSofia ? sofiaVoice : mateoVoice;
        const testUrl = await synthesizeGeminiSpeech(text, voice, activeKey);
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
        alert('Fallo al probar la voz de Gemini: ' + (msg || 'Revisa tu clave en Ajustes de IA'));
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
    if ((voiceEngineRef.current === 'gemini' || voiceEngineRef.current === 'edge') && audio && isSameLoadedSegment && audio.duration && Number.isFinite(audio.duration)) {
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

  // Control de arrastre interactivo del scrubber
  const handleScrubStart = useCallback(() => {
    isManualInterruptionRef.current = true;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    wasPlayingBeforeScrubRef.current = isPlayingRef.current;

    // Pausar temporalmente para que el audio no siga avanzando mientras el usuario arrastra
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAudioActive(false);
  }, []);

  const handleScrubChange = useCallback((targetGlobalIndex: number) => {
    if (allWords.length === 0) return;
    const safeGlobal = Math.max(0, Math.min(allWords.length - 1, targetGlobalIndex));
    const target = allWords[safeGlobal];
    if (!target) return;

    // Actualizar de forma visual e inmediata el cursor, el texto y el contador sin disparar audio
    setWordPosition(safeGlobal, target.segmentIndex, target.wordIndexInSegment);
  }, [allWords, setWordPosition]);

  const handleScrubEnd = useCallback((e?: React.SyntheticEvent | Event) => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    setIsScrubbing(false);

    let targetGlobal = currentGlobalWordIndexRef.current;
    if (e && 'target' in e && (e.target as HTMLInputElement)?.value !== undefined) {
      const inputVal = Number((e.target as HTMLInputElement).value);
      if (!isNaN(inputVal)) {
        targetGlobal = inputVal;
      }
    }

    const shouldResume = wasPlayingBeforeScrubRef.current;
    seekToGlobalWord(targetGlobal, shouldResume);
  }, [seekToGlobalWord]);

  // Listener global de pointerup para asegurar que si el usuario suelta fuera de la barra, se consolide el salto
  useEffect(() => {
    if (!isScrubbing) return;

    const onGlobalPointerUp = () => {
      handleScrubEnd();
    };

    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
    };
  }, [isScrubbing, handleScrubEnd]);

  // Avanzar o retroceder palabra por palabra
  const handleStepWord = useCallback((direction: -1 | 1) => {
    if (allWords.length === 0) return;
    const currentIdx = currentGlobalWordIndexRef.current;
    const nextGlobal = Math.max(0, Math.min(allWords.length - 1, currentIdx + direction));
    seekToGlobalWord(nextGlobal);
  }, [allWords.length, seekToGlobalWord]);

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
    if (!isPlaying || voiceEngineRef.current === 'gemini') return;
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
    setSynthesisError(null);
    synthesisRetryCountRef.current = 0;
    if (isPlaying) {
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
  };

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
    setWordPosition(0, 0, 0);

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

  const handleGeneratePodcast = async () => {
    setIsGenerating(true);
    try {
      const activeOrientation = orientationInput || getPodcastSettings().orientation;
      const generated = await generateAIPodcast(
        kit.sourceText || kit.description,
        kit.title,
        kit.category,
        activeOrientation
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
        } else if (voiceEngine === 'gemini' && getGeminiAudioApiKey()) {
          const voice = isFemale ? sofiaVoice : mateoVoice;
          synthesizeGeminiSpeech(firstItem.text, voice, 'high')
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
                  const secondVoice = secondIsFemale ? sofiaVoice : mateoVoice;
                  prefetchGeminiSpeech(secondItem.text, secondVoice, undefined, 'normal');
                }
              }
            })
            .catch(() => {});
        }
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

  const handleCloseVoiceModal = () => {
    stopCurrentAudio(true);
    setIsTestingVoice(false);
    setShowVoiceModal(false);
    setNoKeyWarning(false);
    const updated = savePodcastSettings({ orientation: orientationInput.trim() });
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
    }
  };

  if (!currentItem) return null;
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

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Selector de Motor de Voz Dinámico (Azure Neural vs Gemini vs Sistema) */}
          <div className="flex items-center bg-thea-surface border border-thea-border rounded-xl p-1 text-xs gap-1">
            <button
              type="button"
              onClick={() => handleSwitchEngine('edge')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                voiceEngine === 'edge'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Azure Neural: Voces oficiales de Microsoft Azure (Elvira y Álvaro). 100% gratis, sin claves ni límites."
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-400" />
              <span>Azure Neural (Gratis)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchEngine('gemini')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                voiceEngine === 'gemini'
                  ? 'bg-gradient-to-r from-amber-500/25 to-violet-600/30 border border-amber-500/40 text-amber-300 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Voz IA Gemini: Estudio con emociones y prosodia humana de Google Flash Audio"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Voz IA Gemini</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchEngine('browser')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                voiceEngine === 'browser'
                  ? 'bg-violet-600/20 border border-violet-500/40 text-violet-300 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Voz del Sistema: Síntesis local offline del navegador"
            >
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Voz Local</span>
            </button>

            <button
              type="button"
              onClick={() => setShowVoiceModal(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-thea-surfaceLight transition-colors cursor-pointer ml-0.5"
              title="Configuración de Voces, Locutores y Enfoque"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Selector de Pestañas */}
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

            {/* Alerta visible si la cuota de la API de Gemini está temporalmente ocupada */}
            {synthesisError && (
              <div className="mb-4 max-w-2xl mx-auto px-4 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg animate-fadeIn">
                <span className="flex-1 leading-relaxed font-medium">
                  {synthesisError}{' '}
                  {synthesisError.includes('aistudio.google.com') && (
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-amber-200 hover:text-white"
                    >
                      Crear clave en AI Studio
                    </a>
                  )}
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
            <div className="bg-thea-surfaceLight/80 backdrop-blur border border-thea-border rounded-2xl p-5 mb-6 max-w-2xl mx-auto shadow-inner text-left relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                  <Volume2 className={`w-3.5 h-3.5 ${isAudioActive ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
                  {currentItem.speaker}
                </span>
                <div className="flex items-center gap-2">
                  {voiceEngine === 'gemini' ? (
                    isSynthesizing ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Sintetizando voz emocional...
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-violet-600/25 border border-amber-500/35 text-amber-300 flex items-center gap-1 font-medium">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Gemini Neural ({/(sofia|chica|mujer|host\b|estudiante)/i.test(currentItem.speaker) ? sofiaVoice : mateoVoice})
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 font-medium">
                      <Headphones className="w-3 h-3 text-emerald-400" />
                      {speakerAcoustics.voiceName}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 font-mono">
                    {currentItem.time}
                  </span>
                </div>
              </div>
              <div className="text-sm sm:text-base font-medium leading-relaxed flex flex-wrap gap-x-1.5 gap-y-1 select-none">
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

            {/* ── LÍNEA DE TIEMPO INTERACTIVA (SCRUBBER PALABRA POR PALABRA) ── */}
            <div className="max-w-2xl mx-auto mb-6 px-2 relative z-10">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span className="font-semibold text-amber-400">{currentTimeDisplay}</span>
                <div className="flex items-center gap-1.5 text-[11px] font-sans">
                  <span className="text-slate-300 font-medium">
                    Segmento {currentLineIndex + 1}/{podcast.dialogue.length}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-300 font-semibold">
                    Palabra {Math.min(currentSegmentWords.length, currentWordIndexInSegment + 1)} de {currentSegmentWords.length}
                  </span>
                  <span className="text-slate-600 hidden sm:inline">•</span>
                  <span className="text-slate-500 text-[10px] hidden sm:inline">
                    ({currentGlobalWordIndex + 1} de {allWords.length} totales)
                  </span>
                </div>
                <span>{podcast.duration}</span>
              </div>

              {/* Slider interactivo con resolución exacta palabra por palabra */}
              <div className="relative flex items-center group">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, allWords.length - 1)}
                  value={currentGlobalWordIndex}
                  onPointerDown={handleScrubStart}
                  onChange={(e) => handleScrubChange(Number(e.target.value))}
                  onPointerUp={handleScrubEnd}
                  onKeyUp={handleScrubEnd}
                  className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none transition-[height] group-hover:h-3"
                  title="Arrastra para navegar con precisión palabra por palabra en el episodio"
                />
              </div>
            </div>

            {/* Controles de Reproducción y Navegación */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 relative z-10 flex-wrap">
              {/* Reiniciar */}
              <button
                type="button"
                onClick={handleRestart}
                className="p-2.5 sm:p-3 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Reiniciar podcast desde el principio"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Segmento Anterior */}
              <button
                type="button"
                onClick={handleSkipBackward}
                disabled={currentLineIndex === 0}
                className="p-2.5 sm:p-3 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                title="Atrasar al segmento anterior"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Retroceder 1 Palabra */}
              <button
                type="button"
                onClick={() => handleStepWord(-1)}
                disabled={currentGlobalWordIndex === 0}
                className="px-2.5 py-2.5 sm:px-3 sm:py-2.5 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-amber-400 hover:border-amber-400/40 disabled:opacity-30 transition-all cursor-pointer flex items-center gap-1 font-bold text-xs"
                title="Retroceder 1 palabra"
              >
                <ChevronLeft className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Palabra</span>
              </button>

              {/* Play / Pausa */}
              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-amber-500 hover:scale-105 transition-all shadow-xl shadow-violet-900/40 flex items-center justify-center text-white font-bold cursor-pointer"
                title={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-white" /> : <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-white ml-0.5" />}
              </button>

              {/* Adelantar 1 Palabra */}
              <button
                type="button"
                onClick={() => handleStepWord(1)}
                disabled={currentGlobalWordIndex >= allWords.length - 1}
                className="px-2.5 py-2.5 sm:px-3 sm:py-2.5 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-amber-400 hover:border-amber-400/40 disabled:opacity-30 transition-all cursor-pointer flex items-center gap-1 font-bold text-xs"
                title="Adelantar 1 palabra"
              >
                <span className="hidden sm:inline">Palabra</span>
                <ChevronRight className="w-4 h-4 text-amber-400" />
              </button>

              {/* Segmento Siguiente */}
              <button
                type="button"
                onClick={handleSkipForward}
                disabled={currentLineIndex >= podcast.dialogue.length - 1}
                className="p-2.5 sm:p-3 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                title="Adelantar al siguiente segmento"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Mute */}
              <button
                type="button"
                onClick={handleToggleMute}
                className={`p-2.5 sm:p-3 rounded-2xl border transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    : 'bg-thea-surface hover:bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-white'
                }`}
                title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
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

      {/* Modal de Configuración de Voces Gemini con Emociones */}
      {/* Modal de Configuración de Voces (Edge Natural HD, Gemini y Local) */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-7 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative text-left">
            <div className="flex items-center justify-between pb-4 border-b border-thea-border mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                  voiceEngine === 'edge'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : voiceEngine === 'gemini'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-violet-600/20 border-violet-500/40 text-violet-400'
                }`}>
                  {voiceEngine === 'edge' ? <Headphones className="w-5 h-5" /> : voiceEngine === 'gemini' ? <Sparkles className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Configuración de Voces y Locutores</h3>
                  <p className="text-xs text-slate-400">Personaliza el motor acústico para Sofía y Mateo</p>
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

            {/* Pestañas de Selección de Motor de Síntesis */}
            <div className="grid grid-cols-3 gap-2 p-1.5 bg-thea-surfaceLight/80 border border-thea-border rounded-2xl mb-4">
              <button
                type="button"
                onClick={() => handleSwitchEngine('edge')}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  voiceEngine === 'edge'
                    ? 'bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Headphones className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <div className="font-bold">Azure Neural</div>
                  <div className="text-[10px] font-normal text-emerald-400/90">Voces Oficiales • Gratis</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchEngine('gemini')}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  voiceEngine === 'gemini'
                    ? 'bg-gradient-to-r from-amber-500/25 to-violet-600/30 border border-amber-500/50 text-amber-300 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="text-left">
                  <div className="font-bold">Gemini Flash</div>
                  <div className="text-[10px] font-normal text-amber-400/90">Emociones IA Google</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchEngine('browser')}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  voiceEngine === 'browser'
                    ? 'bg-violet-600/25 border border-violet-500/50 text-violet-300 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Volume2 className="w-4 h-4 text-violet-400 shrink-0" />
                <div className="text-left">
                  <div className="font-bold">Voces Locales</div>
                  <div className="text-[10px] font-normal text-violet-400/90">Navegador offline</div>
                </div>
              </button>
            </div>

            <div className="space-y-4">
              {/* VISTA 1: VOCES ORIGINALES DE AZURE NEURAL (GRATIS Y NATURALES) */}
              {voiceEngine === 'edge' && (
                <div className="space-y-4">
                  {/* Banner informativo de Azure Neural */}
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-emerald-300 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Headphones className="w-4 h-4 text-emerald-400" />
                        Microsoft Azure Neural Voices (Edge TTS)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        100% Gratis • Sin API Key
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Voces neuronales auténticas de Microsoft Azure con entonación natural, cadencia humana y emoción conversacional. Todo el audio se precarga automáticamente en segundo plano y se almacena en IndexedDB para respuesta a 0ms sin pausas.
                    </p>
                  </div>

                  {/* Selector de Voz Azure para Sofía */}
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

                  {/* Selector de Voz Azure para Mateo */}
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

              {/* VISTA 2: VOCES DEL SISTEMA (100% GRATIS) */}
              {voiceEngine === 'browser' && (() => {
                const esVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));
                const candidateVoices = esVoices.length > 0 ? esVoices : voices;

                return (
                  <div className="space-y-4">
                    {/* Banner informativo de diferenciación acústica */}
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

                    {/* Selector de Voz Local para Sofía */}
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
                        {/* Opción Automática */}
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
                            Asignación óptima detectada (Helena / Laura / etc.) con modulación femenina 1.25x.
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

                        {/* Lista de voces detectadas en el sistema */}
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

                    {/* Selector de Voz Local para Mateo */}
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
                        {/* Opción Automática */}
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
                            Asignación masculina (Pablo / etc.) o barítono grave modulado a 0.68x.
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

                        {/* Lista de voces detectadas en el sistema */}
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
                );
              })()}

              {/* VISTA 2: GEMINI FLASH AUDIO (EMOCIONES Y PROSODIA IA) */}
              {voiceEngine === 'gemini' && (
                <div className="space-y-4">
                  {/* Diagnóstico de Clave y Solución de Google Cloud */}
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Estado del Motor Gemini Flash Audio
                      </span>
                      {getGeminiAudioApiKey() ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                          Clave configurada
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono">
                          Sin clave registrada
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Google Gemini Flash sintetiza locución humana de estudio con inflexiones emotivas. Si no suena audio o salta a voz local, se debe a que la API generativa no está activada en tu proyecto de Google Cloud o tu clave requiere permisos de Generative Language.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href="https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=747271305155"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>Habilitar API en tu Proyecto Google Cloud</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-thea-surfaceLight hover:bg-thea-surface border border-thea-border text-slate-200 hover:text-white font-semibold text-xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>Obtener clave gratis en Google AI Studio</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Selector de Voz Gemini para Sofía */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Voz para Sofía (Host Principal)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold lowercase">
                        femenina • estudio ia
                      </span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {GEMINI_VOICES.filter(v => v.gender === 'female').map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSofiaVoice(v.id);
                            const updated = savePodcastSettings({ sofiaVoice: v.id });
                            if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                              googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                            }
                          }}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            sofiaVoice === v.id
                              ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/40'
                              : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-sm text-white flex items-center justify-between">
                            <span>{v.name}</span>
                            {sofiaVoice === v.id && <Check className="w-4 h-4 text-amber-400" />}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{v.tone}</p>
                          <span className="text-[10px] text-amber-400/90 block mt-1">{v.roleHint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selector de Voz Gemini para Mateo */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Voz para Mateo (Co-Host Analítico)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold lowercase">
                        masculina • estudio ia
                      </span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {GEMINI_VOICES.filter(v => v.gender === 'male').map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setMateoVoice(v.id);
                            const updated = savePodcastSettings({ mateoVoice: v.id });
                            if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                              googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                            }
                          }}
                          className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                            mateoVoice === v.id
                              ? 'border-violet-400 bg-violet-600/15 shadow-md ring-1 ring-violet-400/40'
                              : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-xs text-white flex items-center justify-between">
                            <span>{v.name}</span>
                            {mateoVoice === v.id && <Check className="w-3.5 h-3.5 text-violet-400" />}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">{v.tone}</p>
                          <span className="text-[9px] text-violet-400/90 block mt-1">{v.roleHint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Cuadro de Orientación y Enfoque del Podcast */}
              <div className="pt-2 border-t border-thea-border">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Orientación y Enfoque del Podcast
                  </label>
                  {orientationSavedFeedback && (
                    <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" /> ¡Guardada y sincronizada!
                    </span>
                  )}
                </div>

                {/* Botones de Estilos Rápidos */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setOrientationInput('Enfoque riguroso para examen: conceptos clave, definiciones exactas, fórmulas o leyes relevantes y posibles preguntas trampa.')}
                    className="px-2.5 py-1 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[11px] text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    Examen riguroso
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientationInput('Debate dinámico y conversacional entre Sofía y Mateo: usan analogías de la vida real, tono entretenido y explicaciones frescas.')}
                    className="px-2.5 py-1 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[11px] text-slate-300 hover:text-violet-300 transition-colors cursor-pointer"
                  >
                    Debate ameno
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientationInput('Explicación pedagógica paso a paso desde los fundamentos básicos hasta los avanzados, ideal para aprender el tema por primera vez.')}
                    className="px-2.5 py-1 rounded-lg bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-[11px] text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    Explicación pedagógica
                  </button>
                </div>

                {/* Textarea multilínea */}
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={orientationInput}
                    onChange={(e) => setOrientationInput(e.target.value)}
                    placeholder="Instrucciones personalizadas para el podcast (ej: enfócate en los puntos difíciles, debate las diferencias de conceptos, incluye preguntas desafiantes...)"
                    className="w-full bg-thea-bg border border-thea-border rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed font-sans"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400">
                      Define la directiva que la IA seguirá al generar los guiones de tus episodios.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = savePodcastSettings({ orientation: orientationInput.trim() });
                        setOrientationSavedFeedback(true);
                        setTimeout(() => setOrientationSavedFeedback(false), 2500);
                        if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
                          await googleDriveService.syncPodcastSettingsToDrive(updated).catch(console.warn);
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs transition-all cursor-pointer shrink-0"
                    >
                      {orientationSavedFeedback ? '¡Guardada!' : 'Guardar Orientación'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Botones de Acción y Prueba de Voces */}
              <div className="pt-3 border-t border-thea-border">
                {noKeyWarning && (
                  <div className="mb-2.5 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                    <span>Para probar voces de Gemini, ingresa tu API Key en los Ajustes de IA (icono de engranaje).</span>
                    <button
                      type="button"
                      onClick={() => setNoKeyWarning(false)}
                      className="text-amber-400 hover:text-white ml-2 text-xs font-bold underline cursor-pointer"
                    >
                      Entendido
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isTestingVoice}
                      onClick={() => testVoiceSample('sofia')}
                      className="px-3.5 py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-amber-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                    >
                      {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                      <span>Probar Sofía</span>
                    </button>

                    <button
                      type="button"
                      disabled={isTestingVoice}
                      onClick={() => testVoiceSample('mateo')}
                      className="px-3.5 py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-violet-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                    >
                      {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-violet-400" />}
                      <span>Probar Mateo</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseVoiceModal}
                    className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
