// Caché serverless en memoria de alta velocidad para respuesta instantánea (<10ms)
const kitCache = new Map<string, { data: any; cachedAt: number }>();
const MAX_CACHE_ENTRIES = 200;

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Soporte para registro directo en caché al compartir (POST)
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const fileId = String(body.fileId || body.id || '').trim();
      const data = body.data || body.kit;

      if (!fileId || !data) {
        res.status(400).json({ success: false, error: 'Parámetros fileId y data son requeridos.' });
        return;
      }

      if (kitCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = kitCache.keys().next().value;
        if (oldestKey) kitCache.delete(oldestKey);
      }

      kitCache.set(fileId, { data, cachedAt: Date.now() });
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ success: true, message: 'Kit registrado en caché serverless.' });
      return;
    } catch (postErr: any) {
      res.status(500).json({ success: false, error: postErr?.message || 'Error procesando registro' });
      return;
    }
  }

  // Descarga y resolución de kit compartido (GET)
  let fileId = String(req.query?.fileId || req.query?.id || '').trim();
  if (!fileId && req.url) {
    try {
      const u = new URL(req.url, 'http://localhost');
      fileId = String(u.searchParams.get('fileId') || u.searchParams.get('id') || '').trim();
    } catch {}
  }

  if (!fileId) {
    res.status(400).json({ success: false, error: 'Parámetro fileId requerido.' });
    return;
  }

  // Sanitizar fileId para evitar inyecciones
  if (!/^[-_a-zA-Z0-9]{15,70}$/.test(fileId)) {
    res.status(400).json({ success: false, error: 'Identificador de archivo no válido.' });
    return;
  }

  // 0. Comprobar si ya reside en la caché en memoria del servidor
  if (kitCache.has(fileId)) {
    const cached = kitCache.get(fileId);
    if (cached && cached.data) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Cache-Status', 'HIT');
      res.status(200).json({ success: true, data: cached.data });
      return;
    }
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  // 1. Descarga desde drive.google.com/uc con manejo de cookies y redirecciones manuales
  try {
    const ucUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    const resp1 = await fetch(ucUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(4500),
    });

    const location = resp1.headers.get('location');
    const setCookie = resp1.headers.get('set-cookie') || '';

    if (location) {
      const respRedirect = await fetch(location, {
        headers: {
          'User-Agent': userAgent,
          'Cookie': setCookie,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(4500),
      });

      if (respRedirect.ok) {
        const text = (await respRedirect.text()).replace(/^\uFEFF/, '').trim();
        if (text.startsWith('{') && (text.includes('"kit"') || text.includes('"flashcards"') || text.includes('"title"'))) {
          const json = JSON.parse(text);
          kitCache.set(fileId, { data: json, cachedAt: Date.now() });
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache-Status', 'MISS-FETCHED');
          res.status(200).json({ success: true, data: json });
          return;
        }
      }
    } else if (resp1.ok) {
      const text1 = (await resp1.text()).replace(/^\uFEFF/, '').trim();
      if (text1.startsWith('{') && (text1.includes('"kit"') || text1.includes('"flashcards"') || text1.includes('"title"'))) {
        const json1 = JSON.parse(text1);
        kitCache.set(fileId, { data: json1, cachedAt: Date.now() });
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, data: json1 });
        return;
      }
    }
  } catch (e1) {
    console.warn('[api/drive/shared] Intento 1 (uc redirect) falló:', e1);
  }

  // 2. Descarga directa desde drive.usercontent.google.com
  try {
    const url2 = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const resp2 = await fetch(url2, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });

    if (resp2.ok) {
      const text2 = (await resp2.text()).replace(/^\uFEFF/, '').trim();
      if (text2.startsWith('{') && (text2.includes('"kit"') || text2.includes('"flashcards"') || text2.includes('"title"'))) {
        const json2 = JSON.parse(text2);
        kitCache.set(fileId, { data: json2, cachedAt: Date.now() });
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, data: json2 });
        return;
      }
    }
  } catch (e2) {
    console.warn('[api/drive/shared] Intento 2 falló:', e2);
  }

  // 3. API oficial de Google Drive v3 con Google API Key si está disponible
  const apiKey = process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const url3 = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
      const resp3 = await fetch(url3, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(4000),
      });

      if (resp3.ok) {
        const text3 = (await resp3.text()).replace(/^\uFEFF/, '').trim();
        if (text3.startsWith('{')) {
          const json3 = JSON.parse(text3);
          kitCache.set(fileId, { data: json3, cachedAt: Date.now() });
          res.setHeader('Content-Type', 'application/json');
          res.status(200).json({ success: true, data: json3 });
          return;
        }
      }
    } catch (e3) {
      console.warn('[api/drive/shared] Intento 3 con API key falló:', e3);
    }
  }

  res.status(404).json({
    success: false,
    error: 'No se pudo leer el archivo compartido de Google Drive. Es posible que el archivo haya sido eliminado o que la cuenta de origen requiera permisos públicos.',
  });
}
