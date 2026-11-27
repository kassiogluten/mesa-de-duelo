import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readNewsFeed } from './scripts/news-feed.mjs';

// Além do jogo, que tem as telas do app em endereços próprios (/decks, /laboratorio, /partida…, src/app/router.ts), todos
// abrindo o index.html: as novidades em imagens (/novidades, linkada no painel Novidades e guardada com o app), a política
// de privacidade (/privacidade, no rodapé e no menu da conta), Salas (/salas, no cabeçalho e no menu ⋯), Minhas partidas
// (/partidas, no menu da conta e no menu ⋯), Torneios (/torneios, nos mesmos dois menus), o Contador de vida das partidas
// no papel (/contador, no menu ⋯ e em Torneios), Rever partida (/rever, aberta de Minhas partidas), Ligar a mesa no PC
// (/vincular, aberta pela mesa no PC para entrar na conta), Mesa no PC (/baixar, o zip para Windows, no rodapé da tela
// inicial só no Windows), a apresentação
// (/sobre, para quem chega de fora e os buscadores), a área de admin (/admin.html) e as páginas de teste da mesa
// (/tests/fixtures/*.html), linkadas na área de admin. Cada página é o seu <nome>.html: sem o .html, no `npm run dev` e no
// preview o Vite acha o arquivo sozinho; na publicação, o deploy/nginx.conf; no app instalado, o service worker (o Workbox
// tenta <endereço>.html entre as páginas guardadas antes de cair no index.html). Os scripts das duas últimas saem em
// ferramentas/ e ficam fora do cache do app instalado; os das outras páginas vão em assets/ e são guardados com o app.
const fixtures = Object.fromEntries(readdirSync('tests/fixtures').filter(f => f.endsWith('.html')).map(f => [f.replace('.html', ''), `tests/fixtures/${f}`]));
const PAGES = ['novidades', 'privacidade', 'sobre', 'partidas', 'torneios', 'contador', 'rever', 'salas', 'vincular', 'baixar', 'admin'] as const;
const TOOLS = new Set<string>(['admin', ...Object.keys(fixtures)]);

// /efeitos é o Laboratório de efeitos e /desempenho o Teste de desempenho (/benchmark também), abertos a todos (menu ⋯);
// na publicação quem faz a troca é o deploy/nginx.conf.
const SHORT_PAGES: [string, string][] = [['/efeitos', 'effects-lab'], ['/desempenho', 'benchmark'], ['/benchmark', 'benchmark']];
const efeitos = (req: { url?: string }, _res: unknown, next: () => void) => {
  for (const [path, page] of SHORT_PAGES) {
    if (req.url === path || req.url?.startsWith(`${path}?`)) { req.url = `/tests/fixtures/${page}.html${req.url.slice(path.length)}`; break; }
  }
  next();
};

// Imagens das cartas pelo cache (/scryfall/, src/scryfallMirror.ts): na publicação é o nginx que guarda; no dev e no
// preview, o Vite só repassa ao Scryfall.
// As fichas pela série e número (/scryfall/cards/<tamanho>/<série>/<número>[/back]) vão à API, que redireciona para a imagem.
const apiImage = (path: string) => path.replace(/^\/scryfall\/cards\/([^/]+)\/([^/]+)\/([^/?]+)(\/back)?.*$/,
  (_, version: string, set: string, cn: string, back?: string) => `/cards/${set}/${cn}?format=image&version=${version}${back ? '&face=back' : ''}`);
const scryfallMirror = {
  '/scryfall/cards/': { target: 'https://api.scryfall.com', changeOrigin: true, followRedirects: true, rewrite: apiImage },
  '/scryfall/': { target: 'https://cards.scryfall.io', changeOrigin: true, rewrite: (path: string) => path.slice('/scryfall'.length) },
};
// Imagem de carta atrasada de propósito (página de teste do carregando, tests/fixtures/image-loading.html):
// /scryfall/…?lento=3000 espera 3 s antes de seguir para o Scryfall (a small espera lentoSmall, se vier); ?falha=1 dá 404.
const lento = (req: { url?: string }, res: { statusCode: number; end: () => void }, next: () => void) => {
  if (!req.url?.startsWith('/scryfall/') || !/[?&](lento|falha)=/.test(req.url)) return next();
  const q = new URL(req.url, 'http://x').searchParams;
  const ms = Number((req.url.includes('/small/') && q.get('lentoSmall')) || q.get('lento') || 0);
  setTimeout(() => { if (q.get('falha')) { res.statusCode = 404; res.end(); } else next(); }, Math.min(ms, 30000));
};

// A mesa no PC no dev (/mesa-pc/<arquivo>): o que o npm run godot:pck e o godot:zip (zip e .tar.gz) gravaram em dist/mesa-pc/, ou 404.
const MESA_PC_TYPES: Record<string, string> = { json: 'application/json; charset=utf-8', zip: 'application/zip', gz: 'application/gzip', pck: 'application/octet-stream' };
const mesaPc = (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string | number) => void; end: () => void } & NodeJS.WritableStream, next: () => void) => {
  const path = req.url?.split('?')[0] ?? '';
  if (!path.startsWith('/mesa-pc/')) return next();
  const name = basename(decodeURIComponent(path));
  const file = `dist/mesa-pc/${name}`;
  if (!/^[\w.-]+$/.test(name) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', MESA_PC_TYPES[name.split('.').pop() ?? ''] ?? 'application/octet-stream');
  res.setHeader('Content-Length', statSync(file).size);
  res.setHeader('Cache-Control', 'no-cache');
  if (/\.(zip|tar\.gz)$/.test(name)) res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  createReadStream(file).pipe(res);
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
    // A versão publicada, num arquivo que fica fora do cache do app: o aviso de versão nova lê daqui qual é a mais recente (src/ui/pwa.ts).
    { name: 'versao', generateBundle() { this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify({ version: JSON.parse(readFileSync('package.json', 'utf8')).version }) }); } },
    // As novidades para a mesa no PC (scripts/news-feed.mjs), também fora do cache do app; no dev, lidas a cada pedido.
    {
      name: 'novidades-json',
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'novidades.json', source: JSON.stringify(readNewsFeed(process.cwd())) }); },
      configureServer: s => {
        s.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/novidades.json') return next();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(JSON.stringify(readNewsFeed(process.cwd())));
        });
      },
    },
    // /mesa-pc/ no dev: o zip e o manifesto gerados aqui (npm run godot:pck e godot:zip, em dist/mesa-pc/), ou 404. Nunca a
    // página do site, que o navegador gravaria como um zip quebrado.
    { name: 'mesa-pc', configureServer: s => { s.middlewares.use(mesaPc); }, configurePreviewServer: s => { s.middlewares.use(mesaPc); } },
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
        // Páginas guardadas abertas com parâmetros (/rever?id=…, ?mesa e /vincular?codigo=…) acham a cópia guardada; sem isso, o endereço
        // não batia com nenhuma e caía na tela inicial. utm_ e fbclid são os que o Workbox já ignora por padrão.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^id$/, /^mesa$/, /^codigo$/],
        // /mesa-pc/ é o zip e o manifesto da mesa no PC: abrir o zip nunca pode cair na tela inicial guardada.
        navigateFallbackDenylist: [/^\/sobre/, /^\/mesa-pc\//,/^\/efeitos/, /^\/desempenho/, /^\/benchmark/, /^\/ws/, /^\/api\//, /^\/admin/, /^\/tests\//],
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
