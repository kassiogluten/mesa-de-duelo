import type { PresentationEvent } from './presentationTimeline';
import { warpReturn } from './warpEffects';
import { center, reduced, type MotionKit, type Point } from './motionKit';
import { createLeaveEffects } from './leaveEffects';

/** O brilho de quem vem de um monte especial: roxo do cemitério, branco do exílio, dourado da zona de comando. */
export function zoneGlow(zone: string | undefined) {
  return zone === 'Graveyard' ? 'drop-shadow(0 0 12px #a46bff)' : zone === 'Exile' ? 'drop-shadow(0 0 12px #fff)' : zone === 'Command' ? 'drop-shadow(0 0 12px #f2b54c)' : '';
}

/** Os montes de cada jogador (cemitério, exílio, grimório, zona de comando) e a saída do campo para eles. */
export function createZoneMotion(kit: MotionKit) {
  const { root, later, animate, effect, remove, fly, absorb, shatter, warpRift, gpu, flare } = kit;
  const scenes = createLeaveEffects(kit);
  /** Para onde a carta vai ao sair do campo: cemitério, exílio, grimório ou mão. */
  function destination(event: PresentationEvent, mine: boolean, seat: Element | null, hand: Point, stage: Point) {
    const piles = (selector: string) => center(seat?.querySelector(`.piles ${selector}`)) ?? center(root.querySelector(`${mine ? '#fMePiles' : '#fOppPiles'} ${selector}`));
    if (event.to === 'Hand') return hand;
    if (event.to === 'Command') return center(commandOf(event, mine, seat)) ?? stage;
    if (event.to === 'Exile') return piles('.exile') ?? piles('.gy') ?? stage;
    if (event.to === 'Library') return piles('.lib') ?? stage;
    return piles('.gy') ?? stage;
  }
  /** O monte de destino em si (para recebê-la com um pulso); na mão não há monte. */
  function pileOf(event: PresentationEvent, mine: boolean, seat: Element | null) {
    const pile = (selector: string) => seat?.querySelector<HTMLElement>(`.piles ${selector}`) ?? root.querySelector<HTMLElement>(`${mine ? '#fMePiles' : '#fOppPiles'} ${selector}`);
    if (event.to === 'Hand') return null;
    if (event.to === 'Command') return commandOf(event, mine, seat);
    if (event.to === 'Exile') return pile('.exile') ?? pile('.gy');
    if (event.to === 'Library') return pile('.lib');
    return pile('.gy');
  }
  /** A carta na zona de comando (o comandante que volta, ou de onde ele é conjurado), ou a zona inteira. */
  function commandOf(event: PresentationEvent, mine: boolean, seat: Element | null) {
    const id = event.card?.id ?? event.sourceId;
    return (id === undefined ? null : root.querySelector<HTMLElement>(`[data-command-card][data-fid="${id}"]`))
      ?? seat?.querySelector<HTMLElement>('.seat-command')
      ?? root.querySelector<HTMLElement>(mine ? '#fCommand:not([hidden])' : '#fOppPiles .duel-command')
      ?? root.querySelector<HTMLElement>(mine ? '#fMeAvatar' : '#fOppAvatar');
  }
  /** De que monte sai uma carta que não estava na mão: cemitério, exílio, grimório ou zona de comando. */
  function zonePoint(zone: string | undefined, event: PresentationEvent, mine: boolean, seat: Element | null, hand: Point, stage: Point) {
    if (!zone || !['Graveyard', 'Exile', 'Library', 'Command'].includes(zone)) return undefined;
    return destination({ ...event, to: zone }, mine, seat, hand, stage);
  }
  /** Reanimar: um anel roxo sobe da carta que voltou do cemitério, e ela brilha por um instante. */
  function reanimate(card: HTMLElement) {
    const at = center(card);
    if (!at || reduced()) return;
    flare(card, '#a46bff', [{ filter: 'brightness(1.5) drop-shadow(0 0 14px #a46bff)' }, { filter: 'none' }], 900);
    // Na camada GPU: anel roxo que se abre e grãos subindo em volta da carta.
    if (gpu.play('arrive', { at, color: '#a46bff', size: Math.max(at.w, at.h) * 1.35 })) { gpu.play('motes', { at, color: '#c9a8ff' }); return; }
    const ring = effect('reanimate-ring', { ...at, w: at.w * 1.35, h: at.h * 1.2 });
    animate(ring, [{ opacity: 0, scale: '.6', translate: '0 10px' }, { opacity: .95, scale: '1', translate: '0 0', offset: .4 }, { opacity: 0, scale: '1.25', translate: '0 -14px' }], 820, 'ease-out');
    later(() => remove(ring), 860);
  }
  /**
   * Saída do campo com um movimento por motivo: destruída racha e se parte em pedaços no lugar, sacrificada vai
   * escurecida, exilada é sugada por um portal em espiral, devolvida voa em arco até o lugar dela no leque. Morrer por
   * dano e o resto voam em arco para o monte certo, que pulsa ao recebê-la.
   */
  function leave(event: PresentationEvent, from: Point, to: Point, end: Point, piece: HTMLElement, duration: number,
    opts: { caption?: HTMLElement; into?: HTMLElement | null; endRot?: number; fade?: boolean } = {}) {
    const { caption, into = null, endRot = 0, fade = true } = opts;
    if (event.to === 'Exile') {
      // A conjurada por dobra volta para o exílio no fim do turno: um rasgo menor no lugar dela.
      if (warpReturn(event)) warpRift(from, .7);
      // Some no lugar, no portal; não precisa atravessar a mesa até a pilha do exílio.
      if (!reduced()) { scenes.vortex(from, piece, duration, caption); return; }
      piece.style.left = `${from.cx}px`; piece.style.top = `${from.cy}px`;
      return;
    }
    // Destruída: a cena inteira acontece no lugar; só a poeira vai até o cemitério.
    if (event.reason === 'destroyed' && !reduced()) { scenes.crumble(from, to, piece, duration, into); return; }
    if (event.reason === 'destroyed') shatter(from);
    // Na camada GPU: o sacrifício solta brasas e fumaça escura no lugar, e o voo deixa um rastro (brasas da
    // sacrificada, brilho da devolvida à mão).
    if (event.reason === 'sacrificed') gpu.play('ash', { at: from });
    const trail = event.reason === 'sacrificed' ? 'ember' : event.to === 'Hand' ? 'sparkle' : undefined;
    if (trail) gpu.play('trail', { from, to, duration, style: trail });
    const tint = event.reason === 'destroyed' ? 'brightness(.7) grayscale(.6)' : event.reason === 'sacrificed' ? 'brightness(.55) sepia(.4)' : '';
    fly(piece, from, to, end, duration, { caption, endRot, fade, tint });
    if (into) later(() => absorb(into), duration * .85);
  }
  return { destination, pileOf, zonePoint, reanimate, leave };
}
