// Os efeitos desenhados na camada GPU (faíscas do dano, projétil com rastro, onda do pouso, estilhaços, onda do ultimate, e os de movimento de gpuMoves.ts), com as cores do tema.
import { Color, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { easeOut, MAX_PARTICLES, rand, spray, themeColor, timed, type Shared } from './gpuParticles';
import { MOVE_EFFECTS, type MoveParams } from './gpuMoves';

/** O tom do golpe, o mesmo de `damageLook` (dano, murchar, veneno, lealdade, escudo). */
type GpuTone = 'damage' | 'wither' | 'poison' | 'loyalty' | 'shield';
interface DamageParams {
  /** Impacto do dano: clarão, anel e faíscas na cor do tom. `size` é o diâmetro do clarão em CSS px. */
  burst: { at: Point; tone: GpuTone; size: number; heavy?: boolean; lethal?: boolean };
  /** Projétil da fonte até o alvo em `duration` ms, deixando um rastro de brasas. */
  bolt: { from: Point; to: Point; tone: GpuTone; duration: number };
  /** Onda dourada do pouso, em volta de uma carta ou de um monte, com poeira saindo da base. */
  ripple: { at: Point };
  /** Destruída: clarão e estilhaços com gravidade e giro. */
  shatter: { at: Point };
  /** Ultimate do planeswalker: onda de luz na cor dele atravessando a mesa. `reach` é o diâmetro final. */
  shockwave: { at: Point; color: string; reach: number };
}
export type GpuEffectParams = DamageParams & MoveParams;
export type GpuEffectName = keyof GpuEffectParams;

const shared = new WeakMap<GpuLayer, Shared>();

/** Uma textura desenhada num canvas 2D (só na criação da camada). */
function painted(size: number, paint: (g: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d')!, size);
  return Texture.from(canvas);
}
function radial(g: CanvasRenderingContext2D, size: number, stops: [number, string][]) {
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  g.fillStyle = gradient; g.fillRect(0, 0, size, size);
}

/** As texturas da camada, criadas uma vez por mesa. */
export function prepare(layer: GpuLayer) {
  shared.set(layer, {
    spark: painted(32, (g, s) => radial(g, s, [[0, '#fff'], [.25, 'rgba(255,255,255,.9)'], [.6, 'rgba(255,255,255,.25)'], [1, 'rgba(255,255,255,0)']])),
    glow: painted(128, (g, s) => radial(g, s, [[0, 'rgba(255,255,255,1)'], [.18, 'rgba(255,255,255,.75)'], [.5, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']])),
    ring: painted(256, (g, s) => radial(g, s, [[0, 'rgba(255,255,255,0)'], [.72, 'rgba(255,255,255,0)'], [.86, 'rgba(255,255,255,.95)'], [.92, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']])),
    shard: painted(32, g => {
      const fill = g.createLinearGradient(0, 0, 32, 32);
      fill.addColorStop(0, '#fff'); fill.addColorStop(1, '#9a9a9a');
      g.fillStyle = fill; g.beginPath(); g.moveTo(16, 1); g.lineTo(31, 22); g.lineTo(6, 31); g.closePath(); g.fill();
    }),
    max: layer.coarse ? MAX_PARTICLES / 2 : MAX_PARTICLES,
  });
  warmUp(layer);
}

/**
 * Desenha uma vez, quase invisível, cada tipo de peça que os efeitos usam (sprites somados e normais, contorno): o
 * primeiro desenho monta os shaders e sobe as texturas, e isso acontece aqui, com a mesa ociosa, e não no meio do
 * primeiro golpe.
 */
function warmUp(layer: GpuLayer) {
  const s = shared.get(layer)!;
  const view = new Container({ alpha: .004 });
  for (const texture of [s.spark, s.glow, s.ring, s.shard]) {
    view.addChild(new Sprite({ texture, x: 4, y: 4, blendMode: 'add' }), new Sprite({ texture, x: 4, y: 4 }));
  }
  view.addChild(new Graphics().roundRect(0, 0, 20, 28, 4).stroke({ width: 2, color: 0xffffff }));
  layer.app.stage.addChild(view);
  layer.app.render();
  view.destroy({ children: true });
  layer.app.render();
}

const toneColors = (tone: GpuTone): { main: number; hot: number } =>
  tone === 'wither' || tone === 'poison' ? { main: 0x9b6bff, hot: 0xc9a6ff }
    : tone === 'loyalty' ? { main: 0xff9a55, hot: 0xffd2a8 }
      : tone === 'shield' ? { main: 0x9fe3ff, hot: 0xe6f8ff }
        : { main: themeColor('--red', '#ec5a3f'), hot: 0xffc46b };

/** Curva cúbica de Bézier como a do CSS (`cubic-bezier(x1, y1, x2, y2)`), para o projétil chegar na hora do impacto em CSS. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  return (x: number) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
    return at(y1, y2, t);
  };
}
const BOLT_EASE = bezier(.45, 0, .85, .55);
const DAMAGE_EFFECTS: { [N in keyof DamageParams]: (layer: GpuLayer, s: Shared, p: DamageParams[N]) => GpuEffect } = {
  burst(layer, s, { at, tone, size, heavy, lethal }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const { main, hot } = toneColors(tone);
    const shield = tone === 'shield';
    return timed(540, (view, sparks) => {
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: hot, blendMode: 'add' });
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: main, blendMode: 'add' });
      const core = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add' });
      view.addChild(flash, ring, core);
      const reach = size / 2;
      const n = shield ? 10 : (heavy ? 34 : 22) + (lethal ? 12 : 0);
      spray(sparks, s, x, y, n, shield
        ? { speed: [reach * 1.6, reach * 2.6], life: [260, 420], scale: [.35, .6], colors: [main, hot], drag: 4 }
        : { speed: [reach * 2.2, reach * 5.5], life: [320, 560], scale: [.3, .7], colors: [hot, main, main, 0xffffff], gravity: 260, drag: 2.6 });
      return t => {
        const out = easeOut(Math.min(1, t / .55));
        flash.scale.set(size / 128 * (.4 + 1.1 * out)); flash.alpha = .95 * (1 - out);
        core.scale.set(size / 128 * (.5 + .3 * out) * (lethal ? 1.6 : 1)); core.alpha = Math.max(0, 1 - t / .3);
        ring.scale.set(size / 256 * (.3 + 1.25 * easeOut(t))); ring.alpha = .9 * (1 - t);
      };
    });
  },
  bolt(layer, s, { from, to, tone, duration }) {
    const a = layer.local(from.cx, from.cy), b = layer.local(to.cx, to.cy);
    const { main, hot } = toneColors(tone);
    let last = a;
    return timed(duration, (view, sparks) => {
      const halo = new Sprite({ texture: s.glow, anchor: .5, x: a.x, y: a.y, tint: main, blendMode: 'add', scale: .42 });
      const head = new Sprite({ texture: s.spark, anchor: .5, x: a.x, y: a.y, tint: 0xffffff, blendMode: 'add', scale: .9 });
      view.addChild(halo, head);
      return (t, ms) => {
        if (t >= 1) { halo.visible = head.visible = false; return; }
        const k = BOLT_EASE(t);
        const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
        head.position.set(x, y); halo.position.set(x, y);
        const pulse = .9 + .2 * Math.sin(t * 40);
        halo.scale.set(.42 * pulse * (.7 + .5 * t)); head.scale.set(.9 * pulse);
        // O rastro: brasas soltas ao longo do trecho percorrido neste quadro, mais densas quanto mais rápido.
        const step = Math.hypot(x - last.x, y - last.y), count = Math.min(6, 1 + Math.floor(step / 7)) * (ms > 0 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const u = (i + Math.random()) / count;
          sparks.add(s.spark, s, { x: last.x + (x - last.x) * u, y: last.y + (y - last.y) * u, vx: rand(-30, 30), vy: rand(-30, 30), life: rand(180, 320), spin: 0, grow: -.7, scale: rand(.35, .7), gravity: 40, drag: 3, tint: i % 3 ? main : hot });
        }
        last = { x, y };
      };
    });
  },
  ripple(layer, s, { at }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const gold = themeColor('--gold', '#f2b54c');
    const w = at.w * 1.04, h = at.h * 1.04;
    return timed(470, (view, sparks) => {
      const ring = new Graphics()
        .roundRect(-w / 2, -h / 2, w, h, 9).stroke({ width: 9, color: gold, alpha: .18 })
        .roundRect(-w / 2, -h / 2, w, h, 8).stroke({ width: 4, color: gold, alpha: .35 })
        .roundRect(-w / 2, -h / 2, w, h, 8).stroke({ width: 2, color: 0xfff1cf, alpha: .95 });
      ring.position.set(x, y); ring.blendMode = 'add';
      view.addChild(ring);
      // Poeira dourada saindo da base da carta para os lados, rente à mesa.
      for (let i = 0; i < 12; i++) {
        const side = i % 2 ? 1 : -1;
        sparks.add(s.spark, s, { x: x + side * rand(0, w * .45), y: y + h / 2 - rand(0, 6), vx: side * rand(40, 150), vy: rand(-60, -10), life: rand(300, 460), spin: 0, grow: -.4, scale: rand(.25, .5), gravity: 120, drag: 3, tint: i % 3 ? gold : 0xfff1cf });
      }
      return t => {
        const k = easeOut(t);
        ring.scale.set(.92 + .38 * k); ring.alpha = .85 * (1 - t);
      };
    });
  },
  shatter(layer, s, { at }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const light = 0xe9e2d0, dark = 0x8c7e66;
    return timed(380, (view, sparks) => {
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffd7a0, blendMode: 'add' });
      view.addChild(flash);
      const n = layer.coarse ? 10 : 16;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + rand(-.25, .25), speed = rand(120, 300);
        sparks.add(s.shard, s, {
          x: x + Math.cos(angle) * at.w * rand(.05, .3), y: y + Math.sin(angle) * at.h * rand(.05, .3),
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - rand(80, 200), life: rand(480, 680), spin: rand(-14, 14), grow: -.3,
          scale: rand(.28, .62), gravity: 900, drag: 1.2, tint: i % 2 ? light : dark, blend: 'normal',
        });
      }
      spray(sparks, s, x, y, 10, { speed: [80, 220], life: [200, 360], scale: [.25, .45], colors: [0xffd7a0, 0xffffff], drag: 3 });
      return t => { flash.scale.set(Math.max(at.w, at.h) * 1.4 / 128 * (.9 + .4 * t)); flash.alpha = .9 * (1 - t); };
    });
  },
  shockwave(layer, s, { at, color, reach }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const tint = (() => { try { return new Color(color).toNumber(); } catch { return themeColor('--gold', '#f2b54c'); } })();
    return timed(1100, (view, sparks) => {
      const wave = new Sprite({ texture: s.ring, anchor: .5, x, y, tint, blendMode: 'add' });
      const echo = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add' });
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint, blendMode: 'add' });
      view.addChild(glow, wave, echo);
      spray(sparks, s, x, y, layer.coarse ? 24 : 44, { speed: [reach * .35, reach * .8], life: [600, 1000], scale: [.4, .8], colors: [tint, 0xffffff], drag: 1.4 });
      return t => {
        const k = easeOut(t);
        wave.scale.set(reach / 256 * (.05 + 1.05 * k)); wave.alpha = .95 * (1 - t);
        const e = Math.max(0, (t - .12) / .88);
        echo.scale.set(reach / 256 * (.05 + .9 * easeOut(e))); echo.alpha = .5 * (1 - e) * (t > .12 ? 1 : 0);
        glow.scale.set(reach / 128 * .25 * (1 + k)); glow.alpha = .7 * (1 - Math.min(1, t / .5));
      };
    });
  },
};

/** Desenha o efeito pedido. Devolve false se a camada não está pronta (quem pediu faz em CSS). */
export function play<N extends GpuEffectName>(layer: GpuLayer, name: N, params: GpuEffectParams[N]): boolean {
  const s = shared.get(layer);
  if (!s || layer.destroyed) return false;
  const make = (DAMAGE_EFFECTS as any)[name] ?? (MOVE_EFFECTS as any)[name];
  layer.add(make(layer, s, params));
  return true;
}
