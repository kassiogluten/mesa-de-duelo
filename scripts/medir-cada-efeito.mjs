#!/usr/bin/env node
// Medição de cada efeito sozinho (ROADMAP 134): quanto cada efeito da mesa custa, para escolher os que o degrau 1 do
// Efeitos: automático desliga. Precisa do `npm run dev` ligado (ou TABLE_TEST_URL).
//
//   node scripts/medir-cada-efeito.mjs [opções]
//
//   --mesa cheia,vazia     a mesa de fundo: "cheia" é o Campo cheio do laboratório (38 permanentes), "vazia" a mesa do começo
//   --cpu 1,4,6            freio de CPU; com 1, o rastro do Chrome mede o trabalho; freado, contam os quadros
//   --vezes 1              quantas vezes medir cada efeito (a tabela mostra a mediana)
//   --so destroy,win       só estes efeitos (os nomes da primeira coluna)
//   --grupo uma,sempre,gpu só estes grupos: "uma" (jogadas que pesam uma vez), "sempre" (estados contínuos) e "gpu"
//                          (cada peça da camada de efeitos sozinha, sem a jogada em volta)
//   --degrau 1             põe a mesa num degrau do Efeitos: automático (0 a 2), para medir o que ele tira
//   --css                  os efeitos em CSS (?gpu=0), para comparar com a camada: o que o degrau 1 trocaria por CSS
//   --placa emulada        "real" (padrão) usa a placa de vídeo do computador; "emulada" o WebGL na CPU (SwiftShader), que
//                          compõe a página sem placa e copia o canvas de volta a cada quadro: pesa contra a camada e não
//                          acontece num aparelho de verdade
//   --viewport 1366x768    tamanho da janela (CSS px)
//   --json saida.json      grava todas as medições
//
// Como mede: o laboratório de efeitos (tests/fixtures/effects-lab.html?mesa&gpu=1&viva=0&jogar=…) monta a mesa e dispara o
// efeito três vezes, a cada 2,5 s; um estado contínuo é ligado em todas as criaturas e a mesa fica parada. A janela
// medida tem 10 s. Cada medida é comparada com a mesma mesa sem efeito nenhum ("nada"), e a diferença é o custo:
// por vez nos efeitos que pesam uma vez, por segundo nos que pesam o tempo todo. Os efeitos são medidos sem a mesa viva
// (com o WebGL emulado, ela ocupa a placa quase o tempo todo e esconde o resto); ela entra como estado contínuo à parte.
//
// Colunas: "página" é o tempo da linha principal da página (scripts, estilo, layout, pintura), "desenho" a parte dele
// que é estilo, layout e pintura, "raster" a pintura em blocos, "placa" o processo da placa de vídeo (WebGL emulado na
// CPU: só serve para comparar), "camada" o tempo da página andando e desenhando a camada dos efeitos, "telas" a área
// que a camada pintou somada (uma tela inteira = 1; partículas sobrepostas somam: é o que pesa na placa de um celular),
// "objetos" o pico de peças vivas na camada, "quadros < 30" quantas janelas de meio segundo ficaram abaixo de 30
// quadros por segundo no pior quarto (a medida do regulador) e "longos" a soma dos quadros longos.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLE_URL } from '../tests/browser-helper.mjs';
import { connectCdp, traceWork } from './cdp-pagina.mjs';

/** [nome, grupo, jogada do ?jogar, o que é]. "uma": pesa uma vez; "sempre": fica rodando; "gpu": a peça da camada sozinha. */
const EFFECTS = [
  // Jogadas inteiras, como na partida (a carta voando, o que é CSS e o que é da camada).
  ['land', 'uma', 'land', 'Jogar terreno (voo e pouso)'],
  ['creature', 'uma', 'creature', 'Conjurar criatura (voo, redemoinho, pouso, enjoo)'],
  ['bolt', 'uma', 'bolt', 'Lightning Bolt (pilha, seta, projétil, faíscas, clarão)'],
  ['draw', 'uma', 'draw', 'Comprar uma carta'],
  ['destroy', 'uma', 'move:destroy', 'Destruir (racha, estilhaços, rastro de poeira)'],
  ['sacrifice', 'uma', 'move:sacrifice', 'Sacrificar (cinzas e brasas)'],
  ['exile', 'uma', 'move:exile', 'Exilar (portal em espiral)'],
  ['bounce', 'uma', 'move:bounce', 'Devolver à mão (voo e rastro)'],
  ['blink', 'uma', 'move:blink', 'Blink (some em luz e volta)'],
  ['attack', 'uma', 'move:attack', 'Atacar (bote, riscos, poeira)'],
  ['ninjutsu', 'uma', 'move:ninjutsu', 'Ninjutsu (fumaça, shuriken)'],
  ['tap', 'uma', 'move:tap', 'Virar (poeira)'],
  ['fight', 'uma', 'x:fight', 'Lutar'],
  ['block', 'uma', 'x:block', 'Bloquear'],
  ['combat', 'uma', 'dano:combat', 'Dano de combate no jogador'],
  ['lethal', 'uma', 'dano:lethal', 'Golpe letal (protegido)'],
  ['legend', 'uma', 'momento:legend', 'Lendária chegando (raios)'],
  ['big-spell', 'uma', 'momento:big', 'Mágica de valor 6 (mesa escurece, câmera)'],
  ['ultimate', 'uma', 'walker:ult', 'Ultimate do planeswalker (protegido)'],
  ['loyalty', 'uma', 'walker:plus', 'Lealdade +2'],
  ['tokens', 'uma', 'tokens:10', 'Criar 10 fichas'],
  ['turn', 'uma', 'turno', 'Passar o turno (luz da mesa desliza)'],
  ['scry', 'uma', 'x:scry', 'Vidência (leque)'],
  ['shuffle', 'uma', 'x:shuffle', 'Embaralhar'],
  ['coin', 'uma', 'x:coin', 'Moeda'],
  ['die', 'uma', 'x:die', 'Dado'],
  ['attach', 'uma', 'x:attach', 'Equipar / aura encaixando'],
  ['transform', 'uma', 'x:transform', 'Transformar'],
  ['counters', 'uma', 'x:counters', 'Marcadores'],
  ['search', 'uma', 'x:search', 'Buscar no grimório'],
  ['reanimate', 'uma', 'x:reanimate', 'Reanimar'],
  ['flashback', 'uma', 'x:flashback', 'Conjurar do cemitério'],
  ['pay', 'uma', 'x:pay', 'Pagar (mana em orbes)'],
  ['opening', 'uma', 'x:opening', 'Mão inicial'],
  ['win', 'uma', 'x:win', 'Vitória (raios e confete)'],
  ['lose', 'uma', 'x:lose', 'Derrota (racha e cinzas)'],
  // Estados que ficam rodando, ligados em todas as criaturas das duas mesas.
  ['sick', 'sempre', 'estado:sick', 'Enjoo de invocação (estrelinhas, aberração de cor)'],
  ['flying', 'sempre', 'estado:FLYING', 'Voar (vento)'],
  ['hexproof', 'sempre', 'estado:HEXPROOF', 'Resistência à magia (brilho)'],
  ['lifelink', 'sempre', 'estado:LIFELINK', 'Vínculo com a vida (seiva)'],
  ['ward', 'sempre', 'estado:WARD', 'Ward (runas)'],
  ['protection', 'sempre', 'estado:PROTECTION', 'Proteção (moldura)'],
  ['indestructible', 'sempre', 'estado:INDESTRUCTIBLE', 'Indestrutível (moldura)'],
  ['deathtouch', 'sempre', 'estado:DEATHTOUCH', 'Toque mortífero (névoa na base)'],
  ['targeted', 'sempre', 'estado:targeted', 'Alvo de algo na pilha (mira e setas)'],
  // Cada peça da camada dos efeitos, sozinha (sem a carta, o som nem o redesenho da mesa).
  ...[['burst', 'Faíscas do dano'], ['heavy', 'Faíscas do golpe pesado'], ['lethal', 'Faíscas do golpe letal'], ['bolt', 'Projétil com rastro'],
    ['ripple', 'Onda do pouso'], ['shatter', 'Estilhaços'], ['vortex', 'Portal do exílio'], ['gather', 'Volta do blink'], ['ash', 'Cinzas do sacrifício'],
    ['motes', 'Grãos da habilidade'], ['puff', 'Fumaça do ninja'], ['dust', 'Poeira ao virar'], ['flare', 'Brilho de chegada'], ['warp', 'Rasgo da dobra'],
    ['counter', 'Faíscas do marcador'], ['heal', 'Ganho de vida'], ['mana', 'Orbe de mana'], ['victory', 'Vitória'], ['defeat', 'Derrota'],
    ['dizzy', 'Estrelinhas do enjoo'], ['charge', 'Riscos do ataque'], ['beam', 'Feixe da habilidade'], ['trail-ember', 'Rastro de brasas'],
    ['glint', 'Redemoinho ao conjurar'], ['arrive', 'Anel de chegada'], ['streak', 'Risco do golpe'], ['shockwave', 'Onda do ultimate'],
    ['ward', 'Cúpula do ward'], ['ward-held', 'Ward segurou'], ['ward-paid', 'Ward pago']]
    .map(([kind, label]) => [`gpu:${kind}`, 'gpu', `gpu:${kind}`, label]),
];

const opts = { mesa: 'cheia', cpu: '1', vezes: '1', so: '', grupo: 'uma,sempre,gpu', viewport: '1366x768', json: '', css: false, placa: 'real', degrau: '0' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) if (args[i] === '--css') opts.css = true; else if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i];
const tables = opts.mesa.split(',').filter(m => m === 'cheia' || m === 'vazia');
const rates = opts.cpu.split(',').map(Number).filter(n => n >= 1);
const groups = new Set(opts.grupo.split(','));
const only = new Set(opts.so.split(',').filter(Boolean));
const times = Math.max(1, Number(opts.vezes) || 1);
const chosen = EFFECTS.filter(([name, group]) => groups.has(group) && (!only.size || only.has(name)));
if (!tables.length || !rates.length || !chosen.length) { console.error('Uso: node scripts/medir-cada-efeito.mjs [--mesa cheia,vazia] [--cpu 1,4,6] [--vezes 1] [--so destroy,win] [--grupo uma,sempre,gpu] [--json saida.json]'); process.exit(1); }

const CLI = fileURLToPath(new URL('../node_modules/agent-browser/bin/agent-browser.js', import.meta.url));
const session = `medir-cada-efeito-${process.pid}`;
const cli = a => [CLI, '--session', session, ...a];
// A placa de verdade (ANGLE sobre o OpenGL do sistema): com ela, o navegador sem tela também compõe a página na placa.
const REAL_GPU = ['--args', '--enable-gpu,--ignore-gpu-blocklist,--use-angle=gl-egl,--enable-gpu-rasterization'];
execFileSync(process.execPath, cli([...(opts.placa === 'real' ? REAL_GPU : []), 'open', 'about:blank']), { stdio: 'ignore' });
const run = (...a) => execFileSync(process.execPath, cli(a), { encoding: 'utf8' }).trim();
const evaluate = code => JSON.parse(execFileSync(process.execPath, cli(['eval', '--stdin']), { input: `(async () => {${code}})()`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim());

// As jogadas saem a cada 2,5 s depois da mão dada (600 ms): 1 a mesa, 2 a 4 o efeito (ou o estado e a mesa parada).
const STEP = 2500, DEAL = 600, WINDOW = 10000;

/** Mede uma vez: a mesa, o efeito (três vezes, ou o estado ligado) e a janela de 10 s. `play` null é a mesa sem nada. */
async function measure(play, group, table, rate, query = 'viva=0') {
  const plays = [table === 'cheia' ? 'cheio' : 'pausa', ...(group === 'sempre' ? [play, 'pausa', 'pausa', 'pausa', 'pausa'] : [play, play, play, 'pausa', 'pausa'])].map(p => p ?? 'pausa');
  // O estado contínuo precisa de um passo para assentar (a mesa redesenha e as animações começam).
  const from = DEAL + (group === 'sempre' ? 3 : 2) * STEP, until = from + WINDOW;
  const lab = `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa&gpu=${opts.css ? 0 : 1}`;
  const page = `${lab}&jogar=${plays.join(',')}${query ? `&${query}` : ''}`;
  run('open', lab);
  const cdp = await connectCdp(run('get', 'cdp-url'));
  try {
    if (rate > 1) await cdp.throttle(rate);
    const trace = rate === 1 ? await cdp.trace() : null;
    run('open', page);
    if (rate > 1) await cdp.throttle(rate);
    const m = JSON.parse(evaluate(`
      const gpu = window.gpu;
      for (let i = 0; i < 40 && !gpu.ready() && !${opts.css}; i++) await new Promise(res => setTimeout(res, 100));
      if (!gpu.ready() && !${opts.css}) await gpu.load();
      if (${Number(opts.degrau) || 0}) gpu.setTier(${Number(opts.degrau) || 0});
      const wait = at => new Promise(res => setTimeout(res, Math.max(0, at - performance.now())));
      await wait(${from});
      gpu.probe(true);
      const before = gpu.stats() ?? { work: 0, frames: 0 };
      const frames = [];
      const observer = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? new PerformanceObserver(list => frames.push(...list.getEntries())) : null;
      observer?.observe({ type: 'long-animation-frame' });
      // As janelas de meio segundo do regulador (frameClock.ts): quadros por segundo do pior quarto.
      const windows = []; let gaps = [], last = 0, start = 0, running = true;
      const lowFps = g => { const s = [...g].sort((a, b) => a - b); return s.length ? 1000 / s[Math.min(s.length - 1, Math.floor(s.length * .75))] : 0; };
      const tick = now => { if (last) gaps.push(now - last); last = now; start ||= now; if (now - start >= 500) { windows.push(lowFps(gaps)); gaps = []; start = now; } if (running) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      console.timeStamp('medir-inicio');
      await wait(${until});
      console.timeStamp('medir-fim');
      running = false;
      if (observer) { frames.push(...observer.takeRecords()); observer.disconnect(); }
      const after = gpu.stats() ?? { work: 0, frames: 0 }, probed = gpu.probed();
      gpu.probe(false);
      const long = frames.filter(f => f.startTime >= ${from} && f.startTime < ${until});
      return JSON.stringify({
        ready: gpu.ready(), layer: after.work - before.work, layerFrames: after.frames - before.frames,
        fill: probed.fill, objects: probed.peakObjects, textureMb: probed.peakTextureBytes / 1048576,
        slowWindows: windows.filter(f => f < 30).length, worstFps: Math.min(...windows), longSum: long.reduce((n, f) => n + f.duration, 0), longCount: long.length,
        elements: document.querySelectorAll('*').length,
      });
    `));
    if (trace) Object.assign(m, traceWork(await trace.stop(), { urlPart: 'effects-lab' }) ?? {});
    return m;
  } finally { cdp.close(); }
}

const KEYS = ['main', 'render', 'raster', 'gpu', 'layer', 'fill', 'objects', 'textureMb', 'slowWindows', 'longSum', 'worstFps'];
const median = list => { const s = list.filter(n => Number.isFinite(n)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
/** Uma medida, com uma segunda tentativa: a página pode recarregar no meio (o `npm run dev` viu um arquivo mudar). */
async function measureAgain(...a) {
  try { return await measure(...a); } catch (error) { console.warn(`  de novo: ${String(error.message).split('\n')[0]}`); return measure(...a); }
}
async function medianOf(play, group, table, rate, query) {
  const runs = [];
  for (let i = 0; i < times; i++) runs.push(await measureAgain(play, group, table, rate, query));
  if (!opts.css && runs.some(r => !r.ready)) console.warn(`  a camada não carregou em ${play ?? 'nada'}`);
  return Object.fromEntries(KEYS.map(k => [k, median(runs.map(r => r[k]))]));
}

const [w, h] = opts.viewport.split('x').map(Number);
const rows = [];
const fmt = (n, d = 0) => Number.isFinite(n) ? n.toFixed(d) : '–';
try {
  run('set', 'viewport', String(w), String(h), '1');
  for (const table of tables) for (const rate of rates) {
    const base = await medianOf(null, 'uma', table, rate);
    const baseStill = await medianOf(null, 'sempre', table, rate);
    // A mesa viva roda sempre: entra como estado contínuo, a mesa parada com ela contra a mesa parada sem ela.
    const ambience = await medianOf(null, 'sempre', table, rate, '');
    rows.push({ name: 'nada', group: 'base', table, rate, ...base }, { name: 'nada (parada)', group: 'base', table, rate, ...baseStill });
    if (groups.has('sempre') && (!only.size || only.has('mesa-viva'))) rows.push({ name: 'mesa-viva', group: 'sempre', table, rate, label: 'Mesa viva (luz, poeira, vinheta)', ...ambience });
    console.log(`mesa ${table}, CPU ${rate}×: base página ${fmt(base.main)} ms, placa ${fmt(base.gpu)} ms, janelas < 30: ${base.slowWindows}; com a mesa viva, página ${fmt(ambience.main)} ms, placa ${fmt(ambience.gpu)} ms`);
    for (const [name, group, play, label] of chosen) {
      const m = await medianOf(play, group, table, rate);
      rows.push({ name, group, table, rate, label, ...m });
      console.log(`  ${name}: página ${fmt(m.main)} ms, desenho ${fmt(m.render)}, raster ${fmt(m.raster)}, placa ${fmt(m.gpu)}, camada ${fmt(m.layer, 1)} ms, telas ${fmt(m.fill, 1)}, objetos ${m.objects}, janelas < 30: ${m.slowWindows}, longos ${fmt(m.longSum)} ms`);
    }
  }
} finally {
  try { run('close'); } catch { /* o navegador já fechou */ }
}

// As tabelas: a diferença para a mesa sem nada, por vez (pesa uma vez: três vezes na janela) ou por segundo (sempre).
for (const table of tables) for (const rate of rates) {
  const here = rows.filter(r => r.table === table && r.rate === rate);
  const base = here.find(r => r.name === 'nada'), still = here.find(r => r.name === 'nada (parada)');
  for (const group of ['uma', 'sempre', 'gpu']) {
    const list = here.filter(r => r.group === group);
    if (!list.length) continue;
    const ref = group === 'sempre' ? still : base, per = group === 'sempre' ? WINDOW / 1000 : 3;
    const d = (r, k, digits = 0) => fmt((r[k] - ref[k]) / per, digits);
    console.log(`\nMesa ${table}, CPU ${rate}×, ${group === 'sempre' ? 'estados contínuos (por segundo)' : group === 'gpu' ? 'peças da camada sozinhas (por vez)' : 'jogadas (por vez)'}:`);
    console.table(list.sort((a, b) => (b.main + b.gpu) - (a.main + a.gpu)).map(r => ({
      efeito: r.name, 'página (ms)': d(r, 'main'), 'desenho (ms)': d(r, 'render'), 'raster (ms)': d(r, 'raster'), 'placa (ms)': d(r, 'gpu'),
      'camada (ms)': fmt(r.layer / per, 1), telas: fmt(r.fill / per, 1), objetos: r.objects, 'texturas (MB)': fmt(r.textureMb, 1),
      'janelas < 30': r.slowWindows, 'longos (ms)': fmt(r.longSum),
    })));
  }
}
if (opts.json) writeFileSync(opts.json, `${JSON.stringify(rows, null, 2)}\n`);
