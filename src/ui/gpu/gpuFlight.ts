// O voo de uma carta desenhado na camada GPU: a imagem completa (ou o verso, na cor da capa) como textura, com perspectiva de verdade, virada no ar, sombra que acompanha a altura e brilho de borda.
import { Container, PerspectiveMesh, Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { flightArc } from '../flightPath';
import { colorOf, type Shared } from './gpuParticles';

export interface FlightParams {
  /** A imagem completa da carta (Scryfall ou a arte própria da mesa). Sem ela, `back` diz a capa do verso. */
  url?: string;
  /** Carta de costas (compra, mão inicial, busca): as cinco cores da capa (`--sleeve-light` … `--sleeve-edge`). */
  back?: readonly string[];
  /** De costas, vira no ar e chega mostrando esta face (a sua compra). Só vira se a textura dela já estiver pronta. */
  flipTo?: string;
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

/** As cores da capa padrão (as do `.back` sem `sleeve-N`), na ordem de `SLEEVE_VARS`. */
const DEFAULT_SLEEVE = ['#e3b363', '#8c5523', '#6b3d18', '#2b170a', '#1d1209'] as const;

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

// Os versos pintados, por capa (as cinco cores): poucos por partida, ficam até a camada sair.
const backs = new WeakMap<GpuLayer, Map<string, Texture>>();
/**
 * O verso na cor da capa, no desenho do `.back` (o medalhão claro no meio de um fundo que escurece para a borda), com
 * um brilho em diagonal e um fio claro na borda de dentro, para ler como uma carta de verdade quando ela gira.
 */
function backTexture(layer: GpuLayer, colors: readonly string[]) {
  let cache = backs.get(layer);
  if (!cache) {
    cache = new Map();
    backs.set(layer, cache);
    const own = cache;
    layer.onDestroy(() => { for (const t of own.values()) t.destroy(true); own.clear(); });
  }
  const [light, mid, base, dark, edge] = DEFAULT_SLEEVE.map((fallback, i) => colors[i] || fallback) as [string, string, string, string, string];
  const key = [light, mid, base, dark, edge].join(',');
  const kept = cache.get(key);
  if (kept) return kept;
  const W = 244, H = 340, inner = 5, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.beginPath(); g.roundRect(0, 0, W, H, W * .048); g.clip();
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath(); g.roundRect(inner, inner, W - inner * 2, H - inner * 2, W * .04); g.clip();
  const field = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * .62);
  field.addColorStop(0, base); field.addColorStop(.75, dark); field.addColorStop(1, dark);
  g.fillStyle = field; g.fillRect(0, 0, W, H);
  // O medalhão: elipse clara com um anel na cor do meio.
  g.save();
  g.translate(W / 2, H / 2); g.scale(1, (H * .26) / (W * .34));
  const medal = g.createRadialGradient(0, 0, 0, 0, 0, W * .34);
  medal.addColorStop(0, light); medal.addColorStop(.3, light); medal.addColorStop(.31, mid); medal.addColorStop(.55, mid); medal.addColorStop(.56, 'rgba(0,0,0,0)');
  g.fillStyle = medal; g.beginPath(); g.arc(0, 0, W * .34, 0, Math.PI * 2); g.fill();
  g.restore();
  // Brilho em diagonal, do canto de cima, e a borda de baixo um pouco mais escura.
  const sheen = g.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, 'rgba(255,255,255,.16)'); sheen.addColorStop(.35, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = sheen; g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(inner + .75, inner + .75, W - inner * 2 - 1.5, H - inner * 2 - 1.5, W * .04); g.stroke();
  const texture = Texture.from(canvas);
  cache.set(key, texture);
  return texture;
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
/** Se a textura de uma carta já está pronta (para decidir antes do voo se ela vira no ar); sem ela, começa a carregar. */
export function textureReady(layer: GpuLayer, url: string) {
  return !!ready(layer, url)?.texture;
}

const DEG = Math.PI / 180, PERSPECTIVE = 900;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
// Onde a carta de costas vira no ar (fração do voo): começa no alto do arco e termina antes de chegar.
const FLIP_FROM = .4, FLIP_TO = .85;

/**
 * O voo com os mesmos números do voo em CSS (`flightFrames`): o mesmo arco, o mesmo crescer no meio, a mesma inclinação
 * para o lado e o mesmo deitar ao chegar; a diferença é a perspectiva de verdade (a carta inclina para trás enquanto
 * sobe), a sombra separada da carta e o brilho de borda. De costas (`back`), o verso é pintado na cor da capa e, com a
 * face de `flipTo` pronta, a carta gira de lado no ar e chega de face para cima. Sem textura, não voa (null): quem
 * pediu voa em CSS.
 */
export function flight(layer: GpuLayer, s: Shared, p: FlightParams): GpuEffect | null {
  const entry = p.url ? ready(layer, p.url) : undefined;
  const back = p.back ? backTexture(layer, p.back) : undefined;
  if (!entry?.texture && !back) return null;
  const face = back && p.flipTo ? ready(layer, p.flipTo) : undefined;
  const held = [entry, face].filter((e): e is Entry => !!e?.texture);
  for (const e of held) { e.busy++; e.used = performance.now(); }
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
  const card = new PerspectiveMesh({ texture: entry?.texture ?? back!, verticesX: 8, verticesY: 8 });
  if (p.shade !== undefined) card.tint = p.shade;
  view.addChild(shadow, glow, card);
  view.visible = false;
  let age = -(p.delay ?? 0), released = false;
  const release = () => { if (!released) { released = true; for (const e of held) e.busy--; } };
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
      const { x, y, t, high, back: home } = arc(u);
      const scale = (s0 + (1 - s0) * t) * (1 + .22 * high);
      const rot = ((from.rot ?? 0) * home * home + (p.endRot ?? 0) * t * t + lean * high) * DEG;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const cx = base.x + x, cy = base.y + y;
      // A virada (de costas, com a face pronta): gira em volta do eixo vertical; passada a metade, mostra a face.
      const turn = face?.texture ? Math.PI * smooth((u - FLIP_FROM) / (FLIP_TO - FLIP_FROM)) : 0;
      if (face?.texture && turn > Math.PI / 2 && card.texture !== face.texture) card.texture = face.texture;
      const yaw = turn > Math.PI / 2 ? turn - Math.PI : turn;
      /**
       * Põe uma malha nos cantos do retângulo (`sx`×`sy` vezes a carta): gira de lado (`spin`), inclina para trás
       * (`tilt`, perspectiva de 900 px, como no CSS), cresce, gira no plano e vai para o lugar, deslocada `dy` para baixo.
       */
      const place = (mesh: PerspectiveMesh, sx: number, sy: number, tilt: number, dy = 0, spin = 0) => {
        const xy = corners.flatMap(([kx, ky]) => {
          const ox = kx * end.w * sx, ly = ky * end.h * sy;
          // De lado, a carta nunca vira uma linha (a malha não aceita um quadrilátero sem área).
          const lx = ox * Math.max(.03, Math.cos(spin)), zx = ox * Math.sin(spin);
          const yy = ly * Math.cos(tilt), z = ly * Math.sin(tilt) + zx, f = PERSPECTIVE / (PERSPECTIVE - z);
          const px = lx * f * scale, py = yy * f * scale;
          return [cx + px * cos - py * sin, cy + dy + px * sin + py * cos];
        });
        mesh.setCorners(xy[0]!, xy[1]!, xy[2]!, xy[3]!, xy[4]!, xy[5]!, xy[6]!, xy[7]!);
      };
      const tilt = 18 * high * DEG;
      place(card, 1, 1, tilt, 0, yaw);
      // O brilho de borda acende no alto do voo; a sombra fica na mesa (sem inclinar), desce e se espalha quanto mais alta a carta.
      place(glow, GLOW_X * 1.02, GLOW_Y * 1.02, tilt, 0, yaw);
      place(shadow, GLOW_X * (.96 + .14 * high) * Math.max(.3, Math.abs(Math.cos(yaw))), GLOW_Y * (.96 + .12 * high), 0, 6 + 26 * high);
      const alpha = u === 0 ? .9 : p.fade && u > .7 ? 1 - (u - .7) / .3 * .9 : 1;
      card.alpha = alpha;
      // Virando, o brilho de borda acende um pouco mais (a luz pegando na carta de lado).
      glow.alpha = (.12 + .3 * high + .25 * Math.abs(Math.sin(turn))) * alpha;
      shadow.alpha = (.5 - .22 * high) * alpha;
      view.visible = true;
      if (u < 1) return true;
      release();
      return false;
    },
  };
}
