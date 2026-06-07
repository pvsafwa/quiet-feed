import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
  // `npm run dev` proxies /api to the running Docker stack (web/nginx on :8080).
  server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } },
})
