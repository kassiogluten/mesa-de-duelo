// Animações da mesa: compara o antes e o depois de cada jogada e anima o que mudou.
import type { PresentationEvent } from './presentationTimeline';
import { center, createMotionKit, reduced, SETTLE, TAP, turnOf } from './motionKit';
import { createDamageMotion } from './motionDamage';
import { createAbilityMotion } from './motionAbility';
import { createZoneMotion } from './motionZones';
import { createLibraryMotion } from './motionLibrary';
import { createBoardMotion } from './motionBoard';
import { createStageMotion } from './motionStage';
import { createFlightMotion } from './motionFlights';

const KEYED = '[data-fid],[data-peek]';
export interface Motion {
  capture(): void;
  /** `paying`: a cor da mana de cada terreno, enquanto você paga um custo (o terreno que vira solta a mana até o custo). */
  play(options?: { silent?: boolean; semantic?: boolean; paying?: (id: number) => string | undefined }): void;
  present(event: PresentationEvent, options: { you: number; html?: string; label: string; duration: number; calloutDuration?: number; hideDestination?: boolean }): void;
  /** Compra: versos de carta saem do grimório e vão para a mão. `cards` são as cartas novas da sua mão, mostradas ao chegar. */
  drew(actor: number, count: number, options: { you: number; cards: HTMLElement[]; fast: boolean; searched?: boolean }): number[];
  /** Sem passo próprio, junto com a jogada: embaralhar (o grimório se mexe) e marcadores (a carta cresce e o número sobe). */
  quick(event: PresentationEvent, options: { you: number }): void;
  /** Permanentes que mudaram de face no campo (transformar, dia e noite): giram no lugar e mostram a face nova. */
  transformed(ids: number[]): void;
  /** Mão inicial: as cartas saem do grimório uma a uma; num mulligan, a mão anterior volta antes e o grimório embaralha. */
  deal(cards: HTMLElement[], options: { returning: number }): void;
  /** Cartas reveladas numa janela: entram de costas e viram de face, uma depois da outra. */
  revealIn(cards: HTMLElement[]): void;
  /** Fim da partida: o retrato de quem perdeu racha e escurece, o de quem ganhou acende. Devolve quanto dura (0 sem movimento). */
  finale(winners: number[], losers: number[]): number;
  /** Moer: as cartas saem do topo do grimório, viram de face para cima e caem no cemitério, uma depois da outra. */
  milled(event: PresentationEvent, options: { you: number; fast: boolean; face: (card: NonNullable<PresentationEvent['card']>) => string }): void;
  /** Várias permanentes da mesma resolução (fichas, blink em massa): chegam em cascata curta, e cada monte mostra quantas ganhou ("+8"). */
  entered(event: PresentationEvent, options: { you: number; fast: boolean; face: (card: NonNullable<PresentationEvent['card']>) => string; hideDestination?: boolean }): void;
  cancelPresentation(): void;
  /** Mesa nova: limpa os efeitos e, com efeitos completos, prepara a camada GPU (carregada com a mesa ociosa). */
  reset(): void;
  /** A opção "Efeitos" mudou: carrega ou desfaz a camada GPU. */
  effectsChanged(): void;
}

/**
 * Spatial presentation is separate from the board state and can never capture pointer input. Cada família de animação
 * fica no seu módulo (dano, habilidades, montes, grimório, campo, centro da mesa, voos de carta); aqui ficam a foto da
 * mesa antes de cada desenho, o passo de cada carta que mudou de lugar e a escolha de quem apresenta cada evento.
 */
export function createMotion(root: HTMLElement, opts: { notice?(text: string): void } = {}): Motion {
  const kit = createMotionKit(root, opts);
  const { state, animate } = kit;
  const damage = createDamageMotion(kit);
  const abilities = createAbilityMotion(kit);
  const zones = createZoneMotion(kit);
  const library = createLibraryMotion(kit);
  const board = createBoardMotion(kit);
  const stage = createStageMotion(kit);
  const flights = createFlightMotion(kit, zones, abilities.walkerArrive);

  return {
    capture() {
      const cards: typeof state.cards = state.cards = new Map();
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const key = el.dataset.fid ?? el.dataset.peek!;
        if (cards.has(key)) return;
        const at = center(el);
        if (at) cards.set(key, { ...at, el, tapped: !!el.closest('.tapped'), zone: el.parentElement?.closest('[id]')?.id ?? '' });
      });
      const now = performance.now();
      const pile = center(kit.stackPile());
      if (pile) state.stackSpot = { ...pile, seen: now };
      for (const [key, spot] of state.handSpots) if (now - spot.seen > 5000) state.handSpots.delete(key);
      root.querySelectorAll<HTMLElement>('#fHand [data-fid]').forEach(el => {
        const at = center(el);
        if (!at) return;
        state.handSpots.set(el.dataset.fid!, { ...at, w: el.offsetWidth || at.w, h: el.offsetHeight || at.h, rot: turnOf(el), seen: now });
      });
    },
    play(options = {}) {
      if (options.silent || reduced()) { state.primed = true; return; }
      const seen = new Set<string>();
      let untapWave = 0;
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const key = el.dataset.fid ?? el.dataset.peek!;
        if (seen.has(key)) return;
        seen.add(key);
        const at = center(el), before = state.cards.get(key);
        if (!at) return;
        if (before) {
          const zone = el.parentElement?.closest('[id]')?.id ?? '';
          if (options.semantic && zone !== before.zone) return;
          const dx = before.cx - at.cx, dy = before.cy - at.cy;
          const turned = before.tapped !== !!el.closest('.tapped');
          if (Math.abs(dx) + Math.abs(dy) < 2 && !turned) return;
          const slot = el.closest<HTMLElement>('.slot') ?? el;
          if (turned && slot !== el) {
            // Virar tem peso: a mola passa um pouco do ponto e assenta. Desvirar em lote vai em onda, uma carta depois da outra.
            const untapping = before.tapped;
            const tone = !untapping ? options.paying?.(Number(key)) : undefined;
            if (tone) board.manaOrb(el, tone, 90);
            // Virar sem pagar nada: um pouco de poeira na base, na camada GPU (pagando, a mana já sai da carta).
            else if (!untapping) kit.gpu.play('dust', { at });
            animate(slot, [{ translate: `${dx}px ${dy}px`, rotate: untapping ? '90deg' : '-90deg' }, { translate: '0 0', rotate: '0deg' }],
              TAP.duration, TAP.easing, untapping ? Math.min(untapWave++, 12) * 45 : 0);
          } else {
            // Mudou de tamanho também (o campo apertou, a carta foi para outra fileira): cresce ou encolhe junto com o passo.
            const grow = before.w / at.w;
            const sized = Math.abs(grow - 1) > .03 && grow > .3 && grow < 3;
            animate(slot, [{ translate: `${dx}px ${dy}px`, ...(sized ? { scale: String(+grow.toFixed(3)) } : {}) }, { translate: '0 0', ...(sized ? { scale: '1' } : {}) }],
              SETTLE.duration, SETTLE.easing);
          }
        } else if (state.primed && !options.semantic) {
          animate(el.closest<HTMLElement>('.slot') ?? el, [{ opacity: 0, scale: '.9' }, { opacity: 1, scale: '1' }], SETTLE.duration, SETTLE.easing);
        }
      });
      state.primed = true;
    },
    present(event, options) {
      // Nothing here mutates card state, waits on a network reply, or creates a priority stop.
      if (document.hidden || root.hidden) return;
      if (event.type === 'damage') { damage.damage(event, options.duration, options.html); return; }
      // Perder vida já aparece no dano (e pagar vida não é dano); só o ganho tem número próprio.
      if (event.type === 'life-changed') { damage.heal(event); return; }
      if (event.type === 'attackers') { board.attackers(options.label, options.duration); return; }
      if (event.type === 'blockers') { board.blocks(event); return; }
      if (event.type === 'scry') { library.scry(event, options.you); return; }
      if (event.type === 'coin' || event.type === 'die') { stage.chance(event, options.label, options.duration); return; }
      const id = event.card?.id ?? event.sourceId;
      const card = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
      if (event.type === 'attached') { board.attach(event, card); return; }
      if (event.type === 'control-changed') { board.control(event, card, id === undefined ? undefined : state.cards.get(String(id)), options); return; }
      if (event.type === 'turn' || !options.html) return;
      if (event.type === 'ability-activated') { abilities.ability(event, card, options); return; }
      flights.cardFlight(event, card, id, options);
    },
    drew: library.drew,
    milled: library.milled,
    entered: flights.entered,
    quick(event, options) {
      if (document.hidden || root.hidden) return;
      if (event.type === 'shuffle') library.shuffle(library.libraryOf(event.actor, options.you));
      else if (event.type === 'counters') board.counters(event);
    },
    transformed: board.transformed,
    deal: library.deal,
    revealIn: stage.revealIn,
    finale: stage.finale,
    cancelPresentation: kit.clear,
    reset() { kit.clear(); state.cards = new Map(); state.primed = false; kit.gpu.prepare(); },
    effectsChanged() { kit.gpu.refresh(); },
  };
}
