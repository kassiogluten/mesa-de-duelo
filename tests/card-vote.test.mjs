import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const read = name => readFile(new URL(`../src/ui/${name}`, import.meta.url), 'utf8');
const cardtext = uri(await read('cardtext.ts'));
const { voteSnippets, voteTallyText, voteHTML, isVote } = await import(uri((await read('cardVote.ts')).replace("'./cardtext'", JSON.stringify(cardtext))));

const EXPROPRIATE = "Council's dilemma — Starting with you, each player votes for time or money. For each time vote, take an extra turn after this one. For each money vote, choose a permanent owned by the voter and gain control of it. Exile Expropriate.";
const PORTAL = 'Will of the council — At the beginning of your upkeep, starting with you, each player votes for carnage or homage. If carnage gets more votes, sacrifice Coercive Portal and destroy all nonland permanents. If homage gets more votes or the vote is tied, draw a card.';

test('each vote option gets the sentence that says what it does', () => {
  assert.deepEqual(voteSnippets(EXPROPRIATE, ['Time', 'Money']), [
    'For each time vote, take an extra turn after this one.',
    'For each money vote, choose a permanent owned by the voter and gain control of it.',
  ]);
  assert.deepEqual(voteSnippets(PORTAL, ['Carnage', 'Homage']), [
    'If carnage gets more votes, sacrifice Coercive Portal and destroy all nonland permanents.',
    'If homage gets more votes or the vote is tied, draw a card.',
  ]);
});

test('votes for players have no sentence of their own', () => {
  assert.deepEqual(voteSnippets("Will of the council — Starting with you, each player votes for a player. Each player with the most votes loses 2 life.", ['Ana', 'Bruno']), ['', '']);
});

test('the tally groups voters by option, in voting order', () => {
  const names = { 1: 'você', 2: 'Ana', 3: 'Bruno' };
  assert.equal(voteTallyText([{ player: 2, label: 'Time' }, { player: 3, label: 'Money' }, { player: 1, label: 'Time' }], id => names[id]), 'Time: Ana, você · Money: Bruno');
});

test('the vote panel shows the card, the tally and what each option does', () => {
  const q = { id: 1, method: 'getChoices', kind: 'choose', purpose: 'vote', title: 'Votação: Expropriate', min: 1, max: 1, options: [{ label: 'Time' }, { label: 'Money' }],
    card: { id: 9, name: 'Expropriate', text: EXPROPRIATE, tapped: false, token: false }, votes: [{ player: 2, label: 'Money' }] };
  assert.ok(isVote(q));
  const html = voteHTML(q, { face: () => '<i class="face"></i>', label: c => c.name, rulesText: c => c.text, playerName: () => 'Ana' });
  assert.match(html, /Votação: Expropriate/);
  assert.match(html, /data-peek="9"/);
  assert.match(html, /Money: Ana/);
  assert.match(html, /data-q-opt="0"><strong>Time<\/strong><small>For each time vote/);
  assert.doesNotMatch(html, /Não votar/);
});
