// O dado em 3D de verdade na camada GPU (d4 a d20, e o d100 como dois d10, dezenas e unidades): a textura com os números pintados nas faces, a malha e a rolagem que para com o resultado virado para quem olha.
import { Sprite, type Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import { cross, dieShape, multiply, normalize, percentileFaces, percentileLabel, restingRotation, rotation, type DieShape, type Vec3 } from './diceGeometry';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';
import { DISTANCE, solidPiece, type SolidPiece } from './gpuSolid';
import type { SolidData } from './solidShapes';

/** O corpo do dado: marfim com números escuros (o de sempre) ou azul com números claros (as dezenas do d100). */
type DieBody = 'ivory' | 'blue';
const BODY: Record<DieBody, { ground: string; light: string; dark: string; ink: string; edge: string }> = {
  ivory: { ground: '#d9d6cf', light: '#ffffff', dark: '#e6e3dc', ink: '#1f1f1f', edge: '70,60,45' },
  blue: { ground: '#1d2f5a', light: '#3f62ad', dark: '#22396e', ink: '#f4f1e8', edge: '10,16,40' },
};
/** Como cada face do dado se escreve: o número (o de sempre), o algarismo das unidades ou as dezenas do d100. */
type DieLabels = 'value' | 'units' | 'tens';
const labelOf = (labels: DieLabels, value: number) => labels === 'value' ? String(value) : percentileLabel(labels, value);

const CELL = 128;
/** Onde cada face fica na textura: a coluna e a linha da célula e a escala (pixels por raio do dado). */
function atlasLayout(shape: DieShape) {
  const columns = Math.ceil(Math.sqrt(shape.faces.length)), rows = Math.ceil(shape.faces.length / columns);
  // A mesma escala para todas as faces: a maior cabe na célula com folga.
  const reach = Math.max(...shape.faces.flatMap(f => f.corners.map(c => Math.hypot(...(c.map((v, i) => v - f.center[i]!) as Vec3)))));
  return { columns, rows, k: (CELL / 2 - 6) / reach };
}
/** Os cantos de uma face no plano dela (x para a direita do número, y para o alto dele), em raios do dado. */
function flat(face: DieShape['faces'][number]) {
  const right = cross(face.up, face.normal);
  return face.corners.map(c => {
    const d: Vec3 = [c[0] - face.center[0], c[1] - face.center[1], c[2] - face.center[2]];
    return [d[0] * right[0] + d[1] * right[1] + d[2] * right[2], d[0] * face.up[0] + d[1] * face.up[1] + d[2] * face.up[2]] as const;
  });
}

/** A textura com todas as faces: o corpo, a borda em relevo e o número em pé no meio de cada uma. */
function dieAtlas(layer: GpuLayer, shape: DieShape, font: string, body: DieBody, labels: DieLabels): Texture {
  const { columns, rows, k } = atlasLayout(shape), c = BODY[body];
  return paintOnce(layer, `die3d:${shape.sides}:${body}:${labels}:${font}`, columns * CELL, rows * CELL, g => {
    g.fillStyle = c.ground; g.fillRect(0, 0, columns * CELL, rows * CELL);
    shape.faces.forEach((face, i) => {
      const cx = (i % columns) * CELL + CELL / 2, cy = Math.floor(i / columns) * CELL + CELL / 2;
      const points = flat(face).map(([x, y]) => [cx + x * k, cy - y * k] as const);
      const path = () => { g.beginPath(); points.forEach(([x, y], j) => j ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
      // A distância do meio até a aresta mais perto: o tamanho do número sai daí.
      const inner = Math.min(...points.map(([x, y], j) => {
        const [x2, y2] = points[(j + 1) % points.length]!;
        return Math.abs((x2 - x) * (y - cy) - (x - cx) * (y2 - y)) / Math.hypot(x2 - x, y2 - y);
      }));
      g.save();
      path(); g.clip();
      const fill = g.createLinearGradient(cx - inner, cy - inner, cx + inner, cy + inner);
      fill.addColorStop(0, c.light); fill.addColorStop(1, c.dark);
      g.fillStyle = fill; g.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
      // Relevo: a aresta um pouco mais escura e um filete claro logo para dentro.
      path(); g.lineWidth = 7; g.strokeStyle = `rgba(${c.edge},.22)`; g.stroke();
      path(); g.lineWidth = 15; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
      path(); g.lineWidth = 3; g.strokeStyle = `rgba(${c.edge},.35)`; g.stroke();
      g.restore();
      const text = labelOf(labels, face.value);
      let px = Math.round(inner * (shape.sides === 6 ? 1.25 : 1.05));
      g.font = `800 ${px}px ${font}`;
      while (px > 10 && g.measureText(text).width > inner * 1.6) { px -= 2; g.font = `800 ${px}px ${font}`; }
      g.fillStyle = c.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, cx, cy + px * .04);
      // 6 e 9 sublinhados, como nos dados de verdade, para não confundir de cabeça para baixo.
      if (shape.sides >= 8 && (text === '6' || text === '9')) {
        const w = g.measureText(text).width;
        g.fillRect(cx - w / 2, cy + px * .48, w, Math.max(2, px * .08));
      }
    });
  });
}

/** A malha do dado: cada face em leque de triângulos, com a normal da face e o lugar dela na textura. */
function dieData(shape: DieShape): SolidData {
  const { columns, rows, k } = atlasLayout(shape);
  const out: SolidData = { position: [], normal: [], uv: [], index: [] };
  shape.faces.forEach((face, i) => {
    const cx = (i % columns) * CELL + CELL / 2, cy = Math.floor(i / columns) * CELL + CELL / 2, first = out.position.length / 3;
    flat(face).forEach(([x, y], j) => {
      out.position.push(...face.corners[j]!); out.normal.push(...face.normal);
      out.uv.push((cx + x * k) / (columns * CELL), (cy - y * k) / (rows * CELL));
    });
    for (let j = 1; j < face.corners.length - 1; j++) out.index.push(first, first + j, first + j + 1);
  });
  return out;
}

/** O dado de `sides` lados pronto para girar (a malha é a mesma para qualquer corpo e números). */
function diePiece(layer: GpuLayer, shape: DieShape, font: string, body: DieBody, labels: DieLabels): SolidPiece {
  return solidPiece(layer, `die:${shape.sides}`, () => dieData(shape), dieAtlas(layer, shape, font, body, labels), { shine: body === 'blue' ? .55 : .4 });
}

interface SolidDieParams {
  at: { x: number; y: number };
  /** Largura do dado na tela, em pixels (no d6 parado de frente, a da face). */
  size: number;
  sides: number;
  result: number;
  hold: number;
  font: string;
  /** De quanto mais à esquerda ele vem rolando (0: rola no lugar). */
  travel: number;
  /** Inclinação final para trás, em radianos (0: a face do resultado bem de frente). */
  tilt: number;
  /** Giro no plano da tela, em radianos no sentido horário (como o `rotate` do CSS): o dado rola e para virado para quem senta daquele lado. */
  turn?: number;
}

/** Um deslocamento (dx, dy) do jeito de quem olha girado `turn` radianos no sentido horário da tela. */
const turned = (turn: number, dx: number, dy: number) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
};

/** Pixels por raio do dado: no d6, a face da frente parada fica com `size` de largura; nos outros, um pouco maior que o dado chapado, para o número caber. */
function unitOf(sides: number, size: number) {
  const front = 1 / Math.sqrt(3), perspective = DISTANCE / (DISTANCE - front);
  return sides === 6 ? size / (2 * front * perspective) : size * (sides === 4 ? .66 : .62);
}

/** Um dado rolando: entra girando em dois eixos e quicando e desacelera até parar na rotação `resting`, com o pouso em .5. */
function roller(piece: SolidPiece, p: { x: number; y: number; size: number; unit: number; travel: number; resting: ReturnType<typeof restingRotation>; turn?: number }) {
  const turn = p.turn ?? 0;
  // O giro na tela é em volta do eixo de quem olha (+z), no sentido contrário ao do CSS (y para cima no 3D); por
  // fora do giro da rolagem, para o dado rolar para a direita de quem senta daquele lado.
  const seat = turn ? rotation([0, 0, 1], -turn) : null;
  // Rola para a direita (o alto vai para a direita: giro em volta de -y), com um pouco de giro de lado e de frente.
  const spinA = normalize([rand(-.3, .3), -1, rand(-.2, .2)]), spinB = normalize([1, rand(-.4, .4), rand(-.3, .3)]);
  const turnsA = (p.travel ? 2.6 : 2.1) * Math.PI * 2 + rand(0, Math.PI), turnsB = rand(.6, 1.2) * Math.PI * (Math.random() < .5 ? -1 : 1);
  return (t: number, glow: number) => {
    const roll = Math.min(1, t / .5), k = easeOut(roll);
    const hop = Math.abs(Math.sin(roll * Math.PI * 2.5)) * p.size * (p.travel ? .55 : .2) * (1 - roll);
    const off = turned(turn, -p.travel * (1 - k), 30 * (p.travel / 130) * (1 - k) - hop);
    const px = p.x + off.x, py = p.y + off.y;
    // Desacelera até parar exatamente na posição de descanso.
    const left = (1 - roll) ** 2.2;
    const spin = multiply(rotation(spinA, turnsA * left), rotation(spinB, turnsB * left));
    const m = seat ? multiply(seat, multiply(spin, p.resting)) : multiply(spin, p.resting);
    const squash = t >= .5 && t < .6 ? 1 + .1 * Math.sin((t - .5) / .1 * Math.PI) : 1;
    piece.pose(m, px, py, p.unit * squash, glow);
    return { px, py, hop };
  };
}

/** Faíscas e poeira do pouso, saindo por trás do dado. */
function landing(s: Shared, sparks: Parameters<typeof spray>[0], x: number, y: number, size: number, count: number, turn = 0) {
  spray(sparks, s, x, y, count, { speed: [size * 1.2, size * 2.8], life: [280, 480], scale: [.22, .45], colors: [0xffffff, 0xfff1cf, 0xcdefff], drag: 3 });
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const at = turned(turn, side * rand(0, size * .4), size * .5), v = turned(turn, side * rand(40, 110), rand(-20, 0));
    sparks.add(s.glow, s, { x: x + at.x, y: y + at.y, vx: v.x, vy: v.y, life: rand(360, 520), spin: 0, grow: 1.2, scale: rand(.08, .13), gravity: 0, drag: 3, tint: 0xc9bea8, blend: 'normal', alpha: .35, fadeIn: true });
  }
}

/**
 * O dado rolando: entra girando em dois eixos e quicando, desacelera, assenta com o resultado para cima (para quem
 * olha) com um clarão e faíscas, e some no fim de `hold`. A mesma linha do tempo do dado chapado (assenta em .5).
 */
export function solidDie(layer: GpuLayer, s: Shared, p: SolidDieParams): GpuEffect | null {
  const shape = dieShape(p.sides);
  if (!shape) return null;
  const { x, y } = p.at, size = p.size, unit = unitOf(p.sides, size), turn = p.turn ?? 0;
  const resting = restingRotation(shape, p.result, p.tilt);
  return timed(p.hold, (view, sparks) => {
    const shadow = new Sprite({ texture: s.glow, anchor: .5, x, y: y + size * .62, tint: 0x000000, alpha: 0, rotation: turn });
    const halo = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add', alpha: 0 });
    const piece = diePiece(layer, shape, p.font, 'ivory', 'value');
    const roll = roller(piece, { x, y, size, unit, travel: p.travel, resting, turn });
    view.addChild(shadow, halo, piece.mesh);
    let landed = false;
    return t => {
      const { px, py, hop } = roll(t, landed ? Math.max(0, 1 - (t - .5) / .18) : 0);
      const fade = t > .88 ? 1 - (t - .88) / .12 : Math.min(1, t / .06);
      piece.mesh.alpha = fade;
      // A sombra fica no chão de quem olha: embaixo do dado, do lado dele.
      const ground = turned(turn, size * .06, size * .62), lift = turned(turn, 0, -hop);
      shadow.position.set(px - lift.x + ground.x, py - lift.y + ground.y);
      shadow.scale.set(size / 128 * (.7 - hop / size * .4), size / 128 * .16); shadow.alpha = .5 * fade;
      if (!landed && t >= .5) {
        landed = true;
        landing(s, sparks, x, y, size, layer.coarse ? 10 : 18, turn);
        // As faíscas saem por trás do dado: as faces ficam por cima, legíveis.
        view.addChild(piece.mesh);
      }
      halo.position.set(x, y); halo.scale.set(size * 2 / 128); halo.alpha = landed ? .4 * Math.max(0, 1 - (t - .5) / .3) * fade : 0;
    };
  });
}

/**
 * O d100: dois d10 rolando juntos, o azul das dezenas (00 a 90) à esquerda e o de marfim das unidades (0 a 9) à
 * direita, como os dados de porcentagem de verdade (00 e 0 dão 100). Mesma linha do tempo do dado de sempre.
 */
export function percentileDice(layer: GpuLayer, s: Shared, p: Omit<SolidDieParams, 'sides'>): GpuEffect | null {
  const shape = dieShape(10);
  if (!shape || !Number.isInteger(p.result) || p.result < 1 || p.result > 100) return null;
  const { tens, units } = percentileFaces(p.result);
  const size = p.size * .82, unit = unitOf(10, size), gap = size * .62;
  const dice = [
    { body: 'blue' as const, labels: 'tens' as const, value: tens, x: p.at.x - gap },
    { body: 'ivory' as const, labels: 'units' as const, value: units, x: p.at.x + gap },
  ];
  return timed(p.hold, (view, sparks) => {
    const shadow = new Sprite({ texture: s.glow, anchor: .5, x: p.at.x, y: p.at.y + size * .62, tint: 0x000000, alpha: 0 });
    const halo = new Sprite({ texture: s.glow, anchor: .5, x: p.at.x, y: p.at.y, tint: 0xffffff, blendMode: 'add', alpha: 0 });
    view.addChild(shadow, halo);
    const rolls = dice.map((d, i) => {
      const piece = diePiece(layer, shape, p.font, d.body, d.labels);
      view.addChild(piece.mesh);
      // O segundo vem um pouco mais de trás, para os dois não rolarem iguais.
      return { piece, roll: roller(piece, { x: d.x, y: p.at.y, size, unit, travel: p.travel * (i ? 1.25 : 1), resting: restingRotation(shape, d.value, p.tilt) }) };
    });
    let landed = false;
    return t => {
      const glow = landed ? Math.max(0, 1 - (t - .5) / .18) : 0;
      const fade = t > .88 ? 1 - (t - .88) / .12 : Math.min(1, t / .06);
      let hop = 0;
      for (const r of rolls) { hop = Math.max(hop, r.roll(t, glow).hop); r.piece.mesh.alpha = fade; }
      shadow.scale.set(size * 2.6 / 128 * (.7 - hop / size * .4), size / 128 * .16); shadow.alpha = .5 * fade;
      if (!landed && t >= .5) {
        landed = true;
        for (const d of dice) landing(s, sparks, d.x, p.at.y, size, layer.coarse ? 6 : 12);
        for (const r of rolls) view.addChild(r.piece.mesh);
      }
      halo.scale.set(size * 3.2 / 128); halo.alpha = landed ? .35 * Math.max(0, 1 - (t - .5) / .3) * fade : 0;
    };
  });
}
