// A moeda em 3D na camada GPU (e o d2, uma moeda com 1 e 2): um disco com espessura e serrilha, que sobe girando em volta do eixo horizontal, cai, quica e assenta com o resultado virado para quem olha.
import { Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import { facing, multiply, rotation } from './diceGeometry';
import { easeOut, paintOnce, rand, spray, themeColor, timed, type Shared } from './gpuParticles';
import { solidPiece } from './gpuSolid';
import { circle, prism, solidData } from './solidShapes';
import { COIN_HEADS_PATH, COIN_TAILS_PATH } from '../icons';

/** As cores de um lado: brilho, meio, sombra, aro e tinta do texto. */
type CoinPalette = readonly [string, string, string, string, string];
export const COIN_PALETTES = {
  gold: ['#fff6cf', '#f2b54c', '#a8741c', '#7a520f', '#2a1600'],
  silver: ['#ffffff', '#c2c2c2', '#737373', '#444444', '#222222'],
  ivory: ['#ffffff', '#ebe8e1', '#c4beb2', '#8d877b', '#1f1f1f'],
} as const satisfies Record<string, CoinPalette>;

/** Texto centrado, encolhendo a letra até caber na largura. */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, max: number, font: string) {
  let px = size;
  g.font = `800 ${px}px ${font}`;
  while (px > 12 && g.measureText(text).width > max) { px -= 2; g.font = `800 ${px}px ${font}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/**
 * Um lado da moeda num círculo de raio `r` em (cx, cy): disco com relevo, aro, pontinhos e, no meio, o ícone do lado
 * (`icon`, caminho de 24×24) em relevo com o nome pequeno embaixo; sem ícone (o d2), o texto grande.
 */
export function paintCoinFace(g: CanvasRenderingContext2D, palette: CoinPalette, text: string, font: string, cx: number, cy: number, r: number, icon?: string) {
  const [hi, mid, low, rim, ink] = palette, k = r / 128;
  const disc = g.createRadialGradient(cx - 32 * k, cy - 46 * k, 10 * k, cx, cy, r);
  disc.addColorStop(0, hi); disc.addColorStop(.55, mid); disc.addColorStop(1, low);
  g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  // O aro: um anel claro por dentro e a borda escura por fora.
  g.lineWidth = 10 * k; g.strokeStyle = rim; g.beginPath(); g.arc(cx, cy, r - 7 * k, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4 * k; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(cx, cy, r - 22 * k, 0, Math.PI * 2); g.stroke();
  // Os pontinhos do relevo em volta do aro.
  g.fillStyle = 'rgba(255,255,255,.4)';
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 96 * k, cy + Math.sin(a) * 96 * k, 2.2 * k, 0, Math.PI * 2); g.fill(); }
  if (icon) {
    // O ícone em relevo: um filete claro embaixo e à direita, e o desenho na cor da tinta por cima.
    const size = 104 * k, path = new Path2D(icon);
    for (const [dx, dy, color] of [[2.5 * k, 2.5 * k, 'rgba(255,255,255,.45)'], [0, 0, ink]] as const) {
      g.save(); g.translate(cx - size / 2 + dx, cy - size * .62 + dy); g.scale(size / 24, size / 24);
      g.fillStyle = color; g.fill(path); g.restore();
    }
    g.fillStyle = ink;
    fitText(g, text, cx, cy + 62 * k, 24 * k, 120 * k, font);
    return;
  }
  g.fillStyle = ink;
  // Números (o d2) grandes; palavras sem ícone, menores.
  fitText(g, text, cx, cy + 4 * k, (text.length <= 2 ? 104 : 62) * k, 170 * k, font);
}

/** A serrilha da borda, numa faixa de `h` de altura a partir de `y`: passa das cores da frente (em cima) para as do verso. */
function paintReeding(g: CanvasRenderingContext2D, front: CoinPalette, back: CoinPalette, y: number, w: number, h: number) {
  const band = g.createLinearGradient(0, y, 0, y + h);
  band.addColorStop(0, front[2]); band.addColorStop(.3, front[0]); band.addColorStop(.5, front[1]);
  band.addColorStop(.5, back[1]); band.addColorStop(.7, back[0]); band.addColorStop(1, back[2]);
  g.fillStyle = band; g.fillRect(0, y, w, h);
  g.globalAlpha = .4;
  for (let x = 0; x < w; x += 6) { g.fillStyle = front[3]; g.fillRect(x, y, 2, h / 2); g.fillStyle = back[3]; g.fillRect(x, y + h / 2, 2, h / 2); }
  g.globalAlpha = 1;
}

const SEGMENTS = 48, THICKNESS = .14;
/** A forma da moeda: um disco de 48 lados com 14% do raio de espessura. */
const coinData = () => solidData(prism(circle(SEGMENTS), THICKNESS));

interface SolidCoinParams {
  at: { x: number; y: number };
  /** Largura da moeda na tela, em pixels. */
  size: number;
  /** Os dois lados: o texto e as cores de cada um. */
  front: { text: string; palette: CoinPalette; icon?: string };
  back: { text: string; palette: CoinPalette; icon?: string };
  /** Qual lado assenta virado para quem olha. */
  showFront: boolean;
  hold: number;
  font: string;
  /** A cor das faíscas do pouso. */
  sparkColors: number[];
}

/**
 * A moeda sobe girando no ar em volta do eixo horizontal (até .35), cai (até .62), quica uma vez e assenta inclinada,
 * mostrando a espessura, com o resultado para quem olha; some no fim de `hold`. A mesma linha do tempo da moeda chapada.
 */
function solidCoin(layer: GpuLayer, s: Shared, p: SolidCoinParams): GpuEffect {
  const { x, y } = p.at, size = p.size;
  const key = `coin3d:${p.front.text}:${p.front.palette[1]}:${!!p.front.icon}:${p.back.text}:${p.back.palette[1]}:${p.font}`;
  const texture = paintOnce(layer, key, 512, 320, g => {
    paintCoinFace(g, p.front.palette, p.front.text, p.font, 128, 128, 126, p.front.icon);
    paintCoinFace(g, p.back.palette, p.back.text, p.font, 384, 128, 126, p.back.icon);
    paintReeding(g, p.front.palette, p.back.palette, 256, 512, 64);
  });
  // Deitada para trás, como vista de cima, com a espessura aparecendo embaixo; o verso fica de frente depois de meia
  // volta em x.
  const tilt = -.42;
  const resting = p.showFront ? facing([0, 0, 1], [0, 1, 0], tilt) : facing([0, 0, -1], [0, -1, 0], tilt);
  const turns = 5 * Math.PI * 2, wobble = rand(.25, .45) * (Math.random() < .5 ? -1 : 1);
  return timed(p.hold, (view, sparks) => {
    const shadow = new Sprite({ texture: s.glow, anchor: .5, x, y: y + size * .55, tint: 0x000000, alpha: 0 });
    const halo = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: p.sparkColors[0], blendMode: 'add', alpha: 0 });
    const piece = solidPiece(layer, 'coin', coinData, texture, { shine: .3, metal: 1 });
    view.addChild(shadow, halo, piece.mesh);
    let landed = false;
    return t => {
      const up = t < .35 ? easeOut(t / .35) : 0, fall = t >= .35 && t < .62 ? (t - .35) / .27 : 0;
      const height = t < .35 ? -40 + 100 * up : t < .62 ? 60 * (1 - fall * fall) : t < .72 ? 14 * Math.sin((t - .62) / .1 * Math.PI) : 0;
      const spin = Math.min(1, t / .62), left = (1 - spin) ** 2;
      // Gira em volta do eixo x (para a frente) e balança um pouco de lado, e os dois param juntos no resultado.
      const m = multiply(rotation([1, 0, 0], -turns * left), multiply(rotation([0, 1, 0], wobble * Math.sin(spin * Math.PI * 3) * left), resting));
      const grow = t < .35 ? .6 + .5 * up : t < .62 ? 1.1 - .1 * fall : 1;
      const squash = t >= .62 && t < .72 ? 1 + .06 * Math.sin((t - .62) / .1 * Math.PI) : 1;
      const cy = y - height;
      piece.pose(m, x, cy, size * .49 * grow * squash, landed ? Math.max(0, 1 - (t - .62) / .2) * .8 : 0);
      const fade = t > .88 ? 1 - (t - .88) / .12 : Math.min(1, t / .08);
      piece.mesh.alpha = fade;
      shadow.scale.set(size / 128 * (.55 - height / 400), size / 128 * .14); shadow.alpha = .45 * fade * (1 - height / 200);
      halo.scale.set(size * 2.2 / 128); halo.alpha = landed ? .55 * Math.max(0, 1 - (t - .62) / .3) * fade : 0;
      if (!landed && t >= .62) {
        landed = true;
        spray(sparks, s, x, y, layer.coarse ? 12 : 22, { speed: [size * 1.2, size * 3], life: [300, 560], scale: [.25, .5], colors: p.sparkColors, drag: 3 });
        for (let i = 0; i < 8; i++) {
          const side = i % 2 ? 1 : -1;
          sparks.add(s.glow, s, { x: x + side * rand(0, size * .4), y: y + size * .45, vx: side * rand(40, 110), vy: rand(-20, 0), life: rand(360, 520), spin: 0, grow: 1.2, scale: rand(.08, .13), gravity: 0, drag: 3, tint: 0xc9bea8, blend: 'normal', alpha: .35, fadeIn: true });
        }
        // As faíscas saem por trás da moeda: a face fica por cima, legível.
        view.addChild(piece.mesh);
      }
    };
  });
}

/** A moeda de Cara ou Coroa: cara dourada com o rosto de perfil, coroa prateada com a coroa. */
export function headsOrTails(layer: GpuLayer, s: Shared, p: { at: { x: number; y: number }; size: number; heads: boolean; label: string; hold: number; font: string }) {
  const gold = themeColor('--gold', '#f2b54c');
  return solidCoin(layer, s, {
    at: p.at, size: p.size, hold: p.hold, font: p.font, showFront: p.heads,
    front: { text: p.heads ? p.label : 'Cara', palette: COIN_PALETTES.gold, icon: COIN_HEADS_PATH },
    back: { text: p.heads ? 'Coroa' : p.label, palette: COIN_PALETTES.silver, icon: COIN_TAILS_PATH },
    sparkColors: p.heads ? [gold, 0xfff6cf, 0xffffff] : [0xdfe6ee, 0xffffff],
  });
}

/** O d2: uma moeda de marfim com 1 de um lado e 2 do outro. */
export function twoSidedDie(layer: GpuLayer, s: Shared, p: { at: { x: number; y: number }; size: number; result: number; hold: number; font: string }) {
  return solidCoin(layer, s, {
    at: p.at, size: p.size, hold: p.hold, font: p.font, showFront: p.result === 1,
    front: { text: '1', palette: COIN_PALETTES.ivory }, back: { text: '2', palette: COIN_PALETTES.ivory },
    sparkColors: [0xffffff, 0xfff1cf, 0xcdefff],
  });
}
