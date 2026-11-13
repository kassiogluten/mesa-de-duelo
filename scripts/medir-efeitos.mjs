#!/usr/bin/env node
// Medição (ROADMAP 125, fase 0): a fluidez da mesa enquanto os efeitos acontecem, no laboratório de efeitos
// (tests/fixtures/effects-lab.html?mesa&jogar=…), com a CPU na velocidade normal ou freada. É a base de comparação dos
// efeitos em CSS com os da camada GPU (docs/spec-mesa-webgl.md). Precisa do `npm run dev` ligado (ou TABLE_TEST_URL).
//
//   node scripts/medir-efeitos.mjs [opções]
//
//   --cpu 1,4,6           freio de CPU (1 = sem freio); uma medição por valor
//   --cenas dano,voos     só estas cenas (dano, voos, campo-cheio)
//   --viewport 1366x768   tamanho da janela (CSS px)
//   --escala 1            pixels por pixel de CSS (1 ou 2)
//   --query gpu=0         acrescenta à página (para comparar versões: gpu=0, gpu=1)
//   --json saida.json     grava as linhas em JSON
//
// A métrica principal são os quadros longos (long-animation-frame): o navegador sem tela trava em 60 quadros por
// segundo, então o intervalo entre quadros só diz algo com o freio de CPU. O WebGL do navegador de testes é emulado na
// CPU (SwiftShader): os números servem para comparar antes e depois na mesma máquina, não como valor absoluto.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLE_URL } from '../tests/browser-helper.mjs';

const SCENES = {
  dano: 'land,bolt,bolt,move:attack,x:fight,move:destroy',
  voos: 'land,x:opening,land,creature,countered,move:bounce,x:reanimate',
  'campo-cheio': 'cheio,cheio,tokens:20,move:attack,move:destroy',
};

const opts = { cpu: '1', cenas: Object.keys(SCENES).join(','), viewport: '1366x768', escala: '1', query: '', json: '' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i];
const rates = opts.cpu.split(',').map(Number).filter(n => n >= 1);
const scenes = opts.cenas.split(',').filter(name => SCENES[name]);
if (!rates.length || !scenes.length) { console.error('Uso: node scripts/medir-efeitos.mjs [--cpu 1,4,6] [--cenas dano,voos,campo-cheio] [--viewport 1366x768] [--escala 1] [--query gpu=0] [--json saida.json]'); process.exit(1); }

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

const [w, h] = opts.viewport.split('x').map(Number);
const rows = [];
try {
  run('set', 'viewport', String(w), String(h), opts.escala);
  for (const name of scenes) for (const rate of rates) {
    const plays = SCENES[name].split(',');
    // Uma jogada a cada 2,5 s, começando 600 ms depois de carregar e sempre com a mão dada antes (`deal`).
    const total = 600 + (plays.length + 1) * 2500 + 2000;
    const page = `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa&jogar=${plays.join(',')}${opts.query ? `&${opts.query}` : ''}`;
    // O freio é posto numa página parada da mesma origem e reaplicado logo depois de abrir a cena.
    run('open', `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa`);
    let release = rate > 1 ? await throttle(rate) : () => {};
    run('open', page);
    if (rate > 1) { release(); release = await throttle(rate); }
    const r = evaluate(`
      const started = performance.now();
      const frames = [], tasks = [], gaps = [];
      const supported = PerformanceObserver.supportedEntryTypes ?? [];
      const observers = [];
      const watch = (type, sink) => { if (!supported.includes(type)) return; const o = new PerformanceObserver(list => sink.push(...list.getEntries())); o.observe({ type, buffered: true }); observers.push(o); };
      watch('long-animation-frame', frames); watch('longtask', tasks);
      let last = performance.now(), running = true;
      const tick = now => { gaps.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise(res => setTimeout(res, ${total} - (performance.now() - started)));
      running = false;
      for (const o of observers) { const rest = o.takeRecords(); (o === observers[0] && supported.includes('long-animation-frame') ? frames : tasks).push(...rest); o.disconnect(); }
      const sorted = list => [...list].sort((a, b) => a - b);
      const p = (list, q) => { const s = sorted(list); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
      const durations = frames.map(f => f.duration);
      return JSON.stringify({
        loaf: supported.includes('long-animation-frame'), gpu: !!document.querySelector('canvas.gpu-layer'), elements: document.querySelectorAll('*').length,
        longFrames: frames.length, longFrameP95: p(durations, .95), longFrameMax: Math.max(0, ...durations),
        blocking: frames.reduce((n, f) => n + (f.blockingDuration ?? 0), 0), style: frames.reduce((n, f) => n + (f.styleAndLayoutStart ? f.startTime + f.duration - f.styleAndLayoutStart : 0), 0),
        longTasks: tasks.length, longTaskMax: Math.max(0, ...tasks.map(t => t.duration)),
        frameCount: gaps.length, gapP95: p(gaps, .95), gapMax: Math.max(0, ...gaps), slowGaps: gaps.filter(g => g > 34).length,
      });
    `);
    release();
    const m = JSON.parse(r), round = n => Math.round(n);
    if (!m.loaf) console.warn('Este navegador não mede quadros longos (long-animation-frame); valem só as tarefas longas e os intervalos.');
    rows.push({ cena: name, cpu: `${rate}×`, versão: opts.query || 'padrão', 'quadros longos': m.longFrames, 'p95 (ms)': round(m.longFrameP95), 'pior (ms)': round(m.longFrameMax),
      'bloqueio (ms)': round(m.blocking), 'estilo e layout (ms)': round(m.style), 'tarefas longas': m.longTasks, 'pior tarefa (ms)': round(m.longTaskMax),
      quadros: m.frameCount, 'intervalo p95 (ms)': +m.gapP95.toFixed(1), 'pior intervalo (ms)': round(m.gapMax), 'intervalos > 34 ms': m.slowGaps, elementos: m.elements, 'camada gpu': m.gpu ? 'sim' : 'não' });
    console.log(`${name} com a CPU ${rate}×: ${m.longFrames} quadros longos (p95 ${round(m.longFrameP95)} ms, pior ${round(m.longFrameMax)} ms), ${m.longTasks} tarefas longas, ${m.frameCount} quadros em ${(total / 1000).toFixed(1)} s`);
  }
} finally {
  try { run('close'); } catch { /* o navegador já fechou */ }
}
console.table(rows);
if (opts.json) writeFileSync(opts.json, `${JSON.stringify(rows, null, 2)}\n`);
