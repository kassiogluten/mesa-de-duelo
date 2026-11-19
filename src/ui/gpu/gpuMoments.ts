// Momentos grandes na camada GPU: a mesa escurecendo em volta do que importa, a lendária chegando com raios, o comandante batendo na mesa, a seta de alvo nascendo num traço de luz e o shuriken do ninja.
import { Graphics, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { colorOf, easeOut, paintOnce, rand, spray, themeColor, timed, type Shared } from './gpuParticles';
import { sunburst } from './gpuStage';

export interface MomentParams {
  /**
   * Momento grande (mágica de valor 6 ou mais, ultimate, golpe letal, lendária): a mesa escurece em volta de `at`,
   * deixando um círculo de `radius` px aceso, por `duration` ms.
   */
  spotlight: { at: Point; radius: number; duration: number; delay?: number; strength?: number;
    /** Golpe letal e ultimate: o degrau 1 do automático não tira (só a mágica grande perde o escuro). */
    keep?: boolean };
  /** Lendária chegando: raios suaves girando atrás do lugar dela, um anel fino e poucas brasas douradas subindo. */
  legend: { at: Point; color?: string; delay?: number };
  /** Comandante caindo no lugar dele: clarão, um anel largo, poeira rente à mesa saindo dos dois lados da base e faíscas douradas. */
  commanderSlam: { at: Point; color?: string; delay?: number };
  /** Seta de alvo nascendo: um traço de luz percorre a curva (de `from`, passando perto de `via`, até `to`) e estoura no alvo. */
  arrowBirth: { from: { x: number; y: number }; via: { x: number; y: number }; to: { x: number; y: number }; color: string; delay?: number };
  /** Shuriken do ninja: gira de `from` até `to` em `duration` ms, deixando um rastro prateado, e estoura ao chegar. */
  shuriken: { from: Point; to: Point; duration: number };
}

/** O escuro em volta: transparente no meio, opaco a partir da metade do raio da textura. */
function spotTexture(layer: GpuLayer) {
  return paintOnce(layer, 'spotlight', 256, 256, g => {
    const shade = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.22, 'rgba(0,0,0,0)');
    shade.addColorStop(.55, 'rgba(0,0,0,.92)'); shade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = shade; g.fillRect(0, 0, 256, 256);
  });
}
/** A estrela de quatro pontas do shuriken, com o furo no meio, em branco para receber a cor. */
function shurikenTexture(layer: GpuLayer) {
  return paintOnce(layer, 'shuriken', 64, 64, g => {
    g.translate(32, 32); g.scale(2.6, 2.6); g.translate(-12, -12);
    g.shadowColor = '#fff'; g.shadowBlur = 3; g.fillStyle = '#fff';
    g.fill(new Path2D('M12 1l2.2 7.8L22 11l-7.8 2.2L12 23l-2.2-7.8L2 12l7.8-2.2zm0 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'), 'evenodd');
  });
}

const quad = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;

export const MOMENT_EFFECTS: { [N in keyof MomentParams]: (layer: GpuLayer, s: Shared, p: MomentParams[N]) => GpuEffect } = {
  spotlight(layer, _s, { at, radius, duration, delay = 0, strength = .5 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const { width, height } = layer.size();
    return timed(duration, view => {
      // O círculo aceso fica em .22 da metade da textura; o resto da tela, fora do sprite, é um retângulo escuro.
      const scale = radius / (128 * .22), half = 128 * scale;
      const spot = new Sprite({ texture: spotTexture(layer), anchor: .5, x, y, scale });
      const rest = new Graphics().rect(-10, -10, width + 20, height + 20).fill({ color: 0x000000 }).rect(x - half + 1, y - half + 1, half * 2 - 2, half * 2 - 2).cut();
      view.addChild(rest, spot);
      return t => {
        // Escurece depressa, fica e volta devagar.
        // `strength`: o quanto escurece (a lendária, mais de leve que a mágica grande).
        view.alpha = strength * (t < .18 ? easeOut(t / .18) : t < .7 ? 1 : 1 - (t - .7) / .3);
      };
    }, delay);
  },
  legend(layer, s, { at, color, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const gold = colorOf(color, themeColor('--gold', '#f2b54c'));
    const size = Math.max(at.w, at.h, 80);
    return timed(1200, (view, sparks) => {
      const rays = new Sprite({ texture: sunburst(layer), anchor: .5, x, y, tint: gold, blendMode: 'add', alpha: 0 });
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xfff1cf, blendMode: 'add', alpha: 0 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: gold, blendMode: 'add' });
      view.addChild(rays, glow, ring);
      spray(sparks, s, x, y, layer.coarse ? 2 : 4, { speed: [size * .8, size * 1.8], life: [450, 800], scale: [.22, .42], colors: [gold, 0xfff1cf], drag: 2.6 });
      let owed = 0;
      return (t, ms) => {
        const k = easeOut(t);
        rays.scale.set(size * 1.6 / 256 * (.45 + .55 * k)); rays.rotation = t * .5; rays.alpha = .16 * Math.sin(Math.PI * Math.min(1, t * 1.05));
        glow.scale.set(size * 1.5 / 128 * (.7 + .3 * k)); glow.alpha = .12 * Math.sin(Math.PI * Math.min(1, t * 1.4));
        ring.scale.set(size * 1.7 / 256 * (.35 + .75 * k)); ring.alpha = .3 * (1 - t);
        // Brasas douradas subindo enquanto os raios giram.
        owed += ms * (layer.coarse ? .003 : .006) * (1 - t);
        for (; owed >= 1; owed--) sparks.add(s.spark, s, { x: x + rand(-.5, .5) * size, y: y + rand(-.1, .5) * size, vx: rand(-15, 15), vy: rand(-140, -60), life: rand(600, 1000), spin: 0, grow: -.5, scale: rand(.2, .4), gravity: -10, drag: 1.2, tint: Math.random() < .3 ? 0xffffff : gold });
      };
    }, delay);
  },
  commanderSlam(layer, s, { at, color, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const gold = colorOf(color, themeColor('--gold', '#f2b54c'));
    const size = Math.max(at.w, at.h, 80);
    return timed(820, (view, sparks) => {
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xfff1cf, blendMode: 'add' });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: gold, blendMode: 'add' });
      view.addChild(flash, ring);
      // A poeira sai rente à mesa, da base da carta, para os dois lados; as faíscas, em volta dela toda.
      const base = y + at.h * .45;
      for (let i = 0; i < (layer.coarse ? 6 : 12); i++) {
        const side = i % 2 ? 1 : -1;
        sparks.add(s.glow, s, { x: x + side * at.w * rand(.1, .45), y: base + rand(-4, 4), vx: side * rand(90, 220), vy: rand(-40, -5), life: rand(480, 760), spin: 0, grow: 1.4, scale: rand(.12, .2), gravity: 30, drag: 3.2, tint: 0xc9bea8, blend: 'normal', alpha: .5, fadeIn: true });
      }
      spray(sparks, s, x, y, layer.coarse ? 8 : 16, { speed: [size * 1.2, size * 2.6], life: [380, 700], scale: [.25, .5], colors: [gold, 0xfff1cf, 0xffffff], drag: 2.8 });
      return t => {
        const k = easeOut(t);
        flash.scale.set(size * 1.4 / 128 * (.6 + .5 * k)); flash.alpha = .55 * Math.max(0, 1 - t * 2.4);
        ring.scale.set(size * 2.6 / 256 * (.25 + .9 * k)); ring.alpha = .85 * (1 - t);
      };
    }, delay);
  },
  arrowBirth(layer, s, { from, via, to, color, delay = 0 }) {
    const tint = colorOf(color, themeColor('--gold', '#f2b54c'));
    // Os pontos chegam em coordenadas da janela.
    const a = layer.local(from.x, from.y), c = layer.local(via.x, via.y), b = layer.local(to.x, to.y);
    const travel = 360;
    let last = a, burst = false;
    return timed(travel + 260, (view, sparks) => {
      const head = new Sprite({ texture: s.glow, anchor: .5, x: a.x, y: a.y, tint, blendMode: 'add', scale: .32 });
      const core = new Sprite({ texture: s.spark, anchor: .5, x: a.x, y: a.y, tint: 0xffffff, blendMode: 'add', scale: .8 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x: b.x, y: b.y, tint, blendMode: 'add', alpha: 0 });
      view.addChild(head, core, ring);
      const split = travel / (travel + 260);
      return t => {
        const u = Math.min(1, t / split), k = easeOut(u);
        const x = quad(a.x, c.x, b.x, k), y = quad(a.y, c.y, b.y, k);
        if (u < 1) {
          head.position.set(x, y); core.position.set(x, y);
          const step = Math.hypot(x - last.x, y - last.y), count = Math.min(5, 1 + Math.floor(step / 8));
          for (let i = 0; i < count; i++) {
            const w = (i + Math.random()) / count;
            sparks.add(s.spark, s, { x: last.x + (x - last.x) * w, y: last.y + (y - last.y) * w, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(160, 280), spin: 0, grow: -.7, scale: rand(.3, .55), gravity: 0, drag: 3, tint: i % 2 ? tint : 0xffffff });
          }
          last = { x, y };
        } else {
          head.visible = core.visible = false;
          if (!burst) { burst = true; spray(sparks, s, b.x, b.y, layer.coarse ? 8 : 14, { speed: [60, 160], life: [220, 380], scale: [.25, .45], colors: [tint, 0xffffff], drag: 3 }); }
          const e = (t - split) / (1 - split);
          ring.scale.set(.25 + .35 * easeOut(e)); ring.alpha = .9 * (1 - e);
        }
      };
    }, delay);
  },
  shuriken(layer, s, { from, to, duration }) {
    const a = layer.local(from.cx, from.cy), b = layer.local(to.cx, to.cy);
    const silver = 0xe2e2e2;
    let last = a, burst = false;
    return timed(duration, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, x: a.x, y: a.y, tint: 0xffffff, blendMode: 'add', scale: .3, alpha: .5 });
      const star = new Sprite({ texture: shurikenTexture(layer), anchor: .5, x: a.x, y: a.y, tint: silver, scale: .62 });
      view.addChild(glow, star);
      return t => {
        // Como o shuriken em CSS: gira duas voltas no caminho e para de girar um pouco antes de sumir.
        const u = Math.min(1, t / .9), k = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
        star.position.set(x, y); glow.position.set(x, y);
        star.rotation = Math.PI * 4 * k + (t > .9 ? (t - .9) * 8 : 0);
        star.alpha = glow.alpha = t > .9 ? 1 - (t - .9) / .1 : 1;
        const step = Math.hypot(x - last.x, y - last.y), count = Math.min(5, Math.floor(step / 9));
        for (let i = 0; i < count; i++) {
          const w = (i + Math.random()) / count;
          sparks.add(s.spark, s, { x: last.x + (x - last.x) * w, y: last.y + (y - last.y) * w, vx: rand(-25, 25), vy: rand(-25, 25), life: rand(150, 260), spin: 0, grow: -.6, scale: rand(.25, .45), gravity: 0, drag: 3, tint: i % 2 ? silver : 0xffffff });
        }
        last = { x, y };
        if (!burst && t >= .9) { burst = true; spray(sparks, s, b.x, b.y, layer.coarse ? 8 : 14, { speed: [80, 200], life: [200, 340], scale: [.25, .45], colors: [0xffffff, silver], drag: 3 }); }
      };
    });
  },
};
