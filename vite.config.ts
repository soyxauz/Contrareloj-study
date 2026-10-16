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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aiProxyPlugin()],
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

