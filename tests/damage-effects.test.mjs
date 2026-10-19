import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/ui/damageEffects.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { damageLook, damageDetail } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const hit = extra => ({ seq: 1, type: 'damage', delta: -2, targets: { cards: [5], players: [] }, ...extra });
const player = extra => hit({ targets: { cards: [], players: [1] }, ...extra });

test('direct damage is a projectile, combat a strike and self-damage stays put', () => {
  assert.equal(damageLook(hit({ combat: false })).motion, 'bolt');
  assert.equal(damageLook(hit({ combat: true, step: 'regular' })).motion, 'strike');
  assert.equal(damageLook(player({ self: true })).motion, 'self');
});

test('first strike, double strike and trample get their own badges', () => {
  assert.deepEqual(damageLook(hit({ combat: true, step: 'first-strike' })).badges, ['Iniciativa']);
  assert.deepEqual(damageLook(hit({ combat: true, step: 'first-strike', doubleStrike: true })).badges, ['1º golpe']);
  assert.deepEqual(damageLook(player({ combat: true, step: 'regular', doubleStrike: true, trample: true })).badges, ['2º golpe', 'Atropelar']);
  assert.deepEqual(damageLook(hit({ combat: false, doubleStrike: true })).badges, [], 'a double striker pinging with an ability is not a strike');
  assert.deepEqual(damageLook(player({ combat: true, step: 'regular', commander: true, lifelink: true })).badges, ['Comandante', 'Vínculo com a vida']);
});

test('infect, wither and loyalty change the number instead of showing plain damage', () => {
  assert.equal(damageLook(player({ infect: true, delta: -3 })).amount, '+3 veneno');
  assert.equal(damageLook(hit({ wither: true, delta: -2 })).amount, '−2/−2');
  assert.equal(damageLook(hit({ loyalty: true, delta: -4 })).tone, 'loyalty');
  assert.equal(damageLook(hit({ delta: -1 })).amount, '−1');
});

test('big or lethal-to-player damage is heavy; deathtouch only marks creatures', () => {
  assert.equal(damageLook(hit({ delta: -5 })).heavy, true);
  assert.equal(damageLook(hit({ delta: -4, lethal: true })).heavy, false);
  assert.equal(damageLook(player({ delta: -2, lethal: true })).heavy, true);
  assert.equal(damageLook(hit({ deathtouch: true, delta: -1 })).deathtouch, true);
  assert.equal(damageLook(player({ deathtouch: true })).deathtouch, false);
  assert.equal(damageDetail(hit({ combat: true, step: 'regular', deathtouch: true })), ' (Toque mortífero)');
  assert.equal(damageDetail(hit({ combat: false })), '');
});
