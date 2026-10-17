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
  Key,
  Check,
  ExternalLink,
  X,
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
  setGeminiAudioApiKey,
  synthesizeGeminiSpeech,
  prefetchGeminiSpeech,
} from '../services/geminiAudioService';

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

  // Motor de voz neuronal con emociones Gemini Flash
  const [voiceEngine, setVoiceEngine] = useState<'gemini' | 'browser'>(() => {
    return getGeminiAudioApiKey() ? 'gemini' : 'browser';
  });
  const [sofiaVoice, setSofiaVoice] = useState<string>('Aoede');
  const [mateoVoice, setMateoVoice] = useState<string>('Puck');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>(() => getGeminiAudioApiKey());
  const [keySavedFeedback, setKeySavedFeedback] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  const isPlayingRef = useRef(isPlaying);
  const currentLineIndexRef = useRef(currentLineIndex);
  const playbackSpeedRef = useRef(playbackSpeed);
  const isMutedRef = useRef(isMuted);
  const isManualInterruptionRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const voiceEngineRef = useRef(voiceEngine);

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
  const [currentWordIndexInSegment, setCurrentWordIndexInSegment] = useState(0);
  const [currentGlobalWordIndex, setCurrentGlobalWordIndex] = useState(0);
  const currentWordIndexRef = useRef(0);
  const currentGlobalWordIndexRef = useRef(0);

  useEffect(() => {
    currentWordIndexRef.current = currentWordIndexInSegment;
  }, [currentWordIndexInSegment]);

  useEffect(() => {
    currentGlobalWordIndexRef.current = currentGlobalWordIndex;
  }, [currentGlobalWordIndex]);

  // Detener de forma limpia y unificada cualquier reproducción (HTML5 Audio o SpeechSynthesis)
  const stopCurrentAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
    }
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current.onboundary = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAudioActive(false);
    setIsSynthesizing(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, [stopCurrentAudio]);

  const podcast = kit.podcast;

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
      const nextSeg = fromIndex + 1;
      setCurrentLineIndex(nextSeg);
      currentLineIndexRef.current = nextSeg;
      setCurrentWordIndexInSegment(0);
      const nextGlobal = segmentStartGlobalIndices[nextSeg] || 0;
      setCurrentGlobalWordIndex(nextGlobal);
    } else {
      setIsPlaying(false);
      setIsAudioActive(false);
      setCurrentLineIndex(0);
      currentLineIndexRef.current = 0;
      setCurrentWordIndexInSegment(0);
      setCurrentGlobalWordIndex(0);
    }
  }, [podcast?.dialogue, segmentStartGlobalIndices]);

  // Reproducir vocalmente mediante el motor del navegador (fallback local) con inicio por palabra
  const speakBrowserDialogueLine = useCallback((
    index: number,
    cleanText: string,
    speakerName: string,
    startWordIdx: number = 0
  ) => {
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
      if (e.name === 'word') {
        const textSoFar = textToSpeak.slice(0, e.charIndex);
        const spokenWordCount = textSoFar.trim() ? textSoFar.trim().split(/\s+/).length : 0;
        const currentWord = Math.min(rawWords.length - 1, safeWordIdx + spokenWordCount);
        setCurrentWordIndexInSegment(currentWord);
        const baseGlobal = segmentStartGlobalIndices[index] || 0;
        setCurrentGlobalWordIndex(baseGlobal + currentWord);
      }
    };

    utterance.onend = () => {
      setIsAudioActive(false);
      if (isPlayingRef.current && !isManualInterruptionRef.current) {
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
      console.warn('[Podcast TTS] Error en síntesis de voz local:', e);
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
  }, [getSpeakerAcoustics, advanceToNextLine, segmentStartGlobalIndices]);

  // Reproducir vocalmente una línea del diálogo con soporte para Gemini Flash Audio TTS y Fallback
  const speakDialogueLine = useCallback(async (index: number, startWordIdx: number = 0) => {
    if (!podcast || !podcast.dialogue || !podcast.dialogue[index]) return;

    stopCurrentAudio();

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
    setCurrentWordIndexInSegment(safeWordIdx);
    const baseGlobal = segmentStartGlobalIndices[index] || 0;
    setCurrentGlobalWordIndex(baseGlobal + safeWordIdx);

    if (isMutedRef.current) {
      const remainingWords = rawWords.slice(safeWordIdx);
      const durationMs = Math.max(1500, Math.min(8000, (remainingWords.length * 400) / playbackSpeedRef.current));
      setIsAudioActive(true);
      const timer = setTimeout(() => {
        setIsAudioActive(false);
        if (isPlayingRef.current && !isManualInterruptionRef.current) {
          advanceToNextLine(index);
        }
      }, durationMs);
      return () => clearTimeout(timer);
    }

    // Ruta 1: Motor Neuronal Gemini Flash Audio
    const hasGeminiKey = Boolean(getGeminiAudioApiKey());
    if (voiceEngineRef.current === 'gemini' && hasGeminiKey) {
      const isFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(item.speaker);
      const targetVoice = isFemale ? sofiaVoice : mateoVoice;

      try {
        setIsSynthesizing(true);
        const audioUrl = await synthesizeGeminiSpeech(cleanText, targetVoice);
        setIsSynthesizing(false);

        if (!isPlayingRef.current || isManualInterruptionRef.current) {
          return;
        }

        // Pre-cargar en segundo plano el siguiente turno de diálogo para cero latencia
        if (podcast.dialogue[index + 1]) {
          const nextItem = podcast.dialogue[index + 1];
          const nextIsFemale = /(sofia|chica|mujer|host\b|estudiante)/i.test(nextItem.speaker);
          const nextVoice = nextIsFemale ? sofiaVoice : mateoVoice;
          prefetchGeminiSpeech(nextItem.text, nextVoice);
        }

        let audio = audioPlayerRef.current;
        if (!audio) {
          audio = new Audio();
          audioPlayerRef.current = audio;
        }

        audio.src = audioUrl;
        audio.playbackRate = playbackSpeedRef.current;
        audio.muted = isMutedRef.current;

        // Si se especificó una palabra inicial dentro del segmento, saltar a ese punto exacto
        const setAudioTimeFromWord = () => {
          if (audio && audio.duration && safeWordIdx > 0) {
            audio.currentTime = (safeWordIdx / rawWords.length) * audio.duration;
          }
        };

        audio.onloadedmetadata = setAudioTimeFromWord;
        if (audio.readyState >= 1) {
          setAudioTimeFromWord();
        }

        audio.onplay = () => {
          setIsAudioActive(true);
        };

        // Seguimiento continuo palabra por palabra con el reloj de audio
        audio.ontimeupdate = () => {
          if (audio && audio.duration && rawWords.length > 0) {
            const ratio = Math.max(0, Math.min(0.999, audio.currentTime / audio.duration));
            const currentW = Math.floor(ratio * rawWords.length);
            setCurrentWordIndexInSegment(currentW);
            setCurrentGlobalWordIndex(baseGlobal + currentW);
          }
        };

        audio.onended = () => {
          setIsAudioActive(false);
          if (isPlayingRef.current && !isManualInterruptionRef.current) {
            setTimeout(() => {
              if (isPlayingRef.current && !isManualInterruptionRef.current) {
                advanceToNextLine(index);
              }
            }, 250);
          }
        };

        audio.onerror = (err) => {
          console.warn('[GeminiAudio] Error en audio, conmutando a voz local:', err);
          setIsAudioActive(false);
          speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
        };

        await audio.play();
        return;
      } catch (err) {
        console.warn('[GeminiAudio] Fallo síntesis Gemini, conmutando a voz local:', err);
        setIsSynthesizing(false);
        speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
        return;
      }
    }

    // Ruta 2: Motor del Navegador (SpeechSynthesis)
    speakBrowserDialogueLine(index, cleanText, item.speaker, safeWordIdx);
  }, [podcast, sofiaVoice, mateoVoice, stopCurrentAudio, speakBrowserDialogueLine, advanceToNextLine, segmentStartGlobalIndices]);

  // Sincronización del ciclo de vida de reproducción
  useEffect(() => {
    if (isPlaying) {
      speakDialogueLine(currentLineIndex, currentWordIndexRef.current);
    } else {
      stopCurrentAudio();
    }
  }, [isPlaying, currentLineIndex, speakDialogueLine, stopCurrentAudio]);

  // Cambio de velocidad sin reiniciar el guion
  const handleSpeedChange = (newSpeed: number) => {
    isManualInterruptionRef.current = true;
    setPlaybackSpeed(newSpeed);
    playbackSpeedRef.current = newSpeed;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = newSpeed;
    }

    if (isPlaying) {
      stopCurrentAudio();
      setTimeout(() => {
        isManualInterruptionRef.current = false;
        speakDialogueLine(currentLineIndexRef.current, currentWordIndexRef.current);
      }, 50);
    } else {
      setTimeout(() => {
        isManualInterruptionRef.current = false;
      }, 50);
    }
  };

  // Navegar a una palabra global específica en el podcast
  const seekToGlobalWord = useCallback((targetGlobalIndex: number) => {
    if (allWords.length === 0) return;
    const safeGlobal = Math.max(0, Math.min(allWords.length - 1, targetGlobalIndex));
    const target = allWords[safeGlobal];
    if (!target) return;

    isManualInterruptionRef.current = true;
    stopCurrentAudio();

    setCurrentGlobalWordIndex(safeGlobal);
    setCurrentWordIndexInSegment(target.wordIndexInSegment);

    const targetSegIdx = target.segmentIndex;
    setCurrentLineIndex(targetSegIdx);
    currentLineIndexRef.current = targetSegIdx;

    setTimeout(() => {
      isManualInterruptionRef.current = false;
      if (isPlayingRef.current) {
        speakDialogueLine(targetSegIdx, target.wordIndexInSegment);
      }
    }, 60);
  }, [allWords, stopCurrentAudio, speakDialogueLine]);

  // Avanzar o retroceder palabra por palabra
  const handleStepWord = useCallback((direction: -1 | 1) => {
    if (allWords.length === 0) return;
    const nextGlobal = Math.max(0, Math.min(allWords.length - 1, currentGlobalWordIndexRef.current + direction));
    seekToGlobalWord(nextGlobal);
  }, [allWords.length, seekToGlobalWord]);

  // Adelantar o atrasar a un segmento completo
  const handleSeek = (targetIndex: number) => {
    if (!podcast?.dialogue) return;
    const safeIdx = Math.max(0, Math.min(podcast.dialogue.length - 1, targetIndex));
    const targetGlobal = segmentStartGlobalIndices[safeIdx] || 0;
    seekToGlobalWord(targetGlobal);
  };

  const handleSkipBackward = () => {
    handleSeek(currentLineIndex - 1);
  };

  const handleSkipForward = () => {
    handleSeek(currentLineIndex + 1);
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
    if (isPlaying) {
      setIsPlaying(false);
      isManualInterruptionRef.current = true;
      stopCurrentAudio();
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
    stopCurrentAudio();
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
    if (audioPlayerRef.current) {
      audioPlayerRef.current.muted = nextMuted;
    }
    if (isPlaying) {
      if (nextMuted) {
        stopCurrentAudio();
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
          {/* Selector de Motor de Voz */}
          <div className="flex items-center bg-thea-surface border border-thea-border rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                const hasKey = Boolean(getGeminiAudioApiKey());
                if (!hasKey && voiceEngine === 'browser') {
                  setShowVoiceModal(true);
                } else {
                  const nextEngine = voiceEngine === 'gemini' ? 'browser' : 'gemini';
                  setVoiceEngine(nextEngine);
                  stopCurrentAudio();
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                voiceEngine === 'gemini'
                  ? 'bg-gradient-to-r from-amber-500/25 to-violet-600/30 border border-amber-500/40 text-amber-300'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={voiceEngine === 'gemini' ? 'Voz neuronal con emociones de Gemini activa' : 'Voz local del sistema activa'}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{voiceEngine === 'gemini' ? 'Voz Emocional Gemini' : 'Voz del Sistema'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowVoiceModal(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              title="Ajustes de Voces y API Key de Gemini"
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
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-950/70 border border-violet-500/30 text-violet-300">
                      {speakerAcoustics.voiceName.split('-')[0].trim()}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 font-mono">
                    {currentItem.time}
                  </span>
                </div>
              </div>
              <div className="text-sm sm:text-base text-slate-100 font-medium leading-relaxed flex flex-wrap gap-x-1.5 gap-y-1 select-none">
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
                      className={`px-1 py-0.5 rounded-lg cursor-pointer transition-all duration-150 ${
                        isCurrent
                          ? 'bg-amber-400 text-slate-950 font-extrabold shadow-md shadow-amber-500/40 scale-105 ring-2 ring-amber-300/60'
                          : isPast
                          ? 'text-slate-200 hover:text-white'
                          : 'text-slate-400/80 hover:text-white hover:bg-thea-surface'
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
                  onChange={(e) => seekToGlobalWord(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none transition-all group-hover:h-3"
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
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative text-left">
            <div className="flex items-center justify-between pb-4 border-b border-thea-border mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-violet-600/30 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Voces Neuronales con Emociones</h3>
                  <p className="text-xs text-slate-400">Google Gemini Flash Audio TTS (100% Gratuito)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Selector de Voz para Sofía */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Voz para Sofía (Host Principal)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GEMINI_VOICES.filter(v => v.gender === 'female').map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSofiaVoice(v.id)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        sofiaVoice === v.id
                          ? 'border-amber-400 bg-amber-500/10 shadow-md ring-1 ring-amber-400/40'
                          : 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-400'
                      }`}
                    >
                      <div className="font-bold text-sm text-white flex items-center justify-between">
                        <span>{v.name}</span>
                        {sofiaVoice === v.id && <Check className="w-4 h-4 text-amber-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{v.tone}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Voz para Mateo */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Voz para Mateo (Co-Host Analítico)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {GEMINI_VOICES.filter(v => v.gender === 'male').map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setMateoVoice(v.id)}
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
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{v.tone}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input API Key de Google Gemini */}
              <div className="pt-2 border-t border-thea-border">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    API Key de Google Gemini
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
                  >
                    Obtener clave gratis <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="flex-1 bg-thea-bg border border-thea-border rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setGeminiAudioApiKey(geminiKeyInput.trim());
                      setKeySavedFeedback(true);
                      setTimeout(() => setKeySavedFeedback(false), 2000);
                      if (geminiKeyInput.trim()) {
                        setVoiceEngine('gemini');
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs transition-all cursor-pointer shrink-0"
                  >
                    {keySavedFeedback ? '¡Guardada!' : 'Guardar'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Las claves de Google AI Studio cuentan con nivel gratuito sin tarjeta de crédito.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-between pt-3 border-t border-thea-border">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isTestingVoice || !geminiKeyInput.trim()}
                    onClick={async () => {
                      try {
                        setIsTestingVoice(true);
                        stopCurrentAudio();
                        const testUrl = await synthesizeGeminiSpeech(
                          '¡Hola! Soy Sofía en Contrareloj Study. ¡Me alegra mucho que estemos repasando juntos hoy!',
                          sofiaVoice,
                          geminiKeyInput.trim()
                        );
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
                        alert('Fallo al probar la voz: ' + (msg || 'Revisa tu clave de Gemini'));
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-amber-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                    <span>Probar Sofía</span>
                  </button>

                  <button
                    type="button"
                    disabled={isTestingVoice || !geminiKeyInput.trim()}
                    onClick={async () => {
                      try {
                        setIsTestingVoice(true);
                        stopCurrentAudio();
                        const testUrl = await synthesizeGeminiSpeech(
                          '¡Y yo soy Mateo! Vamos a profundizar en cada concepto para que apruebes con la máxima nota.',
                          mateoVoice,
                          geminiKeyInput.trim()
                        );
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
                        alert('Fallo al probar la voz: ' + (msg || 'Revisa tu clave de Gemini'));
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-thea-surfaceLight border border-thea-border hover:border-violet-400 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                  >
                    {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-violet-400" />}
                    <span>Probar Mateo</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
