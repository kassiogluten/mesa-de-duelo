import test from 'node:test';
import assert from 'node:assert/strict';
import { damageSweep, sameSweep, sweepCause, sweepDuration, sweepOutcome, sweepStyle, SWEEP_MIN } from '../src/ui/boardSweep.ts';
import { PresentationTimeline, presentationDuration } from '../src/ui/presentationTimeline.ts';
import { eventDescription } from '../src/ui/eventText.ts';

const ANA = 1, YOU = 2;
let seq = 0;
const ev = (type, extra = {}) => ({ seq: ++seq, type, ...extra });
const card = (id, name, extra = {}) => ({ id, name, ...extra });
const wrath = card(30, 'Wrath of God', { manaCost: '{2}{W}{W}' }), pyro = card(31, 'Pyroclasm', { manaCost: '{1}{R}' }), arc = card(32, 'Arc Lightning', { manaCost: '{2}{R}' });
const left = (id, actor, extra = {}) => ev('left', { actor, card: card(id, `Criatura ${id}`), from: 'Battlefield', to: 'Graveyard', reason: 'destroyed', ...extra });

test('the leaves of one resolution share a cause; the deaths after a damage spell take that resolution as the cause', () => {
  seq = 0;
  const history = [ev('spell-cast', { actor: ANA, stackId: 9, card: wrath }),
    left(20, ANA, { stackId: 9 }), left(21, YOU, { stackId: 9 }), left(22, YOU, { stackId: 9 }), ev('resolved', { actor: ANA, stackId: 9, card: wrath })];
  assert.equal(sweepCause(history, history[1]).stackId, 9);
  assert.equal(sweepCause(history, history[1]).controller, ANA);
  assert.ok([1, 2, 3].every(i => sameSweep(history, 9)(history[i])));
  const burn = [ev('spell-cast', { actor: YOU, stackId: 4, card: pyro }), ev('damage', { actor: YOU, card: pyro, sourceId: 31, targets: { cards: [40] }, delta: -2 }),
    ev('resolved', { actor: YOU, stackId: 4, card: pyro }), left(40, ANA)];
  assert.equal(sweepCause(burn, burn[3]).card.name, 'Pyroclasm');
  // Morte em combate não tem causa: não vira limpa campo.
  const combat = [ev('damage', { combat: true, actor: YOU, sourceId: 50, targets: { cards: [41] }, delta: -3 }), left(41, ANA)];
  assert.equal(sweepCause(combat, combat[1]), null);
});

test('a damage sweep hits at least three creatures without having targeted them', () => {
  seq = 0;
  const hits = (source, ids) => ids.map(id => ev('damage', { actor: YOU, card: source, sourceId: source.id, targets: { cards: [id] }, delta: -2 }));
  const cast = ev('spell-cast', { actor: YOU, stackId: 4, card: pyro, targets: { cards: [], players: [] } });
  const sweep = hits(pyro, [40, 41, 42]);
  assert.equal(SWEEP_MIN, 3);
  assert.equal(damageSweep([cast, ...sweep], sweep), true);
  assert.equal(damageSweep([cast, ...sweep], sweep.slice(0, 2)), false, 'two creatures are not a sweep');
  // Arc Lightning dividido entre três alvos escolhidos continua com os projéteis.
  const aimed = ev('spell-cast', { actor: YOU, stackId: 5, card: arc, targets: { cards: [40, 41, 42], players: [] } });
  const divided = hits(arc, [40, 41, 42]);
  assert.equal(damageSweep([aimed, ...divided], divided), false);
  const combat = [40, 41, 42].map(id => ev('damage', { combat: true, actor: YOU, sourceId: 60, targets: { cards: [id] }, delta: -2 }));
  assert.equal(damageSweep(combat, combat), false);
});

test('the wave takes the color of the spell: one color, several (gold) or none (silver)', () => {
  assert.deepEqual([wrath, { manaCost: '{2}{B}{B}' }, { manaCost: '{4}{W}{B}' }, { manaCost: '{X}' }, undefined, { manaCost: '{2}{W/U}' }].map(sweepStyle), ['W', 'B', 'M', 'C', 'C', 'M']);
});

test('the sweep text says what happened to the permanents, and the step lasts the wave plus the exits', () => {
  seq = 0;
  assert.equal(sweepOutcome([left(1, ANA), left(2, YOU), left(3, YOU)]), '3 permanentes destruídas');
  assert.equal(sweepOutcome([left(1, ANA, { reason: undefined, to: 'Hand' }), left(2, YOU, { reason: undefined, to: 'Hand' })]), '2 permanentes devolvidas à mão');
  assert.equal(sweepOutcome([left(1, ANA), left(2, YOU, { reason: undefined, to: 'Exile' })]), '2 permanentes saíram do campo');
  const v = { state: () => null, label: c => c.name, findCard: () => undefined, ptName: () => undefined };
  const events = [left(1, ANA), left(2, YOU), left(3, YOU)];
  const shown = { ...events[0], sweep: { events, cause: wrath, controller: ANA, wave: true } };
  assert.equal(eventDescription(v, shown), 'Wrath of God: 3 permanentes destruídas.');
  const burn = [40, 41, 42].map(id => ev('damage', { card: pyro, sourceId: 31, targets: { cards: [id] }, delta: -2 }));
  assert.equal(eventDescription(v, { ...burn[0], sweep: { events: burn, cause: pyro, wave: true } }), 'Pyroclasm: 2 de dano em 3 criaturas.');
  assert.equal(presentationDuration(shown, 1), 2000);
  assert.equal(presentationDuration(shown, true), sweepDuration(shown.sweep, .6));
  assert.ok(presentationDuration({ ...shown, sweep: { ...shown.sweep, wave: false } }, 1) < 2000, 'the deaths after a damage sweep are quicker');
  assert.ok(presentationDuration(shown, .35) >= 1300, 'a crowded queue does not hide the wave');
});

test('takeWhile with a minimum takes nothing when too few follow', () => {
  seq = 0;
  const timeline = new PresentationTimeline();
  timeline.ingest('m', [ev('turn', { actor: YOU })]);
  timeline.ingest('m', [left(1, ANA, { stackId: 9 }), left(2, ANA, { stackId: 9 }), ev('resolved', { stackId: 9, card: wrath })]);
  timeline.advance();
  assert.deepEqual(timeline.takeWhile(e => e.type === 'left', 2), []);
  assert.equal(timeline.takeWhile(e => e.type === 'left', 1).length, 1);
  assert.equal(timeline.queued, 1);
});
