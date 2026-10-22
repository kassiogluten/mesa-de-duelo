import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const read = name => readFile(new URL(`../src/ui/${name}`, import.meta.url), 'utf8');
const cardtext = uri(await read('cardtext.ts'));
const counters = uri((await read('playerCounters.ts')).replace("'./cardtext'", JSON.stringify(cardtext)));
const { proliferateToggle, proliferateSuggestion, proliferateClear, proliferateSummary, proliferateOkLabel, proliferatePanelHTML, proliferateBoardClass, counterName } =
  await import(uri((await read('proliferate.ts')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./playerCounters'", JSON.stringify(counters))));

function state() {
  return { you: 1, gameOver: false, players: [], input: { gen: 7, priority: false, ok: { enabled: true }, selection: { cards: [], players: [], min: 0, max: 4 }, proliferate: { candidates: [
    { kind: 'card', id: 10, holder: 1, effect: 'good', suggested: true, counters: [{ type: 'P1P1', count: 2, effect: 'good' }] },
    { kind: 'card', id: 11, holder: 1, effect: 'bad', suggested: false, counters: [{ type: 'M1M1', count: 1, effect: 'bad' }] },
    { kind: 'player', id: 2, holder: 2, effect: 'good', suggested: true, counters: [{ type: 'POISON', count: 9, effect: 'good' }] },
    { kind: 'player', id: 1, holder: 1, effect: 'bad', suggested: false, counters: [{ type: 'POISON', count: 3, effect: 'bad' }] },
  ] } } };
}
const names = { name: c => `#${c.id}`, whose: c => c.holder === 1 ? 'Seu' : 'De Ana' };

test('toggling keeps the rest of the choice and sends cards and players separately', () => {
  const s = state(); s.input.selection.cards = [10];
  assert.deepEqual(proliferateToggle(s, 'player', 2), { type: 'select-set', gen: 7, cards: [10], players: [2] });
  assert.deepEqual(proliferateToggle(s, 'card', 10), { type: 'select-set', gen: 7, cards: [], players: [] });
  assert.equal(proliferateToggle(s, 'card', 99), null);
});

test('the suggestion takes only what helps the chooser; clear empties it', () => {
  const s = state();
  assert.deepEqual(proliferateSuggestion(s), { type: 'select-set', gen: 7, cards: [10], players: [2] });
  assert.deepEqual(proliferateClear(s), { type: 'select-set', gen: 7, cards: [], players: [] });
});

test('marking something harmful warns before confirming and the button says what happens', () => {
  const s = state();
  assert.equal(proliferateOkLabel(s), 'Não proliferar');
  s.input.selection.cards = [10, 11]; s.input.selection.players = [1];
  const summary = proliferateSummary(s);
  assert.equal(summary.harmful, 2);
  assert.match(summary.instruction, /2 marcados também te prejudicam/);
  assert.equal(proliferateOkLabel(s), 'Proliferar (3)');
});

test('the panel groups by effect with arrows and before → after counts', () => {
  const s = state(); s.input.selection.players = [2];
  const html = proliferatePanelHTML(s, names);
  assert.ok(html.indexOf('Te ajuda') < html.indexOf('Te prejudica'));
  assert.match(html, /\+1\/\+1 2→3/);
  assert.match(html, /Veneno 9→10 · perde a partida/);
  assert.match(html, /data-prolif-kind="player" data-prolif-id="2" data-gen="7" aria-pressed="true"/);
  assert.equal(counterName('M1M1'), '−1/−1');
});

test('board marks follow the effect only while choosing', () => {
  const s = state();
  assert.equal(proliferateBoardClass(s, 'card', 11), 'prolif-bad');
  s.input.priority = true;
  assert.equal(proliferateBoardClass(s, 'card', 11), '');
  assert.equal(proliferatePanelHTML(s, names), '');
});
