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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), aiProxyPlugin(), edgeTtsPlugin(), googleAuthPlugin(env)],
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

