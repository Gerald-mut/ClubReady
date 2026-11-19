import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
export default defineConfig({ resolve: { alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./node_modules/vite-plugin-pwa/dist/client/dev/react.js', import.meta.url)) } }, plugins: [react()], test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], clearMocks: true } })
