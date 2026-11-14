// Momentos grandes (item 131): quais jogadas ganham a cena, a cor da luz de cada carta e de cada arte, e o selo da decisão esperando a fila.
import test from 'node:test';
import assert from 'node:assert/strict';
const { manaValueOf, bigSpell, legendaryEntry, BIG_SPELL } = await import('../src/ui/impactRules.ts');
const { impactOf, cardLight } = await import('../src/ui/motionImpact.ts');
const { vividAverage } = await import('../src/ui/ambienceScene.ts');
const { presentationDuration } = await import('../src/ui/presentationTimeline.ts');
const { buttons } = await import('../src/ui/actionPanel.ts');

const event = (type, extra = {}) => ({ seq: 1, type, ...extra });

test('mana value counts generic, colored and hybrid symbols, and X as zero', () => {
  assert.equal(manaValueOf('{4}{G}{G}'), 6);
  assert.equal(manaValueOf('{X}{R}{R}'), 2);
  assert.equal(manaValueOf('{2/W}{2/W}{2/W}'), 6);
  assert.equal(manaValueOf('{1}{U} // {3}{U}{U}'), 2, 'only the front face');
  assert.equal(manaValueOf(''), 0);
});

test('big spells, ultimates, lethal hits on a player and legendary arrivals are the big moments', () => {
  assert.equal(BIG_SPELL, 6);
  assert.equal(impactOf(event('spell-cast', { card: { manaCost: '{4}{G}{G}' } })), 'big-spell');
  assert.equal(impactOf(event('spell-cast', { card: { manaCost: '{3}{G}{G}' } })), null, 'value 5 is not big');
  assert.equal(impactOf(event('ability-activated', { ultimate: true })), 'ultimate');
  assert.equal(impactOf(event('damage', { lethal: true, targets: { players: [2] } })), 'lethal');
  assert.equal(impactOf(event('damage', { lethal: true, targets: { cards: [7] } })), null, 'a creature dying is not a big moment');
  assert.equal(impactOf(event('damage', { lethal: true, prevented: true, targets: { players: [2] } })), null);
  const legend = event('entered', { card: { typeLine: 'Legendary Creature — Dog', creature: true } });
  assert.equal(impactOf(legend), 'legend');
  assert.equal(legendaryEntry({ ...legend, repeat: true }), false, 'a repeated blink stays short');
  assert.equal(legendaryEntry(event('entered', { card: { typeLine: 'Legendary Artifact' } })), false);
  assert.equal(legendaryEntry(event('entered', { card: { typeLine: 'Legendary Planeswalker — Jace', planeswalker: true } })), true);
  // A fila dá tempo para a cena.
  assert.ok(presentationDuration(legend, false) >= 700);
  assert.ok(bigSpell(event('spell-cast', { card: { manaCost: '{6}' } })));
  assert.ok(presentationDuration(event('spell-cast', { card: { manaCost: '{6}' } }), false) > presentationDuration(event('spell-cast', { card: { manaCost: '{1}' } }), false));
});

test('the light of a card is the mix of its colors, gold when colorless', () => {
  assert.deepEqual(cardLight({ manaCost: '{R}' }), [1, .45, .3]);
  assert.deepEqual(cardLight({ manaCost: '{3}' }), [1, .8, .45]);
  const gruul = cardLight({ manaCost: '{R}{G}' });
  assert.ok(gruul[1] > .45 && gruul[1] < .9, 'red and green mix');
});

test('the deck color of an art weighs the vivid pixels and ignores gray', () => {
  const px = (...colors) => colors.flatMap(([r, g, b]) => [r, g, b, 255]);
  const green = vividAverage(px([20, 160, 40], [128, 128, 128], [120, 120, 120], [10, 10, 10]));
  assert.ok(green && green[1] > green[0] && green[1] > green[2], 'green wins over the gray');
  assert.ok(Math.abs(Math.max(...green) - .95) < 1e-9, 'brightened to the same strength');
  assert.equal(vividAverage(px([128, 128, 128], [40, 40, 40])), null, 'no color, no tone');
});

test('a decision waiting for the queue shows whose play is being shown, in the button', () => {
  const view = { findCard: () => undefined, playerName: () => 'Ana', observing: false, disconnected: false, clickLocked: () => false,
    passLevel: 'acoes', passLevelSupported: true, passingTurn: false, passPending: false, passMenuOpen: false, attackAll: false, attackSelecting: 0, attackBusy: false };
  const s = { type: 'state', you: 0, turn: 3, activePlayer: 1, gameOver: false, stack: [], combat: [],
    players: [{ id: 0, name: 'Você', battlefield: [], hand: [] }, { id: 1, name: 'Ana', battlefield: [], hand: [] }],
    input: { gen: -1, selectable: [], ok: { enabled: false, label: '' }, cancel: { enabled: false, label: '' }, message: '' } };
  assert.match(buttons({ ...view, showing: 'Mostrando a jogada de Ana…' }, s), /class="arena-btn waiting showing" disabled>Mostrando a jogada de Ana…/);
  assert.match(buttons(view, s), /Oponente jogando…/);
});
