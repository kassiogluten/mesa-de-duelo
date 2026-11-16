import assert from 'node:assert/strict';
import { test } from 'node:test';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key),
  key: i => [...memory.keys()][i] ?? null, get length() { return memory.size; },
};
const { cacheGet, fetchByNames, resolveCardNames, searchCards } = await import('../src/scryfall.ts');
const originalFetch = globalThis.fetch;

const apiCard = (name, more = {}) => ({ name, oracle_id: `oracle:${name}`, layout: 'normal', type_line: 'Instant', lang: 'en', legalities: { commander: 'legal' },
  image_uris: { small: 'https://cards.scryfall.io/small/front/a/b/aaaaaaaa-0000-0000-0000-000000000000.jpg' }, ...more });
const isServer = url => String(url).endsWith('/api/cartas');

test('cards come from the server cache with the Portuguese printing, without asking Scryfall', async () => {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    assert.ok(isServer(url), `pediu ao Scryfall: ${url}`);
    assert.deepEqual(JSON.parse(init.body).nomes, ['Server Bolt', 'Server Front']);
    return Response.json({ cartas: [
      apiCard('Server Bolt', { pt: { name: 'Server Bolt', lang: 'pt', printed_name: 'Raio do Servidor', printed_text: 'Causa 3.' }, atualizada: 1234 }),
      apiCard('Server Front // Server Back', { layout: 'transform', card_faces: [{ name: 'Server Front' }, { name: 'Server Back' }], pt: null, atualizada: 5678 }),
    ], faltam: [], depois: [] });
  };
  try {
    const out = await fetchByNames(['Server Bolt', 'Server Front // Server Back']);
    assert.equal(asked.length, 1, 'uma pergunta só, e a tradução já veio junto');
    const bolt = cacheGet('Server Bolt');
    assert.equal(bolt.pt.name, 'Raio do Servidor');
    assert.equal(bolt.ptChecked, true);
    assert.equal(bolt.fetchedAt, 1234, 'as legalidades valem desde quando o servidor as leu');
    assert.match(bolt.image_uris.small, /^\/scryfall\/small\//, 'a imagem passa pelo cache de imagens');
    assert.equal(cacheGet('Server Back').name, 'Server Front // Server Back');
    assert.equal(cacheGet('Server Front').pt, undefined);
    assert.equal(cacheGet('Server Front').ptChecked, true);
    assert.equal(out.size, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('what the server cannot get now goes straight to Scryfall', async () => {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    if (isServer(url)) return Response.json({ cartas: [apiCard('Later Known', { pt: null, atualizada: 1 })], faltam: ['nope'], depois: ['later direct'] });
    if (String(url).includes('/cards/search')) return Response.json({ object: 'error' }, { status: 404 });
    asked.push(JSON.parse(init.body).identifiers.map(i => i.name));
    return Response.json({ data: [apiCard('Later Direct')] });
  };
  try {
    const { found, missing } = await resolveCardNames(['Later Known', 'Later Direct', 'Nope']);
    assert.deepEqual(asked, [['Later Direct']], 'nem o que já veio nem o que o Scryfall não conhece');
    assert.equal(found.get('later known'), 'Later Known');
    assert.equal(found.get('later direct'), 'Later Direct');
    assert.ok(missing.includes('Nope'));
  } finally { globalThis.fetch = originalFetch; }
});

test('search results get their translation from the server cache', async () => {
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (isServer(url)) return Response.json({ cartas: [apiCard('Search Server', { pt: { lang: 'pt', printed_name: 'Busca no Servidor' }, atualizada: 1 })], faltam: [], depois: [] });
    return Response.json({ data: [apiCard('Search Server')], total_cards: 1, has_more: false });
  };
  try {
    const { cards } = await searchCards('server');
    assert.equal(cards[0].pt.name, 'Busca no Servidor');
    assert.equal(urls.filter(u => u.includes('lang%3Apt')).length, 0, 'sem a busca lang:pt no Scryfall');
  } finally { globalThis.fetch = originalFetch; }
});

test('a server that fails is skipped for a while and Scryfall answers instead', async () => {
  let server = 0, direct = 0;
  globalThis.fetch = async url => {
    if (isServer(url)) { server++; return new Response('falhou', { status: 502 }); }
    direct++;
    return String(url).includes('/cards/collection') ? Response.json({ data: [apiCard(`Down ${direct}`)] }) : Response.json({ data: [], total_cards: 0, has_more: false });
  };
  try {
    await fetchByNames(['Down 1']);
    await fetchByNames(['Down 3']);
    assert.equal(server, 1, 'depois da falha, a mesa não insiste');
    assert.ok(cacheGet('Down 1'));
  } finally { globalThis.fetch = originalFetch; }
});
