import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/ui/turnNotice.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { myTurnKey, noticeEnabled } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const state = extra => ({ matchId: 'm1', turn: 3, activePlayer: 0, you: 0, gameOver: false, ...extra });

test('each of your turns has its own key; other turns and the end of the game have none', () => {
  assert.equal(myTurnKey(state()), 'm1:3');
  assert.notEqual(myTurnKey(state({ turn: 5 })), myTurnKey(state()));
  assert.notEqual(myTurnKey(state({ matchId: 'm2' })), myTurnKey(state()));
  assert.equal(myTurnKey(state({ activePlayer: 1 })), '');
  assert.equal(myTurnKey(state({ gameOver: true })), '');
  assert.equal(myTurnKey(state({ turn: 0 })), '');
  assert.equal(myTurnKey(state({ matchId: undefined, session: { code: 'ABCD' } })), 'ABCD:3');
});

test('system notifications need the browser permission and follow the saved choice', () => {
  assert.equal(noticeEnabled(null, 'granted'), true);
  assert.equal(noticeEnabled('on', 'granted'), true);
  assert.equal(noticeEnabled('off', 'granted'), false);
  assert.equal(noticeEnabled('on', 'default'), false);
  assert.equal(noticeEnabled('on', 'denied'), false);
  assert.equal(noticeEnabled('on', 'unsupported'), false);
});
