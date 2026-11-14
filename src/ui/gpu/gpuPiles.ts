// O grimório na camada GPU: embaralhar (duas metades se abrem e as cartas se intercalam de volta) e vidência (as cartas sobem em leque; as do topo voltam por cima e as do fundo passam por baixo), com o verso na cor da capa.
import { Container, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { colorOf, easeOut, spray, timed, type Shared } from './gpuParticles';
import { backTexture } from './gpuFlight';

export interface PileParams {
  /** Embaralhar: `back` são as cinco cores da capa (`--sleeve-light` … `--sleeve-edge`). */
  shuffle: { at: Point; back: readonly string[] };
  /** Vidência de `top` cartas no topo e `bottom` no fundo (no máximo 5 sobem); `inward` é para que lado fica o meio da mesa (1 para baixo, -1 para cima). */
  scry: { at: Point; back: readonly string[]; top: number; bottom: number; inward: number };
}

/** Uma carta de costas do tamanho do monte, com a sombra embaixo. */
function backCard(layer: GpuLayer, s: Shared, back: readonly string[], w: number, h: number) {
  const card = new Container();
  const shadow = new Sprite({ texture: s.cardGlow, anchor: .5, tint: 0x000000, alpha: .45, y: 4 });
  shadow.scale.set(w * 2 / 200 * .98, h * (200 / 140) / 200 * .98);
  const face = new Sprite({ texture: backTexture(layer, back), anchor: .5 });
  face.width = w; face.height = h;
  card.addChild(shadow, face);
  return card;
}
const easeInOut = (t: number) => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export const PILE_EFFECTS: { [N in keyof PileParams]: (layer: GpuLayer, s: Shared, p: PileParams[N]) => GpuEffect } = {
  shuffle(layer, s, { at, back }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const w = at.w, h = at.h, light = colorOf(back[0], 0xe3b363);
    return timed(520, (view, sparks) => {
      const halves = [-1, 1].map(side => { const c = backCard(layer, s, back, w, h); c.position.set(x, y); view.addChild(c); return { c, side }; });
      // As cartas que caem intercaladas no meio, na volta.
      const riffle = Array.from({ length: 6 }, (_, i) => { const c = backCard(layer, s, back, w * .96, h * .96); c.visible = false; view.addChild(c); return { c, side: i % 2 ? 1 : -1, at: .45 + i * .06 }; });
      let puffed = false;
      return t => {
        // Abrem para os lados até .4, voltam até .75 e assentam.
        const open = t < .4 ? easeOut(t / .4) : t < .75 ? 1 - easeInOut((t - .4) / .35) * .8 : .2 * (1 - (t - .75) / .25);
        for (const { c, side } of halves) {
          c.position.set(x + side * w * .55 * open, y - 4 * open);
          c.rotation = side * 8 * Math.PI / 180 * open;
        }
        for (const r of riffle) {
          const u = (t - r.at) / .12;
          r.c.visible = u > 0 && u < 1;
          if (!r.c.visible) continue;
          r.c.position.set(x + r.side * w * .3 * (1 - u), y - 10 * (1 - u));
          r.c.rotation = r.side * .1 * (1 - u);
        }
        if (!puffed && t > .75) {
          puffed = true;
          spray(sparks, s, x, y + h * .4, layer.coarse ? 6 : 10, { speed: [40, 110], life: [220, 380], scale: [.2, .35], colors: [light, 0xffffff], drag: 3 });
        }
      };
    });
  },
  scry(layer, s, { at, back, top, bottom, inward }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const n = Math.min(5, top + bottom), shown = Math.min(top, n);
    const w = Math.max(at.w, 56) * 1.15, h = w * 1.4, gold = 0xf2b54c;
    const life = 940 + (n - 1) * 45;
    return timed(life, (view, sparks) => {
      const cards = Array.from({ length: n }, (_, i) => {
        const c = backCard(layer, s, back, w, h);
        const glow = new Sprite({ texture: s.cardGlow, anchor: .5, tint: i < shown ? gold : 0x6a5a8a, blendMode: 'add', alpha: 0 });
        glow.scale.set(w * 2 / 200 * 1.04, h * (200 / 140) / 200 * 1.04);
        c.addChildAt(glow, 1);
        c.visible = false; view.addChild(c);
        return { c, glow, toBottom: i >= shown, delay: i * 45 };
      });
      const shrink = at.w / w;
      let sparkled = false;
      return t => {
        const ms = t * life;
        for (const [i, card] of cards.entries()) {
          const u = Math.max(0, Math.min(1, (ms - card.delay) / 940));
          card.c.visible = u > 0 && u < 1;
          const spread = (i - (n - 1) / 2) * w * .6, lift = inward * (h * .85 + 12), tilt = (i - (n - 1) / 2) * 4 * Math.PI / 180;
          // Sobe em leque até .35, fica até .6 e volta: o topo por cima, o fundo por baixo do monte, sumindo.
          const up = u < .35 ? easeOut(u / .35) : 1, down = u > .6 ? easeInOut((u - .6) / .4) : 0;
          const sx = spread * up * (1 - down);
          const sy = lift * up * (1 - down) + (card.toBottom ? -inward * at.h * .35 * down : 0);
          card.c.position.set(x + sx, y + sy);
          card.c.rotation = tilt * up * (1 - down);
          card.c.scale.set(shrink + (1 - shrink) * up * (1 - down));
          card.c.alpha = card.toBottom ? 1 - down : 1;
          card.glow.alpha = .5 * Math.sin(Math.PI * Math.min(1, u / .6));
        }
        if (!sparkled && t > .3) {
          sparkled = true;
          spray(sparks, s, x, y + inward * (h * .85 + 12), layer.coarse ? 6 : 12, { speed: [60, 150], life: [260, 420], scale: [.2, .4], colors: [gold, 0xffffff], drag: 3 });
        }
      };
    });
  },
};
