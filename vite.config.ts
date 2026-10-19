import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// En GitHub Pages la app vive en /<repo>/. Se define con BASE_PATH en el workflow.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: base,
        name: 'Alfa Mind Engine',
        short_name: 'Alfa Mind',
        description: 'Entrenador guiado de relajación y visualización por cuenta regresiva. Funciona sin internet.',
        lang: 'es',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache total: código, íconos, audios y timelines.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json,mp3,wav}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Toma control desde la primera visita (las actualizaciones siguen esperando al usuario).
        clientsClaim: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { host: true },
  preview: { host: true, port: 4173 },
});
