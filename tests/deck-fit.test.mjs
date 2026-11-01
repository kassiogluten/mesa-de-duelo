import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const source = file => readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
const cardtext = uri(await source('cardtext.ts'));
const fit = await import(uri((await source('deckFit.ts')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("import './contaMenu.css';", '')));
const LABEL = { free: 'Livre', standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', commander: 'Commander' };
const label = f => LABEL[f];

test('compatible formats follow the home screen order, with Livre last and without the missing one', () => {
  const fits = f => ['free', 'pauper', 'standard', 'sacola50'].includes(f);
  assert.deepEqual(fit.fitFormats(fits, 'pauper'), ['standard', 'sacola50', 'free']);
  assert.deepEqual(fit.fitFormats(() => false, 'pauper'), []);
});

test('names are joined in Portuguese', () => {
  assert.equal(fit.listJoin(['Livre']), 'Livre');
  assert.equal(fit.listJoin(['Standard', 'Livre']), 'Standard e Livre');
  assert.equal(fit.listJoin(['Standard', 'Sacola 50', 'Livre']), 'Standard, Sacola 50 e Livre');
});

test('the line next to the deck says where it fits, only Livre, nowhere, or the room format', () => {
  assert.equal(fit.deckFitText('pauper', ['standard', 'free'], label), 'Este deck não serve para Pauper. Serve para Standard e Livre.');
  assert.equal(fit.deckFitText('pauper', ['free'], label), 'Este deck não serve para Pauper, só para o Livre.');
  assert.equal(fit.deckFitText('commander', [], label), 'Este deck não serve para Commander nem para outro formato. Confira as cartas.');
  assert.equal(fit.deckFitText('commander', ['standard', 'free'], label, true), 'Este deck não serve para Commander, o formato da sala. Serve para Standard e Livre.');
});

const picker = extra => fit.formatPickerHTML({ deckName: 'Goblins <3', missing: 'pauper', current: 'pauper', fitting: ['standard', 'free'], label, editable: true, leaving: false, ...extra });

test('the picker lists only the compatible formats as shortcuts', () => {
  const html = picker();
  assert.match(html, /Goblins &lt;3 não serve para Pauper/);
  assert.deepEqual([...html.matchAll(/data-fit-format="(\w+)"/g)].map(m => m[1]), ['standard', 'free']);
  assert.doesNotMatch(html, /data-fit-action="(edit|peek|leave)"/);
  assert.match(html, /data-fit-close>Fechar</);
});

test('format after deck: the current format is marked and the player can leave without the deck', () => {
  const html = picker({ missing: 'standard', current: 'commander', fitting: ['commander'], leaving: true });
  assert.match(html, /data-fit-format="commander">Commander<small>atual<\/small>/);
  assert.match(html, /data-fit-action="leave">Ir para Standard sem este deck/);
  assert.match(html, /data-fit-close>Ficar em Commander</);
});

test('only Livre: offers Edit (own deck) and See the cards', () => {
  const own = picker({ fitting: ['free'] });
  assert.match(own, /só serve para o Livre/);
  assert.match(own, /data-fit-action="edit"/);
  assert.match(own, /data-fit-action="peek"/);
  const ready = picker({ fitting: ['free'], editable: false });
  assert.doesNotMatch(ready, /data-fit-action="edit"/);
  assert.match(ready, /data-fit-action="peek"/);
  const none = picker({ fitting: [] });
  assert.doesNotMatch(none, /data-fit-format/);
  assert.match(none, /data-fit-action="peek"/);
});
