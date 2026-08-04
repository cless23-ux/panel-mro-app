import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'LUXCO',
        short_name: 'LUXCO',
        description: 'LUXCO 자재관리',
        theme_color: '#006DFF',
        background_color: '#00122B',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.png',
            sizes: '1254x1254',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})