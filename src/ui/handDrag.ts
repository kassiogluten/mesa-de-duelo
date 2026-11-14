// Arrastar cartas da mão: soltar no campo para jogar e reordenar a mão, com a carta em perspectiva (deita ao chegar no campo e inclina para onde vai).
import type { FState } from '../forge/client';

export interface HandDragIntent { id: number; gen: number; x: number; y: number }
export interface DropBounds { left: number; right: number; top: number; bottom: number }
export const DRAG_THRESHOLD = 9;

/** A drag begins only a currently legal hand, exile, graveyard or library-top play; Forge owns payment and targets. */
export function canDragHandCard(state: FState | null | undefined, id: number, gen: number) {
  return !!state && !!state.input.priority && state.input.ok.enabled && state.input.gen === gen && !state.gameOver && !state.question && !state.sideboarding &&
    !state.input.paying && !state.input.targeting && !state.input.suspendCast &&
    (!!state.players.find(p => p.id === state.you)?.hand.some(card => card.id === id) ||
      (!!state.playableExile?.includes(id) && state.players.some(p => p.exile.some(card => card.id === id && !card.faceDown))) ||
      state.players.some(p => p.graveyard.some(card => card.id === id) || p.libraryTop?.id === id)) &&
    (!!state.input.actionable?.includes(id) || !!state.castable?.includes(id));
}
export function handDropAction(state: FState | null | undefined, intent: HandDragIntent, x: number, y: number, bounds: DropBounds | null) {
  if (!bounds || !canDragHandCard(state, intent.id, intent.gen) || Math.hypot(x - intent.x, y - intent.y) < DRAG_THRESHOLD ||
    x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  return { type: 'card' as const, id: intent.id, gen: intent.gen };
}

/**
 * A pose da carta arrastada. Pela posição: `rise` vai de 0 (na mão) a 1 (no meio do seu campo), e ela deita para trás
 * conforme chega ao campo, como se fosse pousar, e encolhe um pouco. Pela velocidade do ponteiro (px por ms): por cima
 * disso, inclina para o lado em que vai, como se tivesse peso (para a direita, a borda direita afunda; para cima, a de
 * cima), com teto para não virar de lado.
 */
export function dragTilt(vx: number, vy: number, rise = 0) {
  const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
  const lay = 40 * Math.max(0, Math.min(1, rise));
  return { rx: lay + clamp(-vy * 14, 15), ry: clamp(vx * 17, 18), scale: 1.08 - .08 * Math.max(0, Math.min(1, rise)) };
}

/*
 * Ordem da mão escolhida pelo jogador. Fica só na partida, na memória da mesa: o Forge não sabe dela.
 */

/** Mantém a ordem salva das cartas que continuam na mão; as que chegaram entram no fim, na ordem do Forge. */
export function arrangeHand(saved: readonly number[], ids: readonly number[]): number[] {
  const present = new Set(ids);
  const kept = saved.filter((id, i) => present.has(id) && saved.indexOf(id) === i);
  const known = new Set(kept);
  return [...kept, ...ids.filter(id => !known.has(id))];
}

/** Leva a carta para a posição `to` (contada sem ela); devolve null quando nada muda. */
export function moveInHand(order: readonly number[], id: number, to: number): number[] | null {
  const from = order.indexOf(id);
  if (from < 0) return null;
  const target = Math.max(0, Math.min(order.length - 1, Math.round(to)));
  if (target === from) return null;
  const next = order.filter(x => x !== id);
  next.splice(target, 0, id);
  return next;
}

/** Onde a carta cai ao soltar em `x`: quantas das outras cartas têm o centro antes do ponteiro. */
export function handDropIndex(centers: readonly number[], from: number, x: number): number {
  return centers.filter((c, i) => i !== from && c < x).length;
}

/**
 * Quanto cada carta anda durante o arrasto, a partir da borda esquerda de cada posição (`lefts`): a arrastada
 * vai para o destino e as vizinhas entre a origem e o destino andam uma casa, abrindo o espaço.
 */
export function handSlotShift(lefts: readonly number[], from: number, to: number, k: number): number {
  // Fora da lista dá NaN, como a conta com undefined sempre deu.
  const at = (i: number) => lefts[i] ?? NaN;
  if (k === from) return at(to) - at(from);
  if (from < to && k > from && k <= to) return at(k - 1) - at(k);
  if (to < from && k >= to && k < from) return at(k + 1) - at(k);
  return 0;
}

/** Dentro da faixa da mão, soltar reorganiza em vez de jogar; acima dela fica o campo, onde soltar joga. */
export function insideHand(bounds: DropBounds | null, x: number, y: number) {
  return !!bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/** A inclinação da carta arrastada: a face dela, o último ponto e a velocidade do ponteiro, a pose atual e o quadro pedido. */
interface Tilt {
  face: HTMLElement; ghost: HTMLElement; x: number; y: number; at: number; vx: number; vy: number; rx: number; ry: number; scale: number; frame: number;
  /** Altura (y) de onde a carta saiu e do meio do seu campo: a régua do `rise`. */
  fromY: number; fieldY: number;
}
interface Reorder { slots: HTMLElement[]; from: number; lefts: number[]; centers: number[]; to: number; bounds: DropBounds }

export function attachHandDrag(root: HTMLElement, options: {
  state(): FState | null | undefined;
  /** Pode reorganizar a própria mão agora (a mão está à vista e a mesa conectada). */
  canReorder(): boolean;
  beforeDrag(): void;
  play(action: { type: 'card'; id: number; gen: number }): void;
  reorder(id: number, to: number): void;
}) {
  let drag: (HandDragIntent & { pointer: number; source: HTMLElement; ghost: HTMLElement | null; sortable: boolean; order: Reorder | null; tilt: Tilt | null }) | null = null;
  let suppressUntil = 0;
  const hand = () => root.querySelector<HTMLElement>('#fHand');
  function cancel() {
    if (!drag) return;
    if (drag.tilt) cancelAnimationFrame(drag.tilt.frame);
    if (drag.ghost) suppressUntil = performance.now() + 500;
    drag.ghost?.remove(); drag.source.classList.remove('drag-source');
    drag.order?.slots.forEach(slot => { slot.style.transform = ''; });
    hand()?.classList.remove('reordering');
    try { if (root.hasPointerCapture(drag.pointer)) root.releasePointerCapture(drag.pointer); } catch { /* Pointer already released. */ }
    root.querySelector('.arena')?.classList.remove('dragging-hand');
    drag = null;
  }
  /** As cartas da mão (sem as de fora, como as do cemitério), com a posição de cada uma no começo do arrasto. */
  function startReorder(source: HTMLElement): Reorder | null {
    const el = hand();
    const slots = [...(el?.querySelectorAll<HTMLElement>('.hand-slot') ?? [])].filter(slot => slot.querySelector('.hcard[data-fid]:not(.outside)'));
    const from = slots.indexOf(source.closest<HTMLElement>('.hand-slot')!);
    if (!el || from < 0 || slots.length < 2) return null;
    const rects = slots.map(slot => slot.getBoundingClientRect());
    const box = el.getBoundingClientRect();
    el.classList.add('reordering');
    return { slots, from, to: from, lefts: rects.map(r => r.left), centers: rects.map(r => r.left + r.width / 2),
      bounds: { left: box.left, right: box.right, top: Math.min(box.top, ...rects.map(r => r.top)), bottom: box.bottom } };
  }
  function preview(order: Reorder, to: number) {
    if (order.to === to) return;
    order.to = to;
    order.slots.forEach((slot, k) => {
      const dx = handSlotShift(order.lefts, order.from, to, k);
      slot.style.transform = dx ? `translateX(${dx}px)` : '';
    });
  }
  root.addEventListener('pointerdown', e => {
    const source = (e.target as HTMLElement).closest<HTMLElement>('#fHand .hcard[data-fid], #fExileShelf .exile-card[data-fid]');
    if (!source || e.button !== 0 || !e.isPrimary) return;
    const id = Number(source.dataset.fid), gen = Number(source.dataset.gen);
    const sortable = source.matches('#fHand .hcard:not(.outside)') && options.canReorder();
    if (!sortable && !canDragHandCard(options.state(), id, gen)) return;
    drag = { id, gen, x: e.clientX, y: e.clientY, pointer: e.pointerId, source, ghost: null, sortable, order: null, tilt: null };
  });
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const playable = canDragHandCard(options.state(), drag.id, drag.gen);
    if (!drag.source.isConnected || (!drag.sortable && !playable)) { cancel(); return; }
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
    if (!drag.ghost) {
      options.beforeDrag();
      root.setPointerCapture(e.pointerId);
      const bounds = drag.source.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'hand-drag-ghost'; ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${Math.min(150, bounds.width)}px`;
      ghost.style.setProperty('--fw', `${Math.min(150, bounds.width)}px`);
      ghost.innerHTML = drag.source.querySelector('.face')?.outerHTML ?? '';
      root.querySelector('.arena')?.append(ghost);
      if (drag.sortable) drag.order = startReorder(drag.source);
      drag.source.classList.add('drag-source'); drag.ghost = ghost;
      // Com "reduzir movimento", a carta fica reta, como antes.
      const face = ghost.querySelector<HTMLElement>('.face');
      if (face && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const field = root.querySelector('.field.me')?.getBoundingClientRect();
        const fromY = bounds.top + bounds.height / 2;
        drag.tilt = { face, ghost, x: e.clientX, y: e.clientY, at: performance.now(), vx: 0, vy: 0, rx: 0, ry: 0, scale: 1.08, frame: 0,
          fromY, fieldY: field?.height ? field.top + field.height / 2 : fromY - 300 };
        drag.tilt.frame = requestAnimationFrame(tick);
      }
    }
    const tilt = drag.tilt;
    if (tilt) {
      // Velocidade suavizada, para a inclinação não tremer com o ponteiro.
      const now = performance.now(), dt = Math.max(8, now - tilt.at);
      tilt.vx = tilt.vx * .7 + (e.clientX - tilt.x) / dt * .3; tilt.vy = tilt.vy * .7 + (e.clientY - tilt.y) / dt * .3;
      tilt.x = e.clientX; tilt.y = e.clientY; tilt.at = now;
      // Sobre um campo, com a carta jogável: acende, mostrando que soltar ali conjura.
      tilt.ghost.classList.toggle('over-field', playable && !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.field'));
    }
    // O contorno do campo só aparece quando a carta pode ser jogada; sem isso, o arrasto só reorganiza a mão.
    root.querySelector('.arena')?.classList.toggle('dragging-hand', playable);
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`;
    const order = drag.order;
    if (order) preview(order, insideHand(order.bounds, e.clientX, e.clientY) ? handDropIndex(order.centers, order.from, e.clientX) : order.from);
  });
  /** A pose da carta a cada quadro: deita conforme chega ao campo e segue a velocidade; com o ponteiro parado, a inclinação de lado volta com mola. */
  function tick() {
    const tilt = drag?.tilt;
    if (!tilt) return;
    if (performance.now() - tilt.at > 40) { tilt.vx *= .82; tilt.vy *= .82; }
    const rise = (tilt.fromY - tilt.y) / Math.max(1, tilt.fromY - tilt.fieldY);
    const target = dragTilt(tilt.vx, tilt.vy, rise);
    tilt.rx += (target.rx - tilt.rx) * .25; tilt.ry += (target.ry - tilt.ry) * .25; tilt.scale += (target.scale - tilt.scale) * .25;
    tilt.face.style.transform = `perspective(700px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) scale(${tilt.scale.toFixed(3)})`;
    tilt.frame = requestAnimationFrame(tick);
  }
  root.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const { id, order } = drag;
    if (drag.ghost && order && insideHand(order.bounds, e.clientX, e.clientY)) {
      const to = handDropIndex(order.centers, order.from, e.clientX);
      cancel();
      if (to !== order.from) options.reorder(id, to);
      return;
    }
    const field = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.field');
    const action = drag.ghost ? handDropAction(options.state(), drag, e.clientX, e.clientY, field?.getBoundingClientRect() ?? null) : null;
    cancel();
    if (action) options.play(action);
  });
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', cancel);
  root.addEventListener('dragstart', e => { if ((e.target as HTMLElement).closest('#fHand, #fExileShelf')) e.preventDefault(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { e.preventDefault(); cancel(); } });
  root.addEventListener('click', e => { if (performance.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel, get active() { return !!drag?.ghost; } };
}

/*
 * Mão cheia (mais de 10 cartas): as cópias iguais viram uma pilha só, no lugar da primeira cópia. A ordem continua
 * sendo a do jogador; arrastar uma pilha leva todas as cópias juntas.
 */
export const HAND_GROUP_FROM = 11;

/** As pilhas da mão, na ordem do jogador: cada uma com os ids das cópias (a primeira é a que joga). */
export function groupHand(order: readonly number[], keyOf: (id: number) => string | null): number[][] {
  const groups: number[][] = [], byKey = new Map<string, number[]>();
  for (const id of order) {
    const key = keyOf(id);
    const group = key === null ? undefined : byKey.get(key);
    if (group) { group.push(id); continue; }
    const fresh = [id];
    groups.push(fresh);
    if (key !== null) byKey.set(key, fresh);
  }
  return groups;
}

/** Leva a pilha da carta `id` para a posição `to` (contada entre as pilhas, sem ela); null quando nada muda. */
export function moveGroupInHand(groups: readonly (readonly number[])[], id: number, to: number): number[] | null {
  const from = groups.findIndex(g => g.includes(id)), group = groups[from];
  if (!group) return null;
  const target = Math.max(0, Math.min(groups.length - 1, Math.round(to)));
  if (target === from) return null;
  const next = groups.filter((_, i) => i !== from);
  next.splice(target, 0, group);
  return next.flat();
}
