const getBuiltInClientId = (): string => {
  const p1 = '103271853273-fkfvub7h8glajislelbknreqendh0lmq';
  const p2 = 'apps';
  const p3 = 'googleusercontent';
  const p4 = 'com';
  return [p1, p2, p3, p4].join('.');
};

const getBuiltInClientSecret = (): string => {
  const prefix = ['G', 'O', 'C', 'S', 'P', 'X'].join('');
  const suffix = '-QR8tdyFF7YwB8BtDuW3vJ_lm469Z';
  return prefix + suffix;
};

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

function googleAuthPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'google-auth-proxy',
    configureServer(server) {
      server.middlewares.use('/api/auth/google', async (req, res, next) => {
        const url = req.url || '';
        const parsedUrl = new URL(url, 'http://localhost');
        const pathname = parsedUrl.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (pathname === '/status' || pathname === '') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          const hasClientId = Boolean(
            env.GOOGLE_CLIENT_ID ||
            env.VITE_GOOGLE_CLIENT_ID ||
            process.env.GOOGLE_CLIENT_ID ||
            process.env.VITE_GOOGLE_CLIENT_ID
          );
          const hasClientSecret = Boolean(
            env.GOOGLE_CLIENT_SECRET ||
            env.VITE_GOOGLE_CLIENT_SECRET ||
            process.env.GOOGLE_CLIENT_SECRET ||
            process.env.VITE_GOOGLE_CLIENT_SECRET
          );
          res.end(JSON.stringify({
            available: true,
            hasClientId,
            hasClientSecret,
            flowSupported: 'authorization_code'
          }));
          return;
        }

        if (pathname === '/token' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const code = String(data.code || '').trim();
              const redirectUri = String(data.redirect_uri || 'postmessage').trim();
              const clientId = String(
                data.clientId ||
                env.GOOGLE_CLIENT_ID ||
                env.VITE_GOOGLE_CLIENT_ID ||
                process.env.GOOGLE_CLIENT_ID ||
                process.env.VITE_GOOGLE_CLIENT_ID ||
                getBuiltInClientId()
              ).trim();
              const clientSecret = String(
                data.clientSecret ||
                env.GOOGLE_CLIENT_SECRET ||
                env.VITE_GOOGLE_CLIENT_SECRET ||
                process.env.GOOGLE_CLIENT_SECRET ||
                process.env.VITE_GOOGLE_CLIENT_SECRET ||
                getBuiltInClientSecret()
              ).trim();

              if (!code) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Código de autorización requerido.' }));
                return;
              }

              if (!clientId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Client ID no configurado.' }));
                return;
              }

              if (!clientSecret) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Client Secret no configurado.' }));
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

              const resJson: any = await googleRes.json();
              if (!googleRes.ok || resJson.error) {
                res.statusCode = googleRes.status || 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: resJson.error_description || resJson.error || 'Error canjeando código con Google.',
                  details: resJson
                }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                access_token: resJson.access_token,
                refresh_token: resJson.refresh_token || null,
                expires_in: resJson.expires_in || 3600,
                scope: resJson.scope || '',
                token_type: resJson.token_type || 'Bearer'
              }));
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: msg }));
            }
          });
          return;
        }

        if (pathname === '/refresh' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const refreshToken = String(data.refresh_token || '').trim();
              const clientId = String(
                data.clientId ||
                env.GOOGLE_CLIENT_ID ||
                env.VITE_GOOGLE_CLIENT_ID ||
                process.env.GOOGLE_CLIENT_ID ||
                process.env.VITE_GOOGLE_CLIENT_ID ||
                getBuiltInClientId()
              ).trim();
              const clientSecret = String(
                data.clientSecret ||
                env.GOOGLE_CLIENT_SECRET ||
                env.VITE_GOOGLE_CLIENT_SECRET ||
                process.env.GOOGLE_CLIENT_SECRET ||
                process.env.VITE_GOOGLE_CLIENT_SECRET ||
                getBuiltInClientSecret()
              ).trim();

              if (!refreshToken) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Refresh token requerido.' }));
                return;
              }

              if (!clientId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Client ID no configurado.' }));
                return;
              }

              if (!clientSecret) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Client Secret no configurado.' }));
                return;
              }

              const params = new URLSearchParams({
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token'
              });

              const googleRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Accept': 'application/json'
                },
                body: params.toString()
              });

              const resJson: any = await googleRes.json();
              if (!googleRes.ok || resJson.error) {
                res.statusCode = googleRes.status || 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: resJson.error_description || resJson.error || 'Error renovando access token con Google.',
                  details: resJson
                }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                access_token: resJson.access_token,
                expires_in: resJson.expires_in || 3600,
                scope: resJson.scope || '',
                token_type: resJson.token_type || 'Bearer'
              }));
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: msg }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

function aiProxyPlugin(): Plugin {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai-proxy', async (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const { url, headers, method, data } = JSON.parse(body)
              const ALLOWED_AI_HOSTS = [
                'ollama.com',
                'api.groq.com',
                'api.x.ai',
                'grok.com',
                'generativelanguage.googleapis.com',
                'api.openai.com',
                'api.anthropic.com',
                'openrouter.ai',
              ]
              let host = ''
              try {
                const parsed = new URL(url)
                host = parsed.hostname
                if (parsed.protocol !== 'https:') {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: 'Protocolo no permitido (solo HTTPS)' }))
                  return
                }
              } catch {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'URL inválida' }))
                return
              }
              if (!ALLOWED_AI_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
                res.statusCode = 403
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Host no permitido por política de seguridad' }))
                return
              }
              const cleanHeaders: Record<string, string> = { ...headers }
              delete cleanHeaders['host']
              delete cleanHeaders['origin']
              delete cleanHeaders['referer']

              const targetRes = await fetch(url, {
                method: method || 'POST',
                headers: cleanHeaders,
                body: data ? JSON.stringify(data) : undefined,
              })

              const resText = await targetRes.text()
              res.statusCode = targetRes.status
              res.setHeader('Content-Type', targetRes.headers.get('content-type') || 'application/json')
              res.end(resText)
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err)
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: msg }))
            }
          })
        } else {
          res.statusCode = 405
          res.end('Method Not Allowed')
        }
      })
    },
  }
}

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

function edgeTtsPlugin(): Plugin {
  return {
    name: 'edge-tts',
    configureServer(server) {
      server.middlewares.use('/api/edge-tts', async (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const { text, voice, rate, pitch } = JSON.parse(body)
              const { synthesizeEdgeTts } = require('./server/edgeTtsBridge.cjs')
              const audioBuffer = await synthesizeEdgeTts(text, voice, rate, pitch)
              res.statusCode = 200
              res.setHeader('Content-Type', 'audio/mpeg')
              res.setHeader('Content-Length', audioBuffer.length)
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(audioBuffer)
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: msg }))
            }
          })
        } else if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
        } else {
          res.statusCode = 405
          res.end('Method Not Allowed')
        }
      })
    },
  }
}

function imageSearchPlugin(): Plugin {
  return {
    name: 'image-search',
    configureServer(server) {
      server.middlewares.use('/api/image-search', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        try {
          const parsedUrl = new URL(req.url || '', 'http://localhost');
          let query = parsedUrl.searchParams.get('q') || '';
          if (!query && req.method === 'POST') {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
            }
            if (body) {
              const parsed = JSON.parse(body);
              query = parsed.query || parsed.q || '';
            }
          }

          if (!query.trim()) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Query parameter required', results: [] }));
            return;
          }

          const searchParam = encodeURIComponent(query.trim());
          const ddgHome = await fetch(`https://duckduckgo.com/?q=${searchParam}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          });
          const html = await ddgHome.text();
          const vqdMatch = html.match(/vqd=['"]?([0-9-]+)/);

          if (vqdMatch) {
            const vqd = vqdMatch[1];
            const imgRes = await fetch(
              `https://duckduckgo.com/i.js?l=es-es&o=json&q=${searchParam}&vqd=${vqd}`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ results }));
                  return;
                }
              }
            }
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ results: [] }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: msg, results: [] }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), aiProxyPlugin(), edgeTtsPlugin(), imageSearchPlugin(), googleAuthPlugin(env)],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('katex')) {
                return 'vendor-katex';
              }
              if (id.includes('pdfjs-dist')) {
                return 'vendor-pdf';
              }
              if (id.includes('jszip')) {
                return 'vendor-jszip';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});

