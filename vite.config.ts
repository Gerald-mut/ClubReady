/// <reference lib="webworker" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'ClubReady 254', short_name: 'ClubReady',
      description: 'Build your club profile and evidence of play.',
      theme_color: '#111111', background_color: '#FFFFFF',
      id: '/', display: 'standalone', start_url: '/', scope: '/', lang: 'en',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Precache only build-owned static files. No runtime API/file caches.
      globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/(?:auth|rest|storage|functions|realtime)\/v1(?:\/|$)/],
      runtimeCaching: [{
        urlPattern: ({ url }) => /^\/(?:auth|rest|storage|functions|realtime)\/v1(?:\/|$)/.test(url.pathname),
        handler: 'NetworkOnly', options: { fetchOptions: { cache: 'no-store' } },
      }],
      cleanupOutdatedCaches: true,
      skipWaiting: false, clientsClaim: false,
    },
  })],
})
