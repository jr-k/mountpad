import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-styled-components',
            {
              displayName: true,
              fileName: false,
              pure: true,
            },
          ],
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: 'dist',
    manifest: true,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        // The Go template references /assets/index.js and
        // /assets/index.css with stable (un-hashed) names. Cache
        // invalidation is delegated to gonertia, which versions the
        // page from the Vite manifest hash, so a content change still
        // triggers a full reload.
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          // The single CSS file that the entry pulls in: pin to
          // index.css so the template can hardcode the link. Every
          // other asset (images, fonts, etc.) keeps its hash so it
          // can be cached aggressively by the browser.
          if (info.name?.endsWith('.css')) return 'assets/index.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
