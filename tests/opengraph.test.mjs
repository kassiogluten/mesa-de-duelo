import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

// A prévia do link depende de o nginx achar no index.html exatamente as linhas que ele troca (sub_filter).
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nginx = await readFile(new URL('../deploy/nginx.conf', import.meta.url), 'utf8');
const swaps = [...nginx.matchAll(/^\s*sub_filter '([^']+)' '([^']*)';/gm)].map(m => m[1]);
const meta = key => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1];

test('cada troca do nginx encontra a linha dela no index.html', () => {
  assert.ok(swaps.length >= 3, 'o nginx.conf deveria trocar o domínio, o título e a descrição');
  for (const s of swaps) assert.ok(html.includes(s), `index.html não tem: ${s}`);
});

test('a prévia tem título, descrição e imagem com endereço completo', async () => {
  for (const key of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card']) assert.ok(meta(key), `falta ${key}`);
  assert.equal(meta('og:image'), 'https://__MESA_HOST__/og-mesa.jpg');
  await access(new URL('../public/og-mesa.jpg', import.meta.url));
});
