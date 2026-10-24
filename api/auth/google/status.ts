export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const hasClientId = Boolean(
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID
  );

  const hasClientSecret = Boolean(
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.VITE_GOOGLE_CLIENT_SECRET
  );

  res.status(200).json({
    available: true,
    hasClientId,
    hasClientSecret,
    flowSupported: 'authorization_code'
  });
}
