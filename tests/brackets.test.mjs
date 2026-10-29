import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { estimateBracket, deckBracket } = await import('../src/brackets.ts');
const { DEFAULT_DECKS, readDeckLibrary } = await import('../src/decks.ts');
const { applyDeckImport } = await import('../src/ui/deckImport.ts');
const { bracketBadgeHTML } = await import('../src/ui/deckStats.ts');

const filler = n => Array.from({ length: n }, (_, i) => ({ name: `Carta Comum ${i}`, count: 1 }));
const commander = (cards, extra = {}) => ({ id: 'c', name: 'Teste', format: 'commander', commanders: [{ name: 'Krenko, Mob Boss', count: 1 }], cards: [...cards.map(name => ({ name, count: 1 })), ...filler(5)], ...extra });

test('nothing that weighs: minimum 1, deck shows 2 until the player picks', () => {
  const deck = commander([]);
  assert.deepEqual(estimateBracket(deck), { min: 1, reasons: [] });
  assert.equal(deckBracket(deck), 2);
  assert.equal(deckBracket({ ...deck, bracket: 1 }), 1);
  assert.equal(deckBracket({ ...deck, format: 'free' }), undefined);
});

test('Game Changers: up to three ask for 3, four or more for 4, with the reason', () => {
  const three = estimateBracket(commander(['Demonic Tutor', 'Rhystic Study', 'Smothering Tithe']));
  assert.equal(three.min, 3);
  assert.equal(three.reasons[0].text, '3 Game Changers: Demonic Tutor, Rhystic Study, Smothering Tithe');
  assert.equal(estimateBracket(commander(['Demonic Tutor', 'Rhystic Study', 'Smothering Tithe', 'Cyclonic Rift'])).min, 4);
  // A tutor that is already a Game Changer is not listed again as a tutor.
  assert.ok(!three.reasons.some(r => /tutor eficiente/.test(r.text)));
});

test('mass land denial, chained extra turns and combos raise the minimum; tutors only inform', () => {
  assert.equal(estimateBracket(commander(['Armageddon'])).min, 4);
  const oneTurn = estimateBracket(commander(['Time Warp']));
  assert.equal(oneTurn.min, 1);
  assert.match(oneTurn.reasons[0].text, /^Turno extra: Time Warp$/);
  assert.equal(estimateBracket(commander(['Time Warp', 'Temporal Mastery', 'Nexus of Fate'])).min, 4);
  const combo = estimateBracket(commander(['Sanguine Bond', 'Exquisite Blood']));
  assert.equal(combo.min, 3);
  assert.equal(combo.reasons[0].text, 'Combo de duas cartas: Exquisite Blood + Sanguine Bond');
  assert.equal(estimateBracket(commander(["Thassa's Oracle", 'Demonic Consultation'])).min, 4);
  const tutor = estimateBracket(commander(['Entomb']));
  assert.deepEqual(tutor, { min: 1, reasons: [{ min: 1, text: '1 tutor eficiente: Entomb' }] });
});

test('the chosen bracket never shows below the minimum; sideboard does not count', () => {
  const deck = commander(['Armageddon'], { bracket: 2 });
  assert.equal(deckBracket(deck), 4);
  assert.equal(deckBracket(commander([], { sideboard: [{ name: 'Armageddon', count: 1 }] })), 2);
});

test('double-faced cards match by the front face', () => {
  assert.equal(estimateBracket(commander(['Boom'])).min, 4);
  assert.equal(estimateBracket(commander(['Boom // Bust'])).min, 4);
});

test('every ready Commander deck has a bracket, checked by hand and never below the minimum', () => {
  for (const deck of DEFAULT_DECKS.filter(d => d.format === 'commander')) {
    assert.ok([2, 3, 4, 5].includes(deck.bracket), deck.id);
    assert.ok(deck.bracket >= estimateBracket(deck).min, deck.id);
  }
  for (const deck of DEFAULT_DECKS.filter(d => d.format !== 'commander')) assert.equal(deck.bracket, undefined, deck.id);
});

test('badge shows only for Commander, with the meaning in the tip', () => {
  assert.equal(bracketBadgeHTML(commander([], { bracket: 3 }), 'x'), '<span class="deck-bracket x" title="Bracket 3 · Melhorado: Deck reforçado: até 3 Game Changers, e combos de duas cartas só no fim da partida.">Bracket 3</span>');
  assert.equal(bracketBadgeHTML({ ...commander([]), format: 'free' }, 'x'), '');
});

test('stored bracket survives reading; an invalid one sends the deck to recovery', () => {
  const store = decks => ({ getItem: () => JSON.stringify({ version: 2, decks }), setItem() {} });
  assert.equal(readDeckLibrary(store([commander([], { bracket: 3 })])).decks[0].bracket, 3);
  const bad = readDeckLibrary(store([commander([], { bracket: 7 })]));
  assert.equal(bad.decks.length, 0);
  assert.equal(bad.recovery.length, 1);
});

test('importing a list keeps the deck bracket unless the link brought one', () => {
  const target = commander([], { bracket: 3 });
  const incoming = { id: 'n', name: 'n', cards: [{ name: 'Forest', count: 1 }] };
  assert.equal(applyDeckImport(target, incoming, 'replace').bracket, 3);
  assert.equal(applyDeckImport(target, { ...incoming, bracket: 4 }, 'replace').bracket, 4);
});
