import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Além do jogo: a área de admin (/admin.html) e as páginas de teste da mesa (/tests/fixtures/*.html), linkadas
// na área de admin. Os scripts delas saem em ferramentas/ e ficam fora do cache do app instalado.
const fixtures = Object.fromEntries(readdirSync('tests/fixtures').filter(f => f.endsWith('.html')).map(f => [f.replace('.html', ''), `tests/fixtures/${f}`]));

export default defineConfig({
  build: {
    rollupOptions: {
      input: { index: 'index.html', admin: 'admin.html', ...fixtures },
      output: { entryFileNames: chunk => chunk.name === 'index' ? 'assets/[name]-[hash].js' : 'ferramentas/[name]-[hash].js' },
    },
  },
  plugins: [
    VitePWA({
      // A página decide quando atualizar: o jogador vê "Nova versão" e escolhe a hora (src/ui/pwa.ts).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Mesa de Duelo',
        short_name: 'Mesa de Duelo',
        description: 'Partidas de Magic contra o computador ou com amigos, direto no navegador.',
        lang: 'pt-BR',
        categories: ['games'],
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#060912',
        theme_color: '#060912',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // O visual e os sons ficam guardados: o jogo abre rápido e, sem servidor, ainda mostra a tela inicial.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wav}'],
        globIgnores: ['audio/sources/**', 'admin.html', 'tests/**', 'ferramentas/**', 'assets/admin-*'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/ws/, /^\/api\//, /^\/admin/, /^\/tests\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
});
