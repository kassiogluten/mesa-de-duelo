// A carta que muda de face no campo, na camada GPU: ela sobe da mesa, vira de lado com perspectiva de verdade, mostrando a face de antes e depois a nova (ou o verso, na cor da capa), e pousa de volta, com a sombra e o brilho de borda acompanhando.
import { Container, PerspectiveMesh, Sprite, type Texture } from 'pixi.js';
import type { GpuEffect, GpuLayer } from './gpuLayer';
import type { Point } from '../motionKit';
import { colorOf, particles, spray, type Shared } from './gpuParticles';
import { backTexture, holdTexture } from './gpuFlight';
import { solidAllowed } from './gpuSolid';

/** Um lado da carta: a imagem completa (`url`) ou, virada para baixo, as cinco cores da capa (`back`). */
export interface TurnSide { url?: string; back?: readonly string[] }

export interface TurnParams {
  /**
   * A permanente em `at` (o tamanho dela em pé; `rot` é o giro na mesa, 90 na virada) sobe, vira de `from` para `to` e
   * pousa, em `duration` ms. `done` avisa quando a carta de verdade pode voltar a aparecer: com true, a face nova já
   * pousou; com false, a imagem dela não chegou a tempo e a virada parou de lado (quem pediu termina o giro em CSS).
   */
  cardTurn: { at: Point; rot?: number; from: TurnSide; to: TurnSide; edge?: string; duration: number; done?: (landed: boolean) => void };
}

const DEG = Math.PI / 180, PERSPECTIVE = 900;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
// A virada vai de 15% a 85% do tempo; de lado (na metade), a carta espera a imagem da face nova por até este tanto.
const TURN_FROM = .15, TURN_TO = .85, WAIT = 450;

/**
 * Sem a textura da face de antes (ou do degrau 2 do automático em diante), não vira aqui (null): quem pediu gira a
 * carta em CSS. A face nova pode chegar durante a subida; de lado, a carta espera um pouco por ela.
 */
export function cardTurn(layer: GpuLayer, s: Shared, p: TurnParams['cardTurn']): GpuEffect | null {
  if (!solidAllowed()) return null;
  const side = (one: TurnSide) => one.url ? holdTexture(layer, one.url) : one.back ? { texture: backTexture(layer, one.back), release() { /* O verso fica com a camada. */ } } : undefined;
  const first = side(p.from);
  if (!first) { if (p.to.url) holdTexture(layer, p.to.url)?.release(); return null; }
  let second = side(p.to);
  const { x, y } = layer.local(p.at.cx, p.at.cy), w = p.at.w, h = p.at.h;
  const rot = (p.rot ?? 0) * DEG, cos = Math.cos(rot), sin = Math.sin(rot);
  const edge = colorOf(p.edge, 0xf2b54c);
  const view = new Container();
  const shadow = new PerspectiveMesh({ texture: s.cardGlow, verticesX: 4, verticesY: 4 });
  const glow = new PerspectiveMesh({ texture: s.cardGlow, verticesX: 4, verticesY: 4 });
  const card = new PerspectiveMesh({ texture: first.texture, verticesX: 8, verticesY: 8 });
  const flash = new Sprite({ texture: s.glow, anchor: .5, x, y, tint: edge, blendMode: 'add', alpha: 0 });
  shadow.tint = 0x000000; glow.tint = edge; glow.blendMode = 'add';
  view.addChild(shadow, glow, card, flash);
  const sparks = particles(view);
  let finished = false;
  const finish = (landed: boolean) => { if (finished) return; finished = true; first.release(); second?.release(); p.done?.(landed); };
  view.on('destroyed', () => { sparks.drop(); if (!finished) { finished = true; first.release(); second?.release(); } });
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]] as const;
  const GLOW_X = 2, GLOW_Y = 200 / 140;
  let age = 0, waited = 0, shown: Texture = first.texture, burst = false;
  const hide = () => { shadow.visible = glow.visible = card.visible = flash.visible = false; };
  return {
    view,
    update(ms) {
      if (finished) return sparks.update(ms);
      const half = p.duration * (TURN_FROM + TURN_TO) / 2;
      // De lado e ainda sem a face nova: o tempo para ali até ela chegar (ou até desistir).
      if (age + ms >= half && shown === first.texture) {
        second ??= side(p.to);
        if (!second) {
          age = half; waited += ms;
          if (waited >= WAIT) { finish(false); hide(); return sparks.update(ms); }
        } else { card.texture = shown = second.texture; age += ms; }
      } else age += ms;
      const u = Math.min(1, age / p.duration);
      // Sobe até 30%, fica no alto e desce de 70% em diante; de lado, a luz pega na borda.
      const high = u < .3 ? smooth(u / .3) : u > .7 ? 1 - smooth((u - .7) / .3) : 1;
      const turn = Math.PI * smooth((u - TURN_FROM) / (TURN_TO - TURN_FROM));
      const yaw = shown === first.texture ? Math.min(turn, Math.PI / 2) : turn - Math.PI;
      const scale = 1 + .22 * high, tilt = 12 * high * DEG;
      const place = (mesh: PerspectiveMesh, sx: number, sy: number, back: number, dy = 0, spin = 0, grow = scale) => {
        const xy = corners.flatMap(([kx, ky]) => {
          const ox = kx * w * sx, ly = ky * h * sy;
          // De lado, a carta nunca vira uma linha (a malha não aceita um quadrilátero sem área).
          const lx = ox * Math.max(.03, Math.cos(spin)), zx = ox * Math.sin(spin);
          const yy = ly * Math.cos(back), z = ly * Math.sin(back) + zx, f = PERSPECTIVE / (PERSPECTIVE - z);
          const px = lx * f * grow, py = yy * f * grow;
          return [x + px * cos - py * sin, y - dy + px * sin + py * cos];
        });
        mesh.setCorners(xy[0]!, xy[1]!, xy[2]!, xy[3]!, xy[4]!, xy[5]!, xy[6]!, xy[7]!);
      };
      const lift = 10 * high, side0 = Math.abs(Math.sin(turn));
      place(card, 1, 1, tilt, lift, yaw);
      place(glow, GLOW_X * 1.02, GLOW_Y * 1.02, tilt, lift, yaw);
      // A sombra fica na mesa: desce, clareia e se espalha com a altura, e estreita quando a carta está de lado.
      place(shadow, GLOW_X * (.96 + .14 * high) * Math.max(.3, Math.abs(Math.cos(yaw))), GLOW_Y * (.96 + .12 * high), 0, -(4 + 22 * high), 0, 1);
      glow.alpha = .1 + .25 * high + .45 * side0;
      shadow.alpha = .5 - .2 * high;
      flash.scale.set(Math.max(w, h) * 2.2 / 128 * (.6 + .4 * side0)); flash.alpha = .35 * side0 * side0;
      if (!burst && shown !== first.texture) {
        burst = true;
        spray(sparks, s, x, y - lift, layer.coarse ? 6 : 12, { speed: [w * .8, w * 2.2], life: [280, 520], scale: [.2, .45], colors: [edge, 0xffffff], drag: 2.6 });
      }
      if (u >= 1) { finish(true); hide(); }
      return sparks.update(ms) || !finished;
    },
  };
}
