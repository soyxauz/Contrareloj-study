import React, { useState, useRef, useEffect } from 'react';
import type { StudyKit } from '../types';
import {
  Send,
  Bot,
  User,
  Mic,
  Volume2,
  VolumeX,
  GraduationCap,
  MessageSquare,
  Keyboard,
  Square,
  Zap,
  AlertTriangle,
  Check,
  RotateCcw,
} from 'lucide-react';
import { askTheaAI, getGrokApiKey, getGrokModel } from '../services/aiService';
import { synthesizeAzureEdgeSpeech, prefetchAzureEdgeSpeech } from '../services/azureEdgeTtsService';
import { FormattedText } from './FormattedText';

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

const VOICE = 'es-ES-ElviraNeural';

// Dialectos estándar de Chromium de escritorio
const getPreferredSpeechLang = (): string => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language.toLowerCase();
    if (nav === 'es-419' || nav === 'es-us') return 'es-419';
  }
  return 'es-ES';
};

// Directiva estricta para el examinador oral interactivo
const ORAL_DIRECTIVE = `[MODO LECCIÓN ORAL: tu respuesta se leerá en voz alta de inmediato]
Reglas obligatorias:
1. Máximo 2 o 3 frases cortas y concisas.
2. NUNCA uses listas, viñetas, tablas, títulos markdown ni símbolos raros.
3. Evalúa con claridad si la respuesta del estudiante fue correcta, parcial o incorrecta. Si se equivoca, dale una pista breve sin resolverlo todo.
4. Concluye SIEMPRE formulando UNA sola pregunta de nivel examen sobre el material.
5. Si el estudiante dice "empezar", haz la primera pregunta directamente.

El estudiante responde: `;

const SR: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

/** Divide el texto en oraciones breves para sintetizar audio rápidamente */
function splitForSpeech(text: string, max = 260): string[] {
  const clean = text.replace(/[*_#`~>|]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length > max && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = (current + ' ' + s).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export const OralLessonView: React.FC<OralLessonViewProps> = ({
  kit,
  onOpenAISettings,
  onNavigateToChat,
}) => {
  const grokKey = getGrokApiKey();
  const grokModel = getGrokModel();
  const hasGrok = Boolean(grokKey);

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
  const [speechLang, setSpeechLang] = useState<string>(getPreferredSpeechLang);
  const [copiedBrave, setCopiedBrave] = useState(false);

  // Refs de sincronización
  const voiceOnRef = useRef(voiceOn);
  const handsFreeRef = useRef(handsFree);
  const listeningRef = useRef(listening);
  const speakingRef = useRef(speaking);
  const isTypingRef = useRef(isTyping);
  const isSpacePressedRef = useRef(false);
  const spaceStartTimeRef = useRef(0);
  const speechLangRef = useRef<string>(getPreferredSpeechLang());
  const fallbackAttemptsRef = useRef(0);
  const isBraveRef = useRef(false);
  const hasCheckedMicPermissionRef = useRef(false);

  voiceOnRef.current = voiceOn;
  handsFreeRef.current = handsFree;
  listeningRef.current = listening;
  speakingRef.current = speaking;
  isTypingRef.current = isTyping;
  speechLangRef.current = speechLang;

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const speakToken = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const handleSendRef = useRef<(display: string, prompt?: string) => Promise<void>>(async () => {});

  const canListen = Boolean(SR);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

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

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      speakToken.current++;
      try {
        recognitionRef.current?.abort();
      } catch {}
      audioRef.current?.pause();
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    };
  }, []);

  // ───────────────────────── CONTROL DE ESPACIO (PUSH-TO-TALK) ─────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (handsFreeRef.current) return;

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
        if (e.repeat) return;

        isSpacePressedRef.current = true;
        spaceStartTimeRef.current = Date.now();

        if (speakingRef.current) {
          stopSpeaking();
        }

        if (listeningRef.current) {
          stopListening();
        } else {
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (handsFreeRef.current) return;

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
        if (isSpacePressedRef.current) {
          isSpacePressedRef.current = false;
          const heldDuration = Date.now() - spaceStartTimeRef.current;
          if (heldDuration >= 300 && listeningRef.current) {
            stopListening();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ───────────────────────── VOZ: SALIDA (TTS) ─────────────────────────
  const stopSpeaking = () => {
    speakToken.current++;
    audioRef.current?.pause();
    audioResolveRef.current?.();
    audioResolveRef.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    setSpeaking(false);
  };

  const playUrl = (url: string) =>
    new Promise<void>((resolve) => {
      const a = new Audio(url);
      audioRef.current = a;
      audioResolveRef.current = resolve;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });

  const speakWithBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      if (typeof speechSynthesis === 'undefined') return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
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
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (token !== speakToken.current) return false;
        if (i + 1 < chunks.length) prefetchAzureEdgeSpeech(chunks[i + 1], VOICE);
        let url: string | null = null;
        try {
          url = await synthesizeAzureEdgeSpeech(chunks[i], VOICE);
        } catch {
          url = null;
        }
        if (token !== speakToken.current) return false;
        if (url) await playUrl(url);
        else await speakWithBrowser(chunks[i]);
      }
      return token === speakToken.current;
    } finally {
      if (token === speakToken.current) setSpeaking(false);
    }
  };

  // ───────────────────────── VOZ: ENTRADA (MICROFONO) ─────────────────────────
  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
    }
    setListening(false);
  };

  const verifyMicrophoneAccess = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return true;
    }
    if (hasCheckedMicPermissionRef.current) {
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      hasCheckedMicPermissionRef.current = true;
      return true;
    } catch (err: any) {
      setListening(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setVoiceError(
          'Permiso de micrófono denegado. Haz clic en el candado de la barra de direcciones y autoriza el micrófono.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setVoiceError('No se detectó ningún micrófono conectado en tu equipo.');
      } else {
        setVoiceError(`Error de acceso al micrófono: ${err.message || err.name}`);
      }
      return false;
    }
  };

  const startListening = async (isFallback = false) => {
    if (!SR) return;
    if (!isFallback) {
      fallbackAttemptsRef.current = 0;
    }
    stopSpeaking();
    setVoiceError('');

    const hasMic = await verifyMicrophoneAccess();
    if (!hasMic) return;

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
      rec.continuous = false;

      rec.onresult = (e: any) => {
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (final.trim()) {
          setInput('');
          handleSendRef.current(final.trim());
        } else {
          setInput(interim);
        }
      };

      rec.onerror = (e: any) => {
        setListening(false);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setVoiceError('Permite el acceso al micrófono en el navegador para activar la voz.');
        } else if (e.error === 'network') {
          const isBrave = Boolean(
            isBraveRef.current || (navigator as any).brave || (window as any).brave
          );
          if (isBrave) {
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
              startListening(true);
            }, 300);
            return;
          }

          setShowTextInput(true);
          setVoiceError(
            'El servicio de transcripción de voz del navegador no pudo contactar con los servidores de Google (error de red). Puedes usar el teclado para responder o reintentar.'
          );
          setTimeout(() => setVoiceError(''), 7000);
        } else if (e.error === 'no-speech') {
        } else if (e.error === 'aborted') {
        } else {
          setVoiceError(`Aviso de micrófono: ${e.error}`);
          setTimeout(() => setVoiceError(''), 5000);
        }
      };

      rec.onend = () => setListening(false);

      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopListening();
    } else {
      startListening();
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

    const queryForAI = promptText ?? (ORAL_DIRECTIVE + displayText);

    let replyText: string;
    try {
      replyText = await askTheaAI(queryForAI, kit, previousHistory);
    } catch {
      replyText = `He analizado tu respuesta sobre "${kit.title}". ¿Podrías resumir la idea central o reformularla brevemente?`;
    }

    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), sender: 'thea', text: replyText, timestamp: nowLabel() },
    ]);
    setIsTyping(false);

    if (voiceOnRef.current) {
      const finished = await speak(replyText);
      if (finished && handsFreeRef.current && SR) {
        startListening();
      }
    }
  };
  handleSendRef.current = handleSend;

  const startOralLesson = () => handleSend('Empezar lección oral', ORAL_DIRECTIVE + 'empezar');

  const clearConversation = () => {
    stopSpeaking();
    stopListening();
    setMessages([messages[0]]);
  };

  const statusLabel = listening
    ? 'Escuchando tu respuesta... habla ahora'
    : speaking
    ? 'Thea está hablando...'
    : isTyping
    ? 'Evaluando con IA...'
    : '';

  return (
    <div className="relative max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-6 h-[calc(100vh-5.5rem)] min-h-[640px] flex flex-col">
      {/* Fondo ambiental sutil tipo cabina oral */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-600/15 via-thea-bg to-thea-bg blur-2xl pointer-events-none" />

      {/* Contenedor Flotante Elevado */}
      <div className="flex-1 flex flex-col bg-thea-surface/90 backdrop-blur-2xl border border-thea-border/80 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.65)] overflow-hidden relative">
        {/* Cabecera Flotante */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-thea-border/60 bg-thea-surfaceLight/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-900/40">
              <Mic className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-sm sm:text-base text-white">
                  Lección Oral & Práctica de Voz
                </h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-600/25 text-violet-300 border border-violet-500/40">
                  Modo Examen Oral
                </span>
                {hasGrok ? (
                  <button
                    type="button"
                    onClick={onOpenAISettings}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1 hover:bg-violet-500/30 transition-colors cursor-pointer"
                    title={`Motor de voz activo: xAI Grok (${grokModel}). Haz clic para configurar.`}
                  >
                    <Zap className="w-3 h-3 text-violet-400" />
                    <span>xAI Grok ({grokModel})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenAISettings}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 hover:text-violet-300 border border-slate-700 hover:border-violet-500/40 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Configurar xAI Grok para respuestas ultrarrápidas de voz"
                  >
                    <span>Motor: Ollama Local</span>
                    <span className="text-violet-400 underline font-semibold">+ Conectar xAI Grok</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-md">
                Material activo: <strong className="text-slate-300">{kit.title}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón para ir al Chat Tutor de texto */}
            {onNavigateToChat && (
              <button
                type="button"
                onClick={onNavigateToChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-thea-border/80 bg-thea-surface hover:bg-thea-surfaceLight text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
                title="Cambiar al Chat de dudas escritas"
              >
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ir al Chat Tutor</span>
              </button>
            )}

            {/* Alternar Voz */}
            <button
              type="button"
              onClick={() => {
                if (voiceOn) stopSpeaking();
                setVoiceOn((v) => !v);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                voiceOn
                  ? 'border-violet-500 text-violet-300 bg-violet-600/20 shadow-sm'
                  : 'border-thea-border text-slate-400 hover:text-white hover:bg-thea-surfaceLight'
              }`}
              title={voiceOn ? 'Respuesta hablada activa' : 'Activar respuesta hablada'}
            >
              {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Reiniciar lección oral */}
            <button
              type="button"
              onClick={clearConversation}
              className="p-2 rounded-xl border border-thea-border text-slate-400 hover:text-rose-400 hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              title="Reiniciar lección oral"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-barra de controles de audio y estado */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 bg-thea-surface/40 border-b border-thea-border/40 text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            {canListen && (
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={handsFree}
                  onChange={(e) => setHandsFree(e.target.checked)}
                  className="rounded border-thea-border bg-thea-bg text-violet-600 focus:ring-0 cursor-pointer"
                />
                <span className="font-medium">Modo Manos Libres</span>
              </label>
            )}

            {canListen && (
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span className="hidden sm:inline">Idioma:</span>
                <select
                  value={speechLang}
                  onChange={(e) => {
                    const l = e.target.value;
                    setSpeechLang(l);
                    speechLangRef.current = l;
                    fallbackAttemptsRef.current = 0;
                  }}
                  className="bg-thea-surface border border-thea-border/70 text-slate-300 text-[11px] rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  title="Dialecto del reconocimiento de voz"
                >
                  <option value="es-ES">Español (es-ES)</option>
                  <option value="es-419">Español Latino (es-419)</option>
                  <option value="es-US">Español EE.UU. (es-US)</option>
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowTextInput((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>{showTextInput ? 'Ocultar teclado' : 'Escribir respuesta'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {statusLabel ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 animate-fadeIn">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>{statusLabel}</span>
              </span>
            ) : speaking ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                <Volume2 className="w-3.5 h-3.5 animate-pulse text-violet-400" />
                <span>Thea habla</span>
              </span>
            ) : !handsFree ? (
              <span className="hidden sm:inline-block text-[11px] text-slate-400">
                Atajo: pulsa o mantén <kbd className="px-1.5 py-0.5 rounded bg-thea-surface border border-thea-border text-slate-300 font-mono text-[10px]">Espacio</kbd>
              </span>
            ) : null}
          </div>
        </div>

        {/* Banner especial para Brave Browser */}
        {voiceError === 'brave-blocked' && (
          <div className="px-4 py-3 bg-amber-950/80 border-b border-amber-500/50 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn shrink-0">
            <div className="flex-1">
              <p className="font-bold text-amber-100 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Brave Browser bloquea el reconocimiento de voz de Google por privacidad</span>
              </p>
              <p className="mt-1 text-[11px] text-amber-300/90 leading-relaxed">
                Para permitir el micrófono en Brave: abre una nueva pestaña, pega{' '}
                <code className="px-1.5 py-0.5 rounded bg-black/40 text-amber-200 font-mono text-[10px]">
                  brave://settings/privacy
                </code>{' '}
                y activa la opción{' '}
                <strong className="text-white">
                  "Usar los servicios de Google para el reconocimiento de voz"
                </strong>
                .
              </p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('brave://settings/privacy');
                  setCopiedBrave(true);
                  setTimeout(() => setCopiedBrave(false), 2500);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-100 font-medium text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {copiedBrave ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>¡Ruta copiada!</span>
                  </>
                ) : (
                  <span>Copiar enlace de ajuste</span>
                )}
              </button>
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

        {/* Mensaje de aviso de error regular de micrófono */}
        {voiceError && voiceError !== 'brave-blocked' && (
          <div className="px-4 py-2 bg-rose-950/70 border-b border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2 animate-fadeIn shrink-0">
            <span>{voiceError}</span>
            <button
              type="button"
              onClick={() => setVoiceError('')}
              className="text-xs text-rose-300 hover:text-white underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Área de mensajes de la lección oral */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[88%] sm:max-w-[80%] animate-fadeIn ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                  msg.sender === 'thea'
                    ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md'
                    : 'bg-indigo-700 text-white shadow-md'
                }`}
              >
                {msg.sender === 'thea' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div
                className={`rounded-2xl p-4 shadow-sm text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white rounded-tr-none'
                    : 'bg-thea-surfaceLight/80 border border-thea-border/70 text-slate-200 rounded-tl-none shadow-md backdrop-blur-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1.5 text-[10px] opacity-70">
                  <span className="font-semibold uppercase tracking-wider">
                    {msg.sender === 'thea' ? 'Tutora Oral Thea' : 'Tu Respuesta'}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                <FormattedText text={msg.text} />
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 max-w-[80%] animate-fadeIn">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-thea-surfaceLight/80 border border-thea-border/70 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-slate-400 ml-1">Thea está formulando tu pregunta...</span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Botón rápido para iniciar lección oral */}
        {messages.length <= 1 && (
          <div className="px-4 py-2 border-t border-thea-border/40 bg-thea-surfaceLight/20 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
            <button
              type="button"
              onClick={startOralLesson}
              disabled={isTyping}
              className="text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold px-4 py-2 rounded-xl whitespace-nowrap transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer shadow-md shadow-violet-900/20 active:scale-95"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Empezar lección oral guiada</span>
            </button>
          </div>
        )}

        {/* ── BOTÓN DE MICRÓFONO EN EL CENTRO (HERO CONTROLLER) ── */}
        <div className="flex flex-col items-center justify-center pt-3 pb-4 px-4 bg-thea-surface border-t border-thea-border/60 shrink-0">
          <div className="flex items-center justify-center gap-5 w-full max-w-lg relative">
            {/* Botón flotante central de micrófono */}
            <div className="relative flex items-center justify-center">
              {listening && (
                <>
                  <span className="absolute w-24 h-24 rounded-full bg-rose-500/20 animate-ping pointer-events-none" />
                  <span className="absolute w-28 h-28 rounded-full border-2 border-rose-500/30 animate-pulse pointer-events-none" />
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  if (speaking) {
                    stopSpeaking();
                  } else {
                    toggleMic();
                  }
                }}
                disabled={!canListen}
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xl relative select-none ${
                  listening
                    ? 'bg-gradient-to-tr from-rose-600 to-red-600 text-white ring-4 ring-rose-500/40 scale-105 shadow-rose-900/50'
                    : speaking
                    ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 ring-4 ring-amber-500/40 shadow-amber-900/40 active:scale-95'
                    : 'bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-700 hover:from-violet-500 hover:to-indigo-500 text-white ring-4 ring-violet-500/20 hover:ring-violet-500/40 active:scale-95 shadow-violet-900/40'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={
                  listening
                    ? 'Pulsar para detener y enviar'
                    : speaking
                    ? 'Pulsar para interrumpir la voz'
                    : 'Pulsar para hablar (o mantén la tecla Espacio)'
                }
              >
                {listening ? (
                  <>
                    <Square className="w-6 h-6 fill-white" />
                    <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">
                      Detener
                    </span>
                  </>
                ) : speaking ? (
                  <>
                    <VolumeX className="w-6 h-6" />
                    <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">
                      Callar
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
                    <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">
                      Hablar
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Instrucción y retroalimentación interactiva del botón central */}
          <p className="text-[11px] sm:text-xs text-slate-400 mt-2.5 font-medium text-center max-w-md">
            {listening ? (
              <span className="text-rose-300 font-semibold animate-pulse">
                Escuchando tu respuesta... suelta Espacio o pulsa el botón para enviar
              </span>
            ) : speaking ? (
              <span className="text-amber-300 font-medium">
                Thea está hablando... pulsa el botón o pulsa Espacio para interrumpir
              </span>
            ) : handsFree ? (
              <span className="text-slate-300 font-medium">
                Manos libres activo: Thea escuchará automáticamente cuando termine de hablar
              </span>
            ) : (
              <span>
                Presiona o mantén <strong className="text-white underline decoration-violet-500 decoration-2">Espacio</strong> para hablar sin tocar la pantalla
              </span>
            )}
          </p>
        </div>

        {/* ── BARRA DE TEXTO OPCIONAL ── */}
        {showTextInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2 p-3 bg-thea-surfaceLight/50 border-t border-thea-border/70 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                listening
                  ? 'Transcribiendo audio en tiempo real...'
                  : 'Escribe tu respuesta oral aquí si no deseas usar micrófono...'
              }
              className="flex-1 bg-thea-bg/90 border border-thea-border rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-violet-900/20 active:scale-95"
              title="Enviar respuesta"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
