import test from 'node:test';
import assert from 'node:assert/strict';
const { retryWithDelays, RECONNECT_DELAYS } = await import('../src/app/retry.ts');
const { isFreshMatch } = await import('../src/app/matchWiring.ts');
const { startupLinks } = await import('../src/app/startupLinks.ts');
const { forgeDeck, matchOwner } = await import('../src/app/matchDecks.ts');

const noWait = () => Promise.resolve();

test('retry stops on success, when the match changes, or after the last delay', async () => {
  const tries = [];
  assert.equal(await retryWithDelays([1, 2, 3], { alive: () => true, onTry: n => tries.push(n), attempt: async () => tries.length === 2 }, noWait), 'done');
  assert.deepEqual(tries, [1, 2]);
  let alive = true;
  assert.equal(await retryWithDelays([1, 2, 3], { alive: () => alive, onTry: () => {}, attempt: async () => { alive = false; return false; } }, noWait), 'stopped');
  const waits = [];
  assert.equal(await retryWithDelays(RECONNECT_DELAYS, { alive: () => true, onTry: () => {}, attempt: async () => false }, async ms => { waits.push(ms); }), 'exhausted');
  assert.deepEqual(waits, RECONNECT_DELAYS);
  assert.equal(waits.reduce((a, b) => a + b), 37300, 'about 40 s in total');
});

test('a new match on the same connection resets the table', () => {
  const s = extra => ({ matchId: 'm1', turn: 3, gameOver: false, ...extra });
  assert.equal(isFreshMatch(null, s()), false);
  assert.equal(isFreshMatch(s(), s({ turn: 4 })), false);
  assert.equal(isFreshMatch(s(), s({ matchId: 'm2' })), true);
  assert.equal(isFreshMatch(s({ match: { gameNumber: 1 } }), s({ match: { gameNumber: 2 } })), true);
  assert.equal(isFreshMatch(s({ gameOver: true }), s()), true, 'old servers: game over undone');
  assert.equal(isFreshMatch(s({ turn: 5 }), s({ turn: 1 })), true, 'old servers: the turn went back');
  assert.equal(isFreshMatch(s({ turn: 5, match: { gameNumber: 1 } }), s({ turn: 1, match: { gameNumber: 1 } })), false);
});

test('invite and create-room links leave the address', () => {
  assert.deepEqual(startupLinks('?sala=abcd&x=1'), { room: 'ABCD', createRoom: false, search: '?x=1' });
  assert.deepEqual(startupLinks('?criar-sala=1'), { room: undefined, createRoom: true, search: '' });
  assert.deepEqual(startupLinks(''), { room: undefined, createRoom: false, search: '' });
});

test('decks as the server receives them', () => {
  const deck = { id: 'd1', name: 'Elfos', cards: [{ name: 'Llanowar Elves', count: 4 }] };
  assert.deepEqual(forgeDeck(deck), { name: 'Elfos', cards: deck.cards, sideboard: [], commanders: [] });
  assert.deepEqual(matchOwner(deck, null), {});
  assert.deepEqual(matchOwner(deck, { token: 't' }), { conta: 't', deckId: 'd1' });
});
