import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../services/themeService';
import type { StudyKit } from '../types';
import {
  Send,
    Bot,
  User,
  Trash2,
  Mic,
  HelpCircle,
  Lightbulb,
  FileQuestion,
  Settings2,
} from 'lucide-react';
import { askTheaAI } from '../services/aiService';
import { FormattedText } from './FormattedText';

interface AskTheaViewProps {
  kit: StudyKit;
  onOpenAISettings?: () => void;
  onNavigateToOral?: () => void;
}

interface Message {
  id: string;
  sender: 'thea' | 'user';
  text: string;
  timestamp: string;
}

export const AskTheaView: React.FC<AskTheaViewProps> = ({
  kit,
  onOpenAISettings,
  onNavigateToOral,
}) => {
  const { theme } = useTheme();
  const botName = theme === 'kitty' ? 'Kitty Study' : 'Contrareloj Study';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'chat-init',
      sender: 'thea',
      text: `¡Hola! Soy ${botName}, tu tutor de estudio personal. Tengo indexados todos los contenidos de "${kit.title}". ¿Qué concepto, mecanismo o duda te gustaría que te explique a fondo?`,
      timestamp: 'Ahora',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    { text: 'Explícame los conceptos clave de este tema', icon: <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> },
    { text: 'Dame una regla mnemotécnica para recordar este material', icon: <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> },
    { text: '¿Cuál es la causa o mecanismo fundamental?', icon: <HelpCircle className="w-3.5 h-3.5 text-sky-400" /> },
    { text: 'Hazme una pregunta sorpresa de nivel examen', icon: <FileQuestion className="w-3.5 h-3.5 text-emerald-400" /> },
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const nowLabel = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: trimmed,
      timestamp: nowLabel(),
    };

    const previousHistory = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    let replyText: string;
    try {
      replyText = await askTheaAI(trimmed, kit, previousHistory, 'ollama');
    } catch {
      replyText = `He analizado tu material de estudio sobre "${kit.title}". ¿Podrías reformular tu consulta o indicar qué concepto específico deseas revisar?`;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        sender: 'thea',
        text: replyText,
        timestamp: nowLabel(),
      },
    ]);
    setIsTyping(false);
  };

  const clearConversation = () => {
    setMessages([messages[0]]);
  };

  return (
    <div className="relative max-w-4xl w-full mx-auto px-2 sm:px-4 py-2 sm:py-3 h-full flex flex-col min-h-0 overflow-hidden">
      {/* Fondo ambiental sutil tipo chat de estudio */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-600/10 via-thea-bg to-thea-bg blur-2xl pointer-events-none" />

      {/* Contenedor Flotante Elevado */}
      <div className={`flex-1 min-h-0 flex flex-col rounded-3xl border shadow-xl overflow-hidden relative ${
        theme === 'dark'
          ? 'bg-[#0e0b16]/95 border-white/[0.08] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]'
          : theme === 'kitty'
          ? 'bg-white border-pink-200 shadow-pink-100/50'
          : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}>
        {/* Cabecera Flotante */}
        <div className={`flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 sm:py-3 border-b shrink-0 ${
          theme === 'dark' ? 'border-white/[0.06] bg-white/[0.02]' : theme === 'kitty' ? 'border-pink-100 bg-pink-50/40' : 'border-slate-100 bg-slate-50/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl border flex items-center justify-center shadow-sm shrink-0 ${
              theme === 'dark'
                ? 'bg-white/[0.04] border-white/10 text-zinc-200'
                : theme === 'kitty'
                ? 'bg-pink-100 border-pink-200 text-pink-600'
                : 'bg-slate-100 border-slate-200 text-slate-800'
            }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`font-bold text-sm sm:text-base tracking-tight ${
                  theme === 'dark' ? 'text-white' : 'text-zinc-950'
                }`}>
                  Chat Tutor IA
                </h1>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  theme === 'dark'
                    ? 'bg-white/[0.05] text-zinc-300 border-white/10'
                    : theme === 'kitty'
                    ? 'bg-pink-100 text-pink-800 border-pink-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  Consultas Escritas
                </span>
                <span className="text-[10px] text-zinc-400">
                  Ollama Local / IA
                </span>
              </div>
              <p className={`text-[11px] truncate max-w-[240px] sm:max-w-md ${
                theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'
              }`}>
                Material activo: <strong className={theme === 'dark' ? 'text-zinc-300' : 'text-zinc-950'}>{kit.title}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón para ir a Lección Oral */}
            {onNavigateToOral && (
              <button
                type="button"
                onClick={onNavigateToOral}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95 ${
                  theme === 'dark'
                    ? 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200'
                    : theme === 'kitty'
                    ? 'border-pink-200 bg-white hover:bg-pink-50 text-pink-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
                title="Cambiar al módulo de lección oral y práctica por voz"
              >
                <Mic className="w-3.5 h-3.5 text-zinc-400" />
                <span>Practicar en Lección Oral</span>
              </button>
            )}

            {/* Limpiar conversación */}
            <button
              type="button"
              onClick={clearConversation}
              className={`p-2 rounded-xl border transition-colors cursor-pointer active:scale-95 ${
                theme === 'dark'
                  ? 'border-white/[0.08] bg-white/[0.025] text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  : theme === 'kitty'
                  ? 'border-pink-200 bg-white text-pink-700 hover:bg-pink-50'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Reiniciar chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Ajustes de IA */}
            {onOpenAISettings && (
              <button
                type="button"
                onClick={onOpenAISettings}
                className={`p-2 rounded-xl border transition-colors cursor-pointer active:scale-95 ${
                  theme === 'dark'
                    ? 'border-white/[0.08] bg-white/[0.025] text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                    : theme === 'kitty'
                    ? 'border-pink-200 bg-white text-pink-700 hover:bg-pink-50'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Configuración de IA"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Área de mensajes del chat con scroll ultra-fluido a 120 FPS */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-3.5 modal-smooth-scroll">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[88%] sm:max-w-[82%] animate-fadeIn ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                  msg.sender === 'thea'
                    ? theme === 'dark'
                      ? 'bg-white/[0.05] border border-white/10 text-zinc-200'
                      : theme === 'kitty'
                      ? 'bg-pink-100 border border-pink-200 text-pink-700'
                      : 'bg-slate-100 border border-slate-200 text-slate-700'
                    : 'bg-zinc-950 text-white font-bold'
                }`}
              >
                {msg.sender === 'thea' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div
                className={`rounded-2xl p-3.5 sm:p-4 shadow-sm text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? theme === 'dark'
                      ? 'bg-violet-900/30 border border-violet-500/25 text-zinc-100 rounded-tr-none'
                      : theme === 'kitty'
                      ? 'bg-pink-500 text-white border border-pink-400 rounded-tr-none shadow-md shadow-pink-500/20'
                      : 'bg-rose-600 text-white border border-rose-500 rounded-tr-none shadow-md shadow-rose-600/20'
                    : theme === 'dark'
                    ? 'bg-white/[0.03] border border-white/[0.08] text-zinc-200 rounded-tl-none shadow-md'
                    : theme === 'kitty'
                    ? 'bg-pink-50/70 border border-pink-200/80 text-zinc-950 rounded-tl-none shadow-xs'
                    : 'bg-slate-50 border border-slate-200 text-zinc-950 rounded-tl-none shadow-xs'
                }`}
              >
                <div className={`flex items-center justify-between gap-4 mb-1.5 text-[10px] ${
                  msg.sender === 'user' && theme !== 'dark' ? 'text-white/80' : 'opacity-70'
                }`}>
                  <span className="font-semibold uppercase tracking-wider">
                    {msg.sender === 'thea' ? (theme === 'kitty' ? 'Kitty Tutor' : 'Tutor Thea') : 'Tú'}
                  </span>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>

                <FormattedText text={msg.text} />
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 max-w-[80%] animate-fadeIn">
              <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                theme === 'dark' ? 'bg-white/[0.05] border-white/10 text-zinc-200' : 'bg-pink-100 border-pink-200 text-pink-600'
              }`}>
                <Bot className="w-4 h-4" />
              </div>
              <div className={`border rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 shadow-sm ${
                theme === 'dark' ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200 text-zinc-950'
              }`}>
                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-zinc-400 ml-1">Redactando explicación...</span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Sugerencias Rápidas de Estudio */}
        <div className={`px-4 py-2 border-t flex gap-2 overflow-x-auto scrollbar-none shrink-0 ${
          theme === 'dark' ? 'border-white/[0.06] bg-white/[0.015]' : theme === 'kitty' ? 'border-pink-100 bg-pink-50/30' : 'border-slate-100 bg-slate-50/50'
        }`}>
          {quickPrompts.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(item.text)}
              disabled={isTyping}
              className={`text-xs px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-40 active:scale-[0.985] border ${
                theme === 'dark'
                  ? 'bg-white/[0.025] hover:bg-white/[0.06] border-white/[0.08] text-zinc-300 hover:text-white'
                  : theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-900 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-xs'
              }`}
            >
              {item.icon}
              <span>{item.text}</span>
            </button>
          ))}
        </div>

        {/* Barra de Entrada de Texto */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className={`flex items-center gap-2 p-2.5 sm:p-3 border-t shrink-0 ${
            theme === 'dark' ? 'border-white/[0.06] bg-white/[0.02]' : theme === 'kitty' ? 'border-pink-100 bg-pink-50/40' : 'border-slate-100 bg-slate-50/60'
          }`}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu consulta o pide una explicación detallada sobre el material..."
            className={`flex-1 rounded-2xl px-4 py-2 text-xs sm:text-sm transition-colors border focus:outline-none ${
              theme === 'dark'
                ? 'bg-[#090314]/90 border-white/[0.08] text-white placeholder-zinc-500 focus:border-white/30'
                : theme === 'kitty'
                ? 'bg-white border-pink-200 text-zinc-950 placeholder-pink-300 focus:border-pink-400'
                : 'bg-white border-slate-200 text-zinc-950 placeholder-slate-400 focus:border-rose-400'
            }`}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className={`p-2.5 rounded-xl font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md active:scale-95 shrink-0 ${
              theme === 'dark'
                ? 'bg-white hover:bg-zinc-200 text-zinc-950'
                : theme === 'kitty'
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/25'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25'
            }`}
            title="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
