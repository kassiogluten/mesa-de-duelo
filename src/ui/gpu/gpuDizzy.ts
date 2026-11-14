// Momentos do enjoo de invocação na camada GPU: as estrelinhas do ícone giram em volta da criatura que chega tonta e voam embora quando o enjoo passa.
import { Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { easeOut, rand, timed, type Shared } from './gpuParticles';

export interface DizzyParams {
  /**
   * A criatura ficou tonta: as estrelinhas saem dela, dão meia volta numa elipse acima da carta e se recolhem no selo.
   * `tag` é o selo do enjoo (sem ele, o alto da carta).
   */
  dizzy: { at: Point; tag?: Point; delay?: number };
  /** O enjoo passou: as estrelinhas saem do selo girando e voam para longe, para cima. */
  undizzy: { at: Point; tag?: Point; delay?: number };
}

// O dourado das estrelinhas do ícone (ICON_DIZZY).
const STAR = 0xffd66b;
/** Onde fica o selo: o que veio, ou o alto da carta. */
const tagSpot = (layer: GpuLayer, at: Point, tag?: Point) => tag ? layer.local(tag.cx, tag.cy) : layer.local(at.cx, at.cy - at.h * .42);

export const DIZZY_EFFECTS: { [N in keyof DizzyParams]: (layer: GpuLayer, s: Shared, p: DizzyParams[N]) => GpuEffect } = {
  dizzy(layer, s, { at, tag, delay = 0 }) {
    const card = layer.local(at.cx, at.cy), end = tagSpot(layer, at, tag);
    const size = Math.min(at.w, at.h);
    // A elipse fica acima da carta, no lado do selo (a carta virada tem o selo de lado).
    const cx = (card.x + end.x) / 2, cy = (card.y + end.y) / 2 - size * .1;
    const rx = size * .55, ry = size * .16, n = layer.coarse ? 3 : 5, star = size * .16 / 64;
    return timed(1000, (view, sparks) => {
      const stars = Array.from({ length: n }, (_, i) => {
        const sprite = new Sprite({ texture: s.star, anchor: .5, x: card.x, y: card.y, tint: i % 2 ? 0xfff1cf : STAR, blendMode: 'add', alpha: 0 });
        view.addChild(sprite);
        return { sprite, angle: (i / n) * Math.PI * 2, k: i ? rand(.6, .85) : 1 };
      });
      const glow = new Sprite({ texture: s.glow, anchor: .5, x: end.x, y: end.y, tint: STAR, blendMode: 'add', alpha: 0 });
      view.addChild(glow);
      let glinted = false;
      return t => {
        // Saem da carta e abrem a elipse (até .3), dão meia volta e fecham no selo (até o fim), girando no sentido do ícone.
        const open = easeOut(Math.min(1, t / .3)), close = Math.max(0, (t - .55) / .45);
        const r = open * (1 - easeOut(close));
        for (const one of stars) {
          const a = one.angle + t * Math.PI * 1.4;
          const depth = (Math.sin(a) + 1) / 2; // 1 na frente, 0 atrás
          const ox = cx + Math.cos(a) * rx * r, oy = cy + Math.sin(a) * ry * r;
          const tx = close > 0 ? ox + (end.x - ox) * easeOut(close) : ox, ty = close > 0 ? oy + (end.y - oy) * easeOut(close) : oy;
          one.sprite.position.set(card.x + (tx - card.x) * open, card.y + (ty - card.y) * open);
          one.sprite.scale.set(star * one.k * (.65 + .35 * depth) * (1 - .5 * close));
          one.sprite.rotation = a * 1.5;
          one.sprite.alpha = Math.min(1, t / .15) * (.55 + .45 * depth) * (1 - close * close);
        }
        // Um brilho curto no selo quando as estrelinhas se recolhem nele.
        glow.scale.set(size * .5 / 128 * (.6 + .6 * close)); glow.alpha = .55 * Math.sin(Math.PI * close);
        if (!glinted && close > .6) {
          glinted = true;
          for (let i = 0; i < (layer.coarse ? 3 : 6); i++) {
            const angle = rand(0, Math.PI * 2), speed = rand(30, 70);
            sparks.add(s.spark, s, { x: end.x, y: end.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(220, 340), spin: 0, grow: -.6, scale: rand(.15, .28), gravity: 0, drag: 3, tint: STAR });
          }
        }
      };
    }, delay);
  },
  undizzy(layer, s, { at, tag, delay = 0 }) {
    const from = tagSpot(layer, at, tag);
    const size = Math.min(at.w, at.h), n = layer.coarse ? 3 : 4, star = size * .15 / 64;
    return timed(760, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, x: from.x, y: from.y, tint: STAR, blendMode: 'add' });
      view.addChild(glow);
      // Cada estrelinha sai num leque para cima, girando, e some subindo.
      const stars = Array.from({ length: n }, (_, i) => {
        const sprite = new Sprite({ texture: s.star, anchor: .5, x: from.x, y: from.y, tint: i % 2 ? 0xfff1cf : STAR, blendMode: 'add' });
        view.addChild(sprite);
        const angle = -Math.PI / 2 + (i - (n - 1) / 2) * .62 + rand(-.12, .12);
        return { sprite, dx: Math.cos(angle) * size * rand(.7, 1), dy: Math.sin(angle) * size * rand(.8, 1.1), spin: rand(5, 9) * (i % 2 ? 1 : -1), k: rand(.75, 1) };
      });
      for (let i = 0; i < (layer.coarse ? 3 : 6); i++) {
        const angle = rand(-Math.PI, 0), speed = rand(40, 90);
        sparks.add(s.spark, s, { x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(240, 380), spin: 0, grow: -.6, scale: rand(.15, .28), gravity: 0, drag: 2.5, tint: STAR });
      }
      return t => {
        const k = easeOut(t);
        for (const one of stars) {
          one.sprite.position.set(from.x + one.dx * k, from.y + one.dy * k);
          one.sprite.rotation = one.spin * t;
          one.sprite.scale.set(star * one.k * (1 - .45 * t));
          one.sprite.alpha = t < .5 ? 1 : 1 - (t - .5) / .5;
        }
        glow.scale.set(size * .45 / 128 * (1 + .5 * k)); glow.alpha = .5 * (1 - Math.min(1, t / .5));
      };
    }, delay);
  },
};
