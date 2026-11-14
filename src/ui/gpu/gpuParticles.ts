// As peças comuns dos efeitos da camada GPU: partículas com física simples, efeitos com duração, borrifo de faíscas e as cores do tema.
import { Color, Container, Sprite, Texture } from 'pixi.js';
import type { GpuEffect } from './gpuLayer';

/** As texturas da mesa (criadas uma vez em `prepare`) e o teto de partículas do aparelho. */
export interface Shared { spark: Texture; glow: Texture; ring: Texture; shard: Texture; max: number }

// Teto de faíscas vivas na camada (no celular, metade): um combate grande não vira uma nuvem que derruba os quadros.
export const MAX_PARTICLES = 400;
let liveParticles = 0;

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A cor de uma variável do tema (`--red`, `--gold`), lida na hora; o que o PixiJS não entende vira a reserva. */
export function themeColor(name: string, fallback: string) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new Color(value || fallback).toNumber();
  } catch { return new Color(fallback).toNumber(); }
}
/** Uma cor de CSS (`#6fb8ff`) como número, ou a reserva. */
export function colorOf(value: string | undefined, fallback: number) {
  try { return value ? new Color(value).toNumber() : fallback; } catch { return fallback; }
}

interface Particle {
  sprite: Sprite; vx: number; vy: number; life: number; age: number; spin: number; grow: number; scale: number; gravity: number; drag: number;
  /** Alongada na direção em que anda (rastro de velocidade): altura = largura × stretch. */
  stretch: number;
  /** Opacidade máxima (fumaça e poeira ficam translúcidas). */
  alpha: number;
  /** Aparece aos poucos no começo da vida (fumaça), em vez de nascer inteira. */
  fadeIn: boolean;
}
type ParticleSpec = Omit<Particle, 'sprite' | 'age' | 'stretch' | 'alpha' | 'fadeIn'> & {
  x: number; y: number; tint: number; blend?: 'add' | 'normal'; stretch?: number; alpha?: number; fadeIn?: boolean;
};
type Particles = ReturnType<typeof particles>;

/** Um grupo de partículas que andam sozinhas (velocidade, arrasto, gravidade, giro) e somem no fim da vida. */
function particles(view: Container) {
  const list: Particle[] = [];
  return {
    list,
    add(texture: Texture, s: Shared, p: ParticleSpec) {
      if (liveParticles >= s.max) return;
      const stretch = p.stretch ?? 1;
      const sprite = new Sprite({ texture, anchor: .5, x: p.x, y: p.y, tint: p.tint, blendMode: p.blend ?? 'add' });
      sprite.scale.set(p.scale, p.scale * stretch);
      // A alongada aponta para onde anda.
      if (stretch !== 1) sprite.rotation = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      sprite.alpha = p.fadeIn ? 0 : p.alpha ?? 1;
      view.addChild(sprite); liveParticles++;
      list.push({ ...p, stretch, alpha: p.alpha ?? 1, fadeIn: !!p.fadeIn, sprite, age: 0 });
    },
    update(ms: number) {
      const dt = ms / 1000;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!;
        p.age += ms;
        if (p.age >= p.life) { p.sprite.destroy(); list.splice(i, 1); liveParticles--; continue; }
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.gravity * dt;
        p.sprite.x += p.vx * dt; p.sprite.y += p.vy * dt;
        p.sprite.rotation += p.spin * dt;
        const t = p.age / p.life;
        p.sprite.alpha = p.alpha * (p.fadeIn && t < .2 ? t / .2 : t < .6 ? 1 : 1 - (t - .6) / .4);
        const size = p.scale * (1 + p.grow * t);
        p.sprite.scale.set(size, size * p.stretch);
      }
      return list.length > 0;
    },
    /** Sobra de partículas de um efeito desfeito antes do fim (a limpeza da mesa). */
    drop() { liveParticles -= list.length; list.length = 0; },
  };
}

/**
 * Efeito que dura `life` ms depois de esperar `delay` ms, com o desenho de cada quadro em `draw(t, ms)` (t de 0 a 1) e
 * partículas soltas, que podem passar do fim.
 */
export function timed(life: number, build: (view: Container, sparks: Particles) => (t: number, ms: number) => void, delay = 0): GpuEffect {
  const view = new Container();
  const sparks = particles(view);
  const draw = build(view, sparks);
  let age = -delay;
  view.on('destroyed', () => sparks.drop());
  return {
    view,
    update(ms) {
      age += ms;
      if (age >= 0) draw(Math.min(1, age / life), ms);
      const more = sparks.update(ms);
      return age < life || more;
    },
  };
}

/** Faíscas saindo de um ponto em todas as direções. */
export function spray(sparks: Particles, s: Shared, x: number, y: number, n: number, o: { speed: [number, number]; life: [number, number]; scale: [number, number]; colors: number[]; gravity?: number; drag?: number }) {
  for (let i = 0; i < n; i++) {
    const angle = rand(0, Math.PI * 2), speed = rand(...o.speed);
    sparks.add(s.spark, s, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(...o.life), spin: 0, grow: -.6, scale: rand(...o.scale), gravity: o.gravity ?? 0, drag: o.drag ?? 2.2, tint: o.colors[i % o.colors.length] ?? 0xffffff });
  }
}
