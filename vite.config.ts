import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.app.github.dev']
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Language Learning Slot Machine',
        short_name: 'Language Slots',
        description: 'Offline-first image slot machine for language practice',
        theme_color: '#1f2937',
        background_color: '#f4f1ea',
        display: 'standalone',
        orientation: 'landscape',
        start_url: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'slot-image-cache',
              expiration: {
                maxEntries: 1600,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('images.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'slot-metadata-cache'
            }
          }
        ]
      }
    })
  ]
});
