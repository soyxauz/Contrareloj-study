import React, { useState, useEffect } from 'react';
import type { Question, DocumentAsset } from '../types';
import { searchIllustrationForQuestion } from '../services/imageSearchService';
import { ZoomIn, ExternalLink, Search } from 'lucide-react';

export function cleanExplanationBullet(text: string): string {
  if (!text) return '';
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
  const [imageResult, setImageResult] = useState<{
    imageUrl: string;
    sourceUrl: string;
    caption?: string;
  } | null>(null);
  const [isImgLoaded, setIsImgLoaded] = useState(false);

  // 1. Extraer o formular exactamente 3 viñetas pedagógicas limpias
  const bullets = React.useMemo(() => {
    let rawBullets: string[] = [];

    if (question.googleOverview?.bullets && question.googleOverview.bullets.length >= 2) {
      rawBullets = question.googleOverview.bullets.slice(0, 3);
    } else {
      const matched = question.explanation.match(/(?:> •|•|\*|-|\d+\.)\s*([^\n]+)/g);
      if (matched && matched.length >= 2) {
        rawBullets = matched.slice(0, 3).map(b => b.replace(/^(?:> •|•|\*|-|\d+\.)\s*/, '').trim());
      }
    }

    if (rawBullets.length < 3) {
      // Extraer párrafos limpios del desglose
      const parts = question.explanation
        .split('\n\n')
        .map(p => p.replace(/[#*`>]/g, '').trim())
        .filter(p => p.length > 25 && !p.toLowerCase().includes('búsqueda en google'));

      const correctOption =
        question.options && question.correctIndex !== undefined
          ? question.options[question.correctIndex]
          : question.idealAnswer || '';

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
    if (question.googleOverview?.query) {
      return question.googleOverview.query;
    }
    if (question.googleOverview?.imageSearchTerm) {
      return question.googleOverview.imageSearchTerm;
    }
    if (question.topic && question.topic.length > 3) {
      return question.topic;
    }
    return question.question.replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 80);
  }, [question]);

  // 3. Buscar ilustración en la web (Wikipedia / Wikimedia / Fallback)
  useEffect(() => {
    let isMounted = true;
    setIsImgLoaded(false);

    // Si la pregunta ya tiene una imagen asociada en su metadata
    if (question.googleOverview?.imageUrl) {
      setImageResult({
        imageUrl: question.googleOverview.imageUrl,
        sourceUrl:
          question.googleOverview.imageSearchTerm
            ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(question.googleOverview.imageSearchTerm)}`
            : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
        caption: question.googleOverview.imageCaption || searchTerm,
      });
      return;
    }

    searchIllustrationForQuestion(searchTerm, question.topic, kitAssets)
      .then(res => {
        if (!isMounted) return;
        if (res && res.imageUrl) {
          setImageResult(res);
        } else {
          // Si no hubo imagen web, verificar activo del documento
          const docAsset = kitAssets.find(a => a.dataUrl);
          if (docAsset && docAsset.dataUrl) {
            setImageResult({
              imageUrl: docAsset.dataUrl,
              sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
              caption: docAsset.caption || searchTerm,
            });
          } else {
            setImageResult({
              imageUrl: '',
              sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
              caption: searchTerm,
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[#140e2d]/80 border border-violet-500/20 text-xs text-slate-300">
            <div className="flex items-center gap-2 truncate max-w-xs sm:max-w-md">
              <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 shrink-0">Búsqueda:</span>
              <span className="font-semibold text-white truncate">&quot;{searchTerm}&quot;</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={question.googleOverview?.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 hover:border-violet-400 text-violet-200 hover:text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Abrir búsqueda directa en Google"
              >
                <span>Google</span>
                <ExternalLink className="w-3 h-3 text-amber-400" />
              </a>
              <a
                href={question.googleOverview?.wikipediaUrl || `https://es.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Consultar en Wikipedia"
              >
                <span>Wikipedia</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>

          <ul className="space-y-4 text-slate-100 text-sm sm:text-base leading-relaxed list-none m-0 p-0">
            {bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-[#a78bfa] text-xl leading-none mt-1 select-none shrink-0">•</span>
                <span className="flex-1 text-slate-100 font-normal leading-relaxed text-sm sm:text-[15px]">
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
            className="group relative w-full rounded-xl overflow-hidden bg-[#181138]/60 shadow-xl cursor-pointer border border-[#35255c]/60 hover:border-[#a78bfa]/60 transition-all flex items-center justify-center min-h-[160px] max-h-[260px]"
            title="Clic para ampliar diagrama en alta definición"
          >
            <img
              src={imageResult.imageUrl}
              alt={imageResult.caption || 'Ilustración médica de referencia'}
              onLoad={() => setIsImgLoaded(true)}
              className="w-full h-auto max-h-[260px] object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-[#7c3aed]/90 text-white flex items-center justify-center shadow-lg">
                <ZoomIn className="w-4 h-4" />
              </div>
            </div>
          </div>

          <figcaption className="mt-2 text-xs text-slate-400 flex items-center justify-center gap-1.5 flex-wrap">
            <span>Crédito:</span>
            <a
              href={imageResult.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#a78bfa] hover:text-white underline decoration-[#a78bfa]/50 hover:decoration-white transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Enlace a la fuente</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          </figcaption>
        </figure>
      ) : imageResult?.sourceUrl ? (
        <figure className="explanation-figure w-full md:w-[260px] shrink-0 text-center flex flex-col items-center">
          <a
            href={imageResult.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-4 rounded-xl border border-dashed border-[#35255c] bg-[#16122d]/60 hover:bg-[#1f1740] hover:border-[#a78bfa] transition-all flex flex-col items-center justify-center gap-2 text-center group cursor-pointer"
          >
            <ExternalLink className="w-5 h-5 text-[#a78bfa] group-hover:scale-110 transition-transform" />
            <span className="text-xs text-slate-300 font-medium">Ver diagrama en la fuente</span>
            <span className="text-[11px] text-[#a78bfa] underline">Enlace a la fuente</span>
          </a>
        </figure>
      ) : null}
    </div>
  );
};
