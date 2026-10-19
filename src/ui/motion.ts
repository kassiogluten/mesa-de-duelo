import type { PresentationEvent } from './presentationTimeline';
import { damageLook, type DamageLook } from './damageEffects';

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
  /** `easing: 'linear'` deixa cada quadro com o seu próprio ritmo (golpe e projétil precisam chegar na hora do impacto). */
  function animate(el: HTMLElement, frames: Keyframe[], duration: number, easing = EASE, delay = 0) {
    if (reduced()) return;
    const animation = el.animate(frames, { duration, easing, delay, fill: delay ? 'backwards' : 'auto' });
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
    root.querySelectorAll('.damage-flash,.semantic-highlight,.attack-highlight,.lethal-hit,.heal-flash').forEach(el => el.classList.remove('damage-flash', 'semantic-highlight', 'attack-highlight', 'lethal-hit', 'heal-flash'));
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
  const SKULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.6V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.4c1.8-1.2 3-3 3-5.6a8 8 0 0 0-8-8zm-3.5 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>';
  function damageTarget(event: PresentationEvent) {
    const player = event.targets?.players?.[0];
    if (player !== undefined) {
      const el = root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"]`);
      return { el, at: center(el?.querySelector('.life') ?? el), player };
    }
    const card = event.targets?.cards?.[0];
    const el = card === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${card}"]`);
    return { el, at: center(el), player: undefined };
  }
  /** De onde sai o golpe: a carta no campo, a pilha (mágica resolvendo) ou o centro da mesa. */
  function damageSource(event: PresentationEvent) {
    const id = event.sourceId ?? event.card?.id;
    const el = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
    const at = center(el);
    if (el && at) return { el, at };
    const bounds = layer().getBoundingClientRect();
    return { el: null, at: center(root.querySelector('#fStack .stack-pile')) ?? { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: 0, h: 0 } };
  }
  function floatNumber(at: Point, text: string, classes: string, badges: string[] = [], icon = '') {
    // Perto da borda de cima (retrato do oponente), o número desce em vez de subir para fora da tela.
    const below = at.cy - at.h / 2 < 90;
    const marker = effect(`damage-number ${classes}${below ? ' below' : ''}`, { ...at, cy: below ? at.cy + at.h / 2 + 6 : at.cy - at.h / 2, w: 120, h: 56 }, icon);
    const value = document.createElement('b'); value.textContent = text; marker.append(value);
    if (badges.length) {
      const list = document.createElement('span'); list.className = 'damage-badges'; marker.append(list);
      for (const badge of badges) { const tag = document.createElement('span'); tag.textContent = badge; list.append(tag); }
    }
    const rise = below ? 1 : -1;
    animate(marker, [{ opacity: 0, translate: `0 ${-6 * rise}px`, scale: '.7' }, { opacity: 1, translate: `0 ${6 * rise}px`, scale: '1.12', offset: .16 }, { opacity: 1, translate: `0 ${18 * rise}px`, scale: '1', offset: .7 }, { opacity: 0, translate: `0 ${30 * rise}px` }], 1100);
    later(() => remove(marker), 1150);
  }
  function impact(event: PresentationEvent, look: DamageLook, target: ReturnType<typeof damageTarget>) {
    const at = target.at!;
    pulse(target.el, look.tone !== 'shield');
    const size = Math.max(64, Math.min(150, (target.player === undefined ? at.w : 90) * (look.heavy ? 1.5 : 1.15)));
    const burst = effect(`damage-impact ${look.tone}${look.heavy ? ' heavy' : ''}`, { ...at, w: size, h: size });
    animate(burst, [{ opacity: .95, scale: '.3' }, { opacity: .8, scale: '1', offset: .45 }, { opacity: 0, scale: '1.35' }], 520);
    later(() => remove(burst), 560);
    floatNumber(at, look.amount, `${look.tone}${look.heavy ? ' heavy' : ''}${look.lethal ? ' lethal' : ''}`, look.badges, look.deathtouch ? SKULL : '');
    const card = target.player === undefined ? target.el : null;
    if (look.lethal && card) {
      // Golpe letal: a carta treme e escurece; a ida para o cemitério vem no evento seguinte.
      card.classList.add('lethal-hit');
      animate(card, [{ translate: '0 0' }, { translate: '-4px 0', offset: .2 }, { translate: '4px 0', offset: .4 }, { translate: '-3px 0', offset: .6 }, { translate: '0 0' }], 380);
      later(() => card.classList.remove('lethal-hit'), 1100);
    }
    if (event.commander && target.player !== undefined) pulse(root.querySelector<HTMLElement>(`[data-zone="damage"][data-gy="${target.player}"]`));
    const arena = look.heavy ? root.querySelector<HTMLElement>('.arena') : null;
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: '-5px 2px', offset: .2 }, { translate: '4px -2px', offset: .45 }, { translate: '-2px 1px', offset: .7 }, { translate: '0 0' }], 320);
  }
  /**
   * Dano: golpe do atacante até o alvo (combate), projétil com rastro da fonte até o alvo (mágica ou habilidade) ou
   * dor no próprio retrato. Com "reduzir movimento", só o número e o destaque no alvo.
   */
  function damage(event: PresentationEvent, duration: number, html?: string) {
    const target = damageTarget(event);
    if (!target.at) return;
    const look = damageLook(event);
    const source = damageSource(event);
    const from = source.at, to = target.at;
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    if (reduced() || look.motion === 'self' || Math.hypot(dx, dy) < 8) { impact(event, look, target); return; }
    if (look.motion === 'strike' && source.el && html) {
      // O atacante avança quase até o alvo e volta; o impacto acontece no ponto mais à frente. Uma cópia faz o
      // trajeto porque as fileiras do campo cortam o que sai delas; a carta de verdade some enquanto isso.
      const tapped = !!source.el.closest('.tapped');
      const ghost = effect('presentation-piece strike-ghost', { ...from, w: tapped ? from.h : from.w, h: tapped ? from.w : from.h }, html);
      const turn = tapped ? '90deg' : '0deg';
      const reach = Math.max(0, 1 - (Math.min(to.w, to.h) * .55 + Math.min(from.w, from.h) * .4) / Math.hypot(dx, dy));
      const travel = Math.round(duration * .9);
      source.el.style.opacity = '0'; hiddenCards.add(source.el);
      animate(ghost, [
        { translate: '0 0', scale: '1', rotate: turn, easing: 'ease-out' },
        { translate: `${-dx * .06}px ${-dy * .06}px`, scale: '1.05', rotate: turn, offset: .18, easing: 'cubic-bezier(.55, 0, .9, .45)' },
        { translate: `${dx * reach}px ${dy * reach}px`, scale: '1.08', rotate: turn, offset: .45, easing: 'cubic-bezier(.2, .8, .2, 1)' },
        { translate: '0 0', scale: '1', rotate: turn }], travel, 'linear');
      later(() => impact(event, look, target), travel * .45);
      later(() => { remove(ghost); if (source.el && hiddenCards.delete(source.el)) source.el.style.opacity = ''; }, travel);
      return;
    }
    const travel = Math.round(duration * .55);
    const bolt = effect(`damage-bolt ${look.tone}`, { ...from, w: 22, h: 22 });
    bolt.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
    animate(bolt, [{ translate: '0 0', scale: '.6', opacity: .6 }, { translate: `${dx * .4}px ${dy * .4}px`, scale: '1.1', opacity: 1, offset: .5 }, { translate: `${dx}px ${dy}px`, scale: '1', opacity: 1 }], travel, 'cubic-bezier(.45, 0, .85, .55)');
    if (source.el) pulse(source.el);
    later(() => { remove(bolt); impact(event, look, target); }, travel);
  }
  /** Ganho de vida (vínculo com a vida ou qualquer outro): "+N" verde subindo do retrato. */
  function heal(event: PresentationEvent) {
    const avatar = event.actor === undefined ? null : root.querySelector<HTMLElement>(`.avatar[data-pid="${event.actor}"]`);
    const at = center(avatar?.querySelector('.life') ?? avatar);
    if (!avatar || !at || !event.delta || event.delta <= 0) return;
    avatar.classList.add('heal-flash');
    later(() => avatar.classList.remove('heal-flash'), 850);
    floatNumber(at, `+${event.delta}`, 'heal');
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
      beams(event, card);
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

  /** Feixe da carta de origem até cada alvo do gatilho ou da habilidade; com "reduzir movimento", só o destaque no alvo. */
  function beams(event: PresentationEvent, card: HTMLElement) {
    const from = center(card);
    if (!from) return;
    const targets = [...(event.targets?.cards ?? []).map(id => root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`)),
      ...(event.targets?.players ?? []).map(id => root.querySelector<HTMLElement>(`.avatar[data-pid="${id}"]`))].filter((el): el is HTMLElement => !!el && el !== card);
    targets.forEach((el, i) => {
      const to = center(el);
      if (!to) return;
      const dx = to.cx - from.cx, dy = to.cy - from.cy, length = Math.hypot(dx, dy);
      later(() => pulse(el), 260 + i * 60);
      if (reduced() || length < 8) return;
      const beam = effect(`ability-beam${event.trigger ? ' trigger' : ''}`, { cx: from.cx, cy: from.cy, w: length, h: 4 });
      beam.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
      animate(beam, [{ scale: '0 1', opacity: .9 }, { scale: '1 1', opacity: 1, offset: .45 }, { scale: '1 1', opacity: 0 }], 700, 'ease-out', i * 60);
      later(() => remove(beam), 760 + i * 60);
    });
  }
  /** Para onde a carta vai ao sair do campo: cemitério, exílio, grimório ou mão. */
  function destination(event: PresentationEvent, mine: boolean, seat: Element | null, hand: Point, stage: Point) {
    const piles = (selector: string) => center(seat?.querySelector(`.piles ${selector}`)) ?? center(root.querySelector(`${mine ? '#fMePiles' : '#fOppPiles'} ${selector}`));
    if (event.to === 'Hand') return hand;
    if (event.to === 'Exile') return piles('.exile') ?? piles('.gy') ?? stage;
    if (event.to === 'Library') return piles('.lib') ?? stage;
    return piles('.gy') ?? stage;
  }
  /** Destruída: a carta racha e solta fragmentos no lugar em que estava. */
  function shatter(at: Point) {
    const crack = effect('shatter-flash', { ...at, w: at.w * 1.1, h: at.h * 1.1 });
    animate(crack, [{ opacity: .9, scale: '.9' }, { opacity: 0, scale: '1.2' }], 360);
    later(() => remove(crack), 380);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + (i % 2 ? .3 : -.2), reach = 34 + (i * 17) % 30;
      const shard = effect('shatter-shard', { cx: at.cx + Math.cos(angle) * at.w * .18, cy: at.cy + Math.sin(angle) * at.h * .18, w: 8 + (i * 5) % 9, h: 10 + (i * 7) % 12 });
      animate(shard, [{ translate: '0 0', rotate: '0deg', opacity: 1 }, { translate: `${Math.cos(angle) * reach}px ${Math.sin(angle) * reach + 26}px`, rotate: `${(i % 2 ? 1 : -1) * (90 + i * 20)}deg`, opacity: 0 }], 520, 'cubic-bezier(.2,.6,.4,1)');
      later(() => remove(shard), 540);
    }
  }
  /**
   * Saída do campo com um movimento por motivo: destruída racha antes de cair no cemitério, sacrificada afunda,
   * exilada se desfaz em luz, devolvida sobe e voa para a mão. Morrer por dano e o resto voam para a pilha certa.
   */
  function leave(event: PresentationEvent, from: Point, to: Point, end: Point, piece: HTMLElement, duration: number) {
    const go = { translate: `${from.cx - to.cx}px ${from.cy - to.cy}px` };
    if (event.reason === 'destroyed') {
      shatter(from);
      animate(piece, [{ ...go, scale: '1', opacity: 1, filter: 'brightness(1.4)' }, { ...go, scale: '.96', opacity: .85, filter: 'brightness(.7) grayscale(.6)', offset: .3 }, { translate: '0 0', scale: '.85', opacity: .1, filter: 'brightness(.7) grayscale(.6)' }], duration, 'linear');
    } else if (event.reason === 'sacrificed') {
      animate(piece, [{ ...go, scale: '1', opacity: 1, filter: 'none' }, { translate: `${from.cx - to.cx}px ${from.cy - to.cy + 16}px`, scale: '.86', opacity: .75, filter: 'brightness(.55) sepia(.4)', offset: .38 }, { translate: '0 0', scale: '.8', opacity: .1, filter: 'brightness(.55) sepia(.4)' }], duration, 'ease-in');
    } else if (event.to === 'Exile') {
      // Some no lugar, em luz; não precisa atravessar a mesa até a pilha do exílio.
      piece.style.left = `${from.cx}px`; piece.style.top = `${from.cy}px`;
      const ring = effect('exile-ring', { ...from, w: end.w * 1.3, h: end.w * 1.3 });
      animate(ring, [{ opacity: 0, scale: '.5' }, { opacity: .9, scale: '1', offset: .4 }, { opacity: 0, scale: '1.3' }], duration);
      later(() => remove(ring), duration);
      animate(piece, [{ opacity: 1, scale: '1', filter: 'brightness(1)' }, { opacity: .9, scale: '1.04', filter: 'brightness(2.2) saturate(.3)', offset: .45 }, { opacity: 0, scale: '1.1', filter: 'brightness(3) blur(3px)' }], duration);
    } else if (event.to === 'Hand') {
      animate(piece, [{ ...go, scale: '1', opacity: 1 }, { translate: `${from.cx - to.cx}px ${from.cy - to.cy - 26}px`, scale: '1.08', opacity: 1, offset: .3 }, { translate: '0 0', scale: '.6', opacity: .2 }], duration, 'ease-in-out');
    } else {
      animate(piece, [{ ...go, scale: '.92', opacity: .8 }, { translate: '0 -8px', scale: '1.02', opacity: 1, offset: .58 }, { translate: '0 0', scale: '1', opacity: .1 }], duration);
    }
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
      let untapWave = 0;
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
          if (turned && slot !== el) {
            // Virar tem peso: passa um pouco do ponto e assenta. Desvirar em lote vai em onda, uma carta depois da outra.
            const untapping = before.tapped;
            const lean = untapping ? '-6deg' : '6deg';
            animate(slot, [{ translate: `${dx}px ${dy}px`, rotate: untapping ? '90deg' : '-90deg' }, { translate: '0 0', rotate: lean, offset: .72 }, { translate: '0 0', rotate: '0deg' }],
              300, 'cubic-bezier(.3,.7,.4,1)', untapping ? Math.min(untapWave++, 12) * 45 : 0);
          } else {
            animate(slot, [{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], 240);
          }
        } else if (primed && !options.semantic) {
          animate(el.closest<HTMLElement>('.slot') ?? el, [{ opacity: 0, scale: '.92' }, { opacity: 1, scale: '1' }], 220);
        }
      });
      primed = true;
    },
    present(event, options) {
      // Nothing here mutates card state, waits on a network reply, or creates a priority stop.
      if (document.hidden || root.hidden) return;
      if (event.type === 'damage') { damage(event, options.duration, options.html); return; }
      // Perder vida já aparece no dano (e pagar vida não é dano); só o ganho tem número próprio.
      if (event.type === 'life-changed') { heal(event); return; }
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
      } else if (event.type === 'left') {
        from = old ?? target ?? stage;
        to = destination(event, mine, seat, hand, stage);
      } else if (event.type === 'countered') {
        from = stage;
        to = destination({ ...event, to: 'Graveyard' }, mine, seat, hand, stage);
      }
      if (event.type === 'entered' && event.from === 'Exile') from = to; // Blink: volta no mesmo lugar, em luz.
      // Keep large cards readable while travelling, independent of a tiny hand or pile's dimensions.
      const end = { ...to, w: stage.w, h: stage.h };
      const piece = effect('presentation-piece', end, options.html);
      const caption = document.createElement('span');
      caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
      const disappearing = ['left', 'countered', 'resolved'].includes(event.type);
      if (event.type === 'left') leave(event, from, to, end, piece, options.duration);
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
