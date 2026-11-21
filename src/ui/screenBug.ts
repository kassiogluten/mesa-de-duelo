// Brincadeira na partida (para quem joga e para quem assiste): de vez em quando, uma formiga ou um mosquito passa por um canto da tela, como se estivesse no monitor; quem o pega ganha os parabéns, e quem pega três na mesma partida vê um comboio de formigas levando uma carta da mesa.
import './screenBug.css';
import { effectsLevel } from './gpu/gpuSupport';

export type BugKind = 'ant' | 'mosquito';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
interface Point { x: number; y: number }
interface Frame extends Point { a: number; t: number; scale?: number }

/** Tamanho real do canto em que o inseto anda, em px: longe do meio da mesa, onde está o jogo. */
const CORNER = { w: 210, h: 150 };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/** Formiga vista de cima, com a frente para cima: cabeça, tórax, pecíolo, gáster, seis pernas em tripé e antenas dobradas. */
function antSVG(id: string) {
  // Pernas do lado esquerdo (o direito é o espelho): fêmur e tíbia, presas ao tórax.
  const legs: [string, string, string][] = [
    ['M-2.5 -7 L-8 -11 L-12.5 -19', '-2.5 -7', 'a'],
    ['M-3 -3 L-10 -3.5 L-15.5 2', '-3 -3', 'b'],
    ['M-2.5 1 L-8 6 L-12.5 17', '-2.5 1', 'a'],
  ];
  const leg = (d: string, at: string, group: string, mirror: boolean) => {
    // O giro é no ponto em que a perna sai do tórax, nas coordenadas do lado esquerdo (o espelho vem por fora).
    // O tripé: as pernas do grupo "a" de um lado andam com as "b" do outro; o espelho já inverte o sentido.
    const g = mirror ? (group === 'a' ? 'b' : 'a') : group;
    const s = g === 'a' ? 16 : -16;
    const swing = `${-s} ${at};${s} ${at};${-s} ${at}`;
    return `<path d="${d}"${mirror ? ' transform="scale(-1 1)"' : ''} class="bug-leg"><animateTransform attributeName="transform" type="rotate" additive="sum" dur="0.17s" values="${swing}" repeatCount="indefinite"/></path>`;
  };
  return `<svg viewBox="-20 -30 40 60" width="40" height="60" aria-hidden="true">
    <defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#5a4130"/><stop offset=".45" stop-color="#2a1d14"/><stop offset="1" stop-color="#0d0907"/></radialGradient></defs>
    <g class="bug-legs" stroke="#140e0a" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" fill="none">${legs.map(([d, at, g]) => leg(d, at, g, false) + leg(d, at, g, true)).join('')}</g>
    <g class="bug-antennae" stroke="#140e0a" stroke-width="0.9" stroke-linecap="round" fill="none"><path d="M-1.8 -19.5 L-4.5 -25 L-9.5 -28.5"/><path d="M1.8 -19.5 L4.5 -25 L9.5 -28.5"/></g>
    <g fill="url(#${id})">
      <ellipse cx="0" cy="16" rx="6.8" ry="10.4"/>
      <ellipse cx="0" cy="6.6" rx="1.9" ry="2"/>
      <ellipse cx="0" cy="-3" rx="3.4" ry="7"/>
      <ellipse cx="0" cy="-15" rx="5" ry="5.6"/>
    </g>
    <path d="M-2.6 -20 Q-1.4 -23 0 -21.4 Q1.4 -23 2.6 -20" stroke="#140e0a" stroke-width=".8" fill="none"/>
    <g fill="#fff" opacity=".22"><ellipse cx="-2.2" cy="11" rx="1.8" ry="3.4"/><ellipse cx="-1.6" cy="-17" rx="1.3" ry="1.6"/><ellipse cx="-1" cy="-6" rx=".8" ry="2.2"/></g>
  </svg>`;
}

/** Mosquito visto de cima: tromba, cabeça, tórax com a lira clara, abdome listrado, asas transparentes e pernas longas listradas. */
function mosquitoSVG() {
  const legs = ['M-1.4 -9 L-6 -14 L-13 -27', 'M-2 -7 L-9 -5 L-23 3', 'M-1.5 -5 L-7 3 L-15 23'];
  const leg = (d: string, mirror: boolean) => `<g${mirror ? ' transform="scale(-1 1)"' : ''}><path d="${d}" stroke="#3b332d"/><path d="${d}" stroke="#e9e6df" stroke-dasharray=".55 2.6" opacity=".7"/></g>`;
  const wing = (mirror: boolean) => `<g class="bug-wing"${mirror ? ' transform="scale(-1 1)"' : ''}>
      <ellipse cx="-2.6" cy="6" rx="2.4" ry="11.5" transform="rotate(-7 -1.2 -6)" fill="rgba(205,214,222,.16)" stroke="rgba(225,230,236,.45)" stroke-width=".3"/>
      <path d="M-1.6 -5 Q-3.6 6 -3 16" transform="rotate(-7 -1.2 -6)" stroke="rgba(225,230,236,.3)" stroke-width=".25" fill="none"/>
      <animateTransform attributeName="transform" type="rotate" additive="sum" dur="0.05s" values="62 -1.2 -6;22 -1.2 -6;62 -1.2 -6" repeatCount="indefinite" begin="indefinite" class="bug-flap"/>
    </g>`;
  return `<svg viewBox="-30 -30 60 60" width="60" height="60" aria-hidden="true">
    <g fill="none" stroke-width=".5" stroke-linecap="round" stroke-linejoin="round">${legs.map(d => leg(d, false) + leg(d, true)).join('')}</g>
    <line x1="0" y1="-16" x2="0" y2="-27.5" stroke="#2d2622" stroke-width=".55" stroke-linecap="round"/>
    <path d="M-.8 -15.6 L-3.2 -21 M.8 -15.6 L3.2 -21" stroke="#4a403a" stroke-width=".55" stroke-linecap="round"/>
    <ellipse cx="0" cy="6.5" rx="1.9" ry="10.2" fill="#2a221d"/>
    <g stroke="rgba(240,238,232,.75)" stroke-width=".55">${[0, 3.6, 7.2, 10.8].map(y => `<line x1="-1.7" y1="${y}" x2="1.7" y2="${y}"/>`).join('')}</g>
    <ellipse cx="0" cy="-8" rx="3" ry="4.3" fill="#2f2722"/>
    <path d="M-1.3 -11 Q-1.9 -8 -.7 -5.2 M1.3 -11 Q1.9 -8 .7 -5.2" stroke="rgba(240,238,232,.8)" stroke-width=".45" fill="none"/>
    <circle cx="0" cy="-14" r="2.2" fill="#221b17"/>
    ${wing(false)}${wing(true)}
  </svg>`;
}

/** Um ponto do canto, longe das bordas internas; `outside` põe o ponto fora da tela, de onde o inseto entra ou para onde sai. */
function cornerPoint(corner: Corner, w: number, h: number, edge: 'side' | 'end' | 'inside', size: number): Point {
  const right = corner.endsWith('r'), bottom = corner.startsWith('b');
  const off = size + 6;
  const fromX = (d: number) => right ? w - d : d, fromY = (d: number) => bottom ? h - d : d;
  if (edge === 'side') return { x: right ? w + off : -off, y: fromY(rand(30, CORNER.h - 20)) };
  if (edge === 'end') return { x: fromX(rand(30, CORNER.w - 30)), y: bottom ? h + off : -off };
  return { x: fromX(rand(35, CORNER.w - 50)), y: fromY(rand(30, CORNER.h - 35)) };
}

/** Caminho de formiga: passos curtos com o rumo variando um pouco e puxando para o alvo, até sair da tela. */
function antWalk(from: Point, via: Point, to: Point, speed: number, w: number, h: number): Frame[] {
  const frames: Frame[] = [];
  let p = { ...from }, a = Math.atan2(via.y - from.y, via.x - from.x), t = 0, target = via, pauses = Math.random() < .8 ? 1 + Math.round(Math.random()) : 0;
  const step = 5;
  for (let i = 0; i < 400; i++) {
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    let d = want - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    a += d * .22 + rand(-.32, .32);
    p = { x: p.x + Math.cos(a) * step, y: p.y + Math.sin(a) * step };
    t += step / (speed * rand(.85, 1.15));
    frames.push({ ...p, a, t });
    if (target === via && Math.hypot(via.x - p.x, via.y - p.y) < 14) {
      target = to;
      // Para um pouco, mexendo as antenas, como quem confere o caminho.
      if (pauses-- > 0) { t += rand(.7, 1.8); frames.push({ ...p, a, t }); }
    }
    const out = p.x < -30 || p.y < -30 || p.x > w + 30 || p.y > h + 30;
    if (target === to && out) break;
  }
  return frames;
}

/** Voo de mosquito: zigue-zague rápido, um pouco maior (mais perto de quem olha), até o ponto de pouso ou para fora da tela. */
function flight(from: Point, to: Point, t0: number, landing: boolean): Frame[] {
  const frames: Frame[] = [];
  const dist = Math.hypot(to.x - from.x, to.y - from.y), n = Math.max(6, Math.round(dist / 22));
  let t = t0;
  for (let i = 1; i <= n; i++) {
    const k = i / n, jitter = (1 - (landing ? k * k : 0)) * 22;
    const x = from.x + (to.x - from.x) * k + (i < n ? rand(-jitter, jitter) : 0), y = from.y + (to.y - from.y) * k + (i < n ? rand(-jitter, jitter) : 0);
    const prev = frames[frames.length - 1] ?? { ...from };
    t += Math.hypot(x - prev.x, y - prev.y) / rand(150, 230);
    frames.push({ x, y, a: Math.atan2(y - prev.y, x - prev.x) + rand(-.5, .5), t, scale: landing && i === n ? 1 : 1.35 });
  }
  return frames;
}

/** Os quadros viram uma animação só de transform (a placa de vídeo anima sozinha), com o ângulo sem saltos de volta inteira. */
function animate(el: HTMLElement, frames: Frame[], zoom: number) {
  const total = frames[frames.length - 1]!.t || 1;
  let last = frames[0]!.a;
  const keyframes = frames.map(f => {
    let a = f.a; while (a - last > Math.PI) a -= 2 * Math.PI; while (a - last < -Math.PI) a += 2 * Math.PI; last = a;
    return { offset: f.t / total, transform: `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) rotate(${(a * 180 / Math.PI + 90).toFixed(1)}deg) scale(${((f.scale ?? 1) * zoom).toFixed(3)})` };
  });
  return el.animate(keyframes, { duration: total * 1000, easing: 'linear', fill: 'forwards' });
}

let ids = 0;

/**
 * Um inseto passa pelo canto da tela e some. `zoom` só para a página de teste (ver de perto). Resolve quando ele sai.
 * Fica de fora com "reduzir movimento" e com Efeitos leves.
 */
export async function crawl(host: HTMLElement, kind: BugKind, opts: { corner?: Corner; zoom?: number; force?: boolean } = {}): Promise<boolean> {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!opts.force && (reduced || effectsLevel() === 'light')) return false;
  const zoom = opts.zoom ?? 1, corner = opts.corner ?? pick(['bl', 'br', 'tl', 'tr'] as const);
  const w = innerWidth, h = innerHeight;
  const el = document.createElement('div');
  el.className = `screen-bug ${kind}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="bug-shadow"></div>${kind === 'ant' ? antSVG(`bug-ant-${++ids}`) : mosquitoSVG()}<div class="bug-hit"></div>`;
  host.append(el);
  const svg = el.querySelector('svg')!, hit = el.querySelector<HTMLElement>('.bug-hit')!;
  const timers: number[] = [];
  const at = (s: number, fn: () => void) => timers.push(window.setTimeout(fn, s * 1000));
  let main: Animation | null = null, caught: Promise<void> | null = null;
  // Quem consegue acertar o inseto o pega: ele encolhe e some, e a mesa dá os parabéns ali perto.
  hit.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (caught) return;
    main?.pause(); svg.pauseAnimations();
    const r = hit.getBoundingClientRect();
    found(r.left + r.width / 2, r.top + r.height / 2);
    caught = svg.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.35) rotate(25deg)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => { main?.finish(); }, () => { main?.finish(); });
  });
  hit.addEventListener('click', e => e.stopPropagation());
  try {
    if (kind === 'ant') {
      const frames = antWalk(cornerPoint(corner, w, h, Math.random() < .5 ? 'side' : 'end', 30 * zoom), cornerPoint(corner, w, h, 'inside', 0), cornerPoint(corner, w, h, Math.random() < .5 ? 'end' : 'side', 30 * zoom), rand(34, 52), w, h);
      // Nas paradas, as pernas param (a animação do SVG pausa) e as antenas continuam (CSS).
      frames.forEach((f, i) => { const prev = frames[i - 1]; if (prev && prev.x === f.x && prev.y === f.y) { at(prev.t, () => svg.pauseAnimations()); at(f.t, () => svg.unpauseAnimations()); } });
      main = animate(el, frames, zoom);
      await main.finished;
    } else {
      const land = cornerPoint(corner, w, h, 'inside', 0);
      const inFlight = flight(cornerPoint(corner, w, h, 'side', 40 * zoom), land, 0, true);
      const landed = inFlight[inFlight.length - 1]!.t;
      // Pousado: fica parado uns segundos, dá uns passinhos e decola de novo para fora da tela.
      const stay = rand(2.2, 4), walkTo = { x: land.x + rand(-10, 10), y: land.y + rand(-10, 10) };
      const ground: Frame[] = [{ ...land, a: inFlight[inFlight.length - 1]!.a, t: landed + stay * .6, scale: 1 }, { ...walkTo, a: Math.atan2(walkTo.y - land.y, walkTo.x - land.x), t: landed + stay, scale: 1 }];
      const takeoff = landed + stay + .25;
      const away = flight(walkTo, cornerPoint(corner, w, h, 'end', 40 * zoom), takeoff, false);
      const frames = [{ ...inFlight[0]!, t: 0 }, ...inFlight, ...ground, { ...walkTo, a: ground[1]!.a, t: takeoff, scale: 1.1 }, ...away];
      const flaps = [...svg.querySelectorAll<SVGAnimationElement>('.bug-flap')];
      const fly = (on: boolean) => { el.classList.toggle('flying', on); flaps.forEach(f => on ? f.beginElement() : f.endElement()); };
      fly(true);
      at(landed, () => fly(false));
      at(takeoff - .2, () => fly(true));
      main = animate(el, frames, zoom);
      await main.finished;
    }
  } catch { /* a animação foi cancelada (página escondida, mesa desmontada) */ }
  finally { timers.forEach(clearTimeout); el.remove(); }
  return !!caught;
}

/** Quantos insetos pegar na mesma partida para as formigas virem buscar uma carta. */
export const CONVOY_CATCHES = 3;

/**
 * O comboio: uma fila de formigas atravessa a borda de baixo da tela carregando nas costas uma carta pequena da mesa (a
 * arte de uma permanente à vista; sem nenhuma, o verso). Resolve quando a última sai.
 */
export async function convoy(host: HTMLElement, opts: { zoom?: number; force?: boolean; toRight?: boolean } = {}) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!opts.force && (reduced || effectsLevel() === 'light')) return;
  const zoom = opts.zoom ?? 1, w = innerWidth, h = innerHeight, toRight = opts.toRight ?? Math.random() < .5;
  const ants = 8, gap = 15 * zoom, speed = 105 * zoom, carriers = [2, 3, 4];
  // Um caminho só para a fila inteira: rente à borda de baixo, numa onda suave.
  const from = toRight ? -30 * zoom : w + 30 * zoom, to = toRight ? w + 30 * zoom : -30 * zoom, base = h - 38 * zoom;
  const total = Math.abs(to - from) / speed, waves = Math.max(2, Math.round(w / 420));
  const points = Array.from({ length: 81 }, (_, i) => {
    const k = i / 80;
    return { offset: k, x: from + (to - from) * k, y: base + Math.sin(k * waves * Math.PI * 2) * 7 * zoom };
  });
  const path = points.map((p, i) => {
    const [a, b] = i < points.length - 1 ? [p, points[i + 1]!] : [points[i - 1]!, p];
    return { ...p, a: Math.atan2(b.y - a.y, b.x - a.x) };
  });
  const keyframes = (scale: number) => path.map(p => ({ offset: p.offset, transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${(p.a * 180 / Math.PI + 90).toFixed(1)}deg) scale(${scale})` }));
  const pieces: HTMLElement[] = [], runs: Promise<unknown>[] = [];
  const delay = (i: number) => i * gap / speed * 1000;
  for (let i = 0; i < ants; i++) {
    const el = document.createElement('div');
    el.className = 'screen-bug ant';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = antSVG(`bug-convoy-${++ids}`);
    host.append(el); pieces.push(el);
    runs.push(el.animate(keyframes(zoom), { duration: total * 1000, delay: delay(i), easing: 'linear', fill: 'both' }).finished);
  }
  const arts = [...document.querySelectorAll<HTMLElement>('.field .face[data-full]')].map(face => face.dataset.full!).filter(Boolean);
  const card = document.createElement('div');
  card.className = 'screen-bug-card';
  card.setAttribute('aria-hidden', 'true');
  const face = document.createElement('div');
  face.style.setProperty('--zoom', String(zoom));
  if (arts.length) { face.className = 'art'; face.style.backgroundImage = `url("${arts[Math.floor(Math.random() * arts.length)]}")`; }
  card.append(face);
  host.append(card); pieces.push(card);
  // A carta vai nas costas das formigas do meio, balançando um pouco com o passo delas.
  const middle = carriers.reduce((sum, i) => sum + delay(i), 0) / carriers.length;
  runs.push(card.animate(keyframes(1), { duration: total * 1000, delay: middle, easing: 'linear', fill: 'both' }).finished);
  face.animate([{ rotate: '-4deg' }, { rotate: '4deg' }], { duration: 420, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
  try { await Promise.all(runs); } catch { /* cancelada */ }
  finally { pieces.forEach(el => el.remove()); }
}

/** O aviso de quem pegou o inseto: perto de onde ele estava, sem sair da tela, e some sozinho. */
function found(x: number, y: number) {
  const toast = document.createElement('div');
  toast.className = 'screen-bug-found';
  toast.setAttribute('role', 'status');
  toast.textContent = 'Parabéns! Você achou um easter egg.';
  document.body.append(toast);
  const r = toast.getBoundingClientRect(), clamp = (v: number, max: number) => Math.min(Math.max(8, v), max - 8);
  toast.style.left = `${clamp(x - r.width / 2, innerWidth - r.width)}px`;
  toast.style.top = `${clamp(y - r.height - 22, innerHeight - r.height)}px`;
  window.setTimeout(() => toast.classList.add('out'), 3200);
  window.setTimeout(() => toast.remove(), 3700);
}

/**
 * Na partida: um inseto de vez em quando (o primeiro depois de uns minutos, depois a cada 4 a 8),
 * só com a aba à vista. `watching` diz, a cada conferida, se há uma partida aberta na tela agora.
 */
export function startScreenBugs(host: HTMLElement, watching: () => boolean, opts: { first?: [number, number]; every?: [number, number]; match?: () => string } = {}) {
  const first = opts.first ?? [90, 180], every = opts.every ?? [240, 480];
  let next = Date.now() + rand(first[0], first[1]) * 1000, busy = false, stopped = false;
  // Quantos insetos foram pegos em cada partida: o terceiro chama o comboio.
  let catches = { match: '', count: 0 };
  const caught = async () => {
    const match = opts.match?.() ?? '';
    catches = { match, count: catches.match === match ? catches.count + 1 : 1 };
    if (catches.count !== CONVOY_CATCHES) return;
    await new Promise(r => setTimeout(r, 1500));
    await convoy(host);
  };
  const tick = window.setInterval(() => {
    if (stopped || busy) return;
    if (!watching()) { next = Math.max(next, Date.now() + rand(first[0], first[1]) * 1000 * .5); return; }
    if (Date.now() < next || document.visibilityState !== 'visible') return;
    busy = true;
    void crawl(host, Math.random() < .6 ? 'ant' : 'mosquito').then(got => got ? caught() : undefined)
      .finally(() => { busy = false; next = Date.now() + rand(every[0], every[1]) * 1000; });
  }, 5000);
  return () => { stopped = true; clearInterval(tick); };
}
