// As fichas que ganham um objeto em 3D ao serem criadas, na camada GPU: a gema do Tesouro, a lente da Pista, a maçã da Comida e a gota do Sangue, que caem girando sobre a carta e entram nela; desligadas já no degrau 1 do automático.
import { Sprite, type Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import type { Trinket } from '../tokenTrinkets';
import { facing, multiply, rotation } from './diceGeometry';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';
import { solidPiece } from './gpuSolid';
import { effectsTier } from './gpuSupport';
import { circle, facetedFaces, prism, solidData, TRINKET_SHAPES } from './solidShapes';

export interface TrinketParams {
  /** Ficha nova: o objeto dela (`kind`) cai girando sobre a carta (`at`), quica, acende e entra nela, depois de `delay` ms. */
  trinket: { at: Point; kind: Trinket; delay?: number };
}

/** As cores de cada objeto: o brilho, o meio e a sombra do degradê, a cor das faíscas e a força do clarão do pouso (menor nas claras). */
const LOOK: Record<Trinket, { stops: [string, string, string]; spark: number; shine: number; metal: number; flash: number }> = {
  treasure: { stops: ['#fff3b0', '#f2b54c', '#8c5a12'], spark: 0xf2b54c, shine: .7, metal: 1, flash: .5 },
  clue: { stops: ['#d8f4ff', '#4fa3c7', '#163e5a'], spark: 0x8fd6ff, shine: .5, metal: .2, flash: .15 },
  food: { stops: ['#ff9a86', '#d8262b', '#6e0d10'], spark: 0xff7a5c, shine: .45, metal: 0, flash: .4 },
  blood: { stops: ['#ff7070', '#a30f1a', '#3a0306'], spark: 0xd8263a, shine: .7, metal: .1, flash: .4 },
};

/** A lupa da Pista, no mesmo arranjo de 24×24 dos ícones. */
const LENS = 'M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z';

/** O degradê do objeto, com a luz no alto à esquerda (as facetas dão o resto). */
function gradient(g: CanvasRenderingContext2D, x: number, y: number, size: number, [hi, mid, low]: [string, string, string]) {
  const fill = g.createRadialGradient(x + size * .35, y + size * .3, size * .05, x + size / 2, y + size / 2, size * .7);
  fill.addColorStop(0, hi); fill.addColorStop(.5, mid); fill.addColorStop(1, low);
  g.fillStyle = fill; g.fillRect(x, y, size, size);
}

/** A textura de cada objeto: o degradê nas formas facetadas; na Pista, a lente com a lupa dos dois lados e a borda. */
function texture(layer: GpuLayer, kind: Trinket): Texture {
  const look = LOOK[kind];
  if (kind !== 'clue') return paintOnce(layer, `trinket:${kind}`, 128, 128, g => {
    gradient(g, 0, 0, 128, look.stops);
    // Na maçã, o cabo e a folha no alto (a tampa de cima fica no meio da faixa de cima da textura).
    if (kind === 'food') {
      g.fillStyle = '#4a2a10'; g.fillRect(61, 6, 5, 12);
      g.fillStyle = '#5fa83a'; g.beginPath(); g.ellipse(76, 12, 10, 4.5, -.4, 0, Math.PI * 2); g.fill();
    }
  });
  return paintOnce(layer, 'trinket:clue', 512, 320, g => {
    for (const x of [0, 256]) {
      gradient(g, x, 0, 256, look.stops);
      g.save(); g.translate(x + 128, 128); g.scale(7, 7); g.translate(-12, -12);
      g.fillStyle = '#eaf8ff'; g.shadowColor = 'rgba(10,40,70,.7)'; g.shadowBlur = 1.2;
      g.fill(new Path2D(LENS), 'evenodd');
      g.restore();
    }
    g.fillStyle = '#a07a3a'; g.fillRect(0, 256, 512, 64);
  });
}

const shapeData = (kind: Trinket) => kind === 'clue' ? () => solidData(prism(circle(32), .3)) : () => solidData(facetedFaces(TRINKET_SHAPES[kind]()));

export const TRINKET_EFFECTS: { [N in keyof TrinketParams]: (layer: GpuLayer, s: Shared, p: TrinketParams[N]) => GpuEffect | null } = {
  trinket(layer, s, { at, kind, delay = 0 }) {
    // Acontecem muitas vezes (fichas em rajada no Commander): saem já no degrau 1 do automático, antes dos outros objetos.
    if (effectsTier() >= 1) return null;
    const { x, y } = layer.local(at.cx, at.cy), look = LOOK[kind];
    const unit = Math.max(14, Math.min(34, at.w * .36)), top = y - at.h * .45 - unit * 2.2;
    const spin = rand(2.5, 3.5) * Math.PI * 2 * (Math.random() < .5 ? -1 : 1);
    // Um pouco de frente e de cima; a lente da Pista, de frente, para a lupa aparecer.
    const resting = kind === 'clue' ? facing([0, 0, 1], [0, 1, 0], -.35) : rotation([1, 0, 0], .35);
    return timed(1150, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: look.spark, blendMode: 'add', alpha: 0 });
      const piece = solidPiece(layer, `trinket:${kind}`, shapeData(kind), texture(layer, kind), { shine: look.shine, metal: look.metal });
      view.addChild(glow, piece.mesh);
      let landed = false;
      return t => {
        // Aparece no alto (até .15), cai girando em volta do eixo vertical (até .5), quica (até .62), acende e entra na carta.
        const fall = Math.min(1, t / .5), k = fall * fall;
        const bounce = t >= .5 && t < .62 ? Math.sin((t - .5) / .12 * Math.PI) * unit * .5 : 0;
        const enter = Math.max(0, (t - .7) / .3);
        const py = top + (y - top) * k - bounce + enter * unit * .3;
        const m = multiply(rotation([0, 1, 0], spin * (1 - easeOut(Math.min(1, t / .62)))), resting);
        const size = unit * Math.min(1, .3 + t / .15 * .7) * (1 - enter * .8);
        piece.pose(m, x, py, size, landed ? look.flash * Math.max(0, 1 - (t - .5) / .25) : 0);
        piece.mesh.alpha = 1 - enter;
        glow.scale.set(unit * 4 / 128); glow.alpha = landed ? (.2 + look.flash * .6) * (1 - enter) : 0;
        if (!landed && t >= .5) {
          landed = true;
          spray(sparks, s, x, y, layer.coarse ? 5 : 10, { speed: [unit * 2, unit * 5], life: [260, 460], scale: [.2, .4], colors: [look.spark, 0xffffff], drag: 3 });
          view.addChild(piece.mesh);
        }
      };
    }, delay);
  },
};
