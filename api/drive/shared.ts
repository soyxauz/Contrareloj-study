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

  let fileId = '';
  if (req.method === 'GET') {
    fileId = String(req.query?.fileId || req.query?.id || '').trim();
  } else if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    fileId = String(body?.fileId || body?.id || '').trim();
  }

  if (!fileId) {
    res.status(400).json({ success: false, error: 'Parámetro fileId requerido.' });
    return;
  }

  // Sanitizar fileId para evitar inyección de rutas
  if (!/^[-_a-zA-Z0-9]{15,60}$/.test(fileId)) {
    res.status(400).json({ success: false, error: 'Identificador de archivo no válido.' });
    return;
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // 1. Intentar descarga directa desde drive.usercontent.google.com
  try {
    const url1 = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const resp1 = await fetch(url1, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
    });

    if (resp1.ok) {
      const text1 = await resp1.text();
      // Verificar si es un JSON real de kit
      if (text1.trim().startsWith('{') && (text1.includes('"kit"') || text1.includes('"flashcards"') || text1.includes('"title"'))) {
        const json1 = JSON.parse(text1);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, data: json1 });
        return;
      }
    }
  } catch (e1) {
    console.warn('[api/drive/shared] Intento 1 falló:', e1);
  }

  // 2. Intentar descarga pública desde drive.google.com/uc
  try {
    const url2 = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    const resp2 = await fetch(url2, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
    });

    if (resp2.ok) {
      const text2 = await resp2.text();
      if (text2.trim().startsWith('{') && (text2.includes('"kit"') || text2.includes('"flashcards"') || text2.includes('"title"'))) {
        const json2 = JSON.parse(text2);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, data: json2 });
        return;
      }
    }
  } catch (e2) {
    console.warn('[api/drive/shared] Intento 2 falló:', e2);
  }

  // 3. Si hay API key de Google configurada en variables de entorno, usar la API v3 oficial sin token de usuario
  const apiKey = process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const url3 = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
      const resp3 = await fetch(url3, {
        headers: { 'User-Agent': userAgent },
      });

      if (resp3.ok) {
        const text3 = await resp3.text();
        if (text3.trim().startsWith('{')) {
          const json3 = JSON.parse(text3);
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
