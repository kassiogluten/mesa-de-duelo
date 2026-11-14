// Toques curtos na camada GPU: o brilho em volta da carta (ficha que surge, reanimada, planeswalker, aura que encaixa), o rasgo da dobra, a vida que sobe e os marcadores.
import { PerspectiveMesh, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { colorOf, easeOut, paintOnce, rand, themeColor, timed, type Shared } from './gpuParticles';

export interface AccentParams {
  /** Brilho em volta da carta, na cor pedida, que acende e apaga (no lugar de acender a imagem da carta). */
  flare: { at: Point; color: string; duration?: number; delay?: number };
  /** Dobra: um rasgo violeta e ciano que gira, puxa grãos de luz para dentro e se fecha. `size` é o diâmetro. */
  warp: { at: Point; size: number };
  /** Ganho de vida: grãos verdes subindo do total de vida, com um anel suave. */
  heal: { at: Point };
  /** Marcadores: +N/+N solta faíscas verdes para cima; −N/−N, roxas caindo. */
  counter: { at: Point; harmful: boolean };
}

const HEAL = 0x63d68f;

export const ACCENT_EFFECTS: { [N in keyof AccentParams]: (layer: GpuLayer, s: Shared, p: AccentParams[N]) => GpuEffect } = {
  flare(layer, s, { at, color, duration = 520, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const tint = colorOf(color, themeColor('--gold', '#f2b54c'));
    // O contorno de luz (100×140 no meio de 200×200, como o `cardGlow`) em volta da carta, e um véu leve por cima dela.
    const edge = paintOnce(layer, 'card-edge-glow', 200, 200, g => {
      g.shadowColor = '#fff'; g.shadowBlur = 16; g.strokeStyle = '#fff'; g.lineWidth = 7;
      g.beginPath(); g.roundRect(50, 30, 100, 140, 7); g.stroke(); g.stroke();
    });
    return timed(duration, view => {
      const wash = new PerspectiveMesh({ texture: s.cardGlow, verticesX: 2, verticesY: 2 });
      const rim = new PerspectiveMesh({ texture: edge, verticesX: 2, verticesY: 2 });
      wash.tint = rim.tint = tint; wash.blendMode = rim.blendMode = 'add';
      view.addChild(wash, rim);
      const place = (mesh: PerspectiveMesh, k: number) => {
        const w = at.w * 2 * k, h = at.h * 200 / 140 * k;
        mesh.setCorners(x - w / 2, y - h / 2, x + w / 2, y - h / 2, x + w / 2, y + h / 2, x - w / 2, y + h / 2);
      };
      return t => {
        const light = t < .2 ? t / .2 : 1 - (t - .2) / .8;
        place(rim, 1.02 + .1 * easeOut(t)); rim.alpha = light;
        place(wash, .96); wash.alpha = .22 * light;
      };
    }, delay);
  },
  warp(layer, s, { at, size }) {
    const { x, y } = layer.local(at.cx, at.cy);
    return timed(900, (view, sparks) => {
      const violet = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: 0x9b6bff, blendMode: 'add' });
      const cyan = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: 0x6fe3ff, blendMode: 'add' });
      const core = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0x1a0b33, alpha: 0 });
      const rim = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xb48cff, blendMode: 'add', alpha: 0 });
      view.addChild(rim, core, violet, cyan);
      let owed = 0;
      return (t, ms) => {
        // Abre até .35, gira aberto até .7 e se fecha num ponto.
        const open = t < .35 ? easeOut(t / .35) : t < .7 ? 1 + .08 * (t - .35) / .35 : 1.08 * (1 - easeOut((t - .7) / .3));
        const d = size * Math.max(.05, open);
        violet.scale.set(d / 256, d / 256 * .85); violet.rotation = t * 7;
        cyan.scale.set(d * .8 / 256, d * .8 / 256 * .85); cyan.rotation = -t * 9;
        violet.alpha = cyan.alpha = Math.min(1, open);
        core.scale.set(d * .7 / 128); core.alpha = .85 * Math.min(1, open);
        rim.scale.set(d * 1.4 / 128); rim.alpha = .4 * Math.min(1, open);
        // Grãos sendo puxados para dentro, girando.
        owed += ms * (layer.coarse ? .05 : .1) * (t < .75 ? 1 : 0);
        for (; owed >= 1; owed--) {
          const angle = rand(0, Math.PI * 2), r = size * rand(.55, .8), inward = r / .35;
          sparks.add(s.spark, s, { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r * .85, vx: -Math.sin(angle) * r * 3 - Math.cos(angle) * inward, vy: Math.cos(angle) * r * 3 * .85 - Math.sin(angle) * inward * .85, life: rand(280, 380), spin: 0, grow: -.6, scale: rand(.2, .38), gravity: 0, drag: 1.5, tint: Math.random() < .5 ? 0x9b6bff : 0x6fe3ff });
        }
      };
    });
  },
  heal(layer, s, { at }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const size = Math.max(at.w, at.h);
    return timed(700, (view, sparks) => {
      const ring = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: HEAL, blendMode: 'add' });
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: HEAL, blendMode: 'add' });
      view.addChild(glow, ring);
      let owed = 0;
      return (t, ms) => {
        owed += ms * (layer.coarse ? .04 : .07) * (t < .7 ? 1 : 0);
        for (; owed >= 1; owed--) sparks.add(s.spark, s, { x: x + rand(-.6, .6) * size, y: y + rand(-.1, .5) * size, vx: rand(-10, 10), vy: rand(-120, -60), life: rand(500, 800), spin: 0, grow: -.5, scale: rand(.22, .42), gravity: -20, drag: 1.2, tint: Math.random() < .3 ? 0xffffff : HEAL });
        const k = easeOut(t);
        ring.scale.set(size * 1.6 / 256 * (.6 + .6 * k)); ring.alpha = .8 * (1 - t);
        glow.scale.set(size * 1.4 / 128); glow.alpha = .45 * Math.sin(Math.PI * Math.min(1, t * 1.3));
      };
    });
  },
  counter(layer, s, { at, harmful }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const tint = harmful ? 0x9b6bff : HEAL;
    return timed(80, (_view, sparks) => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        for (let i = 0, n = layer.coarse ? 8 : 14; i < n; i++) {
          sparks.add(s.spark, s, { x: x + rand(-.45, .45) * at.w, y: y + rand(-.2, .4) * at.h, vx: rand(-25, 25), vy: harmful ? rand(30, 90) : rand(-160, -80), life: rand(420, 650), spin: 0, grow: -.5, scale: rand(.22, .42), gravity: harmful ? 60 : -30, drag: 1.4, tint: i % 3 ? tint : 0xffffff });
        }
      };
    });
  },
};
