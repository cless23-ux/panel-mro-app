import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'

// 빌드할 때마다 달라지는 번호 (새 버전 알림용)
const BUILD_ID = String(Date.now())

// 빌드 결과 폴더에 version.json을 자동으로 만들어 줍니다.
// 앱이 이 번호를 주기적으로 확인해서 "새 버전이 나왔는지" 판단합니다.
function emitVersionJson() {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'emit-version-json',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir
      root = cfg.root
    },
    closeBundle() {
      const dir = path.resolve(root, outDir)
      if (fs.existsSync(dir)) {
        fs.writeFileSync(
          path.join(dir, 'version.json'),
          JSON.stringify({ build: BUILD_ID })
        )
      }
    },
  }
}

export default defineConfig({
  // 앱 코드에서 __BUILD_ID__ 로 현재 실행 중인 빌드 번호를 읽습니다.
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
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
    }),
    emitVersionJson()
  ]
})