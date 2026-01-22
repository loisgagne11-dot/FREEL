import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/FREEL/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Freel - Gestion Freelance',
        short_name: 'Freel',
        description: 'Gestion freelance intelligente - Suivi CA, charges, trésorerie',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 // 24h
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'chart': ['chart.js'],
          'pdf': ['jspdf']
        }
      }
    }
  }
});
