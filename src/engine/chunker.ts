import type { DocumentChunk, DocumentAsset } from '../types';

/**
 * Segmentador Semántico Jerárquico Contrareloj Study (Strategic Semantic Chunker)
 * Fragmenta textos en bloques lógicos respetando secciones, diapositivas y párrafos,
 * con 15% de overlap y vinculación de proximidad a imágenes/tablas.
 */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function chunkDocument(
  rawText: string,
  assets: DocumentAsset[] = [],
  targetWordCount: number = 450,
  overlapRatio: number = 0.15
): DocumentChunk[] {
  if (!rawText || rawText.trim().length === 0) return [];

  // Separar en bloques lógicos primarios respetando diapositivas, páginas numeradas y encabezados
  const logicalBlocks = rawText
    .split(/(?=\n##\s+Diapositiva\s+\d+|\n\[Página\s+\d+\]|\n=== MATERIAL DE ESTUDIO|\n#{1,3}\s+|\n\n+)/g)
    .map(b => b.trim())
    .filter(Boolean);

  const hasSlideOrPageStructure = /Diapositiva\s+\d+|\[Página\s+\d+\]/i.test(rawText);
  // En diapositivas usar tamaño de chunk más ágil (160 palabras) para que cada diapositiva conserve su identidad
  const effectiveTargetWords = hasSlideOrPageStructure ? Math.min(targetWordCount, 180) : targetWordCount;
  const effectiveMinWords = hasSlideOrPageStructure ? 60 : 150;

  const chunks: DocumentChunk[] = [];
  let currentWords: string[] = [];
  let currentHeading = 'Introducción y Fundamentos';
  let currentPageOrSlide = 1;
  let chunkIndex = 0;

  for (const block of logicalBlocks) {
    // Detectar si el bloque define un nuevo encabezado
    const headingMatch = block.match(/^#{1,3}\s+(.+)$/m) || block.match(/^=== MATERIAL DE ESTUDIO\s+\d+:\s*([^(=]+)/m);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
    }

    // Detectar si indica diapositiva o página
    const slideMatch = block.match(/Diapositiva\s+(\d+)/i) || block.match(/\[Página\s+(\d+)\]/i) || block.match(/Página\s+(\d+)/i);
    const isNewSlideOrPage = Boolean(slideMatch);
    if (slideMatch) {
      currentPageOrSlide = parseInt(slideMatch[1], 10);
    }

    const blockWords = block.split(/\s+/).filter(Boolean);

    // Si encontramos una nueva diapositiva/página y ya tenemos palabras acumuladas, o si superamos el tamaño objetivo
    const shouldFlush = (isNewSlideOrPage && currentWords.length >= effectiveMinWords) ||
      (currentWords.length + blockWords.length > effectiveTargetWords && currentWords.length >= effectiveMinWords);

    if (shouldFlush) {
      // Crear chunk actual
      const chunkText = currentWords.join(' ');
      const chunkId = `chk-${chunkIndex}-${uid()}`;

      // Asociar activos por proximidad y por número de diapositiva o página
      const associatedAssetIds: string[] = [];
      for (const asset of assets) {
        if (
          (asset.pageOrSlide && asset.pageOrSlide === currentPageOrSlide) ||
          (asset.caption && chunkText.toLowerCase().includes(asset.caption.toLowerCase().slice(0, 20))) ||
          (asset.contextNearby && chunkText.toLowerCase().includes(asset.contextNearby.toLowerCase().slice(0, 30)))
        ) {
          associatedAssetIds.push(asset.id);
        }
      }

      chunks.push({
        id: chunkId,
        chunkIndex,
        pageOrSlide: currentPageOrSlide,
        heading: currentHeading,
        text: chunkText,
        tokenCount: Math.ceil(currentWords.length * 1.3),
        assetIds: associatedAssetIds,
      });

      chunkIndex++;

      // Overlap: conservar el último 10% de palabras para mantener continuidad
      const overlapWordsCount = Math.floor(currentWords.length * Math.min(overlapRatio, 0.10));
      const overlap = currentWords.slice(-overlapWordsCount);
      currentWords = [...overlap, ...blockWords];
    } else {
      currentWords.push(...blockWords);
    }
  }

  // Empaquetar el último chunk restante
  if (currentWords.length > 0) {
    const chunkText = currentWords.join(' ');
    const chunkId = `chk-${chunkIndex}-${uid()}`;

    const associatedAssetIds: string[] = [];
    for (const asset of assets) {
      if (
        (asset.pageOrSlide && asset.pageOrSlide === currentPageOrSlide) ||
        (asset.caption && chunkText.toLowerCase().includes(asset.caption.toLowerCase().slice(0, 20))) ||
        (asset.contextNearby && chunkText.toLowerCase().includes(asset.contextNearby.toLowerCase().slice(0, 30)))
      ) {
        associatedAssetIds.push(asset.id);
      }
    }

    chunks.push({
      id: chunkId,
      chunkIndex,
      pageOrSlide: currentPageOrSlide,
      heading: currentHeading,
      text: chunkText,
      tokenCount: Math.ceil(currentWords.length * 1.3),
      assetIds: associatedAssetIds,
    });
  }

  return chunks;
}
