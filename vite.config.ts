import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'node:fs'
import nodePath from 'node:path'

const PHOTOS_ROOT = nodePath.resolve('src/assets/photos')

/** Dev-only middleware: handles local file ops for the admin panel at /_admin/* */
function adminDevPlugin() {
  async function readBody(req: any): Promise<Record<string, string>> {
    return new Promise(resolve => {
      let data = ''
      req.on('data', (c: Buffer) => { data += c })
      req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
    })
  }

  return {
    name: 'admin-dev-api',
    configureServer(server: any) {
      server.middlewares.use('/_admin', async (req: any, res: any, next: any) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const p = url.pathname

        try {
          // ── Serve image file for preview ────────────────────────────
          if (req.method === 'GET' && p === '/img') {
            const relPath = url.searchParams.get('p') ?? ''
            const full = nodePath.resolve(relPath)
            if (!full.startsWith(nodePath.resolve('src/assets'))) {
              res.statusCode = 403; res.end('Forbidden'); return
            }
            if (!fs.existsSync(full)) { res.statusCode = 404; res.end('Not found'); return }
            const ext = nodePath.extname(full).toLowerCase()
            const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
              : ext === '.png' ? 'image/png' : 'image/webp'
            res.setHeader('Content-Type', mime)
            fs.createReadStream(full).pipe(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')

          // ── List categories ──────────────────────────────────────────
          if (req.method === 'GET' && p === '/cats') {
            const dirs = fs.readdirSync(PHOTOS_ROOT, { withFileTypes: true })
              .filter(d => d.isDirectory()).map(d => d.name).sort()
            res.end(JSON.stringify(dirs)); return
          }

          // ── List images in category ──────────────────────────────────
          if (req.method === 'GET' && p === '/images') {
            const cat = url.searchParams.get('cat') ?? ''
            const dir = nodePath.join(PHOTOS_ROOT, cat)
            const files = fs.existsSync(dir)
              ? fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
              : []
            res.end(JSON.stringify(files.map(f => ({
              name: f, sha: f, type: 'file',
              path: `src/assets/photos/${cat}/${f}`,
              download_url: `/_admin/img?p=src/assets/photos/${cat}/${f}`,
            })))); return
          }

          const body = await readBody(req)

          // ── Upload image ─────────────────────────────────────────────
          if (req.method === 'POST' && p === '/upload') {
            const dest = nodePath.join(PHOTOS_ROOT, body.cat, body.name)
            fs.mkdirSync(nodePath.dirname(dest), { recursive: true })
            fs.writeFileSync(dest, Buffer.from(body.content, 'base64'))
            res.end(JSON.stringify({ ok: true })); return
          }

          // ── Delete image ─────────────────────────────────────────────
          if (req.method === 'POST' && p === '/delete') {
            const full = nodePath.resolve(body.path)
            if (!full.startsWith(PHOTOS_ROOT)) { res.statusCode = 403; res.end('{}'); return }
            if (fs.existsSync(full)) fs.unlinkSync(full)
            res.end(JSON.stringify({ ok: true })); return
          }

          // ── Move image ───────────────────────────────────────────────
          if (req.method === 'POST' && p === '/move') {
            const src = nodePath.join(PHOTOS_ROOT, body.fromCat, body.name)
            const dst = nodePath.join(PHOTOS_ROOT, body.toCat, body.name)
            fs.mkdirSync(nodePath.dirname(dst), { recursive: true })
            fs.renameSync(src, dst)
            res.end(JSON.stringify({ ok: true })); return
          }

          // ── Create category ──────────────────────────────────────────
          if (req.method === 'POST' && p === '/mkdir') {
            const dir = nodePath.join(PHOTOS_ROOT, body.name)
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(nodePath.join(dir, '.gitkeep'), '')
            res.end(JSON.stringify({ ok: true })); return
          }

          // ── Delete category ──────────────────────────────────────────
          if (req.method === 'POST' && p === '/rmdir') {
            fs.rmSync(nodePath.join(PHOTOS_ROOT, body.name), { recursive: true, force: true })
            res.end(JSON.stringify({ ok: true })); return
          }
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (err as Error).message }))
          return
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), adminDevPlugin()],
  base: '/Xenosumedia/',
  build: {
    assetsDir: 'assets',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
    target: 'es2015',
    cssCodeSplit: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
