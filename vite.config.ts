import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL ?? ''

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: [],
        runtimeCaching: [],
      },
      manifest: {
        name: 'Handlarlista',
        short_name: 'Handlarlista',
        description: 'Håll din inköpslista organiserad med kategorier',
        theme_color: '#F4F7FB',
        background_color: '#F4F7FB',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: supabaseUrl
    ? {
        proxy: {
          '/supabase-proxy': {
            target: supabaseUrl,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/supabase-proxy/, ''),
          },
        },
      }
    : undefined,
  }
})
