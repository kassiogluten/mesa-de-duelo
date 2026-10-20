import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/ui/awaitingDecision.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { awaitingDecision, waitingOnText } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
function state(input = {}, extra = {}) {
  return { you: 0, gameOver: false, players: [{ id: 0, name: 'Você' }, { id: 1, name: 'Ana' }, { id: 2, name: 'Bia' }],
    input: { priority: false, selectable: [], selectablePlayers: [], selectableStacks: [], ok: { enabled: false }, cancel: { enabled: false }, ...input }, ...extra };
}
test('ordinary priority, combat declarations, mana payment and the opening never raise the strong alert', () => {
  assert.equal(awaitingDecision(state({ priority: true, ok: { enabled: true }, actionable: [5] })), null);
  assert.equal(awaitingDecision(state({ attacking: { attackers: [] }, ok: { enabled: true } })), null);
  assert.equal(awaitingDecision(state({ blocking: { blockers: [] }, ok: { enabled: true } })), null);
  assert.equal(awaitingDecision(state({ paying: true, cancel: { enabled: true } })), null);
  assert.equal(awaitingDecision(state({ opening: 'mulligan', ok: { enabled: true } })), null);
  assert.equal(awaitingDecision(state({ ok: { enabled: true } }, { question: { id: 1 } })), null);
  assert.equal(awaitingDecision(state({ ok: { enabled: true } }, { gameOver: true })), null);
});
test('targets and card selections highlight the board instead of moving the box', () => {
  assert.deepEqual(awaitingDecision(state({ targeting: { source: 3 }, selectable: [7] })), { kind: 'target', centered: false });
  assert.deepEqual(awaitingDecision(state({ selection: { cards: [], min: 1, max: 1 }, selectable: [7] })), { kind: 'select', centered: false });
  assert.deepEqual(awaitingDecision(state({ selectablePlayers: [1] })), { kind: 'choice', centered: false });
});
test('a yes/no prompt without cards to pick (commander to the command zone) opens in the center', () => {
  assert.deepEqual(awaitingDecision(state({ ok: { enabled: true }, cancel: { enabled: true } })), { kind: 'confirm', centered: true });
  assert.deepEqual(awaitingDecision(state({ suspendCast: { card: {} }, ok: { enabled: true } })), { kind: 'confirm', centered: false });
  assert.equal(awaitingDecision(state()), null);
});
test('other players deciding are named, and an older bridge without the field shows nothing', () => {
  assert.equal(waitingOnText(state()), '');
  assert.equal(waitingOnText(state({}, { deciding: [{ player: 1, kind: 'choice' }] })), 'Aguardando Ana escolher…');
  assert.equal(waitingOnText(state({}, { deciding: [{ player: 2, kind: 'block' }] })), 'Aguardando Bia declarar bloqueadores…');
  assert.equal(waitingOnText(state({}, { deciding: [{ player: 1, kind: 'attack' }] })), 'Aguardando Ana declarar atacantes…');
  assert.equal(waitingOnText(state({}, { deciding: [{ player: 1, kind: 'choice' }], gameOver: true })), '');
});
