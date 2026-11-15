import React, { useState } from 'react';
import {
  X,
  Search,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Crop,
  Globe,
  FileText
} from 'lucide-react';
import { useTheme } from '../services/themeService';

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
 * Logotipo oficial multicolor de Google (G)
 */
export const GoogleGLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

/**
 * Icono vectorial oficial estilizado de Google Lens
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

/**
 * Copia una imagen local o base64 al portapapeles del sistema
 */
async function copyDataUrlToClipboard(src: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': blob,
              }),
            ]);
            resolve(true);
          } catch {
            resolve(false);
          }
        }, 'image/png');
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

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
  const [activeTab, setActiveTab] = useState<'lens' | 'matches' | 'text'>('lens');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hasCopiedImage, setHasCopiedImage] = useState<boolean>(false);
  const [hasCopiedText, setHasCopiedText] = useState<boolean>(false);

  if (!isOpen) return null;

  // Términos para enlaces de búsqueda web
  const searchTerm = (searchQuery.trim() || context.caption || context.title || 'diagrama cientifico').slice(0, 120);

  const handleCopyCrop = async () => {
    if (!croppedDataUrl) return;
    const ok = await copyDataUrlToClipboard(croppedDataUrl);
    if (ok) {
      setHasCopiedImage(true);
      setTimeout(() => setHasCopiedImage(false), 2500);
    }
  };

  const handleCopyCaption = () => {
    if (!context.caption) return;
    navigator.clipboard.writeText(context.caption);
    setHasCopiedText(true);
    setTimeout(() => setHasCopiedText(false), 2500);
  };

  const handleExecuteSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = (searchQuery.trim() || context.caption || context.title || '').trim();
    if (!q) return;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    window.open(googleUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-label="Google Lens Asistente Visual"
      className={`absolute bottom-0 inset-x-0 max-h-[62vh] sm:max-h-[58vh] md:max-h-[52vh] z-30 rounded-t-3xl border-t select-none flex flex-col shadow-2xl transition-transform duration-200 ease-out backdrop-blur-2xl ${
        theme === 'dark'
          ? 'bg-zinc-950/95 border-white/20 text-white shadow-[0_-8px_32px_rgba(0,0,0,0.8)]'
          : theme === 'kitty'
          ? 'bg-pink-950/95 border-pink-400/40 text-white shadow-[0_-8px_32px_rgba(100,20,50,0.5)]'
          : 'bg-zinc-900/95 border-zinc-700 text-white shadow-[0_-8px_32px_rgba(0,0,0,0.6)]'
      }`}
    >
      {/* Tirador superior táctil estilo Asistente Android */}
      <div className="pt-2 pb-1 flex justify-center shrink-0 cursor-pointer" onClick={onClose}>
        <div className="w-12 h-1 bg-white/30 rounded-full" />
      </div>

      {/* Cabecera del Asistente Google Lens */}
      <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <GoogleGLogo className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <h4 className="font-bold text-xs sm:text-sm tracking-tight truncate flex items-center gap-1.5">
              <span>Google Lens</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Búsqueda Visual Nativa
              </span>
            </h4>
            <p className="text-[11px] text-zinc-400 truncate">
              {context.title || 'Recorte de imagen activo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onNewCrop}
            title="Trazar nuevo encuadre en la figura"
            className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs text-zinc-200 active:scale-95 transition-transform flex items-center gap-1.5 cursor-pointer"
          >
            <Crop className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px] font-medium">Re-encuadrar</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar asistente"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-white active:scale-95 transition-transform cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda estilo Asistente Google */}
      <div className="p-3 border-b border-white/10 shrink-0 bg-black/20">
        <form onSubmit={handleExecuteSearch} className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center bg-white/[0.08] hover:bg-white/[0.12] focus-within:bg-white/[0.14] border border-white/15 focus-within:border-blue-400/80 rounded-2xl px-3 py-1.5 transition-colors">
            <GoogleGLogo className="w-4 h-4 shrink-0 mr-2" />
            {croppedDataUrl && (
              <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/30 bg-white shrink-0 mr-2 shadow-xs">
                <img src={croppedDataUrl} alt="Crop" className="w-full h-full object-contain p-0.5" />
              </div>
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pregunta o busca en Google acerca de esta imagen..."
              className="flex-1 bg-transparent text-xs text-white placeholder-zinc-400 outline-none"
            />
            <button
              type="submit"
              className="p-1 rounded-lg text-zinc-300 hover:text-white active:scale-95 transition-transform cursor-pointer"
              title="Buscar en Google"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {onOpenExternalLens && (
            <button
              type="button"
              onClick={onOpenExternalLens}
              title="Analizar con Google Lens Oficial"
              className="px-3.5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95 transition-transform cursor-pointer shrink-0"
            >
              <GoogleLensLogo className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Buscar en Lens</span>
            </button>
          )}
        </form>

        {/* Chips de filtro estilo Asistente de móvil */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-0.5 text-xs select-none">
          <button
            type="button"
            onClick={() => setActiveTab('lens')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap active:scale-95 transition-transform cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'lens'
                ? 'bg-white text-zinc-950 shadow-md font-bold'
                : 'bg-white/10 text-zinc-300 hover:bg-white/15'
            }`}
          >
            <GoogleLensLogo className="w-3.5 h-3.5" />
            <span>Google Lens</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('matches')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap active:scale-95 transition-transform cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'matches'
                ? 'bg-white text-zinc-950 shadow-md font-bold'
                : 'bg-white/10 text-zinc-300 hover:bg-white/15'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Concordancias Web</span>
          </button>

          {context.caption && (
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap active:scale-95 transition-transform cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'text'
                  ? 'bg-white text-zinc-950 shadow-md font-bold'
                  : 'bg-white/10 text-zinc-300 hover:bg-white/15'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Texto Detectado</span>
            </button>
          )}
        </div>
      </div>

      {/* Cuerpo del Asistente con Resultados Visuales Reales */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm select-text">
        {/* Pestaña 1: Google Lens Visual Nativo */}
        {activeTab === 'lens' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl border border-white/15 bg-white/[0.04] flex flex-col sm:flex-row items-center gap-4 shadow-xl">
              <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-white/20 bg-white shrink-0 shadow-lg flex items-center justify-center p-1">
                <img
                  src={croppedDataUrl}
                  alt="Recorte de Lens"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-[#EA4335]" />
                <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-[#4285F4]" />
                <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-[#FBBC05]" />
                <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-[#34A853]" />
              </div>

              <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-xs font-bold text-blue-400 flex items-center gap-1">
                    <GoogleLensLogo className="w-3.5 h-3.5" />
                    Procesamiento Oficial Google Lens
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Identifica la fuente exacta del diagrama, imágenes idénticas en publicaciones científicas y artículos médicos mediante la red visual de Google.
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  {onOpenExternalLens && (
                    <button
                      type="button"
                      onClick={onOpenExternalLens}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform cursor-pointer"
                    >
                      <GoogleLensLogo className="w-4 h-4" />
                      <span>Abrir Resultados en Google Lens</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyCrop}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
                  >
                    {hasCopiedImage ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedImage ? '¡Recorte Copiado!' : 'Copiar Imagen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onSelectFullImage}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Toda la Figura</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pestaña 2: Concordancias Web */}
        {activeTab === 'matches' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-300">
              Concordancias visuales directas y fuentes indexadas en la web para esta figura:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <a
                href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2 active:scale-95 transition-transform"
              >
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <GoogleGLogo className="w-3.5 h-3.5" />
                    <span>Google Imágenes</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Buscar diagramas similares</p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
              </a>

              <a
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2 active:scale-95 transition-transform"
              >
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    <span>Google Académico</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Artículos científicos y libros</p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
              </a>

              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2 active:scale-95 transition-transform"
              >
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Búsqueda Web</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Definiciones y guías</p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
              </a>
            </div>
          </div>
        )}

        {/* Pestaña 3: Texto de la figura */}
        {activeTab === 'text' && context.caption && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Texto del documento
                </span>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-zinc-200 flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                >
                  {hasCopiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{hasCopiedText ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed font-sans select-text">
                {context.caption}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
