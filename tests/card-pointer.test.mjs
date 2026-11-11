// Apontar uma carta para a mesa: só cartas que todos veem, só para quem joga com outra pessoa na mesa.
import test from 'node:test';
import assert from 'node:assert/strict';
const { publicSpot, canPoint } = await import('../src/ui/cardPointer.ts');

const player = (id, extra = {}) => ({ id, name: `J${id}`, ai: false, life: 40, hand: [], battlefield: [], graveyard: [], exile: [], ...extra });
const card = (id, name = `Carta ${id}`) => ({ id, name });
const state = (extra = {}) => ({
  you: 1, players: [
    player(1, { hand: [card(10)], battlefield: [card(11)], graveyard: [card(12)], commandZone: [card(13)] }),
    player(2, { exile: [card(20)], battlefield: [card(21)] }),
  ],
  stack: [{ id: 900, text: 'Contramágica', source: card(30), controller: 2 }],
  ...extra,
});

test('acha a carta em cada zona que todos veem, com o dono da zona', () => {
  const s = state();
  assert.deepEqual([11, 12, 13, 20, 21].map(id => { const p = publicSpot(s, id); return [p.zone, p.player]; }),
    [['battlefield', 1], ['graveyard', 1], ['command', 1], ['exile', 2], ['battlefield', 2]]);
  assert.deepEqual({ ...publicSpot(s, 30), card: undefined }, { zone: 'stack', player: 2, card: undefined, stackId: 900 });
});

test('a mão não é pública: não dá para apontar', () => {
  assert.equal(publicSpot(state(), 10), undefined);
  assert.equal(canPoint(state(), 10), false);
});

test('só quem joga, com outra pessoa na mesa e a partida em andamento', () => {
  assert.equal(canPoint(state(), 21), true);
  assert.equal(canPoint(state({ watching: true }), 21), false);
  assert.equal(canPoint(state({ gameOver: true }), 21), false);
  const vsAi = state(); vsAi.players[1].ai = true;
  assert.equal(canPoint(vsAi, 21), false);
  // Eliminado no Commander ainda aponta para quem continua.
  assert.equal(canPoint(state({ spectating: true }), 21), true);
  assert.equal(canPoint(null, 21), false);
});
