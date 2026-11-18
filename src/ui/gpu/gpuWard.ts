// A proteção contra alvos (ward) na camada GPU: a cúpula de favos violeta que surge em volta da carta quando algo a mira, com o golpe ondulando do lado de quem mirou, e o desfecho (a cúpula segura e se desfaz em luz, ou trinca e cai em cacos).
import { Container, Graphics, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';

export interface WardParams {
  /**
   * O ward disparou: a cúpula cresce em volta da carta em `at` e o golpe bate nela do lado de `from` (o item da pilha
   * que mirou; sem ele, de cima). Dura `duration` ms e apaga sozinha, deixando a moldura de runas da carta.
   */
  ward: { at: Point; from?: Point; duration?: number };
  /** O ward resolveu: `held` (anulou quem mirou) acende a cúpula inteira e a desfaz em luz; senão, ela trinca e cai. */
  wardEnd: { at: Point; held: boolean };
}

// As cores da moldura de ward na carta (permanentEffects.css): violeta, lilás claro e o fundo mais escuro.
const MAIN = 0xb89cff, HOT = 0xe6dcff, DEEP = 0x9b7bff, DULL = 0x8a7fa8;

/**
 * Um favo da cúpula: o lugar dele dentro da cúpula (`lx`, `ly`) e na camada (`x`, `y`), o quanto ele encolhe ali (`k`)
 * e a posição na malha plana (`u`, `v`; `r` é a distância do meio, 0 no centro e 1 na borda).
 */
interface Cell { lx: number; ly: number; x: number; y: number; k: number; r: number; u: number; v: number }

/** O brilho de base de cada favo: mais forte perto da borda, como a luz rasante numa bolha. */
const base = (r: number) => .18 + .5 * r * r;

/**
 * Os favos de uma cúpula de raios `rx` e `ry`: hexágonos numa malha plana dentro do círculo unitário, levados para a
 * esfera vista de frente (o raio r vira sin(r·π/2): os do meio maiores, os da borda menores). No celular, favos
 * maiores e menos deles.
 */
function layout(rx: number, ry: number, coarse: boolean) {
  const size = (coarse ? .24 : .18), corner = size * .86, w = Math.sqrt(3) * size;
  /** Da malha plana para a cúpula, em px a partir do meio. */
  const bend = (u: number, v: number) => {
    const r = Math.hypot(u, v), k = r < 1e-4 ? Math.PI / 2 : Math.sin(Math.min(1, r) * Math.PI / 2) / r;
    return [u * k * rx, v * k * ry] as const;
  };
  const cells: (Omit<Cell, 'x' | 'y'> & { outline: (readonly [number, number])[] })[] = [];
  for (let row = -6; row <= 6; row++) {
    for (let col = -6; col <= 6; col++) {
      const u = col * w + (row & 1 ? w / 2 : 0), v = row * size * 1.5, r = Math.hypot(u, v);
      // Só os favos inteiros dentro da cúpula (o canto mais longe dentro do círculo).
      if (r + corner > 1.02) continue;
      // O favo solto encolhe como a esfera ali, pelo lado mais apertado (para fora, perto da borda), para caber no
      // favo curvo do desenho inteiro, que segue a curva em cada canto.
      const a = r * Math.PI / 2, along = r < 1e-4 ? Math.PI / 2 : Math.sin(a) / r, out = Math.PI / 2 * Math.cos(a);
      const [lx, ly] = bend(u, v);
      const outline = Array.from({ length: 6 }, (_, i) => { const t = Math.PI / 6 + i * Math.PI / 3; return bend(u + Math.cos(t) * corner, v + Math.sin(t) * corner); });
      cells.push({ lx, ly, k: Math.max(.25, Math.min(along, out) * .92), r, u, v, outline });
    }
  }
  return { cells, radius: corner * rx };
}

/** Um contorno de hexágono de raio `radius` em volta de (x, y), achatado na vertical por `squash`. */
function hexPath(g: CanvasRenderingContext2D, x: number, y: number, radius: number, squash: number) {
  g.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius * squash); }
  g.closePath();
}

/**
 * A cúpula: o desenho inteiro (véu e favos, cada um com o brilho de base) numa textura só, pintada uma vez por tamanho
 * de carta, e um favo solto por cima de cada um, que só aparece quando acende (a onda do golpe, o clarão de quando
 * segura) ou cai (quando pagam o custo). Assim a placa desenha uma peça só na maior parte do tempo.
 */
function dome(layer: GpuLayer, at: Point, view: Container) {
  const { x: cx, y: cy } = layer.local(at.cx, at.cy);
  const rx = Math.round(Math.max(at.w, 40) * .86), ry = Math.round(Math.max(at.h, 56) * .7);
  const { cells: grid, radius } = layout(rx, ry, layer.coarse);
  const squash = ry / rx, pad = 8, res = 2;
  const body = paintOnce(layer, `ward-dome-${rx}x${ry}${layer.coarse ? '-c' : ''}`, (rx + pad) * 2 * res, (ry + pad) * 2 * res, g => {
    g.scale(res, res); g.translate(rx + pad, ry + pad);
    const veil = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    veil.addColorStop(0, 'rgba(255,255,255,.04)'); veil.addColorStop(1, 'rgba(255,255,255,.12)');
    g.save(); g.scale(1, squash); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fillStyle = veil; g.fill(); g.restore();
    // Cada favo com um traço largo e fraco por baixo do fio (o brilho), sem sombra borrada, que demora para pintar.
    g.strokeStyle = '#fff'; g.lineJoin = 'round';
    for (const c of grid) {
      g.beginPath(); for (const [x, y] of c.outline) g.lineTo(x, y); g.closePath();
      g.globalAlpha = base(c.r) * .3; g.lineWidth = 3.2 * c.k; g.stroke();
      g.globalAlpha = base(c.r); g.lineWidth = 1.1 * c.k; g.stroke();
    }
  });
  // O favo solto: o mesmo contorno, com raio de 26 px num quadro de 64 (a cor vem do `tint`).
  const hex = paintOnce(layer, 'ward-hex', 64, 64, g => {
    g.strokeStyle = '#fff'; g.lineWidth = 2.6; g.shadowColor = '#fff'; g.shadowBlur = 5; g.lineJoin = 'round';
    hexPath(g, 32, 32, 26, 1); g.stroke();
  });
  const shell = new Container({ x: cx, y: cy, alpha: 0 });
  const whole = new Sprite({ texture: body, anchor: .5, tint: HOT, blendMode: 'add' });
  whole.scale.set(1 / res);
  // Uma segunda cópia do desenho, por cima, para acender a cúpula inteira de uma vez (quando ela segura).
  const lit = new Sprite({ texture: body, anchor: .5, tint: 0xffffff, blendMode: 'add', visible: false });
  lit.scale.set(1 / res);
  const loose = grid.map(c => {
    const s = new Sprite({ texture: hex, anchor: .5, x: c.lx, y: c.ly, tint: HOT, blendMode: 'add', visible: false });
    s.scale.set(radius * c.k / 26, radius * c.k / 26 * squash);
    return s;
  });
  // A borda da cúpula: faixas da mais larga e fraca até um fio claro.
  const rim = new Graphics();
  for (const [width, alpha, color] of [[14, .08, DEEP], [6, .22, MAIN], [2, .85, HOT]] as const) rim.ellipse(0, 0, rx, ry).stroke({ width, color, alpha });
  rim.blendMode = 'add';
  shell.addChild(whole, lit, ...loose, rim);
  view.addChild(shell);
  const cells: Cell[] = grid.map(({ outline: _, ...c }) => ({ ...c, x: cx + c.lx, y: cy + c.ly }));
  /** Acende o favo `i` com `alpha` por cima do desenho inteiro (abaixo de .02 ele nem é desenhado). */
  const light = (i: number, alpha: number) => { const s = loose[i]!; s.visible = alpha > .02; s.alpha = Math.min(1, alpha); };
  return { cx, cy, rx, ry, cells, loose, whole, lit, rim, shell, light };
}

export const WARD_EFFECTS: { [N in keyof WardParams]: (layer: GpuLayer, s: Shared, p: WardParams[N]) => GpuEffect } = {
  ward(layer, s, { at, from, duration = 1100 }) {
    return timed(duration, (view, sparks) => {
      const d = dome(layer, at, view);
      // De que lado veio o golpe: do item da pilha que mirou, ou de cima.
      const src = from ? layer.local(from.cx, from.cy) : null;
      const angle = src && Math.hypot(src.x - d.cx, src.y - d.cy) > 4 ? Math.atan2((src.y - d.cy) / d.ry, (src.x - d.cx) / d.rx) : -Math.PI / 2;
      const hu = Math.cos(angle) * .92, hv = Math.sin(angle) * .92;
      const hx = d.cx + Math.cos(angle) * d.rx, hy = d.cy + Math.sin(angle) * d.ry;
      // A mágica chegando: um ponto de luz que vem de fora, do lado de quem mirou, e para na cúpula.
      const reach = Math.max(at.w, at.h) * 1.1;
      const ox = hx + Math.cos(angle) * reach, oy = hy + Math.sin(angle) * reach;
      const comet = new Sprite({ texture: s.glow, anchor: .5, tint: HOT, blendMode: 'add', alpha: 0 });
      const flash = new Sprite({ texture: s.glow, anchor: .5, x: hx, y: hy, tint: HOT, blendMode: 'add', alpha: 0 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x: hx, y: hy, tint: MAIN, blendMode: 'add', alpha: 0, rotation: angle + Math.PI / 2 });
      view.addChild(comet, ring, flash);
      const HIT = .24, unit = Math.max(at.w, 40);
      let struck = false;
      return t => {
        // Cresce até .25, segura e apaga do .78 em diante.
        const grow = easeOut(Math.min(1, t / .25)), fade = t < .78 ? 1 : 1 - (t - .78) / .22;
        d.shell.scale.set(.7 + .3 * grow); d.shell.alpha = grow * fade;
        d.rim.alpha = t > HIT && t < HIT + .12 ? 1 : .75;
        // A onda do golpe corre pelos favos a partir do ponto atingido.
        const front = t < HIT ? -1 : (t - HIT) / .45 * 2.2;
        d.cells.forEach((c, i) => d.light(i, front < 0 ? 0 : .95 * Math.exp(-(((Math.hypot(c.u - hu, c.v - hv) - front) / .28) ** 2))));
        // O ponto de luz chega na hora do golpe.
        const travel = Math.min(1, Math.max(0, (t - .06) / (HIT - .06)));
        comet.alpha = t < .06 || t >= HIT ? 0 : .9;
        comet.position.set(ox + (hx - ox) * easeOut(travel), oy + (hy - oy) * easeOut(travel));
        comet.scale.set(unit / 128 * .35);
        if (!struck && t >= HIT) {
          struck = true;
          // Faíscas desviadas pela cúpula: saem para fora e para os lados do ponto atingido, sem atravessar.
          const n = layer.coarse ? 8 : 16;
          for (let i = 0; i < n; i++) {
            const side = (Math.random() < .5 ? -1 : 1) * rand(.5, 1.3), dir = angle + side, speed = rand(120, 280);
            sparks.add(s.spark, s, { x: hx, y: hy, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, life: rand(280, 460), spin: 0, grow: -.6, scale: rand(.22, .4), gravity: 0, drag: 2.6, tint: Math.random() < .5 ? HOT : MAIN, stretch: 1.6 });
          }
        }
        // O clarão e a ondulação no ponto atingido.
        const hit = t < HIT ? 0 : Math.min(1, (t - HIT) / .3);
        flash.alpha = t < HIT ? 0 : .95 * (1 - hit);
        flash.scale.set(unit / 128 * (.5 + .9 * easeOut(hit)));
        ring.alpha = t < HIT ? 0 : .9 * (1 - hit);
        ring.scale.set(unit / 256 * (.3 + 1.1 * easeOut(hit)), unit / 256 * (.15 + .5 * easeOut(hit)));
      };
    });
  },
  wardEnd(layer, s, { at, held }) {
    const life = held ? 820 : 960;
    return timed(life, (view, sparks) => {
      const d = dome(layer, at, view);
      const glow = new Sprite({ texture: s.glow, anchor: .5, x: d.cx, y: d.cy, tint: held ? HOT : DULL, blendMode: 'add', alpha: 0 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x: d.cx, y: d.cy, tint: MAIN, blendMode: 'add', alpha: 0 });
      view.addChildAt(glow, 0); view.addChild(ring);
      if (!held) { d.whole.tint = DULL; for (const l of d.loose) l.tint = DULL; }
      const spin = d.cells.map(() => rand(-5, 5));
      const fall = d.cells.map(() => ({ vx: rand(-30, 30), delay: rand(.28, .5) }));
      let burst = false;
      return (t, ms) => {
        const appear = Math.min(1, t / .14);
        if (held) {
          // Segurou: todos os favos acendem juntos, a cúpula incha um pouco e se desfaz em luz para fora.
          const swell = t < .45 ? 1 + .05 * easeOut(t / .45) : 1.05 + .12 * easeOut((t - .45) / .55);
          const out = t < .45 ? 1 : 1 - (t - .45) / .55;
          d.shell.scale.set(swell); d.shell.alpha = appear * out;
          const lit = Math.max(0, 1 - Math.abs(t - .3) / .2);
          d.lit.visible = lit > .02; d.lit.alpha = lit;
          glow.alpha = .5 * appear * out; glow.scale.set(Math.max(d.rx, d.ry) * 2.2 / 128);
          if (!burst && t >= .45) {
            burst = true;
            const n = layer.coarse ? Math.ceil(d.cells.length / 2) : d.cells.length;
            for (let i = 0; i < n; i++) {
              const c = d.cells[i]!, a = Math.atan2(c.y - d.cy, c.x - d.cx), speed = rand(60, 160) * (.4 + c.r);
              sparks.add(s.star, s, { x: c.x, y: c.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 20, life: rand(420, 640), spin: rand(-3, 3), grow: -.4, scale: rand(.14, .26), gravity: -20, drag: 2, tint: i % 3 ? MAIN : HOT });
            }
          }
          const wave = t < .45 ? 0 : (t - .45) / .55;
          ring.alpha = t < .45 ? 0 : .8 * (1 - wave);
          ring.scale.set(Math.max(d.rx, d.ry) * 2 / 256 * (1 + .6 * easeOut(wave)));
          return;
        }
        // Pagaram: a cúpula aparece apagada e pisca; no .28 ela trinca: o desenho inteiro sai e cada favo cai girando.
        const cracked = t >= .28;
        d.shell.alpha = appear;
        d.whole.visible = !cracked;
        d.whole.alpha = .55 + .45 * Math.sin(t * 70);
        d.rim.alpha = !cracked ? .6 + .3 * Math.sin(t * 90) : Math.max(0, .5 - (t - .3) * 2);
        glow.alpha = .18 * appear * (1 - t); glow.scale.set(Math.max(d.rx, d.ry) * 2 / 128);
        if (!burst && cracked) {
          burst = true;
          spray(sparks, s, d.cx, d.cy - d.ry * .3, layer.coarse ? 5 : 10, { speed: [40, 120], life: [260, 420], scale: [.18, .32], colors: [DULL, MAIN], drag: 3 });
        }
        if (!cracked) return;
        d.cells.forEach((c, i) => {
          const f = fall[i]!, k = Math.max(0, (t - f.delay) / (1 - f.delay)), piece = d.loose[i]!;
          d.light(i, (base(c.r) + .45) * (1 - k * k));
          if (k > 0) { piece.position.set(c.lx + f.vx * k, c.ly + 420 * k * k); piece.rotation += spin[i]! * ms / 1000; }
        });
      };
    });
  },
};
