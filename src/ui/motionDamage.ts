// Animações de dano e ganho de vida: golpe ou projétil, número que sobe e retrato que acende.
import type { PresentationEvent } from './presentationTimeline';
import { damageLook, type DamageLook } from './damageEffects';
import { center, reduced, type MotionKit } from './motionKit';

const SKULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.6V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.4c1.8-1.2 3-3 3-5.6a8 8 0 0 0-8-8zm-3.5 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>';

/** Dano e ganho de vida: o golpe ou o projétil até o alvo, o número que sobe e o retrato que acende. */
export function createDamageMotion(kit: MotionKit) {
  const { root, layer, later, animate, effect, remove, pulse, floatNumber, hiddenCards, recentStack } = kit;
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
    return { el: null, at: center(root.querySelector('#fStack .stack-pile')) ?? recentStack() ?? { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: 0, h: 0 } };
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
    else if (event.combat && (event.delta ?? 0) > 0 && target.el && !reduced()) {
      // Golpe de combate: um tremor curto no alvo, mais forte quanto maior o dano.
      const a = Math.min(6, 1.5 + (event.delta ?? 0) * .6);
      animate(target.el, [{ translate: '0 0' }, { translate: `${-a}px 0`, offset: .25 }, { translate: `${(a * .6).toFixed(1)}px 0`, offset: .55 }, { translate: '0 0' }], 260);
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
      // Luta (e atacante contra bloqueador que revida): as duas avançam juntas e se chocam no meio, em vez de chegar até o alvo.
      // O atacante avança quase até o alvo e volta; o impacto acontece no ponto mais à frente. Uma cópia faz o
      // trajeto porque as fileiras do campo cortam o que sai delas; a carta de verdade some enquanto isso.
      const tapped = !!source.el.closest('.tapped');
      const ghost = effect('presentation-piece strike-ghost', { ...from, w: tapped ? from.h : from.w, h: tapped ? from.w : from.h }, html);
      const turn = tapped ? '90deg' : '0deg';
      const reach = event.fight || event.clash ? .42 : Math.max(0, 1 - (Math.min(to.w, to.h) * .55 + Math.min(from.w, from.h) * .4) / Math.hypot(dx, dy));
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
  return { damage, heal };
}
