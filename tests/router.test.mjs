import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const { createRouter, parseRoute, routePath } = await import('../src/app/router.ts');

/** Histórico de navegador de mentira: entradas, a atual, e o popstate que chega depois de go(). */
function fakeWindow(startPath) {
  const listeners = { popstate: [], click: [], keyup: [] };
  const entries = [{ url: startPath, state: null }];
  let index = 0;
  const parse = url => new URL(url, 'https://mesa.test');
  const location = {
    get pathname() { return parse(entries[index].url).pathname; },
    get search() { return parse(entries[index].url).search; },
    get href() { return parse(entries[index].url).href; },
  };
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(state, _t, url) { entries.splice(index + 1); entries.push({ url: parse(url).pathname + parse(url).search, state: structuredClone(state) }); index++; },
    replaceState(state, _t, url) { entries[index] = { url: parse(url).pathname + parse(url).search, state: structuredClone(state) }; },
    go(delta) {
      const next = index + delta;
      if (next < 0 || next >= entries.length) return;
      setTimeout(() => { index = next; for (const fn of listeners.popstate) fn(); }, 0);
    },
  };
  return {
    history, location,
    addEventListener(type, fn) { listeners[type]?.push(fn); },
    /** O voltar do celular. */
    back() { history.go(-1); },
    paths: () => entries.map(e => parse(e.url).pathname),
    get index() { return index; },
  };
}
const tick = () => new Promise(r => setTimeout(r, 5));

/** Uma mesa mínima: a tela à vista, os painéis abertos e quem pede para sair. */
function app(startPath, setup = {}) {
  const win = fakeWindow(startPath);
  const a = { screen: '/', overlays: [], asked: 0, opened: [], leaving: false, ...setup };
  const router = createRouter({
    current: () => a.screen,
    overlayOpen: () => a.overlays.length > 0,
    closeOverlay: () => { a.overlays.pop(); },
    canLeave: () => !a.leaving,
    requestLeave: () => { a.asked++; },
    navigate: route => { a.opened.push(routePath(route)); a.show(routePath(route)); },
    win,
    later: fn => setTimeout(fn, 0),
  });
  a.show = path => { a.screen = path; router.sync(path); };
  a.router = router; a.win = win;
  return a;
}

test('each screen has its address and back', () => {
  for (const path of ['/', '/decks', '/decks/importar', '/decks/3f2a-9', '/mesa-livre', '/laboratorio', '/partida']) assert.equal(routePath(parseRoute(path)), path);
  assert.deepEqual(parseRoute('/decks/abc/'), { screen: 'decks', view: 'edit', deckId: 'abc' });
  assert.deepEqual(parseRoute('/index.html'), { screen: 'lobby' });
  assert.deepEqual(parseRoute('/qualquer'), { screen: 'lobby' });
  assert.equal(routePath({ screen: 'decks', view: 'edit', deckId: 'a b' }), '/decks/a%20b');
});

test('a link straight to a screen keeps the start behind it, so back does not leave the site', async () => {
  const a = app('/decks/x');
  a.router.start();
  assert.deepEqual(a.win.paths(), ['/', '/decks/x']);
  a.screen = '/decks/x';
  a.win.back(); await tick();
  assert.deepEqual(a.opened, ['/']);
  assert.equal(a.win.location.pathname, '/');
});

test('back from Meus decks goes to the start; the screen buttons reuse the history instead of piling it up', async () => {
  const a = app('/');
  a.router.start();
  a.show('/decks');
  a.show('/decks/x');
  assert.deepEqual(a.win.paths(), ['/', '/decks', '/decks/x']);
  // "Voltar" do editor: a lista já está atrás.
  a.show('/decks'); await tick();
  assert.equal(a.win.index, 1);
  assert.deepEqual(a.opened, [], 'going back on its own does not open the screen twice');
  // "Jogar" no cabeçalho: o início está atrás.
  a.show('/'); await tick();
  assert.equal(a.win.index, 0);
  // Editor aberto direto do início; ao voltar à lista, ela toma o lugar dele.
  a.show('/decks/y');
  a.show('/decks'); await tick();
  assert.deepEqual(a.win.paths().slice(0, a.win.index + 1), ['/', '/decks']);
  a.win.back(); await tick();
  assert.deepEqual(a.opened, ['/']);
});

test('reloading on a screen keeps the history that was there', () => {
  const a = app('/');
  a.router.start();
  a.show('/laboratorio');
  // Recarregou: a entrada continua com o histórico dela.
  const again = app('/laboratorio');
  again.win.history.replaceState(a.win.history.state, '', '/laboratorio');
  again.router.start();
  assert.deepEqual(again.win.paths(), ['/laboratorio']);
  assert.deepEqual(again.win.history.state.stack, ['/', '/laboratorio']);
});

test('back in a match asks, and the match stays on screen until the answer', async () => {
  const a = app('/');
  a.router.start();
  a.show('/partida');
  a.leaving = true;
  a.win.back(); await tick();
  assert.equal(a.asked, 1);
  assert.deepEqual(a.opened, []);
  assert.equal(a.win.location.pathname, '/partida', 'the address went back to the match');
  // Saiu pela pergunta: a mesa vai para o início, voltando no histórico.
  a.leaving = false;
  a.show('/'); await tick();
  assert.equal(a.win.location.pathname, '/');
  assert.equal(a.win.index, 0);
});

test('back closes the open panel before changing screens', async () => {
  const a = app('/');
  a.router.start();
  a.show('/decks');
  // Abriu Novidades com um toque: o painel ganha uma entrada no histórico.
  a.overlays.push('novidades');
  a.router.checkOverlay(); await tick();
  assert.deepEqual(a.win.paths(), ['/', '/decks', '/decks']);
  a.win.back(); await tick(); await tick();
  assert.deepEqual(a.overlays, []);
  assert.equal(a.win.location.pathname, '/decks');
  assert.deepEqual(a.opened, []);
  // Fechou pelo próprio botão: a entrada sai, e o voltar seguinte troca de tela.
  a.overlays.push('menu');
  a.router.checkOverlay(); await tick();
  a.overlays.pop();
  a.router.checkOverlay(); await tick();
  assert.equal(a.win.index, 1);
  a.win.back(); await tick();
  assert.deepEqual(a.opened, ['/']);
});

test('a panel on the start screen also closes with back instead of leaving the site', async () => {
  const a = app('/');
  a.router.start();
  a.overlays.push('relatos');
  a.router.checkOverlay(); await tick();
  a.win.back(); await tick();
  assert.deepEqual(a.overlays, []);
  assert.equal(a.win.index, 0);
});

test('changing screens with a panel open leaves its entry first', async () => {
  const a = app('/');
  a.router.start();
  a.overlays.push('menu');
  a.router.checkOverlay(); await tick();
  a.overlays.pop();
  a.show('/laboratorio'); await tick(); await tick();
  assert.deepEqual(a.win.paths(), ['/', '/laboratorio']);
  assert.equal(a.win.index, 1);
});

test('a window opened by the server (no entry of its own) closes with back and the screen stays', async () => {
  const a = app('/');
  a.router.start();
  a.show('/partida');
  a.overlays.push('pergunta');
  a.win.back(); await tick();
  assert.deepEqual(a.overlays, []);
  assert.equal(a.win.location.pathname, '/partida');
  assert.equal(a.asked, 0);
});

// Endereços das outras páginas: sem .html nos links, e o nginx serve cada uma pelo nome (e leva o antigo ao novo).
const root = new URL('../', import.meta.url);
async function sources(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    if (e.isDirectory()) out.push(...await sources(path));
    else if (/\.ts$/.test(e.name)) out.push(path);
  }
  return out;
}
const SITE_PAGES = ['salas', 'partidas', 'torneios', 'contador', 'rever', 'novidades', 'privacidade'];

test('links to the other pages use the address without .html', async () => {
  const old = new RegExp(`["'\`}/](${SITE_PAGES.join('|')})\\.html`);
  const files = [...await sources(new URL('src/', root)), new URL('sobre.html', root), new URL('public/sitemap.xml', root)];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const m = old.exec(text.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'));
    assert.equal(m, null, `${file.pathname.split('/pages/').pop()}: ${m?.[0]} deveria ser /${m?.[1]}`);
  }
});

test('nginx serves each page by its clean address and redirects the old one', async () => {
  const conf = await readFile(new URL('deploy/nginx.conf', root), 'utf8');
  const redirect = /location ~ \^\/\(([^)]+)\)\\\.html\$ \{\s*return 301 \/\$1\$is_args\$args;/.exec(conf);
  const serve = /location ~ \^\/\(([^)]+)\)\$ \{[^}]*try_files \/\$1\.html =404;/.exec(conf);
  assert.ok(redirect && serve, 'as regras das páginas sem .html sumiram do nginx.conf');
  assert.deepEqual(redirect[1].split('|').sort(), [...SITE_PAGES].sort());
  assert.deepEqual(serve[1].split('|').sort(), [...SITE_PAGES].sort());
  // Antes da regra dos arquivos com extensão, senão o .html antigo cairia nela.
  assert.ok(conf.indexOf(redirect[0]) < conf.indexOf('location ~ \\.[a-z0-9]+$'));
  const config = await readFile(new URL('vite.config.ts', root), 'utf8');
  for (const page of SITE_PAGES) assert.match(config, new RegExp(`'${page}'`), `${page} precisa estar em PAGES (vite.config.ts)`);
});
