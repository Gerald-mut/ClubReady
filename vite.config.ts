import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png'],
    manifest: {
      name: 'ClubReady 254', short_name: 'ClubReady',
      description: 'Build your club profile and evidence of play.',
      theme_color: '#166534', background_color: '#f8fafc',
      display: 'standalone', start_url: '/',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'], navigateFallback: '/index.html' },
  })],
})
