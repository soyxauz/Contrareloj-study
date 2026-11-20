import React, { useState, useEffect } from 'react';
import type { Question, DocumentAsset } from '../types';
import { searchIllustrationForQuestion, extractCoreEntityTerms, type WebImageResult } from '../services/imageSearchService';
import { ZoomIn, ExternalLink, Search } from 'lucide-react';
import { useTheme } from '../services/themeService';
import { cleanImageBlackBackground } from '../utils/imageCleaner';
import { isGenericBoilerplateBullet } from '../services/aiService';

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
  if (isDocReference && cleaned.length < 80 && !/principio fundamental|mecanismo causal/i.test(cleaned)) {
    return `Fundamento y marco conceptual correspondiente a ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}.`;
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface TheaExplanationViewProps {
  question: Question;
  kitAssets?: DocumentAsset[];
  kitCategory?: string;
  onZoomImage?: (asset: DocumentAsset) => void;
}

export const TheaExplanationView: React.FC<TheaExplanationViewProps> = ({
  question,
  kitAssets = [],
  kitCategory,
  onZoomImage,
}) => {
  const { theme } = useTheme();
  const [imageResult, setImageResult] = useState<WebImageResult | null>(null);
  const [isImgLoaded, setIsImgLoaded] = useState(false);

  // Extraer la respuesta correcta limpia (para usarla tanto en viñetas como en la búsqueda de imágenes)
  const correctOption = React.useMemo(() => {
    let raw =
      question?.options && question.correctIndex !== undefined
        ? question.options[question.correctIndex]
        : question?.idealAnswer || '';
    if (!raw && Array.isArray(question?.blanksCorrect) && question.blanksCorrect.length > 0) {
      const nonNumeric = question.blanksCorrect.filter(b => isNaN(Number(b)));
      if (nonNumeric.length > 0) {
        raw = nonNumeric[0];
      }
    }
    return raw ? raw.replace(/^[a-d]\)\s*/i, '').trim() : '';
  }, [question]);

  // 1. Extraer o formular exactamente 3 viñetas pedagógicas limpias y 100% específicas (cero boilerplate)
  const bullets = React.useMemo(() => {
    const safeExplanation = question?.explanation || '';

    // Filtrar viñetas existentes rechazando cualquier texto genérico o placeholder
    let validBullets = (question?.googleOverview?.bullets || [])
      .map(cleanExplanationBullet)
      .filter(b => b.length >= 12 && !isGenericBoilerplateBullet(b));

    // Si faltan viñetas, intentar extraer oraciones válidas de safeExplanation
    if (validBullets.length < 3 && safeExplanation) {
      const matched = safeExplanation.match(/(?:> •|•|\*|-|\d+\.)\s*([^\n]+)/g);
      if (matched) {
        const cleanedFromSafe = matched
          .map(b => cleanExplanationBullet(b.replace(/^(?:> •|•|\*|-|\d+\.)\s*/, '')))
          .filter(b => b.length >= 15 && !isGenericBoilerplateBullet(b));
        for (const c of cleanedFromSafe) {
          if (validBullets.length >= 3) break;
          if (!validBullets.includes(c)) validBullets.push(c);
        }
      }
    }

    if (validBullets.length < 3 && safeExplanation) {
      const parts = safeExplanation
        .split('\n\n')
        .map(p => cleanExplanationBullet(p.replace(/[#*`>]/g, '')))
        .filter(p => p.length > 25 && !p.toLowerCase().includes('búsqueda en google') && !isGenericBoilerplateBullet(p));
      for (const p of parts) {
        if (validBullets.length >= 3) break;
        if (!validBullets.includes(p)) validBullets.push(p);
      }
    }

    // Si aún faltan viñetas, sintetizar con base en los datos concretos de la pregunta (cero placeholders)
    const topic = question?.topic && question.topic.trim().length > 2 && question.topic.toLowerCase() !== 'general'
      ? question.topic.trim()
      : 'este tema';
    const cleanQ = (question?.question || '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^eval[uú]a la veracidad[^:]*:\s*/i, '')
      .replace(/^[¿?¡!]/g, '')
      .trim();
    const cleanAns = correctOption;

    // Viñeta 1: Conclusión directa y afirmación clave
    if (validBullets.length < 1) {
      if (question?.type === 'true-false') {
        const isTrue = cleanAns.toLowerCase().includes('verdad') || question.correctIndex === 0;
        if (isTrue) {
          validBullets.push(`Verdadero: Se corrobora fielmente que ${cleanQ || topic}.`);
        } else {
          validBullets.push(`Falso: La premisa planteada discrepa de lo establecido en el marco conceptual de ${topic}.`);
        }
      } else if (cleanAns) {
        validBullets.push(`Respuesta exacta: "${cleanAns}", correspondiente al criterio analítico evaluado en ${topic}.`);
      } else {
        validBullets.push(`Fundamento directo verificado en relación con el principio de ${topic}.`);
      }
    }

    // Viñeta 2: Mecanismo causal o fundamentación textual
    if (validBullets.length < 2) {
      if (question?.sourceExcerpt && question.sourceExcerpt.trim().length >= 15) {
        const tr = question.sourceExcerpt.trim();
        const exc = tr.length > 140 ? tr.slice(0, 135) + '…' : tr;
        validBullets.push(`Fundamento textual: «${exc}».`);
      } else {
        validBullets.push(`Mecanismo y vía explicativa: Los procesos y criterios fundamentados en ${topic} sustentan con rigor esta conclusión.`);
      }
    }

    // Viñeta 3: Diferenciación conceptual frente a errores
    if (validBullets.length < 3) {
      const distractors = question?.options && question.correctIndex !== undefined
        ? question.options.filter((_, idx) => idx !== question.correctIndex).slice(0, 2)
        : [];
      if (distractors.length > 0) {
        const distStr = distractors.map(d => d.replace(/^[a-d]\)\s*/i, '').trim()).filter(Boolean).join(' o ');
        validBullets.push(`Diferenciación conceptual: Se descartan las alternativas erróneas (${distStr}) por no satisfacer las características específicas de ${topic}.`);
      } else {
        validBullets.push(`Diferenciación conceptual: En el análisis de ${topic}, es fundamental distinguir esta entidad de conceptos o estructuras afines.`);
      }
    }

    return validBullets.slice(0, 3);
  }, [question, correctOption]);

  // 2. Término de búsqueda para la consulta e ilustración web
  // REQUISITO ESTRICTO: La figura y la búsqueda DEBEN relacionarse prioritariamente con la respuesta de la pregunta y su pregunta
  const searchTerm = React.useMemo(() => {
    // 1. Si la respuesta es un concepto clínico/sustantivo (no booleano ni letra)
    const normAns = cleanExplanationBullet(correctOption).toLowerCase();
    const isBooleanOrLetter = /^(verdadero|falso|verdad|falsa|todas|ninguna|[a-d])$/i.test(normAns);
    if (correctOption.length >= 3 && !isBooleanOrLetter && correctOption.split(/\s+/).length <= 4) {
      return correctOption;
    }

    // 2. imageSearchTerm específico de la IA si es conciso (1 a 4 palabras)
    if (question?.googleOverview?.imageSearchTerm && question.googleOverview.imageSearchTerm.trim().length > 2) {
      const raw = question.googleOverview.imageSearchTerm.trim();
      const words = raw.split(/\s+/);
      if (!raw.includes('[') && !raw.includes(']') && !raw.toLowerCase().includes('palabras clave') && words.length <= 4) {
        return raw;
      }
    }

    // 3. Subtema conciso si tiene hasta 4 palabras
    if (question?.topic && question.topic.trim().length > 2 && question.topic.toLowerCase() !== 'general') {
      const cleanT = question.topic.replace(/[¿?¡!.]/g, '').trim();
      if (cleanT.split(/\s+/).length <= 4) {
        return cleanT;
      }
    }

    // 4. Si la pregunta o el tema es una frase larga (ej: "Contraindicaciones de la fototerapia en psoriasis"),
    // extraer la entidad clínica nuclear de mayor relevancia:
    const entities = extractCoreEntityTerms({
      query: question?.googleOverview?.query,
      imageSearchTerm: question?.googleOverview?.imageSearchTerm,
      topic: question?.topic,
      questionText: question?.question,
      correctAnswer: correctOption
    });
    if (entities.length > 0) {
      return entities[0].charAt(0).toUpperCase() + entities[0].slice(1);
    }

    return question?.topic || 'Concepto de estudio';
  }, [question, correctOption]);

  // 3. Buscar ilustración en la web (Wikipedia / Wikimedia / Fallback con estricta pertinencia)
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

    const correctOpt =
      question?.options && question.correctIndex !== undefined
        ? question.options[question.correctIndex]
        : question?.idealAnswer || '';

    searchIllustrationForQuestion(
      searchTerm,
      {
        query: question?.googleOverview?.query || searchTerm,
        imageSearchTerm: question?.googleOverview?.imageSearchTerm,
        topic: question?.topic,
        questionText: question?.question,
        correctAnswer: correctOpt,
        topicDiscipline: kitCategory,
        bullets,
        kitAssets,
      },
      kitAssets
    )
      .then(res => {
        if (!isMounted) return;
        if (res && res.imageUrl) {
          // Mostrar imagen de inmediato sin esperar el procesamiento de canvas
          setImageResult(res);
          cleanImageBlackBackground(res.imageUrl).then(cleaned => {
            if (!isMounted || cleaned === res.imageUrl) return;
            setImageResult(prev => prev ? { ...prev, imageUrl: cleaned } : null);
          });
        } else {
          // POLÍTICA ESTRICTA: Cero basura. Si no hay imagen web pertinente ni figura del kit vinculada,
          // no inventar imagen para que el texto tome el ancho completo limpiamente.
          setImageResult({
            imageUrl: '',
            sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`,
            caption: searchTerm,
            title: searchTerm,
            sourceName: 'Google Imágenes',
          });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setImageResult(null);
      });

    return () => {
      isMounted = false;
    };
  }, [searchTerm, question, kitAssets, bullets]);

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

  const hasValidImage = Boolean(imageResult && imageResult.imageUrl);

  return (
    <div className={`explanation-wrapper w-full max-w-full min-w-0 overflow-hidden flex flex-col md:flex-row items-center md:items-start justify-between gap-6 md:gap-10 mt-6 pt-4 text-left animate-fadeIn ${
      hasValidImage ? '' : 'max-w-4xl'
    }`}>
      {/* ── COLUMNA IZQUIERDA: BÚSQUEDA INTERACTIVA Y EXACTAMENTE 3 VIÑETAS ── */}
      <div className={`explanation-body flex-1 min-w-0 w-full max-w-full overflow-hidden ${hasValidImage ? 'max-w-2xl' : 'w-full'}`}>
        <div className="top-level-explanation space-y-3.5 w-full max-w-full min-w-0">
          {/* Barra de Búsqueda Interactiva Externa (Google / Wikipedia) */}
          <div className={`flex flex-col xs:flex-row xs:items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs border w-full max-w-full min-w-0 ${
            theme === 'dark'
              ? 'bg-white/[0.03] border-white/[0.08] text-slate-300'
              : theme === 'kitty'
              ? 'bg-pink-50/70 border-pink-200 text-pink-900'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-2 min-w-0 w-full xs:w-auto truncate">
              <Search className={`w-3.5 h-3.5 shrink-0 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-rose-500' : 'text-slate-400'}`} />
              <span className={`text-[10px] uppercase tracking-wider font-mono shrink-0 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500 font-bold'}`}>Búsqueda:</span>
              <span className={`font-semibold truncate max-w-[180px] xs:max-w-[240px] sm:max-w-none ${theme === 'dark' ? 'text-white' : 'text-zinc-950 font-bold'}`}>&quot;{searchTerm}&quot;</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full xs:w-auto justify-end">
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

          <ul className="space-y-4 text-[15px] sm:text-base leading-relaxed list-none m-0 p-0 w-full max-w-full min-w-0">
            {bullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-3 w-full max-w-full min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full mt-2 select-none shrink-0 ${
                  theme === 'kitty' ? 'bg-pink-500' : theme === 'light' ? 'bg-rose-500' : 'bg-indigo-400'
                }`} />
                <span className={`flex-1 min-w-0 w-full overflow-hidden break-words font-normal leading-relaxed text-[15px] sm:text-base ${
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
      {hasValidImage && imageResult ? (
        <figure
          className={`explanation-figure w-full md:w-[320px] lg:w-[360px] shrink-0 text-center flex flex-col items-center transition-opacity duration-500 ${
            isImgLoaded ? 'opacity-100' : 'opacity-80'
          }`}
        >
          <div
            onClick={handleImageClick}
            className="explanation-img-box group relative w-full rounded-2xl overflow-hidden bg-white shadow-md cursor-pointer border border-slate-200 hover:border-slate-300 transition-[border-color,box-shadow,transform] duration-200 flex items-center justify-center min-h-[160px] max-h-[260px] p-2 active:scale-[0.985]"
            title="Clic para ampliar diagrama en alta definición"
          >
            <img
              src={imageResult.imageUrl}
              alt={imageResult.caption || 'Ilustración médica de referencia'}
              onLoad={() => setIsImgLoaded(true)}
              className="w-full h-auto max-h-[244px] object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300 bg-white"
            />
            <div className="explanation-hover-overlay absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center rounded-2xl pointer-events-none">
              <div className="w-9 h-9 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-xl transform translate-y-1 group-hover:translate-y-0 transition-transform duration-150 ease-out">
                <ZoomIn className="w-4 h-4 stroke-[2.2]" />
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
      ) : null}
    </div>
  );
};
