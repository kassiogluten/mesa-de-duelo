import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(file) {
  const code = await readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
}
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const awaiting = url(await load('awaitingDecision.ts'));
const { buzzKey, buzzEnabled } = await import(url((await load('turnBuzz.ts')).replace(/from ['"]\.\/awaitingDecision['"]/, `from '${awaiting}'`)));
const { screenWakeEnabled } = await import(url(await load('screenWake.ts')));

const input = extra => ({ gen: 7, selectable: [], ok: { enabled: false }, cancel: { enabled: false }, ...extra });
const state = extra => ({ matchId: 'm1', turn: 3, activePlayer: 1, you: 0, gameOver: false, input: input(), ...extra });

test('your turn, a block and a decision on someone else\'s turn each buzz once', () => {
  assert.equal(buzzKey(state({ activePlayer: 0 })), 'turn:m1:3');
  assert.equal(buzzKey(state({ input: input({ blocking: true }) })), 'block:m1:3');
  assert.equal(buzzKey(state({ input: input({ targeting: true }) })), 'decision:m1:7');
  assert.notEqual(buzzKey(state({ input: input({ targeting: true, gen: 8 }) })), buzzKey(state({ input: input({ targeting: true }) })));
});

test('nothing to answer, the end of the game and watching do not buzz', () => {
  assert.equal(buzzKey(state()), '');
  assert.equal(buzzKey(state({ input: input({ priority: true }) })), '');
  assert.equal(buzzKey(state({ activePlayer: 0, gameOver: true })), '');
  assert.equal(buzzKey(state({ activePlayer: 0, spectating: true })), '');
  assert.equal(buzzKey(state({ activePlayer: 0, turn: 0 })), '');
});

test('screen wake and vibration start on and only "off" turns them off', () => {
  for (const enabled of [buzzEnabled, screenWakeEnabled]) {
    assert.equal(enabled(null), true);
    assert.equal(enabled('on'), true);
    assert.equal(enabled('off'), false);
  }
});
