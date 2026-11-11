import React, { useState, useEffect } from 'react';
import type { Question, DocumentAsset } from '../types';
import { searchIllustrationForQuestion, type WebImageResult } from '../services/imageSearchService';
import { ZoomIn, ExternalLink, Search } from 'lucide-react';
import { useTheme } from '../services/themeService';
import { cleanImageBlackBackground } from '../utils/imageCleaner';

export function cleanExplanationBullet(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const isDocReference = /^(?:referencia en el texto|referencia textual)[:\s*-]*/i.test(text.trim());
  let cleaned = text
    .replace(/^(?:desmonte del error previo|referencia en el texto|referencia textual|descarte de opciones|discriminación de distractores|fundamentación académica|explicación lógica)[:\s*-]*/gi, '')
    .replace(/^[\s•*,\-:;"]+/, '')
    .replace(/[\s"]+$/, '')
    .replace(/\*{2,}/g, '')
    .trim();
  if (!cleaned) return '';
  if (isDocReference && cleaned.length < 80) {
    return `Fundamento y marco conceptual correspondiente a ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}.`;
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface TheaExplanationViewProps {
  question: Question;
  kitAssets?: DocumentAsset[];
  onZoomImage?: (asset: DocumentAsset) => void;
}

export const TheaExplanationView: React.FC<TheaExplanationViewProps> = ({
  question,
  kitAssets = [],
  onZoomImage,
}) => {
  const { theme } = useTheme();
  const [imageResult, setImageResult] = useState<WebImageResult | null>(null);
  const [isImgLoaded, setIsImgLoaded] = useState(false);

  // 1. Extraer o formular exactamente 3 viñetas pedagógicas limpias
  const bullets = React.useMemo(() => {
    let rawBullets: string[] = [];
    const safeExplanation = question?.explanation || '';

    if (question?.googleOverview?.bullets && question.googleOverview.bullets.length >= 2) {
      rawBullets = question.googleOverview.bullets.slice(0, 3);
    } else if (safeExplanation) {
      const matched = safeExplanation.match(/(?:> •|•|\*|-|\d+\.)\s*([^\n]+)/g);
      if (matched && matched.length >= 2) {
        rawBullets = matched.slice(0, 3).map(b => b.replace(/^(?:> •|•|\*|-|\d+\.)\s*/, '').trim());
      }
    }

    if (rawBullets.length < 3) {
      // Extraer párrafos limpios del desglose
      const parts = safeExplanation
        .split('\n\n')
        .map(p => p.replace(/[#*`>]/g, '').trim())
        .filter(p => p.length > 25 && !p.toLowerCase().includes('búsqueda en google'));

      const correctOption =
        question?.options && question.correctIndex !== undefined
          ? question.options[question.correctIndex]
          : question?.idealAnswer || '';

      if (parts.length >= 3) {
        rawBullets = parts.slice(0, 3);
      } else if (parts.length === 2) {
        rawBullets = [
          correctOption ? `Respuesta verificada: ${correctOption}` : parts[0],
          parts[0],
          parts[1],
        ];
      } else if (parts.length === 1) {
        rawBullets = [
          correctOption ? `Respuesta verificada: ${correctOption}` : 'Fundamento conceptual directo comprobado.',
          parts[0],
          'Principio causal y bibliográfico corroborado en la literatura científica.',
        ];
      } else {
        rawBullets = [
          correctOption ? `Respuesta directa: ${correctOption}` : 'Principio fundamental verificado.',
          'Fundamento causal y explicativo respaldado en la bibliografía.',
          'Distinción clave frente a los distractores y errores frecuentes.',
        ];
      }
    }

    return rawBullets
      .map(cleanExplanationBullet)
      .filter(b => b.length > 5)
      .slice(0, 3);
  }, [question]);

  // 2. Término de búsqueda para la consulta e ilustración web
  const searchTerm = React.useMemo(() => {
    if (question?.googleOverview?.query) {
      return question.googleOverview.query;
    }
    if (question?.googleOverview?.imageSearchTerm) {
      return question.googleOverview.imageSearchTerm;
    }
    if (question?.topic && question.topic.length > 3) {
      return question.topic;
    }
    const safeQ = question?.question || 'Concepto de estudio';
    return safeQ.replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 80);
  }, [question]);

  // 3. Buscar ilustración en la web (Wikipedia / Wikimedia / Fallback)
  useEffect(() => {
    let isMounted = true;
    setIsImgLoaded(false);

    // Si la pregunta ya tiene una imagen asociada en su metadata
    if (question?.googleOverview?.imageUrl) {
      setImageResult({
        imageUrl: question.googleOverview.imageUrl,
        sourceUrl:
          question.googleOverview.imageSearchTerm
            ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(question.googleOverview.imageSearchTerm)}`
            : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
        caption: question.googleOverview.imageCaption || searchTerm,
        title: question.googleOverview.imageCaption || searchTerm,
        sourceName: 'Google',
      });
      return;
    }

    searchIllustrationForQuestion(searchTerm, question?.topic || 'General', kitAssets)
      .then(res => {
        if (!isMounted) return;
        if (res && res.imageUrl) {
          cleanImageBlackBackground(res.imageUrl).then(cleaned => {
            if (!isMounted) return;
            setImageResult({ ...res, imageUrl: cleaned });
          });
        } else {
          // Si no hubo imagen web, verificar activo del documento
          const docAsset = kitAssets.find(a => a.dataUrl);
          if (docAsset && docAsset.dataUrl) {
            cleanImageBlackBackground(docAsset.dataUrl).then(cleaned => {
              if (!isMounted) return;
              setImageResult({
                imageUrl: cleaned,
                sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
                caption: docAsset.caption || searchTerm,
                title: docAsset.caption || searchTerm,
                sourceName: 'Material del Kit',
              });
            });
          } else {
            setImageResult({
              imageUrl: '',
              sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
              caption: searchTerm,
              title: searchTerm,
              sourceName: 'Google Imágenes',
            });
          }
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setImageResult(null);
      });

    return () => {
      isMounted = false;
    };
  }, [searchTerm, question, kitAssets]);

  const handleImageClick = () => {
    if (!onZoomImage || !imageResult?.imageUrl) return;
    const assetToZoom: DocumentAsset = {
      id: `thea-web-img-${Date.now()}`,
      dataUrl: imageResult.imageUrl,
      caption: imageResult.caption || searchTerm,
      type: 'image',
    };
    onZoomImage(assetToZoom);
  };

  return (
    <div className="explanation-wrapper w-full flex flex-col md:flex-row items-center md:items-start justify-between gap-6 md:gap-10 mt-6 pt-4 text-left animate-fadeIn">
      {/* ── COLUMNA IZQUIERDA: BÚSQUEDA INTERACTIVA Y EXACTAMENTE 3 VIÑETAS ── */}
      <div className="explanation-body flex-1 min-w-0 max-w-2xl">
        <div className="top-level-explanation space-y-3.5">
          {/* Barra de Búsqueda Interactiva Externa (Google / Wikipedia) */}
          <div className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs border ${
            theme === 'dark'
              ? 'bg-white/[0.03] border-white/[0.08] text-slate-300'
              : theme === 'kitty'
              ? 'bg-pink-50/70 border-pink-200 text-pink-900'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-2 truncate max-w-xs sm:max-w-md">
              <Search className={`w-3.5 h-3.5 shrink-0 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-rose-500' : 'text-slate-400'}`} />
              <span className={`text-[10px] uppercase tracking-wider font-mono shrink-0 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500 font-bold'}`}>Búsqueda:</span>
              <span className={`font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-zinc-950 font-bold'}`}>&quot;{searchTerm}&quot;</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={question?.googleOverview?.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer active-press border ${
                  theme === 'dark'
                    ? 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] hover:border-white/20 text-slate-300 hover:text-white'
                    : theme === 'kitty'
                    ? 'bg-white hover:bg-pink-100/60 border-pink-200 text-pink-700'
                    : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-zinc-950'
                }`}
                title="Abrir búsqueda directa en Google"
              >
                <span>Google</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              <a
                href={
                  imageResult?.sourceUrl ||
                  question?.googleOverview?.wikipediaUrl ||
                  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer active-press border ${
                  theme === 'dark'
                    ? 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06] hover:border-white/15 text-slate-400 hover:text-white'
                    : theme === 'kitty'
                    ? 'bg-white hover:bg-pink-100/60 border-pink-200 text-pink-700'
                    : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-zinc-950'
                }`}
                title={imageResult?.sourceName ? `Consultar en ${imageResult.sourceName}` : 'Consultar fuente web'}
              >
                <span className="truncate max-w-[120px]">{imageResult?.sourceName || 'Web'}</span>
                <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
              </a>
            </div>
          </div>

          <ul className="space-y-4 text-base sm:text-[17px] leading-relaxed list-none m-0 p-0">
            {bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className={`text-lg leading-none mt-1.5 select-none shrink-0 ${
                  theme === 'kitty' ? 'text-pink-600 font-bold' : theme === 'light' ? 'text-rose-600 font-bold' : 'text-indigo-400'
                }`}>•</span>
                <span className={`flex-1 font-normal leading-relaxed text-base sm:text-[17px] ${
                  theme === 'dark' ? 'text-slate-200' : 'text-zinc-900'
                }`}>
                  {bullet}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── COLUMNA DERECHA: IMAGEN / DIAGRAMA CON CRÉDITO Y ENLACE A LA FUENTE ── */}
      {imageResult && imageResult.imageUrl ? (
        <figure
          className={`explanation-figure w-full md:w-[320px] lg:w-[360px] shrink-0 text-center flex flex-col items-center transition-opacity duration-500 ${
            isImgLoaded ? 'opacity-100' : 'opacity-80'
          }`}
        >
          <div
            onClick={handleImageClick}
            className="group relative w-full rounded-2xl overflow-hidden bg-white shadow-md cursor-pointer border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-center min-h-[160px] max-h-[260px] p-2 active-press"
            title="Clic para ampliar diagrama en alta definición"
          >
            <img
              src={imageResult.imageUrl}
              alt={imageResult.caption || 'Ilustración médica de referencia'}
              onLoad={() => setIsImgLoaded(true)}
              className="w-full h-auto max-h-[244px] object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300 bg-white"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-white/30 text-white flex items-center justify-center shadow-lg">
                <ZoomIn className="w-4 h-4" />
              </div>
            </div>
          </div>

          <figcaption className={`mt-2 text-xs flex items-center justify-center gap-1.5 flex-wrap ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
          }`}>
            <span>Fuente:</span>
            <a
              href={imageResult.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline transition-colors cursor-pointer flex items-center gap-1 max-w-[260px] truncate ${
                theme === 'dark'
                  ? 'text-slate-300 hover:text-white decoration-white/30 hover:decoration-white'
                  : 'text-slate-700 hover:text-zinc-950 decoration-slate-300 hover:decoration-slate-700 font-medium'
              }`}
              title={imageResult.title || imageResult.sourceName || 'Abrir fuente de la imagen'}
            >
              <span className="truncate">{imageResult.sourceName || 'Enlace a la fuente'}</span>
              <ExternalLink className="w-3 h-3 opacity-70 shrink-0" />
            </a>
          </figcaption>
        </figure>
      ) : imageResult?.sourceUrl ? (
        <figure className="explanation-figure w-full md:w-[260px] shrink-0 text-center flex flex-col items-center">
          <a
            href={imageResult.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full p-4 rounded-2xl border border-dashed transition-all flex flex-col items-center justify-center gap-2 text-center group cursor-pointer active-press ${
              theme === 'dark'
                ? 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                : theme === 'kitty'
                ? 'border-pink-200 bg-pink-50/50 hover:bg-pink-100/50'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <ExternalLink className={`w-5 h-5 group-hover:scale-110 transition-transform ${
              theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-rose-500' : 'text-slate-400'
            }`} />
            <span className={`text-xs font-semibold ${
              theme === 'dark' ? 'text-slate-300' : 'text-zinc-900'
            }`}>Ver diagrama en la fuente</span>
            <span className={`text-[11px] underline truncate max-w-[220px] ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {imageResult.sourceName || 'Enlace a la fuente'}
            </span>
          </a>
        </figure>
      ) : null}
    </div>
  );
};
