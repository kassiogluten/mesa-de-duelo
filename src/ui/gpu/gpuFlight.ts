// O voo de uma carta desenhado na camada GPU: a imagem completa como textura, com perspectiva de verdade, sombra que acompanha a altura e brilho de borda na cor da carta.
import { Container, PerspectiveMesh, Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { flightArc } from '../flightPath';
import { colorOf, type Shared } from './gpuParticles';

export interface FlightParams {
  /** A imagem completa da carta (Scryfall ou a arte própria da mesa). */
  url: string;
  from: Point & { rot?: number };
  to: Point;
  /** O tamanho e o lugar da peça no fim do voo (como no voo em CSS). */
  end: Point;
  duration: number;
  delay?: number;
  /** Giro de chegada (a carta no leque da mão). */
  endRot?: number;
  /** Some no último trecho (entrando num monte ou numa carta). */
  fade?: boolean;
  /** Cor do brilho de borda (a da carta, ou a do monte de onde ela vem). */
  edge?: string;
  /** Cor que escurece a carta (anulada, destruída, sacrificada); sem ela, a carta na cor dela. */
  shade?: number;
}

/**
 * As texturas das cartas, por endereço da imagem. Uma carta só voa na GPU com a textura pronta: sem ela (primeira vez,
 * imagem sem CORS), o voo sai em CSS e a textura começa a carregar para a próxima. As da mão e da pilha são pedidas
 * antes (`preload`), em tamanho normal; as do campo, pequenas.
 */
interface Entry { texture?: Texture; failed?: boolean; used: number; busy: number }
const caches = new WeakMap<GpuLayer, Map<string, Entry>>();
// Quantas texturas guardar de cada tamanho: as normais (488×680) pesam dez vezes as pequenas (146×204).
const KEEP_NORMAL = 24, KEEP_SMALL = 96;
const small = (url: string) => url.includes('/normal/') ? url.replace('/normal/', '/small/') : undefined;

function cacheOf(layer: GpuLayer) {
  let cache = caches.get(layer);
  if (!cache) {
    cache = new Map();
    caches.set(layer, cache);
    const own = cache;
    layer.onDestroy(() => { for (const e of own.values()) e.texture?.destroy(true); own.clear(); });
  }
  return cache;
}

/** Carrega a imagem e recorta os cantos arredondados da carta (o JPEG do Scryfall vem com cantos quadrados). */
async function load(layer: GpuLayer, url: string, entry: Entry) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(String(response.status));
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const g = canvas.getContext('2d')!;
  g.beginPath(); g.roundRect(0, 0, bitmap.width, bitmap.height, bitmap.width * .045); g.clip();
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  if (layer.destroyed) return;
  entry.texture = Texture.from(canvas);
  trim(cacheOf(layer));
}
/** Solta as texturas usadas há mais tempo quando passa do limite de cada tamanho (nunca as que estão voando). */
function trim(cache: Map<string, Entry>) {
  for (const smallOnes of [false, true]) {
    const list = [...cache].filter(([url, e]) => e.texture && url.includes('/small/') === smallOnes).sort((a, b) => a[1].used - b[1].used);
    for (let extra = list.length - (smallOnes ? KEEP_SMALL : KEEP_NORMAL), i = 0; extra > 0 && i < list.length; i++) {
      const [url, e] = list[i]!;
      if (e.busy) continue;
      e.texture!.destroy(true); cache.delete(url); extra--;
    }
  }
}

/**
 * Começa a carregar a textura de uma carta que deve voar logo (mão, pilha, campo). A pré-carga para quando o limite
 * daquele tamanho enche (um campo cheio não fica trocando textura); o voo pedido (`force`) carrega sempre.
 */
export function preload(layer: GpuLayer, url: string, force = false) {
  if (!url || layer.destroyed) return;
  const cache = cacheOf(layer);
  if (cache.has(url)) return;
  if (!force) {
    const smallOne = url.includes('/small/'), kept = [...cache.keys()].filter(u => u.includes('/small/') === smallOne).length;
    if (kept >= (smallOne ? KEEP_SMALL : KEEP_NORMAL)) return;
  }
  const entry: Entry = { used: performance.now(), busy: 0 };
  cache.set(url, entry);
  load(layer, url, entry).catch(() => { entry.failed = true; });
}

/** A textura pronta da carta (a normal, ou a pequena se só ela já veio), ou nada. */
function ready(layer: GpuLayer, url: string) {
  const cache = cacheOf(layer);
  const normal = cache.get(url);
  if (normal?.texture) return normal;
  const fallback = small(url), tiny = fallback ? cache.get(fallback) : undefined;
  if (!normal) preload(layer, url, true);
  return tiny?.texture ? tiny : undefined;
}

const DEG = Math.PI / 180, PERSPECTIVE = 900;

/**
 * O voo com os mesmos números do voo em CSS (`flightFrames`): o mesmo arco, o mesmo crescer no meio, a mesma inclinação
 * para o lado e o mesmo deitar ao chegar; a diferença é a perspectiva de verdade (a carta inclina para trás enquanto
 * sobe), a sombra separada da carta e o brilho de borda. Sem a textura pronta, não voa (null): quem pediu voa em CSS.
 */
export function flight(layer: GpuLayer, s: Shared, p: FlightParams): GpuEffect | null {
  const entry = ready(layer, p.url);
  if (!entry?.texture) return null;
  entry.busy++; entry.used = performance.now();
  const { from, to, end } = p;
  const arc = flightArc(from, to), base = layer.local(end.cx, end.cy);
  const s0 = Math.max(.4, Math.min(3, from.w / Math.max(1, end.w)));
  const lean = Math.max(-12, Math.min(12, -(from.cx - to.cx) / 30));
  const edgeColor = colorOf(p.edge, 0xf2b54c);
  const view = new Container();
  // A sombra e o brilho usam o retângulo desfocado de `cardGlow` (100×140 no meio de 200×200), também em perspectiva,
  // para acompanhar a carta inclinada.
  const shadow = new PerspectiveMesh({ texture: s.cardGlow, verticesX: 4, verticesY: 4 });
  const glow = new PerspectiveMesh({ texture: s.cardGlow, verticesX: 4, verticesY: 4 });
  shadow.tint = 0x000000; glow.tint = edgeColor; glow.blendMode = 'add';
  const card = new PerspectiveMesh({ texture: entry.texture, verticesX: 8, verticesY: 8 });
  if (p.shade !== undefined) card.tint = p.shade;
  view.addChild(shadow, glow, card);
  view.visible = false;
  let age = -(p.delay ?? 0), released = false;
  const release = () => { if (!released) { released = true; entry.busy--; } };
  view.on('destroyed', release);
  // Cantos (sem escala), na ordem do PerspectiveMesh: topo à esquerda, topo à direita, base à direita, base à esquerda.
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]] as const;
  const GLOW_X = 2, GLOW_Y = 200 / 140;
  return {
    view,
    update(ms) {
      age += ms;
      if (age < 0) return true;
      const u = Math.min(1, age / p.duration);
      const { x, y, t, high, back } = arc(u);
      const scale = (s0 + (1 - s0) * t) * (1 + .22 * high);
      const rot = ((from.rot ?? 0) * back * back + (p.endRot ?? 0) * t * t + lean * high) * DEG;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const cx = base.x + x, cy = base.y + y;
      /**
       * Põe uma malha nos cantos do retângulo (`sx`×`sy` vezes a carta): inclina para trás (`tilt`, perspectiva de
       * 900 px, como no CSS), cresce, gira e vai para o lugar, deslocada `dy` para baixo.
       */
      const place = (mesh: PerspectiveMesh, sx: number, sy: number, tilt: number, dy = 0) => {
        const xy = corners.flatMap(([kx, ky]) => {
          const lx = kx * end.w * sx, ly = ky * end.h * sy;
          const yy = ly * Math.cos(tilt), z = ly * Math.sin(tilt), f = PERSPECTIVE / (PERSPECTIVE - z);
          const px = lx * f * scale, py = yy * f * scale;
          return [cx + px * cos - py * sin, cy + dy + px * sin + py * cos];
        });
        mesh.setCorners(xy[0]!, xy[1]!, xy[2]!, xy[3]!, xy[4]!, xy[5]!, xy[6]!, xy[7]!);
      };
      const tilt = 18 * high * DEG;
      place(card, 1, 1, tilt);
      // O brilho de borda acende no alto do voo; a sombra fica na mesa (sem inclinar), desce e se espalha quanto mais alta a carta.
      place(glow, GLOW_X * 1.02, GLOW_Y * 1.02, tilt);
      place(shadow, GLOW_X * (.96 + .14 * high), GLOW_Y * (.96 + .12 * high), 0, 6 + 26 * high);
      const alpha = u === 0 ? .9 : p.fade && u > .7 ? 1 - (u - .7) / .3 * .9 : 1;
      card.alpha = alpha;
      glow.alpha = (.12 + .3 * high) * alpha;
      shadow.alpha = (.5 - .22 * high) * alpha;
      view.visible = true;
      if (u < 1) return true;
      release();
      return false;
    },
  };
}
