// A forma dos dados em 3D (d4, d6, d8, d10, d12, d20): faces numeradas, a direção de leitura de cada número e a rotação que deixa um número virado para quem olha, sem PixiJS.
export type Vec3 = [number, number, number];
/** Matriz 3×3 por linhas: `apply(m, v)` = m·v. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

interface DieFace {
  /** O número da face. */
  value: number;
  /** Os cantos, em volta da face no sentido anti-horário vistos de fora. */
  corners: Vec3[];
  /** Normal para fora, unitária. */
  normal: Vec3;
  /** Meio da face (média dos cantos). */
  center: Vec3;
  /** Para onde aponta o alto do número, no plano da face, unitário. */
  up: Vec3;
}

export interface DieShape {
  sides: number;
  faces: DieFace[];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

/** Os vértices de cada dado, com o vértice mais longe do meio a 1. */
function vertices(sides: number): Vec3[] | null {
  const phi = (1 + Math.sqrt(5)) / 2;
  const signs = (fn: (a: number, b: number, c: number) => Vec3[]) => [-1, 1].flatMap(a => [-1, 1].flatMap(b => [-1, 1].flatMap(c => fn(a, b, c))));
  switch (sides) {
    case 4: return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case 6: return signs((a, b, c) => [[a, b, c]]);
    case 8: return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 12: return [
      ...signs((a, b, c) => [[a, b, c]]),
      ...[-1, 1].flatMap(a => [-1, 1].flatMap(b => [[0, a / phi, b * phi], [a / phi, b * phi, 0], [a * phi, 0, b / phi]] as Vec3[])),
    ];
    case 20: return [-1, 1].flatMap(a => [-1, 1].flatMap(b => [[0, a, b * phi], [a, b * phi, 0], [a * phi, 0, b]] as Vec3[]));
    case 10: {
      // Trapezoedro pentagonal: dois polos e um anel em zigue-zague; a altura do anel deixa cada pipa plana.
      const c = Math.cos(Math.PI / 5), h = (1 - c) / (1 + c) * 1.25;
      const ring = Array.from({ length: 10 }, (_, k): Vec3 => [Math.cos(k * Math.PI / 5), Math.sin(k * Math.PI / 5), k % 2 ? -h : h]);
      return [[0, 0, 1.25], [0, 0, -1.25], ...ring];
    }
    default: return null;
  }
}

/** As faces de um poliedro convexo: os planos por três vértices com todos os outros do mesmo lado. */
function hull(points: Vec3[]): { corners: Vec3[]; normal: Vec3 }[] {
  const eps = 1e-6, faces: { corners: Vec3[]; normal: Vec3; d: number }[] = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) for (let k = j + 1; k < points.length; k++) {
    const a = points[i]!;
    let normal = cross(sub(points[j]!, a), sub(points[k]!, a));
    if (length(normal) < eps) continue;
    normal = normalize(normal);
    let d = dot(normal, a);
    const side = points.map(p => dot(normal, p) - d);
    if (side.some(s => s > eps) && side.some(s => s < -eps)) continue;
    if (side.some(s => s > eps)) { normal = scale(normal, -1); d = -d; }
    if (faces.some(f => dot(f.normal, normal) > 1 - 1e-6 && Math.abs(f.d - d) < 1e-6)) continue;
    const on = points.filter(p => Math.abs(dot(normal, p) - d) < 1e-6);
    // Em volta do meio, no sentido anti-horário visto de fora (a normal aponta para quem olha).
    const mid = scale(on.reduce(add, [0, 0, 0] as Vec3), 1 / on.length);
    const u = normalize(sub(on[0]!, mid)), v = cross(normal, u);
    on.sort((p, q) => Math.atan2(dot(sub(p, mid), v), dot(sub(p, mid), u)) - Math.atan2(dot(sub(q, mid), v), dot(sub(q, mid), u)));
    faces.push({ corners: on, normal, d });
  }
  return faces;
}

const shapes = new Map<number, DieShape | null>();
/** O dado de `sides` lados, com os números 1 a `sides` (faces opostas somam `sides + 1`, como nos dados de verdade). */
export function dieShape(sides: number): DieShape | null {
  if (shapes.has(sides)) return shapes.get(sides)!;
  const points = vertices(sides);
  if (!points) { shapes.set(sides, null); return null; }
  const radius = Math.max(...points.map(length));
  const raw = hull(points.map(p => scale(p, 1 / radius)));
  // Ordem estável: de cima para baixo e em volta, para os números não dependerem da ordem do cálculo.
  raw.sort((a, b) => b.normal[2] - a.normal[2] || Math.atan2(a.normal[1], a.normal[0]) - Math.atan2(b.normal[1], b.normal[0]));
  const values = new Array<number>(raw.length).fill(0);
  let next = 1;
  raw.forEach((face, i) => {
    if (values[i]) return;
    values[i] = next;
    const opposite = raw.findIndex((f, j) => !values[j] && dot(f.normal, face.normal) < -1 + 1e-6);
    if (opposite >= 0) values[opposite] = raw.length + 1 - next;
    next++;
  });
  const faces = raw.map((f, i): DieFace => {
    const center = scale(f.corners.reduce(add, [0, 0, 0] as Vec3), 1 / f.corners.length);
    // O alto do número: no d6, para o meio de uma aresta; nos outros, para o canto mais longe do meio (no d10, o polo).
    const far = f.corners.reduce((best, c) => length(sub(c, center)) > length(sub(best, center)) + 1e-6 ? c : best, f.corners[0]!);
    const toward = sides === 6 ? scale(add(f.corners[0]!, f.corners[1]!), .5) : far;
    return { value: values[i]!, corners: f.corners, normal: f.normal, center, up: normalize(sub(toward, center)) };
  });
  const shape = { sides, faces };
  shapes.set(sides, shape);
  return shape;
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return out;
}
/** Giro de `angle` em volta do eixo `axis` (unitário), pela regra da mão direita. */
export function rotation(axis: Vec3, angle: number): Mat3 {
  const [x, y, z] = axis, c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/**
 * A rotação que deixa a face `value` virada para quem olha (+z), com o número em pé (+y para cima), inclinada `tilt`
 * radianos para a frente (como visto um pouco de cima: aparecem as faces do alto do dado).
 */
export function restingRotation(shape: DieShape, value: number, tilt = 0): Mat3 {
  const face = shape.faces.find(f => f.value === value) ?? shape.faces[0]!;
  const right = cross(face.up, face.normal);
  const facing: Mat3 = [...right, ...face.up, ...face.normal] as Mat3;
  return tilt ? multiply(rotation([1, 0, 0], tilt), facing) : facing;
}
