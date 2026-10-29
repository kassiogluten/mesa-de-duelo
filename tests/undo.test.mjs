import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const undoUri = uri((await readFile(new URL('../src/ui/undo.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)));
const { undoButtonState, undoBarHTML, undoBadgeHTML } = await import(undoUri);

const step = { action: 'land', card: 'Floresta', turn: 3, phase: 'MAIN1', text: 'jogar Floresta' };
const on = { format: 'pauper', matchLength: 'bo1', undo: true };

test('the undo button only exists in matches created with Desfazer, and never for spectators', () => {
  assert.equal(undoButtonState({ config: { format: 'pauper', matchLength: 'bo1' }, gameOver: false }).hidden, true);
  assert.equal(undoButtonState({ config: on, spectating: true, gameOver: false }).hidden, true);
  assert.deepEqual(undoButtonState({ config: on, gameOver: false, undo: { pending: false } }), { hidden: false, disabled: true, title: 'Desfazer ligado: você pode voltar a sua última decisão. Ainda não há nada seu para desfazer.' });
  // Desligado, o botão continua à vista e a dica explica a regra da sala para todos.
  assert.match(undoButtonState({ config: on, gameOver: false, room: { code: 'ABCD' }, undo: { pending: false } }).title, /^Desfazer ligado: qualquer jogador pode pedir.*Só volta se todos os outros aceitarem\. Ainda não há/);
});

test('the button says what it undoes and that the others must accept in a room', () => {
  assert.deepEqual(undoButtonState({ config: on, gameOver: false, undo: { pending: false, last: step } }), { hidden: false, disabled: false, title: 'Desfazer: jogar Floresta' });
  assert.equal(undoButtonState({ config: on, gameOver: false, room: { code: 'ABCD' }, undo: { pending: false, last: step } }).title, 'Desfazer: jogar Floresta (os outros precisam aceitar)');
  assert.equal(undoButtonState({ config: on, gameOver: false, undo: { pending: false, last: step, request: { name: 'Ana', step, mine: true, canVote: false, waiting: ['Bruno'] } } }).disabled, true);
  assert.equal(undoButtonState({ config: on, gameOver: true, undo: { pending: false, last: step } }).disabled, true);
});

test('voters see who asks, what goes back, and Aceitar/Recusar', () => {
  const html = undoBarHTML({ undo: { pending: false, request: { name: 'Ana', step, mine: false, canVote: true, waiting: ['Bruno'] } } });
  assert.match(html, /Ana pediu para desfazer: jogar Floresta/);
  assert.match(html, /data-undo="yes"[^>]*>Aceitar</);
  assert.match(html, /data-undo="no"[^>]*>Recusar</);
});

test('the requester waits for named players and can give up; already-voted players just wait', () => {
  const mine = undoBarHTML({ undo: { pending: false, request: { name: 'Ana', step, mine: true, canVote: false, waiting: ['Bruno', 'Carla'] } } });
  assert.match(mine, /Pedido enviado: desfazer jogar Floresta/);
  assert.match(mine, /Esperando Bruno, Carla\./);
  assert.match(mine, /data-undo="cancel"/);
  const waiting = undoBarHTML({ undo: { pending: false, request: { name: 'Ana', step, mine: false, canVote: false, waiting: ['Carla'] } } });
  assert.doesNotMatch(waiting, /data-undo=/);
  assert.match(waiting, /Esperando Carla\./);
  assert.equal(undoBarHTML({ spectating: true, undo: { pending: false, request: { name: 'Ana', step, mine: false, canVote: true, waiting: [] } } }), '');
  assert.equal(undoBarHTML({ undo: { pending: false } }), '');
});

test('names are escaped', () => {
  assert.doesNotMatch(undoBarHTML({ undo: { pending: false, request: { name: '<b>x</b>', step: { ...step, text: 'conjurar <i>' }, mine: false, canVote: true, waiting: [] } } }), /<b>x|<i>/);
});

test('the badge for lists and the waiting room says Desfazer ligado', () => {
  assert.match(undoBadgeHTML(), /Desfazer ligado/);
});
