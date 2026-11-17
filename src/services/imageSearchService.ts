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

// Caché en memoria + persistencia de sesión para velocidad instantánea (0ms)
const memoryCache = new Map<string, WebImageResult | null>();
const SESSION_CACHE_PREFIX = 'thea_v2_img_';

function getCachedResult(key: string): WebImageResult | null | undefined {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (stored) {
        const parsed = JSON.parse(stored);
        memoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch (err) {
    // Ignorar fallos de cuota o parseo
  }
  return undefined;
}

function setCachedResult(key: string, result: WebImageResult | null): void {
  memoryCache.set(key, result);
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(result));
    }
  } catch (err) {
    // Modo privado o cuota excedida
  }
}

/**
 * Fetch con timeout estricto mediante AbortController para prevenir cuelgues o lentitud
 */
async function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 2500
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    return null;
  }
}

/**
 * Lista negra rigurosa de dominios no científicos/académicos (flora, fauna, monumentos, vehículos, etc.)
 */
const IRRELEVANT_PATTERNS = /\b(cactus|cacto|candelabrum|euphorbia|flower|flor|flores|tree|arbol|arboles|plant|planta|plantas|forest|bosque|leaf|hoja|hojas|shrub|arbusto|botanical|garden|jardin|succulent|botany|flora|fauna|bird|pajaro|ave|aves|insect|insecto|insectos|animal|animales|dog|perro|cat|gato|wildlife|fungus|hongo|hongos|castle|castillo|castillos|palace|palacio|church|iglesia|cathedral|catedral|monument|monumento|monumentos|tower|torre|building|edificio|edificios|bridge|puente|temple|templo|statue|estatua|estatuas|fountain|fuente|facade|fachada|ruins|ruinas|arch|fort|fortaleza|truck|camion|camiones|car|auto|coche|coches|automobile|vehiculo|vehiculos|vehicle|vehicles|train|tren|trenes|plane|airplane|avion|aviones|aircraft|ship|barco|barcos|boat|bote|bus|autobus|motorcycle|moto|motos|tractor|tow truck|grua|flag|bandera|banderas|coat of arms|escudo|escudos|coin|moneda|monedas|banknote|billete|billetes|stamp|sello|sellos|portrait|retrato|retratos|politician|politico|president|presidente|actor|actriz|celebrity|locator map|location map|mapa de localizacion|distrito|provincia|municipio|commune|disambig|question_book|wiki_letter|stub|portal|commons-logo|edit-clear|crystal_clear|ambox|padlock)\b/i;

/**
 * Normaliza texto eliminando acentos y puntuación
 */
function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const BROAD_STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'para', 'por', 'con', 'sobre', 'que', 'del', 'un', 'una',
  'unos', 'unas', 'al', 'es', 'son', 'se', 'su', 'sus', 'como', 'cual', 'cuales', 'donde', 'tiene',
  'funcion', 'efecto', 'afirmacion', 'proposicion', 'opcion', 'opciones', 'selecciona', 'indica',
  'senala', 'evalua', 'veracidad', 'siguiente', 'siguientes', 'respecto', 'general', 'correcta',
  'incorrecta', 'falsa', 'verdadera', 'the', 'and', 'for', 'with', 'that', 'from', 'this', 'these',
  'which', 'where', 'when', 'what', 'how', 'about', 'effect', 'study', 'question',
  // Palabras metodológicas, sintácticas y médicas generales que NO definen especificidad por sí solas:
  'criterio', 'criterios', 'regla', 'reglas', 'sistema', 'sistemas', 'sistemico', 'sistemica',
  'tratamiento', 'tratamientos', 'iniciar', 'inicio', 'indice', 'indices', 'mayor', 'menor',
  'afectada', 'afectado', 'afectadas', 'afectados', 'extension', 'gravedad', 'calidad', 'vida',
  'nivel', 'niveles', 'tipo', 'tipos', 'forma', 'formas', 'fase', 'fases', 'caso', 'casos',
  'paciente', 'pacientes', 'proceso', 'procesos', 'estructura', 'estructuras', 'organo', 'organos',
  'estudio', 'estudios', 'analisis', 'principio', 'principios', 'definir', 'definicion', 'requiere',
  'blanco', 'espacio', 'espacios', 'completa', 'completar', 'valor', 'valores', 'tabla', 'figura',
  'esquema', 'diagrama', 'imagen', 'humano', 'medico', 'medica', 'clinico', 'clinica', 'salud',
  'termino', 'terminos', 'concepto', 'conceptos', 'respuesta', 'respuestas', 'pregunta', 'preguntas',
  'oracion', 'oraciones', 'palabra', 'palabras', 'banco', 'fichas', 'ficha', 'drag', 'drop',
  'primer', 'primera', 'segundo', 'segunda', 'tercer', 'tercera', 'central', 'secundario', 'secundaria',
  'fundamento', 'fundamentos', 'evidencia', 'mecanismo', 'mecanismos', 'accion', 'via', 'vias'
]);

/**
 * Extrae entidades y palabras clave nucleares de alta especificidad (longitud >= 4 o siglas técnicas)
 */
export function extractCoreEntityTerms(ctx: IllustrationSearchContext): string[] {
  const sources = [
    ctx.imageSearchTerm,
    ctx.topic,
    ctx.correctAnswer,
    ctx.questionText,
    ctx.query,
  ].filter(Boolean).join(' ');

  const normalized = normalizeText(sources);

  // 1. Siglas técnicas (ej: PASI, DLQI, BSA, ATP, ECG, ADN, ARN)
  const acronyms = (sources.match(/\b[A-Z0-9-]{2,}\b/g) || [])
    .map(a => normalizeText(a))
    .filter(a => a.length >= 2 && !BROAD_STOPWORDS.has(a));

  // 2. Tokens nucleares no genéricos
  const tokens = normalized
    .replace(/[^a-z0-9-\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !BROAD_STOPWORDS.has(w) && !/^\d+$/.test(w));

  return [...new Set([...acronyms, ...tokens])];
}

/**
 * Extrae anclas semánticas esenciales
 */
function extractAnchorKeywords(ctx: IllustrationSearchContext): string[] {
  return extractCoreEntityTerms(ctx);
}

/**
 * Extrae a lo sumo 2 términos canónicos limpios para consultar de forma hiperrápida
 */
function buildFastSearchTerms(ctx: IllustrationSearchContext): string[] {
  const terms: string[] = [];

  // 1. imageSearchTerm específico generado por la IA (ej: "Organ of Corti", "Psoriasis plaque", "Insulina")
  if (ctx.imageSearchTerm && ctx.imageSearchTerm.trim().length > 2) {
    const cleanImgTerm = ctx.imageSearchTerm
      .replace(/[¿?¡!.]/g, '')
      .replace(/\b(diagram|esquema|figura|search|image)\b/gi, '')
      .trim();
    if (cleanImgTerm.length >= 3 && !BROAD_STOPWORDS.has(normalizeText(cleanImgTerm))) {
      terms.push(cleanImgTerm);
    }
  }

  // 2. Entidades nucleares de alta especificidad
  const coreEntities = extractCoreEntityTerms(ctx);
  for (const ent of coreEntities) {
    if (terms.length >= 2) break;
    if (ent.length >= 4 && !terms.some(t => normalizeText(t).includes(ent))) {
      terms.push(ent);
    }
  }

  // 3. Subtema o materia si es específico y no procedural
  if (terms.length < 2 && ctx.topic && ctx.topic.trim().length > 2 && ctx.topic.toLowerCase() !== 'general') {
    const cleanTopic = ctx.topic.replace(/[¿?¡!.]/g, '').trim();
    const normTopic = normalizeText(cleanTopic);
    if (!terms.includes(cleanTopic) && !normTopic.includes('regla de los') && !normTopic.includes('criterios')) {
      terms.push(cleanTopic);
    }
  }

  return terms.slice(0, 2);
}

/**
 * Validador semántico estricto con lista negra y verificación de anclas nucleares
 */
function isImageStrictlyRelevant(
  title: string,
  caption: string,
  imageUrl: string,
  extract: string,
  coreEntities: string[]
): boolean {
  const fullText = `${title} ${caption} ${imageUrl} ${extract}`;

  // 1. Verificación de lista negra
  if (IRRELEVANT_PATTERNS.test(fullText)) {
    return false;
  }

  // 2. Si no hay entidades clave identificadas, no aceptar imágenes aleatorias
  if (coreEntities.length === 0) {
    return false;
  }

  // 3. Verificación de anclaje semántico nuclear estricto:
  // La imagen DEBE contener en su título, leyenda, URL o extracto al menos una de las entidades clave
  const normalizedFullText = normalizeText(fullText);
  return coreEntities.some(entity => {
    if (entity.length < 3) return false;
    return normalizedFullText.includes(entity);
  });
}

/**
 * Consulta la API de resumen REST de Wikipedia (peer-reviewed, ultraveloz)
 */
async function queryWikipediaSummaryApi(
  lang: 'es' | 'en',
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  const cleanTerm = term.replace(/[#?]/g, '').trim();
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTerm)}`;

  const res = await fetchWithTimeout(url, {
    'Accept': 'application/json',
    'User-Agent': 'ContrarelojStudy/1.0',
  }, 2200);

  if (!res || !res.ok) return null;

  try {
    const data = await res.json();
    const img = data.originalimage?.source || data.thumbnail?.source;
    if (img && typeof img === 'string') {
      const title = data.title || term;
      const extract = data.extract || '';
      const caption = data.description || extract.slice(0, 150) || title;

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
    // Ignorar errores de parseo
  }
  return null;
}

/**
 * Consulta la API de búsqueda de generador de Wikipedia (CORS origin=*)
 */
async function queryWikipediaSearchApi(
  lang: 'es' | 'en',
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    term
  )}&gsrlimit=3&prop=pageimages|info|extracts&exintro=1&explaintext=1&exchars=240&inprop=url&piprop=original|thumbnail&pithumbsize=800&format=json&origin=*`;

  const res = await fetchWithTimeout(url, {
    'User-Agent': 'ContrarelojStudy/1.0',
  }, 2500);

  if (!res || !res.ok) return null;

  try {
    const data = await res.json();
    if (data.query && data.query.pages) {
      const pages = (Object.values(data.query.pages) as any[]).sort((a, b) => (a.index || 99) - (b.index || 99));

      for (const p of pages) {
        const img = p.thumbnail?.source || p.original?.source;
        if (img && typeof img === 'string') {
          const title = p.title || term;
          const extract = p.extract || '';
          const caption = extract.slice(0, 150) || title;

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
    // Silencioso
  }
  return null;
}

/**
 * Consulta Wikimedia Commons agrupando términos y ordenando por relevancia
 */
async function queryWikimediaCommonsApi(
  term: string,
  anchors: string[]
): Promise<WebImageResult | null> {
  const cleanTerm = term.replace(/"/g, '').trim();
  const searchQuery = `"${cleanTerm}" (diagram OR esquema OR structure OR pathway OR mechanism)`;

  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    searchQuery
  )}&gsrlimit=3&prop=pageimages|info&inprop=url&piprop=original|thumbnail&pithumbsize=800&format=json&origin=*`;

  const res = await fetchWithTimeout(url, {
    'User-Agent': 'ContrarelojStudy/1.0',
  }, 2500);

  if (!res || !res.ok) return null;

  try {
    const data = await res.json();
    if (data.query && data.query.pages) {
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
    // Silencioso
  }
  return null;
}

/**
 * Búsqueda optimizada, concurrente y de latencia ultrabaja (<500-900ms)
 * con POLÍTICA ESTRICTA DE CERO BASURA
 */
export async function searchIllustrationForQuestion(
  queryOrContext: string | IllustrationSearchContext,
  fallbackTopic?: string | IllustrationSearchContext,
  kitAssets?: DocumentAsset[]
): Promise<WebImageResult | null> {
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

  // 1. Caché inmediata (0ms)
  const cached = getCachedResult(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const anchors = extractAnchorKeywords(ctx);
  const terms = buildFastSearchTerms(ctx);

  // 2. Prioridad 0: Activo original del kit de estudio (0ms) con validación semántica estricta
  const availableAssets = ctx.kitAssets || kitAssets || [];
  if (availableAssets.length > 0 && anchors.length > 0) {
    const matchedAsset = availableAssets.find(a => {
      if (!a.dataUrl) return false;
      const text = `${a.caption || ''} ${a.contextNearby || ''}`.toLowerCase();
      return anchors.some(anchor => anchor.length >= 4 && text.includes(anchor));
    });

    if (matchedAsset && matchedAsset.dataUrl) {
      const result: WebImageResult = {
        imageUrl: matchedAsset.dataUrl,
        sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(primaryQuery)}`,
        title: matchedAsset.caption || ctx.topic || 'Figura del material de estudio',
        caption: matchedAsset.caption || 'Figura extraída del documento',
        sourceName: 'Material del Kit',
      };
      setCachedResult(cacheKey, result);
      return result;
    }
  }

  // 3. FASE 1: Resúmenes de Wikipedia (ES y EN) disparados EN PARALELO (~200-400ms)
  if (terms.length > 0) {
    const summaryPromises: Promise<WebImageResult | null>[] = [];
    for (const term of terms) {
      summaryPromises.push(queryWikipediaSummaryApi('es', term, anchors));
      summaryPromises.push(queryWikipediaSummaryApi('en', term, anchors));
    }

    const summaryResults = await Promise.all(summaryPromises);
    const bestSummary = summaryResults.find(r => r && r.imageUrl);
    if (bestSummary) {
      setCachedResult(cacheKey, bestSummary);
      return bestSummary;
    }
  }

  // 4. FASE 2: Búsqueda Indexada en Wikipedia y Wikimedia Commons EN PARALELO (~500-800ms)
  const primaryTerm = terms[0] || ctx.topic || ctx.query;
  if (primaryTerm) {
    const searchPromises: Promise<WebImageResult | null>[] = [
      queryWikipediaSearchApi('es', primaryTerm, anchors),
      queryWikipediaSearchApi('en', primaryTerm, anchors),
      queryWikimediaCommonsApi(primaryTerm, anchors),
    ];

    if (terms[1]) {
      searchPromises.push(queryWikipediaSearchApi('es', terms[1], anchors));
    }

    const searchResults = await Promise.all(searchPromises);
    const bestSearch = searchResults.find(r => r && r.imageUrl);
    if (bestSearch) {
      setCachedResult(cacheKey, bestSearch);
      return bestSearch;
    }
  }

  // 5. CERO BASURA: Si ninguna imagen tiene relevancia científica verificada, no inventar imagen
  const cleanSourceQuery = ctx.imageSearchTerm || ctx.query || primaryQuery;
  const zeroGarbageFallback: WebImageResult = {
    imageUrl: '',
    sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanSourceQuery)}`,
    title: cleanSourceQuery,
    caption: cleanSourceQuery,
    sourceName: 'Google Imágenes',
  };

  setCachedResult(cacheKey, zeroGarbageFallback);
  return zeroGarbageFallback;
}
