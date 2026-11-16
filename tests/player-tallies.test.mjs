import test from 'node:test';
import assert from 'node:assert/strict';

const { tallyGains } = await import('../src/ui/playerTallies.ts');
const { faceTurns, createFaceWatch } = await import('../src/ui/faceTurns.ts');

const players = (...counters) => counters.map((c, i) => ({ id: i + 1, counters: c }));

test('a player counter gets its 3D object only when it goes up in the same match', () => {
  let r = tallyGains(null, players({ POISON: 3 }, {}), 'm1');
  assert.deepEqual(r.gains, [], 'opening a match in progress drops nothing');
  r = tallyGains(r.now, players({ POISON: 3 }, {}), 'm1');
  assert.deepEqual(r.gains, []);
  r = tallyGains(r.now, players({ POISON: 5, ENERGY: 2 }, { EXPERIENCE: 1, RAD: 4, TICKET: 1 }), 'm1');
  assert.deepEqual(r.gains, [
    { player: 1, kind: 'poison', counter: 'POISON', gained: 2, total: 5, level: 0 },
    { player: 1, kind: 'energy', counter: 'ENERGY', gained: 2, total: 2, level: 0 },
    { player: 2, kind: 'experience', counter: 'EXPERIENCE', gained: 1, total: 1, level: 0 },
    { player: 2, kind: 'rad', counter: 'RAD', gained: 4, total: 4, level: 0 },
  ], 'tickets and other counters have no object');
  r = tallyGains(r.now, players({ POISON: 5, ENERGY: 0 }, { RAD: 2 }), 'm1');
  assert.deepEqual(r.gains, [], 'spending or losing counters drops nothing');
  r = tallyGains(r.now, players({ POISON: 6, ENERGY: 1 }, undefined), 'm2');
  assert.deepEqual(r.gains, [], 'a new match starts over');
});

test('the poison flask grows near the limit and again when it kills', () => {
  let r = tallyGains(null, players({ POISON: 6 }), 'm');
  r = tallyGains(r.now, players({ POISON: 7 }), 'm');
  assert.equal(r.gains[0].level, 1);
  r = tallyGains(r.now, players({ POISON: 9 }), 'm');
  assert.equal(r.gains[0].level, 1);
  r = tallyGains(r.now, players({ POISON: 10 }), 'm');
  assert.equal(r.gains[0].level, 2);
  r = tallyGains(tallyGains(null, players({ ENERGY: 9 }), 'm').now, players({ ENERGY: 12 }), 'm');
  assert.equal(r.gains[0].level, 0, 'only poison has a limit');
});

test('a permanent turns when it stays on the battlefield with another face', () => {
  const before = new Map([[1, 'Delver of Secrets'], [2, ''], [3, 'Grizzly Bears'], [4, 'Clone'], [5, 'Island']]);
  const now = new Map([[1, 'Insectile Aberration'], [2, 'Akroma, Angel of Fury'], [3, ''], [4, 'Serra Angel'], [5, 'Island'], [6, 'Forest']]);
  assert.deepEqual(faceTurns(before, now), [1, 2, 3, 4], 'transformed, turned face up, turned face down and became a copy; the new one and the unchanged one do not');
});

test('the face watch only compares drawings of the same match and says when day and night turned along', () => {
  const field = (...cards) => [{ battlefield: cards.map(([id, name, faceDown]) => ({ id, name, faceDown })) }];
  const watch = createFaceWatch();
  assert.deepEqual(watch.see(field([1, 'Village Ironsmith']), 'm1', 'day').turned, [], 'first drawing only records');
  let seen = watch.see(field([1, 'Ironfang'], [2, 'Forest']), 'm1', 'night');
  assert.deepEqual([seen.turned, seen.flat, [...seen.onField]], [[1], true, [1, 2]], 'day became night in the same drawing');
  seen = watch.see(field([1, 'Ironfang'], [2, undefined, true]), 'm1', 'night');
  assert.deepEqual([seen.turned, seen.flat], [[2], false]);
  seen = watch.see(field([1, 'Village Ironsmith']), 'm2', 'night');
  assert.deepEqual(seen.turned, [], 'a new match starts over');
});
