import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
      '/dictionary.txt': 'http://localhost:8787',
    },
  },
})
