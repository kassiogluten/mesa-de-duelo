import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { oppHandHTML, seatHandHTML, revealedCountText } = await import(uri((await readFile(new URL('../src/ui/revealedHand.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));
const face = c => `<div class="face">${c.name}</div>`;
const label = c => c.name;
const card = (id, name) => ({ id, name, controller: 23 });
const player = extra => ({ id: 23, name: 'Bruno', handCount: 3, hand: [], ...extra });

test('hidden hand stays a fan of card backs and a plain count', () => {
  const p = player();
  assert.equal((oppHandHTML(p, face, label).match(/class="back"/g) ?? []).length, 3);
  assert.doesNotMatch(oppHandHTML(p, face, label), /Mão revelada|data-peek/);
  assert.match(seatHandHTML(p), /<span class="seat-hand" aria-label="3 cartas na mão">/);
  assert.doesNotMatch(seatHandHTML(p), /data-gy/);
});

test('revealed hand turns the fan face up, only to inspect, with the badge', () => {
  const p = player({ revealedHand: [card(1, 'Counterspell'), card(2, 'Island'), card(3, 'Serra Angel')] });
  const html = oppHandHTML(p, face, label);
  assert.deepEqual([...html.matchAll(/data-peek="(\d+)"/g)].map(m => Number(m[1])), [1, 2, 3]);
  assert.doesNotMatch(html, /data-fid|class="back"/, 'cards cannot be played by the viewer');
  assert.match(html, /Mão revelada/);
  assert.match(html, /aria-label="Mão revelada de Bruno: 3 cartas"/);
});

test('a partly revealed hand keeps the unseen cards face down', () => {
  const p = player({ handCount: 4, revealedHand: [card(1, 'Counterspell')] });
  const html = oppHandHTML(p, face, label);
  assert.equal((html.match(/data-peek=/g) ?? []).length, 1);
  assert.equal((html.match(/class="back"/g) ?? []).length, 3);
  assert.equal(revealedCountText(p), '1 de 4 cartas à vista');
});

test('commander seat badge gets the eye, the label and opens the hand gallery', () => {
  const html = seatHandHTML(player({ revealedHand: [card(1, 'Sol Ring'), card(2, 'Forest'), card(3, 'Cultivate')] }));
  assert.match(html, /<button type="button" class="seat-hand revealed" data-gy="23" data-zone="hand"/);
  assert.match(html, /class="eye"/);
  assert.match(html, />Revelada</);
  assert.match(html, /Ver a mão revelada de Bruno \(3 cartas\)/);
  assert.equal(revealedCountText(player({ handCount: 1, revealedHand: [card(1, 'Sol Ring')] })), '1 carta');
});
