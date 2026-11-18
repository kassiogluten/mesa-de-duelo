// A onda do limpa campo na camada GPU: a mesa escurece e uma onda na cor da mágica (luz dourada, maré, névoa roxa, fogo, folhas, prata) sai de quem conjurou e varre a mesa inteira, soltando o que é dela pelo caminho.
import { Graphics, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import type { SweepStyle } from '../boardSweep';
import { easeOut, rand, timed, type Shared } from './gpuParticles';

export interface SweepParams {
  /**
   * Limpa campo: a onda sai de `from` e chega a `reach` px (o canto mais longe da mesa) em `travel` ms, com o jeito da
   * cor da mágica (`style`); depois, o rastro dela apaga.
   */
  sweep: { from: Point; reach: number; travel: number; style: SweepStyle };
}

/** Cores da onda, o quanto a mesa escurece, se a onda é de sombra (preto) e o brilho que fica por onde ela passou. */
interface Look { main: number; hot: number; dim: number; dark: boolean; wash: number }
const LOOKS: Record<SweepStyle, Look> = {
  W: { main: 0xffd98a, hot: 0xffffff, dim: .18, dark: false, wash: .16 },
  U: { main: 0x4fa6ff, hot: 0xd8f0ff, dim: .3, dark: false, wash: .14 },
  B: { main: 0x9b5cff, hot: 0xd7bcff, dim: .5, dark: true, wash: .34 },
  R: { main: 0xff6a2a, hot: 0xffd27a, dim: .3, dark: false, wash: .16 },
  G: { main: 0x4fc979, hot: 0xd9ffb0, dim: .26, dark: false, wash: .12 },
  M: { main: 0xf2b54c, hot: 0xfff1cf, dim: .26, dark: false, wash: .14 },
  C: { main: 0xc9d3de, hot: 0xffffff, dim: .26, dark: false, wash: .12 },
};
/** Quanto o rastro da onda leva para apagar depois que ela passa da última carta (ms). */
const FADE = 560;

type Sparks = Parameters<Parameters<typeof timed>[1]>[1];

/** O que a onda solta num ponto da frente dela, andando para fora (`ux`, `uy`): o jeito de cada cor. */
function emit(style: SweepStyle, s: Shared, sparks: Sparks, x: number, y: number, ux: number, uy: number, look: Look) {
  const out = (a: number, b: number) => rand(a, b);
  switch (style) {
    case 'W': {
      // Luz: estrelinhas subindo devagar e grãos dourados.
      const v = out(30, 90);
      sparks.add(s.star, s, { x, y, vx: ux * v, vy: uy * v - rand(60, 140), life: rand(700, 1100), spin: rand(-2, 2), grow: -.3, scale: rand(.18, .34), gravity: -40, drag: 1.6, tint: Math.random() < .5 ? look.hot : look.main });
      sparks.add(s.spark, s, { x, y, vx: ux * out(60, 160), vy: uy * out(60, 160) - 40, life: rand(400, 700), spin: 0, grow: -.5, scale: rand(.3, .55), gravity: -20, drag: 2.2, tint: look.main });
      return;
    }
    case 'U': {
      // Maré: gotas jogadas para fora e para cima, que caem, e espuma clara.
      const v = out(180, 360);
      sparks.add(s.spark, s, { x, y, vx: ux * v, vy: uy * v - rand(80, 200), life: rand(500, 800), spin: 0, grow: -.4, scale: rand(.25, .5), gravity: 700, drag: 1.4, tint: [look.hot, look.main, 0xffffff][Math.floor(rand(0, 3))]!, stretch: 1.8 });
      sparks.add(s.glow, s, { x, y, vx: ux * out(20, 60), vy: uy * out(20, 60), life: rand(420, 650), spin: 0, grow: 1.1, scale: rand(.25, .45), gravity: 0, drag: 2, tint: look.hot, alpha: .35 });
      return;
    }
    case 'B': {
      // Névoa: fumaça escura que cresce devagar e faíscas roxas.
      sparks.add(s.glow, s, { x, y, vx: ux * out(20, 70), vy: uy * out(20, 70) - rand(5, 25), life: rand(900, 1300), spin: 0, grow: 1.6, scale: rand(.45, .8), gravity: 0, drag: 1.2, tint: 0x12061c, blend: 'normal', alpha: .6, fadeIn: true });
      sparks.add(s.spark, s, { x, y, vx: ux * out(60, 160), vy: uy * out(60, 160), life: rand(380, 620), spin: 0, grow: -.5, scale: rand(.25, .5), gravity: 0, drag: 2.4, tint: Math.random() < .6 ? look.main : look.hot });
      return;
    }
    case 'R': {
      // Fogo: brasas subindo e labaredas curtas na frente da onda.
      sparks.add(s.spark, s, { x, y, vx: ux * out(60, 170), vy: uy * out(40, 120) - rand(80, 200), life: rand(600, 1000), spin: 0, grow: -.6, scale: rand(.25, .55), gravity: -70, drag: 1.4, tint: [look.hot, look.main, 0xffb347][Math.floor(rand(0, 3))]! });
      sparks.add(s.glow, s, { x, y, vx: ux * out(30, 80), vy: uy * out(30, 80) - rand(20, 60), life: rand(320, 480), spin: 0, grow: .9, scale: rand(.3, .5), gravity: -40, drag: 2, tint: look.main, alpha: .55 });
      return;
    }
    case 'G': {
      // Folhas: pedacinhos verdes girando, que sobem e caem, e um pouco de poeira de terra.
      const v = out(80, 220);
      sparks.add(s.shard, s, { x, y, vx: ux * v, vy: uy * v - rand(60, 160), life: rand(800, 1200), spin: rand(-8, 8), grow: -.2, scale: rand(.28, .5), gravity: 260, drag: 1.6, tint: [0x4fc979, 0x8bdc5a, 0x2f8f4f, 0xc9e27a][Math.floor(rand(0, 4))]!, blend: 'normal' });
      sparks.add(s.spark, s, { x, y, vx: ux * out(30, 90), vy: uy * out(30, 90), life: rand(420, 640), spin: 0, grow: .4, scale: rand(.3, .5), gravity: 0, drag: 2, tint: 0xc8b48a, alpha: .5 });
      return;
    }
    case 'C': {
      // Prata: lascas de metal que caem girando e faíscas brancas.
      const v = out(120, 300);
      sparks.add(s.shard, s, { x, y, vx: ux * v, vy: uy * v - rand(80, 200), life: rand(520, 800), spin: rand(-14, 14), grow: -.3, scale: rand(.22, .45), gravity: 800, drag: 1.2, tint: [0xdfe6ee, 0x9aa5b1, 0xffffff][Math.floor(rand(0, 3))]!, blend: 'normal' });
      sparks.add(s.spark, s, { x, y, vx: ux * out(80, 200), vy: uy * out(80, 200), life: rand(300, 500), spin: 0, grow: -.5, scale: rand(.25, .45), gravity: 0, drag: 2.6, tint: look.hot });
      return;
    }
    default: {
      // Várias cores: faíscas douradas para fora e estrelinhas.
      sparks.add(s.spark, s, { x, y, vx: ux * out(100, 260), vy: uy * out(100, 260) - 40, life: rand(420, 700), spin: 0, grow: -.5, scale: rand(.3, .55), gravity: 120, drag: 2, tint: Math.random() < .5 ? look.main : look.hot });
      sparks.add(s.star, s, { x, y, vx: ux * out(30, 80), vy: uy * out(30, 80) - rand(40, 100), life: rand(600, 900), spin: rand(-2, 2), grow: -.3, scale: rand(.16, .3), gravity: -30, drag: 1.6, tint: look.hot });
    }
  }
}

export const SWEEP_EFFECTS: { [N in keyof SweepParams]: (layer: GpuLayer, s: Shared, p: SweepParams[N]) => GpuEffect } = {
  sweep(layer, s, { from, reach, travel, style }) {
    const { x, y } = layer.local(from.cx, from.cy);
    const { width, height } = layer.size();
    const look = LOOKS[style];
    const life = travel + FADE;
    // Quantos pontos da frente soltam o que é dela a cada quadro (no celular, menos).
    const perFrame = layer.coarse ? 3 : 7;
    return timed(life, (view, sparks) => {
      const dim = new Graphics().rect(-10, -10, width + 20, height + 20).fill({ color: 0x000000 });
      const wash = new Graphics();
      wash.blendMode = look.dark ? 'normal' : 'add';
      const shade = new Graphics();
      const front = new Graphics();
      front.blendMode = 'add';
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: look.hot, blendMode: 'add' });
      view.addChild(dim, wash, shade, front, flash);
      return t => {
        const age = t * life, u = Math.min(1, age / travel), r = Math.max(1, reach * u);
        // Some no fim: depois que a onda passa da última carta, o resto apaga junto.
        const gone = age <= travel ? 0 : (age - travel) / FADE;
        dim.alpha = look.dim * Math.min(1, age / 220) * (1 - gone);
        // O brilho por onde a onda acabou de passar (a sombra, na névoa roxa): uma faixa larga logo atrás da frente,
        // mais fraca por dentro, que fica e apaga no fim.
        const band = Math.min(r, 280);
        wash.clear();
        for (const [k, a] of [[1, .45], [.6, .7], [.28, 1]] as const) {
          const w = band * k;
          wash.circle(x, y, Math.max(1, r - w / 2)).stroke({ width: w, color: look.dark ? 0x12061c : look.main, alpha: look.wash * a * (1 - gone) });
        }
        // A frente: faixas de luz da mais larga e fraca até um fio claro; na névoa, uma faixa escura logo atrás.
        front.clear();
        shade.clear();
        if (u < 1) {
          if (look.dark) shade.circle(x, y, Math.max(1, r - 40)).stroke({ width: 110, color: 0x0a0410, alpha: .45 });
          for (const [w, a, c] of [[70, .07, look.main], [28, .16, look.main], [10, .42, look.main], [2.5, .9, look.hot]] as const) {
            front.circle(x, y, r).stroke({ width: w, color: c, alpha: a });
          }
          // O que a frente solta, nos pontos dela que estão dentro da mesa.
          for (let i = 0; i < perFrame; i++) {
            for (let tries = 0; tries < 3; tries++) {
              const angle = rand(0, Math.PI * 2), px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
              if (px < -20 || py < -20 || px > width + 20 || py > height + 20) continue;
              emit(style, s, sparks, px, py, Math.cos(angle), Math.sin(angle), look);
              break;
            }
          }
        }
        // O clarão em quem conjurou, quando a onda sai.
        const burst = Math.min(1, age / 380);
        flash.scale.set(Math.max(from.w, 90) / 128 * (.6 + 2.6 * easeOut(burst)));
        flash.alpha = .9 * (1 - burst);
      };
    });
  },
};
