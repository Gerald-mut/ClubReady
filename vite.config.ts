import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg'],
    manifest: {
      name: 'ClubReady 254', short_name: 'ClubReady',
      description: 'Build your club profile and evidence of play.',
      theme_color: '#111111', background_color: '#FFFFFF',
      display: 'standalone', start_url: '/',
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'], navigateFallback: '/index.html' },
  })],
})
