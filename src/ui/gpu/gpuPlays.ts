// Efeitos de jogada na camada GPU: o redemoinho ao conjurar, o anel ao chegar (pilha, mão, cemitério, bloqueio, mão reorganizada) e o risco de velocidade do golpe.
import { Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { colorOf, easeOut, rand, themeColor, timed, type Shared } from './gpuParticles';

export interface PlayParams {
  /** Conjurar: grãos na cor da carta girando para dentro de onde ela sai, como mana se juntando. */
  glint: { at: Point; color: string; delay?: number };
  /** Chegada: um anel que se abre e poucas faíscas, na cor pedida. `size` é o diâmetro final (sem ele, o da carta). */
  arrive: { at: Point; color: string; size?: number; delay?: number };
  /** Golpe: riscos de velocidade numa linha reta de `from` até `to`, no tempo do avanço da carta. */
  streak: { from: Point; to: Point; duration: number; delay?: number; color?: string };
}

export const PLAY_EFFECTS: { [N in keyof PlayParams]: (layer: GpuLayer, s: Shared, p: PlayParams[N]) => GpuEffect } = {
  glint(layer, s, { at, color, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const tint = colorOf(color, themeColor('--gold', '#f2b54c'));
    const reach = Math.max(at.w, at.h) * .75, n = layer.coarse ? 10 : 18;
    return timed(420, (view, sparks) => {
      // O brilho no meio acende enquanto os grãos chegam.
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint, blendMode: 'add', alpha: 0 });
      view.addChild(glow);
      let done = false;
      return t => {
        glow.scale.set(reach * 2.2 / 128 * (.6 + .4 * t)); glow.alpha = .55 * Math.sin(Math.PI * t);
        if (done) return;
        done = true;
        // Em espiral: cada grão sai de um anel em volta da carta, girando e entrando para o meio.
        for (let i = 0; i < n; i++) {
          const angle = (i / n) * Math.PI * 2, r = reach * rand(.8, 1.1), spin = 2.4, inward = r / .42;
          const tx = -Math.sin(angle), ty = Math.cos(angle);
          sparks.add(s.spark, s, { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r * .85, vx: tx * r * spin - Math.cos(angle) * inward, vy: ty * r * spin * .85 - Math.sin(angle) * inward * .85,
            life: rand(360, 440), spin: 0, grow: -.4, scale: rand(.35, .6), gravity: 0, drag: 1.6, tint: i % 2 ? tint : 0xffffff });
        }
      };
    }, delay);
  },
  arrive(layer, s, { at, color, size, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const tint = colorOf(color, themeColor('--gold', '#f2b54c'));
    const d = size ?? Math.max(at.w, at.h) * 1.1;
    return timed(420, (view, sparks) => {
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint, blendMode: 'add' });
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint, blendMode: 'add' });
      view.addChild(glow, ring);
      let sprayed = false;
      return t => {
        if (!sprayed) {
          sprayed = true;
          for (let i = 0, n = layer.coarse ? 5 : 9; i < n; i++) {
            const angle = rand(0, Math.PI * 2), speed = rand(.6, 1.3) * d;
            sparks.add(s.spark, s, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(260, 420), spin: 0, grow: -.6, scale: rand(.2, .38), gravity: 0, drag: 3.2, tint: i % 3 ? tint : 0xffffff });
          }
        }
        const k = easeOut(t);
        ring.scale.set(d / 256 * (.45 + .7 * k)); ring.alpha = .85 * (1 - t);
        glow.scale.set(d / 128 * .55 * (1 + .3 * k)); glow.alpha = .45 * (1 - Math.min(1, t / .6));
      };
    }, delay);
  },
  streak(layer, s, { from, to, duration, delay = 0, color }) {
    const a = layer.local(from.cx, from.cy), b = layer.local(to.cx, to.cy);
    const tint = colorOf(color, themeColor('--red', '#ec5a3f'));
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    let last = 0;
    return timed(duration, (_view, sparks) => (t, ms) => {
      // Acelera como o avanço da carta; cada trecho andado solta riscos alinhados ao caminho, ficando para trás.
      const k = t * t, step = (k - last) * len;
      const count = ms > 0 ? Math.min(4, Math.floor(step / 10) + 1) : 0;
      for (let i = 0; i < count; i++) {
        const u = last + (k - last) * (i + Math.random()) / count, side = rand(-.35, .35) * Math.min(from.w, from.h);
        sparks.add(s.spark, s, { x: a.x + dx * u - uy * side, y: a.y + dy * u + ux * side, vx: -ux * rand(40, 90), vy: -uy * rand(40, 90), life: rand(160, 260), spin: 0, grow: -.4, scale: rand(.22, .34), gravity: 0, drag: 2, tint: i % 3 ? tint : 0xffd2a8, stretch: rand(3.5, 5.5) });
      }
      last = k;
    }, delay);
  },
};
