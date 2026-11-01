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

  let query = '';
  if (req.method === 'GET') {
    query = String(req.query?.q || '').trim();
  } else if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    query = String(body?.query || body?.q || '').trim();
  }

  if (!query) {
    res.status(400).json({ error: 'Query parameter required', results: [] });
    return;
  }

  try {
    const searchParam = encodeURIComponent(query);
    const ddgHome = await fetch(`https://duckduckgo.com/?q=${searchParam}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await ddgHome.text();
    const vqdMatch = html.match(/vqd=['"]?([0-9-]+)/);

    if (vqdMatch) {
      const vqd = vqdMatch[1];
      const imgRes = await fetch(
        `https://duckduckgo.com/i.js?l=es-es&o=json&q=${searchParam}&vqd=${vqd}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        }
      );

      if (imgRes.ok) {
        const data: any = await imgRes.json();
        if (Array.isArray(data?.results) && data.results.length > 0) {
          const valid = data.results.filter((r: any) =>
            r.image &&
            typeof r.image === 'string' &&
            r.image.startsWith('https://') &&
            !r.image.includes('favicon') &&
            !r.image.includes('1x1') &&
            !r.image.includes('pixel')
          );

          if (valid.length > 0) {
            const results = valid.slice(0, 6).map((r: any) => {
              let sourceHost = '';
              try {
                sourceHost = new URL(r.url || r.image).hostname.replace(/^www\./, '');
              } catch {
                sourceHost = r.source || 'Web';
              }
              return {
                imageUrl: r.image,
                sourceUrl: r.url || r.image,
                title: r.title || query,
                caption: r.title || query,
                sourceName: sourceHost,
              };
            });

            res.status(200).json({ results });
            return;
          }
        }
      }
    }

    res.status(200).json({ results: [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(200).json({ results: [], error: msg });
  }
}
