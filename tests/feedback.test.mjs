import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

// The application uses Vite's extensionless TypeScript imports. Keep tests dependency-free on Node 24.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { feedbackUrl, sendReport, buildReport, encodeReport, DESCRIPTION_LIMIT } = await import('../src/feedback.ts');
const { MatchRecorder, readJson } = await import('../src/forge/recording.ts');

Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, screen: { width: 1920, height: 1080 }, document: {} });

test('feedback route lives next to the bridge WebSocket', () => {
  assert.equal(feedbackUrl('ws://127.0.0.1:7171/ws'), 'http://127.0.0.1:7171/api/relatos');
  assert.equal(feedbackUrl('wss://mesa.example.com/ws'), 'https://mesa.example.com/api/relatos');
});

function report(withMatch) {
  const r = new MatchRecorder({ app: '0.31.0', net: true });
  r.received({ type: 'state', matchId: 'm', stateVersion: 1, turn: 1, phase: 'MAIN1', activePlayer: 1, gameOver: false, you: 1, players: [], stack: [], combat: [], log: [], decks: [], config: { format: 'pauper', matchLength: 'bo1' },
    input: { gen: 1, message: '', ok: { label: '', enabled: false }, cancel: { label: '', enabled: false }, selectable: [] } });
  return buildReport({ kind: 'erro', description: '  travou  '.padEnd(DESCRIPTION_LIMIT + 50, 'x'), from: 'partida', version: '0.31.0', recording: withMatch ? r.snapshot() : null });
}

test('report keeps the description short and the match summary', async () => {
  const r = report(true);
  assert.equal(r.description.length, DESCRIPTION_LIMIT); assert.ok(r.description.startsWith('travou'));
  assert.equal(r.match.format, 'pauper'); assert.equal(r.match.net, true);
  assert.equal(r.device.viewport, '1280×720');
  const decoded = await readJson(await encodeReport(r));
  assert.equal(decoded.recording.frames.length, 1);
});

test('sendReport: code on success, seat headers only with the match attached, queue when the server is away', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ code: 'R-7K2Q' }), { status: 201 }); };
  assert.deepEqual(await sendReport(report(true), { url: 'ws://h:7171/ws', code: 'ABCD', token: 't' }), { status: 'sent', code: 'R-7K2Q' });
  assert.equal(calls[0].url, 'http://h:7171/api/relatos');
  assert.equal(calls[0].init.headers['X-Mesa-Token'], 't'); assert.equal(calls[0].init.headers['Content-Encoding'], 'gzip');
  await sendReport(report(false), { code: 'ABCD', token: 't' });
  assert.equal(calls[1].init.headers['X-Mesa-Token'], undefined, 'a report without the match does not ask for the journal');

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Muitos' }), { status: 429 });
  // Sem IndexedDB (como aqui) não há fila: o jogador fica com o formulário para tentar de novo.
  const limited = await sendReport(report(false));
  assert.equal(limited.status, 'rejected'); assert.match(limited.text, /Muitos relatos seguidos/);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  assert.match((await sendReport(report(false))).text, /Sem conexão/);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Descreva o problema.' }), { status: 400 });
  assert.deepEqual(await sendReport(report(false)), { status: 'rejected', text: 'Descreva o problema.' });
});
