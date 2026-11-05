import { millTiming, type PresentationEvent } from './presentationTimeline';
import { copySleeve } from './sleeves';
import { center, MILL_EASE, reduced, TAP, turnOf, type MotionKit, type Point } from './motionKit';

/** O rótulo da vidência junto ao grimório: quantas ficaram no topo e quantas foram para o fundo. */
export function scryLabel(top: number, bottom: number) {
  return top && bottom ? `${top} no topo · ${bottom} no fundo` : top ? `${top} no topo` : `${bottom} no fundo`;
}

/** O grimório: comprar, moer, embaralhar, vidência e a mão inicial (com a volta das cartas no mulligan). */
export function createLibraryMotion(kit: MotionKit) {
  const { root, state, later, animate, effect, remove, pulse, fly, absorb, hiddenCards } = kit;
  /** O grimório de um jogador (o seu, o do oponente no duelo, ou o do assento no Commander). */
  function libraryOf(actor: number | undefined, you: number) {
    const mine = actor === you;
    const seat = mine || actor === undefined ? null : root.querySelector(`[data-seat-player="${actor}"]`);
    return seat?.querySelector<HTMLElement>('.piles .lib') ?? root.querySelector<HTMLElement>(`${mine ? '#fMePiles' : '#fOppPiles'} .lib`);
  }
  /** Um rótulo curto junto a um monte (acima dele, ou abaixo se o monte está no alto da tela). */
  function pileTag(at: Point, text: string, className: string, ms: number) {
    const below = at.cy - at.h / 2 < 90;
    const tag = effect(`mill-count ${className}${below ? ' below' : ''}`, { ...at, cy: below ? at.cy + at.h / 2 + 4 : at.cy - at.h / 2 - 4, w: 0, h: 0 });
    tag.textContent = text;
    animate(tag, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1.15', offset: .12 }, { opacity: 1, scale: '1', offset: .75 }, { opacity: 0 }], ms);
    later(() => remove(tag), ms);
  }
  /** Embaralhar: o grimório balança e duas metades se abrem para os lados e voltam, como num embaralhar de mesa. */
  function shuffle(libEl: HTMLElement | null) {
    const lib = center(libEl);
    if (!libEl || !lib || reduced()) return;
    animate(libEl, [{ rotate: '0deg' }, { rotate: '-5deg', offset: .2 }, { rotate: '4deg', offset: .45 }, { rotate: '-2deg', offset: .7 }, { rotate: '0deg' }], 460, 'ease-in-out');
    for (const side of [-1, 1]) {
      const half = effect('presentation-piece shuffle-ghost', lib, '<div class="back"></div>');
      copySleeve(half, libEl);
      animate(half, [{ translate: '0 0', rotate: '0deg' }, { translate: `${side * lib.w * .55}px -4px`, rotate: `${side * 8}deg`, offset: .4 }, { translate: `${side * lib.w * .2}px -2px`, rotate: `${side * -4}deg`, offset: .7 }, { translate: '0 0', rotate: '0deg' }], 480, 'cubic-bezier(.4,0,.2,1)');
      later(() => remove(half), 500);
    }
  }
  /** Vidência: as cartas sobem do grimório em leque; as do topo voltam por cima e as do fundo deslizam por baixo do monte. */
  function scry(event: PresentationEvent, you: number) {
    const libEl = libraryOf(event.actor, you), lib = center(libEl);
    if (!lib) return;
    const top = event.top ?? 0, bottom = event.bottom ?? 0, n = Math.min(5, top + bottom);
    pileTag(lib, scryLabel(top, bottom), 'scry-count', 1500);
    if (reduced() || !n) { pulse(libEl); return; }
    const w = Math.max(lib.w, 56) * 1.15, h = w * 1.4;
    const inward = lib.cy < innerHeight / 2 ? 1 : -1;
    const topShown = Math.min(top, n);
    for (let i = 0; i < n; i++) {
      const toBottom = i >= topShown;
      const spread = (i - (n - 1) / 2) * w * .6;
      const ghost = effect(`presentation-piece draw-ghost scry-ghost ${toBottom ? 'to-bottom' : 'to-top'}`, { ...lib, w, h }, '<div class="back"></div>');
      copySleeve(ghost, libEl);
      const shrink = `${lib.w / w} ${lib.h / h}`, lift = inward * (h * .85 + 12);
      animate(ghost, [
        { translate: '0 0', scale: shrink, rotate: '0deg', opacity: .9 },
        { translate: `${spread}px ${lift}px`, scale: '1', rotate: `${(i - (n - 1) / 2) * 4}deg`, opacity: 1, offset: .35 },
        { translate: `${spread}px ${lift}px`, scale: '1', rotate: `${(i - (n - 1) / 2) * 4}deg`, opacity: 1, offset: .6 },
        // O topo volta por cima; o fundo passa por baixo do monte e some atrás dele.
        toBottom ? { translate: `0 ${-inward * lib.h * .35}px`, scale: shrink, rotate: '0deg', opacity: 0 } : { translate: '0 0', scale: shrink, rotate: '0deg', opacity: 1 }],
        940, 'cubic-bezier(.3,.7,.3,1)', i * 45);
      later(() => remove(ghost), 940 + i * 45);
    }
    later(() => absorb(libEl), 900);
  }
  function drew(actor: number, count: number, options: { you: number; cards: HTMLElement[]; fast: boolean; searched?: boolean }): number[] {
    if (document.hidden || root.hidden || count < 1) return [];
    const mine = actor === options.you;
    const seat = mine ? null : root.querySelector(`[data-seat-player="${actor}"]`);
    const libEl = seat?.querySelector('.piles .lib') ?? root.querySelector(`${mine ? '#fMePiles' : '#fOppPiles'} .lib`);
    const library = (seat ? center(seat.querySelector('.piles .lib')) : undefined) ?? center(root.querySelector(`${mine ? '#fMePiles' : '#fOppPiles'} .lib`));
    const handPoint = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? center(root.querySelector(mine ? '#fMeAvatar' : '#fOppAvatar'));
    // A mão pode ter sido redesenhada durante o voo: revela a carta que estiver lá agora, pelo id.
    const reveal = (el: HTMLElement) => (root.querySelector<HTMLElement>(`#fHand [data-fid="${el.dataset.fid}"]`) ?? el).classList.remove('incoming');
    if (!library || !handPoint || reduced()) { options.cards.forEach(reveal); return options.cards.map(() => 0); }
    // Até 7 voos; numa compra grande o resto chega junto com o último.
    const flights = Math.min(count, 7), gap = options.fast ? 60 : 110, travel = options.fast ? 300 : 460;
    // Busca no grimório (tutor): a carta sai com um brilho dourado e uma lupa de luz se abre no grimório.
    if (options.searched) {
      const ring = effect('search-ring', { ...library, w: library.w * 1.5, h: library.w * 1.5 });
      animate(ring, [{ opacity: 0, scale: '.5' }, { opacity: .95, scale: '1', offset: .4 }, { opacity: 0, scale: '1.3' }], 640, 'ease-out');
      later(() => remove(ring), 680);
    }
    for (let i = 0; i < flights; i++) {
      const card = options.cards[i];
      const to = center(card) ?? handPoint;
      // O tamanho da carta sem o giro do leque (a caixa de uma carta girada é maior que ela).
      const size = card ? { w: card.offsetWidth || to.w, h: card.offsetHeight || to.h } : { w: library.w, h: library.h };
      const ghost = effect(`presentation-piece draw-ghost${options.searched ? ' search-ghost' : ''}`, { ...to, ...size }, '<div class="back"></div>');
      copySleeve(ghost, libEl);
      // Sobe do grimório em arco, inclinada e com sombra, e assenta no lugar dela no leque, já no giro dele; a sua carta
      // vira de face para cima ao chegar.
      fly(ghost, library, to, { ...to, ...size }, travel, { delay: i * gap, endRot: card ? turnOf(card) : 0, tint: options.searched ? 'drop-shadow(0 0 10px #f2b54c)' : '' });
      later(() => {
        remove(ghost);
        if (card) { reveal(card); animate(root.querySelector<HTMLElement>(`#fHand [data-fid="${card.dataset.fid}"]`) ?? card, [{ rotate: 'y 90deg', scale: '1.06' }, { rotate: 'y 0deg', scale: '1' }], TAP.duration, TAP.easing); }
      }, travel + i * gap);
    }
    // Cartas além dos voos aparecem com a última.
    for (const card of options.cards.slice(flights)) later(() => reveal(card), travel + (flights - 1) * gap);
    return options.cards.map((_, i) => travel + Math.min(i, flights - 1) * gap);
  }
  function milled(event: PresentationEvent, options: { you: number; fast: boolean; face: (card: NonNullable<PresentationEvent['card']>) => string }) {
    if (document.hidden || root.hidden) return;
    const cards = event.milled ?? (event.card ? [event.card] : []);
    const mine = event.actor === options.you;
    const seat = mine ? null : root.querySelector(`[data-seat-player="${event.actor}"]`);
    const piles = seat?.querySelector('.piles') ?? root.querySelector(mine ? '#fMePiles' : '#fOppPiles');
    // A mesa pode ser redesenhada durante os voos: o cemitério é procurado de novo na hora do destaque.
    const pile = () => (seat?.isConnected ? seat : null)?.querySelector<HTMLElement>('.piles .gy:not(.exile)')
      ?? root.querySelector<HTMLElement>(mine ? '#fMePiles .gy:not(.exile)' : seat ? `[data-seat-player="${event.actor}"] .piles .gy:not(.exile)` : '#fOppPiles .gy:not(.exile)');
    const libEl = piles?.querySelector<HTMLElement>('.lib') ?? null, gyEl = pile();
    const library = center(libEl), grave = center(gyEl);
    if (!library || !grave || !cards.length) { pulse(gyEl); return; }
    const { flights, gap, travel } = millTiming(cards.length, options.fast);
    const total = travel + (flights - 1) * gap;
    // Quantas saíram, junto ao grimório (some sozinho; com "reduzir movimento" fica parado e some do mesmo jeito).
    const below = library.cy - library.h / 2 < 90;
    const count = effect(`mill-count${below ? ' below' : ''}`, { ...library, cy: below ? library.cy + library.h / 2 + 4 : library.cy - library.h / 2 - 4, w: 0, h: 0 });
    count.textContent = `−${cards.length}`;
    animate(count, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1.15', offset: .12 }, { opacity: 1, scale: '1', offset: .75 }, { opacity: 0 }], Math.max(1100, total + 500));
    later(() => remove(count), Math.max(1100, total + 500));
    if (reduced()) { pulse(gyEl); return; }
    // A carta voa num tamanho legível e encolhe ao cair na pilha; com muitas, os voos se abrem em leque.
    const w = Math.max(grave.w, 64) * 1.25, h = w * 1.4;
    for (const [i, card] of cards.slice(0, flights).entries()) {
      const spread = flights >= 6 ? (i - (flights - 1) / 2) * 7 : 0;
      const ghost = effect('presentation-piece mill-ghost', { ...grave, w, h }, `${options.face(card)}<div class="back"></div>`);
      copySleeve(ghost, libEl);
      const dx = library.cx - grave.cx, dy = library.cy - grave.cy, delay = i * gap;
      // O arco vai para dentro da mesa (o grimório fica junto da borda de cima ou de baixo).
      const lift = Math.min(90, h * .7) * (grave.cy < window.innerHeight / 2 ? -1 : 1);
      // Sobe do grimório de costas, fica de lado no alto do arco (a virada) e desce de face para cima no cemitério.
      animate(ghost, [
        { translate: `${dx}px ${dy}px`, scale: `${library.w / w} ${library.h / h}`, rotate: '0deg', opacity: .95 },
        { translate: `${dx * .55 + spread}px ${dy * .55 - lift}px`, scale: '.06 1.05', rotate: `${spread * .4}deg`, offset: .45 },
        { translate: `${dx * .4 + spread}px ${dy * .4 - lift}px`, scale: '1.05', rotate: `${spread * .4}deg`, offset: .6 },
        { translate: '0 0', scale: `${grave.w / w} ${grave.h / h}`, rotate: '0deg', opacity: 1 }], travel, MILL_EASE, delay);
      const back = ghost.querySelector<HTMLElement>('.back');
      if (back) animate(back, [{ opacity: 1 }, { opacity: 1, offset: .44 }, { opacity: 0, offset: .46 }, { opacity: 0 }], travel, MILL_EASE, delay);
      later(() => { remove(ghost); if (i === flights - 1) pulse(pile()); }, travel + delay);
    }
  }
  function deal(dealt: HTMLElement[], options: { returning: number }) {
    if (document.hidden || root.hidden || reduced() || !dealt.length) return;
    const libEl = root.querySelector<HTMLElement>('#fMePiles .lib'), library = center(libEl);
    if (!library) return;
    const { handSpots } = state;
    // Mulligan: a mão anterior volta ao grimório (de onde as cartas estavam no leque), e ele embaralha.
    const back = [...handSpots.entries()].filter(([key]) => !dealt.some(el => el.dataset.fid === key)).slice(0, options.returning ? 7 : 0);
    back.forEach(([key, spot], i) => {
      handSpots.delete(key);
      const ghost = effect('presentation-piece draw-ghost deal-ghost', library, '<div class="back"></div>');
      copySleeve(ghost, libEl);
      fly(ghost, spot, library, library, 380, { delay: i * 40, fade: true });
      later(() => remove(ghost), 380 + i * 40);
    });
    const wait = back.length ? 380 + (back.length - 1) * 40 + 80 : 0;
    if (back.length) later(() => shuffle(libEl), wait - 60);
    const start = wait + (back.length ? 420 : 0);
    dealt.forEach((card, i) => {
      const to = center(card);
      if (!to) return;
      const size = { w: card.offsetWidth || to.w, h: card.offsetHeight || to.h };
      card.style.opacity = '0'; hiddenCards.add(card);
      const ghost = effect('presentation-piece draw-ghost deal-ghost', { ...to, ...size }, '<div class="back"></div>');
      copySleeve(ghost, libEl);
      ghost.style.opacity = '0';
      later(() => { ghost.style.opacity = ''; }, start + i * 90);
      fly(ghost, library, to, { ...to, ...size }, 420, { delay: start + i * 90, endRot: turnOf(card) });
      later(() => {
        remove(ghost);
        const now = root.querySelector<HTMLElement>(`#fHand [data-fid="${card.dataset.fid}"]`) ?? card;
        if (hiddenCards.delete(card)) card.style.opacity = '';
        now.style.opacity = '';
        animate(now, [{ rotate: 'y 90deg', scale: '1.06' }, { rotate: 'y 0deg', scale: '1' }], TAP.duration, TAP.easing);
      }, start + 420 + i * 90);
    });
  }
  return { libraryOf, shuffle, scry, drew, milled, deal };
}
