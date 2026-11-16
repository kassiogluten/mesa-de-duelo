// O dado em 3D de verdade na camada GPU (d4 a d20): malha com os números pintados nas faces, um shader que gira, projeta com perspectiva e ilumina, e a rolagem que para com o resultado virado para quem olha.
import { Geometry, GlProgram, Mesh, Shader, Sprite, type Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import { cross, dieShape, multiply, normalize, restingRotation, rotation, type DieShape, type Mat3, type Vec3 } from './diceGeometry';
import { easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';

/** Distância da câmera, em raios do dado: quanto menor, mais forte a perspectiva. */
const DISTANCE = 5.5;

// O dado gira e é projetado aqui (posição em raios do dado, x para a direita, y para cima, z para quem olha). A face de
// trás é descartada pelo lado em que a câmera está (`vFacing`), sem depender do sentido dos triângulos nem de
// profundidade: o dado é convexo, então as faces da frente nunca se cobrem. O `w` da posição deixa a textura em
// perspectiva correta.
const VERTEX = `#version 300 es
in vec3 aVertex;
in vec3 aNormal;
in vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform mat3 uRotation;
uniform vec3 uPlace;
uniform float uDistance;
out vec2 vUV;
out vec3 vNormal;
out vec3 vView;
out float vFacing;
void main() {
  vec3 p = uRotation * aVertex;
  vec3 n = uRotation * aNormal;
  vec3 eye = vec3(0., 0., uDistance);
  vFacing = dot(n, eye - p);
  float f = uDistance / (uDistance - p.z);
  vec2 screen = uPlace.xy + vec2(p.x, -p.y) * f * uPlace.z;
  vec2 clip = (uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(screen, 1.)).xy;
  gl_Position = vec4(clip / f, 0., 1. / f);
  vUV = aUV;
  vNormal = n;
  vView = normalize(eye - p);
}`;

// Luz de cima à esquerda, um pouco de frente: difusa, um brilho de verniz e o clarão do pouso (uGlow).
const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vNormal;
in vec3 vView;
in float vFacing;
uniform sampler2D uTexture;
uniform vec4 uColor;
uniform vec4 uWorldColorAlpha;
uniform vec3 uLight;
uniform float uGlow;
out vec4 finalColor;
void main() {
  if (vFacing <= 0.) discard;
  vec3 n = normalize(vNormal);
  vec3 base = texture(uTexture, vUV).rgb;
  float diffuse = max(dot(n, uLight), 0.);
  float shine = pow(max(dot(n, normalize(uLight + normalize(vView))), 0.), 36.) * .4;
  vec3 color = base * (.46 + .64 * diffuse) + shine + uGlow * .35;
  float alpha = uColor.a * uWorldColorAlpha.a;
  finalColor = vec4(min(color, vec3(1.)) * alpha, alpha);
}`;

let program: GlProgram | null = null;
const LIGHT = normalize([-.45, .6, .66]);

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

/** A textura com todas as faces: o corpo marfim, a borda em relevo e o número em pé no meio de cada uma. */
function dieAtlas(layer: GpuLayer, shape: DieShape, font: string): Texture {
  const { columns, rows, k } = atlasLayout(shape);
  return paintOnce(layer, `die3d:${shape.sides}:${font}`, columns * CELL, rows * CELL, g => {
    g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, columns * CELL, rows * CELL);
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
      fill.addColorStop(0, '#ffffff'); fill.addColorStop(1, '#e6e3dc');
      g.fillStyle = fill; g.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
      // Relevo: a aresta um pouco mais escura e um filete claro logo para dentro.
      path(); g.lineWidth = 7; g.strokeStyle = 'rgba(70,60,45,.22)'; g.stroke();
      path(); g.lineWidth = 15; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
      path(); g.lineWidth = 3; g.strokeStyle = 'rgba(70,60,45,.35)'; g.stroke();
      g.restore();
      const text = String(face.value);
      let px = Math.round(inner * (shape.sides === 6 ? 1.25 : 1.05));
      g.font = `800 ${px}px ${font}`;
      while (px > 10 && g.measureText(text).width > inner * 1.6) { px -= 2; g.font = `800 ${px}px ${font}`; }
      g.fillStyle = '#1f1f1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, cx, cy + px * .04);
      // 6 e 9 sublinhados, como nos dados de verdade, para não confundir de cabeça para baixo.
      if (shape.sides >= 8 && (text === '6' || text === '9')) {
        const w = g.measureText(text).width;
        g.fillRect(cx - w / 2, cy + px * .48, w, Math.max(2, px * .08));
      }
    });
  });
}

const geometries = new WeakMap<GpuLayer, Map<number, Geometry>>();
/** A malha do dado: cada face em leque de triângulos, com a normal da face e o lugar dela na textura. */
function dieGeometry(layer: GpuLayer, shape: DieShape) {
  let cache = geometries.get(layer);
  if (!cache) {
    cache = new Map();
    geometries.set(layer, cache);
    const own = cache;
    layer.onDestroy(() => { for (const g of own.values()) g.destroy(); own.clear(); });
  }
  const found = cache.get(shape.sides);
  if (found) return found;
  const { columns, rows, k } = atlasLayout(shape);
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  shape.faces.forEach((face, i) => {
    const cx = (i % columns) * CELL + CELL / 2, cy = Math.floor(i / columns) * CELL + CELL / 2, first = position.length / 3;
    flat(face).forEach(([x, y], j) => {
      position.push(...face.corners[j]!); normal.push(...face.normal);
      uv.push((cx + x * k) / (columns * CELL), (cy - y * k) / (rows * CELL));
    });
    for (let j = 1; j < face.corners.length - 1; j++) index.push(first, first + j, first + j + 1);
  });
  const geometry = new Geometry({
    attributes: {
      aVertex: { buffer: new Float32Array(position), format: 'float32x3' },
      aNormal: { buffer: new Float32Array(normal), format: 'float32x3' },
      aUV: { buffer: new Float32Array(uv), format: 'float32x2' },
    },
    indexBuffer: new Uint16Array(index),
  });
  cache.set(shape.sides, geometry);
  return geometry;
}

/** Matriz por linhas para o `mat3` do GLSL (que lê por colunas). */
function toColumns(m: Mat3, out: Float32Array) {
  out[0] = m[0]; out[1] = m[3]; out[2] = m[6];
  out[3] = m[1]; out[4] = m[4]; out[5] = m[7];
  out[6] = m[2]; out[7] = m[5]; out[8] = m[8];
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
}

/**
 * O dado rolando: entra girando em dois eixos e quicando, desacelera, assenta com o resultado para cima (para quem
 * olha) com um clarão e faíscas, e some no fim de `hold`. A mesma linha do tempo do dado chapado (assenta em .5).
 */
export function solidDie(layer: GpuLayer, s: Shared, p: SolidDieParams): GpuEffect | null {
  const shape = dieShape(p.sides);
  if (!shape) return null;
  const { x, y } = p.at, size = p.size;
  // Pixels por raio do dado: no d6, a face da frente parada fica com `size` de largura; nos outros, um pouco maior
  // que o dado chapado, para o número caber.
  const front = 1 / Math.sqrt(3), perspective = DISTANCE / (DISTANCE - front);
  const unit = p.sides === 6 ? size / (2 * front * perspective) : size * (p.sides === 4 ? .66 : .62);
  const resting = restingRotation(shape, p.result, p.tilt);
  // Rola para a direita (o alto vai para a direita: giro em volta de -y), com um pouco de giro de lado e de frente.
  const spinA = normalize([rand(-.3, .3), -1, rand(-.2, .2)]), spinB = normalize([1, rand(-.4, .4), rand(-.3, .3)]);
  const turnsA = (p.travel ? 2.6 : 2.1) * Math.PI * 2 + rand(0, Math.PI), turnsB = rand(.6, 1.2) * Math.PI * (Math.random() < .5 ? -1 : 1);
  program ??= new GlProgram({ vertex: VERTEX, fragment: FRAGMENT, name: 'solid-die' });
  return timed(p.hold, (view, sparks) => {
    const shadow = new Sprite({ texture: s.glow, anchor: .5, x, y: y + size * .62, tint: 0x000000, alpha: 0 });
    const halo = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add', alpha: 0 });
    const rotationColumns = new Float32Array(9), place = new Float32Array([x, y, unit]);
    const shader = new Shader({
      glProgram: program!,
      resources: {
        uTexture: dieAtlas(layer, shape, p.font).source,
        dieUniforms: {
          uRotation: { value: rotationColumns, type: 'mat3x3<f32>' },
          uPlace: { value: place, type: 'vec3<f32>' },
          uDistance: { value: DISTANCE, type: 'f32' },
          uLight: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
          uGlow: { value: 0, type: 'f32' },
        },
      },
    });
    const uniforms = shader.resources.dieUniforms;
    const mesh = new Mesh({ geometry: dieGeometry(layer, shape), shader });
    mesh.on('destroyed', () => shader.destroy());
    view.addChild(shadow, halo, mesh);
    let landed = false;
    return t => {
      const roll = Math.min(1, t / .5), k = easeOut(roll);
      const hop = Math.abs(Math.sin(roll * Math.PI * 2.5)) * size * (p.travel ? .55 : .2) * (1 - roll);
      const px = x - p.travel * (1 - k), py = y + 30 * (p.travel / 130) * (1 - k) - hop;
      // Desacelera até parar exatamente na posição de descanso.
      const left = (1 - roll) ** 2.2;
      const m = multiply(rotation(spinA, turnsA * left), multiply(rotation(spinB, turnsB * left), resting));
      toColumns(m, rotationColumns);
      const squash = t >= .5 && t < .6 ? 1 + .1 * Math.sin((t - .5) / .1 * Math.PI) : 1;
      place[0] = px; place[1] = py; place[2] = unit * squash;
      const fade = t > .88 ? 1 - (t - .88) / .12 : Math.min(1, t / .06);
      mesh.alpha = fade;
      uniforms.uniforms.uGlow = landed ? Math.max(0, 1 - (t - .5) / .18) : 0;
      uniforms.update();
      shadow.position.set(px + size * .06, y + size * .62);
      shadow.scale.set(size / 128 * (.7 - hop / size * .4), size / 128 * .16); shadow.alpha = .5 * fade;
      if (!landed && t >= .5) {
        landed = true;
        spray(sparks, s, x, y, layer.coarse ? 10 : 18, { speed: [size * 1.2, size * 2.8], life: [280, 480], scale: [.22, .45], colors: [0xffffff, 0xfff1cf, 0xcdefff], drag: 3 });
        for (let i = 0; i < 8; i++) {
          const side = i % 2 ? 1 : -1;
          sparks.add(s.glow, s, { x: x + side * rand(0, size * .4), y: y + size * .5, vx: side * rand(40, 110), vy: rand(-20, 0), life: rand(360, 520), spin: 0, grow: 1.2, scale: rand(.08, .13), gravity: 0, drag: 3, tint: 0xc9bea8, blend: 'normal', alpha: .35, fadeIn: true });
        }
        // As faíscas saem por trás do dado: as faces ficam por cima, legíveis.
        view.addChild(mesh);
      }
      halo.position.set(x, y); halo.scale.set(size * 2 / 128); halo.alpha = landed ? .4 * Math.max(0, 1 - (t - .5) / .3) * fade : 0;
    };
  });
}

