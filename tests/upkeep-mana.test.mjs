import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const read = name => readFile(new URL(`../src/ui/${name}`, import.meta.url), 'utf8');
const cardtext = uri(await read('cardtext.ts'));
const { upkeepManaKey } = await import(uri((await read('upkeepMana.ts')).replace("'./cardtext'", JSON.stringify(cardtext))));

const state = (extra = {}, input = {}) => ({ matchId: 'm1', turn: 3, phase: 'UPKEEP', activePlayer: 0, you: 0, stack: [], ...extra, input: { gen: 1, priority: true, manaOnly: [10], ...input } });

test('tapping something that only makes mana in your upkeep asks first, once per upkeep', () => {
  assert.equal(upkeepManaKey(state(), 10), 'm1:3');
  assert.notEqual(upkeepManaKey(state({ turn: 5 }), 10), upkeepManaKey(state(), 10));
});

test('no warning outside your upkeep or when the tap is not just mana', () => {
  assert.equal(upkeepManaKey(state({ phase: 'MAIN1' }), 10), '');
  assert.equal(upkeepManaKey(state({ phase: 'DRAW' }), 10), '');
  assert.equal(upkeepManaKey(state({ activePlayer: 1 }), 10), '');
  assert.equal(upkeepManaKey(state(), 11), '');
  assert.equal(upkeepManaKey(state({}, { manaOnly: undefined }), 10), '');
});

test('paying a cost, answering a spell or choosing targets taps freely', () => {
  assert.equal(upkeepManaKey(state({}, { paying: true }), 10), '');
  assert.equal(upkeepManaKey(state({}, { targeting: { source: 1 } }), 10), '');
  assert.equal(upkeepManaKey(state({ stack: [{ id: 1, text: 'gatilho' }] }), 10), '');
  assert.equal(upkeepManaKey(state({}, { priority: false }), 10), '');
});
