import type { DocumentAsset } from '../types';
import { getAssetById } from '../services/storageService';

export interface ImageClassificationResult {
  isDecorative: boolean;
  reason?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  pending?: boolean;
}

/**
 * Parámetros de umbral configurables para clasificar imágenes de documentos
 */
export const IMAGE_FILTER_CONFIG = {
  MIN_WIDTH: 180,
  MIN_HEIGHT: 180,
  MAX_ASPECT_RATIO: 3.8, // Banners horizontales extremos (cabeceras / pies de diapositiva)
  MIN_ASPECT_RATIO: 0.25, // Separadores verticales ultra estrechos
  MAX_FLAT_DOMINANT_RATIO: 0.85, // Si más del 85% es exactamente el mismo color plano
  MIN_CONTRAST_RANGE_FOR_DARK: 100, // Bloques oscuros sin texto ni contraste
  MAX_LUM_FOR_DIM_BLOCK: 120,
};

/**
 * Analiza un lienzo Canvas o contexto para evaluar si la imagen es un bloque decorativo,
 * banner de plantilla o logo de licencia sin valor pedagógico.
 */
export function analyzeCanvasContent(
  canvas: HTMLCanvasElement,
  w: number,
  h: number
): { isDecorative: boolean; reason?: string } {
  // 1. Regla de dimensión mínima: iconos, logos y viñetas
  if (w < IMAGE_FILTER_CONFIG.MIN_WIDTH || h < IMAGE_FILTER_CONFIG.MIN_HEIGHT) {
    return {
      isDecorative: true,
      reason: `Dimensiones inferiores al umbral pedagógico (${w}x${h} px < ${IMAGE_FILTER_CONFIG.MIN_WIDTH}x${IMAGE_FILTER_CONFIG.MIN_HEIGHT} px)`,
    };
  }

  // 2. Regla de proporción extrema: barras de encabezado o separadores de margen
  const aspectRatio = w / h;
  if (aspectRatio > IMAGE_FILTER_CONFIG.MAX_ASPECT_RATIO) {
    return {
      isDecorative: true,
      reason: `Banner horizontal extremo de plantilla (relación de aspecto ${aspectRatio.toFixed(1)} > ${IMAGE_FILTER_CONFIG.MAX_ASPECT_RATIO})`,
    };
  }
  if (aspectRatio < IMAGE_FILTER_CONFIG.MIN_ASPECT_RATIO) {
    return {
      isDecorative: true,
      reason: `Separador vertical estrecho de margen (relación de aspecto ${aspectRatio.toFixed(1)} < ${IMAGE_FILTER_CONFIG.MIN_ASPECT_RATIO})`,
    };
  }

  // 3. Análisis de píxeles mediante thumbnail muestreado de 32x32
  try {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 32;
    sampleCanvas.height = 32;
    const sCtx = sampleCanvas.getContext('2d');
    if (!sCtx) return { isDecorative: false };

    sCtx.drawImage(canvas, 0, 0, 32, 32);
    const imgData = sCtx.getImageData(0, 0, 32, 32);
    const data = imgData.data;

    let minLum = 255;
    let maxLum = 0;
    const colorBins = new Map<number, number>();
    const totalPixels = 32 * 32;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 20) continue; // Píxel transparente
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;

      // Agrupamiento de color a 4 bits por canal para histograma
      const key = (Math.floor(r / 16) << 8) | (Math.floor(g / 16) << 4) | Math.floor(b / 16);
      colorBins.set(key, (colorBins.get(key) || 0) + 1);
    }

    const contrastRange = maxLum - minLum;

    // Detectar imágenes casi negras o lisas
    if (maxLum < 20) {
      return {
        isDecorative: true,
        reason: 'Lienzo negro o plano sin elementos visibles',
      };
    }

    // Detectar bloques oscuros de plantilla (como rectángulos azul oscuro sobre fondo negro)
    if (
      maxLum < IMAGE_FILTER_CONFIG.MAX_LUM_FOR_DIM_BLOCK &&
      contrastRange < IMAGE_FILTER_CONFIG.MIN_CONTRAST_RANGE_FOR_DARK
    ) {
      return {
        isDecorative: true,
        reason: 'Bloque geométrico oscuro o adorno de fondo sin contraste ni texto pedagógico',
      };
    }

    // Detectar bloques uniformes casi monocromáticos
    let maxBinCount = 0;
    for (const count of colorBins.values()) {
      if (count > maxBinCount) maxBinCount = count;
    }
    const dominantRatio = maxBinCount / totalPixels;

    if (dominantRatio > IMAGE_FILTER_CONFIG.MAX_FLAT_DOMINANT_RATIO && contrastRange < 120) {
      return {
        isDecorative: true,
        reason: 'Superficie de color plano o caja decorativa con más del 85% de uniformidad',
      };
    }

    if (colorBins.size <= 3 && contrastRange < 100) {
      return {
        isDecorative: true,
        reason: 'Elemento vectorial plano con menos de 4 colores y sin texto ni trazos',
      };
    }

    // Detectar bloques geométricos simples (ej. un rectángulo sólido sobre fondo plano)
    if (colorBins.size <= 10 && dominantRatio > 0.55) {
      return {
        isDecorative: true,
        reason: `Elemento geométrico plano o adorno de plantilla (${colorBins.size} colores, ${(dominantRatio * 100).toFixed(0)}% fondo uniforme)`,
      };
    }
  } catch {
    // Si falla el muestreo, permitir imagen
  }

  return { isDecorative: false };
}

/**
 * Clasifica un activo documental a partir de su dataUrl o dimensiones conocidas.
 */
export async function classifyDocumentAsset(
  asset: DocumentAsset
): Promise<ImageClassificationResult> {
  // Si ya tiene dimensiones y bandera explícita
  if (asset.isDecorative !== undefined && asset.width && asset.height) {
    return {
      isDecorative: asset.isDecorative,
      width: asset.width,
      height: asset.height,
    };
  }

  let dataUrl = asset.dataUrl;

  // Si no está en memoria, consultar almacenamiento IndexedDB
  if ((!dataUrl || !dataUrl.startsWith('data:image')) && asset.id) {
    try {
      const stored = await getAssetById(asset.id);
      if (stored?.dataUrl && stored.dataUrl.startsWith('data:image')) {
        dataUrl = stored.dataUrl;
      }
    } catch {}
  }

  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return { isDecorative: false, pending: true };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const aspectRatio = h > 0 ? w / h : 1;

      // Creación de canvas temporal para análisis
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(w, 600);
      canvas.height = Math.min(h, 600);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ isDecorative: false, width: w, height: h, aspectRatio });
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const analysis = analyzeCanvasContent(canvas, w, h);

      canvas.width = 0;
      canvas.height = 0;

      resolve({
        isDecorative: analysis.isDecorative,
        reason: analysis.reason,
        width: w,
        height: h,
        aspectRatio,
        pending: false,
      });
    };

    img.onerror = () => {
      resolve({ isDecorative: false, pending: false });
    };

    img.src = dataUrl;
  });
}
