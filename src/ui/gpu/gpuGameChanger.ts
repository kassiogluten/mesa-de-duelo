// O Game Changer chegando à mesa, na camada GPU: um facho de luz cai sobre a carta com poeira dourada, uma gema lapidada surge grande sob a luz, gira e solta faíscas, fica um instante e voa encolhendo até o selo no canto da carta.
import { Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { multiply, rotation } from './diceGeometry';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';
import { solidAllowed, solidPiece } from './gpuSolid';
import { facetedFaces, solidData, TRINKET_SHAPES } from './solidShapes';
import { gradient } from './gpuTrinkets';

export interface GameChangerParams {
  /**
   * O facho cai sobre a carta (`at`) por `duration` ms; a gema surge um pouco acima do meio dela, gira e, no fim, voa
   * até `to` (o selo no canto da carta; sem ele, some ali mesmo). Do degrau 2 do automático em diante, recusa (sem
   * objetos em 3D): quem pediu faz em CSS.
   */
  gameChanger: { at: Point; to?: Point; duration: number };
}

const GOLD = 0xf2b54c, GOLD_HOT = 0xfff1c4, LIGHT = 0xffe2a0;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** O facho: estreito no alto, largo embaixo, com as bordas esfumadas e mais forte perto do chão. */
function coneTexture(layer: GpuLayer) {
  return paintOnce(layer, 'game-changer-cone', 256, 256, g => {
    const shade = g.createLinearGradient(0, 0, 0, 256);
    shade.addColorStop(0, 'rgba(255,255,255,.05)'); shade.addColorStop(.75, 'rgba(255,255,255,.6)'); shade.addColorStop(1, 'rgba(255,255,255,.85)');
    g.filter = 'blur(6px)';
    g.beginPath(); g.moveTo(98, 0); g.lineTo(158, 0); g.lineTo(248, 250); g.lineTo(8, 250); g.closePath();
    g.fillStyle = shade; g.fill();
  });
}
/** A gema: o dourado do Tesouro, um pouco mais claro, para acender sob a luz. */
function gemTexture(layer: GpuLayer) {
  return paintOnce(layer, 'game-changer-gem', 128, 128, g => gradient(g, 0, 0, 128, ['#fff6d6', '#f6c25a', '#9a5e10']));
}

export const GAME_CHANGER_EFFECTS: { [N in keyof GameChangerParams]: (layer: GpuLayer, s: Shared, p: GameChangerParams[N]) => GpuEffect | null } = {
  gameChanger(layer, s, { at, to, duration }) {
    if (!solidAllowed()) return null;
    const { x, y } = layer.local(at.cx, at.cy), end = to ? layer.local(to.cx, to.cy) : null;
    const unit = Math.max(18, Math.min(46, at.w * .3)), endUnit = to ? Math.max(5, Math.min(to.w, to.h) * .42) : unit;
    // A gema fica um pouco acima do meio da carta, sobre a arte.
    const gx = x, gy = y - at.h * .08;
    // O facho vai do alto da tela até logo abaixo da carta.
    const floor = y + at.h * .55, coneW = Math.max(at.w * 2.6, 120);
    return timed(duration, (view, sparks) => {
      const cone = new Sprite({ texture: coneTexture(layer), anchor: { x: .5, y: 0 }, x, y: 0, tint: LIGHT, blendMode: 'add', alpha: 0 });
      cone.scale.set(coneW / 256, Math.max(1, floor) / 250);
      const pool = new Sprite({ texture: s.glow, anchor: .5, x, y: floor - at.h * .06, tint: LIGHT, blendMode: 'add', alpha: 0 });
      pool.scale.set(coneW * 1.1 / 128, at.h * .5 / 128);
      const glow = new Sprite({ texture: s.glow, anchor: .5, tint: GOLD, blendMode: 'add', alpha: 0 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x: gx, y: gy, tint: GOLD, blendMode: 'add', alpha: 0 });
      const gem = solidPiece(layer, 'game-changer-gem', () => solidData(facetedFaces(TRINKET_SHAPES.treasure())), gemTexture(layer), { shine: .8, metal: 1 });
      view.addChild(cone, pool, ring, glow, gem.mesh);
      // Inclinada para quem olha, para a mesa da gema aparecer.
      const tilt = rotation([1, 0, 0], .32);
      let lit = false, landed = false, dust = 0;
      return (t, ms) => {
        // A luz: acende depressa, pisca uma vez, fica e apaga enquanto a gema voa.
        const light = t < .14 ? easeOut(t / .14) : t < .2 ? .75 + .25 * Math.cos((t - .14) / .06 * Math.PI * 2) : t < .72 ? 1 : 1 - easeOut((t - .72) / .28);
        cone.alpha = .34 * light; pool.alpha = .4 * light;
        // A poeira dourada descendo dentro do facho.
        dust += ms * (layer.coarse ? .018 : .036) * light;
        while (dust >= 1) {
          dust--;
          const k = rand(.05, 1), py = floor * k, half = (coneW / 2) * (.24 + .76 * k);
          sparks.add(s.spark, s, { x: x + rand(-half, half) * .85, y: py, vx: rand(-6, 6), vy: rand(10, 28), life: rand(700, 1300), spin: 0, grow: 0, scale: rand(.12, .26), gravity: 0, drag: 0, tint: rand(0, 1) < .5 ? LIGHT : GOLD, alpha: .8, fadeIn: true });
        }
        // A gema: surge (de .08 a .24) girando, gira até .4, fica girando devagar e voa de .66 até o fim.
        const shown = easeOut(clamp01((t - .08) / .16));
        const spin = easeOut(clamp01((t - .08) / .32)) * Math.PI * 4 + Math.max(0, t - .4) * 2.2;
        const k = end ? easeInOut(clamp01((t - .66) / .34)) : 0;
        const px = gx + ((end?.x ?? gx) - gx) * k;
        const py = gy + ((end?.y ?? gy) - gy) * k - Math.sin(k * Math.PI) * unit * .8;
        const pop = t < .24 ? 1 + .12 * Math.sin(clamp01((t - .08) / .16) * Math.PI) : 1;
        const size = (unit + (endUnit - unit) * k) * (.3 + .7 * shown) * pop;
        const flash = lit ? clamp01(1 - (t - .24) / .2) : 0;
        gem.pose(multiply(tilt, rotation([0, 1, 0], spin)), px, py, size, Math.max(flash * .8, landed ? .6 * clamp01(1 - (t - .97) / .03) : 0));
        // Sem para onde voar, some no fim.
        gem.mesh.alpha = shown * (end ? 1 : 1 - clamp01((t - .85) / .15));
        glow.position.set(px, py); glow.scale.set(size * 5 / 128); glow.alpha = (.28 + .55 * flash) * shown * (1 - k * .7);
        ring.scale.set(unit * 3.6 / 256 * (.4 + (lit ? easeOut(clamp01((t - .24) / .3)) : 0))); ring.alpha = lit ? .8 * clamp01(1 - (t - .24) / .3) : 0;
        if (!lit && t >= .24) {
          lit = true;
          spray(sparks, s, gx, gy, layer.coarse ? 12 : 24, { speed: [unit * 2.5, unit * 6], life: [380, 720], scale: [.25, .5], colors: [GOLD, GOLD_HOT, 0xffffff], drag: 2.6 });
          // As faíscas saem por trás da gema.
          view.addChild(gem.mesh);
        }
        if (k > 0 && k < 1 && Math.random() < .55) {
          sparks.add(s.spark, s, { x: px, y: py, vx: rand(-25, 25), vy: rand(-25, 25), life: rand(220, 360), spin: 0, grow: -.6, scale: rand(.25, .45), gravity: 0, drag: 2, tint: GOLD });
          view.addChild(gem.mesh);
        }
        if (!landed && end && t >= .97) {
          landed = true;
          spray(sparks, s, end.x, end.y, layer.coarse ? 6 : 12, { speed: [endUnit * 4, endUnit * 9], life: [300, 520], scale: [.2, .4], colors: [GOLD_HOT, GOLD, 0xffffff], drag: 2.6 });
        }
      };
    });
  },
};
