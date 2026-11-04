import test from 'node:test';
import assert from 'node:assert/strict';
const f = await import('../src/ui/deckFilters.ts');
const pt = name => ({ 'Atarka, World Render': 'Atarka, Dissolvedora de Mundos' })[name] ?? name;
const atarka = { name: 'Destruição Dracônica', commanders: [{ name: 'Atarka, World Render' }] };

test('more colors narrow the list; colorless only finds decks without color', () => {
  const s = (...c) => new Set(c);
  assert.equal(f.matchesColors(['R', 'G'], s()), true);
  assert.equal(f.matchesColors(['R', 'G'], s('G')), true);
  assert.equal(f.matchesColors(['R', 'G'], s('G', 'B')), false);
  assert.equal(f.matchesColors([], s('C')), true);
  assert.equal(f.matchesColors(['U'], s('C')), false);
});

test('colorless and colors never stay marked together', () => {
  assert.deepEqual([...f.toggleColor(new Set(['W', 'U']), 'C')], ['C']);
  assert.deepEqual([...f.toggleColor(new Set(['C']), 'G')], ['G']);
  assert.deepEqual([...f.toggleColor(new Set(['G']), 'G')], []);
});

test('the search also finds a deck by its commander, in English or Portuguese', () => {
  assert.equal(f.matchesQuery(atarka, 'atarka', pt), true);
  assert.equal(f.matchesQuery(atarka, 'dissolvedora', pt), true);
  assert.equal(f.matchesQuery(atarka, 'dracônica', pt), true);
  assert.equal(f.matchesQuery(atarka, 'goblin', pt), false);
});

test('commander line and filter buttons', () => {
  assert.equal(f.commanderNames({ name: 'x', commanders: [{ name: 'Gisa' }, { name: 'Geralf' }] }), 'Gisa + Geralf');
  assert.match(f.commanderLineHTML(atarka, pt), /Atarka, Dissolvedora de Mundos/);
  assert.equal(f.commanderLineHTML({ name: 'Pauper' }), '');
  const html = f.colorFilterHTML(new Set(['G']), 'data-x');
  assert.equal((html.match(/class="color-filter-btn"/g) ?? []).length, 6);
  assert.match(html, /data-x="G" aria-pressed="true"/);
  assert.match(html, /Limpar cores/);
  assert.doesNotMatch(f.colorFilterHTML(new Set(), 'data-x'), /Limpar cores/);
});
