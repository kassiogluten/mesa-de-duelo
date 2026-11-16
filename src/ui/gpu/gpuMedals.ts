// Os medalhões em 3D da camada GPU, que aparecem quando algo da partida muda de mão ou de estado: o disco de sol e lua que vira quando o dia vira noite (e o contrário) e voa até o ícone da trilha de fases, a coroa do Monarca e o escudo da Dianteira voando de um retrato para o outro, o emblema do planeswalker, com a arte dele, pousando ao lado do retrato, e o brasão de quem venceu a partida.
import { Sprite, Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { facing, multiply, rotation, type Mat3 } from './diceGeometry';
import { colorOf, easeOut, paintOnce, rand, spray, timed, type Shared } from './gpuParticles';
import { solidAllowed, solidPiece } from './gpuSolid';
import { circle, prism, solidData } from './solidShapes';
import { sunburst } from './gpuStage';
import { fitText } from './gpuCoin';
import { fromMirror } from '../../scryfallMirror';

export interface MedalParams {
  /**
   * Dia e noite: no meio da mesa (`at`), o disco aparece mostrando o lado de antes, vira mostrando o de agora (`day`),
   * acende e voa, encolhendo, até o ícone da trilha (`to`; sem ele, some ali mesmo).
   */
  dayNight: { at: Point; to?: Point; day: boolean };
  /**
   * A coroa do Monarca (um medalhão redondo) ou a Dianteira (um escudo) passando de mão: sai de `from` (o retrato de
   * quem tinha; sem ele, aparece em `to`), vira no ar e pousa em `to`, o selo de quem passou a ter, com um clarão.
   */
  holderPass: { from?: Point; to: Point; kind: 'monarch' | 'initiative' };
  /**
   * Emblema novo: um medalhão com o aro dourado e a arte do planeswalker (`art`, a imagem pequena da carta, pintada
   * quando chega) sai de `from` (o planeswalker no campo; sem ele, o meio da mesa), vira e pousa em `to`, o lugar do
   * emblema ao lado do retrato, com a luz na cor dele (`color`).
   */
  emblem: { from: Point; to: Point; art?: string; color: string };
  /** Fim da partida: o brasão dourado de quem venceu cai girando sobre o retrato (`at`), quica, brilha e some no fim. */
  crest: { at: Point; font: string; delay?: number };
}

/** Pinta um lado do medalhão num círculo de raio `r` em (cx, cy). */
type Painter = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;

/**
 * A textura de um medalhão: a frente no quadrado da esquerda, o verso no da direita e a borda na faixa de baixo,
 * passando da cor `edge[0]` (do lado da frente) para `edge[1]` (do verso). O mesmo arranjo do prisma de `solidShapes.ts`.
 */
function medalAtlas(layer: GpuLayer, key: string, front: Painter, back: Painter, edge: [string, string]): Texture {
  return paintOnce(layer, `medal:${key}`, 512, 320, g => {
    front(g, 128, 128, 128);
    back(g, 384, 128, 128);
    const band = g.createLinearGradient(0, 256, 0, 320);
    band.addColorStop(0, edge[0]); band.addColorStop(.5, '#ffffff'); band.addColorStop(.5, edge[1]); band.addColorStop(1, edge[1]);
    g.fillStyle = band; g.fillRect(0, 256, 512, 64);
    g.globalAlpha = .25; g.fillStyle = edge[0];
    g.fillRect(0, 286, 512, 4);
    g.globalAlpha = 1;
  });
}

/** O aro de um medalhão redondo: anel escuro por fora e um filete claro por dentro. */
function rim(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.lineWidth = r * .08; g.strokeStyle = color; g.beginPath(); g.arc(cx, cy, r * .95, 0, Math.PI * 2); g.stroke();
  g.lineWidth = r * .025; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(cx, cy, r * .84, 0, Math.PI * 2); g.stroke();
}

/** O sol: disco dourado com o sol da trilha (o círculo e os oito raios) no meio. */
const paintSun: Painter = (g, cx, cy, r) => {
  const sky = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
  sky.addColorStop(0, '#fff6d2'); sky.addColorStop(.55, '#f6b73c'); sky.addColorStop(1, '#b8640f');
  g.fillStyle = sky; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  rim(g, cx, cy, r, '#8a4a0a');
  g.save(); g.translate(cx, cy); g.scale(r / 15, r / 15); g.translate(-12, -12);
  g.strokeStyle = '#fffbe8'; g.fillStyle = '#fffbe8'; g.lineWidth = 1.9; g.lineCap = 'round';
  g.shadowColor = 'rgba(122,60,0,.6)'; g.shadowBlur = 6;
  g.beginPath(); g.arc(12, 12, 4, 0, Math.PI * 2); g.fill();
  g.stroke(new Path2D('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'));
  g.restore();
};

/** A lua: disco azul da noite com estrelas e a lua crescente no meio. */
const paintMoon: Painter = (g, cx, cy, r) => {
  const sky = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
  sky.addColorStop(0, '#5b73c4'); sky.addColorStop(.55, '#25336e'); sky.addColorStop(1, '#0c1233');
  g.fillStyle = sky; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Estrelas em lugares fixos (a textura é pintada uma vez e precisa sair igual).
  g.fillStyle = '#e8eeff';
  for (const [sx, sy, sr] of [[-.55, -.3, .025], [-.35, .5, .02], [.5, -.55, .02], [.6, .35, .025], [-.15, -.62, .015], [.2, .62, .018], [-.62, .15, .015]]) {
    g.beginPath(); g.arc(cx + sx! * r, cy + sy! * r, sr! * r, 0, Math.PI * 2); g.fill();
  }
  rim(g, cx, cy, r, '#0a0f2a');
  // A crescente: o círculo claro menos outro deslocado, pintado com o mesmo céu (o degradê é da tela, então encaixa).
  g.save();
  g.beginPath(); g.arc(cx - r * .06, cy, r * .42, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#eef2ff'; g.shadowColor = 'rgba(200,215,255,.8)'; g.shadowBlur = r * .1;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.shadowBlur = 0; g.fillStyle = sky;
  g.beginPath(); g.arc(cx + r * .18, cy - r * .14, r * .38, 0, Math.PI * 2); g.fill();
  g.restore();
};

/** Um ícone da interface (caminho de SVG em 24×24) no meio de um lado, centrado em (`ox`, `oy`) do ícone. */
function icon(g: CanvasRenderingContext2D, path: string, cx: number, cy: number, r: number, o: { ox: number; oy: number; fill: string; shadow: string; evenodd?: boolean }) {
  g.save(); g.translate(cx, cy); g.scale(r / 15, r / 15); g.translate(-o.ox, -o.oy);
  g.fillStyle = o.fill; g.shadowColor = o.shadow; g.shadowBlur = 4; g.shadowOffsetY = .6;
  g.fill(new Path2D(path), o.evenodd ? 'evenodd' : 'nonzero');
  g.restore();
}
// Os mesmos desenhos dos selos de Monarca e Dianteira (playerStatus.ts e dungeon.ts).
const CROWN = 'M2 8l5 4 5-7 5 7 5-4-2 11H4zm2 13h16v2H4z';
const MARK = 'M11 7h2v6h-2zm0 8h2v2h-2z';

/** A coroa: disco dourado (ou o verso em púrpura real) com a coroa do selo de Monarca. */
const crownSide = (royal: boolean): Painter => (g, cx, cy, r) => {
  const metal = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
  if (royal) { metal.addColorStop(0, '#9b5fd0'); metal.addColorStop(.6, '#5a2a8a'); metal.addColorStop(1, '#2a0f45'); }
  else { metal.addColorStop(0, '#fff6cf'); metal.addColorStop(.55, '#f2c14e'); metal.addColorStop(1, '#9a6a14'); }
  g.fillStyle = metal; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  rim(g, cx, cy, r, royal ? '#f2c14e' : '#7a520f');
  icon(g, CROWN, cx, cy, r * .95, { ox: 12, oy: 14, fill: royal ? '#f2c14e' : '#4a2c05', shadow: royal ? 'rgba(0,0,0,.6)' : 'rgba(255,240,200,.6)' });
};

/** O contorno do escudo (convexo, no sentido anti-horário, dentro do círculo de raio 1). */
const SHIELD: [number, number][] = [[0, .98], [-.42, .9], [-.8, .74], [-.8, .12], [-.7, -.34], [-.46, -.7], [0, -1], [.46, -.7], [.7, -.34], [.8, .12], [.8, .74], [.42, .9]];
/** A Dianteira: o escudo em bronze (ou o verso em vermelho escuro) com o ponto de exclamação do selo. */
const shieldSide = (dark: boolean): Painter => (g, cx, cy, r) => {
  const metal = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  if (dark) { metal.addColorStop(0, '#a8352c'); metal.addColorStop(1, '#3a0c0c'); }
  else { metal.addColorStop(0, '#ffe3a1'); metal.addColorStop(.5, '#d9a93a'); metal.addColorStop(1, '#7a520f'); }
  g.fillStyle = metal; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  // A borda do escudo, seguindo o contorno, e um filete por dentro.
  const outline = (k: number) => { g.beginPath(); SHIELD.forEach(([x, y], i) => i ? g.lineTo(cx + x * r * k, cy - y * r * k) : g.moveTo(cx + x * r * k, cy - y * r * k)); g.closePath(); };
  outline(.96); g.lineWidth = r * .09; g.strokeStyle = dark ? '#f2c14e' : '#6a4208'; g.stroke();
  outline(.8); g.lineWidth = r * .025; g.strokeStyle = 'rgba(255,255,255,.45)'; g.stroke();
  icon(g, MARK, cx, cy + r * .06, r * 1.25, { ox: 12, oy: 12, fill: dark ? '#f2c14e' : '#3a2205', shadow: 'rgba(0,0,0,.4)' });
};

/** O verso do emblema: azul fundo, com a estrelinha de quatro pontas em dourado. */
const emblemBack: Painter = (g, cx, cy, r) => {
  const sky = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
  sky.addColorStop(0, '#4a5f8c'); sky.addColorStop(1, '#1a2440');
  g.fillStyle = sky; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  emblemRim(g, cx, cy, r);
  icon(g, 'M12 3.6 13.9 10.1 20.4 12 13.9 13.9 12 20.4 10.1 13.9 3.6 12 10.1 10.1z', cx, cy, r * .9, { ox: 12, oy: 12, fill: '#f2b54c', shadow: 'rgba(242,181,76,.8)' });
};
/** O aro dourado do emblema, como o da mesa (dourado e bronze alternados). */
function emblemRim(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const ring = g.createConicGradient(Math.PI / 4, cx, cy);
  for (const [at, color] of [[0, '#f2b54c'], [.25, '#8c5523'], [.5, '#f2b54c'], [.75, '#8c5523'], [1, '#f2b54c']] as const) ring.addColorStop(at, color);
  g.lineWidth = r * .14; g.strokeStyle = ring; g.beginPath(); g.arc(cx, cy, r * .92, 0, Math.PI * 2); g.stroke();
}
/** A frente do emblema: a arte (quando houver), cortada no círculo como na mesa (largura de 260%, no alto da carta), e o aro. */
function emblemFront(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, art: ImageBitmap | null) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r * .86, 0, Math.PI * 2); g.clip();
  const sky = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
  sky.addColorStop(0, '#4a5f8c'); sky.addColorStop(1, '#1a2440');
  g.fillStyle = sky; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (art) {
    const w = r * 2 * 2.6, h = w * art.height / art.width;
    g.drawImage(art, cx - r + (r * 2 - w) * .5, cy - r + (r * 2 - h) * .18, w, h);
  }
  g.restore();
  emblemRim(g, cx, cy, r);
}
/** A imagem da carta, pelo cache de imagens e, se ele falhar, direto no Scryfall (como no voo da carta). */
async function loadArt(url: string) {
  const get = (u: string) => fetch(u, { mode: 'cors', credentials: 'omit' }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r; });
  const original = fromMirror(url);
  const response = await get(url).catch(e => { if (!original) throw e; return get(original); });
  return createImageBitmap(await response.blob());
}

/** O contorno do brasão: um escudo mais largo que o da Dianteira. */
const CREST: [number, number][] = [[0, 1], [-.5, .93], [-.88, .8], [-.88, .06], [-.76, -.4], [-.5, -.75], [0, -1], [.5, -.75], [.76, -.4], [.88, .06], [.88, .8], [.5, .93]];
/** O brasão: ouro com louros em volta, a estrela no meio e "Vitória" embaixo; o verso, em vermelho real com a estrela. */
const crestSide = (back: boolean, font: string): Painter => (g, cx, cy, r) => {
  const metal = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  if (back) { metal.addColorStop(0, '#b3352a'); metal.addColorStop(1, '#4a0d0d'); }
  else { metal.addColorStop(0, '#fff3c4'); metal.addColorStop(.45, '#f2b54c'); metal.addColorStop(1, '#8c5523'); }
  g.fillStyle = metal; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  const outline = (k: number) => { g.beginPath(); CREST.forEach(([x, y], i) => i ? g.lineTo(cx + x * r * k, cy - y * r * k) : g.moveTo(cx + x * r * k, cy - y * r * k)); g.closePath(); };
  outline(.96); g.lineWidth = r * .08; g.strokeStyle = back ? '#f2b54c' : '#6a3a10'; g.stroke();
  outline(.82); g.lineWidth = r * .025; g.strokeStyle = 'rgba(255,255,255,.5)'; g.stroke();
  const ink = back ? '#f2b54c' : '#5a2e08';
  // Os louros: sete folhas em cada lado, num arco de baixo até o alto em volta da estrela, deitadas ao longo dele.
  if (!back) {
    g.fillStyle = '#5d7024';
    const R = r * .56, oy = cy - r * .1;
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
      const a = (200 - i * 15) * Math.PI / 180, tangent = Math.atan2(-Math.cos(a), -Math.sin(a));
      g.save(); g.translate(cx - side * R * Math.cos(a), oy - R * Math.sin(a)); g.rotate(side < 0 ? tangent : Math.PI - tangent);
      g.beginPath(); g.ellipse(0, 0, r * .085, r * .038, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  icon(g, 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z', cx, cy - r * .12, r * .8, { ox: 12, oy: 12, fill: ink, shadow: back ? 'rgba(0,0,0,.5)' : 'rgba(255,240,200,.7)' });
  if (!back) { g.fillStyle = ink; fitText(g, 'Vitória', cx, cy + r * .5, r * .2, r * .9, font); }
};

const discData = () => solidData(prism(circle(48), .16));
const crestData = () => solidData(prism(CREST, .16));
const shieldData = () => solidData(prism(SHIELD, .18));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * Um medalhão que aparece em `from`, vira até a rotação `resting` (dando `turns` meias-voltas em x antes) e, no fim,
 * voa encolhendo até `to`. As fases (de 0 a 1): aparece até `appear`, vira até `turned`, voa de `leave` até o fim.
 */
function flipAndFly(o: {
  t: number; from: { x: number; y: number }; to: { x: number; y: number } | null; unit: number; endUnit: number;
  resting: Mat3; turns: number; appear: number; turned: number; leave: number;
}) {
  const shown = easeOut(clamp01(o.t / o.appear));
  const flip = easeInOut(clamp01((o.t - o.appear) / (o.turned - o.appear)));
  const sway = Math.sin(o.t * Math.PI * 2) * .12 * (1 - flip);
  const m = multiply(rotation([1, 0, 0], -o.turns * Math.PI * (1 - flip)), multiply(rotation([0, 1, 0], sway), o.resting));
  const k = o.to ? clamp01((o.t - o.leave) / (1 - o.leave)) ** 2 : 0;
  const x = o.from.x + ((o.to?.x ?? o.from.x) - o.from.x) * k;
  // Um arco para cima no caminho até o ícone.
  const y = o.from.y + ((o.to?.y ?? o.from.y) - o.from.y) * k - Math.sin(k * Math.PI) * o.unit * .6;
  const unit = (o.unit + (o.endUnit - o.unit) * k) * (.4 + .6 * shown);
  return { m, x, y, unit, shown, flip, k };
}

export const MEDAL_EFFECTS: { [N in keyof MedalParams]: (layer: GpuLayer, s: Shared, p: MedalParams[N]) => GpuEffect | null } = {
  dayNight(layer, s, { at, to, day }) {
    // Do degrau 2 em diante, fica só o ícone da trilha pulsando.
    if (!solidAllowed()) return null;
    const from = layer.local(at.cx, at.cy), end = to ? layer.local(to.cx, to.cy) : null;
    const size = at.w, unit = size / 2, endUnit = to ? Math.max(8, to.w / 2) : unit;
    const texture = medalAtlas(layer, 'day-night', paintSun, paintMoon, ['#b8640f', '#25336e']);
    // Assenta deitado para trás, como visto de cima, com a borda aparecendo embaixo.
    const resting = day ? facing([0, 0, 1], [0, 1, 0], -.3) : facing([0, 0, -1], [0, -1, 0], -.3);
    const color = day ? 0xf6b73c : 0x9fb4ff;
    return timed(2000, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, tint: color, blendMode: 'add', alpha: 0 });
      const rays = new Sprite({ texture: sunburst(layer), anchor: .5, tint: color, blendMode: 'add', alpha: 0 });
      const piece = solidPiece(layer, 'disc', discData, texture, { shine: .35, metal: .5 });
      view.addChild(rays, glow, piece.mesh);
      let lit = false;
      return t => {
        // Aparece (até .14), vira uma volta e meia (até .5), fica um instante e voa até o ícone (de .7 em diante).
        const f = flipAndFly({ t, from, to: end, unit, endUnit, resting, turns: 3, appear: .14, turned: .5, leave: .7 });
        const after = lit ? clamp01((t - .5) / .25) : 0;
        // O sol já é claro: o clarão dele é mais fraco, para o desenho não sumir no branco.
        piece.pose(f.m, f.x, f.y, f.unit, lit ? (1 - after) * (day ? .35 : .9) : 0);
        piece.mesh.alpha = f.shown * (t > .94 ? 1 - (t - .94) / .06 : 1);
        glow.position.set(f.x, f.y); glow.scale.set(f.unit * 5 / 128); glow.alpha = (day ? .6 : 1) * (.25 + (lit ? .5 * (1 - after) : 0)) * f.shown * (1 - f.k);
        rays.position.set(f.x, f.y); rays.rotation = t * (day ? 1.2 : -.6); rays.scale.set(f.unit * 5.5 / 256); rays.alpha = lit ? .55 * (1 - after) * (1 - f.k) : 0;
        if (!lit && t >= .5) {
          lit = true;
          spray(sparks, s, f.x, f.y, layer.coarse ? 10 : 20, { speed: [unit * 2, unit * 5], life: [380, 700], scale: [.25, .5], colors: day ? [0xfff1cf, 0xf6b73c, 0xffffff] : [0xe8eeff, 0x9fb4ff, 0xffffff], drag: 2.6 });
          // As faíscas saem por trás do disco.
          view.addChild(piece.mesh);
        }
        if (lit && f.k > 0 && f.k < 1 && Math.random() < .5) {
          sparks.add(s.spark, s, { x: f.x, y: f.y, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(220, 360), spin: 0, grow: -.6, scale: rand(.3, .5), gravity: 0, drag: 2, tint: color });
          view.addChild(piece.mesh);
        }
      };
    });
  },
  holderPass(layer, s, { from, to, kind }) {
    // Do degrau 2 em diante, fica só o selo pulsando.
    if (!solidAllowed()) return null;
    const end = layer.local(to.cx, to.cy), start = from ? layer.local(from.cx, from.cy) : end;
    const monarch = kind === 'monarch';
    // Do tamanho de um retrato (no mínimo 56 px), encolhendo até o tamanho do selo.
    const unit = Math.max(28, Math.min(48, (from?.w ?? to.w * 2.4) * .45)), endUnit = Math.max(9, to.h * .6);
    const texture = monarch ? medalAtlas(layer, 'monarch', crownSide(false), crownSide(true), ['#9a6a14', '#5a2a8a'])
      : medalAtlas(layer, 'initiative', shieldSide(false), shieldSide(true), ['#7a520f', '#3a0c0c']);
    const resting = facing([0, 0, 1], [0, 1, 0], -.25);
    const color = monarch ? 0xf2c14e : 0xd9a93a;
    // Sem ninguém antes, ela aparece já em cima de quem passou a ter e só vira e assenta.
    return timed(from ? 1700 : 1300, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, tint: color, blendMode: 'add', alpha: 0 });
      const piece = monarch ? solidPiece(layer, 'disc', discData, texture, { shine: .4, metal: .8 }) : solidPiece(layer, 'shield', shieldData, texture, { shine: .4, metal: .8 });
      view.addChild(glow, piece.mesh);
      // Sobe um pouco acima do retrato antes de voar, para não ficar em cima do nome.
      const lift = { x: start.x, y: start.y - unit * .6 };
      let landed = false;
      return t => {
        // Aparece (até .12), vira (até .42) e voa até o selo (de .45 a .85); pousa, acende e some até o fim.
        const f = flipAndFly({ t: Math.min(t / .85, 1), from: lift, to: end, unit, endUnit, resting, turns: 4, appear: .14, turned: .5, leave: .53 });
        const after = clamp01((t - .85) / .15);
        piece.pose(f.m, f.x, f.y, f.unit * (1 + .25 * Math.sin(after * Math.PI)), landed ? (1 - after) * .8 : 0);
        piece.mesh.alpha = f.shown * (1 - after);
        glow.position.set(f.x, f.y); glow.scale.set(f.unit * 5 / 128); glow.alpha = (.3 + (landed ? .6 * (1 - after) : 0)) * f.shown * (1 - after);
        if (f.k > 0 && f.k < 1 && Math.random() < .6) {
          sparks.add(s.spark, s, { x: f.x, y: f.y, vx: rand(-25, 25), vy: rand(-25, 25), life: rand(240, 380), spin: 0, grow: -.6, scale: rand(.3, .5), gravity: 0, drag: 2, tint: color });
          // Cada faísca entra por cima de tudo: o medalhão volta para a frente, e o rastro fica por trás dele.
          view.addChild(piece.mesh);
        }
        if (!landed && t >= .85) {
          landed = true;
          spray(sparks, s, end.x, end.y, layer.coarse ? 8 : 16, { speed: [endUnit * 4, endUnit * 9], life: [320, 560], scale: [.25, .45], colors: [0xfff1cf, color, 0xffffff], drag: 2.6 });
        }
      };
    });
  },
  crest(layer, s, { at, font, delay = 0 }) {
    if (!solidAllowed()) return null;
    const unit = Math.max(36, Math.min(70, Math.max(at.w, at.h) * .8));
    // Sobre o retrato, mas inteiro na tela (o seu retrato fica colado na borda).
    const local = layer.local(at.cx, at.cy), screen = layer.size(), margin = unit * .95 + 8;
    const x = Math.max(margin, Math.min(screen.width - margin, local.x)), y = Math.max(margin, Math.min(screen.height - margin, local.y));
    const texture = medalAtlas(layer, `crest:${font}`, crestSide(false, font), crestSide(true, font), ['#8c5523', '#4a0d0d']);
    const resting = facing([0, 0, 1], [0, 1, 0], -.18);
    return timed(1900, (view, sparks) => {
      const glow = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: 0xf2b54c, blendMode: 'add', alpha: 0 });
      const piece = solidPiece(layer, 'crest', crestData, texture, { shine: .45, metal: .9 });
      view.addChild(glow, piece.mesh);
      let landed = false;
      return t => {
        // Cai de cima girando para a frente (até .4), quica (até .52), fica brilhando e some no fim (de .85).
        const fall = clamp01(t / .4), k = fall * fall;
        const bounce = t >= .4 && t < .52 ? Math.sin((t - .4) / .12 * Math.PI) * unit * .25 : 0;
        const py = y - unit * 3.2 * (1 - k) - bounce;
        const m = multiply(rotation([1, 0, 0], -4 * Math.PI * (1 - easeOut(fall))), resting);
        const squash = t >= .4 && t < .48 ? 1 - .06 * Math.sin((t - .4) / .08 * Math.PI) : 1;
        const out = clamp01((t - .85) / .15);
        piece.pose(m, x, py, unit * squash * (1 + .15 * out), landed ? .7 * clamp01(1 - (t - .4) / .25) : 0);
        piece.mesh.alpha = Math.min(1, t / .08) * (1 - out);
        glow.scale.set(unit * 5 / 128); glow.alpha = landed ? (.35 + .35 * clamp01(1 - (t - .4) / .3)) * (1 - out) : 0;
        if (!landed && t >= .4) {
          landed = true;
          spray(sparks, s, x, y, layer.coarse ? 14 : 28, { speed: [unit * 2, unit * 6], life: [420, 800], scale: [.3, .6], colors: [0xf2b54c, 0xfff1cf, 0xffffff], drag: 2.4 });
          view.addChild(piece.mesh);
        }
      };
    }, delay);
  },
  emblem(layer, s, { from, to, art, color: tone }) {
    if (!solidAllowed()) return null;
    const start = layer.local(from.cx, from.cy), end = layer.local(to.cx, to.cy);
    const unit = Math.max(30, Math.min(52, from.w * .45)), endUnit = Math.max(10, to.w / 2);
    const color = colorOf(tone, 0xf2b54c);
    // A textura é só deste emblema: a arte chega depois e é pintada por cima, sem esperar.
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const g = canvas.getContext('2d')!;
    emblemFront(g, 128, 128, 128, null);
    emblemBack(g, 384, 128, 128);
    const band = g.createLinearGradient(0, 256, 0, 320);
    band.addColorStop(0, '#f2b54c'); band.addColorStop(.5, '#8c5523'); band.addColorStop(1, '#f2b54c');
    g.fillStyle = band; g.fillRect(0, 256, 512, 64);
    const texture = Texture.from(canvas);
    let alive = true;
    if (art) loadArt(art).then(bitmap => { if (alive) { emblemFront(g, 128, 128, 128, bitmap); texture.source.update(); } bitmap.close(); }).catch(() => { /* Sem a arte, fica o azul do emblema. */ });
    const resting = facing([0, 0, 1], [0, 1, 0], -.2);
    return timed(1900, (view, sparks) => {
      view.on('destroyed', () => { alive = false; texture.destroy(true); });
      const glow = new Sprite({ texture: s.glow, anchor: .5, tint: color, blendMode: 'add', alpha: 0 });
      const ring = new Sprite({ texture: s.ring, anchor: .5, tint: color, blendMode: 'add', alpha: 0 });
      const piece = solidPiece(layer, 'disc', discData, texture, { shine: .35, metal: .4 });
      view.addChild(ring, glow, piece.mesh);
      const lift = { x: start.x, y: start.y - unit * .4 };
      let lit = false, landed = false;
      return t => {
        // Sobe do planeswalker mostrando o verso, vira para a arte (até .42), acende, voa (de .5 a .85) e pousa.
        const f = flipAndFly({ t: Math.min(t / .85, 1), from: lift, to: end, unit, endUnit, resting, turns: 3, appear: .14, turned: .5, leave: .58 });
        const after = clamp01((t - .85) / .15);
        const flash = lit ? clamp01(1 - (t - .42) / .2) : 0;
        piece.pose(f.m, f.x, f.y, f.unit * (1 + .2 * Math.sin(after * Math.PI)), Math.max(flash * .6, landed ? (1 - after) * .7 : 0));
        piece.mesh.alpha = f.shown * (1 - after);
        glow.position.set(f.x, f.y); glow.scale.set(f.unit * 5 / 128); glow.alpha = (.3 + .5 * flash) * f.shown * (1 - after);
        ring.position.set(start.x, lift.y); ring.scale.set(unit * 3.4 / 256 * (.4 + (lit ? clamp01((t - .42) / .3) : 0))); ring.alpha = lit ? .8 * clamp01(1 - (t - .42) / .3) : 0;
        if (!lit && t >= .42) {
          lit = true;
          spray(sparks, s, f.x, f.y, layer.coarse ? 10 : 20, { speed: [unit * 2, unit * 5], life: [380, 700], scale: [.25, .5], colors: [color, 0xfff1cf, 0xffffff], drag: 2.6 });
          view.addChild(piece.mesh);
        }
        if (f.k > 0 && f.k < 1 && Math.random() < .6) {
          sparks.add(s.spark, s, { x: f.x, y: f.y, vx: rand(-25, 25), vy: rand(-25, 25), life: rand(240, 380), spin: 0, grow: -.6, scale: rand(.3, .5), gravity: 0, drag: 2, tint: color });
          // Cada faísca entra por cima de tudo: o medalhão volta para a frente, e o rastro fica por trás dele.
          view.addChild(piece.mesh);
        }
        if (!landed && t >= .85) {
          landed = true;
          spray(sparks, s, end.x, end.y, layer.coarse ? 8 : 16, { speed: [endUnit * 4, endUnit * 9], life: [320, 560], scale: [.25, .45], colors: [0xfff1cf, color, 0xffffff], drag: 2.6 });
        }
      };
    });
  },
};
