import test from 'node:test';
import assert from 'node:assert/strict';

const { dungeonSteps } = await import('../src/ui/dungeonSteps.ts');
const { plaqueHTML } = await import('../src/ui/dungeonPlaque.ts');

const room = (name, ...next) => ({ name, text: `${name} effect.`, next });
const undercity = (at) => ({
  id: 9, name: 'Undercity', room: at,
  rooms: [room('Secret Entrance', 'Forge', 'Lost Well'), room('Forge', 'Trap!', 'Arena'), room('Lost Well', 'Arena', 'Stash'), room('Trap!', 'Archives'),
    room('Arena', 'Archives', 'Catacombs'), room('Stash', 'Catacombs'), room('Archives', 'Throne of the Dead Three'), room('Catacombs', 'Throne of the Dead Three'), room('Throne of the Dead Three')],
});
const seats = (...ps) => ps.map((p, i) => ({ id: i + 1, ...p }));

test('a plaque shows only when a player enters a new room in the same match', () => {
  let r = dungeonSteps(null, seats({ dungeon: undercity('Forge') }, {}), 'm1');
  assert.deepEqual(r.steps, [], 'opening a match in progress shows nothing');
  r = dungeonSteps(r.now, seats({ dungeon: undercity('Forge') }, {}), 'm1');
  assert.deepEqual(r.steps, [], 'staying in the same room shows nothing');
  r = dungeonSteps(r.now, seats({ dungeon: undercity('Arena') }, { dungeon: undercity(undefined) }), 'm1');
  assert.deepEqual(r.steps, [{ player: 1, kind: 'room', name: 'Undercity', room: 'Arena', step: 3, total: 5 }], 'a dungeon not yet entered has no room');
  r = dungeonSteps(r.now, seats({ dungeon: undercity('Arena') }, { dungeon: undercity('Secret Entrance') }), 'm1');
  assert.deepEqual(r.steps, [{ player: 2, kind: 'room', name: 'Undercity', room: 'Secret Entrance', step: 1, total: 5 }], 'entering is step 1');
  r = dungeonSteps(r.now, seats({ dungeon: undercity('Arena') }, {}), 'm2');
  assert.deepEqual(r.steps, [], 'a new match only records');
});

test('completing a dungeon gives the gold plaque, and the next dungeon starts over', () => {
  let r = dungeonSteps(null, seats({ dungeon: undercity('Throne of the Dead Three') }), 'm1');
  r = dungeonSteps(r.now, seats({ completedDungeons: ['Undercity'] }), 'm1');
  assert.deepEqual(r.steps, [{ player: 1, kind: 'done', name: 'Undercity' }]);
  r = dungeonSteps(r.now, seats({ completedDungeons: ['Undercity'], dungeon: { ...undercity('Secret Entrance'), id: 12 } }), 'm1');
  assert.deepEqual(r.steps.map(s => [s.kind, s.room, s.step]), [['room', 'Secret Entrance', 1]], 'the same room in another dungeon is a new step');
});

test('the plaque says where the player went and lights the new step', () => {
  const html = plaqueHTML({ player: 1, kind: 'room', name: 'Undercity', room: 'Arena', step: 3, total: 5 });
  assert.match(html, /Undercity · passo 3 de 5/);
  assert.match(html, /<strong>Arena<\/strong>/);
  assert.equal(html.match(/<i class="on"><\/i>/g)?.length, 2, 'the steps already walked');
  assert.equal(html.match(/<i class="on new">/g)?.length, 1, 'the new step');
  assert.equal(html.match(/<i>/g)?.length, 2, 'the steps ahead');
  assert.match(plaqueHTML({ player: 1, kind: 'done', name: 'Tomb of Annihilation' }), /Masmorra completa<\/span><strong>Tomb of Annihilation<\/strong>/);
});
