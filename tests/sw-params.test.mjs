import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Uma página guardada pelo service worker aberta com parâmetros (/rever.html?id=…) só acha a cópia guardada se o
// Workbox ignorar esses parâmetros; senão a navegação cai na tela inicial (o Rever partida levava ao início).
const root = new URL('../', import.meta.url);
const config = await readFile(new URL('vite.config.ts', root), 'utf8');
const ignored = [...(/ignoreURLParametersMatching:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '').matchAll(/\/(.+?)\/(?=[,\s]|$)/g)].map(m => new RegExp(m[1]));
const pages = new Set([...config.matchAll(/(\w+): '(\w+)\.html'/g)].map(m => m[2]));

async function sources(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    if (e.isDirectory()) out.push(...await sources(path));
    else if (/\.ts$/.test(e.name)) out.push(path);
  }
  return out;
}

test('links to a cached page with parameters keep finding the cached copy', async () => {
  assert.ok(ignored.length, 'vite.config.ts precisa de ignoreURLParametersMatching');
  const found = [];
  for (const file of await sources(new URL('src/', root))) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/(\w+)\.html\?(\w+)/g)) if (pages.has(m[1])) found.push([file.pathname.split('/src/')[1], m[1], m[2]]);
  }
  assert.ok(found.some(([, page]) => page === 'rever'), 'o link do Rever partida deveria ser encontrado');
  for (const [file, page, param] of found) {
    assert.ok(ignored.some(re => re.test(param)), `${file}: ${page}.html?${param} cairia na tela inicial; ponha /^${param}$/ em ignoreURLParametersMatching`);
  }
});
