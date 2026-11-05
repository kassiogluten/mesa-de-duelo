// As trocas com o sideboard entre os jogos: mover, trocar em par, o que saiu e entrou, o filtro e o painel sem trocas.
import test from 'node:test';
import assert from 'node:assert/strict';
const { moveCopy, swapPair, sideboardChanges, copyDelta, matchesSideboardFilter } = await import('../src/ui/sideboardDraft.ts');
const { sideboardHTML } = await import('../src/ui/sideboardView.ts');

const lists = () => ({ main: [{ name: 'Lightning Bolt', count: 2 }, { name: 'Mountain', count: 20 }], sideboard: [{ name: 'Duress', count: 3 }] });

test('moving a copy keeps the total and drops empty rows', () => {
  const l = lists();
  assert.ok(moveCopy(l, 'main', 'Lightning Bolt'));
  assert.ok(moveCopy(l, 'main', 'Lightning Bolt'));
  assert.deepEqual(l.main, [{ name: 'Mountain', count: 20 }]);
  assert.deepEqual(l.sideboard, [{ name: 'Duress', count: 3 }, { name: 'Lightning Bolt', count: 2 }]);
  assert.equal(moveCopy(l, 'main', 'Lightning Bolt'), false);
});

test('a pair swap trades one copy each way, or nothing when either card is missing', () => {
  const l = lists();
  assert.ok(swapPair(l, 'sideboard', 'Duress', 'Lightning Bolt'));
  assert.deepEqual(l.main, [{ name: 'Lightning Bolt', count: 1 }, { name: 'Mountain', count: 20 }, { name: 'Duress', count: 1 }]);
  assert.deepEqual(l.sideboard, [{ name: 'Duress', count: 2 }, { name: 'Lightning Bolt', count: 1 }]);
  assert.equal(swapPair(l, 'sideboard', 'Duress', 'Island'), false);
  assert.equal(l.main.length, 3);
});

test('changes compare the main deck with the previous game', () => {
  const original = lists().main, l = lists();
  swapPair(l, 'sideboard', 'Duress', 'Lightning Bolt');
  assert.deepEqual(sideboardChanges(original, l.main), { out: [{ name: 'Lightning Bolt', count: 1 }], into: [{ name: 'Duress', count: 1 }] });
  assert.equal(copyDelta(original, l.main, 'Lightning Bolt'), -1);
  assert.equal(copyDelta(original, l.main, 'Duress'), 1);
});

test('the filter ignores accents and case, in either name', () => {
  const row = { name: 'Lightning Bolt', count: 1, info: { label: 'Relâmpago', type: 'instant' } };
  assert.ok(matchesSideboardFilter(row, { text: 'relampago', type: '' }));
  assert.ok(matchesSideboardFilter(row, { text: 'BOLT', type: 'spell' }));
  assert.equal(matchesSideboardFilter(row, { text: '', type: 'creature' }), false);
});

test('without changes the main button continues without trades; with them it confirms', () => {
  const sb = { id: 1, ready: false, ...lists() };
  const s = { players: [], you: 0, gameOver: true, sideboarding: sb, match: { gameNumber: 1, wins: [0, 1] }, config: { format: 'pauper' } };
  const o = { error: '', busy: false, details: '', filter: { text: '', type: '' }, ptName: n => n, feedback: false };
  const same = sideboardHTML(s, { id: 1, ...lists() }, o);
  assert.match(same, /data-ui="next-game"[^>]*>Continuar sem trocas/);
  assert.match(same, /Nenhuma troca/);
  assert.match(same, /Faltam 38 para as 60 cartas/);
  const draft = { id: 1, ...lists() };
  moveCopy(draft, 'sideboard', 'Duress');
  const changed = sideboardHTML(s, draft, o);
  assert.match(changed, /data-ui="sideboard-ready"[^>]*>Confirmar trocas e continuar/);
  assert.match(changed, /Entram 1/);
  assert.match(sideboardHTML(s, draft, { ...o, filter: { text: 'zzz', type: '' } }), /Nenhuma carta com esse filtro/);
});
