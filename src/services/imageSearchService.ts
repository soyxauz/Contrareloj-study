import type { DocumentAsset } from '../types';

interface WebImageResult {
  imageUrl: string;
  sourceUrl: string;
  caption?: string;
  title?: string;
}

// Caché en memoria para respuestas instantáneas
const memoryCache = new Map<string, WebImageResult | null>();

/**
 * Limpia la consulta para buscar el término conceptual o médico más relevante
 */
function extractSearchKeywords(query: string, fallbackTopic?: string): string[] {
  const clean = query
    .replace(/[¿?¡!]/g, '')
    .replace(/\b(qué|cuál|cuáles|cómo|dónde|por qué|función|tiene|el|la|los|las|en|de|del|un|una|para|sobre|según)\b/gi, ' ')
    .trim();

  const candidates: string[] = [];

  if (clean.length > 2) {
    candidates.push(clean);
  }

  // Si hay siglas o términos en mayúsculas (ej: HLA-G, PCR, ATP, ECG, ADN)
  const acronyms = query.match(/\b[A-Z0-9-]{2,}\b/g);
  if (acronyms && acronyms.length > 0) {
    candidates.push(acronyms.join(' '));
  }

  if (fallbackTopic && fallbackTopic.trim().length > 2) {
    candidates.push(fallbackTopic.trim());
  }

  // Palabras clave individuales significativas (> 4 caracteres)
  const words = clean.split(/\s+/).filter(w => w.length > 4);
  if (words.length > 0) {
    candidates.push(words[0]);
    if (words.length > 1) {
      candidates.push(`${words[0]} ${words[1]}`);
    }
  }

  return [...new Set(candidates)];
}

/**
 * Consulta la API de Wikipedia (CORS habilitado con origin=*) para obtener imágenes de diagramas y esquemas
 */
async function queryWikipediaApi(lang: 'es' | 'en', term: string): Promise<WebImageResult | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    term
  )}&gsrlimit=3&prop=pageimages|info&inprop=url&piprop=original|thumbnail&pithumbsize=800&format=json&origin=*`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.query && data.query.pages) {
      const pages = Object.values(data.query.pages) as any[];
      // Priorizar páginas que tengan imagen
      for (const p of pages) {
        const img = p.thumbnail?.source || p.original?.source;
        if (img && typeof img === 'string') {
          // Filtrar íconos triviales como banderas o logos diminutos
          if (img.includes('Disambig') || img.includes('Question_book') || img.includes('Wiki_letter')) {
            continue;
          }
          return {
            imageUrl: img,
            sourceUrl: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title || term)}`,
            title: p.title || term,
            caption: p.title,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`Wikipedia API ${lang} error for term: ${term}`, err);
  }
  return null;
}

/**
 * Busca una imagen ilustrativa en la web (estilo Thea) para acompañar la justificación
 */
export async function searchIllustrationForQuestion(
  query: string,
  fallbackTopic?: string,
  kitAssets?: DocumentAsset[]
): Promise<WebImageResult | null> {
  const cacheKey = `${query.toLowerCase().trim()}|${(fallbackTopic || '').toLowerCase().trim()}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) || null;
  }

  const terms = extractSearchKeywords(query, fallbackTopic);

  for (const term of terms) {
    // 1. Probar Wikipedia en Español
    const resEs = await queryWikipediaApi('es', term);
    if (resEs) {
      memoryCache.set(cacheKey, resEs);
      return resEs;
    }

    // 2. Probar Wikipedia en Inglés (suele tener más diagramas moleculares y anatómicos)
    const resEn = await queryWikipediaApi('en', term);
    if (resEn) {
      memoryCache.set(cacheKey, resEn);
      return resEn;
    }
  }

  // 3. Fallback a activos extraídos del documento si coinciden
  if (kitAssets && kitAssets.length > 0) {
    const matchedAsset = kitAssets.find(a => a.dataUrl);
    if (matchedAsset && matchedAsset.dataUrl) {
      const result: WebImageResult = {
        imageUrl: matchedAsset.dataUrl,
        sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
        title: matchedAsset.caption || fallbackTopic || 'Figura del material de estudio',
        caption: matchedAsset.caption || 'Figura del documento',
      };
      memoryCache.set(cacheKey, result);
      return result;
    }
  }

  // 4. Fallback final: Enlace directo a Google Images
  const fallbackResult: WebImageResult = {
    imageUrl: '',
    sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
    title: query,
    caption: query,
  };
  memoryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
