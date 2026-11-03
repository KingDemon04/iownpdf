import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icons/*.png', 'wasm/*'],
      workbox: {
        // Pre-cacha subito l'app shell (HTML, CSS, JS, icone)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        // Cacha automaticamente i binari pesanti (.wasm e .mjs di PDF.js) con strategia CacheFirst
        runtimeCaching: [
          {
            urlPattern: /\.(?:wasm|mjs)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'iownpdf-heavy-engines',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 anno
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
  manifest: {
        name: 'IOwnPDF',
        short_name: 'IOwnPDF',
        description: 'Client-side PDF processing suite',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        // Integrazione nativa Windows 11: "Apri con -> Local PDF Studio"
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/pdf': ['.pdf']
            }
          }
        ]
      }
    })
  ],
  worker: {
    format: 'es'
  },
  build: {
    target: 'esnext',
    modulePreload: false // Evita che il browser precarichi pdf-lib e pdfjs-dist all'avvio!
  }
});