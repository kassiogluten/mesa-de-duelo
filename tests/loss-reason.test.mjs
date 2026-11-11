// O motivo da eliminação: o texto de cada GameLossReason e o aviso que sai uma vez só, na hora.
import test from 'node:test';
import assert from 'node:assert/strict';
const { lossReasonText, eliminationNotices } = await import('../src/ui/lossReason.ts');
const { gameResult } = await import('../src/ui/resultView.ts');

const player = (id, extra = {}) => ({ id, name: `J${id}`, life: 40, hand: [], battlefield: [], graveyard: [], exile: [], ...extra });

test('cada motivo vira uma frase para o jogador', () => {
  const atraxa = player(2, { commanders: [{ id: 50, name: 'Atraxa, Praetors\' Voice' }] });
  const s = { players: [atraxa] };
  assert.equal(lossReasonText(s, player(1, { lossReason: 'LifeReachedZero' }), true), 'sua vida chegou a 0');
  assert.equal(lossReasonText(s, player(1, { lossReason: 'LifeReachedZero' }), false), 'a vida chegou a 0');
  assert.equal(lossReasonText(s, player(1, { lossReason: 'CommanderDamage', commanderDamage: [{ commanderId: 50, damage: 23 }] }), false),
    '23 de dano de comandante de Atraxa, Praetors\' Voice');
  assert.equal(lossReasonText(s, player(1, { lossReason: 'CommanderDamage', commanderDamage: [{ commanderId: 50, damage: 21 }] }), false, () => 'Atraxa'),
    '21 de dano de comandante de Atraxa');
  assert.equal(lossReasonText(s, player(1, { lossReason: 'Poisoned', counters: { POISON: 11 } }), true), '11 marcadores de veneno');
  assert.match(lossReasonText(s, player(1, { lossReason: 'Milled' }), true), /sem cartas no grimório/);
  assert.equal(lossReasonText(s, player(1, { lossReason: 'SpellEffect', lossCard: 'Door to Nothingness' }), true), 'efeito de Door to Nothingness');
  assert.equal(lossReasonText(s, player(1, { lossReason: 'OpponentWon', lossWinner: 'Ana', lossCard: "Thassa's Oracle" }), true), "Ana venceu com Thassa's Oracle");
  assert.equal(lossReasonText(s, player(1, { lossReason: 'Conceded' }), false), 'desistiu');
  assert.equal(lossReasonText(s, player(1, {}), true), null);
});

test('o aviso sai uma vez, só para quem acabou de ser eliminado, e não ao reconectar', () => {
  const known = new Map();
  const alive = { you: 1, gameOver: false, players: [player(1), player(2), player(3, { eliminated: true, lossReason: 'Poisoned' })] };
  assert.deepEqual(eliminationNotices(alive, 'm:1', known), []);
  const out = { ...alive, players: [player(1), player(2, { eliminated: true, lossReason: 'LifeReachedZero' }), alive.players[2]] };
  assert.deepEqual(eliminationNotices(out, 'm:1', known), ['J2 foi eliminado: a vida chegou a 0.']);
  assert.deepEqual(eliminationNotices(out, 'm:1', known), []);
  const me = { ...out, players: [player(1, { eliminated: true, lossReason: 'LifeReachedZero' }), ...out.players.slice(1)] };
  assert.deepEqual(eliminationNotices(me, 'm:1', known), ['Você foi eliminado: sua vida chegou a 0.']);
});

test('a Derrota diz o motivo numa linha própria', () => {
  const s = { turn: 9, winner: 'J2', you: 1, gameOver: true, players: [player(1, { eliminated: true, lossReason: 'LifeReachedZero' }), player(2)] };
  const result = gameResult(s);
  assert.equal(result.title, 'Derrota');
  assert.match(result.detail, /<br>Eliminado: sua vida chegou a 0\.$/);
});
