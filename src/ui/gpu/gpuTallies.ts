// Os marcadores de jogador que ganham um objeto em 3D ao subir, na camada GPU: o frasco do veneno, o raio da energia, a estrela da experiência e o disco da radiação, que caem girando sobre o selo ao lado do retrato e entram nele; o frasco cai maior com o veneno perto de matar.
import { Sprite, type Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import type { Tally } from '../playerTallies';
import { facing, multiply, rotation } from './diceGeometry';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';
import { solidAllowed, solidPiece } from './gpuSolid';
import { effectsTier } from './gpuSupport';
import { gradient } from './gpuTrinkets';
import { circle, facetedFaces, prism, solidData, TALLY_SHAPES } from './solidShapes';

export interface TallyParams {
  /**
   * Marcador de jogador que subiu: o objeto dele (`kind`) cai girando sobre o selo (`at`), quica, acende e entra nele,
   * depois de `delay` ms. `size` é a largura do retrato, que dá o tamanho do objeto. `level` 1 é o veneno perto do
   * limite (o frasco cai maior, com uma onda em volta) e 2, o veneno que mata (maior ainda).
   */
  tally: { at: Point; kind: Tally; size: number; level?: 0 | 1 | 2; delay?: number };
}

/** As cores de cada objeto (as do selo dele na mesa): o degradê, as faíscas, o brilho e a força do clarão do pouso. */
const LOOK: Record<Tally, { stops: [string, string, string]; spark: number; shine: number; metal: number; flash: number }> = {
  poison: { stops: ['#eafff0', '#b9e8c4', '#5f9a72'], spark: 0x7ee081, shine: .8, metal: .1, flash: .4 },
  energy: { stops: ['#fff6cf', '#ffc74d', '#a8650f'], spark: 0xffc74d, shine: .7, metal: .9, flash: .45 },
  experience: { stops: ['#f4edff', '#c4adff', '#5a3ea8'], spark: 0xc4adff, shine: .7, metal: .7, flash: .45 },
  rad: { stops: ['#f8ff9a', '#e2ec4a', '#7d8412'], spark: 0xe2ec4a, shine: .4, metal: .2, flash: .3 },
};

/** O trifólio da radiação, o mesmo desenho do selo (playerCounters.ts), em 24×24. */
const TREFOIL = 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10.3 8.9 7.2 3.5A9.5 9.5 0 0 0 2.5 11.8h6.2a3.4 3.4 0 0 1 1.6-2.9zm3.4 0a3.4 3.4 0 0 1 1.6 2.9h6.2a9.5 9.5 0 0 0-4.7-8.3zM12 15.4a3.4 3.4 0 0 1-1.7-.4l-3.1 5.4a9.5 9.5 0 0 0 9.6 0L13.7 15a3.4 3.4 0 0 1-1.7.4z';

/**
 * A textura de cada objeto. O frasco é pintado como se vê de frente (a rolha no alto, o vidro e o veneno no bojo); o
 * raio e a estrela levam só o degradê, que as pontas facetadas acendem; o disco da radiação tem o trifólio dos dois
 * lados e a borda escura.
 */
function texture(layer: GpuLayer, kind: Tally): Texture {
  const look = LOOK[kind];
  if (kind === 'rad') return paintOnce(layer, 'tally:rad', 512, 320, g => {
    for (const x of [0, 256]) {
      gradient(g, x, 0, 256, look.stops);
      g.lineWidth = 12; g.strokeStyle = '#2b2f0c'; g.beginPath(); g.arc(x + 128, 128, 120, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(x + 128, 128); g.scale(8.6, 8.6); g.translate(-12, -12);
      g.fillStyle = '#20230a'; g.fill(new Path2D(TREFOIL));
      g.restore();
    }
    g.fillStyle = '#4a4f12'; g.fillRect(0, 256, 512, 64);
  });
  return paintOnce(layer, `tally:${kind}`, 128, 128, g => {
    gradient(g, 0, 0, 128, look.stops);
    if (kind !== 'poison') return;
    // O veneno enche o bojo (do ombro para baixo), mais claro em cima; a rolha fica no alto do gargalo.
    const liquid = g.createLinearGradient(0, 62, 0, 128);
    liquid.addColorStop(0, '#9be05a'); liquid.addColorStop(.12, '#4caf50'); liquid.addColorStop(1, '#12501f');
    g.fillStyle = liquid; g.fillRect(0, 62, 128, 66);
    g.fillStyle = '#d9ffb8'; g.fillRect(0, 60, 128, 3);
    g.fillStyle = 'rgba(255,255,255,.55)'; for (const [bx, by, br] of [[52, 84, 4], [70, 98, 3], [58, 108, 2.5], [78, 80, 2]]) { g.beginPath(); g.arc(bx!, by!, br!, 0, Math.PI * 2); g.fill(); }
    const cork = g.createLinearGradient(0, 0, 0, 18);
    cork.addColorStop(0, '#c9975a'); cork.addColorStop(1, '#7a4f24');
    g.fillStyle = cork; g.fillRect(0, 0, 128, 18);
    // Um fio de luz no vidro, do gargalo até o bojo.
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(50, 20, 4, 96);
  });
}

const shapeData = (kind: Tally) => kind === 'rad' ? () => solidData(prism(circle(32), .26)) : () => solidData(facetedFaces(TALLY_SHAPES[kind]()));

export const TALLY_EFFECTS: { [N in keyof TallyParams]: (layer: GpuLayer, s: Shared, p: TallyParams[N]) => GpuEffect | null } = {
  tally(layer, s, { at, kind, size, level = 0, delay = 0 }) {
    // A energia e os outros sobem muitas vezes: saem já no degrau 1 do automático, como as fichas. O veneno perto de
    // matar é raro e importa: fica até o degrau 2, com os outros objetos.
    if (level ? !solidAllowed() : effectsTier() >= 1) return null;
    const look = LOOK[kind], screen = layer.size();
    const unit = Math.max(12, Math.min(22, size * .22)) * [1, 1.45, 1.9][level]!;
    // Sobre o selo, mas inteiro na tela (os retratos ficam colados nas bordas).
    const local = layer.local(at.cx, at.cy), margin = unit * 1.1;
    const x = Math.max(margin, Math.min(screen.width - margin, local.x)), y = Math.max(margin, Math.min(screen.height - margin, local.y));
    const top = y - unit * 3.4;
    const turns = rand(2.5, 3.5) * Math.PI * 2 * (Math.random() < .5 ? -1 : 1);
    // O frasco gira em volta dele mesmo e é sempre visto um pouco de cima (a rolha aparecendo); os outros, de frente.
    const flask = kind === 'poison', tilt = rotation([1, 0, 0], .3), resting = facing([0, 0, 1], [0, 1, 0], -.3);
    // Perto de matar, o frasco fica um instante a mais sobre o selo antes de entrar.
    const life = 1200 + level * 300, land = .46, enterAt = level ? .76 : .7;
    return timed(life, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: look.spark, blendMode: 'add', alpha: 0 });
      const wave = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: look.spark, blendMode: 'add', alpha: 0 });
      const piece = solidPiece(layer, `tally:${kind}`, shapeData(kind), texture(layer, kind), { shine: look.shine, metal: look.metal });
      view.addChild(wave, glow, piece.mesh);
      let landed = false;
      return t => {
        // Aparece no alto (até .14), cai girando (até `land`), quica, acende e entra no selo (de `enterAt` em diante).
        const fall = Math.min(1, t / land), k = fall * fall;
        const bounce = t >= land && t < land + .12 ? Math.sin((t - land) / .12 * Math.PI) * unit * .45 : 0;
        const enter = Math.max(0, (t - enterAt) / (1 - enterAt));
        const py = top + (y - top) * k - bounce;
        const spin = rotation([0, 1, 0], turns * (1 - easeOut(Math.min(1, t / (land + .12)))));
        const m = flask ? multiply(tilt, spin) : multiply(spin, resting);
        const after = landed ? Math.max(0, 1 - (t - land) / .25) : 0;
        piece.pose(m, x, py, unit * Math.min(1, .3 + t / .14 * .7) * (1 - enter * .8), look.flash * after);
        piece.mesh.alpha = 1 - enter;
        glow.scale.set(unit * (4 + level) / 128); glow.alpha = landed ? (.2 + look.flash * .6 + level * .1) * (1 - enter) : 0;
        const spread = landed && level ? Math.min(1, (t - land) / .4) : 0;
        wave.scale.set(unit * (2 + 5 * easeOut(spread)) / 256); wave.alpha = level && landed ? .8 * (1 - spread) : 0;
        if (!landed && t >= land) {
          landed = true;
          spray(sparks, s, x, y, (layer.coarse ? 5 : 10) * (1 + level), { speed: [unit * 2, unit * (5 + level)], life: [260, 460 + level * 200], scale: [.2, .4], colors: [look.spark, 0xffffff], drag: 3, keep: level > 0 });
          // As faíscas saem por trás do objeto.
          view.addChild(piece.mesh);
        }
      };
    }, delay);
  },
};
