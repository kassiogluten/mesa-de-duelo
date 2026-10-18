import type { PresentationEvent } from './presentationTimeline';

const KEYED = '[data-fid],[data-peek]';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
interface Point { cx: number; cy: number; w: number; h: number }
interface Snap extends Point { el: HTMLElement; tapped: boolean; zone: string }
export interface Motion {
  capture(): void;
  play(options?: { silent?: boolean; semantic?: boolean }): void;
  present(event: PresentationEvent, options: { you: number; html?: string; label: string; duration: number; calloutDuration?: number; hideDestination?: boolean }): void;
  cancelPresentation(): void;
  reset(): void;
}
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function center(el: Element | null | undefined): Point | undefined {
  const r = el?.getBoundingClientRect();
  return r?.width ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height } : undefined;
}

/** Spatial presentation is separate from the board state and can never capture pointer input. */
export function createMotion(root: HTMLElement): Motion {
  let cards = new Map<string, Snap>();
  let primed = false;
  const effects = new Set<HTMLElement>();
  // Avisos de habilidade abertos, do mais antigo ao mais novo, com a carta de cada um.
  const callouts: { note: HTMLElement; card: HTMLElement }[] = [];
  const MAX_CALLOUTS = 3;
  const hiddenCards = new Set<HTMLElement>();
  const animations = new Set<Animation>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const layer = () => root.firstElementChild as HTMLElement ?? root;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
    timers.add(timer);
  };
  function animate(el: HTMLElement, frames: Keyframe[], duration: number) {
    if (reduced()) return;
    const animation = el.animate(frames, { duration, easing: EASE });
    animations.add(animation);
    animation.onfinish = animation.oncancel = () => animations.delete(animation);
  }
  function effect(className: string, point: Point, html?: string) {
    const el = document.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `left:${point.cx}px;top:${point.cy}px;width:${point.w}px;height:${point.h}px;--fw:${point.w}px`;
    if (html) el.innerHTML = html;
    layer().append(el); effects.add(el);
    return el;
  }
  function clear() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const el of effects) el.remove();
    effects.clear();
    callouts.length = 0;
    for (const el of hiddenCards) el.style.opacity = '';
    hiddenCards.clear();
    root.querySelectorAll('.damage-flash,.semantic-highlight,.attack-highlight').forEach(el => el.classList.remove('damage-flash', 'semantic-highlight', 'attack-highlight'));
  }
  function remove(el: HTMLElement) {
    el.remove(); effects.delete(el);
    const i = callouts.findIndex(c => c.note === el);
    if (i >= 0) callouts.splice(i, 1);
  }
  function pulse(el: HTMLElement | null, kind: boolean | 'attack-highlight' = false) {
    if (!el) return;
    const damage = kind === true;
    const cls = kind === 'attack-highlight' ? kind : damage ? 'damage-flash' : 'semantic-highlight';
    el.classList.add(cls);
    if (damage) animate(el, [{ translate: '0 0' }, { translate: '0 3px', offset: .25 }, { translate: '0 0' }], 260);
    later(() => el.classList.remove(cls), 850);
  }
  function playerDamage(event: PresentationEvent) {
    for (const id of event.targets?.players ?? []) {
      const avatar = root.querySelector<HTMLElement>(`.avatar[data-pid="${id}"]`);
      const at = center(avatar?.querySelector('.life'));
      if (!at) continue;
      pulse(avatar, true);
      const marker = effect('player-damage', { ...at, w: 90, h: 48 });
      marker.textContent = event.delta ? `−${Math.abs(event.delta)}` : 'Dano';
      if (!reduced()) animate(marker, [{ opacity: 1, translate: '0 0' }, { opacity: 1, translate: '0 -22px', offset: .7 }, { opacity: 0, translate: '0 -30px' }], 950);
      later(() => remove(marker), 1000);
    }
    for (const id of event.targets?.cards ?? []) pulse(root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`), true);
  }

  /**
   * Habilidade (gatilho ou ativada) não move a carta: com a fonte no campo, ela brilha e ganha um aviso ao lado;
   * fora do campo, a carta aparece parada no centro. Uma cópia voando parecia a criatura saindo do campo.
   */
  function ability(event: PresentationEvent, card: HTMLElement | null, options: { label: string; html?: string; duration: number; calloutDuration?: number }) {
    const rect = card?.getBoundingClientRect();
    if (card && rect?.width) {
      pulse(card);
      // Um aviso por carta, e poucos de uma vez: vários gatilhos seguidos não viram uma pilha de balões.
      for (const old of callouts.filter(c => c.card === card)) remove(old.note);
      while (callouts.length >= MAX_CALLOUTS) remove(callouts[0].note);
      const hold = Math.max(options.duration, options.calloutDuration ?? 0);
      const note = document.createElement('div');
      note.className = `ability-callout${event.trigger ? ' trigger' : ''}`;
      note.setAttribute('aria-hidden', 'true');
      // Raio para gatilho, engrenagem para habilidade ativada; o texto diz qual é.
      note.innerHTML = event.trigger
        ? '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5-.1-3 2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L15 2.5h-4l-.4 2.5A8 8 0 0 0 8 6.5l-2.4-1-2 3.4 2 1.6-.1 3-2 1.6 2 3.4 2.4-1A8 8 0 0 0 10.6 19l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';
      const text = document.createElement('span'); text.textContent = options.label;
      note.append(text);
      layer().append(note); effects.add(note); callouts.push({ note, card });
      // Ao lado da carta, do lado que tiver espaço; sem sair da tela.
      const width = note.offsetWidth, height = note.offsetHeight;
      const right = rect.right + 10 + width <= innerWidth - 8;
      note.style.left = `${right ? rect.right + 10 : Math.max(8, rect.left - 10 - width)}px`;
      note.style.top = `${Math.min(innerHeight - height - 8, Math.max(8, rect.top + rect.height / 2 - height / 2))}px`;
      note.classList.add(right ? 'right' : 'left');
      if (!reduced()) animate(note, [{ opacity: 0, translate: right ? '-6px 0' : '6px 0' }, { opacity: 1, translate: '0 0', offset: .18 }, { opacity: 1, offset: .82 }, { opacity: 0 }], hold);
      later(() => remove(note), hold);
      return;
    }
    if (!options.html) return;
    const bounds = layer().getBoundingClientRect();
    const stage: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: Math.min(112, bounds.height * .17), h: Math.min(156, bounds.height * .237) };
    const piece = effect('presentation-piece', stage, options.html);
    const caption = document.createElement('span');
    caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
    if (!reduced()) animate(piece, [{ opacity: 0, scale: '.96' }, { opacity: 1, scale: '1', offset: .2 }, { opacity: 1, offset: .82 }, { opacity: 0 }], options.duration);
    later(() => remove(piece), options.duration);
  }

  return {
    capture() {
      cards = new Map();
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const key = el.dataset.fid ?? el.dataset.peek!;
        if (cards.has(key)) return;
        const at = center(el);
        if (at) cards.set(key, { ...at, el, tapped: !!el.closest('.tapped'), zone: el.parentElement?.closest('[id]')?.id ?? '' });
      });
    },
    play(options = {}) {
      if (options.silent || reduced()) { primed = true; return; }
      const seen = new Set<string>();
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const key = el.dataset.fid ?? el.dataset.peek!;
        if (seen.has(key)) return;
        seen.add(key);
        const at = center(el), before = cards.get(key);
        if (!at) return;
        if (before) {
          const zone = el.parentElement?.closest('[id]')?.id ?? '';
          if (options.semantic && zone !== before.zone) return;
          const dx = before.cx - at.cx, dy = before.cy - at.cy;
          const turned = before.tapped !== !!el.closest('.tapped');
          if (Math.abs(dx) + Math.abs(dy) < 2 && !turned) return;
          const slot = el.closest<HTMLElement>('.slot') ?? el;
          const from: Keyframe = { translate: `${dx}px ${dy}px` };
          const to: Keyframe = { translate: '0 0' };
          if (turned && slot !== el) { from.rotate = before.tapped ? '90deg' : '-90deg'; to.rotate = '0deg'; }
          animate(slot, [from, to], 240);
        } else if (primed && !options.semantic) {
          animate(el.closest<HTMLElement>('.slot') ?? el, [{ opacity: 0, scale: '.92' }, { opacity: 1, scale: '1' }], 220);
        }
      });
      primed = true;
    },
    present(event, options) {
      // Nothing here mutates card state, waits on a network reply, or creates a priority stop.
      if (document.hidden || root.hidden) return;
      if (event.type === 'damage') { playerDamage(event); return; }
      if (event.type === 'life-changed') return; // Paying life is not taking damage.
      if (event.type === 'attackers') {
        // Ataque é só vermelho: o dourado fica para seleção e bloqueio.
        root.querySelectorAll<HTMLElement>('.slot.attacking > .bfc').forEach(el => pulse(el, 'attack-highlight'));
        const banner = effect('combat-banner', { cx: 0, cy: 0, w: 0, h: 0 });
        banner.removeAttribute('style');
        banner.textContent = options.label;
        if (!reduced()) animate(banner, [{ opacity: 0, scale: '.96' }, { opacity: 1, scale: '1', offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], options.duration);
        later(() => remove(banner), options.duration);
        return;
      }
      if (event.type === 'blockers') {
        root.querySelectorAll<HTMLElement>('.slot.blocking > .bfc').forEach(el => pulse(el));
        return;
      }
      if (event.type === 'turn' || !options.html) return;
      const id = event.card?.id ?? event.sourceId;
      const card = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
      if (event.type === 'ability-activated') { ability(event, card, options); return; }
      const old = id === undefined ? undefined : cards.get(String(id));
      const bounds = layer().getBoundingClientRect();
      const stage: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: Math.min(112, bounds.height * .17), h: Math.min(156, bounds.height * .237) };
      const mine = event.actor === options.you;
      const seat = !mine && event.actor !== undefined ? root.querySelector(`[data-seat-player="${event.actor}"]`) : null;
      const hand = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? center(root.querySelector(mine ? '#fMeAvatar' : '#fOppAvatar')) ?? stage;
      const target = center(card);
      let from: Point = old ?? hand, to: Point = stage;
      if (event.type === 'land-played' || event.type === 'entered') {
        from = event.from === 'Stack' ? stage : hand;
        to = target ?? center(seat?.querySelector('.lands')) ?? center(root.querySelector(mine ? '#fMeLands' : '#fOppLands')) ?? stage;
      } else if (event.type === 'resolved') {
        from = stage;
        const targetId = event.targets?.players?.[0];
        const targetCard = event.targets?.cards?.[0];
        to = target ?? center(targetId !== undefined ? root.querySelector(`.avatar[data-pid="${targetId}"]`) : targetCard !== undefined ? root.querySelector(`.field [data-fid="${targetCard}"]`) : null) ?? stage;
      } else if (event.type === 'left' || event.type === 'countered') {
        from = event.type === 'countered' ? stage : old ?? target ?? stage;
        to = center(seat?.querySelector('.piles .gy')) ?? center(root.querySelector(mine ? '#fMePiles .gy' : '#fOppPiles .gy')) ?? stage;
      }
      // Keep large cards readable while travelling, independent of a tiny hand or pile's dimensions.
      const end = { ...to, w: stage.w, h: stage.h };
      const piece = effect('presentation-piece', end, options.html);
      const caption = document.createElement('span');
      caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
      const disappearing = ['left', 'countered', 'resolved'].includes(event.type);
      if (!reduced()) animate(piece, [
        { translate: `${from.cx - to.cx}px ${from.cy - to.cy}px`, scale: '.92', opacity: .8 },
        { translate: '0 -8px', scale: '1.02', opacity: 1, offset: .58 },
        { translate: '0 0', scale: '1', opacity: disappearing ? .1 : 1 },
      ], options.duration);
      if (target && card) {
        pulse(card);
        if (options.hideDestination && !reduced() && ['land-played', 'entered'].includes(event.type)) { card.style.opacity = '0'; hiddenCards.add(card); }
      }
      later(() => {
        remove(piece);
        if (card && hiddenCards.delete(card)) card.style.opacity = '';
      }, options.duration);
    },
    cancelPresentation: clear,
    reset() { clear(); cards = new Map(); primed = false; },
  };
}
