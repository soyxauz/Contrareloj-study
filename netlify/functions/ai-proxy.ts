export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { url, method, data, headers } = body || {};
    const targetUrl = url || 'https://ollama.com/v1/chat/completions';

    const cleanHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers || {}),
    };

    if (!cleanHeaders['Authorization'] && !cleanHeaders['authorization']) {
      cleanHeaders['Authorization'] = 'Bearer 716a4f5985e54bc8830fac7e2835578a.x9f9A2l0bgRf4WjF86KPWfHl';
    }

    delete cleanHeaders['host'];
    delete cleanHeaders['origin'];
    delete cleanHeaders['referer'];

    const targetRes = await fetch(targetUrl, {
      method: method || 'POST',
      headers: cleanHeaders,
      body: data ? JSON.stringify(data) : undefined,
    });

    const resText = await targetRes.text();
    return new Response(resText, {
      status: targetRes.status,
      headers: {
        'Content-Type': targetRes.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
