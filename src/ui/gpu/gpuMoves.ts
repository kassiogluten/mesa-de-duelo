// Os efeitos de movimento na camada GPU: portal do exílio, volta do blink, rastro do voo, cinzas do sacrifício, fumaça do ninja, feixe de habilidade, avanço do ataque e poeira ao virar.
import { Container, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { flightArc } from '../flightPath';
import { colorOf, easeOut, paintOnce, rand, spray, themeColor, timed, type Shared } from './gpuParticles';

export interface MoveParams {
  /**
   * Exilada: um portal escuro com a borda de luz, deitado sobre a mesa, abre, gira com braços em espiral e grãos de luz
   * rodando para o centro, e fecha num clarão. A carta (por cima da camada) é sugada por ele. `duration` é a do passo.
   */
  vortex: { at: Point; duration: number };
  /** Voltando do exílio (blink): grãos de luz vêm de volta de todos os lados e a carta acende ao se formar. */
  gather: { at: Point; duration: number };
  /**
   * Rastro de uma carta voando no mesmo arco do voo (`flightArc`), no mesmo tempo: brilho claro (devolvida à mão),
   * brasas (sacrificada) ou poeira (destruída).
   */
  trail: { from: Point; to: Point; duration: number; delay?: number; style: 'sparkle' | 'ember' | 'dust'; color?: string };
  /** Sacrificada: brasas e fumaça escura subindo do lugar em que estava. */
  ash: { at: Point };
  /** Fumaça de ninja: nuvem cinza que cresce e se desfaz. `size` é o diâmetro da nuvem. */
  puff: { at: Point; size: number; delay?: number };
  /** Feixe de uma habilidade ou gatilho da carta até o alvo, com faíscas na chegada. */
  beam: { from: Point; to: Point; color: string; delay?: number };
  /** Habilidade saindo da carta: poucos grãos de luz subindo em volta dela. */
  motes: { at: Point; color: string };
  /** Atacante avançando: riscos de velocidade e poeira atrás dele. `ahead` é para onde ele avança (−1 para cima, 1 para baixo). */
  charge: { at: Point; ahead: number; delay?: number };
  /** Virar: um pouco de poeira na base da carta, quase nada. */
  dust: { at: Point };
}

const LIGHT = [0xffffff, 0xfff1cf, 0xcdefff];

export const MOVE_EFFECTS: { [N in keyof MoveParams]: (layer: GpuLayer, s: Shared, p: MoveParams[N]) => GpuEffect } = {
  vortex(layer, s, { at, duration }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const size = Math.max(at.w, at.h) * 1.15, flat = .62, n = layer.coarse ? 14 : 26;
    // Três braços em espiral, claros perto do centro e sumindo para fora, pintados uma vez por mesa.
    const spiral = paintOnce(layer, 'vortex', 256, 256, g => {
      g.translate(128, 128); g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.strokeStyle = '#fff';
      for (let arm = 0; arm < 3; arm++) {
        g.rotate(Math.PI * 2 / 3);
        for (let a = 0; a < 3.4; a += .08) {
          const r1 = 14 + a * 33, r2 = 14 + (a + .08) * 33;
          g.globalAlpha = Math.max(0, 1 - a / 3.4); g.lineWidth = 7 * (1 - a / 4.5);
          g.beginPath(); g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a + .08) * r2, Math.sin(a + .08) * r2); g.stroke();
        }
      }
    });
    return timed(duration, (view, sparks) => {
      // Deitado sobre a mesa: o disco é achatado na vertical; os braços giram dentro dele.
      const disc = new Container({ x, y });
      disc.scale.y = flat;
      // O fundo do buraco: duas camadas escuras, a menor quase preta, para o centro ficar fundo de verdade.
      const core = new Sprite({ texture: s.glow, anchor: .5, tint: 0x020309, alpha: 0 });
      const pit = new Sprite({ texture: s.glow, anchor: .5, tint: 0x000000, alpha: 0 });
      const arms = new Sprite({ texture: spiral, anchor: .5, tint: 0xcfe0ff, blendMode: 'add', alpha: 0 });
      const rim = new Sprite({ texture: s.ring, anchor: .5, tint: 0xe4ecff, blendMode: 'add', alpha: 0 });
      disc.addChild(core, pit, arms, rim);
      view.addChild(disc);
      // Grãos de luz que nascem na borda e rodam cada vez mais rápido até o centro.
      const motes = Array.from({ length: n }, (_, i) => {
        const sprite = new Sprite({ texture: s.spark, anchor: .5, tint: LIGHT[i % 3]!, blendMode: 'add', alpha: 0 });
        view.addChild(sprite);
        return { sprite, angle: rand(0, Math.PI * 2), reach: rand(.75, 1.15), born: rand(.05, .6), life: rand(.25, .4) };
      });
      let flashed = false;
      return (t, ms) => {
        const open = easeOut(Math.min(1, t / .22)), close = t > .8 ? ((t - .8) / .2) ** 2 : 0, k = open * (1 - close);
        const radius = size / 2 * k;
        core.scale.set(size * 1.6 / 128 * k); core.alpha = k;
        pit.scale.set(size * .9 / 128 * k); pit.alpha = k;
        arms.scale.set(size / 256 * k); arms.alpha = .7 * k; arms.rotation -= ms * .006 * (1 + t * 2.5);
        rim.scale.set(size / 256 * k * 1.08); rim.alpha = .9 * k;
        for (const m of motes) {
          const u = (t - m.born) / m.life;
          if (u < 0 || u > 1) { m.sprite.alpha = 0; continue; }
          const r = radius * m.reach * (1 - u) ** 1.4;
          m.angle -= ms * .001 * (4 + 10 * u);
          m.sprite.position.set(x + Math.cos(m.angle) * r, y + Math.sin(m.angle) * r * flat);
          m.sprite.alpha = Math.sin(Math.PI * u); m.sprite.scale.set(.42 * (1 - u * .6));
        }
        if (!flashed && t >= .92) {
          flashed = true;
          spray(sparks, s, x, y, layer.coarse ? 8 : 14, { speed: [60, 200], life: [200, 380], scale: [.25, .45], colors: LIGHT, drag: 3 });
        }
      };
    });
  },
  gather(layer, s, { at, duration }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const reach = Math.max(at.w, at.h) * 1.1, n = layer.coarse ? 22 : 40, travel = Math.min(500, duration * .5);
    return timed(duration, (view, sparks) => {
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add', alpha: 0 });
      view.addChild(flash);
      // Os grãos partem de um anel em volta da carta e chegam ao centro dela juntos, no meio do passo.
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + rand(-.1, .1), r = reach * rand(.85, 1.15);
        sparks.add(s.spark, s, { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r * .8, vx: -Math.cos(angle) * r / travel * 1000, vy: -Math.sin(angle) * r * .8 / travel * 1000, life: travel, spin: 0, grow: -.4, scale: rand(.25, .5), gravity: 0, drag: 0, tint: LIGHT[i % 3]! });
      }
      let flashed = false;
      return t => {
        const at2 = t * duration;
        if (!flashed && at2 >= travel) { flashed = true; spray(sparks, s, x, y, 12, { speed: [60, 180], life: [200, 380], scale: [.25, .45], colors: LIGHT, drag: 3 }); }
        const k = Math.max(0, (at2 - travel * .8) / (duration - travel * .8));
        flash.scale.set(Math.max(at.w, at.h) * 1.5 / 128 * (.7 + .5 * k)); flash.alpha = at2 < travel * .8 ? 0 : .85 * (1 - k);
      };
    });
  },
  trail(layer, s, { from, to, duration, delay = 0, style, color }) {
    const end = layer.local(to.cx, to.cy), arc = flightArc(from, to);
    // Com cor (a carta que sai do cemitério ou do exílio), o brilho na cor do monte.
    const tint = color ? colorOf(color, 0xffffff) : undefined;
    const colors = tint !== undefined ? [tint, 0xffffff, tint] : style === 'sparkle' ? [0xffffff, 0xcdefff, 0x9fd4ff] : style === 'ember' ? [0xff6a3d, 0xffb07a, 0xd8432a] : [0xbdb5a6, 0x8c8478, 0xe0d8c8];
    let last: { x: number; y: number } | null = null;
    return timed(duration * .92, (_view, sparks) => (t, ms) => {
      // `t` vai até 92% do voo (no fim a carta já entra no monte): a posição é a do voo no mesmo instante.
      const p = arc(t * .92), x = end.x + p.x, y = end.y + p.y;
      if (last && ms > 0) {
        // Mais grãos quanto mais rápido a carta anda (e quanto mais alta, maior a nuvem atrás dela).
        const step = Math.hypot(x - last.x, y - last.y), count = Math.min(style === 'dust' ? 3 : 5, Math.floor(step / (style === 'dust' ? 10 : 6)) + 1);
        for (let i = 0; i < count; i++) {
          const u = (i + Math.random()) / count, px = last.x + (x - last.x) * u, py = last.y + (y - last.y) * u;
          if (style === 'dust') sparks.add(s.glow, s, { x: px, y: py, vx: rand(-20, 20), vy: rand(-10, 20), life: rand(320, 480), spin: 0, grow: 1, scale: rand(.08, .13) * (1 + p.high), gravity: 20, drag: 2, tint: colors[i % 3]!, blend: 'normal', alpha: .22, fadeIn: true });
          else sparks.add(s.spark, s, { x: px + rand(-6, 6), y: py + rand(-6, 6), vx: rand(-25, 25), vy: style === 'ember' ? rand(-50, -10) : rand(-20, 20), life: rand(260, 460), spin: 0, grow: -.6, scale: rand(.25, .55), gravity: style === 'ember' ? -40 : 0, drag: 2.5, tint: colors[i % 3]! });
        }
      }
      last = { x, y };
    }, delay);
  },
  ash(layer, s, { at }) {
    const { x, y } = layer.local(at.cx, at.cy);
    return timed(520, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xd8432a, blendMode: 'add', alpha: 0 });
      view.addChild(glow);
      // Fumaça escura primeiro (desenhada por baixo), depois as brasas.
      for (let i = 0; i < (layer.coarse ? 6 : 10); i++) sparks.add(s.glow, s, { x: x + rand(-.4, .4) * at.w, y: y + rand(-.2, .45) * at.h, vx: rand(-15, 15), vy: rand(-70, -30), life: rand(700, 1000), spin: 0, grow: 1.2, scale: rand(.3, .45) * at.w / 100, gravity: -10, drag: 1, tint: 0x1d1714, blend: 'normal', alpha: .55, fadeIn: true });
      let owed = 0;
      return (t, ms) => {
        owed += ms * .05 * (1 - t);
        for (; owed >= 1; owed--) sparks.add(s.spark, s, { x: x + rand(-.45, .45) * at.w, y: y + rand(0, .5) * at.h, vx: rand(-20, 20), vy: rand(-120, -50), life: rand(500, 800), spin: 0, grow: -.5, scale: rand(.15, .35), gravity: -20, drag: 1.5, tint: [0xff6a3d, 0xffb07a, 0xd8432a][Math.floor(rand(0, 3))]! });
        glow.scale.set(Math.max(at.w, at.h) * 1.2 / 128); glow.alpha = .35 * Math.sin(Math.PI * t);
      };
    });
  },
  puff(layer, s, { at, size, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    return timed(400, (_view, sparks) => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const n = layer.coarse ? 10 : 18;
        for (let i = 0; i < n; i++) {
          const angle = rand(0, Math.PI * 2), r = rand(0, size * .25), speed = rand(30, 110) * size / 160;
          sparks.add(s.glow, s, { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 15, life: rand(700, 1100), spin: rand(-1, 1), grow: 1.1, scale: rand(.22, .38) * size / 128, gravity: -8, drag: 2.2, tint: i % 3 ? 0xd9d9d9 : 0x9a9a9a, blend: 'normal', alpha: .75, fadeIn: true });
        }
      };
    }, delay);
  },
  beam(layer, s, { from, to, color, delay = 0 }) {
    const a = layer.local(from.cx, from.cy), b = layer.local(to.cx, to.cy);
    const tint = colorOf(color, themeColor('--gold', '#f2b54c')), travel = 300;
    let last = a, arrived = false;
    return timed(travel, (view, sparks) => {
      const head = new Sprite({ texture: s.glow, anchor: .5, x: a.x, y: a.y, tint, blendMode: 'add', scale: .3 });
      const core = new Sprite({ texture: s.spark, anchor: .5, x: a.x, y: a.y, tint: 0xffffff, blendMode: 'add', scale: .7 });
      view.addChild(head, core);
      return (t, ms) => {
        const k = easeOut(t), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
        head.position.set(x, y); core.position.set(x, y);
        if (ms > 0) {
          const step = Math.hypot(x - last.x, y - last.y), count = Math.min(6, 1 + Math.floor(step / 6));
          for (let i = 0; i < count; i++) {
            const u = (i + Math.random()) / count;
            sparks.add(s.spark, s, { x: last.x + (x - last.x) * u, y: last.y + (y - last.y) * u, vx: rand(-15, 15), vy: rand(-15, 15), life: rand(200, 360), spin: 0, grow: -.7, scale: rand(.25, .5), gravity: 0, drag: 3, tint: i % 2 ? tint : 0xffffff });
          }
        }
        last = { x, y };
        if (t >= 1 && !arrived) {
          arrived = true; head.visible = core.visible = false;
          spray(sparks, s, b.x, b.y, 14, { speed: [60, 200], life: [220, 420], scale: [.25, .5], colors: [tint, 0xffffff], drag: 3 });
        }
      };
    }, delay);
  },
  motes(layer, s, { at, color }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const tint = colorOf(color, themeColor('--gold', '#f2b54c'));
    return timed(600, (_view, sparks) => {
      let owed = 0;
      return (t, ms) => {
        owed += ms * (layer.coarse ? .035 : .06) * (t < .6 ? 1 : 0);
        for (; owed >= 1; owed--) {
          const side = Math.random() < .5 ? -1 : 1;
          sparks.add(s.spark, s, { x: x + side * at.w * rand(.35, .55), y: y + rand(-.1, .45) * at.h, vx: -side * rand(5, 25), vy: rand(-110, -50), life: rand(500, 800), spin: 0, grow: -.5, scale: rand(.25, .48), gravity: -15, drag: 1.2, tint: Math.random() < .3 ? 0xffffff : tint });
        }
      };
    });
  },
  charge(layer, s, { at, ahead, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const red = themeColor('--red', '#ec5a3f');
    // O atacante dá o bote 30% depois do começo do avanço (560 ms): os riscos saem nessa hora, da borda de trás.
    return timed(220, (_view, sparks) => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const back = y - ahead * at.h * .45;
        for (let i = 0; i < (layer.coarse ? 5 : 9); i++) sparks.add(s.spark, s, { x: x + rand(-.42, .42) * at.w, y: back + rand(-6, 6), vx: rand(-10, 10), vy: -ahead * rand(260, 460), life: rand(180, 300), spin: 0, grow: -.3, scale: rand(.22, .36), gravity: 0, drag: 3, tint: i % 3 ? red : 0xffd2a8, stretch: rand(3, 5) });
        for (let i = 0; i < (layer.coarse ? 3 : 6); i++) sparks.add(s.glow, s, { x: x + rand(-.4, .4) * at.w, y: back, vx: rand(-60, 60), vy: -ahead * rand(10, 40), life: rand(380, 520), spin: 0, grow: 1.2, scale: rand(.1, .16), gravity: 0, drag: 2.5, tint: 0xa8a090, blend: 'normal', alpha: .3, fadeIn: true });
      };
    }, delay + 560 * .3);
  },
  dust(layer, s, { at }) {
    const { x, y } = layer.local(at.cx, at.cy);
    return timed(60, (_view, sparks) => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        // A carta virada fica deitada: a poeira sai dos dois lados da base dela, rente à mesa.
        const base = y + at.h * .45;
        for (let i = 0; i < (layer.coarse ? 3 : 5); i++) {
          const side = i % 2 ? 1 : -1;
          sparks.add(s.glow, s, { x: x + side * at.w * rand(.3, .5), y: base, vx: side * rand(30, 70), vy: rand(-15, 0), life: rand(340, 480), spin: 0, grow: 1.2, scale: rand(.09, .14), gravity: 0, drag: 3, tint: 0xc9bea8, blend: 'normal', alpha: .42, fadeIn: true });
        }
      };
    });
  },
};
