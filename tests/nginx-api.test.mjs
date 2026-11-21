import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

// Todo endereço /api/ que a mesa chama precisa de um bloco no nginx de produção que o leve à ponte; sem ele, o pedido
// cai nos arquivos do site e volta 405 (foi o que aconteceu com a situação dos relatos, em Meus relatos).
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

test('every /api/ address the table calls is routed to the server by nginx', async () => {
  const conf = await readFile(new URL('deploy/nginx.conf', root), 'utf8');
  const exact = [...conf.matchAll(/location = (\/api\/\S+) \{/g)].map(m => m[1]);
  const prefixes = [...conf.matchAll(/location \^~ (\/api\/\S+) \{/g)].map(m => m[1]);
  const routed = path => exact.includes(path) || prefixes.some(prefix => path.startsWith(prefix));

  const paths = new Set();
  for (const file of await sources(new URL('src/', root))) {
    for (const m of (await readFile(file, 'utf8')).matchAll(/['`"](\/api\/[a-z0-9/_-]+)/g)) paths.add(m[1].endsWith('/') ? `${m[1]}x` : m[1]);
  }
  // Endereços montados a partir de outro: a situação dos relatos é o dos relatos com /situacao.
  const { statusUrl } = await import('../src/myReports.ts');
  paths.add(new URL(statusUrl('https://mesa.example/api/relatos')).pathname);

  assert.ok(paths.has('/api/relatos/situacao') && paths.size > 5, [...paths].join(', '));
  for (const path of paths) assert.ok(routed(path), `${path} não tem bloco no deploy/nginx.conf: o nginx responderia 405 ou 404`);
});
