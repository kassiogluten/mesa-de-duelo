import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/ui/turnHighlight.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { turnHighlight, seatTurnChange } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const state = extra => ({ you: 10, activePlayer: 10, gameOver: false, ...extra });

test('only the field of whoever plays the turn is highlighted: gold for you, red for an opponent', () => {
  assert.equal(turnHighlight(state(), 10), 'mine');
  assert.equal(turnHighlight(state(), 23), null);
  assert.equal(turnHighlight(state({ activePlayer: 23 }), 23), 'theirs');
  assert.equal(turnHighlight(state({ activePlayer: 23 }), 10), null);
  assert.equal(turnHighlight(state({ activePlayer: 36 }), 23), null);
});

test('no field is highlighted before the game starts or after it ends', () => {
  assert.equal(turnHighlight(state({ activePlayer: null }), 10), null);
  assert.equal(turnHighlight(state({ gameOver: true }), 10), null);
  assert.equal(turnHighlight(state({ activePlayer: 23, gameOver: true }), 23), null);
});

test('the seat transition only runs on the render where the turn passes', () => {
  assert.equal(seatTurnChange(undefined, state({ activePlayer: 23 })), null, 'first render: nothing to animate');
  assert.equal(seatTurnChange(23, state({ activePlayer: 23 })), null);
  assert.deepEqual(seatTurnChange(23, state({ activePlayer: 36 })), { from: 23, to: 36 });
  assert.deepEqual(seatTurnChange(36, state({ activePlayer: 10 })), { from: 36, to: 10 });
  assert.deepEqual(seatTurnChange(36, state({ activePlayer: 36, gameOver: true })), { from: 36, to: null });
  assert.equal(seatTurnChange(null, state({ activePlayer: 36, gameOver: true })), null);
});
