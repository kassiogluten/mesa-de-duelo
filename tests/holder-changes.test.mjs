import test from 'node:test';
import assert from 'node:assert/strict';

const { holderChanges } = await import('../src/ui/holderChanges.ts');

const players = (monarch, initiative) => [1, 2, 3].map(id => ({ id, monarch: id === monarch, initiative: id === initiative }));

test('the crown and the initiative fly only when they change hands in the same match', () => {
  let r = holderChanges(null, players(2, null), 'm1');
  assert.deepEqual(r.passes, [], 'opening a match in progress flies nothing');
  r = holderChanges(r.now, players(2, null), 'm1');
  assert.deepEqual(r.passes, []);
  r = holderChanges(r.now, players(3, 1), 'm1');
  assert.deepEqual(r.passes, [{ kind: 'monarch', from: 2, to: 3 }, { kind: 'initiative', from: null, to: 1 }]);
  r = holderChanges(r.now, players(null, 1), 'm1');
  assert.deepEqual(r.passes, [], 'nobody holding it is not a pass');
  r = holderChanges(r.now, players(1, 1), 'm1');
  assert.deepEqual(r.passes, [{ kind: 'monarch', from: null, to: 1 }], 'after a gap, it comes from nobody');
  r = holderChanges(r.now, players(2, 2), 'm2');
  assert.deepEqual(r.passes, [], 'a new match starts over');
});

test('an emblem flies once, when it first shows up in the same match', () => {
  const emblem = (id, name) => ({ id, name: `Emblem — ${name}`, emblem: true });
  const players = list => [{ id: 1, emblems: list }, { id: 2, emblems: [] }];
  let r = holderChanges(null, players([emblem(50, 'Jace')]), 'm1');
  assert.deepEqual(r.emblems, [], 'the emblems already there when the match opens do not fly');
  r = holderChanges(r.now, players([emblem(50, 'Jace'), emblem(51, 'Chandra')]), 'm1');
  assert.deepEqual(r.emblems.map(e => [e.player, e.emblem.id]), [[1, 51]]);
  r = holderChanges(r.now, players([emblem(50, 'Jace'), emblem(51, 'Chandra')]), 'm1');
  assert.deepEqual(r.emblems, []);
});
