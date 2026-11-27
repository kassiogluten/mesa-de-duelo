// Teste de desempenho (/desempenho, no menu ⋯): uma partida simulada roda sozinha na mesa de verdade (o laboratório de efeitos, num quadro), mede os quadros e mostra a nota do aparelho, que também vai para a área de admin.
import '../../src/style.css';
import './benchmark.css';
import { version } from '../../package.json';
import { enterLandscape } from '../../src/ui/landscape';
import { sendBenchmark, type BenchmarkResult } from '../../src/benchmarkReport';
import { displayHz, frameStats, parseAgent, score, SCRIPTS, stepWait, verdict, type Mode } from './benchmarkMath';

/*
 * A partida é o laboratório de efeitos (effects-lab.html?mesa, com ?jogadores=4 no Commander), que esta página guia
 * pelo `lab.run` de lá, no ritmo do roteiro (benchmarkMath.ts). Os quadros são contados aqui, com o
 * requestAnimationFrame desta página: o quadro é da mesma origem e anda no mesmo processo, então um quadro que a mesa
 * atrasa atrasa aqui também. Antes de contar, a mesa enche o campo uma vez, para as imagens das cartas já estarem
 * baixadas. ?modo=duelo ou ?modo=commander começa direto (depois de um toque, no celular).
 */

const root = document.querySelector<HTMLElement>('#bench')!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (n: number, digits = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const MODE_NAMES: Record<Mode, string> = { duelo: 'Duelo', commander: 'Commander' };
const LEVEL_NAMES: Record<string, string> = { auto: 'Automático', full: 'Completos', light: 'Leves' };
const isMobile = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 900;
const portrait = () => matchMedia('(orientation: portrait)').matches;

// ---------------------------------------------------------------- aparelho
type Device = BenchmarkResult['aparelho'];
let device: Device = baseDevice();
let hz: number | null = null;

function baseDevice(): Device {
  const { navegador, sistema } = parseAgent(navigator.userAgent);
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    tela: `${screen.width}x${screen.height}@${Math.round(devicePixelRatio * 100) / 100}`,
    nucleos: nav.hardwareConcurrency || null, memoria: nav.deviceMemory ?? null, gpu: gpuName(),
    navegador, sistema, modelo: null, movel: isMobile(), hz: null,
  };
}
/** O nome da placa de vídeo, quando o navegador conta (o Firefox e o Safari costumam dar um nome genérico). */
function gpuName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // "ANGLE (Qualcomm, Adreno (TM) 610, OpenGL ES 3.2)" → "Adreno (TM) 610"
    // "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti (0x00002803) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "NVIDIA GeForce RTX 4060 Ti"
    const short = name.match(/^ANGLE \([^,]+, ([^,]+?)(?: Direct3D.*| OpenGL.*)?,/)?.[1] ?? name;
    return short.replace(/\s*\(0x[0-9a-f]+\)/i, '').trim().slice(0, 120) || null;
  } catch { return null; }
}
/** No Chrome, o modelo do celular e a versão de verdade do sistema (o user agent do Android diz sempre "Android 10"). */
async function refineDevice() {
  const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<Record<string, string>> } }).userAgentData;
  if (!data) return;
  try {
    const v = await data.getHighEntropyValues(['model', 'platformVersion', 'platform']);
    if (v.model) device.modelo = v.model.slice(0, 60);
    const major = Number(v.platformVersion?.split('.')[0]);
    if (v.platform === 'Android' && major) device.sistema = `Android ${major}`;
    if (v.platform === 'Windows' && major) device.sistema = major >= 13 ? 'Windows 11' : 'Windows 10';
  } catch { /* fica o que o user agent disse */ }
}
/** A taxa da tela, medida com a página parada (meio segundo de quadros). */
function measureHz() {
  const intervals: number[] = [];
  let last = 0;
  const tick = (t: number) => {
    if (last) intervals.push(t - last);
    last = t;
    if (intervals.length < 40) requestAnimationFrame(tick);
    else { hz = displayHz(intervals); device.hz = hz; const el = root.querySelector('[data-device]'); if (el) el.innerHTML = deviceLine(); }
  };
  requestAnimationFrame(tick);
}
function deviceLine() {
  const d = device;
  return [d.modelo, d.sistema, d.navegador, d.gpu, `tela ${d.tela.replace('x', '×').replace(/@(.*)$/, ' ($1x)')}`, d.nucleos && `${d.nucleos} núcleos`, d.memoria && `${num(d.memoria)} GB`, d.hz && `${d.hz} Hz`]
    .filter(Boolean).map(esc).join(' · ');
}

// ---------------------------------------------------------------- tela inicial
function home(notice = '') {
  document.title = 'Teste de desempenho · Mesa de Duelo';
  root.innerHTML = `<div class="bench-page">
    <a class="bench-back" href="/">← Voltar à mesa</a>
    <h1>Teste de desempenho</h1>
    <p class="bench-lead">Uma partida simulada roda sozinha na mesa por cerca de um minuto e meio, com mágicas, combates, campo cheio e limpa campo. No fim aparece uma nota de 0 a 100 de como a mesa se sai neste aparelho.</p>
    ${notice ? `<p class="bench-note warn" role="status">${esc(notice)}</p>` : ''}
    <div class="bench-modes">
      <button class="bench-mode" data-mode="duelo"><b>Duelo</b><span>Você contra um oponente, como na maioria das partidas.</span><span class="bench-go">Começar ›</span></button>
      <button class="bench-mode" data-mode="commander"><b>Commander</b><span>Quatro jogadores com o campo cheio: a mesa mais pesada.</span><span class="bench-go">Começar ›</span></button>
    </div>
    <p class="bench-note">Deixe o aparelho parado e com a tela ligada; outros apps abertos deixam a nota mais baixa. Na partida simulada a mesa usa as suas Opções de efeitos.</p>
    ${isMobile() ? '<p class="bench-note">No celular, a mesa roda com a tela deitada: gire o aparelho quando ela abrir.</p>' : ''}
    <p class="bench-note">O resultado vai para a equipe da Mesa de Duelo junto com o modelo do aparelho, para sabermos onde a mesa precisa ficar mais leve. Nada da sua conta vai junto.</p>
    <p class="bench-device" data-device>${deviceLine()}</p>
  </div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => void start(b.dataset.mode as Mode)));
}

// ---------------------------------------------------------------- partida
interface LabHook { run(play: string): void; duration(key: string): number; effects(): { level: string; tier: number } }

async function start(mode: Mode) {
  await enterLandscape();
  const scenes = SCRIPTS[mode];
  root.innerHTML = `<div class="bench-run">
    <iframe title="Partida simulada" src="/tests/fixtures/effects-lab.html?mesa${mode === 'commander' ? '&jogadores=4' : ''}"></iframe>
    <div class="bench-bar" role="status" aria-live="polite"><span data-scene>Preparando a mesa…</span><span class="bench-bar-track"><span class="bench-bar-fill"></span></span><button type="button" data-stop>Parar</button></div>
  </div>`;
  const frame = root.querySelector('iframe')!, sceneEl = root.querySelector<HTMLElement>('[data-scene]')!, fill = root.querySelector<HTMLElement>('.bench-bar-fill')!;

  let cancelled = false, raf = 0;
  const waits: number[] = [];
  const sleep = (ms: number) => new Promise<void>(resolve => { waits.push(window.setTimeout(resolve, ms)); });
  const cancel = (notice: string) => {
    if (cancelled) return;
    cancelled = true;
    waits.forEach(clearTimeout); cancelAnimationFrame(raf);     document.removeEventListener('visibilitychange', hidden);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    home(notice);
  };
  const hidden = () => { if (document.hidden) cancel('O teste parou porque a página saiu da tela. Comece de novo e deixe a tela ligada até o fim.'); };
  document.addEventListener('visibilitychange', hidden);
  root.querySelector('[data-stop]')!.addEventListener('click', () => cancel(''));

  // A mesa do quadro pronta para receber as jogadas.
  const lab = await new Promise<LabHook | null>(resolve => {
    const t0 = performance.now();
    const look = () => {
      if (cancelled) return resolve(null);
      const hook = (frame.contentWindow as (Window & { lab?: LabHook }) | null)?.lab;
      if (hook) return resolve(hook);
      if (performance.now() - t0 > 30000) return resolve(null);
      window.setTimeout(look, 150);
    };
    look();
  });
  if (cancelled) return;
  if (!lab) { cancel('A mesa não abriu. Confira a internet e tente de novo.'); return; }

  // No celular a mesa é jogada deitada: onde a tela não trava sozinha (iPhone), espera girar.
  while (isMobile() && portrait()) {
    sceneEl.textContent = 'Gire o aparelho para começar';
    await sleep(300);
    if (cancelled) return;
  }
  sceneEl.textContent = 'Preparando a mesa…';
  // Aquecimento fora da conta: o campo cheio baixa a maior parte das imagens.
  lab.run('cheio');
  await sleep(4000);
  if (cancelled) return;

  const plan = scenes.map(scene => scene.steps.map(step => stepWait(step, lab.duration)));
  const total = plan.flat().reduce((a, b) => a + b, 0);
  const perScene: number[][] = scenes.map(() => []);
  let current = 0, last = 0, elapsed = 0, worstTier = 0;
  const level = lab.effects().level;
  const tick = (t: number) => {
    if (last) perScene[current]!.push(t - last);
    last = t;
    worstTier = Math.max(worstTier, lab.effects().tier);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  for (let s = 0; s < scenes.length; s++) {
    current = s;
    sceneEl.textContent = `${scenes[s]!.name} · ${s + 1}/${scenes.length}`;
    for (let i = 0; i < scenes[s]!.steps.length; i++) {
      lab.run(scenes[s]!.steps[i]![0]);
      const wait = plan[s]![i]!;
      fill.style.transition = `width ${wait}ms linear`;
      elapsed += wait;
      fill.style.width = `${(elapsed / total) * 100}%`;
      await sleep(wait);
      if (cancelled) return;
    }
  }
  cancelAnimationFrame(raf);
  document.removeEventListener('visibilitychange', hidden);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});

  const all = frameStats(perScene.flat());
  const result: BenchmarkResult = {
    versao: version, modo: mode, nota: score(all), fps: all.fps, fps1: all.fps1, travadas: all.travadas, quadros: all.quadros, duracaoMs: all.duracaoMs,
    degrau: level === 'auto' ? Math.min(3, worstTier) as 0 | 1 | 2 | 3 : null, efeitos: level, aparelho: { ...device },
    cenas: scenes.map((scene, i) => { const st = frameStats(perScene[i]!); return { nome: scene.name, fps: st.fps, fps1: st.fps1, travadas: st.travadas }; }),
  };
  showResult(result, mode);
}

// ---------------------------------------------------------------- resultado
const fpsQuality = (fps: number) => fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor';

function effectsText(r: BenchmarkResult) {
  const name = LEVEL_NAMES[r.efeitos] ?? r.efeitos;
  if (r.degrau === null) return name;
  return r.degrau ? `${name}, desceu até E${r.degrau}` : `${name}, todos os efeitos`;
}

function copyText(r: BenchmarkResult) {
  const v = verdict(r.nota);
  return [
    `Mesa de Duelo · teste de desempenho (${MODE_NAMES[r.modo]}) · versão ${r.versao}`,
    `Nota ${r.nota} (${v.label}) · ${num(r.fps, 1)} FPS · 1% mais lentos ${num(r.fps1, 1)} FPS · ${r.travadas} travadas`,
    `Efeitos: ${effectsText(r)}`,
    `Aparelho: ${deviceLine().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')}`,
    ...r.cenas.map(c => `  ${c.nome}: ${num(c.fps, 1)} FPS · 1% ${num(c.fps1, 1)} · ${c.travadas} travadas`),
  ].join('\n');
}

function showResult(r: BenchmarkResult, mode: Mode, send = true) {
  const v = verdict(r.nota);
  document.title = `Nota ${r.nota} · Teste de desempenho`;
  root.innerHTML = `<div class="bench-page">
    <a class="bench-back" href="/">← Voltar à mesa</a>
    <h1>Resultado · ${MODE_NAMES[mode]}</h1>
    <div class="bench-score" data-quality="${v.quality}">
      <div class="bench-score-num">${r.nota}<small>/100</small></div>
      <div><p class="bench-score-label">${v.label}</p><p class="bench-score-tip">${esc(v.tip)}</p></div>
    </div>
    <div class="bench-stats">
      <div class="bench-stat"><b>${num(r.fps, 1)}</b><span>FPS médio</span></div>
      <div class="bench-stat"><b>${num(r.fps1, 1)}</b><span>FPS no 1% mais lento</span></div>
      <div class="bench-stat"><b>${r.travadas}</b><span>travadas (quadros de mais de 50 ms)</span></div>
      <div class="bench-stat"><b>${r.degrau === null ? esc(LEVEL_NAMES[r.efeitos] ?? r.efeitos) : `E${r.degrau}`}</b><span>${r.degrau === null ? 'efeitos (fixos nas Opções)' : r.degrau ? `efeitos: o automático desceu até o degrau ${r.degrau}` : 'efeitos: todos, sem precisar aliviar'}</span></div>
    </div>
    <table class="bench-scenes">
      <thead><tr><th>Parte da partida</th><th>FPS</th><th>1% mais lento</th><th>Travadas</th></tr></thead>
      <tbody>${r.cenas.map(c => `<tr><td>${esc(c.nome)}</td><td data-quality="${fpsQuality(c.fps)}">${num(c.fps, 1)}</td><td data-quality="${fpsQuality(c.fps1)}">${num(c.fps1, 1)}</td><td>${c.travadas}</td></tr>`).join('')}</tbody>
    </table>
    <div class="bench-actions">
      <button type="button" class="arena-btn primary" data-again>Rodar de novo</button>
      <button type="button" class="arena-btn secondary" data-other>${mode === 'duelo' ? 'Testar o Commander' : 'Testar o Duelo'}</button>
      <button type="button" class="arena-btn secondary" data-copy>Copiar resultado</button>
    </div>
    <p class="bench-sent" data-sent role="status">Enviando o resultado à equipe…</p>
    <p class="bench-device">${deviceLine()} · versão ${esc(r.versao)}</p>
  </div>`;
  root.querySelector('[data-again]')!.addEventListener('click', () => void start(mode));
  root.querySelector('[data-other]')!.addEventListener('click', () => void start(mode === 'duelo' ? 'commander' : 'duelo'));
  const copy = root.querySelector<HTMLButtonElement>('[data-copy]')!;
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(copyText(r)); copy.textContent = 'Copiado'; }
    catch { copy.textContent = 'Não deu para copiar'; }
    window.setTimeout(() => { copy.textContent = 'Copiar resultado'; }, 2000);
  });
  const sent = root.querySelector<HTMLElement>('[data-sent]')!;
  if (!send) { sent.hidden = true; return; }
  void sendBenchmark(r).then(ok => {
    sent.textContent = ok ? 'Resultado enviado à equipe. Obrigado!' : 'Não deu para enviar o resultado agora (sem conexão com o servidor). Ele continua aqui para copiar.';
  });
}

// ---------------------------------------------------------------- começo
home();
// Para os prints das novidades e os testes: `fixture.result(resultado)` mostra a tela do resultado sem rodar a partida nem enviar.
Object.assign(window, { fixture: { result: (r: BenchmarkResult) => showResult(r, r.modo, false) } });
measureHz();
void refineDevice().then(() => { const el = root.querySelector('[data-device]'); if (el) el.innerHTML = deviceLine(); });
// Atalho para medir de fora (scripts, ou um link para um aparelho): ?modo=duelo começa direto. No celular a tela cheia
// precisa de um toque, então lá o atalho só deixa o botão em destaque.
const direct = new URLSearchParams(location.search).get('modo');
if (direct === 'duelo' || direct === 'commander') {
  if (isMobile()) root.querySelector<HTMLElement>(`[data-mode="${direct}"]`)?.focus();
  else void start(direct);
}
