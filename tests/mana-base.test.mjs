import test from 'node:test';
import assert from 'node:assert/strict';
const { costSymbols, sourceColors, manaBase, manaBaseHTML } = await import('../src/ui/manaBase.ts');

const CARDS = {
  'Forest': { type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)', layout: 'normal', cmc: 0 },
  'Island': { type_line: 'Basic Land — Island', oracle_text: '({T}: Add {U}.)', layout: 'normal', cmc: 0 },
  'Breeding Pool': { type_line: 'Land — Forest Island', oracle_text: '', layout: 'normal', cmc: 0 },
  'Evolving Wilds': { type_line: 'Land', oracle_text: '{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.', layout: 'normal', cmc: 0 },
  'Llanowar Elves': { type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.', mana_cost: '{G}', layout: 'normal', cmc: 1 },
  'Counterspell': { type_line: 'Instant', oracle_text: 'Counter target spell.', mana_cost: '{U}{U}', layout: 'normal', cmc: 2 },
  'Dark Ritual': { type_line: 'Instant', oracle_text: 'Add {B}{B}{B}.', mana_cost: '{B}', layout: 'normal', cmc: 1 },
  'Kitchen Finks': { type_line: 'Creature', oracle_text: '', mana_cost: '{1}{G/W}{G/W}', layout: 'normal', cmc: 3 },
};
const lookup = e => CARDS[e.name] ?? null;

test('symbols count hybrid for both colors', () => {
  assert.deepEqual(costSymbols('{1}{G/W}{G/W}'), { W: 2, U: 0, B: 0, R: 0, G: 2 });
  assert.deepEqual(costSymbols('{U}{U}{G/P}'), { W: 0, U: 2, B: 0, R: 0, G: 1 });
});

test('sources: lands by type and text, cheap permanents, never rituals', () => {
  assert.deepEqual([...sourceColors(CARDS['Breeding Pool'])].sort(), ['G', 'U']);
  assert.deepEqual([...sourceColors(CARDS['Evolving Wilds'])], ['any']);
  assert.deepEqual([...sourceColors(CARDS['Llanowar Elves'])], ['G']);
  assert.equal(sourceColors(CARDS['Dark Ritual']).size, 0);
});

test('mana base warns when a color has many symbols and few sources', () => {
  const deck = { cards: [{ name: 'Forest', count: 14 }, { name: 'Island', count: 2 }, { name: 'Counterspell', count: 8 }, { name: 'Llanowar Elves', count: 4 }] };
  const base = manaBase(deck, lookup);
  const blue = base.rows.find(r => r.color === 'U'), green = base.rows.find(r => r.color === 'G');
  assert.equal(blue.symbols, 16); assert.equal(green.symbols, 4);
  assert.equal(base.sources, 20); assert.equal(blue.sources, 2); assert.equal(green.sources, 18);
  assert.equal(blue.short, true); assert.equal(green.short, false);
  const balanced = manaBase({ cards: [{ name: 'Breeding Pool', count: 16 }, { name: 'Counterspell', count: 8 }, { name: 'Llanowar Elves', count: 4 }] }, lookup);
  assert.ok(balanced.rows.every(r => !r.short));
  assert.equal(manaBaseHTML({ cards: [] }), '');
});
