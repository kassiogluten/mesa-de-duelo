import test from 'node:test';
import assert from 'node:assert/strict';
const { opensExpanded, parseRemovalWindowMode, removalAffects, removalCause, removalNotices, removedByOwner } = await import('../src/ui/removalNotice.ts');

const YOU = 1, ANA = 2, CAIO = 3;
let seq = 0;
const ev = (type, extra = {}) => ({ seq: ++seq, type, ...extra });
const card = (id, name) => ({ id, name });
const wrath = card(30, 'Wrath of God'), bolt = card(31, 'Lightning Bolt');
const frame = (...stack) => ({ frame: { players: [], stack, turn: 3, phase: 'MAIN1', activePlayer: ANA } });
const left = (id, name, actor, extra = {}) => ev('left', { actor, card: card(id, name), from: 'Battlefield', to: 'Graveyard', reason: 'destroyed', ...extra });

test('a removal by another player, with the resolving spell sent by the bridge, becomes one notice grouped by owner', () => {
  seq = 0;
  const onWrath = { stackId: 9, sourceName: 'Wrath of God', ...frame({ id: 9, source: wrath, controller: ANA }) };
  const history = [ev('spell-cast', { actor: ANA, stackId: 9, card: wrath }),
    left(20, 'Grizzly Bears', ANA, onWrath), left(21, 'Llanowar Elves', YOU, onWrath), left(22, 'Serra Angel', YOU, onWrath),
    ev('resolved', { actor: ANA, stackId: 9, card: wrath })];
  const [notice, ...rest] = removalNotices(history, 0, YOU);
  assert.equal(rest.length, 0);
  assert.equal(notice.cause.card.name, 'Wrath of God');
  assert.equal(notice.cause.controller, ANA);
  assert.deepEqual(removedByOwner(notice, YOU).map(g => [g.owner, g.removed.map(e => e.card.name)]),
    [[YOU, ['Llanowar Elves', 'Serra Angel']], [ANA, ['Grizzly Bears']]]);
  // O que já foi visto não volta a abrir a janela.
  assert.equal(removalNotices(history, history.at(-1).seq, YOU).length, 0);
});

test('your own removals do not open the notice, but another player removing a third player\'s permanent does', () => {
  seq = 0;
  const mine = { stackId: 4, ...frame({ id: 4, source: card(40, 'Murder'), controller: YOU }) };
  const anas = { stackId: 5, ...frame({ id: 5, source: card(41, 'Murder'), controller: ANA }) };
  const history = [left(20, 'Grizzly Bears', ANA, mine), left(21, 'Hill Giant', CAIO, anas)];
  const notices = removalNotices(history, 0, YOU);
  assert.deepEqual(notices.map(n => [n.cause.stackId, n.removed.map(e => e.card.name)]), [[5, ['Hill Giant']]]);
});

test('a creature killed by damage leaves after the spell resolved: the cause is that resolution', () => {
  seq = 0;
  const history = [ev('spell-cast', { actor: ANA, stackId: 7, card: bolt }),
    ev('damage', { actor: ANA, card: bolt, targets: { cards: [20] }, delta: -3, ...frame({ id: 7, source: bolt, controller: ANA }) }),
    ev('resolved', { actor: ANA, stackId: 7, card: bolt }),
    left(20, 'Llanowar Elves', YOU, frame({ id: 8, source: card(50, 'Divination'), controller: YOU }))];
  const cause = removalCause(history, 3);
  assert.equal(cause.stackId, 7);
  assert.equal(cause.card.name, 'Lightning Bolt');
  assert.equal(cause.controller, ANA);
});

test('combat deaths, costs and blinks are not removals', () => {
  seq = 0;
  const combat = [ev('attackers', { actor: ANA, cards: [60] }), ev('resolved', { actor: ANA, stackId: 3, card: card(61, 'Giant Growth') }),
    ev('damage', { actor: ANA, combat: true, card: card(60, 'Hill Giant'), targets: { cards: [20] }, delta: -3 }), left(20, 'Llanowar Elves', YOU)];
  assert.equal(removalCause(combat, 3), null);
  // Sacrificar para ativar: nada resolvendo e nada que acabou de resolver.
  const cost = [ev('turn', { actor: ANA, turn: 4 }), left(21, 'Food', ANA, { reason: 'sacrificed' }), ev('ability-activated', { actor: ANA, stackId: 2, card: card(21, 'Food') })];
  assert.equal(removalCause(cost, 1), null);
  const blinkCause = { stackId: 6, ...frame({ id: 6, source: card(62, 'Ephemerate'), controller: ANA }) };
  const blink = [left(22, 'Soul Warden', YOU, { to: 'Exile', reason: undefined, ...blinkCause }), ev('entered', { actor: YOU, card: card(22, 'Soul Warden'), from: 'Exile', to: 'Battlefield' })];
  assert.equal(removalNotices(blink, 0, YOU).length, 0);
});

test('without the stack in the frame, the controller comes from the cast', () => {
  seq = 0;
  const history = [ev('spell-cast', { actor: ANA, stackId: 9, card: wrath }), left(20, 'Llanowar Elves', YOU, { stackId: 9, sourceName: 'Wrath of God' })];
  const [notice] = removalNotices(history, 0, YOU);
  assert.equal(notice.cause.controller, ANA);
  assert.equal(notice.cause.card.name, 'Wrath of God');
});

test('in the mixed mode only a mass removal of your cards, or one the table did not show, opens the whole window', () => {
  const notice = (...removed) => ({ key: 'rm', cause: { stackId: 1, controller: ANA }, removed: removed.map(([actor, token]) => ({ seq: ++seq, type: 'left', actor, card: { id: seq, name: 'x', token } })) });
  const mass = notice([YOU], [ANA]), single = notice([YOU]), theirs = notice([ANA], [CAIO]), tokens = notice([YOU, true], [YOU, true]);
  assert.equal(opensExpanded(mass, YOU, 'mixed', false), true);
  assert.equal(opensExpanded(single, YOU, 'mixed', false), false, 'one card of yours goes to the strip');
  assert.equal(opensExpanded(single, YOU, 'mixed', true), true, 'unless the table did not show it');
  assert.equal(opensExpanded(theirs, YOU, 'mixed', true), false, 'between opponents goes to the strip');
  assert.equal(opensExpanded(tokens, YOU, 'mixed', true), false, 'tokens alone do not count');
  assert.equal(opensExpanded(single, YOU, 'max', false), true);
  assert.equal(opensExpanded(mass, YOU, 'min', true), false);
  assert.equal(removalAffects(tokens, YOU), true);
  assert.equal(removalAffects(theirs, YOU), false);
  assert.deepEqual(['min', 'max', 'mixed', null, 'x'].map(parseRemovalWindowMode), ['min', 'max', 'mixed', 'mixed', 'mixed']);
});

test('the timeline tells whether a removal has its step on the table or was caught up silently', async () => {
  const { PresentationTimeline } = await import('../src/ui/presentationTimeline.ts');
  const timeline = new PresentationTimeline();
  timeline.ingest('m', [{ seq: 1, type: 'turn', actor: ANA, turn: 2 }]);
  const shown = { seq: 2, type: 'left', actor: YOU, card: card(40, 'Llanowar Elves'), from: 'Battlefield', to: 'Graveyard' };
  timeline.ingest('m', [shown]);
  assert.equal(timeline.shows(2), true);
  timeline.ingest('m', [{ ...shown, seq: 3, card: card(41, 'Serra Angel') }], { silent: true });
  assert.equal(timeline.shows(3), false, 'caught up silently (hidden tab)');
});
