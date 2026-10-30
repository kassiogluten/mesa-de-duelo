import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptySeatMemory, focusedByAttack, followSeats, forcedSeatReason, manualSeatChoice, visibleSeats } from '../src/ui/seatVisibility.ts';

const card = (id, extra = {}) => ({ id, tapped: false, token: false, creature: true, ...extra });
function table() {
  const players = [10, 23, 36, 49].map(id => ({ id, name: `P${id}`, life: 40, library: 80, handCount: 7, hand: [], battlefield: [card(id * 10), card(id * 10 + 1, { creature: false, planeswalker: true })], graveyard: [], exile: [], pool: {} }));
  return { you: 10, players, combat: [], input: { gen: 1, priority: true, message: '', ok: { label: '', enabled: false }, cancel: { label: '', enabled: false }, selectable: [] } };
}

test('hidden and solo choices, never an empty table', () => {
  const s = table(), opponents = s.players.slice(1);
  assert.deepEqual([...visibleSeats(s, opponents, { hidden: new Set([23]), solo: null })], [36, 49]);
  assert.deepEqual([...visibleSeats(s, opponents, { hidden: new Set(), solo: 36 })], [36]);
  assert.deepEqual([...visibleSeats(s, opponents, { hidden: new Set([23, 36, 49]), solo: null })], [23, 36, 49]);
});

test('an opponent attacking you, or one your choice depends on, comes back on its own', () => {
  const s = table(), opponents = s.players.slice(1);
  s.combat = [{ attacker: 490, defender: 10, defenderKind: 'player', blockers: [] }];
  assert.equal(forcedSeatReason(s, s.players[3]), 'atacando você');
  assert.deepEqual([...visibleSeats(s, opponents, { hidden: new Set(), solo: 23 })], [23, 49]);
  s.combat = [{ attacker: 490, defender: 23, defenderKind: 'player', blockers: [] }];
  assert.equal(forcedSeatReason(s, s.players[3]), null, 'attacking someone else is not forced');
  s.input.selectable = [360];
  assert.equal(forcedSeatReason(s, s.players[2]), 'escolha sua');
  s.input.selectable = [];
  s.input.attacking = { attackers: [100], defenders: [{ id: 231, kind: 'card' }], legalAssignments: [] };
  assert.equal(forcedSeatReason(s, s.players[1]), 'você pode atacar');
  s.players[1].eliminated = true;
  assert.equal(forcedSeatReason(s, s.players[1]), null);
});

const shown = (s, memory) => [...visibleSeats(s, s.players.slice(1), memory)];
const follow = (s, memory) => followSeats(s, s.players.slice(1), memory);

test('an eliminated opponent hides itself once, while another opponent is still playing', () => {
  const s = table();
  s.turn = 3; s.activePlayer = 10;
  s.players[1].eliminated = true;
  let { memory, notices } = follow(s, emptySeatMemory());
  assert.deepEqual(shown(s, memory), [36, 49]);
  assert.deepEqual(notices, ['P23 saiu da partida: campo oculto.']);
  // "Mostrar campo" traz de volta, e a mesa não esconde de novo.
  memory = { ...memory, hidden: new Set() };
  ({ memory, notices } = follow(s, memory));
  assert.deepEqual(shown(s, memory), [23, 36, 49]);
  assert.deepEqual(notices, []);
});

test('"Só este" on the opponent who left goes back to the ones still playing', () => {
  const s = table();
  s.turn = 3; s.activePlayer = 10;
  s.players[2].eliminated = true;
  const { memory } = follow(s, { ...emptySeatMemory(), hidden: new Set([49]), solo: 36 });
  assert.equal(memory.solo, null);
  assert.deepEqual(shown(s, memory), [23]);
});

test('a duel never hides its only opponent, nor focuses it', () => {
  const s = table();
  s.players = s.players.slice(0, 2);
  s.turn = 2; s.activePlayer = 23;
  s.players[1].eliminated = true;
  s.combat = [{ attacker: 230, defender: 10, defenderKind: 'player', blockers: [] }];
  const { memory, notices } = follow(s, emptySeatMemory());
  assert.equal(memory.hidden.size, 0);
  assert.equal(memory.solo, null);
  assert.equal(memory.focus, null);
  assert.deepEqual(notices, []);
});

test('with every opponent eliminated nobody is hidden', () => {
  const s = table();
  s.turn = 3; s.activePlayer = 10;
  for (const p of s.players.slice(1)) p.eliminated = true;
  const { memory } = follow(s, emptySeatMemory());
  assert.equal(memory.hidden.size, 0);
});

test('an opponent attacking you gets "Só este" until the end of its turn, then the table goes back', () => {
  const s = table();
  s.turn = 5; s.activePlayer = 36;
  s.combat = [{ attacker: 360, defender: 10, defenderKind: 'player', blockers: [] }];
  let { memory, notices } = follow(s, { ...emptySeatMemory(), hidden: new Set([23]) });
  assert.equal(memory.solo, 36);
  assert.ok(focusedByAttack(memory, 36));
  assert.deepEqual(shown(s, memory), [36]);
  assert.deepEqual(notices, ['P36 está atacando você: mostrando só o campo dele.']);
  // Depois do combate, ainda no turno dele, o foco continua.
  s.combat = [];
  ({ memory } = follow(s, memory));
  assert.equal(memory.solo, 36);
  // Turno seguinte: a mesa volta como estava.
  s.turn = 6; s.activePlayer = 49;
  ({ memory, notices } = follow(s, memory));
  assert.equal(memory.solo, null);
  assert.deepEqual([...memory.hidden], [23]);
  assert.equal(memory.focus, null);
  assert.deepEqual(shown(s, memory), [36, 49]);
  assert.equal(notices.length, 1);
});

test('an attack on your planeswalker or a battle you protect also focuses; attacks between others do not', () => {
  const s = table();
  s.turn = 5; s.activePlayer = 36;
  s.combat = [{ attacker: 360, defender: 101, defenderKind: 'card', blockers: [] }];
  assert.equal(follow(s, emptySeatMemory()).memory.solo, 36);
  s.players[3].battlefield.push(card(999, { creature: false, battle: true, protector: 10 }));
  s.combat = [{ attacker: 360, defender: 999, defenderKind: 'card', blockers: [] }];
  assert.equal(follow(s, emptySeatMemory()).memory.solo, 36);
  s.combat = [{ attacker: 360, defender: 23, defenderKind: 'player', blockers: [] }];
  const { memory } = follow(s, emptySeatMemory());
  assert.equal(memory.solo, null);
  assert.equal(memory.focus, null);
});

test('a choice made during the attack stays after the turn, and the focus does not come back that turn', () => {
  const s = table();
  s.turn = 5; s.activePlayer = 36;
  s.combat = [{ attacker: 360, defender: 10, defenderKind: 'player', blockers: [] }];
  let { memory } = follow(s, { ...emptySeatMemory(), solo: 23 });
  assert.equal(memory.solo, 36);
  // O jogador toca em "Ver todos" no meio do ataque.
  memory = { ...manualSeatChoice(memory), solo: null };
  assert.ok(!focusedByAttack(memory, 36));
  ({ memory } = follow(s, memory));
  assert.equal(memory.solo, null, 'still in the same combat: no refocus');
  s.turn = 6; s.activePlayer = 49; s.combat = [];
  ({ memory } = follow(s, memory));
  assert.equal(memory.solo, null, 'the old "Só este" is not restored');
  assert.deepEqual(shown(s, memory), [23, 36, 49]);
});

test('someone eliminated during the attack stays hidden when the table goes back', () => {
  const s = table();
  s.turn = 5; s.activePlayer = 36;
  s.combat = [{ attacker: 360, defender: 10, defenderKind: 'player', blockers: [] }];
  let { memory } = follow(s, { ...emptySeatMemory(), solo: 49 });
  s.players[3].eliminated = true;
  ({ memory } = follow(s, memory));
  assert.equal(memory.solo, 36);
  s.turn = 6; s.activePlayer = 10; s.combat = [];
  ({ memory } = follow(s, memory));
  assert.equal(memory.solo, null);
  assert.deepEqual(shown(s, memory), [23, 36]);
});
