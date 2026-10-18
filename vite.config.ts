import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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
export default defineConfig({
  base: './',
  plugins: [react(), aiProxyPlugin(), edgeTtsPlugin()],
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
})

