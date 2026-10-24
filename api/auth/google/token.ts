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

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const code = String(body.code || '').trim();
    const redirectUri = String(body.redirect_uri || 'postmessage').trim();
    
    const clientId = String(
      body.clientId ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.VITE_GOOGLE_CLIENT_ID ||
      ''
    ).trim();

    const clientSecret = String(
      body.clientSecret ||
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.VITE_GOOGLE_CLIENT_SECRET ||
      ''
    ).trim();

    if (!code) {
      res.status(400).json({ success: false, error: 'El código de autorización es requerido.' });
      return;
    }

    if (!clientId) {
      res.status(400).json({ success: false, error: 'El Google Client ID no está configurado.' });
      return;
    }

    if (!clientSecret) {
      res.status(400).json({
        success: false,
        error: 'El Google Client Secret no está configurado en el servidor ni fue proporcionado en la solicitud.'
      });
      return;
    }

    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const googleRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    const data: any = await googleRes.json();

    if (!googleRes.ok || data.error) {
      const errorMsg = data.error_description || data.error || 'Error canjeando código con Google OAuth.';
      res.status(googleRes.status || 400).json({ success: false, error: errorMsg, details: data });
      return;
    }

    res.status(200).json({
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in: data.expires_in || 3600,
      scope: data.scope || '',
      token_type: data.token_type || 'Bearer'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
}
