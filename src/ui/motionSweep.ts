// Limpa campo na mesa: a onda na cor da mágica sai de quem conjurou e varre a mesa, e cada permanente sai do jeito dela (racha, é sugada, volta para a mão) quando a onda passa; no de dano, cada criatura é atingida nesse instante.
import type { FCard } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';
import { damageSweepStyle, SWEEP_COLORS, sweepStyle, type SweepStyle } from './boardSweep';
import { center, reduced, type MotionKit, type Point } from './motionKit';
import { effectsTier } from './gpu/gpuSupport';
import type { createFlightMotion } from './motionFlights';
import type { createDamageMotion } from './motionDamage';
import type { createImpactMotion } from './motionImpact';
import type { createSurviveMotion } from './motionSurvive';

/** Acima de tantas permanentes (um campo de fichas), as que sobram saem só num clarão, sem a cena inteira de cada uma. */
const FULL_SCENES = 30;

export interface SweepOptions {
  you: number;
  /** A frase da faixa no meio da mesa ("Wrath of God: 9 permanentes destruídas."). */
  label: string;
  duration: number;
  face: (card: FCard) => string;
  hideDestination?: boolean;
}

/** `#ffe9a8` como a luz da mesa viva (de 0 a 1). */
const light = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

export function createSweepMotion(kit: MotionKit, parts: {
  flights: ReturnType<typeof createFlightMotion>; damage: ReturnType<typeof createDamageMotion>; impact: ReturnType<typeof createImpactMotion>;
  survive: ReturnType<typeof createSurviveMotion>;
}) {
  const { root, state, layer, later, animate, effect, remove, gpu } = kit;

  /** De onde a onda sai: o retrato de quem conjurou; sem ele, a pilha ou o meio da mesa. */
  function originOf(controller: number | undefined): Point {
    const avatar = controller === undefined ? null : root.querySelector(`.avatar[data-pid="${controller}"]`);
    return center(avatar) ?? center(kit.stackPile()) ?? kit.recentStack() ?? kit.stage();
  }
  /** Até onde a onda vai: o canto da mesa mais longe de onde ela sai. */
  function reachOf(from: Point) {
    const r = layer().getBoundingClientRect();
    return Math.max(1, ...[[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => Math.hypot(x! - from.cx, y! - from.cy)));
  }
  /** Quando a onda chega a `at`: a frente anda reto, do centro de `from` até `reach` em `travel` ms. */
  const arrival = (at: Point, from: Point, reach: number, travel: number) =>
    reduced() ? 0 : Math.round(travel * Math.min(1, Math.hypot(at.cx - from.cx, at.cy - from.cy) / reach));

  /**
   * A onda: na camada GPU, com o que cada cor solta pelo caminho; sem ela, um anel em CSS que cresce, com a mesa
   * escurecendo. A mesa treme de leve quando ela sai e a mesa viva acende na cor dela.
   */
  function wave(from: Point, reach: number, travel: number, style: SweepStyle) {
    if (reduced()) return;
    const color = SWEEP_COLORS[style];
    if (!gpu.play('sweep', { from, reach, travel, style })) {
      const total = travel + 480, dark = style === 'B' ? .45 : .32;
      const shade = effect('sweep-dim', from);
      shade.removeAttribute('style');
      animate(shade, [{ opacity: 0 }, { opacity: dark, offset: .12 }, { opacity: dark, offset: .75 }, { opacity: 0 }], total, 'linear');
      later(() => remove(shade), total);
      const ring = effect('sweep-wave', { ...from, w: reach * 2, h: reach * 2 });
      ring.style.setProperty('--sweep', color);
      animate(ring, [{ scale: '0', opacity: 1 }, { scale: '.96', opacity: .9, offset: .9 }, { scale: '1', opacity: 0 }], travel + 80, 'linear');
      later(() => remove(ring), travel + 100);
    }
    gpu.ambiencePulse({ quake: .8, flash: light(color) });
    // No degrau 2 do regulador, a mesa fica parada.
    const arena = effectsTier() < 2 ? root.querySelector<HTMLElement>('.arena') : null;
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: '-4px 2px', offset: .12 }, { translate: '4px -2px', offset: .3 }, { translate: '-3px 1px', offset: .5 }, { translate: '2px -1px', offset: .72 }, { translate: '0 0' }], 560, 'ease-out');
  }
  /** A faixa no meio da mesa, na cor da onda: o que a mágica fez. */
  function banner(text: string, duration: number, style: SweepStyle) {
    const el = effect('combat-banner sweep-banner', { cx: 0, cy: 0, w: 0, h: 0 });
    el.removeAttribute('style');
    el.style.setProperty('--sweep', SWEEP_COLORS[style]);
    el.textContent = text;
    if (!reduced()) animate(el, [{ opacity: 0, scale: '.94' }, { opacity: 1, scale: '1', offset: .12 }, { opacity: 1, offset: .82 }, { opacity: 0 }], duration);
    later(() => remove(el), duration);
  }

  /**
   * Limpa campo que tira as permanentes do campo (Wrath of God, Evacuation, Merciless Eviction): a onda varre a mesa e
   * cada uma sai do jeito de sempre (racha, é sugada pelo portal, volta para a mão) quando a onda chega nela; até lá,
   * ela continua no lugar. Sem a onda (as mortes logo depois de um limpa campo de dano), saem quase juntas.
   */
  function removal(event: PresentationEvent, o: SweepOptions) {
    const sweep = event.sweep!;
    const style = sweepStyle(sweep.cause);
    const from = originOf(sweep.controller), reach = reachOf(from);
    const travel = Math.round(o.duration * (sweep.wave ? .48 : .2));
    if (sweep.wave) { wave(from, reach, travel, style); banner(o.label, o.duration, style); }
    const color = SWEEP_COLORS[style];
    // As indestrutíveis que a mágica mandou destruir: a onda passa, elas racham e se fecham, e ficam no campo.
    for (const stayed of sweep.survivors ?? []) {
      const id = stayed.card?.id ?? stayed.sourceId;
      const el = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`), at = center(el);
      if (!at || !stayed.survived) continue;
      const how = stayed.survived;
      later(() => { const now = center(el); if (now) parts.survive.mend(now, how); }, arrival(at, from, reach, travel));
    }
    let scenes = 0;
    for (const left of sweep.events) {
      const id = left.card?.id ?? left.sourceId;
      const spot = id === undefined ? undefined : state.cards.get(String(id));
      // Sem lugar visto na mesa (escondida num monte de fichas iguais), não tem de onde sair.
      if (!spot || !left.card) continue;
      const hit = arrival(spot, from, reach, travel), rest = Math.max(420, o.duration - hit - 40);
      // A imagem carrega na hora: a cópia aparece já com a arte, e não a moldura vazia esperando o carregamento preguiçoso.
      // A face que estava na mesa (a imagem dela já está na memória), sem o carregamento preguiçoso nem o esboço de
      // "carregando"; sem ela, a face de sempre.
      const html = (spot.el.querySelector('.face')?.outerHTML ?? o.face(left.card)).replaceAll(' loading="lazy"', '')
        .replace(/\bimg-(wait|slow|small|in)\b/g, '').replaceAll('<img ', '<img data-no-wait ');
      const full = scenes++ < FULL_SCENES;
      // A mesa já foi desenhada sem ela: até a onda chegar, uma cópia fica no lugar (virada, se estava virada).
      const hold = hit > 0 ? effect('presentation-piece sweep-hold', spot.tapped ? { ...spot, w: spot.h, h: spot.w } : spot) : null;
      if (hold) {
        hold.innerHTML = html;
        if (spot.tapped) hold.style.transform = 'translate(-50%, -50%) rotate(90deg)';
      }
      later(() => {
        if (hold) remove(hold);
        if (!reduced()) gpu.play('flare', { at: spot, color, duration: 420 });
        if (full) { parts.flights.cardFlight(left, null, id, { you: o.you, html, label: '', duration: rest, hideDestination: o.hideDestination }); return; }
        // As que passam do limite acendem e somem no lugar.
        const piece = effect('presentation-piece', spot, html);
        animate(piece, [{ opacity: 1, scale: '1', filter: 'brightness(1.8)' }, { opacity: 0, scale: '.85', filter: 'brightness(.6)' }], 380, 'ease-in');
        later(() => remove(piece), 400);
      }, hit);
    }
  }

  /**
   * Limpa campo de dano (Pyroclasm, Blasphemous Act, Earthquake): a onda de fogo (ou a névoa roxa, nos marcadores −1/−1)
   * varre a mesa no lugar dos projéteis, e cada alvo é atingido quando ela passa, com o número de sempre.
   */
  function damage(event: PresentationEvent, o: SweepOptions) {
    const sweep = event.sweep!;
    const style = damageSweepStyle(event);
    const from = originOf(sweep.controller), reach = reachOf(from);
    const travel = Math.round(o.duration * .48);
    wave(from, reach, travel, style);
    banner(o.label, o.duration, style);
    for (const part of sweep.events) {
      const at = parts.damage.damageTarget(part).at;
      if (!at) continue;
      const hit = arrival(at, from, reach, travel);
      later(() => { parts.impact.observe(part, Math.max(400, o.duration - hit)); parts.damage.hit(part); }, hit);
    }
  }

  return {
    sweep(event: PresentationEvent, o: SweepOptions) {
      if (document.hidden || root.hidden || !event.sweep) return;
      if (event.type === 'damage') damage(event, o);
      else removal(event, o);
    },
  };
}
