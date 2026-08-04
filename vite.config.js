import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icon.png',
        'icon-192.png',
        'icon-512.png',
        'splash.png'
      ],
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
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})