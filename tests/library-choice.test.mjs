import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const lib = await import(uri((await readFile(new URL('../src/ui/libraryChoice.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));

const card = (id, name, typeLine) => ({ id, name, typeLine, tapped: false, token: false });
const top = [card(1, 'Lightning Bolt', 'Instant'), card(2, 'Counterspell', 'Instant'), card(3, 'Forest', 'Basic Land — Forest')];
const options = top.map(c => ({ kind: 'card', card: c, label: `${c.name} (${c.id})` }));
const scry = { id: 9, method: 'order', kind: 'choose', purpose: 'library', library: 'bottom', title: 'Escolha as cartas a serem colocadas no fundo do seu grimório', min: 0, max: 3, options };
const surveil = { ...scry, library: 'graveyard', title: 'Escolha as cartas pra colocar no cemitério' };
const order = { id: 10, method: 'order', kind: 'order', purpose: 'library', library: 'top', title: 'Organize as cartas que irão no topo do seu grimório', options };
const face = c => `<div class="face">${c.name}</div>`;
const pt = { 'Lightning Bolt': ['Raio', 'Mágica Instantânea'] };
const label = c => pt[c.name]?.[0] ?? c.name;
const type = c => pt[c.name]?.[1] ?? c.typeLine;

test('only questions the bridge marks as scry or surveil use this screen', () => {
  assert.equal(lib.isLibraryChoice(scry), true);
  assert.equal(lib.isLibraryChoice(order), true);
  assert.equal(lib.isLibraryChoice({ ...scry, purpose: undefined }), false);
  assert.equal(lib.isLibraryChoice({ ...scry, options: [] }), false);
});

test('every card starts on top, and the order step starts with the current library order', () => {
  assert.deepEqual(lib.libraryStart(scry), []);
  assert.deepEqual(lib.libraryStart(order), [0, 1, 2]);
});

test('placing cards keeps the answer in library order and ignores repeated taps', () => {
  const picked = [];
  assert.equal(lib.placeLibraryCard(picked, 2, true), true);
  assert.equal(lib.placeLibraryCard(picked, 0, true), true);
  assert.deepEqual(picked, [0, 2]);
  assert.equal(lib.placeLibraryCard(picked, 0, true), false, 'already going to the bottom');
  assert.equal(lib.placeLibraryCard(picked, 1, false), false, 'already on top');
  assert.equal(lib.placeLibraryCard(picked, 0, false), true);
  assert.deepEqual(picked, [2]);
});

test('moving swaps with the neighbour and stops at the ends', () => {
  const o = [0, 1, 2];
  assert.equal(lib.moveLibraryCard(o, 0, -1), false);
  assert.equal(lib.moveLibraryCard(o, 2, 1), false);
  assert.equal(lib.moveLibraryCard(o, 1, -1), true);
  assert.deepEqual(o, [1, 0, 2]);
  assert.equal(lib.moveLibraryCard(o, 1, 1), true);
  assert.deepEqual(o, [1, 2, 0]);
});

test('the summary says how many stay and where the others go', () => {
  assert.equal(lib.librarySummary(scry, []), 'Todas ficam no topo.');
  assert.equal(lib.librarySummary(scry, [1]), '2 ficam no topo, 1 vai para o fundo.');
  assert.equal(lib.librarySummary(scry, [0, 1, 2]), 'Todas vão para o fundo.');
  assert.equal(lib.librarySummary(surveil, [0, 2]), '1 fica no topo, 2 vão para o cemitério.');
});

test('the choice shows whole cards in library order, top first, with name and type for screen readers', () => {
  const html = lib.libraryChoiceHTML(scry, [1], face, label, type);
  assert.match(html, /Vidência: topo ou fundo/);
  const faces = [...html.matchAll(/<div class="face">([^<]+)<\/div>/g)].map(m => m[1]);
  assert.deepEqual(faces, ['Lightning Bolt', 'Counterspell', 'Forest'], 'not sorted by mana value');
  assert.match(html, /aria-label="Raio, Mágica Instantânea\. 1ª do topo\. Escolhida: fica no topo\. Toque para ler a carta\."/);
  assert.match(html, /aria-label="Counterspell, Instant\. 2ª do topo\. Escolhida: vai para o fundo\./);
  assert.match(html, /data-inspect="1"/, 'tapping the card opens the inspector');
  assert.match(html, /data-lib-place="away:1" aria-pressed="true"/);
  assert.match(html, /data-lib-place="top:0" aria-pressed="true"/);
  assert.match(html, /<b>1<\/b><span>Topo<\/span>/);
  assert.match(html, /2 ficam no topo, 1 vai para o fundo\./);
  assert.match(html, /data-q-submit>Confirmar</);
});

test('surveil sends cards to the graveyard instead of the bottom', () => {
  const html = lib.libraryChoiceHTML(surveil, [0], face, label, type);
  assert.match(html, /Vigilância: topo ou cemitério/);
  assert.match(html, /data-lib-place="away:0" aria-pressed="true">Cemitério</);
  assert.match(html, /<b>1<\/b><span>Cemitério<\/span>/);
});

test('the order step follows the chosen order and disables the arrows at the ends', () => {
  const html = lib.libraryChoiceHTML(order, [2, 0, 1], face, label, type);
  assert.match(html, /Ordem no topo do grimório/);
  const faces = [...html.matchAll(/<div class="face">([^<]+)<\/div>/g)].map(m => m[1]);
  assert.deepEqual(faces, ['Forest', 'Lightning Bolt', 'Counterspell']);
  assert.match(html, /data-lib-move="0:-1" disabled/);
  assert.match(html, /data-lib-move="2:1" disabled/);
  assert.match(html, /aria-label="Forest, Basic Land — Forest\. 1ª de 3, no topo\./);
  assert.match(html, /Confirmar ordem/);
});
