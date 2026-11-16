import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Além do jogo: as novidades em imagens (/novidades.html, linkada no painel Novidades e guardada com o app), a política
// de privacidade (/privacidade.html, no rodapé e no menu da conta), Salas (/salas.html, no cabeçalho e no menu ⋯), Minhas
// partidas (/partidas.html, no menu da conta e no menu ⋯), Torneios (/torneios.html, nos mesmos dois menus), Rever
// partida (/rever.html, aberta de Minhas partidas), a
// apresentação (/sobre, em sobre.html, para quem chega de fora e os buscadores), a área de admin (/admin.html) e as
// páginas de teste da mesa (/tests/fixtures/*.html), linkadas na área de admin. Os scripts das duas últimas saem em
// ferramentas/ e ficam fora do cache do app instalado; os das outras páginas vão em assets/ e são guardados com o app.
const fixtures = Object.fromEntries(readdirSync('tests/fixtures').filter(f => f.endsWith('.html')).map(f => [f.replace('.html', ''), `tests/fixtures/${f}`]));
const PAGES = ['novidades', 'privacidade', 'sobre', 'partidas', 'torneios', 'rever', 'salas', 'admin'] as const;
const TOOLS = new Set<string>(['admin', ...Object.keys(fixtures)]);

// /efeitos é o Laboratório de efeitos aberto a todos (menu ⋯); na publicação quem faz a troca é o deploy/nginx.conf.
const efeitos = (req: { url?: string }, _res: unknown, next: () => void) => {
  if (req.url === '/efeitos' || req.url?.startsWith('/efeitos?')) req.url = `/tests/fixtures/effects-lab.html${req.url.slice('/efeitos'.length)}`;
  next();
};

// Imagens das cartas pelo cache (/scryfall/, src/scryfallMirror.ts): na publicação é o nginx que guarda; no dev e no
// preview, o Vite só repassa ao Scryfall.
const scryfallMirror = { '/scryfall/': { target: 'https://cards.scryfall.io', changeOrigin: true, rewrite: (path: string) => path.slice('/scryfall'.length) } };
// Imagem de carta atrasada de propósito (página de teste do carregando, tests/fixtures/image-loading.html):
// /scryfall/…?lento=3000 espera 3 s antes de seguir para o Scryfall (a small espera lentoSmall, se vier); ?falha=1 dá 404.
const lento = (req: { url?: string }, res: { statusCode: number; end: () => void }, next: () => void) => {
  if (!req.url?.startsWith('/scryfall/') || !/[?&](lento|falha)=/.test(req.url)) return next();
  const q = new URL(req.url, 'http://x').searchParams;
  const ms = Number((req.url.includes('/small/') && q.get('lentoSmall')) || q.get('lento') || 0);
  setTimeout(() => { if (q.get('falha')) { res.statusCode = 404; res.end(); } else next(); }, Math.min(ms, 30000));
};

export default defineConfig({
  server: { proxy: scryfallMirror },
  preview: { proxy: scryfallMirror },
  build: {
    rollupOptions: {
      input: { index: 'index.html', ...Object.fromEntries(PAGES.map(p => [p, `${p}.html`])), ...fixtures },
      // Antes, só index e novidades iam em assets/: o HTML de Partidas, Rever, Salas e Privacidade ficava guardado no app,
      // mas o script deles não, e a página abria em branco sem internet ou logo depois de uma versão nova.
      output: { entryFileNames: chunk => TOOLS.has(chunk.name) ? 'ferramentas/[name]-[hash].js' : 'assets/[name]-[hash].js' },
    },
  },
  plugins: [
    { name: 'efeitos', configureServer: s => { s.middlewares.use(efeitos); }, configurePreviewServer: s => { s.middlewares.use(efeitos); } },
    { name: 'imagem-lenta', configureServer: s => { s.middlewares.use(lento); } },
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,mp3}'],
        globIgnores: ['sobre.html', 'sobre/**', 'sw-avisos.js', 'audio/*/*', 'admin.html', 'tests/**', 'ferramentas/**', 'assets/admin-*'],
        // Toque no aviso "Seu turno" que o service worker mostra no celular (public/sw-avisos.js).
        importScripts: ['sw-avisos.js'],
        navigateFallback: 'index.html',
        // Páginas guardadas abertas com parâmetros (/rever.html?id=… e ?mesa) acham a cópia guardada; sem isso, o endereço
        // não batia com nenhuma e caía na tela inicial. utm_ e fbclid são os que o Workbox já ignora por padrão.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^id$/, /^mesa$/],
        navigateFallbackDenylist: [/^\/sobre/, /^\/efeitos/, /^\/ws/, /^\/api\//, /^\/admin/, /^\/tests\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Pacotes de sons temáticos (public/audio/<pacote>/): só o clássico vai no pacote do app; os outros são guardados ao escolher.
            urlPattern: ({ url }) => /^\/audio\/[^/]+\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'pacotes-de-sons', expiration: { maxEntries: 200 } },
          },
          {
            // Prints das novidades (public/novidades/): ficam fora do pacote do app e são guardados quando vistos.
            urlPattern: ({ url }) => url.pathname.startsWith('/novidades/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'novidades', expiration: { maxEntries: 200 } },
          },
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
          {
            // Imagens das cartas, pelo nosso cache (/scryfall/, no host das imagens ou no site) ou direto do Scryfall, a reserva: a mesma URL nunca muda
            // de conteúdo. A busca vai em modo CORS (o Scryfall manda Access-Control-Allow-Origin: *) para a resposta não
            // ser opaca, que o navegador conta como ~7 MB na cota.
            urlPattern: ({ url }) => url.origin === 'https://cards.scryfall.io' || url.pathname.startsWith('/scryfall/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              fetchOptions: { mode: 'cors', credentials: 'omit' },
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 90, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
