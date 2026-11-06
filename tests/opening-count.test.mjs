import test from 'node:test';
import assert from 'node:assert/strict';
const { openingHandCount } = await import('../src/ui/openingPresentation.ts');

test('mulligan hand counts lands and spells, without advice', () => {
  const hand = [{ land: true, name: 'Forest' }, { land: true, name: 'Island' }, { land: true, name: 'Forest' }, { name: 'Llanowar Elves' }, { name: 'Opt' }, { name: 'Counterspell' }, { name: 'Giant Growth' }];
  assert.equal(openingHandCount(hand), '3 terrenos · 4 mágicas');
  assert.equal(openingHandCount([{ land: true, name: 'Forest' }, { name: 'Opt' }]), '1 terreno · 1 mágica');
  assert.equal(openingHandCount([{ name: 'Opt' }]), '0 terrenos · 1 mágica');
});
