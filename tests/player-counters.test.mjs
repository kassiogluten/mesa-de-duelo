import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { playerCountersHTML, playerCountersText, playerCounterList, playerCounterName } = await import(uri((await readFile(new URL('../src/ui/playerCounters.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));

test('poison comes first, then radiation, and empty counters are dropped', () => {
  assert.deepEqual(playerCounterList({ ENERGY: 2, RAD: 3, POISON: 1, TICKET: 0 }).map(([k]) => k), ['POISON', 'RAD', 'ENERGY']);
});

test('every player counter has a Portuguese name, unknown ones fall back to the engine name', () => {
  assert.deepEqual(['POISON', 'RAD', 'ENERGY', 'EXPERIENCE', 'TICKET', 'CONTRACT'].map(playerCounterName), ['Veneno', 'Radiação', 'Energia', 'Experiência', 'Tíquete', 'Contrato']);
  assert.equal(playerCounterName('SOME_NEW'), 'Some new');
});

test('radiation explains the precombat mill with the right count', () => {
  const html = playerCountersHTML(7, { RAD: 3 });
  assert.match(html, /player-counter rad/);
  assert.match(html, /data-ctr="p7:RAD"/);
  assert.match(html, /as 3 cartas do topo/);
  assert.match(playerCountersHTML(7, { RAD: 1 }), /a carta do topo/);
});

test('poison shows the limit, warns from 7 and the counter that changed pulses', () => {
  const html = playerCountersHTML(1, { POISON: 8, ENERGY: 1 }, new Set(['ENERGY']), 'p1:POISON');
  assert.match(html, /player-counter poison danger open/);
  assert.match(html, /<small>\/10<\/small>/);
  assert.match(html, /player-counter energy bump/);
  assert.equal(playerCountersHTML(1, {}), '');
});

test('the screen reader text names each counter', () => {
  assert.equal(playerCountersText({ POISON: 1, RAD: 2 }), ', 1 marcador de veneno de 10, 2 marcadores de radiação');
});

test('the Ring shows how many times it tempted the player and the abilities it has so far', () => {
  const html = playerCountersHTML(3, {}, new Set(['RING']), null, 2);
  assert.match(html, /player-counter ring bump" data-ctr="p3:RING"/);
  assert.match(html, /<b>2<\/b>/);
  assert.match(html, /O Anel tentou 2 vezes\. Seu Portador do Anel é lendário/);
  assert.match(html, /compre um card e depois descarte um card\./);
  assert.doesNotMatch(html, /sacrifica/);
  assert.match(playerCountersHTML(3, {}, new Set(), null, 6), /cada oponente perde 3 pontos de vida/);
  assert.equal(playerCountersHTML(3, {}, new Set(), null, 0), '');
  assert.match(playerCountersHTML(3, { POISON: 1 }, new Set(), null, 1), /poison[\s\S]*ring/);
  assert.equal(playerCountersText({}, 1), ', o Anel tentou 1 vez');
});
