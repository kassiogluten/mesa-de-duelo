// As formas dos objetos sólidos da camada GPU que não são dados (moeda, medalhão, escudo, gemas): faces com cantos, normal e o alto de cada uma, o lugar de cada canto na textura e a malha pronta para a GPU, sem PixiJS.
import { cross, dot, hull, normalize, type Vec3 } from './diceGeometry';

/** Uma face plana do sólido: os cantos em volta dela, a normal para fora, o alto do desenho e o lugar de cada canto na textura (0 a 1). */
export interface SolidFace {
  corners: Vec3[];
  normal: Vec3;
  up: Vec3;
  uv: [number, number][];
}

/** A malha como a GPU recebe: posição e normal (3 por vértice), lugar na textura (2) e os triângulos. */
export interface SolidData {
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
}

/** Contorno de um disco com `n` lados, no sentido anti-horário, com raio 1. */
export function circle(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2), Math.sin(i / n * Math.PI * 2)] as [number, number]);
}

/**
 * Prisma de um contorno convexo (x e y em raios, no sentido anti-horário, dentro do círculo de raio 1) com `depth` de
 * espessura: a frente (+z), o verso (-z) e as laterais. Na textura, a frente fica no quadrado da esquerda, o verso no
 * da direita (os dois com o alto do desenho para cima quando a peça vira em volta do eixo x) e a lateral na faixa de
 * baixo, que ocupa `band` da altura.
 */
export function prism(outline: [number, number][], depth: number, band = .2): SolidFace[] {
  const half = depth / 2, top = 1 - band;
  const front: SolidFace = {
    corners: outline.map(([x, y]) => [x, y, half] as Vec3), normal: [0, 0, 1], up: [0, 1, 0],
    uv: outline.map(([x, y]) => [(x + 1) / 4, (1 - y) / 2 * top]),
  };
  // O verso visto de trás: a ordem anti-horária para quem olha de fora é a inversa, e o alto aponta para -y (a peça
  // vira em volta do eixo x, e o desenho de trás aparece em pé).
  const back: SolidFace = {
    corners: [...outline].reverse().map(([x, y]) => [x, y, -half] as Vec3), normal: [0, 0, -1], up: [0, -1, 0],
    uv: [...outline].reverse().map(([x, y]) => [.5 + (x + 1) / 4, (1 + y) / 2 * top]),
  };
  const perimeter = outline.map((p, i) => Math.hypot(outline[(i + 1) % outline.length]![0] - p[0], outline[(i + 1) % outline.length]![1] - p[1]));
  const total = perimeter.reduce((a, b) => a + b, 0);
  let along = 0;
  const sides = outline.map((p, i): SolidFace => {
    const q = outline[(i + 1) % outline.length]!;
    const u0 = along / total, u1 = (along + perimeter[i]!) / total;
    along += perimeter[i]!;
    return {
      corners: [[p[0], p[1], half], [p[0], p[1], -half], [q[0], q[1], -half], [q[0], q[1], half]],
      normal: normalize([q[1] - p[1], p[0] - q[0], 0]), up: [0, 0, 1],
      uv: [[u0, top], [u0, 1], [u1, 1], [u1, top]],
    };
  });
  return [front, back, ...sides];
}

/**
 * Faces de um sólido convexo qualquer (as fichas), todas pintadas com a mesma textura: cada canto pega o lugar dele
 * olhando a peça de frente (x e y de -1 a 1 viram 0 a 1).
 */
export function facetedFaces(faces: { corners: Vec3[]; normal: Vec3 }[]): SolidFace[] {
  return faces.map(f => {
    const up: Vec3 = Math.abs(dot(f.normal, [0, 1, 0])) > .99 ? [0, 0, 1] : normalize(cross(cross(f.normal, [0, 1, 0]), f.normal));
    return { corners: f.corners, normal: f.normal, up, uv: f.corners.map(c => [(c[0] + 1) / 2, (1 - c[1]) / 2] as [number, number]) };
  });
}

/** Um anel de `n` pontos na altura `y`, com raio `r`, girado `turn` (em frações de um passo). */
const ring = (n: number, y: number, r: number, turn = 0): Vec3[] =>
  Array.from({ length: n }, (_, i) => { const a = (i + turn) / n * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
/**
 * As faces de um sólido de revolução em volta do eixo y, montadas direto (sem casca convexa): o raio em cada altura, de
 * cima para baixo (raio 0 é uma ponta), com `n` lados. Entre dois anéis, trapézios; nos extremos, a tampa ou a ponta.
 */
function revolve(profile: [number, number][], n: number): { corners: Vec3[]; normal: Vec3 }[] {
  const rings = profile.map(([y, r]) => r < 1e-6 ? [[0, y, 0] as Vec3] : ring(n, y, r));
  const at = (k: number, i: number) => rings[k]!.length === 1 ? rings[k]![0]! : rings[k]![i % n]!;
  const faces: { corners: Vec3[]; normal: Vec3 }[] = [];
  const add = (corners: Vec3[]) => {
    // Sem os cantos repetidos (perto de uma ponta, o trapézio vira triângulo).
    const unique = corners.filter((c, i) => corners.findIndex(d => d[0] === c[0] && d[1] === c[1] && d[2] === c[2]) === i);
    if (unique.length < 3) return;
    const mid = unique.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]] as Vec3, [0, 0, 0] as Vec3).map(v => v / unique.length) as Vec3;
    let normal = normalize(cross([unique[1]![0] - unique[0]![0], unique[1]![1] - unique[0]![1], unique[1]![2] - unique[0]![2]], [unique[2]![0] - unique[0]![0], unique[2]![1] - unique[0]![1], unique[2]![2] - unique[0]![2]]));
    // Para fora: o meio do sólido fica no eixo, na altura do meio da face.
    if (dot(normal, [mid[0], 0, mid[2]]) + dot(normal, [0, mid[1] - (profile[0]![0] + profile.at(-1)![0]) / 2, 0]) < 0) normal = [-normal[0], -normal[1], -normal[2]];
    faces.push({ corners: unique, normal });
  };
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) add([at(k, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i)]);
  // As tampas, quando o primeiro ou o último anel não é uma ponta.
  if (rings[0]!.length > 1) add([...rings[0]!]);
  if (rings.at(-1)!.length > 1) add([...rings.at(-1)!].reverse());
  return faces;
}

/** As formas das fichas, todas dentro do círculo de raio 1, de pé (o alto para +y). */
export const TRINKET_SHAPES = {
  /** Tesouro: uma gema lapidada, com a mesa no alto, a cinta larga e a ponta embaixo. */
  treasure: () => hull([...ring(8, .5, .5, .5), ...ring(8, .2, .95), [0, -1, 0]]),
  /** Comida: uma maçã, redonda e um pouco achatada, com o alto reto onde fica o cabo. */
  food: () => revolve([[.78, .24], [.74, .5], [.6, .74], [.32, .92], [-.05, .95], [-.42, .84], [-.68, .6], [-.82, .32], [-.86, .1]], 12),
  /** Sangue: uma gota, um cone do alto até encostar na bola de baixo. */
  blood: () => revolve([[1, 0], [-.18, .53], [-.3, .567], [-.42, .58], [-.57, .56], [-.71, .5], [-.83, .41], [-.92, .29], [-.98, .15], [-1, 0]], 12),
};

/** A malha das faces: cada uma em leque de triângulos, com a normal da face em todos os cantos dela. */
export function solidData(faces: SolidFace[]): SolidData {
  const out: SolidData = { position: [], normal: [], uv: [], index: [] };
  for (const face of faces) {
    const first = out.position.length / 3;
    face.corners.forEach((c, j) => { out.position.push(...c); out.normal.push(...face.normal); out.uv.push(...face.uv[j]!); });
    for (let j = 1; j < face.corners.length - 1; j++) out.index.push(first, first + j, first + j + 1);
  }
  return out;
}
