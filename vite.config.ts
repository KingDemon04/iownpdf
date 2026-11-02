import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['icons/*.png', 'wasm/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs,webmanifest}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        ignoreURLParametersMatching: [/.*/]
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