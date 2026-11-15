import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Share2,
  Copy,
  Check,
  X,
  Cloud,
  RefreshCw,
  CheckCircle2,
  FileText,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import type { StudyKit } from '../types';

interface ShareKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  kit: StudyKit | null;
}

export const ShareKitModal: React.FC<ShareKitModalProps> = ({
  isOpen,
  onClose,
  kit,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setGeneratedUrl(null);
    setCopied(false);
    setErrorMessage(null);
  }, [isOpen, kit?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !kit) return null;

  const handleGenerateAndShare = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const { shareUrl } = await googleDriveService.shareKitPublicly(kit);
      setGeneratedUrl(shareUrl);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2800);
      }
    } catch (err: any) {
      console.warn('[ShareKitModal] Error compartiendo kit:', err);
      setErrorMessage(err?.message || 'No se pudo generar el enlace compartido en Google Drive.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyExisting = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {}
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-[#0e0b16] border border-white/[0.12] rounded-[30px] p-6 sm:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] text-white overflow-hidden will-change-transform">
        {/* Resplandor ambiental de autor en el borde superior */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-20 bg-sky-500/15 blur-2xl pointer-events-none rounded-full" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[1.5px] bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />

        {/* Botón Cerrar */}
        <button
          type="button"
          onClick={onClose}
          className="active-press absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer active:scale-95 z-10"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-inner shrink-0">
            <Share2 className="w-6 h-6" />
          </div>
          <div className="min-w-0 pr-6">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
              Compartir Kit de Estudio
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {kit.title}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          Comparte el <strong>contenido base</strong> en el cual está fundamentado este kit (apuntes, documentos fuente, fragmentos estructurados, figuras y flashcards). Quien reciba el enlace podrá importarlo en su cuenta de Google Drive para estudiar con su propio avance limpio a 0%.
        </p>

        {/* Resumen del contenido base incluido en el paquete compartido */}
        <div className="mb-5 p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.08] grid grid-cols-3 gap-2 text-center text-slate-300">
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <FileText className="w-4 h-4 mx-auto text-sky-400 mb-1" />
            <div className="text-[11px] font-semibold text-white">
              {kit.chunks?.length || 1} Fragmentos
            </div>
            <div className="text-[10px] text-slate-400">Texto Fuente</div>
          </div>
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <Layers className="w-4 h-4 mx-auto text-purple-400 mb-1" />
            <div className="text-[11px] font-semibold text-white">
              {kit.flashcards?.length || 0} Flashcards
            </div>
            <div className="text-[10px] text-slate-400">Conceptos Base</div>
          </div>
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <ImageIcon className="w-4 h-4 mx-auto text-pink-400 mb-1" />
            <div className="text-[11px] font-semibold text-white">
              {kit.assets?.length || 0} Imágenes
            </div>
            <div className="text-[10px] text-slate-400">Figuras/Apuntes</div>
          </div>
        </div>

        {/* Error si existió problema */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs leading-relaxed animate-fadeIn">
            {errorMessage}
          </div>
        )}

        {/* Enlace generado o Botón de Generar */}
        {generatedUrl ? (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">
                ¡Enlace de contenido generado con éxito en Google Drive!
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={generatedUrl}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-sky-300 font-mono outline-hidden select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={handleCopyExisting}
                className="py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-[transform,background-color] duration-160 active:scale-95 shrink-0 shadow-md"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    <span className="text-emerald-700">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center leading-normal">
              Cualquier usuario con cuenta de Google Drive podrá importar este kit con todo su material de estudio base y comenzar su propio progreso.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateAndShare}
            disabled={isGenerating}
            className="active-press w-full py-3.5 px-5 rounded-2xl bg-white hover:bg-slate-100 text-zinc-950 font-bold text-xs sm:text-sm shadow-[0_4px_20px_rgba(255,255,255,0.18),inset_0_1px_0_rgba(255,255,255,1)] flex items-center justify-center gap-2.5 cursor-pointer transition-[transform,background-color] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                <span>Generando enlace de contenido en Google Drive...</span>
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4 text-sky-600" />
                <span>Crear Enlace Público en Google Drive</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
