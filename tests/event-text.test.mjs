import test from 'node:test';
import assert from 'node:assert/strict';
const { eventDescription, targetsDescription, frameCard } = await import('../src/ui/eventText.ts');

const cards = { 10: { id: 10, name: 'Grizzly Bears', creature: true }, 11: { id: 11, name: 'Forest', land: true } };
const view = {
  state: () => ({ you: 0, players: [{ id: 0, name: 'Você' }, { id: 1, name: 'Ana' }] }),
  label: c => c.name,
  findCard: id => cards[id],
  ptName: name => (name === 'Shock' ? 'Choque' : undefined),
};

test('plays and casts say who did it and, in the history, where the card came from and what it targets', () => {
  assert.equal(eventDescription(view, { type: 'land-played', actor: 1, card: { name: 'Forest' } }), 'Ana jogou Forest.');
  const cast = { type: 'spell-cast', actor: 1, card: { name: 'Shock' }, from: 'Graveyard', targets: { players: [0], cards: [10] } };
  assert.equal(eventDescription(view, cast), 'Ana conjurou Shock.');
  assert.equal(eventDescription(view, cast, true), 'Ana conjurou Shock do cemitério em você e Grizzly Bears.');
});

test('mill lists the cards and the source in Portuguese; attacks say who is attacked and with how many', () => {
  const mill = { type: 'mill', actor: 1, sourceName: 'Shock', milled: [{ name: 'Forest' }, { name: 'Island' }] };
  assert.equal(eventDescription(view, mill), 'Ana moeu 2 cartas com Choque: Forest e Island.');
  assert.equal(eventDescription(view, { type: 'attackers', actor: 0, targets: { players: [1] }, cards: [10, 12] }), 'Você ataca Ana com 2 criaturas.');
});

test('damage, prevented damage and unknown events read naturally', () => {
  assert.equal(eventDescription(view, { type: 'damage', delta: -3, targets: { players: [1] }, card: { name: 'Shock' } }), 'Ana sofreu 3 de dano de Shock.');
  assert.equal(eventDescription(view, { type: 'damage', delta: -2, prevented: true, targets: { cards: [10] } }), 'Escudo preveniu 2 de dano a Grizzly Bears.');
  assert.equal(eventDescription(view, { type: 'whatever' }), 'O jogo avançou.');
});

test('targets of a stack item and cards that already left the battlefield', () => {
  assert.equal(targetsDescription(view, { cards: [10], players: [1] }), 'Alvos: Grizzly Bears, Ana');
  assert.equal(targetsDescription(view, undefined), '');
  const gone = { id: 99, name: 'Llanowar Elves' };
  assert.equal(frameCard(99, { frame: { players: [{ battlefield: [gone] }], stack: [] } }), gone);
});
