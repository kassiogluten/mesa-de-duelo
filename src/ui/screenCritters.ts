// Os bichos que atravessam a tela quando uma criatura do tipo deles entra no campo: o esquilo correndo aos pulos pela borda de baixo, o rato disparando e parando para farejar, a aranha descendo num fio e o morcego voando no alto.
import './screenCritters.css';
import { effectsLevel } from './gpu/gpuSupport';

export type CritterKind = 'squirrel' | 'rat' | 'spider' | 'bat';
export const CRITTERS: readonly CritterKind[] = ['squirrel', 'rat', 'spider', 'bat'];

interface Frame { x: number; y: number; a: number; t: number; flip?: boolean }
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Esquilo de lado, de frente para a direita: o rabo cheio em S, as patas de trás fortes e as de frente que se alternam. */
function squirrelSVG() {
  const leg = (d: string, at: string, swing: number, begin: string) =>
    `<path d="${d}" stroke="#7d3f15" stroke-width="2.4" stroke-linecap="round" fill="none"><animateTransform attributeName="transform" type="rotate" dur="0.2s" begin="${begin}" values="${-swing} ${at};${swing} ${at};${-swing} ${at}" repeatCount="indefinite" class="critter-gait"/></path>`;
  return `<svg viewBox="-34 -32 64 46" aria-hidden="true">
    <g class="critter-tail">
      <path d="M-10 -1 C-19 -2 -23 -9 -21 -16 C-19 -23 -12 -24 -9.5 -19.5" stroke="#9c5222" stroke-width="7.5" stroke-linecap="round" fill="none"/>
      <path d="M-11 -2 C-18 -3 -21 -9 -19.5 -15 C-18 -20.5 -13 -21.5 -11 -19" stroke="#c7803f" stroke-width="3.4" stroke-linecap="round" fill="none" opacity=".8"/>
      <path d="M-22.5 -15 C-21 -24 -13 -26.5 -9 -21" stroke="#e0a565" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".6"/>
    </g>
    ${leg('M-9 5 L-4 10', '-7 4', 22, '0s')}
    <ellipse cx="0" cy="0" rx="12" ry="7.4" fill="#a65a27"/>
    <ellipse cx="2.5" cy="3.4" rx="8" ry="3.3" fill="#ecd1a6"/>
    <ellipse cx="-7" cy="1.5" rx="6" ry="5.6" fill="#94491b"/>
    ${leg('M7 4 L9 10.5', '7 4', 26, '0.1s')}
    <path d="M9 -10.5 L10.5 -17 L13.5 -10 Z" fill="#8d4519"/>
    <circle cx="12" cy="-4.8" r="6.3" fill="#a65a27"/>
    <ellipse cx="17" cy="-3.3" rx="3.4" ry="2.7" fill="#b9692f"/>
    <ellipse cx="14" cy="-1.6" rx="2.6" ry="1.7" fill="#ecd1a6"/>
    <circle cx="20.1" cy="-4" r="1.05" fill="#24150b"/>
    <circle cx="14.2" cy="-6.6" r="1.5" fill="#120a05"/><circle cx="14.7" cy="-7.1" r=".5" fill="#fff"/>
  </svg>`;
}

/** Rato de lado, de frente para a direita: corpo cinza, focinho pontudo com bigodes, orelha rosada e o rabo comprido. */
function ratSVG() {
  return `<svg viewBox="-40 -16 66 26" aria-hidden="true">
    <path d="M-11 2 C-20 4 -26 -2 -34 2 C-37 3.5 -38 6 -37 8" stroke="#c79a96" stroke-width="1.5" stroke-linecap="round" fill="none">
      <animate attributeName="d" dur="0.5s" repeatCount="indefinite" values="M-11 2 C-20 4 -26 -2 -34 2 C-37 3.5 -38 6 -37 8;M-11 2 C-20 0 -26 5 -34 3 C-37 2 -38 0 -38 -2;M-11 2 C-20 4 -26 -2 -34 2 C-37 3.5 -38 6 -37 8"/>
    </path>
    <g stroke="#4f4c52" stroke-width="1.8" stroke-linecap="round" fill="none">
      <path d="M-6 4 L-8 8"><animateTransform attributeName="transform" type="rotate" dur="0.11s" values="-30 -6 4;30 -6 4;-30 -6 4" repeatCount="indefinite" class="critter-gait"/></path>
      <path d="M6 4 L8 8"><animateTransform attributeName="transform" type="rotate" dur="0.11s" values="30 6 4;-30 6 4;30 6 4" repeatCount="indefinite" class="critter-gait"/></path>
    </g>
    <ellipse cx="-1" cy="0" rx="12" ry="6.3" fill="#77737a"/>
    <ellipse cx="0" cy="3" rx="8" ry="2.6" fill="#a29ea4"/>
    <path d="M8 -4.5 C13 -4 18 -1.5 21 0.5 C18 2.5 13 3.5 8 3.5 Z" fill="#7f7b82"/>
    <circle cx="21" cy=".6" r="1.1" fill="#d78f95"/>
    <circle cx="9.5" cy="-5.2" r="3.6" fill="#8a868c"/><circle cx="9.6" cy="-5.1" r="2.2" fill="#e2a6ab"/>
    <circle cx="14.6" cy="-1.6" r="1.2" fill="#0d0b0e"/><circle cx="15" cy="-2" r=".4" fill="#fff"/>
    <g class="critter-whiskers" stroke="rgba(235,232,238,.75)" stroke-width=".35"><path d="M19 .5 L25 -2 M19 .8 L25.5 1 M19 1.1 L24.5 3.6"/></g>
  </svg>`;
}

/** Aranha vista de cima, de cabeça para baixo (descendo pelo fio): oito pernas dobradas que se mexem quando ela para. */
function spiderSVG() {
  const legs = ['M-2.5 -5 L-8 -10 L-11 -17', 'M-3 -3 L-10 -5 L-15 -9', 'M-3 -1 L-10 1 L-15 5', 'M-2.5 1 L-8 6 L-11 13'];
  const leg = (d: string, i: number, mirror: boolean) =>
    `<path d="${d}"${mirror ? ' transform="scale(-1 1)"' : ''}><animateTransform attributeName="transform" type="rotate" additive="sum" dur="${(0.5 + i * .07).toFixed(2)}s" values="-6 -2.5 -2;6 -2.5 -2;-6 -2.5 -2" repeatCount="indefinite"/></path>`;
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">
    <g stroke="#17120f" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none">${legs.map((d, i) => leg(d, i, false) + leg(d, i, true)).join('')}</g>
    <ellipse cx="0" cy="-8" rx="6.2" ry="7.4" fill="#211a15"/>
    <path d="M0 -12 L-1.6 -9 L0 -6 L1.6 -9 Z" fill="#a23a2a" opacity=".85"/>
    <circle cx="0" cy="0" r="3.9" fill="#2b221c"/>
    <g fill="#e8e0d8" opacity=".55"><circle cx="-1.1" cy="2.4" r=".55"/><circle cx="1.1" cy="2.4" r=".55"/></g>
    <ellipse cx="-2" cy="-10" rx="1.4" ry="2.4" fill="#fff" opacity=".14"/>
  </svg>`;
}

/** Morcego de frente, de asas abertas que batem rápido, com as orelhas pontudas. */
function batSVG() {
  return `<svg viewBox="-32 -16 64 32" aria-hidden="true">
    <g class="critter-wings">
      <path d="M-3 -2 C-10 -10 -22 -11 -30 -4 C-26 -3 -24 0 -24 3 C-21 0 -18 1 -16 4 C-14 1 -11 1 -9 4 C-8 1 -5 1 -3 3 Z" fill="#3a2b41" stroke="rgba(214,196,226,.28)" stroke-width=".5"/>
      <path d="M3 -2 C10 -10 22 -11 30 -4 C26 -3 24 0 24 3 C21 0 18 1 16 4 C14 1 11 1 9 4 C8 1 5 1 3 3 Z" fill="#3a2b41" stroke="rgba(214,196,226,.28)" stroke-width=".5"/>
      <path d="M-4 -2 C-12 -8 -20 -8 -27 -4 M4 -2 C12 -8 20 -8 27 -4" stroke="#4a3a4f" stroke-width=".6" fill="none"/>
      <animateTransform attributeName="transform" type="scale" dur="0.16s" values="1 1;1 -.25;1 1" repeatCount="indefinite"/>
    </g>
    <ellipse cx="0" cy="1" rx="4" ry="6" fill="#3a2d3e"/>
    <path d="M-3.4 -3.5 L-3 -9 L-1 -4.6 Z M3.4 -3.5 L3 -9 L1 -4.6 Z" fill="#3a2d3e"/>
    <circle cx="-1.4" cy="-2" r=".8" fill="#f5d36b"/><circle cx="1.4" cy="-2" r=".8" fill="#f5d36b"/>
  </svg>`;
}

const SVG: Record<CritterKind, () => string> = { squirrel: squirrelSVG, rat: ratSVG, spider: spiderSVG, bat: batSVG };

/** Os quadros viram uma animação só de transform; `flip` vira o bicho para a esquerda. */
function animate(el: HTMLElement, frames: Frame[], zoom: number, easing = 'linear') {
  const total = frames[frames.length - 1]!.t || 1;
  const keyframes = frames.map(f => ({
    offset: f.t / total,
    transform: `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) rotate(${(f.a * 180 / Math.PI).toFixed(1)}deg) scale(${f.flip ? -zoom : zoom}, ${zoom})`,
  }));
  return el.animate(keyframes, { duration: total * 1000, easing, fill: 'forwards' });
}

/** Esquilo: aos pulos pela borda de baixo, para no meio sentado mexendo o rabo, e sai pelo outro lado. */
function squirrelRun(w: number, h: number, zoom: number, toRight: boolean): Frame[] {
  const floor = h - 16 * zoom, half = 34 * zoom, frames: Frame[] = [];
  const startX = toRight ? -half : w + half, endX = toRight ? w + half : -half, dir = toRight ? 1 : -1;
  const stopAt = rand(.3, .6), hop = 26 * zoom, speed = rand(250, 320) * zoom;
  let x = startX, t = 0, stopped = false;
  frames.push({ x, y: floor, a: 0, t, flip: !toRight });
  while ((endX - x) * dir > 0) {
    // Um pulo: sobe e desce, com o corpo inclinando para a frente na subida e para trás na descida.
    const nx = x + hop * dir, dt = hop / speed;
    frames.push({ x: x + hop * .5 * dir, y: floor - 7 * zoom, a: -.12 * dir, t: t + dt * .5, flip: !toRight });
    frames.push({ x: nx, y: floor, a: .05 * dir, t: t + dt, flip: !toRight });
    x = nx; t += dt;
    if (!stopped && (x - startX) * dir > Math.abs(endX - startX) * stopAt) {
      stopped = true;
      t += rand(.9, 1.6);
      frames.push({ x, y: floor - 2 * zoom, a: -.28 * dir, t, flip: !toRight });
    }
  }
  return frames;
}

/** Rato: dispara pela borda de baixo, para duas vezes para farejar e some do outro lado. */
function ratRun(w: number, h: number, zoom: number, toRight: boolean): Frame[] {
  const floor = h - 10 * zoom, half = 40 * zoom, dir = toRight ? 1 : -1;
  const startX = toRight ? -half : w + half, endX = toRight ? w + half : -half;
  const stops = [rand(.2, .4), rand(.55, .8)].map(k => startX + (endX - startX) * k);
  const speed = rand(420, 520) * zoom, frames: Frame[] = [{ x: startX, y: floor, a: 0, t: 0, flip: !toRight }];
  let x = startX, t = 0;
  for (const stop of [...stops, endX]) {
    // Trechos curtos com o corpo balançando um pouco, como quem corre rente ao chão.
    const pieces = Math.max(2, Math.round(Math.abs(stop - x) / (30 * zoom)));
    const from = x;
    for (let i = 1; i <= pieces; i++) {
      const nx = from + (stop - from) * i / pieces;
      t += Math.abs(nx - x) / speed; x = nx;
      frames.push({ x, y: floor - (i % 2) * 1.2 * zoom, a: (i % 2 ? -.03 : .03) * dir, t, flip: !toRight });
    }
    if (stop !== endX) { t += rand(.5, 1.1); frames.push({ x, y: floor, a: -.06 * dir, t, flip: !toRight }); }
  }
  return frames;
}

/** Morcego: cruza o alto da tela num voo ondulado, subindo e descendo. */
function batFlight(w: number, zoom: number, toRight: boolean): Frame[] {
  const half = 34 * zoom, startX = toRight ? -half : w + half, endX = toRight ? w + half : -half;
  const base = rand(50, 130) * zoom, waves = rand(2.5, 4), amp = rand(18, 34) * zoom, total = rand(2.4, 3.2);
  return Array.from({ length: 41 }, (_, i) => {
    const k = i / 40, wave = Math.sin(k * waves * Math.PI * 2);
    return { x: startX + (endX - startX) * k, y: base + wave * amp, a: Math.cos(k * waves * Math.PI * 2) * .18 * (toRight ? 1 : -1), t: total * k };
  });
}

/**
 * Um bicho atravessa a tela e some. `zoom` só para a página de teste (ver de perto). Resolve quando ele sai.
 * Fica de fora com "reduzir movimento" e com Efeitos leves, como o inseto da brincadeira.
 */
export async function critter(host: HTMLElement, kind: CritterKind, opts: { zoom?: number; force?: boolean; toRight?: boolean } = {}): Promise<void> {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!opts.force && (reduced || effectsLevel() === 'light')) return;
  const zoom = opts.zoom ?? 1, w = innerWidth, h = innerHeight, toRight = opts.toRight ?? Math.random() < .5;
  const el = document.createElement('div');
  el.className = `screen-critter ${kind}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = SVG[kind]();
  host.append(el);
  const extra: HTMLElement[] = [];
  try {
    if (kind === 'spider') {
      // Desce num fio de um dos cantos de cima, balança um pouco e sobe de volta.
      const x = Math.random() < .5 ? rand(60, 240) * zoom : w - rand(60, 240) * zoom, drop = rand(110, 180) * zoom;
      const thread = document.createElement('div');
      thread.className = 'screen-critter-thread';
      thread.style.left = `${x}px`;
      thread.style.height = `${drop}px`;
      host.append(thread); extra.push(thread);
      const down = 1.5, hang = rand(1.6, 2.4), up = 1.3, total = down + hang + up;
      const at = (s: number) => s / total;
      thread.animate([{ scale: '1 0' }, { scale: '1 1.04', offset: at(down * .85) }, { scale: '1 1', offset: at(down) }, { scale: '1 1', offset: at(down + hang) }, { scale: '1 0' }],
        { duration: total * 1000, easing: 'ease-in-out', fill: 'forwards' });
      const pos = (y: number, a = 0) => `translate(${x}px, ${y}px) rotate(${a}deg) scale(${zoom})`;
      await el.animate([
        { transform: pos(-20 * zoom), offset: 0 },
        { transform: pos(drop * 1.04, 0), offset: at(down * .85) },
        { transform: pos(drop, 0), offset: at(down) },
        { transform: pos(drop, 9), offset: at(down + hang * .35) },
        { transform: pos(drop, -7), offset: at(down + hang * .7) },
        { transform: pos(drop, 0), offset: at(down + hang) },
        { transform: pos(-20 * zoom, 0), offset: 1 },
      ], { duration: total * 1000, easing: 'ease-in-out', fill: 'forwards' }).finished;
    } else {
      const frames = kind === 'squirrel' ? squirrelRun(w, h, zoom, toRight) : kind === 'rat' ? ratRun(w, h, zoom, toRight) : batFlight(w, zoom, toRight);
      const svg = el.querySelector('svg')!;
      // Nas paradas, as patas param e o rabo continua (o esquilo sentado mexe o rabo; o rato mexe os bigodes).
      const timers: number[] = [];
      frames.forEach((f, i) => {
        const prev = frames[i - 1];
        if (prev && Math.abs(prev.x - f.x) < .5 && kind !== 'bat') {
          timers.push(window.setTimeout(() => { svg.pauseAnimations(); el.classList.add('resting'); }, prev.t * 1000));
          timers.push(window.setTimeout(() => { svg.unpauseAnimations(); el.classList.remove('resting'); }, f.t * 1000));
        }
      });
      try { await animate(el, frames, zoom).finished; } finally { timers.forEach(clearTimeout); }
    }
  } catch { /* a animação foi cancelada (página escondida, mesa desmontada) */ }
  finally { el.remove(); extra.forEach(e => e.remove()); }
}
