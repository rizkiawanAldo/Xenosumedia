import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const absoluteName = assetInfo.name ?? ''
          const srcDir = path.resolve(__dirname, 'src')
          const publicDir = path.resolve(__dirname, 'public')

          let relative = ''
          if (absoluteName) {
            // Prefer path relative to src
            let rel = path.relative(srcDir, absoluteName)
            // If outside src or unresolved, try relative to public
            if (rel.startsWith('..')) {
              rel = path.relative(publicDir, absoluteName)
            }
            relative = rel
          }

          // Normalize to posix and strip any leading ./ or ../ segments
          let normalized = (relative || path.basename(absoluteName)).replace(/\\/g, '/')
          normalized = normalized.replace(/^\.*\/+/, '') // strip ./
          normalized = normalized.replace(/^(?:\.\.\/)+/, '') // strip ../

          // If the path already contains 'assets/', keep subfolders after it; else prefix with assets/
          const idx = normalized.indexOf('assets/')
          if (idx >= 0) {
            const after = normalized.slice(idx)
            return after
          }
          return `assets/${normalized}`
        },
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
      },
    },
  },
})
