import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { offlinePlayers, skipBarHTML } = await import(uri((await readFile(new URL('../src/ui/skipVote.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));

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
