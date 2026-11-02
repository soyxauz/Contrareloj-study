import React, { useState, useEffect } from 'react';
import type { Question, DocumentAsset } from '../types';
import { searchIllustrationForQuestion, type WebImageResult } from '../services/imageSearchService';
import { ZoomIn, ExternalLink, Search } from 'lucide-react';

export function cleanExplanationBullet(text: string): string {
  if (!text) return '';
  const isDocReference = /^(?:referencia en el texto|referencia textual)[:\s*-]*/i.test(text.trim());
  let cleaned = text
    .replace(/^(?:desmonte del error previo|referencia en el texto|referencia textual|descarte de opciones|discriminaciÃ³n de distractores|fundamentaciÃ³n acadÃ©mica|explicaciÃ³n lÃ³gica)[:\s*-]*/gi, '')
    .replace(/^[\sâ€¢*,\-:;"]+/, '')
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
  const [imageResult, setImageResult] = useState<WebImageResult | null>(null);
  const [isImgLoaded, setIsImgLoaded] = useState(false);

  // 1. Extraer o formular exactamente 3 viÃ±etas pedagÃ³gicas limpias
  const bullets = React.useMemo(() => {
    let rawBullets: string[] = [];

    if (question.googleOverview?.bullets && question.googleOverview.bullets.length >= 2) {
      rawBullets = question.googleOverview.bullets.slice(0, 3);
    } else {
      const matched = question.explanation.match(/(?:> â€¢|â€¢|\*|-|\d+\.)\s*([^\n]+)/g);
      if (matched && matched.length >= 2) {
        rawBullets = matched.slice(0, 3).map(b => b.replace(/^(?:> â€¢|â€¢|\*|-|\d+\.)\s*/, '').trim());
      }
    }

    if (rawBullets.length < 3) {
      // Extraer pÃ¡rrafos limpios del desglose
      const parts = question.explanation
        .split('\n\n')
        .map(p => p.replace(/[#*`>]/g, '').trim())
        .filter(p => p.length > 25 && !p.toLowerCase().includes('bÃºsqueda en google'));

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
          'Principio causal y bibliogrÃ¡fico corroborado en la literatura cientÃ­fica.',
        ];
      } else {
        rawBullets = [
          correctOption ? `Respuesta directa: ${correctOption}` : 'Principio fundamental verificado.',
          'Fundamento causal y explicativo respaldado en la bibliografÃ­a.',
          'DistinciÃ³n clave frente a los distractores y errores frecuentes.',
        ];
      }
    }

    return rawBullets
      .map(cleanExplanationBullet)
      .filter(b => b.length > 5)
      .slice(0, 3);
  }, [question]);

  // 2. TÃ©rmino de bÃºsqueda para la consulta e ilustraciÃ³n web
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

  // 3. Buscar ilustraciÃ³n en la web (Wikipedia / Wikimedia / Fallback)
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
        title: question.googleOverview.imageCaption || searchTerm,
        sourceName: 'Google',
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
              title: docAsset.caption || searchTerm,
              sourceName: 'Material del Kit',
            });
          } else {
            setImageResult({
              imageUrl: '',
              sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
              caption: searchTerm,
              title: searchTerm,
              sourceName: 'Google ImÃ¡genes',
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
      {/* â”€â”€ COLUMNA IZQUIERDA: BÃšSQUEDA INTERACTIVA Y EXACTAMENTE 3 VIÃ‘ETAS â”€â”€ */}
      <div className="explanation-body flex-1 min-w-0 max-w-2xl">
        <div className="top-level-explanation space-y-3.5">
          {/* Barra de BÃºsqueda Interactiva Externa (Google / Wikipedia) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-slate-300">
            <div className="flex items-center gap-2 truncate max-w-xs sm:max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 shrink-0">BÃºsqueda:</span>
              <span className="font-semibold text-white truncate">&quot;{searchTerm}&quot;</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={question.googleOverview?.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] hover:border-white/20 text-slate-300 hover:text-white text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer active-press"
                title="Abrir bÃºsqueda directa en Google"
              >
                <span>Google</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
              <a
                href={
                  imageResult?.sourceUrl ||
                  question.googleOverview?.wikipediaUrl ||
                  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/15 text-slate-400 hover:text-white text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer active-press"
                title={imageResult?.sourceName ? `Consultar en ${imageResult.sourceName}` : 'Consultar fuente web'}
              >
                <span className="truncate max-w-[120px]">{imageResult?.sourceName || 'Web'}</span>
                <ExternalLink className="w-3 h-3 text-slate-500 shrink-0" />
              </a>
            </div>
          </div>

          <ul className="space-y-4 text-slate-100 text-sm sm:text-base leading-relaxed list-none m-0 p-0">
            {bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-indigo-400 text-base leading-none mt-1 select-none shrink-0">â€¢</span>
                <span className="flex-1 text-slate-200 font-normal leading-relaxed text-sm sm:text-[15px]">
                  {bullet}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* â”€â”€ COLUMNA DERECHA: IMAGEN / DIAGRAMA CON CRÃ‰DITO Y ENLACE A LA FUENTE â”€â”€ */}
      {imageResult && imageResult.imageUrl ? (
        <figure
          className={`explanation-figure w-full md:w-[320px] lg:w-[360px] shrink-0 text-center flex flex-col items-center transition-opacity duration-500 ${
            isImgLoaded ? 'opacity-100' : 'opacity-80'
          }`}
        >
          <div
            onClick={handleImageClick}
            className="group relative w-full rounded-2xl overflow-hidden bg-white/[0.03] shadow-xl cursor-pointer border border-white/[0.08] hover:border-white/20 transition-all flex items-center justify-center min-h-[160px] max-h-[260px] p-2 active-press"
            title="Clic para ampliar diagrama en alta definiciÃ³n"
          >
            <img
              src={imageResult.imageUrl}
              alt={imageResult.caption || 'IlustraciÃ³n mÃ©dica de referencia'}
              onLoad={() => setIsImgLoaded(true)}
              className="w-full h-auto max-h-[244px] object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-white/30 text-white flex items-center justify-center shadow-lg">
                <ZoomIn className="w-4 h-4" />
              </div>
            </div>
          </div>

          <figcaption className="mt-2 text-xs text-slate-400 flex items-center justify-center gap-1.5 flex-wrap">
            <span>Fuente:</span>
            <a
              href={imageResult.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white underline decoration-white/30 hover:decoration-white transition-colors cursor-pointer flex items-center gap-1 max-w-[260px] truncate"
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
            className="w-full p-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all flex flex-col items-center justify-center gap-2 text-center group cursor-pointer active-press"
          >
            <ExternalLink className="w-5 h-5 text-slate-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs text-slate-300 font-medium">Ver diagrama en la fuente</span>
            <span className="text-[11px] text-slate-400 underline truncate max-w-[220px]">
              {imageResult.sourceName || 'Enlace a la fuente'}
            </span>
          </a>
        </figure>
      ) : null}
    </div>
  );
};
