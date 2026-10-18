import React, { useState, useRef, useEffect } from 'react';
import type { StudyKit } from '../types';
import {
  Send,
  Sparkles,
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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'chat-init',
      sender: 'thea',
      text: `¡Hola! Soy Contrareloj Study, tu tutor de estudio personal. Tengo indexados todos los contenidos de "${kit.title}". ¿Qué concepto, mecanismo o duda te gustaría que te explique a fondo?`,
      timestamp: 'Ahora',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    { text: 'Explícame los conceptos clave de este tema', icon: <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> },
    { text: 'Dame una regla mnemotécnica para recordar este material', icon: <Sparkles className="w-3.5 h-3.5 text-violet-400" /> },
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
    <div className="relative max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-6 h-[calc(100vh-5.5rem)] min-h-[640px] flex flex-col">
      {/* Fondo ambiental sutil tipo chat de estudio */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-600/10 via-thea-bg to-thea-bg blur-2xl pointer-events-none" />

      {/* Contenedor Flotante Elevado */}
      <div className="flex-1 flex flex-col bg-thea-surface/90 backdrop-blur-2xl border border-thea-border/80 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden relative">
        {/* Cabecera Flotante */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-thea-border/60 bg-thea-surfaceLight/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-cyan-900/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-sm sm:text-base text-white">
                  Chat Tutor IA
                </h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
                  Consultas Escritas
                </span>
                <span className="text-[10px] text-slate-400">
                  Ollama Local / IA
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-md">
                Material activo: <strong className="text-slate-300">{kit.title}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón para ir a Lección Oral */}
            {onNavigateToOral && (
              <button
                type="button"
                onClick={onNavigateToOral}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-500/40 bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                title="Cambiar al módulo de lección oral y práctica por voz"
              >
                <Mic className="w-3.5 h-3.5 text-violet-400" />
                <span>Practicar en Lección Oral</span>
              </button>
            )}

            {/* Limpiar conversación */}
            <button
              type="button"
              onClick={clearConversation}
              className="p-2 rounded-xl border border-thea-border text-slate-400 hover:text-rose-400 hover:bg-thea-surfaceLight transition-colors cursor-pointer"
              title="Reiniciar chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Ajustes de IA */}
            {onOpenAISettings && (
              <button
                type="button"
                onClick={onOpenAISettings}
                className="p-2 rounded-xl border border-thea-border text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
                title="Configuración de IA"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Área de mensajes del chat */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth">
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
                    ? 'bg-gradient-to-tr from-cyan-600 to-teal-600 text-white shadow-md'
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
                    {msg.sender === 'thea' ? 'Tutor Thea' : 'Tú'}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                <FormattedText text={msg.text} />
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 max-w-[80%] animate-fadeIn">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-md">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-thea-surfaceLight/80 border border-thea-border/70 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-slate-400 ml-1">Redactando explicación...</span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Sugerencias Rápidas de Estudio */}
        <div className="px-4 py-2 border-t border-thea-border/40 bg-thea-surfaceLight/20 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
          {quickPrompts.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(item.text)}
              disabled={isTyping}
              className="text-xs bg-thea-surfaceLight/70 hover:bg-thea-surfaceLight border border-thea-border/70 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-40"
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
          className="flex items-center gap-2 p-3 bg-thea-surfaceLight/50 border-t border-thea-border/70 shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu consulta o pide una explicación detallada sobre el material..."
            className="flex-1 bg-thea-bg/90 border border-thea-border rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-cyan-900/20 active:scale-95"
            title="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
