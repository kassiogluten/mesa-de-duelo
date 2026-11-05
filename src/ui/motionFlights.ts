// Animações de cartas mudando de zona: conjurar, resolver, anular, entrar e sair do campo.
import { entryTiming, type PresentationEvent } from './presentationTimeline';
import { walkerArrives } from './planeswalkerEffects';
import { warpCast } from './warpEffects';
import { center, LANDING, reduced, TAP, turnOf, type MotionKit, type Point } from './motionKit';
import { zoneGlow, type createZoneMotion } from './motionZones';

type Face = (card: NonNullable<PresentationEvent['card']>) => string;

/**
 * Cartas mudando de zona: conjurar até a pilha, resolver e anular saindo dela, entrar no campo, sair dele, descartar,
 * e a cascata de várias permanentes da mesma resolução.
 */
export function createFlightMotion(kit: MotionKit, zones: ReturnType<typeof createZoneMotion>, walkerArrive: (card: HTMLElement, event: PresentationEvent) => void) {
  const { root, state, later, animate, effect, remove, pulse, floatNumber, fly, absorb, land, ripple, shatter, warpRift, hiddenCards, recentStack, stackPile } = kit;
  const { destination, pileOf, zonePoint, reanimate, leave } = zones;
  function cardFlight(event: PresentationEvent, card: HTMLElement | null, id: number | undefined, options: { you: number; html?: string; label: string; duration: number; hideDestination?: boolean }) {
    if (event.type === 'resolved' && !event.trigger && card && id !== undefined && performance.now() - (state.landedAt.get(String(id)) ?? -Infinity) < 4000) { pulse(card); return; }
    const old = id === undefined ? undefined : state.cards.get(String(id));
    const stage = kit.stage();
    const mine = event.actor === options.you;
    const seat = !mine && event.actor !== undefined ? root.querySelector(`[data-seat-player="${event.actor}"]`) : null;
    const hand = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? center(root.querySelector(mine ? '#fMeAvatar' : '#fOppAvatar')) ?? stage;
    const target = center(card);
    // Saindo da sua mão: do lugar exato da carta no leque, com o tamanho e o giro dela.
    const spot = id !== undefined && (event.type === 'land-played' || event.from === 'Hand') ? state.handSpots.get(String(id)) : undefined;
    // Conjurar do cemitério, do exílio ou da zona de comando: sai do monte, com o brilho dele.
    const zoneFrom = !spot && !old ? zonePoint(event.from, event, mine, seat, hand, stage) : undefined;
    let from: Point = spot ?? old ?? zoneFrom ?? hand, to: Point = stage;
    // Conjurar: a mágica vai até a carta do topo da pilha, no canto; com a pilha recolhida, fica no centro da mesa.
    const pileEl = event.type === 'spell-cast' ? stackPile() : null, pile = center(pileEl);
    if (pile) to = pile;
    // Resolver e anular saem da pilha, no canto; o monte que recebe a carta pulsa quando ela chega.
    const fromStack = recentStack() ?? stage;
    let into: HTMLElement | null = null, handBack: HTMLElement | null = null;
    if (event.type === 'land-played' || event.type === 'entered') {
      // Reanimar, buscar no grimório e voltar da zona de comando: a carta sai do monte de onde veio.
      from = event.from === 'Stack' ? fromStack : spot ?? (event.from !== 'Exile' ? zonePoint(event.from, event, mine, seat, hand, stage) : undefined) ?? hand;
      to = target ?? center(seat?.querySelector('.lands')) ?? center(root.querySelector(mine ? '#fMeLands' : '#fOppLands')) ?? stage;
    } else if (event.type === 'resolved') {
      from = fromStack;
      const targetId = event.targets?.players?.[0];
      const targetCard = event.targets?.cards?.[0];
      // Habilidade ou gatilho de uma permanente: volta para a carta que a gerou. Mágica: cai no cemitério (ou para onde foi).
      if (!target && event.to && !['Battlefield', 'Stack'].includes(event.to)) { to = destination(event, mine, seat, hand, stage); into = pileOf(event, mine, seat); }
      else to = target ?? center(targetId !== undefined ? root.querySelector(`.avatar[data-pid="${targetId}"]`) : targetCard !== undefined ? root.querySelector(`.field [data-fid="${targetCard}"]`) : null) ?? stage;
    } else if (event.type === 'left') {
      from = old ?? target ?? stage;
      to = destination(event, mine, seat, hand, stage);
      into = pileOf(event, mine, seat);
      // Devolvida à sua mão: voa até o lugar dela no leque, já no giro dele, e a carta da mão aparece quando ela chega.
      const back = event.to === 'Hand' && mine && id !== undefined ? root.querySelector<HTMLElement>(`#fHand [data-fid="${id}"]`) : null, at = center(back);
      if (back && at) { to = { ...at, w: back.offsetWidth || at.w, h: back.offsetHeight || at.h }; handBack = back; }
    } else if (event.type === 'discard') {
      // Sai do lugar dela na mão (ou da mão do oponente), já de face para cima, e cai no cemitério.
      from = spot ?? old ?? hand;
      to = destination({ ...event, to: 'Graveyard' }, mine, seat, hand, stage);
      into = pileOf({ ...event, to: 'Graveyard' }, mine, seat);
    } else if (event.type === 'countered') {
      from = fromStack;
      to = destination({ ...event, to: 'Graveyard' }, mine, seat, hand, stage);
      into = pileOf({ ...event, to: 'Graveyard' }, mine, seat);
    }
    if (event.type === 'entered' && event.from === 'Exile') from = to; // Blink: volta no mesmo lugar, em luz.
    // Pousa no campo (terreno, ou permanente que entrou vinda da pilha ou da mão): termina no tamanho da carta no campo, sem salto ao trocar.
    const landing = !!card && !!target && (event.type === 'land-played' || (event.type === 'entered' && event.from !== 'Exile'));
    const settled = event.type === 'resolved' || event.type === 'countered';
    // Em arco até um monte, uma carta ou o leque: termina no tamanho de onde entra.
    const arcs = settled || event.type === 'discard' || (event.type === 'left' && event.to !== 'Exile');
    // Keep large cards readable while travelling, independent of a tiny hand or pile's dimensions. Saindo da pilha, a carta
    // já começa grande (no tamanho dela) e termina no tamanho de onde entra.
    const end = landing ? target! : pile ?? (arcs && to !== stage && to !== hand ? to : { ...to, w: stage.w, h: stage.h });
    const piece = effect('presentation-piece', end, options.html);
    const caption = document.createElement('span');
    caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
    const disappearing = !landing && ['left', 'countered', 'resolved', 'discard'].includes(event.type);
    if (event.type === 'left') {
      leave(event, from, to, end, piece, options.duration, { caption, into, endRot: handBack ? turnOf(handBack) : 0, fade: !handBack });
      // Comandante voltando à zona de comando: chega com uma onda dourada.
      if (event.to === 'Command' && into) { const zone = into; later(() => ripple(center(zone)), options.duration * .85); }
      if (handBack && options.hideDestination && !reduced()) { handBack.style.opacity = '0'; hiddenCards.add(handBack); }
    } else if (event.type === 'discard') {
      fly(piece, from === hand ? { ...hand, w: end.w * .7, h: end.h * .7 } : from, to, end, options.duration, { caption, fade: true });
      if (into) { const pileEl = into; later(() => absorb(pileEl), options.duration * .85); }
    } else if (landing || event.type === 'spell-cast') {
      if (landing) state.landedAt.set(String(id), performance.now());
      // Sem o lugar no leque (mão do oponente, mão longa), sai do centro da mão no tamanho de uma carta.
      fly(piece, from === hand ? { ...hand, w: end.w * .7, h: end.h * .7 } : from, to, end, options.duration, { caption, tint: zoneGlow(event.from) });
      // Dobra: a carta chega à pilha rasgando o espaço.
      if (warpCast(event)) { const at = to; later(() => warpRift(at, 1), options.duration * .7); }
      // Comandante conjurado da zona de comando: a taxa sobe 2 para a próxima vez.
      if (event.type === 'spell-cast' && event.from === 'Command') floatNumber(from, '+2', 'tax', ['Taxa de comandante']);
    } else if (settled) {
      // Anulada: racha na pilha e cai apagada no cemitério. Resolvida: entra no cemitério, ou na carta que a gerou.
      const countered = event.type === 'countered';
      if (countered && from !== stage) shatter(from);
      fly(piece, from, to, end, options.duration, { caption, fade: true, tint: countered ? 'grayscale(.85) brightness(.7)' : '' });
      if (into) { const pileEl = into; later(() => absorb(pileEl), options.duration * .85); }
    }
    else if (event.type === 'entered' && event.from === 'Exile') {
      const ring = effect('exile-ring', { ...to, w: end.w * 1.3, h: end.w * 1.3 });
      animate(ring, [{ opacity: 0, scale: '1.3' }, { opacity: .9, scale: '1', offset: .5 }, { opacity: 0, scale: '.8' }], options.duration);
      later(() => remove(ring), options.duration);
      animate(piece, [{ opacity: 0, scale: '1.1', filter: 'brightness(3) blur(3px)' }, { opacity: .9, scale: '1.03', filter: 'brightness(2) saturate(.4)', offset: .5 }, { opacity: 1, scale: '1', filter: 'none' }], options.duration);
    } else animate(piece, [
      { translate: `${from.cx - to.cx}px ${from.cy - to.cy}px`, scale: '.92', opacity: .8 },
      { translate: '0 -8px', scale: '1.02', opacity: 1, offset: .58 },
      { translate: '0 0', scale: '1', opacity: disappearing ? .1 : 1 },
    ], options.duration);
    if (target && card) {
      pulse(card);
      if (options.hideDestination && !reduced() && landing) { card.style.opacity = '0'; hiddenCards.add(card); }
    }
    // A pilha já mostra a mágica: ela some até a carta que voa chegar, para não aparecer duas vezes.
    if (pileEl && options.hideDestination && !reduced()) { pileEl.style.visibility = 'hidden'; hiddenCards.add(pileEl); }
    later(() => {
      remove(piece);
      if (card && hiddenCards.delete(card)) card.style.opacity = '';
      if (pileEl && hiddenCards.delete(pileEl)) pileEl.style.visibility = '';
      if (handBack && hiddenCards.delete(handBack)) { handBack.style.opacity = ''; animate(handBack, [{ scale: '1.08' }, { scale: '1' }], TAP.duration, TAP.easing); }
      // Terreno ou permanente chegando ao campo: pousa com mola; fichas surgem com um brilho.
      if (id !== undefined && landing) {
        const landed = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
        if (landed) land(landed);
        if (landed && event.card?.token) animate(landed, [{ filter: 'brightness(1.8) drop-shadow(0 0 10px #fff)' }, { filter: 'none' }], 520, 'ease-out');
        if (landed && walkerArrives(event)) walkerArrive(landed, event);
        if (landed && event.from === 'Graveyard') reanimate(landed);
      }
    }, options.duration);
  }
  function entered(event: PresentationEvent, options: { you: number; fast: boolean; face: Face; hideDestination?: boolean }) {
    if (document.hidden || root.hidden) return;
    const cards = event.entries ?? (event.card ? [event.card] : []);
    if (!cards.length) return;
    const mine = event.actor === options.you;
    const seat = !mine && event.actor !== undefined ? root.querySelector(`[data-seat-player="${event.actor}"]`) : null;
    const stage = kit.stage();
    const hand = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? stage;
    // Fichas (sem origem) e cartas que voltam do exílio surgem no próprio lugar; as outras vêm de onde estavam.
    const origin = !event.from || event.from === 'Exile' ? null : event.from === 'Stack' ? recentStack() ?? stage : event.from === 'Hand' ? hand
      : destination({ ...event, to: event.from }, mine, seat, hand, stage);
    const { flights, gap, travel } = entryTiming(cards.length, options.fast || !!event.repeat);
    const total = travel + (flights - 1) * gap;
    // Cada monte de cartas iguais recebe as suas: "+8" em cima do monte, que cresce conforme elas chegam.
    const piles = new Map<HTMLElement, number>();
    cards.forEach((card, i) => {
      const el = root.querySelector<HTMLElement>(`.field [data-fid="${card.id}"]`);
      const pile = el?.closest<HTMLElement>('.stack') ?? el;
      // Some a carta inteira, com a moldura e a lupa, até a ficha chegar: o monte cresce conforme elas pousam. É pela
      // visibilidade, porque a animação de entrada da mesa mexe na opacidade.
      const slot = el?.closest<HTMLElement>('.slot') ?? el;
      if (pile) piles.set(pile, (piles.get(pile) ?? 0) + 1);
      const delay = Math.min(i, flights - 1) * gap;
      if (slot && options.hideDestination && !reduced()) { slot.style.visibility = 'hidden'; hiddenCards.add(slot); }
      const to = center(el);
      if (i < flights && to && !reduced()) {
        const piece = effect('presentation-piece', to, options.face(card));
        // Fichas surgem no lugar com uma mola (crescem, passam um pouco e assentam); as outras vêm em arco de onde estavam.
        if (!origin) animate(piece, [
          { opacity: 0, scale: '.5', filter: event.from === 'Exile' ? 'brightness(3) blur(3px)' : 'brightness(2.4) blur(2px)' },
          { opacity: 1, scale: '1', filter: 'none' }], travel, LANDING.easing, delay);
        // Da mão (a área inteira, sem a carta), sai no tamanho de uma carta.
        else fly(piece, origin === hand ? { ...hand, w: to.w * .7, h: to.h * .7 } : origin, to, to, travel, { delay });
        later(() => remove(piece), travel + delay);
      }
      later(() => {
        // A mesa pode ter sido redesenhada durante a cascata: a carta é procurada de novo pelo id.
        if (slot && hiddenCards.delete(slot)) slot.style.visibility = '';
        const landed = root.querySelector<HTMLElement>(`.field [data-fid="${card.id}"]`);
        // Cada uma assenta com mola; a onda dourada fica para o monte inteiro, no fim.
        if (landed && origin) land(landed, false);
        if (landed && event.from === 'Graveyard') reanimate(landed);
        if (landed && card.token) animate(landed, [{ filter: 'brightness(1.8) drop-shadow(0 0 10px #fff)' }, { filter: 'none' }], 520, 'ease-out');
      }, reduced() ? 0 : travel + delay);
    });
    for (const [pile, n] of piles) {
      later(() => { pulse(pile); ripple(center(pile)); }, reduced() ? 0 : total);
      const at = center(pile);
      if (n < 2 || !at) continue;
      // Acima do monte e das fichas que ainda estão chegando (a mola as faz passar um pouco do tamanho).
      const count = effect('entry-count', { ...at, cy: at.cy - at.h * .62 - 6, w: 0, h: 0 });
      count.textContent = `+${n}`;
      // Linear: o número fica inteiro durante a cascata e só some depois que a última ficha pousa.
      animate(count, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1.15', offset: .12 }, { opacity: 1, scale: '1', offset: .75 }, { opacity: 0 }], Math.max(1100, total + 500), 'linear');
      later(() => remove(count), Math.max(1100, total + 500));
    }
  }
  return { cardFlight, entered };
}
