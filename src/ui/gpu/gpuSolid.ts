// Os objetos sólidos em 3D da camada GPU (dados, moeda, medalhões, gemas): a malha convexa, o shader que gira, projeta com perspectiva e ilumina, a peça pronta para animar e o aquecimento do shader com a mesa ociosa.
import { Geometry, GlProgram, Mesh, Shader, type Container, type Texture } from 'pixi.js';
import type { GpuLayer } from './gpuLayer';
import { normalize, type Mat3 } from './diceGeometry';
import type { SolidData } from './solidShapes';
import { effectsTier } from './gpuSupport';

/** Objetos em 3D: sempre, menos do degrau 2 do automático em diante, quando a mesa já está aliviando os efeitos. */
export const solidAllowed = () => effectsTier() < 2;

/** Distância da câmera, em raios da peça: quanto menor, mais forte a perspectiva. */
export const DISTANCE = 5.5;

// A peça gira e é projetada aqui (posição em raios, x para a direita, y para cima, z para quem olha). A face de trás é
// descartada pelo lado em que a câmera está (`vFacing`), sem depender do sentido dos triângulos nem de profundidade: a
// peça é convexa, então as faces da frente nunca se cobrem. O `w` da posição deixa a textura em perspectiva correta.
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

// Luz de cima à esquerda, um pouco de frente: difusa, um brilho (`uShine`, na cor da peça quanto mais `uMetal`) e o
// clarão do pouso (`uGlow`).
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
uniform float uShine;
uniform float uMetal;
out vec4 finalColor;
void main() {
  if (vFacing <= 0.) discard;
  vec3 n = normalize(vNormal);
  vec3 base = texture(uTexture, vUV).rgb;
  float diffuse = max(dot(n, uLight), 0.);
  float spot = pow(max(dot(n, normalize(uLight + normalize(vView))), 0.), mix(36., 18., uMetal)) * uShine;
  vec3 shine = spot * mix(vec3(1.), base * 1.7 + .15, uMetal);
  vec3 color = base * (.46 + .64 * diffuse) + shine + uGlow * .35;
  float alpha = uColor.a * uWorldColorAlpha.a;
  finalColor = vec4(min(color, vec3(1.)) * alpha, alpha);
}`;

let program: GlProgram | null = null;
const LIGHT = normalize([-.45, .6, .66]);

const geometries = new WeakMap<GpuLayer, Map<string, Geometry>>();
/** A malha de uma forma, montada uma vez por camada (`key` diz qual é). */
function geometryOf(layer: GpuLayer, key: string, data: () => SolidData) {
  let cache = geometries.get(layer);
  if (!cache) {
    cache = new Map();
    geometries.set(layer, cache);
    const own = cache;
    layer.onDestroy(() => { for (const g of own.values()) g.destroy(); own.clear(); });
  }
  const found = cache.get(key);
  if (found) return found;
  const d = data();
  const geometry = new Geometry({
    attributes: {
      aVertex: { buffer: new Float32Array(d.position), format: 'float32x3' },
      aNormal: { buffer: new Float32Array(d.normal), format: 'float32x3' },
      aUV: { buffer: new Float32Array(d.uv), format: 'float32x2' },
    },
    indexBuffer: new Uint16Array(d.index),
  });
  cache.set(key, geometry);
  return geometry;
}

/** Matriz por linhas para o `mat3` do GLSL (que lê por colunas). */
function toColumns(m: Mat3, out: Float32Array) {
  out[0] = m[0]; out[1] = m[3]; out[2] = m[6];
  out[3] = m[1]; out[4] = m[4]; out[5] = m[7];
  out[6] = m[2]; out[7] = m[5]; out[8] = m[8];
}

/** Uma peça sólida na tela: `pose` a gira, põe em (x, y) com `unit` pixels por raio e acende o clarão (0 a 1). */
export interface SolidPiece {
  mesh: Mesh<Geometry, Shader>;
  pose(rotation: Mat3, x: number, y: number, unit: number, glow?: number): void;
}

interface SolidLook {
  /** Força do brilho (0 a 1; o dado de marfim usa .4). */
  shine?: number;
  /** 0 para plástico (brilho branco), 1 para metal (brilho na cor da peça). */
  metal?: number;
}

/**
 * Uma peça sólida: a forma `key` (montada com `data` na primeira vez) pintada com `texture`. A malha e o shader são
 * da camada; cada peça tem só os próprios valores (rotação, lugar, clarão).
 */
export function solidPiece(layer: GpuLayer, key: string, data: () => SolidData, texture: Texture, look: SolidLook = {}): SolidPiece {
  program ??= new GlProgram({ vertex: VERTEX, fragment: FRAGMENT, name: 'solid-piece' });
  const rotationColumns = new Float32Array(9), place = new Float32Array(3);
  const shader = new Shader({
    glProgram: program,
    resources: {
      uTexture: texture.source,
      solidUniforms: {
        uRotation: { value: rotationColumns, type: 'mat3x3<f32>' },
        uPlace: { value: place, type: 'vec3<f32>' },
        uDistance: { value: DISTANCE, type: 'f32' },
        uLight: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
        uGlow: { value: 0, type: 'f32' },
        uShine: { value: look.shine ?? .4, type: 'f32' },
        uMetal: { value: look.metal ?? 0, type: 'f32' },
      },
    },
  });
  const uniforms = shader.resources.solidUniforms;
  const mesh = new Mesh({ geometry: geometryOf(layer, key, data), shader });
  mesh.on('destroyed', () => shader.destroy());
  return {
    mesh,
    pose(rotation, x, y, unit, glow = 0) {
      toColumns(rotation, rotationColumns);
      place[0] = x; place[1] = y; place[2] = unit;
      uniforms.uniforms.uGlow = glow;
      uniforms.update();
    },
  };
}

/** Uma placa quadrada, só para o aquecimento. */
const WARM: SolidData = { position: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], normal: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uv: [0, 1, 1, 1, 1, 0, 0, 0], index: [0, 1, 2, 0, 2, 3] };
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/**
 * Põe em `view` uma peça pequena, para o primeiro desenho compilar o shader dos sólidos com a mesa ociosa (antes, o
 * primeiro dado da partida pagava isso na hora de rolar).
 */
export function warmSolid(layer: GpuLayer, view: Container, texture: Texture) {
  const piece = solidPiece(layer, 'warm', () => WARM, texture);
  piece.pose(IDENTITY, 6, 6, 2);
  view.addChild(piece.mesh);
}
