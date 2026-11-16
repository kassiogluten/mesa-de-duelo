import test from 'node:test';
import assert from 'node:assert/strict';

const { foilOf } = await import('../src/ui/cardFoil.ts');

test('each rarity gets its own foil, the bonus sheet shines like the special one, and an unknown rarity is a common', () => {
  assert.equal(foilOf('common'), 'common');
  assert.equal(foilOf('uncommon'), 'uncommon');
  assert.equal(foilOf('rare'), 'rare');
  assert.equal(foilOf('mythic'), 'mythic');
  assert.equal(foilOf('special'), 'special');
  assert.equal(foilOf('bonus'), 'special');
  assert.equal(foilOf(undefined), 'common');
  assert.equal(foilOf('weird'), 'common');
});
