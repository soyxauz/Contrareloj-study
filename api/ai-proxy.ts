export default async function handler(req: any, res: any) {
  // Configuración de cabeceras CORS permisivas para permitir llamadas desde el frontend
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Manejo de petición preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { url, method, data, headers } = body || {};
    const targetUrl = url || 'https://ollama.com/v1/chat/completions';

    // Seguridad: solo se permite reenviar a proveedores de IA conocidos (evita usar el proxy como relay abierto)
    const ALLOWED_HOSTS = [
      'ollama.com',
      'api.groq.com',
      'api.x.ai',
      'grok.com',
      'generativelanguage.googleapis.com'
    ];
    let host = '';
    try {
      const parsed = new URL(targetUrl);
      host = parsed.hostname;
      if (parsed.protocol !== 'https:') throw new Error('protocolo no permitido');
    } catch {
      res.status(400).json({ error: 'URL inválida' });
      return;
    }
    if (!ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
      res.status(403).json({ error: 'Host no permitido' });
      return;
    }

    const cleanHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(headers || {}),
    };

    delete cleanHeaders['host'];
    delete cleanHeaders['origin'];
    delete cleanHeaders['referer'];

    const targetRes = await fetch(targetUrl, {
      method: method || 'POST',
      headers: cleanHeaders,
      body: data ? JSON.stringify(data) : undefined,
    });

    const resText = await targetRes.text();
    res.status(targetRes.status);
    res.setHeader('Content-Type', targetRes.headers.get('content-type') || 'application/json');
    res.send(resText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
}
