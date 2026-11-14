// Momentos do meio da mesa na camada GPU: a moeda girando com espessura e sombra, o dado rolando com perspectiva, e o fim da partida (raios e confete para quem vence, racha e cinzas para quem perde).
import { Container, PerspectiveMesh, Sprite } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { easeOut, paintOnce, rand, spray, themeColor, timed, type Shared } from './gpuParticles';

export interface StageParams {
  /**
   * Moeda: sobe girando no ar e cai mostrando `label` ("Cara" ou "Coroa"), quica, brilha no resultado e some no fim de
   * `hold` ms. `font` é a família da letra da mesa.
   */
  coin: { at: Point; heads: boolean; label: string; hold: number; font: string };
  /** Dado: entra rolando, trocando de número a cada volta, quica e para em `result`. `sides` vai no canto (d6, d20). */
  die: { at: Point; result: string; sides: number; hold: number; font: string };
  /** Quem venceu: raios dourados girando atrás do retrato, uma onda de luz e confete. */
  victory: { at: Point; delay?: number };
  /** Quem perdeu: o retrato racha, solta cinzas que caem e fumaça escura. */
  defeat: { at: Point };
}

/** Texto centrado, encolhendo a letra até caber na largura. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, max: number, font: string) {
  let px = size;
  g.font = `800 ${px}px ${font}`;
  while (px > 12 && g.measureText(text).width > max) { px -= 2; g.font = `800 ${px}px ${font}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

const COIN = { heads: ['#fff6cf', '#f2b54c', '#a8741c', '#7a520f', '#2a1600'], tails: ['#ffffff', '#c2c2c2', '#737373', '#444444', '#222222'] };
/** Uma face da moeda: disco com relevo, aro e o nome do lado no meio. */
function coinFace(layer: GpuLayer, heads: boolean, text: string, font: string) {
  const [hi, mid, low, rim, ink] = heads ? COIN.heads : COIN.tails;
  return paintOnce(layer, `coin:${heads}:${text}:${font}`, 256, 256, g => {
    const disc = g.createRadialGradient(96, 82, 10, 128, 128, 128);
    disc.addColorStop(0, hi!); disc.addColorStop(.55, mid!); disc.addColorStop(1, low!);
    g.fillStyle = disc; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    // O aro: um anel claro por dentro e a borda escura por fora.
    g.lineWidth = 10; g.strokeStyle = rim!; g.beginPath(); g.arc(128, 128, 121, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(128, 128, 106, 0, Math.PI * 2); g.stroke();
    // Os pontinhos do relevo em volta do aro.
    g.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, 2.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = ink!;
    label(g, text, 128, 132, 62, 170, font);
  });
}
/** A espessura da moeda: o mesmo disco, mais escuro, que aparece por baixo da face quando ela está de lado. */
function coinEdge(layer: GpuLayer, heads: boolean) {
  const [, , low, rim] = heads ? COIN.heads : COIN.tails;
  return paintOnce(layer, `coin-edge:${heads}`, 256, 256, g => {
    const band = g.createLinearGradient(0, 0, 256, 0);
    band.addColorStop(0, rim!); band.addColorStop(.5, low!); band.addColorStop(1, rim!);
    g.fillStyle = band; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  });
}
/** Uma face do dado: quadrado claro de cantos redondos, com o número e o tipo do dado no canto. */
function dieFace(layer: GpuLayer, value: string, sides: number, font: string) {
  return paintOnce(layer, `die:${value}:${sides}:${font}`, 256, 256, g => {
    const face = g.createLinearGradient(0, 0, 256, 256);
    face.addColorStop(0, '#ffffff'); face.addColorStop(1, '#d4d4d4');
    g.fillStyle = face; g.beginPath(); g.roundRect(4, 4, 248, 248, 46); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.beginPath(); g.roundRect(10, 10, 236, 236, 40); g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.roundRect(4, 4, 248, 248, 46); g.stroke();
    g.fillStyle = '#1f1f1f';
    label(g, value, 128, 124, 120, 200, font);
    g.fillStyle = '#5e5e5e'; g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(`d${sides}`, 128, 214);
  });
}
/** Raios saindo do meio, para trás do retrato de quem venceu. */
function sunburst(layer: GpuLayer) {
  return paintOnce(layer, 'sunburst', 256, 256, g => {
    g.translate(128, 128);
    for (let i = 0; i < 16; i++) {
      g.rotate(Math.PI * 2 / 16);
      const ray = g.createLinearGradient(0, 0, 0, -128);
      ray.addColorStop(0, 'rgba(255,255,255,.9)'); ray.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = ray; g.beginPath(); g.moveTo(-5, 0); g.lineTo(-14, -128); g.lineTo(14, -128); g.lineTo(5, 0); g.closePath(); g.fill();
    }
  });
}

const DEG = Math.PI / 180, PERSPECTIVE = 600;
/** Os quatro cantos de um quadrado de lado `size` em (x, y), virado em volta dos eixos (`pitch`, `yaw`) e girado no plano (`roll`), com perspectiva. */
function square(x: number, y: number, size: number, pitch: number, yaw: number, roll: number) {
  const out: number[] = [];
  for (const [kx, ky] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]] as const) {
    // Em volta do eixo vertical, depois do horizontal (de lado, nunca vira uma linha: a malha não aceita quadrilátero sem área).
    const cy = Math.cos(yaw), wide = Math.abs(cy) < .04 ? .04 * (cy < 0 ? -1 : 1) : cy;
    const x1 = kx * size * wide, z1 = kx * size * Math.sin(yaw), y0 = ky * size;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const py = y0 * cp - z1 * sp, pz = y0 * sp + z1 * cp;
    const f = PERSPECTIVE / (PERSPECTIVE - pz);
    const fx = x1 * f, fy = py * f, c = Math.cos(roll), s = Math.sin(roll);
    out.push(x + fx * c - fy * s, y + fx * s + fy * c);
  }
  return out as [number, number, number, number, number, number, number, number];
}

const CONFETTI = [0xf2b54c, 0xffe08a, 0xec5a3f, 0x6fb8ff, 0x63d68f, 0xb07cff, 0xffffff];

export const STAGE_EFFECTS: { [N in keyof StageParams]: (layer: GpuLayer, s: Shared, p: StageParams[N]) => GpuEffect } = {
  coin(layer, s, { at, heads, label: text, hold, font }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const size = at.w, gold = themeColor('--gold', '#f2b54c');
    const front = coinFace(layer, true, heads ? text : 'Cara', font), back = coinFace(layer, false, heads ? 'Coroa' : text, font);
    // Cinco voltas e meia: termina com a face do resultado para cima (par de meias-voltas mostra a cara).
    const turns = heads ? 10 : 11;
    return timed(hold, (view, sparks) => {
      const shadow = new Sprite({ texture: s.glow, anchor: .5, x, y: y + size * .55, tint: 0x000000, alpha: 0 });
      const halo = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: heads ? gold : 0xdfe6ee, blendMode: 'add', alpha: 0 });
      const edge = new Sprite({ texture: coinEdge(layer, heads), anchor: .5, x, y });
      const face = new Sprite({ texture: front, anchor: .5, x, y });
      view.addChild(shadow, halo, edge, face);
      let landed = false;
      return t => {
        // Sobe (até .35), cai (até .62) e quica uma vez; de .88 até o fim, some.
        const up = t < .35 ? easeOut(t / .35) : 0, fall = t >= .35 && t < .62 ? (t - .35) / .27 : 0;
        const height = t < .35 ? -40 + 100 * up : t < .62 ? 60 * (1 - fall * fall) : t < .72 ? 14 * Math.sin((t - .62) / .1 * Math.PI) : 0;
        const spin = Math.min(1, t / .62), angle = turns * Math.PI * (1 - (1 - spin) ** 2);
        const k = Math.cos(angle), flat = Math.max(.05, Math.abs(k));
        face.texture = k >= 0 ? front : back;
        const scale = size / 256 * (t < .35 ? .6 + .5 * up : t < .62 ? 1.1 - .1 * fall : 1);
        const cy = y - height;
        face.position.set(x, cy); face.scale.set(scale, scale * flat);
        // A espessura: o disco escuro aparece por baixo quando a moeda está de lado.
        edge.position.set(x, cy + Math.sin(angle) * size * .045); edge.scale.set(scale, scale * flat);
        const fade = t > .88 ? 1 - (t - .88) / .12 : Math.min(1, t / .08);
        face.alpha = edge.alpha = fade;
        shadow.scale.set(size / 128 * (.55 - height / 400), size / 128 * .14); shadow.alpha = .45 * fade * (1 - height / 200);
        halo.scale.set(size * 2.2 / 128); halo.alpha = landed ? .55 * Math.max(0, 1 - (t - .62) / .3) * fade : 0;
        if (!landed && t >= .62) {
          landed = true;
          spray(sparks, s, x, y, layer.coarse ? 12 : 22, { speed: [size * 1.2, size * 3], life: [300, 560], scale: [.25, .5], colors: heads ? [gold, 0xfff6cf, 0xffffff] : [0xdfe6ee, 0xffffff], drag: 3 });
          for (let i = 0; i < 8; i++) {
            const side = i % 2 ? 1 : -1;
            sparks.add(s.glow, s, { x: x + side * rand(0, size * .4), y: y + size * .45, vx: side * rand(40, 110), vy: rand(-20, 0), life: rand(360, 520), spin: 0, grow: 1.2, scale: rand(.08, .13), gravity: 0, drag: 3, tint: 0xc9bea8, blend: 'normal', alpha: .35, fadeIn: true });
          }
          // As faíscas saem por trás da moeda: a face fica por cima, legível.
          view.addChild(edge, face);
        }
      };
    });
  },
  die(layer, s, { at, result, sides, hold, font }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const size = at.w, n = Math.max(2, sides);
    // Os números que passam enquanto ele rola (como no dado em CSS) e, por último, o resultado.
    const shown = Array.from({ length: 6 }, (_, i) => String(((Number(result) || 1) + i * 7) % n + 1));
    const faces = [...shown, result].map(v => dieFace(layer, v, n, font));
    const halfTurns = faces.length - 1;
    return timed(hold, (view, sparks) => {
      const shadow = new Sprite({ texture: s.glow, anchor: .5, x, y: y + size * .6, tint: 0x000000, alpha: 0 });
      const halo = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xffffff, blendMode: 'add', alpha: 0 });
      const mesh = new PerspectiveMesh({ texture: faces[0]!, verticesX: 6, verticesY: 6 });
      view.addChild(shadow, halo, mesh);
      let landed = false;
      return t => {
        // Rola de baixo à esquerda até o meio (até .5), quica (até .6), fica e some (de .88 até o fim).
        const roll = Math.min(1, t / .5), k = easeOut(roll);
        const px = x - 130 * (1 - k), hop = Math.abs(Math.sin(roll * Math.PI * 2.5)) * 46 * (1 - roll);
        const py = y + 30 * (1 - k) - hop;
        const tumble = halfTurns * Math.PI * (1 - (1 - roll) ** 2);
        // A cada meia volta o número muda; ao parar, é o resultado.
        mesh.texture = faces[Math.min(halfTurns, Math.round(tumble / Math.PI))]!;
        const yaw = tumble - Math.round(tumble / Math.PI) * Math.PI, pitch = Math.sin(roll * Math.PI * 3) * (1 - roll) * .6;
        const spinPlane = -200 * DEG * (1 - k);
        const squash = t >= .5 && t < .6 ? 1 + .12 * Math.sin((t - .5) / .1 * Math.PI) : 1;
        mesh.setCorners(...square(px, py, size * squash, pitch, yaw, spinPlane));
        const fade = t > .88 ? 1 - (t - .88) / .12 : Math.min(1, t / .06);
        mesh.alpha = fade;
        shadow.position.set(px, y + size * .62); shadow.scale.set(size / 128 * (.6 - hop / 300), size / 128 * .14); shadow.alpha = .45 * fade;
        if (!landed && t >= .5) {
          landed = true;
          spray(sparks, s, x, y, layer.coarse ? 10 : 18, { speed: [size * 1.2, size * 2.8], life: [280, 480], scale: [.22, .45], colors: [0xffffff, 0xfff1cf, 0xcdefff], drag: 3 });
          for (let i = 0; i < 8; i++) {
            const side = i % 2 ? 1 : -1;
            sparks.add(s.glow, s, { x: x + side * rand(0, size * .4), y: y + size * .5, vx: side * rand(40, 110), vy: rand(-20, 0), life: rand(360, 520), spin: 0, grow: 1.2, scale: rand(.08, .13), gravity: 0, drag: 3, tint: 0xc9bea8, blend: 'normal', alpha: .35, fadeIn: true });
          }
          view.addChild(mesh);
        }
        halo.position.set(x, y); halo.scale.set(size * 2 / 128); halo.alpha = landed ? .45 * Math.max(0, 1 - (t - .5) / .3) * fade : 0;
      };
    });
  },
  victory(layer, s, { at, delay = 0 }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const size = Math.max(at.w, at.h), gold = themeColor('--gold', '#f2b54c');
    return timed(1300, (view: Container, sparks) => {
      const rays = new Sprite({ texture: sunburst(layer), anchor: .5, x, y, tint: gold, blendMode: 'add', alpha: 0 });
      const wave = new Sprite({ texture: s.ring, anchor: .5, x, y, tint: gold, blendMode: 'add' });
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xfff1cf, blendMode: 'add' });
      view.addChild(rays, glow, wave);
      // Confete: papeizinhos coloridos (os estilhaços, sem brilho) saindo para cima, girando, e caindo.
      const n = layer.coarse ? 40 : 80;
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + rand(-1.1, 1.1), speed = rand(260, 620);
        sparks.add(s.shard, s, { x: x + rand(-.3, .3) * size, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(1200, 1900), spin: rand(-12, 12), grow: 0, scale: rand(.22, .4), gravity: 520, drag: 1.6, tint: CONFETTI[i % CONFETTI.length]!, blend: 'normal' });
      }
      spray(sparks, s, x, y, layer.coarse ? 16 : 30, { speed: [size * 1.5, size * 4], life: [500, 900], scale: [.3, .6], colors: [gold, 0xffffff, 0xfff1cf], drag: 2 });
      return t => {
        const k = easeOut(t);
        rays.scale.set(size * 3.2 / 256 * (.5 + .6 * k)); rays.rotation = t * 1.2; rays.alpha = .75 * Math.sin(Math.PI * Math.min(1, t * 1.1));
        wave.scale.set(size * 3 / 256 * (.2 + k)); wave.alpha = .9 * (1 - t);
        glow.scale.set(size * 2 / 128 * (.8 + .3 * k)); glow.alpha = .6 * (1 - Math.min(1, t / .6));
      };
    }, delay);
  },
  defeat(layer, s, { at }) {
    const { x, y } = layer.local(at.cx, at.cy);
    const size = Math.max(at.w, at.h, 70);
    return timed(1200, (view, sparks) => {
      const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xff6a4f, blendMode: 'add' });
      view.addChild(flash);
      // A racha: estilhaços escuros caindo do retrato.
      for (let i = 0; i < (layer.coarse ? 10 : 16); i++) {
        const angle = (i / 16) * Math.PI * 2 + rand(-.2, .2), speed = rand(90, 240);
        sparks.add(s.shard, s, { x: x + Math.cos(angle) * size * .2, y: y + Math.sin(angle) * size * .2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 120, life: rand(600, 900), spin: rand(-12, 12), grow: -.3, scale: rand(.3, .6), gravity: 900, drag: 1.2, tint: i % 2 ? 0x5a5550 : 0x2e2a27, blend: 'normal' });
      }
      // Fumaça escura subindo.
      for (let i = 0; i < (layer.coarse ? 6 : 12); i++) sparks.add(s.glow, s, { x: x + rand(-.35, .35) * size, y: y + rand(-.2, .3) * size, vx: rand(-20, 20), vy: rand(-60, -25), life: rand(900, 1300), spin: 0, grow: 1.4, scale: rand(.3, .45) * size / 100, gravity: -8, drag: 1, tint: 0x1d1714, blend: 'normal', alpha: .55, fadeIn: true });
      let owed = 0;
      return (t, ms) => {
        // Cinzas cinzentas caindo devagar enquanto dura.
        owed += ms * (layer.coarse ? .02 : .04) * (1 - t);
        for (; owed >= 1; owed--) sparks.add(s.spark, s, { x: x + rand(-.5, .5) * size, y: y + rand(-.3, .3) * size, vx: rand(-15, 15), vy: rand(10, 40), life: rand(700, 1100), spin: 0, grow: -.3, scale: rand(.15, .3), gravity: 30, drag: 1.5, tint: 0x8a837c, blend: 'normal', alpha: .8 });
        flash.scale.set(size * 1.6 / 128 * (.8 + .4 * t)); flash.alpha = .7 * Math.max(0, 1 - t / .35);
      };
    });
  },
};
