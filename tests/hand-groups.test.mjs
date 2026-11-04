import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupHand, moveGroupInHand } from '../src/ui/handDrag.ts';

const names = { 1: 'Forest', 2: 'Bolt', 3: 'Forest', 4: 'Bears', 5: 'Bolt', 6: 'Forest' };

test('copies join the pile of the first copy, keeping the player order', () => {
  assert.deepEqual(groupHand([1, 2, 3, 4, 5, 6], id => names[id]), [[1, 3, 6], [2, 5], [4]]);
  assert.deepEqual(groupHand([4, 3, 2], id => names[id]), [[4], [3], [2]]);
});

test('a card that must stay alone is never grouped', () => {
  assert.deepEqual(groupHand([1, 3, 6], id => id === 3 ? null : names[id]), [[1, 6], [3]]);
});

test('moving a pile carries every copy along', () => {
  const groups = [[1, 3, 6], [2, 5], [4]];
  assert.deepEqual(moveGroupInHand(groups, 3, 2), [2, 5, 4, 1, 3, 6]);
  assert.deepEqual(moveGroupInHand(groups, 4, 0), [4, 1, 3, 6, 2, 5]);
  assert.equal(moveGroupInHand(groups, 2, 1), null);
});
