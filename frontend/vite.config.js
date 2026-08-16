import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: { host: true, allowedHosts: ['asus-laptop.tailed3faf.ts.net'] },
  preview: { host: true, allowedHosts: ['asus-laptop.tailed3faf.ts.net'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service workers (and therefore push) are otherwise disabled entirely
      // under `vite dev` — only a production build registers one by default.
      devOptions: { enabled: true, type: 'module' },
      workbox: {
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Cache all API responses — network-first, fall back to cache
            // (excludes /api/health, used as an uncached reachability probe)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/health',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'GymBuddy',
        short_name: 'GymBuddy',
        description: 'Your AI-powered workout companion',
        theme_color: '#0b1026',
        background_color: '#0b1026',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-monochrome.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
        ],
        screenshots: [
          { src: 'screenshots/wide.png', sizes: '1920x945', type: 'image/png', form_factor: 'wide' },
          { src: 'screenshots/narrow.png', sizes: '1280x2856', type: 'image/png', form_factor: 'narrow' },
        ],
      },
    }),
  ],
})
