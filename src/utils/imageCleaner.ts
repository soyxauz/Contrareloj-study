/**
 * Utilidad de alto rendimiento para garantizar fondo blanco puro (#ffffff)
 * en imágenes y figuras extraídas de documentos, transparencias PDF y diagramas.
 * Convierte fondos negros (provenientes de alfa=0 en JPEG o letterboxing) a blanco puro.
 */

const MAX_CLEAN_CACHE_SIZE = 5;
const cleanCache = new Map<string, string>();

function putInCleanCache(key: string, val: string): void {
  if (cleanCache.has(key)) {
    cleanCache.delete(key);
  } else if (cleanCache.size >= MAX_CLEAN_CACHE_SIZE) {
    const oldest = cleanCache.keys().next().value;
    if (oldest !== undefined) {
      cleanCache.delete(oldest);
    }
  }
  cleanCache.set(key, val);
}

/**
 * Libera de forma inmediata la memoria RAM ocupada por las imágenes procesadas en canvas.
 */
export function purgeImageCleanerCache(): void {
  cleanCache.clear();
}

/**
 * Detecta si una imagen tiene fondo negro en los bordes y lo reemplaza por blanco puro.
 * Utiliza un canvas offscreen de una sola pasada con composite y flood-fill perimetral.
 */
export async function cleanImageBlackBackground(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }

  // Caché acotada LRU en memoria para respuesta a 0ms en renders subsecuentes
  if (cleanCache.has(dataUrl)) {
    const cached = cleanCache.get(dataUrl)!;
    cleanCache.delete(dataUrl);
    cleanCache.set(dataUrl, cached);
    return cached;
  }

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(dataUrl);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        if (w <= 0 || h <= 0) {
          putInCleanCache(dataUrl, dataUrl);
          return resolve(dataUrl);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          putInCleanCache(dataUrl, dataUrl);
          return resolve(dataUrl);
        }

        // Pintar imagen original en canvas
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Comprobar las 4 esquinas para detectar si el marco/fondo es negro
        const corners = [
          0, // (0, 0)
          (w - 1) * 4, // (w-1, 0)
          (h - 1) * w * 4, // (0, h-1)
          ((h - 1) * w + (w - 1)) * 4, // (w-1, h-1)
        ];

        let blackCornersCount = 0;
        for (const idx of corners) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Umbral de negro oscuro (ruido de compresión JPEG < 28)
          if (r < 28 && g < 28 && b < 28) {
            blackCornersCount++;
          }
        }

        // Si al menos 2 esquinas son negras o el perímetro es oscuro, blanquear el fondo
        if (blackCornersCount >= 2) {
          // Reemplazo perimetral conectado y píxeles de fondo negro (< 30, 30, 30)
          // Flood-fill perimetral desde los 4 bordes para preservar texto negro dentro de la figura
          const visited = new Uint8Array(w * h);
          const queue: number[] = [];

          const isDarkBackground = (idx: number) => {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            return r < 36 && g < 36 && b < 36;
          };

          // Sembrar todos los píxeles oscuros de los cuatro bordes
          for (let x = 0; x < w; x++) {
            // Borde superior
            const topIdx = x * 4;
            if (isDarkBackground(topIdx)) {
              visited[x] = 1;
              queue.push(x);
            }
            // Borde inferior
            const btmPixel = (h - 1) * w + x;
            const btmIdx = btmPixel * 4;
            if (isDarkBackground(btmIdx)) {
              visited[btmPixel] = 1;
              queue.push(btmPixel);
            }
          }

          for (let y = 0; y < h; y++) {
            // Borde izquierdo
            const leftPixel = y * w;
            const leftIdx = leftPixel * 4;
            if (!visited[leftPixel] && isDarkBackground(leftIdx)) {
              visited[leftPixel] = 1;
              queue.push(leftPixel);
            }
            // Borde derecho
            const rightPixel = y * w + (w - 1);
            const rightIdx = rightPixel * 4;
            if (!visited[rightPixel] && isDarkBackground(rightIdx)) {
              visited[rightPixel] = 1;
              queue.push(rightPixel);
            }
          }

          // BFS Flood-fill para convertir fondo negro conectado en blanco puro (#ffffff)
          let head = 0;
          while (head < queue.length) {
            const pixel = queue[head++];
            const idx = pixel * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;

            const px = pixel % w;
            const py = Math.floor(pixel / w);

            // 4 vecinos
            const neighbors = [
              px > 0 ? pixel - 1 : -1,
              px < w - 1 ? pixel + 1 : -1,
              py > 0 ? pixel - w : -1,
              py < h - 1 ? pixel + w : -1,
            ];

            for (const n of neighbors) {
              if (n !== -1 && !visited[n]) {
                const nIdx = n * 4;
                if (isDarkBackground(nIdx)) {
                  visited[n] = 1;
                  queue.push(n);
                }
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
          const cleanedUrl = canvas.toDataURL('image/jpeg', 0.88);
          putInCleanCache(dataUrl, cleanedUrl);
          canvas.width = 0;
          canvas.height = 0;
          return resolve(cleanedUrl);
        }

        putInCleanCache(dataUrl, dataUrl);
        canvas.width = 0;
        canvas.height = 0;
        resolve(dataUrl);
      } catch (err) {
        console.warn('[imageCleaner] Fallback sin alteración:', err);
        putInCleanCache(dataUrl, dataUrl);
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      putInCleanCache(dataUrl, dataUrl);
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}
