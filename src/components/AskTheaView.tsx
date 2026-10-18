import React, { useState, useRef, useEffect } from 'react';
import type { StudyKit } from '../types';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  Mic,
  Volume2,
  VolumeX,
  GraduationCap,
  MessageSquare,
  Keyboard,
  Square,
} from 'lucide-react';
import { askTheaAI } from '../services/aiService';
import { synthesizeAzureEdgeSpeech, prefetchAzureEdgeSpeech } from '../services/azureEdgeTtsService';
import { FormattedText } from './FormattedText';

interface AskTheaViewProps {
  kit: StudyKit;
}

interface Message {
  id: string;
  sender: 'thea' | 'user';
  text: string;
  timestamp: string;
}

type TutorMode = 'chat' | 'oral';

const VOICE = 'es-ES-ElviraNeural';

// Selección dinámica del idioma de reconocimiento con fallback a español estándar
const getPreferredSpeechLang = (): string => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language;
    if (nav.startsWith('es')) return nav;
  }
  return 'es-ES';
};

// Instrucción extra para la tutora en modo lección oral
const ORAL_DIRECTIVE = `[MODO LECCIÓN ORAL: tu respuesta se leerá en voz alta]
Reglas: máximo 3 frases cortas, sin listas, tablas ni símbolos raros. Evalúa la respuesta del estudiante (correcta, parcial o incorrecta); si falla, da una pista breve sin revelar todo. Termina SIEMPRE con UNA sola pregunta nueva sobre el material, subiendo la dificultad si acierta. Si el estudiante dice "empezar", haz la primera pregunta.

El estudiante dice: `;

const SR: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

/** Divide el texto en trozos cortos para que cada fragmento de audio se sintetice rápido */
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

export const AskTheaView: React.FC<AskTheaViewProps> = ({ kit }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'thea',
      text: `¡Hola! Soy Contrareloj Study, tu tutor de estudio personal impulsado por IA. Tengo indexados todos los materiales de "${kit.title}". ¿Qué concepto o duda te gustaría que te explique a fondo?`,
      timestamp: 'Ahora',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<TutorMode>('chat');
  const [voiceOn, setVoiceOn] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [showTextInput, setShowTextInput] = useState(true);
  const [speechLang, setSpeechLang] = useState<string>(getPreferredSpeechLang);

  // Refs para evitar variables obsoletas en closures asíncronos
  const modeRef = useRef(mode);
  const voiceOnRef = useRef(voiceOn);
  const handsFreeRef = useRef(handsFree);
  const listeningRef = useRef(listening);
  const speakingRef = useRef(speaking);
  const isTypingRef = useRef(isTyping);
  const isSpacePressedRef = useRef(false);
  const spaceStartTimeRef = useRef(0);
  const triedLanguageFallbackRef = useRef(false);

  modeRef.current = mode;
  voiceOnRef.current = voiceOn;
  handsFreeRef.current = handsFree;
  listeningRef.current = listening;
  speakingRef.current = speaking;
  isTypingRef.current = isTyping;

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const speakToken = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const handleSendRef = useRef<(display: string, prompt?: string) => Promise<void>>(async () => {});

  const canListen = Boolean(SR);

  const quickPrompts = [
    'Explícame la diferencia entre los conceptos clave del tema',
    'Dame una regla mnemotécnica para recordar este contenido',
    '¿Cuál es la causa o mecanismo principal de este proceso?',
    'Hazme una pregunta sorpresa de nivel examen',
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

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

  // ───────────────────────── CONTROL DE ESPACIO (PUSH-TO-TALK / TAP) ─────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si el modo manos libres está activo, no interceptar la tecla espacio
      if (handsFreeRef.current) return;

      // Si el usuario está escribiendo en un input, textarea o contenido editable, permitir espacio normal
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
        if (e.repeat) return; // Evitar disparos repetidos mientras se sostiene

        isSpacePressedRef.current = true;
        spaceStartTimeRef.current = Date.now();

        // Si Thea está hablando, detener la voz al pulsar espacio
        if (speakingRef.current) {
          stopSpeaking();
        }

        // Si ya está escuchando, el usuario está alternando para detener
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
          // Si el usuario sostuvo espacio durante más de 300ms (Push-to-Talk clásico), detener al soltar
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

  // ───────────────────────── VOZ: SALIDA ─────────────────────────
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
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  };

  const startListening = () => {
    if (!SR) return;
    stopSpeaking();
    setVoiceError('');
    try {
      recognitionRef.current?.abort();
    } catch {}

    const rec = new SR();
    rec.lang = speechLang;
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
        // Fallback al dialecto estándar es-ES si falló el dialecto regional
        if (!triedLanguageFallbackRef.current && speechLang !== 'es-ES') {
          triedLanguageFallbackRef.current = true;
          setSpeechLang('es-ES');
          setTimeout(() => {
            startListening();
          }, 250);
          return;
        }
        setVoiceError(
          'El servicio de transcripción de voz del navegador no pudo contactar con el servidor. Puedes escribir tu respuesta o reintentar en unos segundos.'
        );
        setTimeout(() => setVoiceError(''), 6000);
      } else if (e.error === 'no-speech') {
        // No alertar de forma invasiva si solo hubo silencio
      } else {
        setVoiceError(`Aviso de micrófono: ${e.error}`);
        setTimeout(() => setVoiceError(''), 5000);
      }
    };

    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    try {
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

    const isOral = modeRef.current === 'oral';
    const queryForAI = promptText ?? (isOral ? ORAL_DIRECTIVE + displayText : displayText);

    let replyText: string;
    try {
      replyText = await askTheaAI(queryForAI, kit, previousHistory);
    } catch {
      replyText = `He analizado tu material de estudio sobre "${kit.title}". ¿Podrías reformular tu consulta o indicar qué concepto específico deseas revisar?`;
    }

    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), sender: 'thea', text: replyText, timestamp: nowLabel() },
    ]);
    setIsTyping(false);

    if (voiceOnRef.current || isOral) {
      const finished = await speak(replyText);
      // En modo oral con manos libres, volver a escuchar automáticamente cuando Thea termine
      if (finished && modeRef.current === 'oral' && handsFreeRef.current && SR) {
        startListening();
      }
    }
  };
  handleSendRef.current = handleSend;

  const switchMode = (next: TutorMode) => {
    if (next === mode) return;
    stopSpeaking();
    stopListening();
    setMode(next);
    setVoiceOn(next === 'oral');
  };

  const startOralLesson = () => handleSend('Empezar lección oral', ORAL_DIRECTIVE + 'empezar');

  const clearConversation = () => {
    stopSpeaking();
    stopListening();
    setMessages([messages[0]]);
  };

  const statusLabel = listening
    ? 'Escuchando... habla ahora'
    : speaking
    ? 'Thea está hablando...'
    : isTyping
    ? 'Pensando...'
    : '';

  return (
    <div className="relative max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-6 h-[calc(100vh-5.5rem)] min-h-[640px] flex flex-col">
      {/* Fondo ambiental sutil tipo chat flotante */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-600/10 via-thea-bg to-thea-bg blur-2xl pointer-events-none" />

      {/* Contenedor Flotante Elevado */}
      <div className="flex-1 flex flex-col bg-thea-surface/85 backdrop-blur-2xl border border-thea-border/80 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden relative">
        {/* Cabecera Flotante */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-thea-border/60 bg-thea-surfaceLight/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-violet-900/30">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm sm:text-base text-white">
                  Asistente IA Contrareloj
                </h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">
                  {mode === 'oral' ? 'Lección Oral' : 'Conversación'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-md">
                {kit.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Selector de modo Conversación / Lección Oral */}
            <div className="inline-flex rounded-xl border border-thea-border/80 bg-thea-bg/80 p-0.5">
              <button
                type="button"
                onClick={() => switchMode('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'chat'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Conversación</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('oral')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'oral'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Lección oral</span>
              </button>
            </div>

            {/* Alternar Voz */}
            <button
              type="button"
              onClick={() => {
                if (voiceOn) stopSpeaking();
                setVoiceOn((v) => !v);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                voiceOn
                  ? 'border-violet-500 text-violet-300 bg-violet-600/20'
                  : 'border-thea-border text-slate-400 hover:text-white hover:bg-thea-surfaceLight'
              }`}
              title={voiceOn ? 'Respuesta en voz activa' : 'Activar respuesta en voz'}
            >
              {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Limpiar conversación */}
            <button
              type="button"
              onClick={clearConversation}
              className="p-2 rounded-xl border border-thea-border text-slate-400 hover:text-rose-400 hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              title="Reiniciar chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-barra de controles de audio y estado */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 bg-thea-surface/40 border-b border-thea-border/40 text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
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

            <button
              type="button"
              onClick={() => setShowTextInput((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>{showTextInput ? 'Ocultar teclado' : 'Mostrar teclado'}</span>
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
                Atajo: pulsa <kbd className="px-1.5 py-0.5 rounded bg-thea-surface border border-thea-border text-slate-300 font-mono text-[10px]">Espacio</kbd> para hablar
              </span>
            ) : null}
          </div>
        </div>

        {/* Mensaje de aviso de error de micrófono */}
        {voiceError && (
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

        {/* Área de mensajes del chat flotante */}
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
                {msg.sender === 'thea' ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4" />}
              </div>

              <div>
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-none shadow-md shadow-violet-900/20'
                      : 'bg-thea-surfaceLight/90 border border-thea-border/80 text-slate-200 rounded-tl-none shadow-md'
                  }`}
                >
                  <FormattedText text={msg.text} />
                </div>
                <span
                  className={`text-[10px] text-slate-500 mt-1 block px-1 ${
                    msg.sender === 'user' ? 'text-right' : 'text-left'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 max-w-[80%] animate-fadeIn">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 text-white shadow-md">
                <Sparkles className="w-4 h-4 animate-spin text-white" />
              </div>
              <div className="p-4 rounded-2xl bg-thea-surfaceLight/90 border border-thea-border/80 text-xs text-slate-400 flex items-center gap-2 shadow-md">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse delay-75" />
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse delay-150" />
                <span className="ml-1 font-medium">Contrareloj Study está procesando tu lección...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Prompts Rápidos o Inicio de Lección Oral */}
        <div className="px-4 py-2 border-t border-thea-border/40 bg-thea-surfaceLight/20 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
          {mode === 'oral' && messages.length <= 1 ? (
            <button
              type="button"
              onClick={startOralLesson}
              disabled={isTyping}
              className="text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold px-4 py-2 rounded-xl whitespace-nowrap transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer shadow-md shadow-violet-900/20 active:scale-95"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Empezar lección oral guiada</span>
            </button>
          ) : (
            quickPrompts.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(prompt)}
                className="text-xs bg-thea-surfaceLight/70 hover:bg-thea-surfaceLight border border-thea-border/70 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))
          )}
        </div>

        {/* ── BOTÓN DE MICRÓFONO EN EL CENTRO (HERO CONTROLLER) ── */}
        <div className="flex flex-col items-center justify-center pt-3 pb-4 px-4 bg-thea-surface border-t border-thea-border/60 shrink-0">
          <div className="flex items-center justify-center gap-5 w-full max-w-lg relative">
            {/* Botón flotante central de micrófono */}
            <div className="relative flex items-center justify-center">
              {/* Anillos de pulsación sonora cuando está escuchando */}
              {listening && (
                <>
                  <span className="absolute w-24 h-24 rounded-full bg-rose-500/20 animate-ping pointer-events-none" />
                  <span className="absolute w-28 h-28 rounded-full border-2 border-rose-500/30 animate-pulse pointer-events-none" />
                </>
              )}

              {/* Botón Principal Centrado */}
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

        {/* ── BARRA DE TEXTO OPCIONAL / INTEGRADA ── */}
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
                  : mode === 'oral'
                  ? 'Responde por voz o escribe tu respuesta aquí...'
                  : 'Escribe tu consulta o pide una explicación detallada...'
              }
              className="flex-1 bg-thea-bg/90 border border-thea-border rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-violet-900/20 active:scale-95"
              title="Enviar mensaje"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
