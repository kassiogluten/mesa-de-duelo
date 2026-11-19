// A permanente que aguenta o golpe, na camada GPU: as rachaduras da indestrutível (ou da regenerada) que aparecem e se fecham em luz, e o corte do primeiro golpe e do golpe duplo no alvo.
import { Graphics, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { easeOut, rand, timed, type Shared } from './gpuParticles';

export interface SurviveParams {
  /**
   * A carta em `at` racha a partir do meio e as rachaduras se fecham em luz, das pontas para dentro: dourada na
   * indestrutível, verde na regenerada (que ainda solta grãos subindo). Dura `duration` ms.
   */
  mend: { at: Point; how: 'indestructible' | 'regenerated'; duration?: number };
  /**
   * O corte do primeiro golpe: um risco de lâmina que atravessa o alvo em `at`, de lado para o sentido do golpe (`dir`,
   * em radianos). `second` é o segundo golpe do golpe duplo: cruza o primeiro, que ainda aparece apagado.
   */
  slash: { at: Point; dir: number; second?: boolean };
}

const LOOKS = {
  indestructible: { main: 0xf2c14c, hot: 0xfff1cf },
  regenerated: { main: 0x63d68f, hot: 0xd9ffb0 },
};

type Line = { points: [number, number][]; lengths: number[]; total: number };

/** Uma rachadura: do ponto do golpe até perto da borda da carta, em zigue-zague, com os comprimentos de cada trecho. */
function crack(angle: number, w: number, h: number, ox: number, oy: number): Line {
  const points: [number, number][] = [[ox, oy]];
  const reach = Math.min(w, h) * rand(.42, .6), steps = 5;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, bend = angle + rand(-.5, .5) * (i < steps ? 1 : .4);
    const [px, py] = points[i - 1]!;
    // Fica dentro da carta: o que passaria da borda para nela.
    points.push([Math.max(-w / 2, Math.min(w / 2, px + Math.cos(bend) * reach / steps * (1.2 - k * .3))),
      Math.max(-h / 2, Math.min(h / 2, py + Math.sin(bend) * reach / steps * (1.2 - k * .3) * (h / w)))]);
  }
  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i]![0], y - points[i]![1]));
  return { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
}
/** O ponto a `d` px do começo da linha. */
function along(line: Line, d: number): [number, number] {
  let rest = Math.max(0, Math.min(line.total, d));
  for (let i = 0; i < line.lengths.length; i++) {
    const len = line.lengths[i]!;
    if (rest <= len || i === line.lengths.length - 1) {
      const [ax, ay] = line.points[i]!, [bx, by] = line.points[i + 1]!, k = len ? rest / len : 0;
      return [ax + (bx - ax) * k, ay + (by - ay) * k];
    }
    rest -= len;
  }
  return line.points[0]!;
}
/** Desenha a linha do começo até `to` (fração de 0 a 1 do comprimento). */
function trace(g: Graphics, line: Line, x: number, y: number, to: number) {
  const end = line.total * to;
  let walked = 0;
  g.moveTo(x + line.points[0]![0], y + line.points[0]![1]);
  for (let i = 0; i < line.lengths.length && walked < end; i++) {
    const len = line.lengths[i]!;
    if (walked + len <= end) g.lineTo(x + line.points[i + 1]![0], y + line.points[i + 1]![1]);
    else { const [px, py] = along(line, end); g.lineTo(x + px, y + py); }
    walked += len;
  }
}

export const SURVIVE_EFFECTS: { [N in keyof SurviveParams]: (layer: GpuLayer, s: Shared, p: SurviveParams[N]) => GpuEffect } = {
  mend(layer, s, { at, how, duration = 820 }) {
    const look = LOOKS[how];
    return timed(duration, (view, sparks) => {
      const { x, y } = layer.local(at.cx, at.cy);
      const w = Math.max(at.w, 40), h = Math.max(at.h, 40);
      const ox = rand(-.12, .12) * w, oy = rand(-.14, .06) * h;
      const count = layer.coarse ? 4 : 6, turn = rand(0, Math.PI * 2);
      const lines = Array.from({ length: count }, (_, i) => crack(turn + i / count * Math.PI * 2 + rand(-.3, .3), w, h, ox, oy));
      // A sombra da rachadura (escura, por baixo), o fio dela e a luz que a fecha.
      const dark = new Graphics(), seam = new Graphics(), light = new Graphics();
      seam.blendMode = light.blendMode = 'add';
      const glow = new Sprite({ texture: s.cardGlow, anchor: .5, x, y, tint: look.main, blendMode: 'add', alpha: 0 });
      glow.scale.set(w / 100, h / 140);
      const beads = lines.map(() => new Sprite({ texture: s.glow, anchor: .5, tint: look.hot, blendMode: 'add', alpha: 0 }));
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: look.main, blendMode: 'add', alpha: 0 });
      view.addChild(glow, dark, seam, light, ...beads, ring);
      // A rachadura abre até OPEN, fica até HOLD e fecha até SHUT; depois, o clarão em volta da carta.
      const OPEN = .2, HOLD = .36, SHUT = .8;
      let burst = false;
      return t => {
        const open = easeOut(Math.min(1, t / OPEN));
        // Fecha das pontas para o meio: o quanto ainda está aberta.
        const closing = t <= HOLD ? 0 : Math.min(1, (t - HOLD) / (SHUT - HOLD));
        const left = open * (1 - closing);
        dark.clear(); seam.clear(); light.clear();
        if (left > .001) for (const line of lines) {
          trace(dark, line, x, y, left); trace(seam, line, x, y, left);
        }
        dark.stroke({ width: 4.5, color: 0x08060a, alpha: .7, join: 'round', cap: 'round' });
        // Antes de fechar, a rachadura é clara e fria; fechando, toma a cor da luz.
        seam.stroke({ width: 1.4, color: closing > 0 ? look.hot : 0xffffff, alpha: .85, join: 'round', cap: 'round' });
        lines.forEach((line, i) => {
          const bead = beads[i]!;
          if (closing <= 0 || closing >= 1) { bead.alpha = 0; return; }
          // A luz corre da ponta para o meio, soldando o que fica para trás.
          const [px, py] = along(line, line.total * left);
          bead.position.set(x + px, y + py);
          bead.alpha = .95; bead.scale.set(Math.max(w, 60) / 128 * .28);
          const [qx, qy] = along(line, Math.min(line.total, line.total * left + line.total * .22));
          light.moveTo(x + px, y + py).lineTo(x + qx, y + qy);
          if (Math.random() < (layer.coarse ? .2 : .45)) sparks.add(s.spark, s, { x: x + px, y: y + py, vx: rand(-50, 50), vy: rand(-70, 10), life: rand(240, 420), spin: 0, grow: -.6, scale: rand(.16, .3), gravity: how === 'regenerated' ? -60 : 160, drag: 2.4, tint: Math.random() < .5 ? look.hot : look.main });
        });
        light.stroke({ width: 3, color: look.main, alpha: .7, cap: 'round' });
        // O contorno da carta acende quando a última rachadura fecha, e um anel curto sai dela.
        const done = t < SHUT ? 0 : (t - SHUT) / (1 - SHUT);
        glow.alpha = t < HOLD ? 0 : t < SHUT ? .3 * closing : .5 * (1 - done);
        ring.alpha = t < SHUT ? 0 : .8 * (1 - done);
        ring.scale.set(Math.max(w, h) / 256 * (1.1 + .5 * easeOut(done)));
        if (!burst && t >= SHUT) {
          burst = true;
          const n = layer.coarse ? 6 : 12;
          for (let i = 0; i < n; i++) {
            // A regenerada solta grãos verdes que sobem; a indestrutível, lascas de luz que caem.
            const px = x + rand(-.5, .5) * w, py = y + rand(-.5, .5) * h;
            if (how === 'regenerated') sparks.add(s.star, s, { x: px, y: py, vx: rand(-20, 20), vy: rand(-110, -40), life: rand(520, 800), spin: rand(-3, 3), grow: -.4, scale: rand(.14, .26), gravity: -30, drag: 1.6, tint: i % 3 ? look.main : look.hot });
            else sparks.add(s.spark, s, { x: px, y: py, vx: rand(-70, 70), vy: rand(-90, 20), life: rand(360, 560), spin: 0, grow: -.6, scale: rand(.22, .38), gravity: 240, drag: 2, tint: i % 2 ? look.main : look.hot });
          }
        }
      };
    });
  },
  slash(layer, s, { at, dir, second = false }) {
    return timed(second ? 420 : 340, (view, sparks) => {
      const { x, y } = layer.local(at.cx, at.cy);
      const reach = Math.max(at.w, at.h, 60) * .78;
      // O corte atravessa o alvo de lado para o golpe; o segundo cruza o primeiro.
      const tilt = dir + Math.PI / 2 + (second ? .6 : -.6);
      const cuts = second ? [dir + Math.PI / 2 - .6, tilt] : [tilt];
      const blades = cuts.map((angle, i) => {
        const old = second && i === 0;
        const blade = new Graphics();
        blade.blendMode = 'add';
        blade.position.set(x, y); blade.rotation = angle;
        view.addChild(blade);
        return { blade, old };
      });
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add', alpha: 0 });
      view.addChild(flash);
      let struck = false;
      return t => {
        for (const { blade, old } of blades) {
          blade.clear();
          // O primeiro golpe do golpe duplo fica como uma marca apagada enquanto o segundo passa.
          if (old) { blade.moveTo(-reach, 0).lineTo(reach, 0).stroke({ width: 2, color: 0xcfd8e6, alpha: .35 * (1 - t), cap: 'round' }); continue; }
          // A lâmina corre de uma ponta à outra em um terço do tempo; a marca dela afina e apaga.
          const head = Math.min(1, t / .32), tail = Math.max(0, (t - .1) / .5);
          const a = -reach + reach * 2 * Math.min(1, tail), b = -reach + reach * 2 * head;
          if (b <= a) continue;
          const fade = t < .5 ? 1 : 1 - (t - .5) / .5;
          for (const [width, alpha, color] of [[14, .16, 0x9fc4ff], [6, .4, 0xdfeaff], [2, .95, 0xffffff]] as const) {
            blade.moveTo(a, 0).lineTo(b, 0).stroke({ width: width * (1 - tail * .6), color, alpha: alpha * fade, cap: 'round' });
          }
        }
        const k = Math.min(1, t / .3);
        flash.alpha = .8 * (1 - k); flash.scale.set(reach / 128 * (.5 + 1.2 * easeOut(k)));
        if (!struck && t >= .16) {
          struck = true;
          const n = layer.coarse ? 5 : 10;
          for (let i = 0; i < n; i++) {
            const side = Math.random() < .5 ? tilt : tilt + Math.PI, a = side + rand(-.35, .35), speed = rand(160, 360);
            sparks.add(s.spark, s, { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(200, 340), spin: 0, grow: -.6, scale: rand(.2, .34), gravity: 0, drag: 3, tint: i % 2 ? 0xffffff : 0xbcd6ff, stretch: 2 });
          }
        }
      };
    });
  },
};
