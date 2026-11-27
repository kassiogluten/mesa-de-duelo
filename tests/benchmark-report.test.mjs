import test from 'node:test';
import assert from 'node:assert/strict';

const { sendBenchmark, benchmarkUrl } = await import('../src/benchmarkReport.ts');
const { benchmarksHTML, deviceLabel, median } = await import('../src/admin/adminBenchmarks.ts');

const result = {
  versao: '0.258.0', modo: 'commander', nota: 72, fps: 54.4, fps1: 31.2, travadas: 3, quadros: 3200, duracaoMs: 60000, degrau: 1, efeitos: 'auto',
  aparelho: { tela: '412x915@2.6', nucleos: 8, memoria: 4, gpu: 'Adreno 650', modelo: 'SM-A515F', navegador: 'Chrome 131', sistema: 'Android 14', movel: true, hz: 120 },
  cenas: [{ nome: 'Combate <b>', fps: 40, fps1: 22, travadas: 3 }],
};

test('the result goes as text/plain to /api/desempenho and failures become false', async () => {
  const sent = [];
  assert.equal(await sendBenchmark(result, async (url, init) => { sent.push([url, init]); return { ok: true }; }), true);
  assert.match(sent[0][0], /\/api\/desempenho$/);
  assert.equal(sent[0][0], benchmarkUrl());
  assert.equal(sent[0][1].headers['Content-Type'], 'text/plain');
  assert.deepEqual(JSON.parse(sent[0][1].body), result);
  assert.equal(await sendBenchmark(result, async () => ({ ok: false })), false);
  assert.equal(await sendBenchmark(result, async () => { throw new Error('offline'); }), false);
});

test('the admin table shows the summary, the device with the model first and escapes what came from the server', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(deviceLabel(result.aparelho), 'SM-A515F · Android 14 · Chrome 131 · Adreno 650 · 412x915@2.6 · 120 Hz · 8 núcleos / 4 GB');
  const row = { ...result, id: 'abc123', quando: '2026-11-26T15:00:00Z' };
  const html = benchmarksHTML({ results: [row], open: 'abc123', notice: '' });
  assert.match(html, /E1/);
  assert.match(html, /data-bench-delete="abc123"/);
  assert.match(html, /Combate &lt;b&gt;/);
  assert.doesNotMatch(html, /Combate <b>/);
  assert.match(benchmarksHTML({ results: [], open: null, notice: '' }), /Nenhum resultado/);
});
