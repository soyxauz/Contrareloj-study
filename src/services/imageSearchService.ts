import type { DocumentAsset } from '../types';

export interface WebImageResult {
  imageUrl: string;
  sourceUrl: string;
  caption?: string;
  title?: string;
  sourceName?: string;
}

// Caché en memoria para respuestas instantáneas
const memoryCache = new Map<string, WebImageResult | null>();

/**
 * Extrae y sintetiza los términos de búsqueda más fieles al contenido nuclear de la pregunta
 */
function extractSearchKeywords(query: string, fallbackTopic?: string): string[] {
  const clean = query
    .replace(/[¿?¡!]/g, '')
    .replace(/\b(qué|cuál|cuáles|cómo|dónde|por qué|función|tiene|el|la|los|las|en|de|del|un|una|para|sobre|según|evalúa|veracidad|proposición|afirmación|siguiente|siguientes|opción|opciones|selecciona|indica|señala)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates: string[] = [];

  // Prioridad 1: Si hay un tema específico fiel (ej: "Ciclo de Krebs", "Mitocondria", "Farmacología")
  if (fallbackTopic && fallbackTopic.trim().length > 2 && fallbackTopic.toLowerCase() !== 'general') {
    const cleanTopic = fallbackTopic.trim();
    candidates.push(cleanTopic);
    candidates.push(`${cleanTopic} esquema`);
    candidates.push(`${cleanTopic} diagrama`);
  }

  // Prioridad 2: Consulta limpia nuclear
  if (clean.length > 2) {
    candidates.push(clean);
  }

  // Prioridad 3: Siglas o términos científicos en mayúsculas (ej: HLA-G, PCR, ATP, ECG, ADN, ARN)
  const acronyms = query.match(/\b[A-Z0-9-]{2,}\b/g);
  if (acronyms && acronyms.length > 0) {
    candidates.push(acronyms.join(' '));
  }

  // Prioridad 4: Frases compuestas significativas
  const words = clean.split(/\s+/).filter(w => w.length > 3);
  if (words.length >= 2) {
    candidates.push(`${words[0]} ${words[1]}`);
    if (words.length >= 3) {
      candidates.push(`${words[0]} ${words[1]} ${words[2]}`);
    }
  } else if (words.length === 1) {
    candidates.push(words[0]);
  }

  return [...new Set(candidates.filter(c => c && c.length >= 3))];
}

/**
 * Consulta el endpoint de búsqueda en la web abierta (DuckDuckGo / motor web)
 * permitiendo obtener imágenes fieles de cualquier sitio (Nature, ScienceDirect, portales médicos, etc.)
 */
async function queryOpenWebImageSearch(term: string): Promise<WebImageResult | null> {
  try {
    const res = await fetch(`/api/image-search?q=${encodeURIComponent(term)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.results) && data.results.length > 0) {
      // Priorizar resultados que tengan palabras clave de diagramas o esquemas en el título
      const best = data.results.find((r: WebImageResult) =>
        /\b(diagram|esquema|figura|anatomia|anatomy|estructura|structure|ciclo|cycle|pathway|mecanismo)\b/i.test(r.title || '')
      ) || data.results[0];

      if (best && best.imageUrl) {
        return {
          imageUrl: best.imageUrl,
          sourceUrl: best.sourceUrl || best.imageUrl,
          title: best.title || term,
          caption: best.caption || best.title || term,
          sourceName: best.sourceName || 'Web',
        };
      }
    }
  } catch (err) {
    // Modo offline o fallback continuo
  }
  return null;
}

/**
 * Consulta la API de Wikimedia Commons (diagramas científicos, médicos y académicos con CORS origin=*)
 */
async function queryWikimediaCommonsApi(term: string): Promise<WebImageResult | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    term + ' diagram OR esquema'
  )}&gsrlimit=3&prop=pageimages|info&inprop=url&piprop=original|thumbnail&pithumbsize=800&format=json&origin=*`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.query && data.query.pages) {
      const pages = Object.values(data.query.pages) as any[];
      for (const p of pages) {
        const img = p.thumbnail?.source || p.original?.source;
        if (img && typeof img === 'string') {
          if (img.includes('Disambig') || img.includes('Question_book') || img.includes('Wiki_letter')) {
            continue;
          }
          return {
            imageUrl: img,
            sourceUrl: p.fullurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || term)}`,
            title: p.title || term,
            caption: p.title,
            sourceName: 'Wikimedia Commons',
          };
        }
      }
    }
  } catch (err) {
    console.warn(`Wikimedia Commons API error for term: ${term}`, err);
  }
  return null;
}

/**
 * Consulta la API de Wikipedia (CORS habilitado con origin=*)
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
      for (const p of pages) {
        const img = p.thumbnail?.source || p.original?.source;
        if (img && typeof img === 'string') {
          if (img.includes('Disambig') || img.includes('Question_book') || img.includes('Wiki_letter')) {
            continue;
          }
          return {
            imageUrl: img,
            sourceUrl: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title || term)}`,
            title: p.title || term,
            caption: p.title,
            sourceName: `Wikipedia (${lang.toUpperCase()})`,
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
 * Busca una imagen ilustrativa en la web para acompañar la justificación
 * Obteniendo ilustraciones fieles de cualquier sitio en la web (revistas científicas, portales educativos, Wikimedia, etc.)
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

  // 1. Probar primero búsqueda abierta en la web para capturar cualquier sitio con alta fidelidad
  for (const term of terms) {
    const webRes = await queryOpenWebImageSearch(term);
    if (webRes && webRes.imageUrl) {
      memoryCache.set(cacheKey, webRes);
      return webRes;
    }
  }

  // 2. Probar Wikimedia Commons (depósito global de esquemas científicos y académicos)
  for (const term of terms) {
    const resCommons = await queryWikimediaCommonsApi(term);
    if (resCommons) {
      memoryCache.set(cacheKey, resCommons);
      return resCommons;
    }
  }

  // 3. Probar Wikipedia en Español e Inglés
  for (const term of terms) {
    const resEs = await queryWikipediaApi('es', term);
    if (resEs) {
      memoryCache.set(cacheKey, resEs);
      return resEs;
    }

    const resEn = await queryWikipediaApi('en', term);
    if (resEn) {
      memoryCache.set(cacheKey, resEn);
      return resEn;
    }
  }

  // 4. Fallback a activos extraídos del documento original del estudiante si existen
  if (kitAssets && kitAssets.length > 0) {
    const matchedAsset = kitAssets.find(a => a.dataUrl);
    if (matchedAsset && matchedAsset.dataUrl) {
      const result: WebImageResult = {
        imageUrl: matchedAsset.dataUrl,
        sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
        title: matchedAsset.caption || fallbackTopic || 'Figura del material de estudio',
        caption: matchedAsset.caption || 'Figura del documento',
        sourceName: 'Material del Kit',
      };
      memoryCache.set(cacheKey, result);
      return result;
    }
  }

  // 5. Fallback final: Enlace directo a Google Images
  const fallbackResult: WebImageResult = {
    imageUrl: '',
    sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
    title: query,
    caption: query,
    sourceName: 'Google Imágenes',
  };
  memoryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
