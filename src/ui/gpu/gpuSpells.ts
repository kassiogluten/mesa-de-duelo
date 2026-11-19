// Momentos de mágica na camada GPU: o relógio do turno extra voltando no meio da mesa, o eco das cópias que se desdobram da original na pilha e o anel de energia da mágica reforçada ou com X.
import { Container, Graphics, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { colorOf, easeOut, rand, timed, type Shared } from './gpuParticles';

export interface SpellParams {
  /**
   * Turno extra: um relógio de luz de `size` px em `at`, com os ponteiros girando para trás (o tempo voltando) e
   * deixando rastro; no fim, ele acende e se desfaz. `color` é a cor de quem ganhou o turno.
   */
  extraTurn: { at: Point; size: number; color: string; duration: number };
  /**
   * Cópias de uma mágica: contornos de carta na cor dela saem da original em `at`, um para cada cópia (até 5), abrindo
   * em leque para o lado de `side` (−1 esquerda, 1 direita), com faíscas.
   */
  echo: { at: Point; color: string; copies: number; side: number; duration: number };
  /**
   * Mágica reforçada ou com X: grãos de luz na cor dela convergem em espiral para a carta em `at` e um anel estoura
   * dela; `power` (de 1 a 10) aumenta os grãos e o anel.
   */
  empower: { at: Point; color: string; power: number; duration: number };
}

/** Um ponteiro do relógio: um traço do centro para fora, mais largo na base. */
function hand(length: number, width: number, color: number) {
  const g = new Graphics();
  g.moveTo(0, 0).lineTo(0, -length).stroke({ width, color, alpha: 1, cap: 'round' });
  g.blendMode = 'add';
  return g;
}

export const SPELL_EFFECTS: { [N in keyof SpellParams]: (layer: GpuLayer, s: Shared, p: SpellParams[N]) => GpuEffect } = {
  extraTurn(layer, s, { at, size, color, duration }) {
    const main = colorOf(color, 0xf2b54c), hot = 0xfff1cf;
    return timed(duration, (view, sparks) => {
      const { x, y } = layer.local(at.cx, at.cy);
      const r = size / 2;
      const clock = new Container({ x, y, alpha: 0 });
      const veil = new Sprite({ texture: s.glow, anchor: .5, tint: 0x000000, alpha: .5 });
      veil.scale.set(size * 2.2 / 128);
      const halo = new Sprite({ texture: s.glow, anchor: .5, tint: main, blendMode: 'add', alpha: .35 });
      halo.scale.set(size * 1.7 / 128);
      // O mostrador: dois aros e as doze marcas (as dos quartos, maiores).
      const face = new Graphics();
      for (const [width, alpha, c] of [[10, .1, main], [4, .3, main], [1.6, .9, hot]] as const) face.circle(0, 0, r).stroke({ width, color: c, alpha });
      face.circle(0, 0, r * .82).stroke({ width: 1, color: main, alpha: .35 });
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, big = i % 3 === 0, inner = r * (big ? .7 : .78);
        face.moveTo(Math.cos(a) * inner, Math.sin(a) * inner).lineTo(Math.cos(a) * r * .9, Math.sin(a) * r * .9).stroke({ width: big ? 3 : 1.5, color: big ? hot : main, alpha: big ? .95 : .6, cap: 'round' });
      }
      face.blendMode = 'add';
      // O rastro dos ponteiros: cópias apagadas atrás deles, no sentido de onde vieram.
      const ghosts = layer.coarse ? 3 : 6;
      const minuteTrail = Array.from({ length: ghosts }, () => hand(r * .74, 3, main));
      const hourTrail = Array.from({ length: ghosts }, () => hand(r * .48, 4, main));
      const minute = hand(r * .74, 3, hot), hour = hand(r * .48, 4.5, hot);
      const hub = new Sprite({ texture: s.glow, anchor: .5, tint: hot, blendMode: 'add' });
      hub.scale.set(r * .5 / 128);
      const ring = new Sprite({ texture: s.ring, anchor: .5, tint: main, blendMode: 'add', alpha: 0 });
      clock.addChild(veil, halo, face, ...minuteTrail, ...hourTrail, minute, hour, hub, ring);
      view.addChild(clock);
      // O ponteiro grande dá duas voltas e meia para trás; o pequeno, um quarto de volta.
      const TURNS = 2.5;
      let burst = false;
      return t => {
        const appear = easeOut(Math.min(1, t / .14)), gone = t < .82 ? 0 : (t - .82) / .18;
        clock.alpha = appear * (1 - gone);
        clock.scale.set(.7 + .3 * appear + .25 * easeOut(gone));
        // Arranca, corre e freia: o tempo volta de uma vez e para.
        const k = t < .1 ? 0 : Math.min(1, (t - .1) / .64), turned = k * k * (3 - 2 * k);
        const speed = k > 0 && k < 1 ? 6 * k * (1 - k) : 0;
        const m = -turned * TURNS * Math.PI * 2, h = Math.PI / 3 - turned * Math.PI / 2;
        minute.rotation = m; hour.rotation = h;
        minuteTrail.forEach((g, i) => { g.rotation = m + (i + 1) * .16 * speed; g.alpha = .5 * speed * (1 - i / ghosts); });
        hourTrail.forEach((g, i) => { g.rotation = h + (i + 1) * .05 * speed; g.alpha = .4 * speed * (1 - i / ghosts); });
        halo.alpha = .3 + .25 * speed;
        // Grãos de luz saem da ponta do ponteiro grande e ficam para trás, girando no sentido do relógio de verdade.
        if (speed > .2 && Math.random() < (layer.coarse ? .35 : .8)) {
          const a = m - Math.PI / 2, px = x + Math.cos(a) * r * .74, py = y + Math.sin(a) * r * .74;
          sparks.add(s.spark, s, { x: px, y: py, vx: -Math.sin(a) * -90 + rand(-20, 20), vy: Math.cos(a) * -90 + rand(-20, 20), life: rand(320, 520), spin: 0, grow: -.5, scale: rand(.2, .36), gravity: 0, drag: 2.4, tint: Math.random() < .5 ? hot : main });
        }
        ring.alpha = t < .74 ? 0 : .9 * (1 - Math.min(1, (t - .74) / .26));
        ring.scale.set(size / 256 * (1 + 1.1 * easeOut(Math.max(0, (t - .74) / .26))));
        if (!burst && t >= .74) {
          burst = true;
          const n = layer.coarse ? 10 : 22;
          for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2, v = rand(120, 260);
            sparks.add(s.star, s, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(420, 700), spin: rand(-4, 4), grow: -.4, scale: rand(.14, .28), gravity: 0, drag: 2.2, tint: i % 2 ? main : hot });
          }
        }
      };
    });
  },
  echo(layer, s, { at, color, copies, side, duration }) {
    const main = colorOf(color, 0x6fb8ff);
    const n = Math.max(1, Math.min(copies, 5));
    return timed(duration, (view, sparks) => {
      const { x, y } = layer.local(at.cx, at.cy);
      const w = Math.max(at.w, 40), h = Math.max(at.h, 56);
      const step = Math.min(w * .42, 46);
      const frames = Array.from({ length: n }, (_, i) => {
        const g = new Graphics();
        for (const [width, alpha] of [[8, .12], [3.5, .35], [1.4, .95]] as const) g.roundRect(-w / 2, -h / 2, w, h, Math.max(4, w * .06)).stroke({ width, color: i ? main : 0xffffff, alpha });
        g.blendMode = 'add'; g.position.set(x, y); g.alpha = 0;
        view.addChild(g);
        return g;
      });
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: main, blendMode: 'add', alpha: 0 });
      view.addChildAt(flash, 0);
      const born = frames.map(() => false);
      return t => {
        const k0 = Math.min(1, t / .2);
        flash.alpha = .7 * (1 - k0); flash.scale.set(Math.max(w, h) / 128 * (1 + 1.4 * easeOut(k0)));
        frames.forEach((g, i) => {
          // Cada contorno sai da original um pouco depois do anterior, vai até o lugar dele no leque e apaga.
          const start = .06 + i * (.4 / n), k = Math.max(0, Math.min(1, (t - start) / .4));
          const out = easeOut(k), fade = t < .72 ? 1 : 1 - (t - .72) / .28;
          g.position.set(x + side * step * (i + 1) * out, y - step * .12 * (i + 1) * out);
          g.rotation = side * .07 * (i + 1) * out;
          g.alpha = k <= 0 ? 0 : (.9 - i * .12) * fade;
          if (!born[i] && k > 0) {
            born[i] = true;
            const count = layer.coarse ? 3 : 6;
            for (let j = 0; j < count; j++) sparks.add(s.spark, s, { x: x + rand(-.4, .4) * w, y: y + rand(-.5, .5) * h, vx: side * rand(120, 260), vy: rand(-60, 30), life: rand(260, 440), spin: 0, grow: -.5, scale: rand(.18, .32), gravity: 0, drag: 2.6, tint: j % 2 ? main : 0xffffff, stretch: 1.6 });
          }
        });
      };
    });
  },
  empower(layer, s, { at, color, power, duration }) {
    const main = colorOf(color, 0xf2b54c), hot = 0xffffff;
    const p = Math.max(1, Math.min(10, power));
    return timed(duration, (view, sparks) => {
      const { x, y } = layer.local(at.cx, at.cy);
      const size = Math.max(at.w, at.h, 70);
      const reach = size * (.95 + p * .06);
      const count = Math.round((layer.coarse ? 8 : 16) + p * (layer.coarse ? 1 : 2));
      // Os grãos: cada um num ângulo, a uma distância que encolhe em espiral até a carta.
      const motes = Array.from({ length: count }, (_, i) => {
        const sprite = new Sprite({ texture: s.spark, anchor: .5, tint: i % 3 ? main : hot, blendMode: 'add', alpha: 0 });
        view.addChild(sprite);
        return { sprite, angle: i / count * Math.PI * 2 + rand(-.2, .2), far: reach * rand(.8, 1.15), delay: rand(0, .22), size: rand(.3, .55) };
      });
      const core = new Sprite({ texture: s.cardGlow, anchor: .5, x, y, tint: main, blendMode: 'add', alpha: 0 });
      core.scale.set(Math.max(at.w, 40) / 100, Math.max(at.h, 56) / 140);
      const rings = [0, 1].map(() => { const r = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: main, blendMode: 'add', alpha: 0 }); view.addChild(r); return r; });
      view.addChild(core);
      // Os grãos chegam até IMPACT; aí a carta acende e os anéis estouram.
      const IMPACT = .55;
      let burst = false;
      return t => {
        for (const m of motes) {
          const k = Math.max(0, Math.min(1, (t - m.delay * IMPACT) / (IMPACT * (1 - m.delay))));
          const d = m.far * (1 - k * k), a = m.angle + k * 2.4;
          m.sprite.position.set(x + Math.cos(a) * d, y + Math.sin(a) * d * .8);
          m.sprite.alpha = k <= 0 || k >= 1 ? 0 : Math.min(1, k * 4);
          m.sprite.scale.set(m.size * (1.2 - .5 * k));
        }
        const after = t < IMPACT ? 0 : (t - IMPACT) / (1 - IMPACT);
        core.alpha = t < IMPACT ? .2 * (t / IMPACT) : .5 * (1 - after);
        rings.forEach((ring, i) => {
          const k = Math.max(0, Math.min(1, (after - i * .18) / (1 - i * .18)));
          ring.alpha = t < IMPACT || k <= 0 ? 0 : .9 * (1 - k);
          ring.scale.set(size / 256 * (.9 + (1.1 + p * .14) * easeOut(k)));
        });
        if (!burst && t >= IMPACT) {
          burst = true;
          const n = Math.round((layer.coarse ? 6 : 12) + p * 1.5);
          for (let i = 0; i < n; i++) {
            const a = rand(0, Math.PI * 2), v = rand(140, 300 + p * 20);
            sparks.add(s.spark, s, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(300, 520), spin: 0, grow: -.6, scale: rand(.22, .42), gravity: 0, drag: 2.4, tint: i % 2 ? main : hot, stretch: 1.5 });
          }
        }
      };
    });
  },
};
