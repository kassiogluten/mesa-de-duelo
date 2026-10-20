import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forcedSeatReason, visibleSeats } from '../src/ui/seatVisibility.ts';

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
