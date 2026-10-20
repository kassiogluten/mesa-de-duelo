import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { autoSplit, splitStatus, adjust, combatDamageHTML, isCombatDamage } = await import(uri((await readFile(new URL('../src/ui/combatDamage.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));

const q = (extra = {}) => ({ id: 1, method: 'assignCombatDamage', kind: 'amount', purpose: 'combat-damage', title: '', total: 7, ordered: false, free: false, trample: true,
  card: { id: 9, name: 'Craw Wurm' }, options: [
    { kind: 'card', card: { id: 1, name: 'Bears' }, label: 'Bears', min: 0, max: 7, lethal: 2 },
    { kind: 'card', card: { id: 2, name: 'Giant' }, label: 'Giant', min: 0, max: 7, lethal: 3 },
    { kind: 'player', id: 23, label: 'Oponente', min: 0, max: 7, defender: true },
  ], ...extra });

test('the automatic split gives lethal to each blocker and tramples over the rest', () => {
  assert.equal(isCombatDamage(q()), true);
  assert.deepEqual(autoSplit(q()), [2, 3, 2]);
  assert.deepEqual(autoSplit(q({ suggested: [3, 4, 0] })), [3, 4, 0]);
  const noTrample = q(); noTrample.options = noTrample.options.slice(0, 2);
  assert.deepEqual(autoSplit(noTrample), [2, 5]);
});

test('the defender only opens once every blocker has lethal', () => {
  assert.equal(splitStatus(q(), [2, 3, 2]).valid, true);
  const st = splitStatus(q(), [1, 3, 3]);
  assert.equal(st.valid, false);
  assert.match(st.message, /defensor/);
  assert.deepEqual(splitStatus(q(), [1, 3, 0]).locked, [false, false, true]);
  assert.match(splitStatus(q(), [2, 3, 0]).message, /Falta distribuir 2/);
});

test('ordered blockers lock the next one until the previous has lethal; free splits never lock', () => {
  assert.deepEqual(splitStatus(q({ ordered: true }), [1, 0, 0]).locked, [false, true, true]);
  assert.match(splitStatus(q({ ordered: true }), [1, 1, 0]).message, /letal a cada bloqueador/);
  assert.deepEqual(splitStatus(q({ free: true }), [0, 0, 7]).valid, true);
});

test('steppers respect the total and the locks; "lethal" tops up a blocker', () => {
  assert.deepEqual(adjust(q(), [2, 3, 2], 2, 'add'), [2, 3, 2], 'nothing left to add');
  assert.deepEqual(adjust(q(), [2, 3, 2], 2, 'sub'), [2, 3, 1]);
  assert.deepEqual(adjust(q(), [0, 0, 0], 1, 'lethal'), [0, 3, 0]);
  assert.deepEqual(adjust(q(), [0, 3, 0], 2, 'add'), [0, 3, 0], 'defender locked without lethal on every blocker');
  assert.deepEqual(adjust(q(), [2, 3, 0], 2, 'lethal'), [2, 3, 2], 'the defender gets all the rest');
});

test('the screen shows each blocker lethal, the trample target and a disabled confirm until it adds up', () => {
  const html = combatDamageHTML(q(), [2, 3, 0], () => '', c => c.name, [{ id: 23, name: 'Oponente' }]);
  assert.match(html, /Letal: 2/);
  assert.match(html, /Excesso por atropelar/);
  assert.match(html, /data-cd-confirm disabled/);
  assert.match(combatDamageHTML(q(), [2, 3, 2], () => '', c => c.name), /data-cd-confirm  aria-describedby/);
});
