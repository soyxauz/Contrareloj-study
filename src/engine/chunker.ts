import type { DocumentChunk, DocumentAsset } from '../types';

/**
 * Segmentador Semántico Jerárquico Contrareloj Study (Strategic Semantic Chunker)
 * Fragmenta textos en bloques lógicos respetando secciones, diapositivas y párrafos
 * (preservando saltos de párrafo y saltos de línea originales), con vinculación exacta de páginas y activos.
 */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Detecta exclusivamente etiquetas estructurales de página o diapositiva (inicio de bloque/línea),
 * evitando falsos positivos por menciones en prosa (ej: "ver pág. 12 del apéndice").
 */
const CHUNK_PAGE_MARKER_REGEX =
  /(?:^|\n)\s*(?:##\s*)?(?:\[Página\s+(\d+)\]|\[Diapositiva\s+(\d+)\]|Diapositiva\s+(\d+)(?=\s*(?::|\n|$))|Página\s+(\d+)(?=\s*(?::|\n|$)))/i;

function extractStructuralPageNumber(block: string): number | undefined {
  const m = block.match(CHUNK_PAGE_MARKER_REGEX);
  if (!m) return undefined;
  for (let i = 1; i < m.length; i++) {
    if (m[i]) {
      const n = parseInt(m[i], 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return undefined;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function chunkDocument(
  rawText: string,
  assets: DocumentAsset[] = [],
  targetWordCount: number = 450,
  overlapRatio: number = 0.15
): DocumentChunk[] {
  if (!rawText || rawText.trim().length === 0) return [];

  const normalizedRaw = rawText.replace(/\r\n/g, '\n');

  // Separar en bloques lógicos primarios respetando diapositivas, páginas numeradas, encabezados y párrafos (\n\n)
  const logicalBlocks = normalizedRaw
    .split(/(?=(?:^|\n)(?:##\s+Diapositiva\s+\d+|\[Página\s+\d+\]|\[Diapositiva\s+\d+\]|=== MATERIAL DE ESTUDIO|#{1,3}\s+)|\[Página\s+\d+\]|\[Diapositiva\s+\d+\]|##\s+Diapositiva\s+\d+|\n\n+)/g)
    .map(b => b.trim())
    .filter(Boolean);

  const hasSlideOrPageStructure = /(?:^|\n)\s*(?:##\s*)?(?:Diapositiva\s+\d+|\[Página\s+\d+\]|\[Diapositiva\s+\d+\])/im.test(normalizedRaw);
  // En diapositivas usar tamaño de chunk más ágil (180 palabras) para que cada diapositiva conserve su identidad
  const effectiveTargetWords = hasSlideOrPageStructure ? Math.min(targetWordCount, 180) : targetWordCount;
  const effectiveMinWords = hasSlideOrPageStructure ? 60 : 150;

  const chunks: DocumentChunk[] = [];
  let currentBlocks: string[] = [];
  let currentWordCount = 0;
  let currentHeading = 'Introducción y Fundamentos';
  let currentPageOrSlide = 1;
  let chunkIndex = 0;

  const flushChunk = () => {
    if (currentBlocks.length === 0) return;
    // Preservar saltos reales de párrafo (\n\n) en lugar de aplastarlos con espacios simples
    const chunkText = currentBlocks.join('\n\n').trim();
    if (!chunkText) return;
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
      tokenCount: Math.ceil(currentWordCount * 1.3),
      assetIds: associatedAssetIds,
    });

    chunkIndex++;
  };

  for (const block of logicalBlocks) {
    // Detectar si el bloque define un nuevo encabezado
    const headingMatch =
      block.match(/^#{1,3}\s+(.+)$/m) ||
      block.match(/^=== MATERIAL DE ESTUDIO\s+\d+:\s*([^(=]+)/m);
    const nextHeading = headingMatch ? headingMatch[1].trim() : undefined;

    // Detectar si indica una nueva diapositiva o página estructural real
    const nextSlideOrPage = extractStructuralPageNumber(block);
    const isNewSlideOrPage = nextSlideOrPage !== undefined && nextSlideOrPage !== currentPageOrSlide;

    const blockWordCount = countWords(block);

    // Si es una etiqueta solitaria de página (ej. "[Página 4]") sin prosa aún y ya hay bloques de la página anterior:
    // primero empaquetamos la página anterior, actualizamos página y acumulamos la etiqueta con el párrafo siguiente.
    const shouldFlush =
      (isNewSlideOrPage && currentBlocks.length > 0) ||
      (currentWordCount + blockWordCount > effectiveTargetWords && currentWordCount >= effectiveMinWords);

    if (shouldFlush) {
      flushChunk();

      if (nextSlideOrPage !== undefined) {
        currentPageOrSlide = nextSlideOrPage;
      }

      if (isNewSlideOrPage) {
        currentBlocks = [block];
        currentWordCount = blockWordCount;
      } else {
        // Overlap discreto dentro de la misma página preservando el último párrafo corto como contexto
        const prevBlock = currentBlocks[currentBlocks.length - 1];
        const prevWords = prevBlock ? countWords(prevBlock) : 0;
        const maxOverlapWords = Math.max(30, Math.floor(effectiveTargetWords * Math.min(overlapRatio, 0.15)));
        if (prevBlock && prevWords <= maxOverlapWords && !CHUNK_PAGE_MARKER_REGEX.test(prevBlock)) {
          currentBlocks = [prevBlock, block];
          currentWordCount = prevWords + blockWordCount;
        } else {
          currentBlocks = [block];
          currentWordCount = blockWordCount;
        }
      }
    } else {
      if (nextSlideOrPage !== undefined) {
        currentPageOrSlide = nextSlideOrPage;
      }
      currentBlocks.push(block);
      currentWordCount += blockWordCount;
    }

    if (nextHeading && !/^Diapositiva\s+\d+:?$/i.test(nextHeading)) {
      currentHeading = nextHeading;
    }
  }

  flushChunk();

  return chunks;
}
