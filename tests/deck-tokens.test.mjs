import assert from 'node:assert/strict';
import { test } from 'node:test';
const { chooseToken, deckTokens, tokenImage, tokenPrintings } = await import('../src/deckTokens.ts');
const { tokenDescription } = await import('../src/ui/deckTokensView.ts');
const { readDeckLibrary, DECK_STORAGE_KEY } = await import('../src/decks.ts');
const { forgeDeck } = await import('../src/app/matchDecks.ts');

const originalFetch = globalThis.fetch;
const rabbit = { id: 'rabbit-id', oracle_id: 'rabbit-oracle', layout: 'token', name: 'Rabbit', type_line: 'Token Creature — Rabbit', colors: ['W'], power: '1', toughness: '1', image_uris: { small: 's', normal: 'n', art_crop: 'a' } };
const treasure = { id: 'treasure-id', oracle_id: 'treasure-oracle', layout: 'token', name: 'Treasure', type_line: 'Token Artifact — Treasure', colors: [] };
const emblem = { id: 'emblem-id', oracle_id: 'emblem-oracle', layout: 'emblem', name: 'Someone Emblem', type_line: 'Emblem — Someone' };

test('the deck tokens come from the cards related parts, one per token, with the cards that make it', async () => {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); asked.push(body.identifiers);
    if (body.identifiers[0].name) return Response.json({ data: [
      { name: 'Hare Apparent', all_parts: [{ component: 'combo_piece', id: 'x' }, { component: 'token', id: 'rabbit-id' }] },
      { name: 'Rabbit Maker', all_parts: [{ component: 'token', id: 'rabbit-id' }, { component: 'token', id: 'emblem-id' }] },
      { name: 'Dockside Extortionist', all_parts: [{ component: 'token', id: 'treasure-id' }] },
      { name: 'Lightning Bolt' },
    ] });
    return Response.json({ data: [rabbit, treasure, emblem] });
  };
  try {
    const deck = { id: 'd', name: 'D', cards: [{ name: 'Hare Apparent', count: 4 }, { name: 'Dockside Extortionist', count: 1 }, { name: 'Lightning Bolt', count: 4 }], sideboard: [{ name: 'Rabbit Maker', count: 1 }] };
    const kinds = await deckTokens(deck);
    assert.deepEqual(kinds.map(k => [k.name, k.colors, k.power ?? '', k.sources.join('+')]), [['Rabbit', 'W', '1', 'Hare Apparent+Rabbit Maker'], ['Treasure', '', '', 'Dockside Extortionist']]);
    const calls = asked.length;
    await deckTokens(deck);
    assert.equal(asked.length, calls, 'o que já se conhece não é pedido de novo');
  } finally { globalThis.fetch = originalFetch; }
});

test('the printings come from the oracle id search, newest first, skipping the ones without image', async () => {
  let url;
  globalThis.fetch = async u => { url = new URL(u); return Response.json({ has_more: false, data: [
    { set: 'tfdn', collector_number: '5', set_name: 'Foundations Tokens', image_uris: { small: 's1' } },
    { set: 'xxx', collector_number: '1', set_name: 'Sem imagem' },
  ] }); };
  try {
    const prints = await tokenPrintings('rabbit-oracle');
    assert.equal(url.searchParams.get('q'), 'oracleid:rabbit-oracle');
    assert.equal(url.searchParams.get('unique'), 'prints');
    assert.deepEqual(prints.map(p => `${p.set} ${p.cn}`), ['tfdn 5']);
  } finally { globalThis.fetch = originalFetch; }
});

test('choosing a printing stores what the server needs to recognize the token, and Automatic removes it', () => {
  const deck = { id: 'd', name: 'D', cards: [] };
  const kind = { oracleId: 'rabbit-oracle', name: 'Rabbit', typeLine: 'Token Creature — Rabbit', colors: 'W', power: '1', toughness: '1', sources: [] };
  chooseToken(deck, kind, { set: 'tfdn', cn: '5' });
  chooseToken(deck, kind, { set: 'tblb', cn: '3' });
  assert.deepEqual(deck.tokens, [{ oracleId: 'rabbit-oracle', name: 'Rabbit', colors: 'W', power: '1', toughness: '1', set: 'tblb', cn: '3' }]);
  assert.deepEqual(forgeDeck(deck).tokens, deck.tokens);
  assert.equal(tokenImage(deck.tokens[0], 'small'), 'https://api.scryfall.com/cards/tblb/3?format=image&version=small');
  chooseToken(deck, kind, null);
  assert.equal(deck.tokens, undefined);
  assert.equal(forgeDeck(deck).tokens, undefined);
});

test('saved decks keep the token choices, and a malformed one sends the deck to recovery', () => {
  const ok = { id: 'a', name: 'A', cards: [{ name: 'Forest', count: 1 }], tokens: [{ oracleId: 'o', name: 'Treasure', colors: '', set: 'thob', cn: '13' }] };
  const bad = { id: 'b', name: 'B', cards: [{ name: 'Forest', count: 1 }], tokens: [{ name: 'Treasure' }] };
  const data = new Map([[DECK_STORAGE_KEY, JSON.stringify({ version: 2, decks: [ok, bad] })]]);
  const result = readDeckLibrary({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  assert.deepEqual(result.decks.map(d => d.id), ['a']);
  assert.deepEqual(result.decks[0].tokens, ok.tokens);
  assert.equal(result.recovery.length, 1);
});

test('the token is described in Portuguese', () => {
  assert.equal(tokenDescription({ typeLine: 'Token Creature — Rabbit', colors: 'W', power: '1', toughness: '1' }), 'Criatura 1/1 branca');
  assert.equal(tokenDescription({ typeLine: 'Token Artifact — Treasure', colors: '' }), 'Artefato');
  assert.equal(tokenDescription({ typeLine: 'Token Creature — Elemental', colors: 'UR', power: '2', toughness: '2' }), 'Criatura 2/2 azul e vermelha');
});
