import React, { useState, useRef, useEffect } from 'react';
import type { StudyKit } from '../types';
import {
  Send,
  Bot,
  Mic,
  Volume2,
  VolumeX,
  Keyboard,
  Square,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  History,
  X,
  ArrowLeft,
} from 'lucide-react';
import { askTheaAI, getGroqApiKey } from '../services/aiService';
import { synthesizeAzureEdgeSpeech, prefetchAzureEdgeSpeech } from '../services/azureEdgeTtsService';
import { FormattedText } from './FormattedText';
import { startWhisperRecording, isWhisperMicSupported, isMeaningfulSpeech, type WhisperRecording } from '../services/whisperMic';

interface OralLessonViewProps {
  kit: StudyKit;
  onOpenAISettings?: () => void;
  onNavigateToChat?: () => void;
}

interface Message {
  id: string;
  sender: 'thea' | 'user';
  text: string;
  timestamp: string;
}

const VOICE = 'es-CO-SalomeNeural';

const getPreferredSpeechLang = (): string => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language.toLowerCase();
    if (nav === 'es-419' || nav === 'es-us' || nav.includes('co')) return 'es-419';
  }
  return 'es-419';
};

type OralMode = 'exam' | 'conversation';

const TTS_RATE = '+25%';

const ORAL_EXAM_DIRECTIVE = `[MODO LECCIÓN ORAL - EXAMEN RIGUROSO: tu respuesta se leerá en voz alta de inmediato]
Reglas obligatorias:
1. Máximo 2 frases cortas y directas. Habla fluido, conciso y enérgico.
2. NUNCA uses listas, viñetas, tablas, títulos markdown ni símbolos.
3. Evalúa con claridad si la respuesta del estudiante fue correcta, parcial o incorrecta. Si se equivoca, dale una pista breve sin resolverlo todo.
4. Concluye SIEMPRE formulando UNA sola pregunta de nivel examen sobre el material.
5. Si el estudiante dice "empezar", haz la primera pregunta directamente.

El estudiante responde: `;

const CONVERSATION_DIRECTIVE = `[MODO CONVERSACIÓN TUTOR LIBRE: tu respuesta se leerá en voz alta de inmediato]
Reglas obligatorias:
1. Máximo 2 frases ágiles, conversacionales y pedagógicas. Habla de forma natural y cercana.
2. NUNCA uses listas, viñetas, tablas, títulos markdown ni símbolos.
3. Dialoga con el estudiante sobre los conceptos del tema. Responde sus dudas, reflexiona con él o profundiza en las ideas de forma interactiva.
4. No actúes como examen rígido ni califiques con notas; mantén una charla socrática estimulante y fluida de dos vías.
5. Termina con un comentario abierto o una pregunta ligera que invite a seguir charlando.

El estudiante dice: `;

const SR: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

/**
 * Divide el texto en oraciones optimizadas para streaming de voz ultra-rápido:
 * La primera oración se aísla como chunk 0 para empezar a hablar en <1 segundo,
 * mientras el resto de oraciones se precargan en paralelo en segundo plano.
 */
function splitForSpeech(text: string): string[] {
  const clean = text.replace(/[*_#`~>|]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const rawSentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  if (rawSentences.length <= 1) return [clean];

  const firstSentence = rawSentences[0].trim();
  const restSentences = rawSentences.slice(1);

  const restChunks: string[] = [];
  let current = '';
  for (const s of restSentences) {
    if ((current + ' ' + s).trim().length > 220 && current) {
      restChunks.push(current.trim());
      current = s;
    } else {
      current = (current + ' ' + s).trim();
    }
  }
  if (current) restChunks.push(current.trim());

  return [firstSentence, ...restChunks];
}

export const OralLessonView: React.FC<OralLessonViewProps> = ({
  kit,
  onOpenAISettings,
  onNavigateToChat,
}) => {
  const [mode, setMode] = useState<OralMode>('exam');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'oral-init',
      sender: 'thea',
      text: `Bienvenido a tu lección oral sobre "${kit.title}". Te haré preguntas habladas como en un examen real y evaluaré tus respuestas en voz alta. ¿Listo para empezar? Pulsa el micrófono o la barra espaciadora.`,
      timestamp: 'Ahora',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [speechLang, setSpeechLang] = useState<string>(getPreferredSpeechLang);

  const groqKey = getGroqApiKey();
  const useWhisper = Boolean(groqKey && groqKey.startsWith('gsk_')) && isWhisperMicSupported();
  const useWhisperRef = useRef(useWhisper);
  useWhisperRef.current = useWhisper;
  const whisperRef = useRef<WhisperRecording | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // Estados y refs para interrupción fluida (barge-in)
  const [isInterrupted, setIsInterrupted] = useState(false);
  const isPausedForInterruptionRef = useRef(false);
  const bargeInRef = useRef<WhisperRecording | null>(null);
  const handleInterruptionRef = useRef<(text: string) => Promise<void>>(async () => {});
  const lastTheaStatementRef = useRef<string>(messages[0]?.text || kit.title);

  // Refs de sincronización
  const modeRef = useRef<OralMode>(mode);
  const voiceOnRef = useRef(voiceOn);
  const handsFreeRef = useRef(handsFree);
  const listeningRef = useRef(listening);
  const speakingRef = useRef(speaking);
  const isTypingRef = useRef(isTyping);
  const transcribingRef = useRef(transcribing);
  const speechLangRef = useRef<string>(getPreferredSpeechLang());
  const fallbackAttemptsRef = useRef(0);
  const isBraveRef = useRef(false);
  const messagesRef = useRef(messages);

  modeRef.current = mode;

  const isListeningDesiredRef = useRef(false);
  const transcriptBufferRef = useRef('');
  const accumulatedFromPreviousSessionsRef = useRef('');
  const restartTimeoutRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);

  const stopListeningRef = useRef<(shouldSend?: boolean) => void>(() => {});
  const startListeningRef = useRef<(isFallback?: boolean) => Promise<void>>(async () => {});
  const startOralLessonRef = useRef<() => void>(() => {});

  voiceOnRef.current = voiceOn;
  handsFreeRef.current = handsFree;
  listeningRef.current = listening;
  speakingRef.current = speaking;
  isTypingRef.current = isTyping;
  transcribingRef.current = transcribing;
  speechLangRef.current = speechLang;
  messagesRef.current = messages;

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const speakToken = useRef(0);
  const handleSendRef = useRef<(display: string, prompt?: string) => Promise<void>>(async () => {});

  const canListen = Boolean(SR) || useWhisper;

  // Detección de Brave Browser
  useEffect(() => {
    const detectBrave = async () => {
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).brave) {
          const isBrave =
            typeof (navigator as any).brave.isBrave === 'function'
              ? await (navigator as any).brave.isBrave()
              : true;
          isBraveRef.current = Boolean(isBrave);
        }
      } catch {}
    };
    detectBrave();
  }, []);

  // Limpieza al desmontar y al cambiar de pestaña / salir del módulo
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopSpeaking();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopSpeaking();
      stopBargeInListener();
      stopListening(false);
      isListeningDesiredRef.current = false;
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      whisperRef.current?.cancel();
      whisperRef.current = null;
      try {
        recognitionRef.current?.abort();
      } catch {}
      recognitionRef.current = null;
    };
  }, []);

  // ───────────────────────── CONTROL DE ESPACIO (ACCION IDENTICA AL BOTON CENTRAL) ─────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;

        // Comportamiento 100% idéntico al clic en el botón central:
        if (speakingRef.current) {
          stopSpeaking();
          return;
        }

        if (isTypingRef.current || transcribingRef.current) {
          return;
        }

        if (listeningRef.current) {
          // Si está hablando/grabando, pulsar Espacio detiene e interpreta/envía de inmediato
          stopListeningRef.current(true);
        } else {
          // Si está inactivo, pulsa Espacio para empezar a hablar
          if (messagesRef.current.length <= 1) {
            startOralLessonRef.current();
          } else {
            startListeningRef.current();
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Usar useCapture = true para interceptar antes del evento nativo del botón enfocado
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, []);

  // ───────────────────────── ESCUCHA DE INTERRUPCIÓN (BARGE-IN INTELIGENTE) ─────────────────────────
  const stopBargeInListener = () => {
    isPausedForInterruptionRef.current = false;
    setIsInterrupted(false);
    if (bargeInRef.current) {
      const rec = bargeInRef.current;
      bargeInRef.current = null;
      rec.cancel();
    }
  };

  const startBargeInListener = async () => {
    if (!useWhisperRef.current) return;
    stopBargeInListener();

    try {
      const rec = await startWhisperRecording({
        apiKey: getGroqApiKey(),
        language: 'es',
        prompt: kit.title,
        autoStopOnSilence: true,
        silenceMs: 650,
        noSpeechTimeoutMs: 120000,
        isInterruptionMode: true, // Modo interrupción ágil y natural con filtro de clics
        minSpeechRms: 0.075,      // Detecta habla humana normal (~350ms) con tolerancia a pausas de sílabas
        onVolume: (vol) => {
          if (isPausedForInterruptionRef.current) {
            setMicLevel(vol);
          }
        },
        onSpeechDetected: () => {
          if (speakingRef.current) {
            if (audioRef.current && !audioRef.current.paused) {
              try {
                audioRef.current.pause();
              } catch {}
              isPausedForInterruptionRef.current = true;
              setIsInterrupted(true);
            } else if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) {
              try {
                speechSynthesis.pause();
              } catch {}
              isPausedForInterruptionRef.current = true;
              setIsInterrupted(true);
            }
          }
        },
        onTranscribing: () => {
          if (isPausedForInterruptionRef.current) {
            setTranscribing(true);
          }
        },
      });

      bargeInRef.current = rec;

      rec.result
        .then((text) => {
          if (bargeInRef.current !== rec) return;
          bargeInRef.current = null;
          setTranscribing(false);

          if (isMeaningfulSpeech(text)) {
            // Confirmado: el estudiante dijo palabras reales con sentido
            isPausedForInterruptionRef.current = false;
            setIsInterrupted(false);
            stopSpeaking();
            handleInterruptionRef.current(text);
          } else {
            // Fue solo un sonido o carraspeo: reanudar habla de Thea donde iba
            setIsInterrupted(false);
            if (isPausedForInterruptionRef.current) {
              isPausedForInterruptionRef.current = false;
              if (audioRef.current && audioRef.current.paused) {
                audioRef.current.play().catch(() => {});
              }
              if (typeof speechSynthesis !== 'undefined' && speechSynthesis.paused) {
                speechSynthesis.resume();
              }
            }
            // Si Thea continúa hablando, reactivar escucha de interrupción
            if (speakingRef.current) {
              startBargeInListener();
            }
          }
        })
        .catch(() => {
          if (bargeInRef.current !== rec) return;
          bargeInRef.current = null;
          setTranscribing(false);
          setIsInterrupted(false);
          if (isPausedForInterruptionRef.current) {
            isPausedForInterruptionRef.current = false;
            if (audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch(() => {});
            }
            if (typeof speechSynthesis !== 'undefined' && speechSynthesis.paused) {
              speechSynthesis.resume();
            }
          }
        });
    } catch (err) {
      console.warn('[BargeIn] No se pudo iniciar escucha de interrupción:', err);
    }
  };

  // ───────────────────────── VOZ: SALIDA (TTS) ─────────────────────────
  const stopSpeaking = () => {
    speakToken.current++;
    stopBargeInListener();
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
      } catch {}
      audioRef.current = null;
    }
    if (audioResolveRef.current) {
      audioResolveRef.current();
      audioResolveRef.current = null;
    }
    if (typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
    setSpeaking(false);
  };

  const playUrl = (url: string) =>
    new Promise<void>((resolve) => {
      const a = new Audio(url);
      audioRef.current = a;
      audioResolveRef.current = resolve;
      a.onended = () => {
        if (audioRef.current === a) audioRef.current = null;
        resolve();
      };
      a.onerror = () => {
        if (audioRef.current === a) audioRef.current = null;
        resolve();
      };
      a.play().catch(() => {
        if (audioRef.current === a) audioRef.current = null;
        resolve();
      });
    });

  const speakWithBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      if (typeof speechSynthesis === 'undefined') return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = 1.25; // Sincronizado a +25% de agilidad
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });

  const speak = async (text: string): Promise<boolean> => {
    stopSpeaking();
    const token = ++speakToken.current;
    const chunks = splitForSpeech(text).slice(0, 6);
    if (chunks.length === 0) return false;
    setSpeaking(true);

    if (useWhisperRef.current) {
      startBargeInListener();
    }

    // Pre-sintetizar de inmediato todas las frases posteriores en paralelo mientras se arranca la primera
    if (chunks.length > 1) {
      for (let j = 1; j < chunks.length; j++) {
        prefetchAzureEdgeSpeech(chunks[j], VOICE, TTS_RATE);
      }
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (token !== speakToken.current) {
          stopBargeInListener();
          return false;
        }
        let url: string | null = null;
        try {
          url = await synthesizeAzureEdgeSpeech(chunks[i], VOICE, TTS_RATE);
        } catch {
          url = null;
        }
        if (token !== speakToken.current) {
          stopBargeInListener();
          return false;
        }
        if (url) await playUrl(url);
        else await speakWithBrowser(chunks[i]);
      }
      return token === speakToken.current;
    } finally {
      stopBargeInListener();
      if (token === speakToken.current) setSpeaking(false);
    }
  };

  // ───────────────────────── VOZ: ENTRADA (MICROFONO) ─────────────────────────
  const startListeningWhisper = async () => {
    stopSpeaking();
    setVoiceError('');
    setInput('');
    whisperRef.current?.cancel();
    whisperRef.current = null;
    isListeningDesiredRef.current = true;
    listeningRef.current = true;
    setListening(true);
    try {
      const rec = await startWhisperRecording({
        apiKey: getGroqApiKey(),
        language: 'es',
        prompt: kit.title,                        // mejora términos técnicos
        autoStopOnSilence: true,                  // ¡Auto-detección activa para responder solo!
        silenceMs: 600,                           // 0.60s de silencio tras hablar activa respuesta inmediata
        onVolume: setMicLevel,
        onTranscribing: () => {
          listeningRef.current = false;
          transcribingRef.current = true;
          setListening(false);
          setTranscribing(true);
        },
      });
      whisperRef.current = rec;
      rec.result
        .then((text) => {
          if (whisperRef.current !== rec) return;
          whisperRef.current = null;
          isListeningDesiredRef.current = false;
          listeningRef.current = false;
          transcribingRef.current = false;
          setListening(false);
          setTranscribing(false);
          if (text && isMeaningfulSpeech(text)) {
            handleSendRef.current(text);
          } else if (text) {
            console.log('[OralLesson] Ruido ambiental o sonido no verbal descartado:', text);
          }
        })
        .catch((err: Error) => {
          if (whisperRef.current !== rec) return;
          whisperRef.current = null;
          isListeningDesiredRef.current = false;
          listeningRef.current = false;
          transcribingRef.current = false;
          setListening(false);
          setTranscribing(false);
          setVoiceError(err.message);
        });
    } catch (err: any) {
      isListeningDesiredRef.current = false;
      listeningRef.current = false;
      transcribingRef.current = false;
      setListening(false);
      setVoiceError(err?.message || 'No se pudo iniciar el micrófono.');
    }
  };

  const stopListening = (shouldSend = false) => {
    listeningRef.current = false;
    if (useWhisperRef.current && whisperRef.current) {
      const rec = whisperRef.current;
      if (shouldSend) {
        rec.stop();               // el .then() de startListeningWhisper envía el texto
        transcribingRef.current = true;
        setListening(false);
        setTranscribing(true);
      } else {
        whisperRef.current = null;
        rec.cancel();
        isListeningDesiredRef.current = false;
        transcribingRef.current = false;
        setListening(false);
        setTranscribing(false);
      }
      return;
    }

    isListeningDesiredRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    setListening(false);

    const textToSend = (transcriptBufferRef.current || input).trim();
    transcriptBufferRef.current = '';
    accumulatedFromPreviousSessionsRef.current = '';
    setInput('');

    if (shouldSend && textToSend) {
      handleSendRef.current(textToSend);
    }
  };
  stopListeningRef.current = stopListening;

  const startListening = async (isFallback = false) => {
    if (useWhisperRef.current) { await startListeningWhisper(); return; }
    if (!SR) return;
    if (!isFallback) {
      fallbackAttemptsRef.current = 0;
      accumulatedFromPreviousSessionsRef.current = '';
      transcriptBufferRef.current = '';
    }
    stopSpeaking();
    setVoiceError('');

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    isListeningDesiredRef.current = true;
    setListening(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const rec = new SR();
      rec.lang = speechLangRef.current;
      rec.interimResults = true;
      rec.continuous = true;

      rec.onresult = (e: any) => {
        let sessionTranscript = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r && r[0]) {
            sessionTranscript += r[0].transcript + ' ';
          }
        }
        const fullText = (accumulatedFromPreviousSessionsRef.current + ' ' + sessionTranscript)
          .replace(/\s+/g, ' ')
          .trim();

        if (fullText) {
          transcriptBufferRef.current = fullText;
          setInput(fullText);

          // Si el modo manos libres está activo, enviar tras pausa de 2.5s de silencio
          if (handsFreeRef.current) {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = setTimeout(() => {
              if (isListeningDesiredRef.current && transcriptBufferRef.current.trim()) {
                stopListening(true);
              }
            }, 2500);
          }
        }
      };

      rec.onerror = (e: any) => {
        console.warn('[Oral mic] error:', e.error);
        // Pausas de habla, silencios normales o abort intencional: NO apagar el micrófono
        if (e.error === 'no-speech' || e.error === 'aborted') {
          return;
        }

        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          isListeningDesiredRef.current = false;
          setListening(false);
          setVoiceError(
            'Permiso de micrófono denegado. Haz clic en el candado de la barra de direcciones y autoriza el micrófono.'
          );
          return;
        }

        if (e.error === 'audio-capture') {
          isListeningDesiredRef.current = false;
          setListening(false);
          setVoiceError('No se detectó ningún micrófono disponible en tu dispositivo.');
          return;
        }

        if (e.error === 'network') {
          const isBrave = Boolean(
            isBraveRef.current || (navigator as any).brave || (window as any).brave
          );
          if (isBrave) {
            isListeningDesiredRef.current = false;
            setListening(false);
            setShowTextInput(true);
            setVoiceError('brave-blocked');
            return;
          }

          if (fallbackAttemptsRef.current === 0) {
            fallbackAttemptsRef.current = 1;
            const nextLang = speechLangRef.current === 'es-ES' ? 'es-419' : 'es-ES';
            speechLangRef.current = nextLang;
            setSpeechLang(nextLang);
            setTimeout(() => {
              if (isListeningDesiredRef.current) {
                startListening(true);
              }
            }, 300);
            return;
          }

          isListeningDesiredRef.current = false;
          setListening(false);
          setShowTextInput(true);
          setVoiceError(
            'El servicio de transcripción de voz del navegador no pudo contactar con los servidores de Google (error de red). Puedes usar el teclado para responder o pulsar el micrófono para reintentar.'
          );
          setTimeout(() => setVoiceError(''), 7000);
          return;
        }

        console.warn('SpeechRecognition warning:', e.error);
      };

      rec.onend = () => {
        console.warn('[Oral mic] onend, deseado =', isListeningDesiredRef.current);
        accumulatedFromPreviousSessionsRef.current = transcriptBufferRef.current;
        // Si el usuario aún mantiene activo el micrófono, reiniciar la sesión de forma continua
        if (isListeningDesiredRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningDesiredRef.current) {
              startListening(true);
            }
          }, 80);
        } else {
          setListening(false);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      console.warn('Error starting speech recognition:', err);
      isListeningDesiredRef.current = false;
      setListening(false);
      if (err.name === 'NotAllowedError') {
        setVoiceError('Permiso de micrófono no otorgado por el navegador.');
      } else {
        setVoiceError('No se pudo iniciar el servicio de voz del navegador.');
      }
    }
  };
  startListeningRef.current = startListening;

  const toggleMic = () => {
    if (listening) {
      stopListening(true);
    } else {
      // Si la lección aún no ha comenzado y se pulsa el micro, disparar la primera pregunta si procede
      if (messages.length <= 1) {
        startOralLesson();
      } else {
        startListening();
      }
    }
  };

  // ───────────────────────── ENVÍO DE MENSAJES ─────────────────────────
  const nowLabel = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleSend = async (displayText: string, promptText?: string) => {
    if (!displayText.trim() || isTyping) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: displayText,
      timestamp: nowLabel(),
    };

    const previousHistory = messages;
    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);
    stopSpeaking();
    const activeDirective = modeRef.current === 'exam' ? ORAL_EXAM_DIRECTIVE : CONVERSATION_DIRECTIVE;
    const queryForAI = promptText ?? (activeDirective + displayText);

    let replyText: string;
    try {
      replyText = await askTheaAI(queryForAI, kit, previousHistory, 'groq');
    } catch {
      replyText =
        modeRef.current === 'exam'
          ? `He analizado tu respuesta sobre "${kit.title}". ¿Podrías resumir la idea central o reformularla brevemente?`
          : `Es un punto interesante sobre "${kit.title}". ¿Cómo lo relacionarías con el concepto principal?`;
    }

    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), sender: 'thea', text: replyText, timestamp: nowLabel() },
    ]);
    lastTheaStatementRef.current = replyText;
    setIsTyping(false);

    if (voiceOnRef.current) {
      const finished = await speak(replyText);
      if (finished && handsFreeRef.current && (SR || useWhisperRef.current)) {
        startListening();
      }
    }
  };
  handleSendRef.current = handleSend;

  const isTopicChangeRequested = (text: string): boolean => {
    const t = text.toLowerCase();
    return (
      t.includes('cambiar de tema') ||
      t.includes('cambia de tema') ||
      t.includes('cambiemos de tema') ||
      t.includes('otro tema') ||
      t.includes('hablemos de otra cosa') ||
      t.includes('pasemos a otra cosa') ||
      t.includes('siguiente tema') ||
      t.includes('cambiar el tema') ||
      t.includes('tema nuevo')
    );
  };

  const handleInterruption = async (userSpeech: string) => {
    stopSpeaking();
    stopListening(false);

    const isTopicChange = isTopicChangeRequested(userSpeech);
    const lastStatement = lastTheaStatementRef.current || kit.title;

    let directive: string;

    if (isTopicChange) {
      directive =
        modeRef.current === 'exam'
          ? `[CAMBIO DE TEMA SOLICITADO POR EL ESTUDIANTE EN EXAMEN ORAL - tu respuesta se leerá en voz alta de inmediato]
Reglas obligatorias:
1. Máximo 2 frases concisas y amables.
2. Acepta el cambio de tema solicitado por el estudiante ("${userSpeech}").
3. Plantea de inmediato la primera pregunta de examen sobre el nuevo tema o ángulo de "${kit.title}".
4. NUNCA uses listas, viñetas ni símbolos raros.

El estudiante solicitó cambiar de tema diciendo: "${userSpeech}"`
          : `[CAMBIO DE TEMA SOLICITADO EN CONVERSACIÓN - tu respuesta se leerá en voz alta de inmediato]
Reglas obligatorias:
1. Máximo 2 frases naturales, fluidas y cálidas.
2. Acepta el nuevo rumbo propuesto por el estudiante ("${userSpeech}").
3. Abre la conversación sobre ese nuevo aspecto de "${kit.title}" con un comentario reflexivo o pregunta abierta.
4. NUNCA uses listas, viñetas ni símbolos raros.

El estudiante solicitó cambiar de tema diciendo: "${userSpeech}"`;
    } else {
      directive =
        modeRef.current === 'exam'
          ? `[INTERRUPCIÓN CON CONTINUIDAD OBLIGATORIA DE LA LECCIÓN - tu respuesta se leerá en voz alta de inmediato]
Contexto: Antes de que el estudiante te interrumpiera, tú le estabas diciendo o preguntando: "${lastStatement}".
El estudiante te interrumpió diciendo: "${userSpeech}".

Reglas obligatorias estrictas:
1. Máximo 2 o 3 frases directas y concisas.
2. PASO 1 (Acotación): Responde o aclara brevemente la duda, acotación o comentario que acaba de hacer el estudiante.
3. PASO 2 (Continuidad): Retoma INMEDIATAMENTE la lección desde el punto exacto donde se quedó antes de la pausa, volviendo a plantear o continuar la pregunta original que tenías pendiente ("${lastStatement}").
4. NO cambies de tema ni inventes otra dirección, porque el estudiante NO pidió cambiar de tema.
5. NUNCA uses listas, viñetas ni símbolos raros.`
          : `[INTERRUPCIÓN CON CONTINUIDAD EN CONVERSACIÓN - tu respuesta se leerá en voz alta de inmediato]
Contexto: Antes de que el estudiante te interrumpiera, tú le estabas diciendo o preguntando: "${lastStatement}".
El estudiante te interrumpió diciendo: "${userSpeech}".

Reglas obligatorias estrictas:
1. Máximo 2 o 3 frases ágiles, cálidas y conversacionales.
2. PASO 1 (Acotación): Responde con naturalidad a la duda o acotación del estudiante.
3. PASO 2 (Continuidad): Conecta de vuelta con la idea o pregunta que estabas tratando antes de la pausa ("${lastStatement}").
4. NO cambies de tema a menos que el estudiante lo haya pedido explícitamente.
5. NUNCA uses listas, viñetas ni símbolos raros.`;
    }

    await handleSend(userSpeech, directive);
  };
  handleInterruptionRef.current = handleInterruption;

  const startOralLesson = () => {
    if (modeRef.current === 'exam') {
      handleSend('Empezar lección oral', ORAL_EXAM_DIRECTIVE + 'empezar');
    } else {
      handleSend('Iniciar conversación', CONVERSATION_DIRECTIVE + 'Hola Thea, conversemos sobre el tema.');
    }
  };
  startOralLessonRef.current = startOralLesson;

  const handleModeChange = (newMode: OralMode) => {
    if (newMode === mode) return;
    stopSpeaking();
    stopListening(false);
    setMode(newMode);
    modeRef.current = newMode;
    const initialText =
      newMode === 'exam'
        ? `Bienvenido a tu lección oral sobre "${kit.title}". Te haré preguntas habladas como en un examen real y evaluaré tus respuestas en voz alta. ¿Listo para empezar? Pulsa el micrófono o la barra espaciadora.`
        : `Hola, conversemos libremente sobre "${kit.title}". Puedes hacerme cualquier pregunta, reflexionar en voz alta o debatir conceptos conmigo. ¿De qué te gustaría hablar primero?`;
    lastTheaStatementRef.current = initialText;
    setMessages([
      {
        id: `${newMode}-init-${Date.now()}`,
        sender: 'thea',
        text: initialText,
        timestamp: 'Ahora',
      },
    ]);
  };

  const clearConversation = () => {
    stopSpeaking();
    stopListening(false);
    const initialText =
      mode === 'exam'
        ? `Bienvenido a tu lección oral sobre "${kit.title}". Te haré preguntas habladas como en un examen real y evaluaré tus respuestas en voz alta. ¿Listo para empezar? Pulsa el micrófono o la barra espaciadora.`
        : `Hola, conversemos libremente sobre "${kit.title}". Puedes hacerme cualquier pregunta, reflexionar en voz alta o debatir conceptos conmigo. ¿De qué te gustaría hablar primero?`;
    lastTheaStatementRef.current = initialText;
    setMessages([
      {
        id: `${mode}-init-${Date.now()}`,
        sender: 'thea',
        text: initialText,
        timestamp: 'Ahora',
      },
    ]);
  };

  // Último mensaje de Thea para desplegar como subtítulo central en vivo
  const latestTheaMsg = [...messages].reverse().find((m) => m.sender === 'thea');
  const isInitialState = messages.length <= 1;

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-4 h-[calc(100vh-5.5rem)] min-h-[640px] flex flex-col justify-between select-none">
      {/* Fondo ambiental dinámico con aura pulsante en el centro */}
      <div
        className={`absolute inset-0 -z-10 blur-3xl transition-all duration-1000 pointer-events-none ${
          listening
            ? 'bg-[radial-gradient(circle_at_center,_rgba(244,63,94,0.22)_0%,_rgba(15,8,30,0)_70%)]'
            : speaking
            ? 'bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.25)_0%,_rgba(15,8,30,0)_70%)]'
            : isTyping
            ? 'bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.2)_0%,_rgba(15,8,30,0)_70%)]'
            : 'bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.15)_0%,_rgba(15,8,30,0)_70%)]'
        }`}
      />

      {/* ── BARRA SUPERIOR MINIMALISTA ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-2 py-2 shrink-0">
        <div className="flex items-center gap-2">
          {onNavigateToChat && (
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                stopListening(false);
                onNavigateToChat();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-thea-border/80 bg-thea-surface/80 hover:bg-thea-surface text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
              title="Volver al Chat Tutor escrito"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span>Chat Tutor</span>
            </button>
          )}

          {/* Interruptor de Modo: Examen Oral vs Conversación */}
          <div className="flex items-center p-0.5 rounded-xl bg-thea-surface/90 border border-thea-border/80 shadow-inner">
            <button
              type="button"
              onClick={() => handleModeChange('exam')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'exam'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Examen Oral
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('conversation')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'conversation'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Conversación
            </button>
          </div>

          <div className="hidden lg:block">
            <span className="text-xs text-slate-400 truncate max-w-[180px] inline-block align-middle font-medium">
              {kit.title}
            </span>
          </div>
        </div>

        {/* Acciones mínimas superiores */}
        <div className="flex items-center gap-2">
          {/* Alternar Voz */}
          <button
            type="button"
            onClick={() => {
              if (voiceOn) stopSpeaking();
              setVoiceOn((v) => !v);
            }}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              voiceOn
                ? 'border-violet-500/50 text-violet-300 bg-violet-600/20'
                : 'border-thea-border text-slate-400 hover:text-white'
            }`}
            title={voiceOn ? 'Respuesta hablada activa' : 'Activar respuesta hablada'}
          >
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Reiniciar lección */}
          <button
            type="button"
            onClick={clearConversation}
            className="p-1.5 rounded-xl border border-thea-border text-slate-400 hover:text-rose-400 hover:bg-thea-surface transition-colors cursor-pointer"
            title={mode === 'exam' ? 'Reiniciar examen oral' : 'Reiniciar conversación'}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Banner especial para Brave Browser si no se usa Whisper */}
      {!useWhisper && voiceError === 'brave-blocked' && (
        <div className="my-2 px-4 py-3 bg-amber-950/85 border border-amber-500/50 rounded-2xl text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn shrink-0 shadow-lg">
          <div className="flex-1">
            <p className="font-bold text-amber-100 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>El reconocimiento de voz del navegador no funciona en Brave</span>
            </p>
            <p className="mt-1 text-[11px] text-amber-300/90 leading-relaxed">
              Configura tu API key de Groq en Motor IA y el micrófono funcionará en cualquier navegador.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenAISettings && (
              <button
                type="button"
                onClick={onOpenAISettings}
                className="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-100 font-medium text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Abrir Motor IA</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setVoiceError('')}
              className="px-2 py-1.5 text-xs text-amber-300 hover:text-white underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── CUERPO PRINCIPAL: INTERFAZ CENTRADA Y MINIMALISTA ── */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 relative my-auto">
        {/* Subtítulo dinámico / Pregunta actual de Thea */}
        <div className="w-full max-w-xl mx-auto mb-8 sm:mb-12 transition-all duration-300">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/15 border border-violet-500/30 text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-3">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            <span>
              {isInterrupted
                ? 'Pausado: escuchando tu interrupción...'
                : speaking
                ? 'Thea está hablando... (habla para interrumpir)'
                : isTyping
                ? mode === 'exam'
                  ? 'Evaluando respuesta...'
                  : 'Pensando respuesta...'
                : isInitialState
                ? mode === 'exam'
                  ? 'Lección Oral Preparada'
                  : 'Conversación Lista'
                : mode === 'exam'
                ? 'Pregunta de Examen'
                : 'Conversación con Thea'}
            </span>
          </div>

          <div className="text-base sm:text-xl text-slate-100 font-medium leading-relaxed drop-shadow-sm min-h-[3rem] flex items-center justify-center">
            {isTyping ? (
              <div className="flex items-center gap-2 text-violet-300 text-sm animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
                <span>
                  {mode === 'exam'
                    ? 'Thea está formulando tu siguiente pregunta...'
                    : 'Thea está preparando su respuesta...'}
                </span>
              </div>
            ) : latestTheaMsg ? (
              <FormattedText text={latestTheaMsg.text} />
            ) : (
              <span>
                {mode === 'exam'
                  ? 'Pulsa el micrófono para iniciar tu lección oral.'
                  : 'Pulsa el micrófono para comenzar la conversación.'}
              </span>
            )}
          </div>
        </div>

        {/* ── HERO CONTROLLER: MICRÓFONO CENTRAL MINIMALISTA Y ATRACTIVO ── */}
        <div className="relative flex items-center justify-center my-4">
          {/* Anillos de ondas sonoras cuando está escuchando, interrumpiendo o hablando */}
          {isInterrupted && (
            <>
              <span className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-amber-500/20 animate-ping pointer-events-none duration-1000" />
              <span className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full border border-amber-500/40 animate-pulse pointer-events-none" />
            </>
          )}

          {listening && (
            <>
              <span className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-rose-500/15 animate-ping pointer-events-none duration-1000" />
              <span className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full border border-rose-500/30 animate-pulse pointer-events-none" />
              <span className="absolute w-60 h-60 sm:w-72 sm:h-72 rounded-full border border-rose-500/15 pointer-events-none" />
            </>
          )}

          {speaking && !isInterrupted && (
            <>
              <span className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-violet-500/20 animate-pulse pointer-events-none duration-700" />
              <span className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full border border-violet-500/35 animate-ping pointer-events-none duration-1000" />
            </>
          )}

          {isTyping && (
            <span className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin pointer-events-none" />
          )}

          {/* Botón Central Heroico */}
          <button
            type="button"
            onClick={() => {
              if (speaking || isInterrupted) {
                stopSpeaking();
              } else if (!isTyping && !transcribing) {
                toggleMic();
              }
            }}
            disabled={!canListen || isTyping || transcribing}
            style={(listening || isInterrupted) && useWhisper ? { transform: `scale(${1 + micLevel * 0.12})` } : undefined}
            className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center transition-all duration-300 cursor-pointer relative select-none shadow-[0_15px_50px_rgba(0,0,0,0.6)] ${
              isInterrupted
                ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 text-slate-950 ring-8 ring-amber-400/40 scale-105 shadow-[0_0_80px_rgba(245,158,11,0.5)]'
                : listening
                ? 'bg-gradient-to-tr from-rose-600 via-red-600 to-rose-700 text-white ring-8 ring-rose-500/30 scale-105 shadow-[0_0_80px_rgba(244,63,94,0.45)]'
                : speaking
                ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 text-slate-950 ring-8 ring-amber-500/30 shadow-[0_0_80px_rgba(245,158,11,0.4)] active:scale-95'
                : transcribing
                ? 'bg-gradient-to-tr from-cyan-700 via-indigo-700 to-violet-800 text-white ring-8 ring-cyan-500/20 shadow-[0_0_60px_rgba(6,182,212,0.3)]'
                : isTyping
                ? 'bg-gradient-to-tr from-violet-700 via-indigo-700 to-cyan-800 text-white ring-8 ring-cyan-500/20 shadow-[0_0_60px_rgba(6,182,212,0.3)]'
                : 'bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-800 hover:from-violet-500 hover:via-indigo-500 hover:to-purple-700 text-white ring-8 ring-violet-500/20 hover:ring-violet-500/40 active:scale-95 shadow-[0_0_70px_rgba(139,92,246,0.35)]'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={
              transcribing
                ? 'Transcribiendo audio con Groq Whisper...'
                : isInterrupted
                ? 'Escuchando tu interrupción... di tu comentario'
                : listening
                ? 'Pulsar o presionar Espacio para detener y enviar'
                : speaking
                ? 'Pulsar o presionar Espacio para callar a Thea'
                : isInitialState
                ? mode === 'exam'
                  ? 'Pulsar o presionar Espacio para empezar la lección oral'
                  : 'Pulsar o presionar Espacio para iniciar la conversación'
                : 'Pulsar o presionar Espacio para hablar'
            }
          >
            {isInterrupted ? (
              <>
                <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950 animate-bounce" />
                <span className="text-[10px] sm:text-xs font-black mt-2 uppercase tracking-widest text-slate-950">
                  Oyéndote
                </span>
              </>
            ) : listening ? (
              <>
                <Square className="w-8 h-8 sm:w-10 sm:h-10 fill-white text-white" />
                <span className="text-[10px] sm:text-xs font-black mt-2 uppercase tracking-widest">
                  Detener
                </span>
              </>
            ) : speaking ? (
              <>
                <VolumeX className="w-8 h-8 sm:w-10 sm:h-10" />
                <span className="text-[10px] sm:text-xs font-black mt-2 uppercase tracking-widest">
                  Callar
                </span>
              </>
            ) : transcribing ? (
              <>
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-cyan-300" />
                <span className="text-[10px] sm:text-xs font-black mt-2 uppercase tracking-widest text-cyan-300">
                  Transcribiendo
                </span>
              </>
            ) : isTyping ? (
              <>
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 animate-spin" />
                <span className="text-[10px] sm:text-xs font-black mt-2 uppercase tracking-widest">
                  Pensando
                </span>
              </>
            ) : (
              <>
                <Mic className="w-9 h-9 sm:w-12 sm:h-12" />
                <span className="text-[10px] sm:text-xs font-black mt-1.5 uppercase tracking-widest">
                  {isInitialState ? 'Empezar' : 'Hablar'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Transcripción en tiempo real o instrucción interactiva */}
        <div className="w-full max-w-md mx-auto mt-6 min-h-[3rem] flex flex-col items-center justify-center">
          {isInterrupted ? (
            <p className="text-xs sm:text-sm text-amber-300 font-semibold animate-pulse">
              Thea pausó su voz: di tu duda o acotación en voz alta...
            </p>
          ) : input ? (
            <p className="text-sm sm:text-base text-rose-300 font-semibold animate-pulse px-4 py-2 rounded-2xl bg-rose-950/40 border border-rose-500/30">
              “{input}”
            </p>
          ) : listening ? (
            <p className="text-xs sm:text-sm text-rose-300 font-semibold animate-pulse">
              Escuchando tu voz... habla y pulsa el botón (o suelta Espacio) para enviar
            </p>
          ) : speaking ? (
            <p className="text-xs sm:text-sm text-amber-300 font-medium">
              Thea está hablando... puedes interrumpir hablando en voz alta o con Espacio
            </p>
          ) : transcribing ? (
            <p className="text-xs sm:text-sm text-cyan-300 font-medium animate-pulse">
              Transcribiendo tu respuesta...
            </p>
          ) : isTyping ? (
            <p className="text-xs sm:text-sm text-cyan-300 font-medium animate-pulse">
              Evaluando tu respuesta con IA...
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-slate-400 font-medium">
              {handsFree ? (
                <span className="text-emerald-400 font-semibold">
                  Manos libres activo: Thea escuchará automáticamente cuando termine
                </span>
              ) : (
                <span>
                  Presiona o mantén pulsada la tecla <strong className="text-white underline decoration-violet-500 decoration-2">Espacio</strong> para responder
                </span>
              )}
            </p>
          )}

          {/* Aviso normal de voz si existiera */}
          {voiceError && voiceError !== 'brave-blocked' && (
            <p className="text-xs text-rose-400 mt-2 bg-rose-950/60 px-3 py-1 rounded-xl border border-rose-500/30">
              {voiceError}
            </p>
          )}
        </div>
      </main>

      {/* ── BARRA INFERIOR DISCRETA CON OPCIONES SECUNDARIAS ── */}
      <footer className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-t border-thea-border/40 text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          {/* Conmutador Modo Manos Libres */}
          {canListen && (
            <button
              type="button"
              onClick={() => setHandsFree((h) => !h)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                handsFree
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                  : 'bg-thea-surface/80 border-thea-border/70 text-slate-400 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${handsFree ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span>Manos Libres: {handsFree ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {/* Botón para ver historial de preguntas */}
          {messages.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-thea-border/70 bg-thea-surface/80 hover:bg-thea-surface text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-violet-400" />
              <span>Historial ({messages.length - 1})</span>
            </button>
          )}
        </div>

        {/* Botón para desplegar teclado discreto */}
        <button
          type="button"
          onClick={() => setShowTextInput((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>{showTextInput ? 'Ocultar teclado' : 'Responder por escrito'}</span>
        </button>
      </footer>

      {/* ── BARRA DE TEXTO DESPLEGABLE (OPCIONAL) ── */}
      {showTextInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="mt-2 flex items-center gap-2 p-2.5 bg-thea-surfaceLight/60 border border-thea-border rounded-2xl animate-fadeIn shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu respuesta aquí si prefieres no usar el micrófono..."
            className="flex-1 bg-thea-bg/90 border border-thea-border rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-violet-900/20 active:scale-95"
            title="Enviar respuesta"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* ── MODAL LATERAL DE HISTORIAL DE PREGUNTAS (ON-DEMAND) ── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-fadeIn">
          <div className="w-full max-w-md bg-thea-surface border-l border-thea-border h-full flex flex-col shadow-2xl p-4 sm:p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-thea-border/60">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-violet-400" />
                <h3 className="font-bold text-sm text-white">Historial de la Lección Oral</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl text-xs leading-relaxed ${
                    m.sender === 'thea'
                      ? 'bg-thea-surfaceLight/70 border border-thea-border/60 text-slate-200'
                      : 'bg-violet-600/25 border border-violet-500/30 text-violet-100 ml-4'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                    <span>{m.sender === 'thea' ? 'Tutora Oral' : 'Tú'}</span>
                    <span>{m.timestamp}</span>
                  </div>
                  <FormattedText text={m.text} />
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-thea-border/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Cerrar historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
