import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MatchRecorder, diff, applyPatch, decodeFrames, frameAt, fitRecording, gzip, gunzip, readJson } from '../src/forge/recording.ts';

const card = (id, extra = {}) => ({ id, name: `Carta ${id}`, tapped: false, token: false, text: 'x'.repeat(200), ...extra });
function state(version, extra = {}) {
  return {
    type: 'state', matchId: 'm1', stateVersion: version, turn: 1 + Math.floor(version / 10), phase: 'MAIN1', activePlayer: 1, gameOver: false, you: 1,
    config: { format: 'commander', matchLength: 'bo1' }, rulesVersion: 'r1', engineVersion: 'e1',
    players: [1, 2].map(id => ({ id, name: `J${id}`, ai: id === 2, life: 40 - version % 7, library: 90, handCount: 7, hand: [], graveyard: [], exile: [], pool: {},
      battlefield: Array.from({ length: 8 }, (_, i) => card(id * 100 + i, { tapped: (i + version) % 3 === 0 })) })),
    stack: [], combat: [], log: [`linha ${version}`], decks: [],
    input: { gen: version, message: 'Prioridade', ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false }, selectable: [] },
    session: { code: 'ABCD', token: 'SEGREDO', room: true },
    ...extra,
  };
}

test('diff and applyPatch round-trip objects, deletions and moved list items', () => {
  const a = { x: 1, y: { z: [1, 2] }, gone: true, cards: [card(1), card(2), card(3)] };
  const b = { x: 1, y: { z: [1, 2, 3] }, added: null, cards: [card(2, { tapped: true }), card(3), card(4)] };
  const p = diff(a, b);
  assert.deepEqual(applyPatch(a, p), b);
  assert.equal(a.cards.length, 3, 'the base is not mutated');
  assert.equal(diff(b, structuredClone(b)), undefined);
  assert.ok(JSON.stringify(p).length < JSON.stringify(b).length, 'a moved card is not copied whole');
});

test('recorder keeps one frame per stateVersion, rebuilds every state and strips seat tokens', () => {
  let now = 1000;
  const r = new MatchRecorder({ app: '0.31.0' }, { now: () => now += 50 });
  r.sent({ type: 'rejoin', code: 'ABCD', token: 'SEGREDO' });
  for (let v = 1; v <= 100; v++) { r.received(state(v)); r.received(state(v)); }
  r.sent({ type: 'ok', gen: 100 });
  r.note('ação ignorada', 'Ação ignorada', 'ação: ok');
  const rec = r.snapshot();
  assert.equal(rec.frames.length, 100);
  assert.equal(rec.frames.filter(f => f.k).length, 3, 'one full frame every 40');
  assert.doesNotMatch(JSON.stringify(rec), /SEGREDO/);
  const decoded = [...decodeFrames(rec)];
  assert.equal(decoded[56].state.input.gen, 57);
  assert.deepEqual(frameAt(rec, 57), decoded[57].state);
  assert.deepEqual(rec.sent.map(s => s.msg), [{ type: 'rejoin', code: 'ABCD' }, { type: 'ok', gen: 100 }]);
  assert.equal(rec.sent[1].v, 100); assert.equal(rec.notes[0].v, 100);
  assert.equal(rec.meta.format, 'commander'); assert.equal(rec.meta.playerCount, 2); assert.equal(rec.meta.rulesVersion, 'r1');
});

test('memory limit drops the oldest frames but keeps the first one decodable', () => {
  const r = new MatchRecorder({ app: 'x' }, { memoryLimit: 200_000 });
  for (let v = 1; v <= 400; v++) r.received(state(v));
  const rec = r.snapshot();
  assert.ok(rec.droppedFrames > 0);
  assert.equal(rec.frames[0].v, 1); assert.ok(rec.frames[1].k, 'the frame after the cut is a full frame');
  const decoded = [...decodeFrames(rec)];
  assert.equal(decoded.at(-1).state.input.gen, 400);
});

test('fitRecording keeps the compressed size under the limit and stays decodable', async () => {
  const r = new MatchRecorder({ app: 'x' });
  for (let v = 1; v <= 300; v++) r.received(state(v, { log: Array.from({ length: 30 }, () => Math.random().toString(36)) }));
  const full = r.snapshot();
  const { recording, bytes } = await fitRecording(full, 60_000);
  assert.ok(bytes <= 60_000, `${bytes} bytes`);
  assert.ok(recording.frames.length < full.frames.length);
  assert.equal(recording.frames[0].v, 1);
  assert.equal([...decodeFrames(recording)].at(-1).state.input.gen, 300);
  const same = await fitRecording(full, 50_000_000);
  assert.equal(same.recording, full);
});

test('gzip helpers read both compressed and plain JSON', async () => {
  const bytes = await gzip(JSON.stringify({ a: 'ç' }));
  assert.equal(await gunzip(bytes), '{"a":"ç"}');
  assert.deepEqual(await readJson(bytes), { a: 'ç' });
  assert.deepEqual(await readJson(new TextEncoder().encode('{"b":1}')), { b: 1 });
});
