import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [react()],
  server: {
    port: Number(env.WEB_PORT) || 5173,
    strictPort: true,
    proxy: {
      '/api': env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || 3001}`,
    },
  },
  }
})
