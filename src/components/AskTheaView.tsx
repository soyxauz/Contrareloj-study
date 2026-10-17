import React, { useState } from 'react';
import type { StudyKit } from '../types';
import { MessageSquareText, Send, Sparkles, Bot, User, Trash2 } from 'lucide-react';
import { askTheaAI } from '../services/aiService';
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

  const quickPrompts = [
    'Explícame la diferencia entre el Complejo I y el Complejo II',
    'Dame una regla mnemotécnica para recordar el Ciclo de Krebs',
    '¿Qué pasa en la célula si falta oxígeno?',
    'Hazme una pregunta sorpresa de nivel examen'
  ];

  const handleSend = async (userText: string) => {
    if (!userText.trim()) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const currentHistory = [...messages, newMsg];
    setMessages(currentHistory);
    setInput('');
    setIsTyping(true);

    try {
      const reply = await askTheaAI(userText, kit, currentHistory);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'thea',
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'thea',
          text: `He analizado tu material de estudio sobre "${kit.title}". ¿Podrías reformular tu consulta o indicar qué concepto específico deseas revisar?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white">
              TUTOR IA INTERACTIVO
            </span>
            <span className="text-xs text-slate-400 font-medium">Resolución de dudas sin límites</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquareText className="w-6 h-6 text-violet-400" />
            <span>Asistente IA Contrareloj</span>
          </h1>
        </div>

        <button
          onClick={() => setMessages([messages[0]])}
          className="p-2 rounded-xl border border-thea-border text-slate-400 hover:text-rose-400 hover:bg-thea-surfaceLight transition-colors"
          title="Limpiar conversación"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

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
        </div>

        {/* Quick Prompts Bar */}
        <div className="pt-3 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="text-xs bg-thea-surfaceLight hover:bg-thea-border border border-thea-border text-slate-300 hover:text-white px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors"
            >
              {prompt}
            </button>
          ))}
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
            placeholder="Pregunta cualquier detalle sobre tu material de estudio..."
            className="flex-1 bg-thea-bg border border-thea-border rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold transition-all disabled:opacity-40"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
