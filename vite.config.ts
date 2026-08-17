import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false,
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: [
          'assistant.html',
          'manifest.json',
          'assets/assistant-*.js',
          'assets/globals-*.css',
          'assets/globals-*.js',
          'assets/UpdatePwaBanner-*.js',
          'icons/apple-touch-icon.png',
          'icons/assistente-perfil.webp',
          'icons/favicon.svg',
          'icons/pwa-192.png',
          'icons/pwa-512.png',
          'icons/pwa-maskable-512.png',
        ],
      },
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'app.html'),
        assistant: resolve(__dirname, 'assistant.html'),
        login: resolve(__dirname, 'index.html'),
        demo: resolve(__dirname, 'demo.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
