import test from 'node:test';
import assert from 'node:assert/strict';
const salas = await import('../src/salas/view.ts');
const { voteDialog } = await import('../src/ui/voteDialog.ts');
const { sleeveClass } = await import('../src/ui/sleeves.ts');

const room = (over = {}) => ({ code: 'WXYZ', host: 'Ana', config: { format: 'pauper', matchLength: 'bo1' }, capacity: 2, players: 1, started: false, ...over });
const rooms = [room(), room({ code: 'KLMN', host: 'Bia', config: { format: 'commander', matchLength: 'bo1', playerCount: 4 }, capacity: 4, players: 2, brackets: [3, 3] }),
  room({ code: 'LIVE', host: 'Caio', started: true, players: 2, spectators: 2 }), room({ code: 'ABCDEFGH', host: 'Duda', computer: true, started: true, players: 2 }),
  room({ code: 'FULL', players: 2 })];

test('the rooms page counts rooms waiting and matches to watch', () => {
  assert.equal(salas.contagemTexto(rooms), '2 salas esperando · 2 partidas para assistir');
  assert.equal(salas.contagemTexto([room()]), '1 sala esperando');
  assert.equal(salas.contagemTexto([]), '');
});

test('the rooms page lists waiting rooms and live matches, each with its link', () => {
  const html = salas.listaHTML(rooms, { formato: '', situacao: '' });
  assert.match(html, /Esperando jogadores <small>2<\/small>/);
  assert.match(html, /Em andamento <small>2<\/small>/);
  assert.match(html, /Sala de Bia<\/strong><small>Commander · Bracket 3 · 2\/4 jogadores<\/small>/);
  assert.match(html, /Duda contra o computador<\/strong><small>Pauper · Partida única<\/small>/);
  assert.match(html, /Sala de Caio<\/strong><small>Pauper · Partida única · 2 jogadores · 2 assistindo<\/small>/);
  assert.match(html, /href="\/\?sala=WXYZ"[^>]*>Entrar</);
  assert.match(html, /href="\/\?sala=ABCDEFGH"[^>]*>Assistir</);
  assert.doesNotMatch(html, /FULL/, 'a full room that has not started is neither joinable nor watchable');
});

test('the rooms page filters by format and by situation, and offers to create a room when empty', () => {
  assert.doesNotMatch(salas.listaHTML(rooms, { formato: 'commander', situacao: '' }), /Sala de Ana/);
  const live = salas.listaHTML(rooms, { formato: '', situacao: 'andamento' });
  assert.doesNotMatch(live, /Esperando jogadores/);
  assert.match(live, /Sala de Caio/);
  assert.match(salas.listaHTML([], { formato: '', situacao: '' }), /Nenhuma sala aberta agora\.[\s\S]*href="\/\?criar-sala=1"/);
  assert.match(salas.listaHTML(rooms, { formato: 'standard', situacao: '' }), /Nenhuma sala com esses filtros\./);
  assert.match(salas.filtrosHTML(rooms, { formato: 'pauper', situacao: 'esperando' }), /<option value="pauper" selected>Pauper<\/option>/);
  assert.match(salas.filtrosHTML(rooms, { formato: '', situacao: 'esperando' }), /data-situacao="esperando" aria-pressed="true"/);
});

const request = (over = {}) => ({ name: 'Ana', step: { action: 'cast', turn: 3, text: 'conjurar Raio' }, mine: false, canVote: true, waiting: ['Você'], ...over });

test('the vote the table waits for opens in the middle, until you vote', () => {
  const undoVote = voteDialog({ undo: { pending: false, request: request() } });
  assert.equal(undoVote.kind, 'undo');
  assert.match(undoVote.html, /Ana pediu para desfazer[\s\S]*Conjurar Raio[\s\S]*data-undo="no">Recusar[\s\S]*data-undo="yes" data-vote-start>Aceitar/);
  assert.equal(voteDialog({ undo: { pending: false, request: request({ vote: 'yes' }) } }), null, 'after voting, the bar on top shows who is left');
  assert.equal(voteDialog({ undo: { pending: false, request: request({ mine: true }) } }), null, 'whoever asked waits on the bar');
  assert.equal(voteDialog({ undo: { pending: false, request: request() }, spectating: true }), null);
  const skip = voteDialog({ skip: { skipping: [], vote: { target: 7, name: 'Bia', yes: 1, no: 0, voters: 3, needed: 2, canVote: true } } });
  assert.equal(skip.kind, 'skip');
  assert.match(skip.html, /Pular o turno de Bia\?[\s\S]*data-skip-vote="7" data-value="true" data-vote-start>Sim, pular/);
  assert.equal(voteDialog({ skip: { skipping: [], vote: { target: 7, name: 'Bia', yes: 1, no: 0, voters: 3, needed: 2, canVote: true, mine: 'no' } } }), null);
});

test('each player sleeve is a class from the eight colors, and nothing without one', () => {
  assert.equal(sleeveClass(3), ' sleeve-3');
  assert.equal(sleeveClass(undefined), '');
  assert.equal(sleeveClass(9), '');
});
