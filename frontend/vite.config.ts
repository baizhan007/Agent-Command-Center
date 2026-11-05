import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    base: './',
    plugins: [react()],
    server: { proxy: { '/api': env.ACC_API_PROXY_TARGET ?? 'http://127.0.0.1:8765' } },
  }
})
