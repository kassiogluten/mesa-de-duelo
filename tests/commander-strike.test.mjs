import test from 'node:test';
import assert from 'node:assert/strict';
import { commanderCounterChange, countsAttr, countsOf, COMMANDER_LIMIT, COMMANDER_NEAR } from '../src/ui/commanderCounter.ts';
import { stateWithFrame } from '../src/ui/presentationTimeline.ts';
import { damageButton } from '../src/ui/seatView.ts';

const PROSSH = 40, ISAMARU = 41;
const fakeEl = attr => ({ dataset: { commanderDamage: attr } });

test('the counter keeps the damage of each commander, and reads it back', () => {
  const attr = countsAttr([{ commanderId: PROSSH, damage: 13 }, { commanderId: ISAMARU, damage: 0 }]);
  assert.equal(attr, '40:13,41:0');
  assert.deepEqual([...countsOf(fakeEl(attr))], [[PROSSH, 13], [ISAMARU, 0]]);
  assert.equal(countsOf(null).size, 0);
  assert.equal(countsOf(fakeEl('')).size, 0);
});

test('the counter rolls from the highest before the strike to the highest after it', () => {
  // A mesa desenhou o quadro do golpe: 13 do Prossh (já com os 5 deste golpe).
  const change = commanderCounterChange(new Map([[PROSSH, 13], [ISAMARU, 0]]), { sourceId: PROSSH, commanderTotal: 13, delta: -5 });
  assert.deepEqual(change, { before: 8, after: 13, total: 13, previous: 8, hit: 5, lethal: false });
  // Outro comandante já tem mais: o contador (o maior) não muda, mas o golpe ainda conta.
  const behind = commanderCounterChange(new Map([[PROSSH, 6], [ISAMARU, 12]]), { sourceId: PROSSH, commanderTotal: 6, delta: -3 });
  assert.equal(behind.before, 12); assert.equal(behind.after, 12);
  // O primeiro golpe: antes não havia contador.
  assert.equal(commanderCounterChange(new Map(), { sourceId: PROSSH, commanderTotal: 4, delta: -4 }).before, 0);
  // Comandante fundido: conta pela carta de verdade, não pela fonte.
  assert.equal(commanderCounterChange(new Map([[PROSSH, 9]]), { sourceId: 99, commanderId: PROSSH, commanderTotal: 9, delta: -2 }).before, 7);
  // Sem o total no evento (servidor antigo), nada a rolar.
  assert.equal(commanderCounterChange(new Map(), { sourceId: PROSSH, delta: -2 }), null);
});

test('only the strike that takes one commander to 21 is lethal', () => {
  assert.equal(commanderCounterChange(new Map(), { sourceId: PROSSH, commanderTotal: 21, delta: -5 }).lethal, true);
  assert.equal(commanderCounterChange(new Map(), { sourceId: PROSSH, commanderTotal: 20, delta: -5 }).lethal, false);
  assert.equal(commanderCounterChange(new Map(), { sourceId: PROSSH, commanderTotal: 26, delta: -5 }).lethal, false, 'já estava em 21');
  assert.equal(COMMANDER_LIMIT, 21);
});

test('the counter carries the damage of each commander and goes on alert from 15', () => {
  const p = d => ({ id: 2, name: 'Ana', commanderDamage: [{ commanderId: PROSSH, damage: d }, { commanderId: ISAMARU, damage: 3 }] });
  assert.equal(damageButton({ id: 2, name: 'Ana', commanderDamage: [{ commanderId: PROSSH, damage: 0 }] }), '');
  const calm = damageButton(p(COMMANDER_NEAR - 1));
  assert.match(calm, /data-commander-damage="40:14,41:3"/);
  assert.match(calm, /<b>14\/21<\/b>/);
  assert.doesNotMatch(calm, /danger/);
  assert.match(damageButton(p(COMMANDER_NEAR)), /class="commander-damage danger"/);
});

test('the frame of each step carries the commander damage of that moment', () => {
  const state = { input: { gen: 1, priority: false, ok: { enabled: false }, cancel: { enabled: false }, selectable: [] }, players: [{ id: 2, name: 'Ana', life: 30, commanderDamage: [{ commanderId: PROSSH, damage: 18 }] }], stack: [] };
  const frame = { turn: 4, phase: 'COMBAT_DAMAGE', activePlayer: 1, stack: [], players: [{ id: 2, life: 35, battlefield: [], handCount: 3, library: 50, commanderDamage: [{ commanderId: PROSSH, damage: 13 }] }] };
  const shown = stateWithFrame(state, frame);
  assert.equal(shown.players[0].commanderDamage[0].damage, 13);
});
