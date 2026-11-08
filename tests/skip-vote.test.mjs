import test from 'node:test';
import assert from 'node:assert/strict';
const { offlinePlayers, slowPlayers, skipBarHTML } = await import('../src/ui/skipVote.ts');

const base = () => ({ you: 36, gameOver: false, players: [{ id: 10, name: 'Ana' }, { id: 23, name: 'Bruno' }, { id: 36, name: 'Carla' }, { id: 49, name: 'Diego' }],
  room: { started: true, players: [
    { name: 'Ana', connected: true, playerId: 10 }, { name: 'Bruno', connected: false, playerId: 23 },
    { name: 'Carla', connected: true, playerId: 36 }, { name: 'Diego', connected: false, playerId: 49, eliminated: true, conceded: true },
  ] } });

test('only players who dropped and are still in the game can be skipped', () => {
  assert.deepEqual(offlinePlayers(base()).map(p => p.name), ['Bruno']);
  assert.deepEqual(offlinePlayers({ ...base(), gameOver: true }), []);
  assert.equal(skipBarHTML({ ...base(), room: { started: true, players: [] } }), '');
});

test('the bar offers the vote, then shows the tally with the player own choice', () => {
  assert.match(skipBarHTML(base()), /data-skip-vote="23" data-value="true">Votar para pular o turno/);
  const voting = { ...base(), skip: { vote: { target: 23, name: 'Bruno', yes: 1, no: 0, voters: 2, needed: 2, canVote: true, mine: 'yes' }, skipping: [] } };
  const html = skipBarHTML(voting);
  assert.match(html, /Pular o turno de Bruno\?/);
  assert.match(html, /Sim 1 · Não 0 · precisa de 2 votos entre 2 online/);
  assert.match(html, /data-value="true" aria-pressed="true">Sim/);
  assert.doesNotMatch(html, /Votar para pular o turno/);
  assert.match(skipBarHTML({ ...voting, skip: { ...voting.skip, vote: { ...voting.skip.vote, canVote: false } } }), /Você não vota nesta/);
});

test('an approved skip says the table passes for them; spectators get no vote button', () => {
  assert.match(skipBarHTML({ ...base(), skip: { skipping: [23] } }), /O turno será pulado/);
  assert.doesNotMatch(skipBarHTML({ ...base(), spectating: true }), /data-skip-vote/);
});

test('a connected player past 2 minutes can have the turn step skipped by vote, but never yourself', () => {
  const slow = { ...base(), skip: { skipping: [], slow: [10, 36] } };
  assert.deepEqual(slowPlayers(slow).map(p => p.name), ['Ana']);
  const html = skipBarHTML(slow);
  assert.match(html, /Ana está demorando\./);
  assert.match(html, /data-skip-vote="10" data-value="true">Votar para pular a vez/);
  assert.doesNotMatch(html, /Carla está demorando/);
  const voting = { ...slow, skip: { slow: [10], skipping: [], vote: { target: 10, name: 'Ana', slow: true, yes: 1, no: 0, voters: 2, needed: 2, canVote: true, mine: 'yes' } } };
  assert.match(skipBarHTML(voting), /Pular a vez de Ana\?/);
  assert.doesNotMatch(skipBarHTML(voting), /Votar para pular a vez/);
  assert.match(skipBarHTML({ ...base(), skip: { skipping: [10] } }), /A vez de Ana está sendo pulada/);
});

test('the slow player sees the vote against them and when the table passes for them', () => {
  const target = { ...base(), skip: { skipping: [], vote: { target: 36, name: 'Carla', slow: true, yes: 1, no: 0, voters: 2, needed: 2, canVote: false } } };
  assert.match(skipBarHTML(target), /Pular a sua vez\?/);
  assert.match(skipBarHTML(target), /Decida a sua jogada para encerrar a votação/);
  assert.match(skipBarHTML({ ...base(), skip: { skipping: [36] } }), /A mesa está passando a sua vez/);
});
