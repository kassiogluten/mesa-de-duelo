// O golpe de comandante na camada GPU: a coroa dourada que se estampa no retrato de quem levou o golpe (e se parte em estilhaços vermelhos no golpe que chega a 21) e a coroa pequena que voa do retrato até o contador "Dano X/21".
import { Sprite, type Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';

export interface CommanderParams {
  /**
   * A coroa dourada cai sobre o retrato (`at`) e se estampa nele, com um anel e faíscas douradas; depois sobe e some.
   * `size` é a largura da coroa em CSS px. `lethal` é o golpe que leva o dano daquele comandante a 21: a coroa
   * estremece, fica vermelha e se parte ao meio, com estilhaços vermelhos caindo.
   */
  crownStamp: { at: Point; size: number; lethal?: boolean; delay?: number };
  /**
   * A coroa pequena sai de `from` (o retrato), sobe em arco e pousa em `to` (o contador "Dano X/21") em `duration` ms,
   * deixando um rastro de faíscas douradas (vermelhas no golpe que chega a 21), e acende o contador ao chegar.
   */
  crownFly: { from: Point; to: Point; duration: number; lethal?: boolean; delay?: number };
}

const GOLD = 0xf2c14c, GOLD_HOT = 0xfff1c4, RED = 0xff4d3d, RED_HOT = 0xffb3a6;
/** A largura da coroa dentro da textura de 256 px: a escala do sprite é a largura pedida sobre isto. */
const CROWN_W = 192;

/** O contorno da coroa em 24×24 (o mesmo desenho do selo de dano de comandante, preenchido): cinco pontas e a base. */
function crownPath(g: CanvasRenderingContext2D) {
  g.beginPath();
  g.moveTo(3, 7.5); g.lineTo(7.6, 11.4); g.lineTo(12, 4.2); g.lineTo(16.4, 11.4); g.lineTo(21, 7.5); g.lineTo(19, 18); g.lineTo(5, 18); g.closePath();
  g.rect(5, 19.3, 14, 2.2);
}
/** O risco da racha, de cima a baixo, em zigue-zague pelo meio da coroa. */
const CRACK: [number, number][] = [[12, 1], [11.1, 7], [12.9, 10.5], [11.3, 14.2], [12.7, 17.6], [11.6, 20.2], [12.2, 24]];

/** Pinta a coroa inteira, ou só a metade da esquerda ou da direita da racha, centrada na textura de 256 px. */
function paintCrown(part: 'whole' | 'left' | 'right') {
  return (g: CanvasRenderingContext2D) => {
    g.save();
    g.translate(128, 128); g.scale(9.6, 9.6); g.translate(-12, -12.6);
    if (part !== 'whole') {
      g.beginPath();
      const edge = part === 'left' ? -2 : 26;
      g.moveTo(edge, -2);
      for (const [x, y] of CRACK) g.lineTo(x, y);
      g.lineTo(edge, 26); g.closePath(); g.clip();
    }
    const metal = g.createLinearGradient(0, 4, 0, 21.5);
    metal.addColorStop(0, '#fff6cf'); metal.addColorStop(.42, '#f6c64e'); metal.addColorStop(1, '#a86d12');
    g.shadowColor = 'rgba(255,196,80,.85)'; g.shadowBlur = 22;
    crownPath(g); g.fillStyle = metal; g.fill('nonzero');
    g.shadowBlur = 0;
    g.lineWidth = .55; g.strokeStyle = '#5a3606'; g.lineJoin = 'round'; crownPath(g); g.stroke();
    // O brilho do metal: um filete claro logo abaixo das pontas.
    g.lineWidth = .45; g.strokeStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.moveTo(6, 16.8); g.lineTo(18, 16.8); g.stroke();
    // As pérolas das pontas e a pedra do meio.
    g.fillStyle = '#fffbe8';
    for (const [x, y] of [[3, 7.5], [12, 4.2], [21, 7.5]] as const) { g.beginPath(); g.arc(x, y, 1.05, 0, Math.PI * 2); g.fill(); }
    const gem = g.createRadialGradient(11.6, 13.9, .1, 12, 14.4, 1.6);
    gem.addColorStop(0, '#ffd0c8'); gem.addColorStop(.5, '#e0362a'); gem.addColorStop(1, '#7a0f0a');
    g.fillStyle = gem; g.beginPath(); g.arc(12, 14.4, 1.5, 0, Math.PI * 2); g.fill();
    g.restore();
  };
}
const crownTexture = (layer: GpuLayer, part: 'whole' | 'left' | 'right'): Texture => paintOnce(layer, `crown:${part}`, 256, 256, paintCrown(part));
/**
 * As três texturas da coroa (inteira e as duas metades), pintadas com a camada ociosa (gpuEffects.ts, `warmUp`): pintar
 * e subir na hora do golpe travava a primeira coroa partida.
 */
export const crownTextures = (layer: GpuLayer) => (['whole', 'left', 'right'] as const).map(part => crownTexture(layer, part));

/** Mistura duas cores (0xRRGGBB) em `k` (0 é `a`, 1 é `b`). */
function mix(a: number, b: number, k: number) {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export const COMMANDER_EFFECTS: { [N in keyof CommanderParams]: (layer: GpuLayer, s: Shared, p: CommanderParams[N]) => GpuEffect } = {
  crownStamp(layer, s, { at, size, lethal = false, delay = 0 }) {
    // O golpe que chega a 21 dura mais: a coroa precisa estremecer, ficar vermelha e se partir.
    return timed(lethal ? 1080 : 780, (view, sparks) => {
      const { x, y } = layer.local(at.cx, at.cy);
      const base = size / CROWN_W;
      const halo = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: GOLD, blendMode: 'add', alpha: 0 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: GOLD, blendMode: 'add', alpha: 0 });
      const crown = new Sprite({ texture: crownTexture(layer, 'whole'), anchor: .5, x, y, alpha: 0 });
      const halves = lethal ? (['left', 'right'] as const).map(part => new Sprite({ texture: crownTexture(layer, part), anchor: .5, x, y, visible: false })) : [];
      view.addChild(halo, ring, crown, ...halves);
      // Em que fração do tempo a coroa bate no retrato e, no golpe que chega a 21, em que fração ela se parte.
      const SLAM = lethal ? .15 : .2, SPLIT = .46;
      let slammed = false, split = false;
      const pieces = halves.map((sprite, i) => ({ sprite, vx: (i ? 1 : -1) * rand(70, 110), vy: rand(-140, -90), spin: (i ? 1 : -1) * rand(1.4, 2.4) }));
      return (t, ms) => {
        if (t < SLAM) {
          // Cai do alto, grande e transparente, e acelera até o retrato.
          const k = t / SLAM;
          crown.alpha = Math.min(1, k * 1.6);
          crown.scale.set(base * (1.9 - .9 * k * k));
          crown.y = y - size * .25 * (1 - k * k);
          halo.alpha = .25 * k; halo.scale.set(size / 128 * .9);
          return;
        }
        if (!slammed) {
          slammed = true; crown.y = y;
          spray(sparks, s, x, y + size * .08, layer.coarse ? 8 : 16, { speed: [120, 300], life: [280, 520], scale: [.2, .38], colors: [GOLD, GOLD_HOT, 0xffffff], gravity: 140, drag: 2.6, keep: lethal });
        }
        const after = (t - SLAM) / (1 - SLAM);
        // O anel do pouso abre e apaga; o halo acende e assenta.
        const r = Math.min(1, after / .45);
        ring.alpha = .9 * (1 - r); ring.scale.set(size / 256 * (.7 + 1.5 * easeOut(r)));
        if (!lethal) {
          // Amassa um pouco no pouso, volta, fica um instante e sobe apagando.
          const squash = after < .18 ? 1.12 - .12 * (after / .18) : 1;
          const leave = after < .62 ? 0 : (after - .62) / .38;
          crown.scale.set(base * squash * (1 - .1 * leave));
          crown.y = y - size * .18 * easeOut(leave);
          crown.alpha = 1 - leave;
          halo.alpha = (after < .2 ? .8 - after * 2 : .4) * (1 - leave); halo.scale.set(size / 128 * (1 + .1 * Math.sin(after * 9)));
          return;
        }
        // Golpe que chega a 21: a coroa estremece e esquenta até o vermelho, e se parte ao meio.
        const heat = Math.min(1, (t - SLAM) / (SPLIT - SLAM));
        const tint = mix(0xffffff, 0xff7a6a, heat);
        if (t < SPLIT) {
          crown.scale.set(base * (after < .1 ? 1.12 - 1.2 * after : 1));
          crown.rotation = Math.sin(t * 120) * .05 * heat;
          crown.x = x + Math.sin(t * 97) * 2.5 * heat;
          crown.tint = tint;
          halo.tint = mix(GOLD, RED, heat); halo.alpha = .45 + .35 * heat; halo.scale.set(size / 128 * (1 + .15 * heat));
          return;
        }
        if (!split) {
          split = true; crown.visible = false;
          for (const half of halves) { half.visible = true; half.tint = tint; half.scale.set(base); }
          ring.tint = RED; ring.alpha = .95;
          spray(sparks, s, x, y, layer.coarse ? 10 : 20, { speed: [140, 340], life: [360, 640], scale: [.22, .4], colors: [RED, RED_HOT, 0xffffff], gravity: 260, drag: 2, keep: true });
          for (let i = 0; i < (layer.coarse ? 6 : 12); i++) {
            const a = rand(-Math.PI, 0), v = rand(120, 260);
            sparks.add(s.shard, s, { x: x + rand(-.15, .15) * size, y: y + rand(-.2, .2) * size, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(520, 820), spin: rand(-9, 9), grow: -.3, scale: rand(.22, .42) * Math.max(.6, size / 90), gravity: 620, drag: .8, tint: i % 3 ? RED : 0xffd27a, blend: 'normal', keep: true });
          }
        }
        // As metades se afastam girando e caem.
        const dt = ms / 1000;
        const gone = (t - SPLIT) / (1 - SPLIT);
        for (const p of pieces) {
          p.vy += 520 * dt;
          p.sprite.x += p.vx * dt; p.sprite.y += p.vy * dt; p.sprite.rotation += p.spin * dt;
          p.sprite.alpha = 1 - gone * gone;
        }
        const k = Math.min(1, (t - SPLIT) / .25);
        ring.alpha = .95 * (1 - k); ring.scale.set(size / 256 * (.8 + 1.8 * easeOut(k)));
        halo.alpha = .8 * (1 - gone);
      };
    }, delay);
  },
  crownFly(layer, s, { from, to, duration, lethal = false, delay = 0 }) {
    return timed(duration, (view, sparks) => {
      const a = layer.local(from.cx, from.cy), b = layer.local(to.cx, to.cy);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      // O arco sobe acima dos dois pontos (na tela pequena, menos).
      const lift = Math.min(layer.coarse ? 70 : 120, dist * .4);
      const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - lift;
      const main = lethal ? RED : GOLD, hot = lethal ? RED_HOT : GOLD_HOT;
      const start = Math.max(34, Math.min(56, from.w * .5)), end = Math.max(16, Math.min(26, to.h * .9));
      const halo = new Sprite({ texture: s.glow, anchor: .5, tint: main, blendMode: 'add', alpha: .7 });
      const crown = new Sprite({ texture: crownTexture(layer, 'whole'), anchor: .5, tint: lethal ? 0xffb0a4 : 0xffffff });
      view.addChild(halo, crown);
      let landed = false;
      return (t, ms) => {
        // Sai devagar, acelera no meio e assenta no fim.
        const u = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const px = (1 - u) ** 2 * a.x + 2 * (1 - u) * u * cx + u * u * b.x;
        const py = (1 - u) ** 2 * a.y + 2 * (1 - u) * u * cy + u * u * b.y;
        const w = start + (end - start) * u;
        crown.position.set(px, py); halo.position.set(px, py);
        crown.scale.set(w / CROWN_W);
        crown.rotation = Math.sin(t * Math.PI * 2) * .25;
        halo.scale.set(w * 1.6 / 128);
        const n = ms > 0 && t < 1 ? (layer.coarse ? 1 : 2) : 0;
        for (let i = 0; i < n; i++) sparks.add(s.spark, s, { x: px + rand(-.3, .3) * w, y: py + rand(-.2, .3) * w, vx: rand(-25, 25), vy: rand(10, 50), life: rand(240, 400), spin: 0, grow: -.6, scale: rand(.14, .26), gravity: 40, drag: 2.4, tint: i % 2 ? main : hot });
        if (t >= 1 && !landed) {
          landed = true; crown.visible = halo.visible = false;
          spray(sparks, s, b.x, b.y, layer.coarse ? 6 : 12, { speed: [60, 170], life: [220, 380], scale: [.18, .3], colors: [main, hot, 0xffffff], drag: 3 });
        }
      };
    }, delay);
  },
};
