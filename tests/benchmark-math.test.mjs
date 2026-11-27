import test from 'node:test';
import assert from 'node:assert/strict';

// As contas do teste de desempenho (/desempenho): números dos quadros, nota, taxa da tela, user agent e roteiros.
const { displayHz, frameStats, parseAgent, score, SCRIPTS, stepWait, verdict, PLAY_GAP_MS } = await import('./fixtures/benchmarkMath.ts');
const { PLAY_BUTTONS } = await import('./fixtures/effectsLabPlays.ts');

test('frameStats: FPS médio, o 1% mais lento e as travadas', () => {
  const intervals = [...Array(198).fill(1000 / 60), 100, 60];
  const s = frameStats(intervals);
  assert.equal(s.quadros, 200);
  assert.equal(s.travadas, 2);
  // O 1% de 200 quadros são os 2 piores (100 e 60 ms): média de 80 ms, 12,5 FPS.
  assert.equal(s.fps1, 12.5);
  assert.equal(s.duracaoMs, Math.round(198 * 1000 / 60 + 160));
  assert.equal(s.fps, Math.round(200 / (s.duracaoMs / 1000) * 10) / 10);
  assert.deepEqual(frameStats([]), { fps: 0, fps1: 0, travadas: 0, quadros: 0, duracaoMs: 0 });
});

test('score: 60 FPS lisos dão 100; o FPS acima de 60 não ganha nota a mais; travadas descontam', () => {
  const smooth = frameStats(Array(3600).fill(1000 / 60));
  assert.equal(score(smooth), 100);
  assert.equal(score(frameStats(Array(7200).fill(1000 / 120))), 100);
  const half = frameStats(Array(1800).fill(1000 / 30));
  assert.equal(score(half), 60); // 0,5·0,5 + 0,3·0,5 + 0,2·1
  const hitchy = frameStats([...Array(3540).fill(1000 / 60), ...Array(60).fill(80)]);
  assert.ok(score(hitchy) < 90 && score(hitchy) > 40);
  assert.equal(score(frameStats([])), 0);
});

test('verdict: faixas da nota', () => {
  assert.equal(verdict(100).label, 'Ótimo');
  assert.equal(verdict(85).label, 'Ótimo');
  assert.equal(verdict(70).label, 'Bom');
  assert.equal(verdict(50).quality, 'fair');
  assert.equal(verdict(10).quality, 'poor');
});

test('displayHz: a mediana encaixada na taxa comum mais perto', () => {
  assert.equal(displayHz(Array(40).fill(16.7)), 60);
  assert.equal(displayHz([...Array(39).fill(8.33), 200]), 120);
  assert.equal(displayHz(Array(40).fill(11.1)), 90);
  assert.equal(displayHz([16, 16]), null);
});

test('parseAgent: navegador e sistema em formato curto', () => {
  assert.deepEqual(parseAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'), { navegador: 'Chrome 131', sistema: 'Android 10' });
  assert.deepEqual(parseAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), { navegador: 'Safari 17.5', sistema: 'iOS 17.5' });
  assert.deepEqual(parseAgent('Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'), { navegador: 'Samsung Internet 25', sistema: 'Android 14' });
  assert.deepEqual(parseAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'), { navegador: 'Firefox 133', sistema: 'Windows' });
  assert.deepEqual(parseAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'), { navegador: 'Edge 131', sistema: 'Windows' });
});

test('roteiros: cada jogada simulada existe no laboratório e cada partida dura entre 1 e 2 minutos', () => {
  const plays = new Set(PLAY_BUTTONS.flatMap(([, list]) => list.map(([key]) => key)));
  for (const [mode, scenes] of Object.entries(SCRIPTS)) {
    let total = 0;
    for (const scene of scenes) for (const step of scene.steps) {
      if (step[0].startsWith('jogada:')) assert.ok(plays.has(step[0].slice('jogada:'.length)), `${mode}: ${step[0]}`);
      total += stepWait(step, () => 5000);
    }
    assert.ok(total > 60000 && total < 120000, `${mode}: ${total} ms`);
  }
  assert.equal(stepWait(['jogada:bolt'], () => 1350), 1350 + PLAY_GAP_MS);
  assert.equal(stepWait(['cheio', 2500], () => 0), 2500);
});
