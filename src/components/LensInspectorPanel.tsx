import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Sparkles,
  FileText,
  HelpCircle,
  Copy,
  Check,
  RefreshCw,
  Crop,
  Layers,
  ExternalLink
} from 'lucide-react';
import { useTheme } from '../services/themeService';
import { FormattedText } from './FormattedText';
import { analyzeImageSelection, type LensTab } from '../services/lensVisionService';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface LensInspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNewCrop: () => void;
  onSelectFullImage: () => void;
  onOpenExternalLens?: () => void;
  croppedDataUrl: string;
  context: {
    title?: string;
    subtitle?: string;
    caption?: string;
  };
}

/**
 * Icono SVG vectorial estilizado de Google Lens
 */
export const GoogleLensLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" stroke="#EA4335" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" stroke="#4285F4" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" stroke="#34A853" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" stroke="#FBBC05" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="12" r="3.2" stroke="#4285F4" strokeWidth="2" />
    <circle cx="12" cy="12" r="1.4" fill="#4285F4" />
  </svg>
);

export const LensInspectorPanel: React.FC<LensInspectorPanelProps> = ({
  isOpen,
  onClose,
  onNewCrop,
  onSelectFullImage,
  onOpenExternalLens,
  croppedDataUrl,
  context,
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<LensTab>('overview');
  const [tabContents, setTabContents] = useState<Record<LensTab, string>>({
    overview: '',
    ocr: '',
    exam: '',
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Chat conversacional sobre el recorte
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState<string>('');
  const [isSendingQuery, setIsSendingQuery] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ejecuta el análisis de la pestaña activa cuando cambia el recorte o la pestaña
  useEffect(() => {
    if (!isOpen || !croppedDataUrl) return;

    // Si la pestaña ya tiene contenido para este recorte, no re-ejecutar automáticamente
    if (tabContents[activeTab]) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMsg(null);

    analyzeImageSelection(croppedDataUrl, activeTab, undefined, context)
      .then((res) => {
        if (!isMounted) return;
        setTabContents((prev) => ({ ...prev, [activeTab]: res }));
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setErrorMsg(err.message || 'Error al analizar la selección.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, croppedDataUrl, activeTab, context]);

  // Limpiar estados cuando cambia el recorte de imagen
  useEffect(() => {
    setTabContents({ overview: '', ocr: '', exam: '' });
    setChatMessages([]);
    setErrorMsg(null);
  }, [croppedDataUrl]);

  // Manejador para recargar la pestaña actual
  const handleReloadCurrentTab = async () => {
    if (!croppedDataUrl || isLoading) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await analyzeImageSelection(croppedDataUrl, activeTab, undefined, context);
      setTabContents((prev) => ({ ...prev, [activeTab]: res }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar el análisis.');
    } finally {
      setIsLoading(false);
    }
  };

  // Enviar pregunta del usuario en el chat
  const handleSendQuery = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q || isSendingQuery || !croppedDataUrl) return;

    const userMsgId = `u_${Date.now()}`;
    const assistantMsgId = `a_${Date.now()}`;

    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: q },
      { id: assistantMsgId, role: 'assistant', content: 'Analizando con IA...' },
    ]);
    setInputQuery('');
    setIsSendingQuery(true);

    try {
      const reply = await analyzeImageSelection(croppedDataUrl, activeTab, q, context);
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, content: reply } : msg
        )
      );
    } catch (err: any) {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `Error: ${err.message || 'No se pudo procesar la consulta.'}` }
            : msg
        )
      );
    } finally {
      setIsSendingQuery(false);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  // Copiar texto analizado al portapapeles
  const handleCopyText = async () => {
    const currentText = tabContents[activeTab];
    if (!currentText) return;
    try {
      await navigator.clipboard.writeText(currentText);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.warn('Error al copiar texto:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`w-full sm:w-[390px] md:w-[430px] lg:w-[470px] shrink-0 h-full flex flex-col border-l select-text z-30 transition-transform duration-200 ease-out ${
        theme === 'dark'
          ? 'bg-[#0f0c1b]/95 border-white/[0.08] text-white shadow-2xl'
          : theme === 'kitty'
          ? 'bg-pink-50/95 border-pink-200 text-pink-950 shadow-xl'
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
      } backdrop-blur-xl`}
    >
      {/* Cabecera del Inspector */}
      <div className={`p-3.5 sm:p-4 border-b flex items-center justify-between gap-2.5 shrink-0 ${
        theme === 'dark' ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0 shadow-xs">
            <GoogleLensLogo className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-xs sm:text-sm tracking-tight truncate flex items-center gap-1.5">
              <span>Google Lens</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                IA Multimodal
              </span>
            </h4>
            <p className="text-[11px] opacity-60 truncate">
              {context.title || 'Análisis de selección'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenExternalLens && (
            <button
              type="button"
              onClick={onOpenExternalLens}
              title="Abrir este recorte en Google Lens externo"
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 active:scale-95 transition-transform text-xs flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden xl:inline text-[11px]">Lens Web</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNewCrop}
            title="Trazar nuevo recorte en la figura"
            className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 active:scale-95 transition-transform text-xs flex items-center gap-1 cursor-pointer"
          >
            <Crop className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px]">Recortar</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar panel de análisis"
            className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 active:scale-95 transition-transform cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Miniatura del Recorte Activo */}
      <div className="p-3 border-b border-white/[0.06] bg-black/10 shrink-0 flex items-center gap-3">
        <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/20 bg-white shrink-0 shadow-sm flex items-center justify-center">
          <img
            src={croppedDataUrl}
            alt="Área seleccionada"
            className="w-full h-full object-contain p-0.5"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Área activa
            </span>
          </div>
          <p className="text-[11px] opacity-70 truncate mt-0.5">
            {context.caption || 'Región encuadrada con el puntero'}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <button
              type="button"
              onClick={onSelectFullImage}
              title="Analizar la figura completa"
              className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer"
            >
              <Layers className="w-3 h-3" />
              Analizar figura entera
            </button>
          </div>
        </div>
      </div>

      {/* Pestañas de Análisis */}
      <div className="flex items-center border-b border-white/[0.06] px-2 pt-1 gap-1 shrink-0 bg-white/[0.01]">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 px-1 text-center text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent opacity-60 hover:opacity-90'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Visión IA</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ocr')}
          className={`flex-1 py-2 px-1 text-center text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'ocr'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent opacity-60 hover:opacity-90'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Texto y Fórmulas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('exam')}
          className={`flex-1 py-2 px-1 text-center text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'exam'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent opacity-60 hover:opacity-90'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Examen</span>
        </button>
      </div>

      {/* Cuerpo Desplazable con el Análisis */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm">
        {/* Barra superior de herramientas de contenido */}
        <div className="flex items-center justify-between text-[11px] opacity-70">
          <span className="font-semibold uppercase tracking-wider text-[10px]">
            {activeTab === 'overview' && '✦ Explicación Conceptual y Fisiológica'}
            {activeTab === 'ocr' && '✦ Transcripción y Ecuaciones KaTeX'}
            {activeTab === 'exam' && '✦ Preguntas de Opción Múltiple'}
          </span>
          <div className="flex items-center gap-1">
            {tabContents[activeTab] && (
              <button
                type="button"
                onClick={handleCopyText}
                title="Copiar texto del análisis"
                className="p-1 rounded-md hover:bg-white/10 active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
              >
                {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="text-[10px]">{hasCopied ? 'Copiado' : 'Copiar'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleReloadCurrentTab}
              disabled={isLoading}
              title="Regenerar análisis con IA"
              className="p-1 rounded-md hover:bg-white/10 active:scale-95 transition-transform cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Estado de Carga */}
        {isLoading && (
          <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center text-center space-y-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <GoogleLensLogo className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="font-semibold text-xs">Analizando figura con IA multimodal...</p>
              <p className="text-[11px] opacity-60 mt-0.5">Identificando patrones, texto y relaciones clave</p>
            </div>
          </div>
        )}

        {/* Mensaje de Error */}
        {errorMsg && !isLoading && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs space-y-2">
            <p className="font-semibold">No se pudo completar el análisis</p>
            <p className="opacity-90">{errorMsg}</p>
            <button
              type="button"
              onClick={handleReloadCurrentTab}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Contenido Renderizado con KaTeX */}
        {!isLoading && !errorMsg && tabContents[activeTab] && (
          <div className="space-y-3 leading-relaxed">
            <FormattedText
              text={tabContents[activeTab]}
              className="text-xs sm:text-[13px] text-zinc-200 dark:text-zinc-200 leading-relaxed font-sans"
            />
          </div>
        )}

        {/* Historial de Preguntas en Chat sobre esta selección */}
        {chatMessages.length > 0 && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <span>Conversación sobre la figura</span>
            </h5>
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-xl text-xs space-y-1 ${
                  msg.role === 'user'
                    ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 ml-4'
                    : 'bg-white/[0.04] border border-white/[0.08] text-zinc-200 mr-2'
                }`}
              >
                <div className="text-[10px] font-bold opacity-60">
                  {msg.role === 'user' ? 'Tú' : '✦ Lens Tutor IA'}
                </div>
                <FormattedText text={msg.content} />
              </div>
            ))}
          </div>
        )}

        {/* Sugerencias Rápidas de Preguntas */}
        <div className="pt-2">
          <p className="text-[10px] font-bold opacity-50 uppercase tracking-wider mb-2">
            Preguntas rápidas sugeridas:
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleSendQuery('¿Qué principio o fórmula matemática rige este gráfico?')}
              className="px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] text-zinc-300 transition-all active:scale-95 cursor-pointer"
            >
              ¿Qué principio rige este gráfico?
            </button>
            <button
              type="button"
              onClick={() => handleSendQuery('Explica el significado de cada eje, curva o flecha en este diagrama')}
              className="px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] text-zinc-300 transition-all active:scale-95 cursor-pointer"
            >
              Explicar ejes y flechas
            </button>
            <button
              type="button"
              onClick={() => handleSendQuery('¿Cuál es la aplicación práctica o caso clínico más frecuente de esta figura?')}
              className="px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] text-zinc-300 transition-all active:scale-95 cursor-pointer"
            >
              Aplicación clínica / práctica
            </button>
          </div>
        </div>
      </div>

      {/* Barra Inferior para Preguntar acerca de esta selección (Estilo Google Lens) */}
      <div className={`p-3 border-t shrink-0 ${
        theme === 'dark' ? 'border-white/[0.08] bg-black/30' : 'border-slate-200 bg-slate-50'
      }`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuery();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <GoogleLensLogo className="w-3.5 h-3.5" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Pregunta acerca de esta imagen..."
              disabled={isSendingQuery}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none transition-all ${
                theme === 'dark'
                  ? 'bg-white/[0.05] border-white/10 text-white placeholder-zinc-500 focus:border-blue-500/70 focus:bg-white/[0.08]'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={!inputQuery.trim() || isSendingQuery}
            className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white shadow-md active:scale-95 transition-transform cursor-pointer"
            title="Enviar pregunta"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
