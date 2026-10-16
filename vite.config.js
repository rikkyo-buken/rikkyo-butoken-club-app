import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 通知を受け取るため、サービスワーカーは自前（src/sw.js）
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}']
      },
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '舞研アプリ',
        short_name: '舞研',
        description: '立教大学舞踏研究会の運営アプリ',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFF8F2',
        theme_color: '#8B6CF6',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
