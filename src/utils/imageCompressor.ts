import type { DocumentAsset } from '../types';

/**
 * Comprime una imagen en base64 (dataUrl) utilizando un canvas HTML offscreen.
 * Escala dimensiones máximas a 1100px y codifica en WebP (con fallback a JPEG).
 * Si la imagen original ya es más compacta (e.g. svg o miniatura <120KB), preserva el original.
 */
export async function compressImageForSharing(
  dataUrl: string,
  maxDimension = 1100,
  quality = 0.78
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }

  // Los SVG vectoriales ya son sumamente ligeros y no deben renderizarse en canvas raster
  if (dataUrl.startsWith('data:image/svg+xml')) {
    return dataUrl;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const finish = (result: string) => {
      resolve(result);
    };

    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        if (origW <= 0 || origH <= 0) {
          return finish(dataUrl);
        }

        // Si ya es de tamaño moderado (<150KB) y dimensiones normales, no requiere re-compresión
        if (dataUrl.length < 150_000 && origW <= maxDimension && origH <= maxDimension) {
          return finish(dataUrl);
        }

        // Redimensionar proporcionalmente respetando la relación de aspecto
        const scale = Math.min(maxDimension / origW, maxDimension / origH, 1);
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return finish(dataUrl);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // 1. Intentar WebP (ultra compacto)
        let candidate = '';
        try {
          candidate = canvas.toDataURL('image/webp', quality);
        } catch {
          candidate = '';
        }

        // 2. Fallback a JPEG si WebP no produjo ahorro o navegador no lo soporta
        if (!candidate || candidate.startsWith('data:image/png') || candidate.length >= dataUrl.length) {
          try {
            const jpegCandidate = canvas.toDataURL('image/jpeg', quality);
            if (jpegCandidate && jpegCandidate.length < (candidate?.length || dataUrl.length)) {
              candidate = jpegCandidate;
            }
          } catch {}
        }

        // Si el resultado comprimido es menor que el original, devolverlo
        if (candidate && candidate.length > 50 && candidate.length < dataUrl.length) {
          return finish(candidate);
        }

        return finish(dataUrl);
      } catch (err) {
        console.warn('[imageCompressor] Aviso al comprimir imagen en canvas:', err);
        return finish(dataUrl);
      }
    };

    img.onerror = () => {
      finish(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Comprime un DocumentAsset individual.
 */
export async function compressDocumentAsset(
  asset: DocumentAsset,
  maxDimension = 1100,
  quality = 0.78
): Promise<DocumentAsset> {
  if (!asset.dataUrl) return asset;
  const compressed = await compressImageForSharing(asset.dataUrl, maxDimension, quality);
  return {
    ...asset,
    dataUrl: compressed,
  };
}

/**
 * Comprime por lotes concurrentes (concurrencia máx 4) un arreglo de DocumentAsset.
 * Notifica el avance para proveer feedback fluido al usuario.
 */
export async function compressAssetsForSharing(
  assets: DocumentAsset[],
  onProgress?: (completed: number, total: number) => void
): Promise<DocumentAsset[]> {
  if (!assets || assets.length === 0) return [];

  const total = assets.length;
  let completed = 0;
  const results: DocumentAsset[] = new Array(total);

  const CONCURRENCY = 4;
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < total) {
      const idx = currentIndex++;
      const asset = assets[idx];
      try {
        results[idx] = await compressDocumentAsset(asset);
      } catch {
        results[idx] = asset;
      }
      completed++;
      if (onProgress) {
        onProgress(completed, total);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);

  return results;
}
