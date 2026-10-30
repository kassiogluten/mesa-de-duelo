import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

// Imports sem extensão, como no Vite.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { searchCards, cacheGet, fetchByNames, loadCardCache, resolveCardNames } = await import('../src/scryfall.ts');

const cached = new Map();
globalThis.localStorage = {
  getItem: key => cached.get(key) ?? null, setItem: (key, value) => cached.set(key, value), removeItem: key => cached.delete(key),
  key: i => [...cached.keys()][i] ?? null, get length() { return cached.size; },
};
const originalFetch = globalThis.fetch;
function apiCard(name, more = {}) {
  return { name, oracle_id: `oracle:${name}`, layout: 'normal', type_line: 'Instant', cmc: 1, mana_cost: '{R}', oracle_text: 'Deal 3 damage.', legalities: { pauper: 'legal' }, rarity: 'uncommon', lang: 'pt', image_status: 'highres_scan', ...more };
}

test('format search uses format legality rather than current printing rarity', async () => {
  let request;
  globalThis.fetch = async url => { request = new URL(url); return Response.json({ data: [apiCard('Search Test')], total_cards: 1, has_more: false }); };
  try {
    const result = await searchCards('lightning', 1, 'pauper');
    assert.equal(request.searchParams.get('q'), '(lightning) f:pauper');
    assert.equal(request.searchParams.get('include_multilingual'), 'true');
    assert.equal(result.cards[0].rarity, 'uncommon');
    assert.equal(result.cards[0].legalities.pauper, 'legal');
    assert.ok(result.cards[0].fetchedAt);
    assert.equal(cacheGet('Search Test').oracle_id, 'oracle:Search Test');
  } finally { globalThis.fetch = originalFetch; }
});

test('two-face rules and images survive slim cache and remain readable by either face', async () => {
  const card = apiCard('Front Test // Back Test', { layout: 'transform', oracle_text: undefined, mana_cost: undefined, card_faces: [
    { name: 'Front Test', mana_cost: '{2}{U}', oracle_text: 'Draw a card.', image_uris: { normal: 'https://example.test/front.png' } },
    { name: 'Back Test', mana_cost: '', oracle_text: 'Flying', image_uris: { normal: 'https://example.test/back.png' } },
  ] });
  globalThis.fetch = async () => Response.json({ data: [card] });
  try {
    await fetchByNames(['Front Test']);
    const front = cacheGet('Front Test'), back = cacheGet('Back Test');
    assert.match(front.oracle_text, /Draw a card/);
    assert.match(front.oracle_text, /Flying/);
    assert.equal(front.mana_cost, '{2}{U}');
    assert.equal(front.image_uris.normal, 'https://example.test/front.png');
    assert.equal(back.image_uris.normal, 'https://example.test/back.png');
    assert.equal(front.oracle_id, back.oracle_id);
  } finally { globalThis.fetch = originalFetch; }
});

test('a prepared spell face never takes the place of the real card with the same name', async () => {
  const real = apiCard('Prepared Name', { oracle_id: 'oracle:real', type_line: 'Sorcery' });
  const prepare = apiCard('Prepare Creature // Prepared Name', { oracle_id: 'oracle:prepare', layout: 'prepare', oracle_text: undefined, card_faces: [
    { name: 'Prepare Creature', mana_cost: '{1}{B}', oracle_text: 'Whenever you attack, prepare.' },
    { name: 'Prepared Name', mana_cost: '{X}{B}{B}', oracle_text: 'Each opponent loses X life.' },
  ] });
  for (const order of [[real, prepare], [prepare, real]]) {
    globalThis.fetch = async () => Response.json({ data: order, total_cards: 2, has_more: false });
    try {
      await searchCards(`prepared ${order[0].name}`);
      assert.equal(cacheGet('Prepared Name').oracle_id, 'oracle:real');
      assert.equal(cacheGet('Prepare Creature').oracle_id, 'oracle:prepare');
    } finally { globalThis.fetch = originalFetch; }
  }
});

test('importing the real card after its prepared namesake is cached resolves to the real card', async () => {
  // Stensian Sanguinist já está no cache (deck aberto, busca, mesa); a lista importada traz Exsanguinate.
  const prepare = apiCard('Import Creature // Import Spell', { oracle_id: 'oracle:import-prepare', layout: 'prepare', oracle_text: undefined, card_faces: [
    { name: 'Import Creature', mana_cost: '{1}{B}', oracle_text: 'Whenever you attack, prepare.' },
    { name: 'Import Spell', mana_cost: '{X}{B}{B}', oracle_text: 'Each opponent loses X life.' },
  ] });
  const real = apiCard('Import Spell', { oracle_id: 'oracle:import-real', type_line: 'Sorcery' });
  try {
    globalThis.fetch = async () => Response.json({ data: [prepare] });
    await fetchByNames(['Import Creature']);
    const asked = [];
    globalThis.fetch = async (url, init) => { asked.push(JSON.parse(init.body).identifiers.map(i => i.name)); return Response.json({ data: [real] }); };
    const resolved = await resolveCardNames(['Import Creature', 'Import Spell']);
    assert.equal(resolved.found.get('import creature'), 'Import Creature // Import Spell');
    assert.equal(resolved.found.get('import spell'), 'Import Spell');
    assert.deepEqual(asked, [['Import Spell']]);
    assert.equal(cacheGet('Import Spell').oracle_id, 'oracle:import-real');
    // Um deck salvo com a carta real também deixa de mostrar a criatura no lugar dela.
    globalThis.fetch = async () => Response.json({ data: [prepare] });
    await fetchByNames(['Import Creature']);
    globalThis.fetch = async () => Response.json({ data: [real] });
    assert.equal((await fetchByNames(['Import Spell'])).get('import spell').oracle_id, 'oracle:import-real');
  } finally { globalThis.fetch = originalFetch; }
});

test('cards remain available in memory when browser storage rejects writes', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  globalThis.fetch = async () => Response.json({ data: [apiCard('Memory Test')] });
  try {
    await fetchByNames(['Memory Test']);
    assert.equal(cacheGet('Memory Test').name, 'Memory Test');
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('malformed card cache falls back to retrieval instead of crashing a deck', async () => {
  cached.set('scry:v1:corrupt test', JSON.stringify({ v: 3, name: 42 }));
  await loadCardCache();
  assert.equal(cacheGet('Corrupt Test'), null);
});

test('cards left in localStorage by older versions move out of it, freeing room for decks', async () => {
  cached.set('scry:v1:legacy test', JSON.stringify({ v: 3, name: 'Legacy Test', type_line: 'Instant', layout: 'normal' }));
  cached.set('mesa:decks:v2', '[]');
  await loadCardCache();
  assert.equal(cacheGet('Legacy Test').name, 'Legacy Test');
  assert.deepEqual([...cached.keys()].filter(k => k.startsWith('scry:')), []);
  assert.equal(cached.get('mesa:decks:v2'), '[]', 'decks stay untouched');
});

test('deck image preload lists every face once and asks each url once per session', async () => {
  const { cardImageUrls, preloadImages } = await import('../src/scryfall.ts');
  globalThis.fetch = async () => Response.json({ data: [
    apiCard('Preload Plain', { lang: 'en', image_uris: { small: 'https://img.test/plain-s.jpg', normal: 'https://img.test/plain-n.jpg' } }),
    apiCard('Preload Front // Preload Back', { layout: 'transform', lang: 'en', card_faces: [
      { name: 'Preload Front', image_uris: { small: 'https://img.test/front-s.jpg', normal: 'https://img.test/front-n.jpg' } },
      { name: 'Preload Back', image_uris: { small: 'https://img.test/back-s.jpg', normal: 'https://img.test/back-n.jpg' } },
    ] }),
  ] });
  try {
    await fetchByNames(['Preload Plain', 'Preload Front // Preload Back']);
    const urls = cardImageUrls(['Preload Plain', 'Preload Plain', 'Preload Front // Preload Back', 'Unknown Card'], ['normal']);
    assert.deepEqual(urls, ['https://img.test/plain-n.jpg', 'https://img.test/front-n.jpg', 'https://img.test/back-n.jpg']);
    const loaded = [];
    assert.equal(await preloadImages(urls, async url => { loaded.push(url); }, 2), 3);
    assert.deepEqual(loaded.sort(), [...urls].sort());
    assert.equal(await preloadImages(urls, async url => { loaded.push(url); }), 0);
  } finally { globalThis.fetch = originalFetch; }
});
