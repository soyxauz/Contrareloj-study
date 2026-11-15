import type { DocumentAsset } from '../types';

export interface WebImageResult {
  imageUrl: string;
  sourceUrl: string;
  caption?: string;
  title?: string;
  sourceName?: string;
}

export interface IllustrationSearchContext {
  query?: string;
  imageSearchTerm?: string;
  topic?: string;
  questionText?: string;
  correctAnswer?: string;
  bullets?: string[];
  kitAssets?: DocumentAsset[];
}

// Caché en memoria para respuestas instantáneas
const memoryCache = new Map<string, WebImageResult | null>();

/**
 * Lista negra rigurosa de dominios temáticos no académicos ni científicos
 * que descarta de inmediato cualquier imagen irrelevante (plantas, paisajes, arquitectura, vehículos, mapas, monedas, retratos)
 */
const IRRELEVANT_PATTERNS = /\b(cactus|cacto|candelabrum|euphorbia|flower|flor|flores|tree|arbol|arboles|plant|planta|plantas|forest|bosque|leaf|hoja|hojas|shrub|arbusto|botanical|garden|jardin|succulent|botany|flora|fauna|bird|pajaro|ave|aves|insect|insecto|insectos|animal|animales|dog|perro|cat|gato|wildlife|fungus|hongo|hongos|castle|castillo|castillos|palace|palacio|church|iglesia|cathedral|catedral|monument|monumento|monumentos|tower|torre|building|edificio|edificios|bridge|puente|temple|templo|statue|estatua|estatuas|fountain|fuente|facade|fachada|ruins|ruinas|arch|fort|fortaleza|truck|camion|camiones|car|auto|coche|coches|automobile|vehiculo|vehiculos|vehicle|vehicles|train|tren|trenes|plane|airplane|avion|aviones|aircraft|ship|barco|barcos|boat|bote|bus|autobus|motorcycle|moto|motos|tractor|tow truck|grua|flag|bandera|banderas|coat of arms|escudo|escudos|coin|moneda|monedas|banknote|billete|billetes|stamp|sello|sellos|portrait|retrato|retratos|politician|politico|president|presidente|actor|actriz|celebrity|locator map|location map|mapa de localizacion|distrito|provincia|municipio|commune|disambig|question_book|wiki_letter|stub|portal|commons-logo|edit-clear|crystal_clear|ambox|padlock)\b/i;

/**
 * Limpia y normaliza texto eliminando acentos y signos
 */
function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Extrae anclas semánticas esenciales (términos técnicos, nombres de fármacos, vías bioquímicas, estructuras)
 * que DEBEN estar presentes de manera inequívoca en la imagen para considerarla pertinente
 */
function extractAnchorKeywords(ctx: IllustrationSearchContext): string[] {
  const rawSources = [
    ctx.imageSearchTerm,
    ctx.topic,
    ctx.correctAnswer,
    ...(ctx.bullets || []),
    ctx.query,
    ctx.questionText,
  ]
    .filter(Boolean)
    .join(' ');

  const normalized = normalizeText(rawSources);

  // Palabras vacías en español e inglés
  const stopWords = new Set([
    'de', 'la', 'el', 'los', 'las', 'en', 'para', 'por', 'con', 'sobre', 'que', 'del', 'un', 'una',
    'unos', 'unas', 'al', 'es', 'son', 'se', 'su', 'sus', 'como', 'cual', 'cuales', 'donde', 'tiene',
    'funcion', 'efecto', 'afirmacion', 'proposicion', 'opcion', 'opciones', 'selecciona', 'indica',
    'senala', 'evalua', 'veracidad', 'siguiente', 'siguientes', 'respecto', 'general', 'correcta',
    'incorrecta', 'falsa', 'verdadera', 'the', 'and', 'for', 'with', 'that', 'from', 'this', 'these',
    'which', 'where', 'when', 'what', 'how', 'about', 'effect', 'study', 'question'
  ]);

  const tokens = normalized
    .replace(/[^a-z0-9-\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  // Extraer también acrónimos (ej: HDL, LDL, VLDL, ATP, ADN, ARN, PCR, ECG, SGLT2, NKCC2)
  const acronyms = (rawSources.match(/\b[A-Z0-9-]{2,}\b/g) || []).map(a => normalizeText(a));

  return [...new Set([...acronyms, ...tokens])];
}

/**
 * Sintetiza los términos de búsqueda más concisos y específicos para consultar Wikipedia y fuentes web
 */
function buildSearchTerms(ctx: IllustrationSearchContext): string[] {
  const terms: string[] = [];

  // Prioridad 1: imageSearchTerm explícito formulado por la IA pedagógica (ej: "Colestiramina", "Cotransportador Na K 2Cl")
  if (ctx.imageSearchTerm && ctx.imageSearchTerm.trim().length > 2) {
    const cleanImgTerm = ctx.imageSearchTerm.trim();
    terms.push(cleanImgTerm);
    if (!cleanImgTerm.toLowerCase().includes('diagram') && !cleanImgTerm.toLowerCase().includes('esquema')) {
      terms.push(`${cleanImgTerm} esquema`);
      terms.push(`${cleanImgTerm} diagrama`);
    }
  }

  // Prioridad 2: Topic específico fiel si no es "General"
  if (ctx.topic && ctx.topic.trim().length > 2 && ctx.topic.toLowerCase() !== 'general') {
    const cleanTopic = ctx.topic.trim();
    terms.push(cleanTopic);
    terms.push(`${cleanTopic} esquema`);
  }

  // Prioridad 3: Fármaco o entidad clave extraída de la respuesta correcta si es concisa (1-3 palabras)
  if (ctx.correctAnswer && ctx.correctAnswer.trim().length > 2 && ctx.correctAnswer.trim().length < 40) {
    const cleanAns = ctx.correctAnswer
      .replace(/^[a-d]\)\s*/i, '')
      .replace(/[¿?¡!.]/g, '')
      .trim();
    if (cleanAns.length >= 3) {
      terms.push(cleanAns);
    }
  }

  // Prioridad 4: Consulta directa limpia
  if (ctx.query && ctx.query.trim().length > 2) {
    const cleanQ = ctx.query
      .replace(/[¿?¡!]/g, '')
      .replace(/\b(qué|cuál|cuáles|cómo|dónde|por qué|función|tiene|el|la|los|las|en|de|del|un|una|para|sobre|según|evalúa|veracidad|proposición|afirmación|siguiente|siguientes|opción|opciones|selecciona|indica|señala)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanQ.length > 2) {
      terms.push(cleanQ);
      // Extraer los 2 primeros sustantivos significativos
      const words = cleanQ.split(/\s+/).filter(w => w.length > 3);
      if (words.length >= 2) {
        terms.push(`${words[0]} ${words[1]}`);
      }
    }
  }

  return [...new Set(terms.filter(t => t && t.length >= 3))];
}

/**
 * Validador semántico estricto:
 * 1. Descarta inmediatamente si coincide con la lista negra (plantas, paisajes, edificios, banderas, etc.)
 * 2. Comprueba que el título, descripción o URL contengan al menos un ancla conceptual clave del tema
 */
function isImageStrictlyRelevant(
  title: string,
  caption: string,
  imageUrl: string,
  extract: string,
  anchors: string[]
): boolean {
  const fullText = `${title} ${caption} ${imageUrl} ${extract}`;

  // 1. Verificación de lista negra
  if (IRRELEVANT_PATTERNS.test(fullText)) {
    return false;
  }

  // 2. Verificación de anclaje semántico
  const normalizedFullText = normalizeText(fullText);
  let matchedAnchorCount = 0;

  for (const anchor of anchors) {
    if (anchor.length >= 3 && normalizedFullText.includes(anchor)) {
      matchedAnchorCount++;
    }
  }

  // Si no contiene ninguna palabra clave del tema, se rechaza tajantemente
  if (matchedAnchorCount === 0) {
    return false;
  }

  return true;
}

/**
 * Consulta la API de resumen REST de Wikipedia (peer-reviewed, estructuras químicas y figuras principales)
 */
async function queryWikipediaSummaryApi(
  lang: 'es' | 'en',
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  const cleanTerm = term.replace(/[#?]/g, '').trim();
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTerm)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ContrarelojStudy/1.0',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const img = data.originalimage?.source || data.thumbnail?.source;
    if (img && typeof img === 'string') {
      const title = data.title || term;
      const extract = data.extract || '';
      const caption = data.description || extract.slice(0, 160) || title;

      if (isImageStrictlyRelevant(title, caption, img, extract, anchors)) {
        return {
          imageUrl: img,
          sourceUrl: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
          title,
          caption,
          sourceName: `Wikipedia (${lang.toUpperCase()})`,
        };
      }
    }
  } catch (err) {
    // Silencioso para fallback rápido
  }
  return null;
}

/**
 * Consulta la API de búsqueda de generador de Wikipedia (CORS habilitado con origin=*)
 */
async function queryWikipediaSearchApi(
  lang: 'es' | 'en',
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    term
  )}&gsrlimit=4&prop=pageimages|info|extracts&exintro=1&explaintext=1&exchars=260&inprop=url&piprop=original|thumbnail&pithumbsize=800&format=json&origin=*`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ContrarelojStudy/1.0',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.query && data.query.pages) {
      // Ordenar rigurosamente por relevancia de búsqueda de MediaWiki (p.index)
      const pages = (Object.values(data.query.pages) as any[]).sort((a, b) => (a.index || 99) - (b.index || 99));

      for (const p of pages) {
        const img = p.thumbnail?.source || p.original?.source;
        if (img && typeof img === 'string') {
          const title = p.title || term;
          const extract = p.extract || '';
          const caption = extract.slice(0, 160) || title;

          if (isImageStrictlyRelevant(title, caption, img, extract, anchors)) {
            return {
              imageUrl: img,
              sourceUrl: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
              title,
              caption,
              sourceName: `Wikipedia (${lang.toUpperCase()})`,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Wikipedia API ${lang} error for term: ${term}`, err);
  }
  return null;
}

/**
 * Consulta la API de Wikimedia Commons agrupando correctamente los operadores booleanos
 * y ordenando por relevancia real (p.index)
 */
async function queryWikimediaCommonsApi(
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  // Búsqueda agrupada sin 'OR' suelto que atrape archivos no relacionados
  const cleanTerm = term.replace(/"/g, '').trim();
  const searchQuery = `"${cleanTerm}" (diagram OR esquema OR structure OR pathway OR mechanism)`;

  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    searchQuery
  )}&gsrlimit=4&prop=pageimages|info&inprop=url&piprop=original|thumbnail&pithumbsize=800&format=json&origin=*`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ContrarelojStudy/1.0',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.query && data.query.pages) {
      // Ordenar rigurosamente por p.index ascendente
      const pages = (Object.values(data.query.pages) as any[]).sort((a, b) => (a.index || 99) - (b.index || 99));

      for (const p of pages) {
        const img = p.thumbnail?.source || p.original?.source;
        if (img && typeof img === 'string') {
          const title = p.title || term;
          if (isImageStrictlyRelevant(title, title, img, '', anchors)) {
            return {
              imageUrl: img,
              sourceUrl: p.fullurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
              title,
              caption: title.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
              sourceName: 'Wikimedia Commons',
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Wikimedia Commons API error for term: ${term}`, err);
  }
  return null;
}

/**
 * Consulta el endpoint de búsqueda en la web abierta con verificación estricta de pertinencia
 */
async function queryOpenWebImageSearch(
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  try {
    const res = await fetch(`/api/image-search?q=${encodeURIComponent(term)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.results) && data.results.length > 0) {
      for (const r of data.results) {
        if (r && r.imageUrl) {
          const title = r.title || term;
          const caption = r.caption || title;
          if (isImageStrictlyRelevant(title, caption, r.imageUrl, '', anchors)) {
            return {
              imageUrl: r.imageUrl,
              sourceUrl: r.sourceUrl || r.imageUrl,
              title,
              caption,
              sourceName: r.sourceName || 'Web Científica',
            };
          }
        }
      }
    }
  } catch (err) {
    // Modo offline o fallback
  }
  return null;
}

/**
 * Busca una imagen o esquema ilustrativo en la web para acompañar la justificación
 * con POLÍTICA ESTRICTA DE CERO BASURA:
 * Si ninguna imagen cumple con un anclaje semántico de alta confianza, NO se muestra ninguna
 * imagen arbitraria y se retorna un enlace directo a la fuente externa.
 */
export async function searchIllustrationForQuestion(
  queryOrContext: string | IllustrationSearchContext,
  fallbackTopic?: string | IllustrationSearchContext,
  kitAssets?: DocumentAsset[]
): Promise<WebImageResult | null> {
  // Normalizar contexto unificado
  const ctx: IllustrationSearchContext =
    typeof queryOrContext === 'object' && queryOrContext !== null
      ? queryOrContext
      : typeof fallbackTopic === 'object' && fallbackTopic !== null
      ? { ...fallbackTopic, query: String(queryOrContext) }
      : {
          query: String(queryOrContext || ''),
          topic: typeof fallbackTopic === 'string' ? fallbackTopic : undefined,
          kitAssets,
        };

  const primaryQuery = ctx.imageSearchTerm || ctx.query || ctx.topic || 'Concepto';
  const cacheKey = `${primaryQuery.toLowerCase().trim()}|${(ctx.topic || '').toLowerCase().trim()}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) || null;
  }

  // 1. Extraer anclas conceptuales obligatorias
  const anchors = extractAnchorKeywords(ctx);
  const terms = buildSearchTerms(ctx);

  // 2. Prioridad 1: Activos extraídos del documento original del estudiante si su pie coincide con las anclas
  const availableAssets = ctx.kitAssets || kitAssets || [];
  if (availableAssets.length > 0) {
    const matchedAsset = availableAssets.find(a => {
      if (!a.dataUrl) return false;
      const text = `${a.caption || ''} ${a.contextNearby || ''}`.toLowerCase();
      return anchors.some(anchor => anchor.length >= 3 && text.includes(anchor));
    });

    if (matchedAsset && matchedAsset.dataUrl) {
      const result: WebImageResult = {
        imageUrl: matchedAsset.dataUrl,
        sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(primaryQuery)}`,
        title: matchedAsset.caption || ctx.topic || 'Figura del material de estudio',
        caption: matchedAsset.caption || 'Figura extraída del documento',
        sourceName: 'Material del Kit',
      };
      memoryCache.set(cacheKey, result);
      return result;
    }
  }

  // 3. Prioridad 2: Resúmenes oficiales de Wikipedia (Español / Inglés) para términos directos
  for (const term of terms) {
    const resSummaryEs = await queryWikipediaSummaryApi('es', term, anchors);
    if (resSummaryEs && resSummaryEs.imageUrl) {
      memoryCache.set(cacheKey, resSummaryEs);
      return resSummaryEs;
    }

    const resSummaryEn = await queryWikipediaSummaryApi('en', term, anchors);
    if (resSummaryEn && resSummaryEn.imageUrl) {
      memoryCache.set(cacheKey, resSummaryEn);
      return resSummaryEn;
    }
  }

  // 4. Prioridad 3: Búsqueda indexada en Wikipedia en Español e Inglés
  for (const term of terms) {
    const resEs = await queryWikipediaSearchApi('es', term, anchors);
    if (resEs && resEs.imageUrl) {
      memoryCache.set(cacheKey, resEs);
      return resEs;
    }

    const resEn = await queryWikipediaSearchApi('en', term, anchors);
    if (resEn && resEn.imageUrl) {
      memoryCache.set(cacheKey, resEn);
      return resEn;
    }
  }

  // 5. Prioridad 4: Wikimedia Commons con agrupación booleana y orden de relevancia
  for (const term of terms) {
    const resCommons = await queryWikimediaCommonsApi(term, anchors);
    if (resCommons && resCommons.imageUrl) {
      memoryCache.set(cacheKey, resCommons);
      return resCommons;
    }
  }

  // 6. Prioridad 5: Búsqueda abierta con filtro semántico riguroso
  for (const term of terms) {
    const webRes = await queryOpenWebImageSearch(term, anchors);
    if (webRes && webRes.imageUrl) {
      memoryCache.set(cacheKey, webRes);
      return webRes;
    }
  }

  // 7. POLÍTICA ESTRICTA DE CERO BASURA:
  // Si ninguna imagen supera los filtros semánticos rigurosos, NO se devuelve ninguna imagen irrelevante.
  const cleanSourceQuery = ctx.imageSearchTerm || ctx.query || primaryQuery;
  const zeroGarbageFallback: WebImageResult = {
    imageUrl: '',
    sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanSourceQuery)}`,
    title: cleanSourceQuery,
    caption: cleanSourceQuery,
    sourceName: 'Google Imágenes',
  };

  memoryCache.set(cacheKey, zeroGarbageFallback);
  return zeroGarbageFallback;
}
