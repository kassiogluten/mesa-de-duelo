import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const source = file => readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
const cardtext = uri(await source('cardtext.ts'));
const screens = uri((await source('choiceScreens.ts')).replace("'./cardtext'", JSON.stringify(cardtext)));
const filters = uri((await source('choiceFilters.ts')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./choiceScreens'", JSON.stringify(screens)));
const names = await import(uri((await source('nameChoice.ts')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./choiceFilters'", JSON.stringify(filters))));

// Silverquill Silencer: o Forge manda todos os nomes de cartas que não são terreno.
const filler = Array.from({ length: 30000 }, (_, i) => `Card ${i}`);
const all = ['Lightning Bolt', 'Chain Lightning', 'Lightning Helix', 'Ball Lightning', 'Counterspell', ...filler];
const question = (options, extra = {}) => ({ id: 7, method: 'getChoices', kind: 'choose', title: 'Choose a card name', min: 1, max: 1, options, purpose: 'card-name', ...extra });

test('nomear uma carta vira busca, e escolhas pequenas ou com cartas não', () => {
  assert.equal(names.isNameChoice(question(all)), true);
  assert.equal(names.isNameChoice(question(filler.slice(0, 120), { purpose: undefined })), true, 'lista enorme de textos sem aviso da ponte');
  assert.equal(names.isNameChoice(question(['Sim', 'Não'], { purpose: undefined })), false);
  assert.equal(names.isNameChoice(question(all, { max: 3, purpose: undefined })), false);
  assert.equal(names.isNameChoice(question(filler.slice(0, 120).map((label, id) => ({ label, card: { id, name: label } })), { purpose: undefined })), false);
});

test('sem texto nada é desenhado; com texto, só os primeiros, começando pelo início do nome', () => {
  const q = question(all);
  const empty = names.nameMatches(q, '');
  assert.deepEqual(empty.indices, []);
  assert.match(names.nameStatus(empty, ''), /30\.005 cartas/);

  const m = names.nameMatches(q, 'lightn');
  assert.deepEqual(m.indices.map(i => all[i]), ['Lightning Bolt', 'Lightning Helix', 'Ball Lightning', 'Chain Lightning']);
  assert.equal(m.total, 4);

  const many = names.nameMatches(q, 'card');
  assert.equal(many.indices.length, names.NAME_RESULTS);
  assert.equal(many.total, 30000);
  assert.match(names.nameStatus(many, 'card'), /Continue digitando/);
  assert.equal((names.nameListHTML(q, many).match(/data-q-opt=/g) ?? []).length, names.NAME_RESULTS);
});

test('a busca ignora acento e maiúscula e acha pela tradução conhecida', () => {
  const q = question(all, { id: 8 });
  const pt = name => (name === 'Lightning Bolt' ? 'Raio' : undefined);
  assert.deepEqual(names.nameMatches(q, 'RAÍO', pt).indices.map(i => all[i]), ['Lightning Bolt']);
  assert.match(names.nameListHTML(q, names.nameMatches(q, 'raio', pt), pt), /<small>Raio<\/small>/);
  assert.deepEqual(names.nameMatches(q, 'xyz', pt).indices, []);
  assert.equal(names.nameStatus(names.nameMatches(q, 'xyz', pt), 'xyz'), 'Nenhuma carta com esse nome.');
});
