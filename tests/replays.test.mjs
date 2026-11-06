import test from 'node:test';
import assert from 'node:assert/strict';
const { MatchRecorder } = await import('../src/forge/recording.ts');
const { summarize, worthKeeping, replayId } = await import('../src/replays.ts');
const { replayMarks, turnLabel, frameDelay } = await import('../src/rever/marks.ts');
const { gravadasHTML, resultadoGravado, partidaHTML } = await import('../src/partidas/view.ts');

const state = (over = {}) => ({ matchId: 'm1', stateVersion: 1, turn: 1, phase: 'MAIN1', activePlayer: 1, you: 1, gameOver: false,
  players: [{ id: 1, name: 'Você', ai: false, hand: [] }, { id: 2, name: 'Oponente', ai: true, hand: [] }], stack: [], input: { gen: 1 }, ...over });

function recording(states) {
  let t = 1000;
  const r = new MatchRecorder({ app: 'test' }, { now: () => t += 500 });
  states.forEach((s, i) => r.received({ ...s, stateVersion: i + 1 }));
  return r.snapshot();
}

test('a played match is kept, with its result read from the last frame', () => {
  const rec = recording([state(), state({ turn: 2, activePlayer: 2 }), state({ turn: 3, gameOver: true, winner: 'Você' })]);
  assert.equal(worthKeeping(rec), true);
  assert.equal(replayId(rec), 'm1');
  const s = summarize(rec, 1234);
  assert.equal(s.turns, 3); assert.equal(s.finished, true); assert.equal(s.winner, 'Você'); assert.equal(s.frames, 3); assert.equal(s.bytes, 1234);
  assert.equal(resultadoGravado(s), 'Vitória');
  assert.equal(resultadoGravado({ ...s, winner: 'Oponente' }), 'Derrota');
  assert.equal(resultadoGravado({ ...s, finished: false }), 'Não terminou');
});

test('watching someone else, the lab and a single frame are not kept', () => {
  assert.equal(worthKeeping(recording([state()])), false);
  assert.equal(worthKeeping(recording([state({ watching: true }), state({ watching: true, turn: 2 })])), false);
  assert.equal(worthKeeping(recording([state({ room: { lab: true } }), state({ room: { lab: true }, turn: 2 })])), false);
});

test('turn marks find the turns and the games of a best of three', () => {
  const marks = replayMarks([1, 1, 2, 3, 1, 2].map((turn, i) => ({ state: { turn, activePlayer: i % 2 ? 2 : 1, you: 1 } })));
  assert.deepEqual(marks.map(m => m.game), [1, 1, 1, 1, 2, 2]);
  assert.equal(turnLabel(marks[2], false), 'Turno 2 · seu');
  assert.equal(turnLabel(marks[3], true), 'Jogo 1 · Turno 3 · do oponente');
  assert.equal(turnLabel({ turn: 0, game: 1, mine: false, active: null }, false), 'Começo');
  assert.equal(frameDelay(0, 10000, 1), 2500);
  assert.equal(frameDelay(0, 10, 1), 120);
  assert.equal(frameDelay(0, 1000, 4), 250);
});

test('Minhas partidas lists the recorded matches with Rever and Apagar, and links the account ones', () => {
  const rec = recording([state(), state({ turn: 4, gameOver: true, winner: 'Oponente', config: { format: 'pauper' } })]);
  const html = gravadasHTML([summarize(rec, 10)], f => f.toUpperCase(), 10);
  assert.match(html, /href="\/rever\.html\?id=m1"/);
  assert.match(html, /data-apagar="m1"/);
  assert.match(html, /Derrota/);
  assert.match(html, /contra <strong>Computador<\/strong>/);
  assert.match(gravadasHTML([], f => f, 10), /Nenhuma partida gravada ainda/);
  const p = { id: 'm1', quando: '2026-11-01T10:00:00Z', resultado: 'vitoria', turnos: 3, jogos: 1, placar: [1, 0], deck: { nome: 'A' }, oponentes: [{ ia: true, estilo: 'agressivo' }] };
  assert.match(partidaHTML(p, f => f, true), /Rever/);
  assert.doesNotMatch(partidaHTML(p, f => f), /Rever/);
  assert.match(partidaHTML(p, f => f), /Computador agressivo/);
});
