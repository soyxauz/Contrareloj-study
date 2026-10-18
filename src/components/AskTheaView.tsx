import React, { useState, useRef, useEffect } from 'react';
import type { StudyKit } from '../types';
import {
  MessageSquareText,
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  GraduationCap,
  MessageSquare,
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
const SPEECH_LANG = 'es-EC'; // Cambiar a 'es-ES' si el reconocimiento local lo requiere

// Instrucción extra que se antepone solo en modo lección oral (no se muestra al usuario)
const ORAL_DIRECTIVE = `[MODO LECCIÓN ORAL: tu respuesta se leerá en voz alta]
Reglas: máximo 3 frases cortas, sin listas, tablas ni símbolos raros. Evalúa la respuesta del estudiante (correcta, parcial o incorrecta); si falla, da una pista breve sin revelar todo. Termina SIEMPRE con UNA sola pregunta nueva sobre el material, subiendo la dificultad si acierta. Si el estudiante dice "empezar", haz la primera pregunta.

El estudiante dice: `;

const SR: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

/** Divide el texto en trozos cortos para que cada audio se sintetice rápido */
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
      timestamp: 'Ahora'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<TutorMode>('chat');
  const [voiceOn, setVoiceOn] = useState(false);
  const [handsFree, setHandsFree] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  // Refs para evitar valores obsoletos dentro de callbacks asíncronos
  const modeRef = useRef(mode);
  const voiceOnRef = useRef(voiceOn);
  const handsFreeRef = useRef(handsFree);
  modeRef.current = mode;
  voiceOnRef.current = voiceOn;
  handsFreeRef.current = handsFree;

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const speakToken = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const handleSendRef = useRef<(display: string, prompt?: string) => Promise<void>>(async () => {});

  const canListen = Boolean(SR);

  const quickPrompts = [
    'Explícame la diferencia entre el Complejo I y el Complejo II',
    'Dame una regla mnemotécnica para recordar el Ciclo de Krebs',
    '¿Qué pasa en la célula si falta oxígeno?',
    'Hazme una pregunta sorpresa de nivel examen'
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  // Limpieza al salir de la vista
  useEffect(() => {
    return () => {
      speakToken.current++;
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
      audioRef.current?.pause();
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
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
    new Promise<void>(resolve => {
      const a = new Audio(url);
      audioRef.current = a;
      audioResolveRef.current = resolve;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });

  const speakWithBrowser = (text: string) =>
    new Promise<void>(resolve => {
      if (typeof speechSynthesis === 'undefined') return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });

  /** Devuelve true si terminó de hablar sin que lo interrumpieran */
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
          url = null; // si falla Azure, usamos la voz del navegador
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

  // ───────────────────────── VOZ: ENTRADA ─────────────────────────
  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  };

  const startListening = () => {
    if (!SR) return;
    stopSpeaking();
    setVoiceError('');
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }

    const rec = new SR();
    rec.lang = SPEECH_LANG;
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
        setVoiceError('Permite el acceso al micrófono en el navegador para usar la voz.');
      } else if (e.error === 'network') {
        setVoiceError('El reconocimiento de voz necesita conexión a internet.');
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

  const toggleMic = () => (listening ? stopListening() : startListening());

  // ───────────────────────── CHAT ─────────────────────────
  const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleSend = async (displayText: string, promptText?: string) => {
    if (!displayText.trim() || isTyping) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: displayText,
      timestamp: nowLabel()
    };

    const previousHistory = messages;
    setMessages(prev => [...prev, newMsg]);
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

    setMessages(prev => [
      ...prev,
      { id: (Date.now() + 1).toString(), sender: 'thea', text: replyText, timestamp: nowLabel() }
    ]);
    setIsTyping(false);

    if (voiceOnRef.current || isOral) {
      const finished = await speak(replyText);
      // En lección oral con manos libres, vuelve a escuchar solo cuando Thea termina de hablar
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white">
              TUTOR IA INTERACTIVO
            </span>
            <span className="text-xs text-slate-400 font-medium">Conversación y lección oral</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquareText className="w-6 h-6 text-violet-400" />
            <span>Asistente IA Contrareloj</span>
          </h1>
        </div>

        <button
          onClick={clearConversation}
          className="p-2 rounded-xl border border-thea-border text-slate-400 hover:text-rose-400 hover:bg-thea-surfaceLight transition-colors cursor-pointer"
          title="Limpiar conversación"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Selector de modo + controles de voz */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-2xl border border-thea-border bg-thea-surface p-1">
          <button
            onClick={() => switchMode('chat')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'chat' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Conversación
          </button>
          <button
            onClick={() => switchMode('oral')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'oral' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Lección oral
          </button>
        </div>

        <button
          onClick={() => {
            if (voiceOn) stopSpeaking();
            setVoiceOn(v => !v);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors cursor-pointer ${
            voiceOn
              ? 'border-violet-500 text-violet-300 bg-violet-600/10'
              : 'border-thea-border text-slate-400 hover:text-white'
          }`}
          title="Que Thea responda en voz alta"
        >
          {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          Respuesta en voz
        </button>

        {mode === 'oral' && canListen && (
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={handsFree}
              onChange={e => setHandsFree(e.target.checked)}
              className="accent-violet-500"
            />
            Manos libres
          </label>
        )}

        {statusLabel && (
          <span className="ml-auto text-xs font-medium text-amber-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {statusLabel}
          </span>
        )}
      </div>

      {!canListen && (
        <p className="text-xs text-amber-300 mb-3">
          Tu navegador no admite reconocimiento de voz. Usa Chrome o Edge para hablar; el modo texto y la voz de Thea siguen funcionando.
        </p>
      )}
      {voiceError && <p className="text-xs text-rose-400 mb-3">{voiceError}</p>}

      {/* Chat Container */}
      <div className="bg-thea-surface border border-thea-border rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col h-[520px]">
        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[85%] ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                msg.sender === 'thea'
                  ? 'bg-gradient-to-tr from-violet-600 to-amber-400 text-slate-950'
                  : 'bg-violet-700 text-white'
              }`}>
                {msg.sender === 'thea' ? <Bot className="w-4 h-4 text-slate-950" /> : <User className="w-4 h-4" />}
              </div>

              <div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-violet-600 text-white rounded-tr-none'
                    : 'bg-thea-surfaceLight border border-thea-border text-slate-200 rounded-tl-none'
                }`}>
                  <FormattedText text={msg.text} />
                </div>
                <span className={`text-[10px] text-slate-500 mt-1 block ${
                  msg.sender === 'user' ? 'text-right' : 'text-left'
                }`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-amber-400 flex items-center justify-center shrink-0 text-slate-950">
                <Sparkles className="w-4 h-4 animate-spin text-slate-950" />
              </div>
              <div className="p-4 rounded-2xl bg-thea-surfaceLight border border-thea-border text-xs text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                <span className="ml-2 font-medium">Contrareloj Study está redactando la explicación...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Quick Prompts / Inicio de lección oral */}
        <div className="pt-3 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {mode === 'oral' && messages.length <= 1 ? (
            <button
              onClick={startOralLesson}
              disabled={isTyping}
              className="text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold px-4 py-2 rounded-xl whitespace-nowrap transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer shadow-md shadow-violet-900/20"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Empezar lección oral</span>
            </button>
          ) : (
            quickPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="text-xs bg-thea-surfaceLight hover:bg-thea-border border border-thea-border text-slate-300 hover:text-white px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="mt-2 flex items-center gap-2 pt-2 border-t border-thea-border"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              listening
                ? 'Te escucho...'
                : mode === 'oral'
                ? 'Responde hablando o escribe tu respuesta...'
                : 'Pregunta cualquier detalle sobre tu material de estudio...'
            }
            className="flex-1 bg-thea-bg border border-thea-border rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                listening
                  ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                  : 'border-thea-border text-slate-300 hover:text-white hover:bg-thea-surfaceLight'
              }`}
              title={listening ? 'Detener' : 'Hablar'}
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold transition-all disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
