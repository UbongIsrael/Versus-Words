import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_API_PROXY || 'http://localhost:8787'
  return {
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': proxyTarget,
        '/health': proxyTarget,
        '/dictionary.txt': proxyTarget,
      },
    },
  }
})
