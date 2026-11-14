#!/usr/bin/env node
// Medição (ROADMAP 125, fase 0): a fluidez da mesa enquanto os efeitos acontecem, no laboratório de efeitos
// (tests/fixtures/effects-lab.html?mesa&jogar=…), com a CPU na velocidade normal ou freada. É a base de comparação dos
// efeitos em CSS com os da camada GPU (docs/spec-mesa-webgl.md). Precisa do `npm run dev` ligado (ou TABLE_TEST_URL).
//
//   node scripts/medir-efeitos.mjs [opções]
//
//   --cpu 1,4,6           freio de CPU (1 = sem freio); uma medição por valor
//   --cenas dano,voos     só estas cenas (dano, voos, campo-cheio)
//   --vezes 3             quantas vezes medir cada cena em cada freio (a tabela mostra a mediana e a faixa)
//   --viewport 1366x768   tamanho da janela (CSS px)
//   --escala 1            pixels por pixel de CSS (1 ou 2)
//   --query gpu=0         acrescenta à página (para comparar versões: gpu=0, gpu=1)
//   --json saida.json     grava as medições em JSON (uma por vez)
//
// A métrica principal são os quadros longos (long-animation-frame): o navegador sem tela trava em 60 quadros por
// segundo, então o intervalo entre quadros só diz algo com o freio de CPU. O WebGL do navegador de testes é emulado na
// CPU (SwiftShader): os números servem para comparar antes e depois na mesma máquina, não como valor absoluto.
//
// Só conta o que começa na primeira jogada de verdade (3,1 s depois de carregar): o carregamento da página e a mão dada
// antes (`deal`) ficam de fora. Antes e depois da cena, um laço de CPU de tamanho fixo é cronometrado na página e
// comparado com o da medição sem freio: a coluna "freio medido" confere que o freio valeu do começo ao fim.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLE_URL } from '../tests/browser-helper.mjs';

const SCENES = {
  dano: 'land,bolt,bolt,move:attack,x:fight,move:destroy',
  voos: 'land,x:opening,land,creature,countered,move:bounce,x:reanimate',
  'campo-cheio': 'cheio,cheio,tokens:20,move:attack,move:destroy',
};

const opts = { cpu: '1', cenas: Object.keys(SCENES).join(','), vezes: '1', viewport: '1366x768', escala: '1', query: '', json: '' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i];
const rates = opts.cpu.split(',').map(Number).filter(n => n >= 1);
const scenes = opts.cenas.split(',').filter(name => SCENES[name]);
const times = Math.max(1, Number(opts.vezes) || 1);
if (!rates.length || !scenes.length) { console.error('Uso: node scripts/medir-efeitos.mjs [--cpu 1,4,6] [--cenas dano,voos,campo-cheio] [--vezes 3] [--viewport 1366x768] [--escala 1] [--query gpu=0] [--json saida.json]'); process.exit(1); }

const CLI = fileURLToPath(new URL('../node_modules/agent-browser/bin/agent-browser.js', import.meta.url));
const session = `medir-efeitos-${process.pid}`;
const cli = a => [CLI, '--session', session, ...a];
execFileSync(process.execPath, cli(['open', 'about:blank']), { stdio: 'ignore' });
const run = (...a) => execFileSync(process.execPath, cli(a), { encoding: 'utf8' }).trim();
const evaluate = code => JSON.parse(execFileSync(process.execPath, cli(['eval', '--stdin']), { input: `(async () => {${code}})()`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim());

/**
 * O freio de CPU, pelo protocolo do Chrome (o agent-browser não tem o comando). A conexão fica aberta até o fim da
 * medição: o freio vale enquanto a sessão estiver presa à página.
 */
async function throttle(rate) {
  const ws = new WebSocket(run('get', 'cdp-url'));
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', () => reject(new Error('sem conexão com o protocolo do Chrome')), { once: true }); });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise(resolve => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { result } = await send('Target.getTargets');
  let pages = 0;
  for (const target of result.targetInfos.filter(t => t.type === 'page')) {
    const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const set = await send('Emulation.setCPUThrottlingRate', { rate }, attached.result.sessionId);
    if (!set.error) pages++;
  }
  if (!pages) throw new Error('não consegui frear a CPU de nenhuma página');
  return () => ws.close();
}

// A primeira jogada de verdade do `?jogar` (a mão dada sai aos 600 ms, a primeira jogada 2,5 s depois).
const FIRST_PLAY = 600 + 2500;

/** Mede uma cena uma vez: quadros longos, tarefas longas e intervalos entre quadros, da primeira jogada ao fim. */
async function measure(name, rate) {
  const plays = SCENES[name].split(',');
  const total = 600 + (plays.length + 1) * 2500 + 2000;
  const page = `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa&jogar=${plays.join(',')}${opts.query ? `&${opts.query}` : ''}`;
  // O freio é posto numa página parada da mesma origem e reaplicado logo depois de abrir a cena.
  run('open', `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa`);
  let release = rate > 1 ? await throttle(rate) : () => {};
  run('open', page);
  if (rate > 1) { release(); release = await throttle(rate); }
  try {
    // O eval devolve o texto JSON entre aspas: duas leituras.
    return JSON.parse(evaluate(`
      // Laço de CPU de tamanho fixo: o tempo dele mostra se o freio está valendo.
      const probe = () => { const t = performance.now(); let x = 0; for (let i = 0; i < 4e6; i++) x = (x + i * 7) % 1000003; return performance.now() - t + x * 0; };
      const probeBefore = probe();
      const from = ${FIRST_PLAY}, until = ${total};
      const frames = [], tasks = [], gaps = [];
      const supported = PerformanceObserver.supportedEntryTypes ?? [];
      const observers = [];
      const watch = (type, sink) => { if (!supported.includes(type)) return; const o = new PerformanceObserver(list => sink.push(...list.getEntries())); o.observe({ type, buffered: true }); observers.push([o, sink]); };
      watch('long-animation-frame', frames); watch('longtask', tasks);
      let last = performance.now(), running = true;
      const tick = now => { if (last >= from) gaps.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise(res => setTimeout(res, Math.max(0, until - performance.now())));
      running = false;
      for (const [o, sink] of observers) { sink.push(...o.takeRecords()); o.disconnect(); }
      const probeAfter = probe();
      // O que começou antes da primeira jogada (carregar a página, dar a mão) não conta.
      const inScene = list => list.filter(e => e.startTime >= from && e.startTime < until);
      const lf = inScene(frames), lt = inScene(tasks);
      const p = (list, q) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
      const durations = lf.map(f => f.duration);
      return JSON.stringify({
        loaf: supported.includes('long-animation-frame'), gpu: !!document.querySelector('canvas.gpu-layer'), elements: document.querySelectorAll('*').length,
        probeBefore, probeAfter, late: performance.now() > until + 1500,
        worst: lf.length ? (({ startTime, duration, blockingDuration, renderStart, styleAndLayoutStart, scripts }) => ({ at: Math.round(startTime), duration: Math.round(duration), blocking: Math.round(blockingDuration), render: Math.round(renderStart - startTime), layout: Math.round(styleAndLayoutStart - startTime), scripts: scripts.map(x => x.invoker + " " + Math.round(x.duration)) }))(lf.reduce((a, b) => b.duration > a.duration ? b : a)) : null,
        // Todos os quadros longos (só no --json): o momento diz qual jogada pesou (a jogada n sai aos 600 + n × 2500 ms).
        frames: lf.map(({ startTime, duration, blockingDuration, scripts }) => ({ at: Math.round(startTime), duration: Math.round(duration), blocking: Math.round(blockingDuration), scripts: scripts.filter(x => x.duration >= 5).map(x => (x.sourceFunctionName || x.invoker) + " " + Math.round(x.duration)) })),
        longFrames: lf.length, longFrameP95: p(durations, .95), longFrameMax: Math.max(0, ...durations),
        blocking: lf.reduce((n, f) => n + (f.blockingDuration ?? 0), 0), style: lf.reduce((n, f) => n + (f.styleAndLayoutStart ? f.startTime + f.duration - f.styleAndLayoutStart : 0), 0),
        longTasks: lt.length, longTaskMax: Math.max(0, ...lt.map(t => t.duration)),
        frameCount: gaps.length, gapP95: p(gaps, .95), gapMax: Math.max(0, ...gaps), slowGaps: gaps.filter(g => g > 34).length,
      });
    `));
  } finally { release(); }
}

const round = n => Math.round(n);
const median = list => { const s = [...list].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
/** "mediana (mín–máx)" das medições repetidas, ou o número sozinho quando não variou. */
const spread = (list, digits = 0) => {
  const f = n => n.toFixed(digits);
  const lo = f(Math.min(...list)), hi = f(Math.max(...list));
  return lo !== hi ? `${f(median(list))} (${lo}–${hi})` : f(median(list));
};

const [w, h] = opts.viewport.split('x').map(Number);
const rows = [], summary = [];
let baseProbe;
try {
  run('set', 'viewport', String(w), String(h), opts.escala);
  // Sem freio primeiro: o laço dela é a referência do "freio medido".
  for (const name of scenes) for (const rate of [...rates].sort((a, b) => a - b)) {
    const runs = [];
    for (let i = 0; i < times; i++) {
      const m = await measure(name, rate);
      if (!m.loaf) console.warn('Este navegador não mede quadros longos (long-animation-frame); valem só as tarefas longas e os intervalos.');
      if (m.late) console.warn('A medição terminou bem depois do previsto: a página ficou presa.');
      if (rate === 1) baseProbe ??= m.probeBefore;
      runs.push(m);
      rows.push({ cena: name, cpu: rate, vez: i + 1, versao: opts.query || 'padrão', ...m });
      if (m.worst) console.log('  pior quadro:', JSON.stringify(m.worst));
      console.log(`${name} com a CPU ${rate}× (${i + 1}/${times}): ${m.longFrames} quadros longos (p95 ${round(m.longFrameP95)} ms, pior ${round(m.longFrameMax)} ms), bloqueio ${round(m.blocking)} ms, ${m.longTasks} tarefas longas, laço ${round(m.probeBefore)}/${round(m.probeAfter)} ms`);
    }
    const col = key => runs.map(m => m[key]);
    summary.push({
      cena: name, cpu: `${rate}×`, versão: opts.query || 'padrão', vezes: runs.length,
      'quadros longos': spread(col('longFrames')), 'p95 (ms)': spread(col('longFrameP95')), 'pior (ms)': spread(col('longFrameMax')),
      'bloqueio (ms)': spread(col('blocking')), 'estilo e layout (ms)': spread(col('style')), 'tarefas longas': spread(col('longTasks')),
      'intervalos > 34 ms': spread(col('slowGaps')), 'intervalo p95 (ms)': spread(col('gapP95'), 1),
      'freio medido': baseProbe ? `${(median(col('probeBefore')) / baseProbe).toFixed(1)}× / ${(median(col('probeAfter')) / baseProbe).toFixed(1)}×` : '?',
      elementos: median(col('elements')), 'camada gpu': runs.some(m => m.gpu) ? 'sim' : 'não',
    });
  }
} finally {
  try { run('close'); } catch { /* o navegador já fechou */ }
}
console.table(summary);
if (opts.json) writeFileSync(opts.json, `${JSON.stringify(rows, null, 2)}\n`);
